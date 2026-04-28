# ADR-0006: Asana Progress Sync on Free Plan (taskRun ↔ Asana 多対多バインディング)

- Status: Accepted
- Date: 2026-04-29
- Owners: pm-orchestrator-runner team (uehara@eln.ne.jp)
- Related ADRs:
  - eln-claude-plugins ADR-0001 (plugin grouping)
  - eln-claude-plugins ADR-0004 (command → skill 統一)
- Supersedes: (なし) — task-tracker-sync v0.1.0 の抽象設計を具体化する追加 ADR

## Context

`pm-orchestrator-runner` (本リポジトリ) と `eln-pm-orchestrator` plugin は Asana を「タスク管理ツール」として MCP 経由で統合する。当初の `task-tracker-sync` skill (v0.1.0) は ClickUp/Asana 共通の抽象 API シグネチャ (create_task / add_comment / update_status) のみを定義しており、以下が未決だった:

1. **Status 管理の実体**: v0.1.0 は `update_status` を抽象 API として定義するが、Asana Free プランでは Status カスタムフィールドが利用不可 (ADR `eln-asana-setup` v0.1.1 で確認済み)。section 移動で代替する規約はあるが、コードレベルの実装規約が無い。
2. **既存タスクとの紐付け**: `asana-task-map.md` の Tasks 表 (Plugin Migration Epic + 22 inventory tasks = 35 件) は **既に手動で起票済み**。今後 PM Orchestrator が新タスクを開始したとき、(a) 新規 Asana タスクを作るのか (b) 既存タスクに紐付けて story comment を追加するのか の判定ロジックが未定。
3. **session 横断の継続性**: ユーザーが「B-016 の続きやって」と新セッションで指示した場合、Asana タスクの notes / story を読んで前回どこまで進んだかを復元する手順が無い。実体験上、Claude セッションは 1 タスクで複数 session に渡ることが日常的。
4. **多対多バインディング**: 1 つの taskRun が複数の Asana タスクに関連する場合 (例: 「Adapter Impl と Validator Impl を一気にやる」) や、1 つの Asana タスクに複数 taskRun が紐付く場合 (例: B-016 が 3 セッションに分割) を session JSON でどう表現するかが未定。

これらは **「完了とは何か」** に直結する。task-tracker-sync v0.1.0 の抽象 API のままだと、PM Orchestrator が「task 完了」と報告した時点で Asana 上は何も動かず (notes 更新も section 移動も無し)、`asana-task-map.md` を毎回手動で touch しないと整合性が取れない。

加えて 2026-04-29 のセッションで **22 件の棚卸しタスクが Asana に登録済み** となり、今後は PM Orchestrator がこれらと連動しなければ「Asana が真実の source of truth」と言えなくなる (登録だけして放置)。

## Decision

**task-tracker-sync skill を v0.2.0 にアップデートし、以下の Asana 専用バインディングと lifecycle policy を導入する。Free プランフォールバック規約 (eln-asana-setup v0.1.1) と完全互換とする。**

### 1. Binding key

session JSON (`.claude/sessions/<sessionId>.json`) の `runs[].meta` に下記フィールドを追加する:

```jsonc
{
  "runs": [{
    "taskRunId": "2026-04-29-001",
    "meta": {
      "asanaBindings": [
        {
          "gid": "1214356816544961",
          "url": "https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214356816544961",
          "title": "[Bug] B-016: タスク分解時の注入テキストフィルタリング",
          "homePhase": "Phase A: 即時対応",
          "homeSectionGid": "1214338125692623",
          "boundAt": "2026-04-29T11:30:00Z",
          "boundBy": "session-manager.bootstrap"   // または "task-tracker-sync.adopt" / "task-tracker-sync.create"
        }
      ]
    }
  }]
}
```

- 配列 (`asanaBindings: []`) なので **1 taskRun ↔ N Asana タスク** を表現可能。
- 逆方向 (1 Asana ↔ N taskRun) は **Asana 側 story comment** に `taskRunId: 2026-04-29-001` を必ず含めることで履歴復元可能とする (Asana 側 1st-class 表現は Free プランでは作れないため、story の検索可能性に依存)。

### 2. Lifecycle policy

| イベント | task-tracker-sync の動作 | section 操作 | story 操作 | notes 操作 |
|---------|-------------------------|--------------|-----------|------------|
| **adopt (既存 Asana タスクを taskRun に紐付け)** | binding を追加するだけ | なし (現在の Phase X を尊重) | "🟡 taskRun 開始: <taskRunId>" を投稿 | 触らない |
| **create (新規 Asana タスクを起票)** | binding を追加 + Asana に新規タスクを起票 | 適切な Phase X セクションに配置 | "🟡 taskRun 作成: <taskRunId>" を投稿 | `Spec: ` prefix が無い場合のみ追加 |
| **progress (重要ステップ完了時)** | story 投稿のみ | なし | "🔵 ステップ完了: <内容>" を投稿 (要約のみ。raw output 禁止) | 触らない |
| **complete (taskRun 完了)** | binding を `closedAt` で閉じる | **Phase X → Done に移動** | "🟢 完了: <最終レポート要約>" + commit/PR リンクを投稿 | `PR: <url>` suffix を追加 (まだ無ければ) |
| **abandon (taskRun が Failed/Abandoned)** | binding を `closedAt` で閉じる | **section 移動なし (Phase X 据え置き)** | "🔴 中断: <理由>" を投稿 | 触らない |
| **resume (新セッションで既存 Asana タスクの続き開始)** | binding を `boundBy: bootstrap` で再追加 | なし | "🔄 taskRun 再開: <新 taskRunId> (前回 <前 taskRunId>)" を投稿 | 触らない |

### 3. Existing-task lookup (adopt vs create の判定)

新タスク開始時、以下の順で **adopt 候補** を探索する。マッチすれば `adopt`、無ければ `create`:

1. **明示参照**: ユーザー入力に `asana://gid` または `gid: NNN` または Asana URL が含まれる → そのタスクを adopt
2. **タスクIDマッチ**: ユーザー入力が `B-016` / `DEF-001` / `ADR-0003` 等の **`asana-task-map.md` に登録されたID** を含む → 該当タスクを adopt
3. **タイトル類似**: 入力タイトル候補と既存 Asana タスクの title を Levenshtein 距離で比較し、距離 ≤ 5 かつ最短マッチが 1 件 → 該当タスクを adopt
4. それ以外 → 新規 `create`

3 の判定で **複数候補がヒット** したら、user に確認する (プロンプト保留)。実装は v0.2.0 では 3 を **off** にして、1 と 2 のみで運用開始 (false positive を避けるため)。

### 4. Free プランフォールバック互換

| eln-asana-setup v0.1.1 規約 | task-tracker-sync v0.2.0 の対応 |
|-----------------------------|----------------------------------|
| Type → タスク名 prefix | `create` 時に `[Spec]/[Impl]/[Bug]/...` を name 先頭に付与 (TaskType より導出) |
| Priority → workspace tag | `create` 時に PM Orchestrator の `requirementAnalysis.priority` を P0/P1/P2/P3 tag に変換して付与 |
| Phase → section | `create` 時に `requirementAnalysis.phase` (A-F) を section gid に解決し配置 |
| Spec Ref → notes prefix `Spec:` | `create` 時に PM Orchestrator が把握している ADR/SDD ID を `Spec:` 行として notes 冒頭に追加 |
| PR Link → notes suffix `PR:` | `complete` 時に PR URL を notes 末尾に追加 |
| Status → section 移動 | 上記 lifecycle table の通り |

PM Orchestrator から TaskType / Phase / Priority / Spec Ref / PR URL を受け取れなかった場合は **省略** (force しない)。`asana-task-map.md` は人間が curate する source-of-truth として残し、自動生成タスクで mismatch が起きたら human review に委ねる。

### 5. Bootstrap (session 開始時の Asana 同期)

session-manager skill に `asana-bootstrap` フェーズを追加 (別途 spec 化: `[Spec] session-manager: Asana bootstrap 設計` Asana gid `1214356975323412`)。要点だけ ADR-0006 にも記載:

- 新セッション開始時、`.claude/sessions/<sessionId>.json` が存在しない場合のみ Asana の `My Tasks` を query (status: in_progress) して **直近の running task** を表示し、user に「続きをやりますか?」を確認
- ユーザーが「B-016 の続き」と指定したら、`asana-task-map.md` から `B-016` で grep → gid 解決 → notes & 直近 N=10 stories を取得 → PM Orchestrator のコンテキストに注入

## Alternatives Considered

### Option A: Asana を諦め Slack/Discord 通知のみにする

- Pros: Free プラン制約をすべて回避、実装が単純
- Cons: タスクの **状態管理** (どこまで進んだか、何が残っているか) が話し言葉ベースになり、棚卸しが破綻する。`asana-task-map.md` で既に Asana 前提の運用が始まっており、今さら戻せない

### Option B: ClickUp に移行 (Free プランでもカスタムフィールド利用可)

- Pros: Status / Priority / Phase をネイティブカスタムフィールドで表現可能
- Cons: 既に Asana に 35 タスクを起票済み、再移行コストが大きい。task-tracker-sync v0.1.0 の抽象 API は「ClickUp / Asana 両対応」を謳うが、現実には ClickUp MCP も同等の制約 (storage tier 別の制限) を持ち、根本解決にならない

### Option C: Asana Starter プランにアップグレード

- Pros: カスタムフィールド (Type/Priority/Phase/Spec Ref/PR Link/Status) がそのまま使える、運用が綺麗
- Cons: 月額発生 (現状 personal 利用、coster は uehara 個人)。本 ADR の対象範囲外 (財務判断)。アップグレードしても本 ADR で定義した skill 実装は流用可能 (フォールバック層を bypass するだけ)

### Option D: 手動運用継続 (PM Orchestrator は Asana を touch しない)

- Pros: 自動化バグの混入リスクなし
- Cons: ユーザーが毎回手動で section 移動 / story 投稿 / notes 更新する必要がある。それが目視確認できないと整合性が取れない。「Asana を真実の source of truth」と言いながら自動化しないのは矛盾

### Option E: Asana を touch するが lifecycle policy を簡略化 (story comment のみ、section 移動なし)

- Pros: 実装が単純 (`asana_create_task_story` だけで済む)
- Cons: section 移動が無いと「完了タスク」が Phase X に滞留し、棚卸し時に毎回 user が手動で Done に移すことになる。eln-asana-setup の Status フォールバック規約に違反

→ Option C は将来の選択肢として残しつつ、現時点は本 ADR の Decision (Free プランで完全自動化) を採択する。

## Consequences

### 良い影響

- PM Orchestrator が Asana に状態を反映する → セッション横断で「どこまで進んだか」が Asana 1 ヶ所で見える
- 既存タスク (B-016 など) を adopt する仕組みにより、棚卸しタスクと実作業が断絶しない
- Free プランでも eln-asana-setup v0.1.1 のフォールバック規約と完全互換
- `asana-task-map.md` を curated index として保持しつつ、自動生成タスクとも共存できる
- session JSON に `asanaBindings` を持たせることで多対多関係を明示でき、「続き」依頼の解決が決定論的になる

### 悪い影響

- task-tracker-sync skill の実装複雑度が v0.1.0 (~280 行) → v0.2.0 (推定 ~600 行) に上昇
- Asana MCP の rate limit に依存 (Asana API は 150 req/min / token、超過時は task-tracker-sync 側で **指数バックオフリトライ** を入れる)
- existing-task lookup の Levenshtein 判定 (Decision 3-3) は誤マッチリスクがあるため v0.2.0 では off にする → false negative (本当は adopt すべきタスクを create してしまう) が発生する可能性あり。手動でマージする運用 (Asana Web UI で重複タスクを delete + asana-task-map.md で吸収先 gid に書き換え) を許容する

### 今後の対応

- **Phase B-Asana-1**: task-tracker-sync v0.2.0 spec 完成 (本 ADR + `41_ASANA_PROGRESS_HOOK.md`)
- **Phase B-Asana-2**: session-manager Asana bootstrap spec 完成 (Asana gid `1214356975323412`)
- **Phase C-Asana-1**: task-tracker-sync v0.2.0 実装 (RED → GREEN テスト先行)
- **Phase C-Asana-2**: session-manager bootstrap 実装
- **Phase D-Asana-1**: Levenshtein 類似度判定 (Decision 3-3) を実証実験 + 有効化判定

将来 Starter プランにアップグレードした場合は、本 ADR の lifecycle policy を維持したまま Free プランフォールバック層 (Section 4) を **削除して native custom fields 経由に置き換える** という移行が可能。section 移動と story comment は Starter でも有効。
