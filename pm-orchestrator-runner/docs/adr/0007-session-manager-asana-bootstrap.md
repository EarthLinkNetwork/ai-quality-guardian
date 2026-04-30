# ADR-0007: session-manager Asana Bootstrap (新セッション開始時の Asana 由来コンテキスト復元)

- Status: Accepted
- Date: 2026-04-29
- Owners: pm-orchestrator-runner team (uehara@eln.ne.jp)
- Related ADRs:
  - [ADR-0006: Asana Progress Sync on Free Plan](./0006-asana-progress-sync-on-free-plan.md) — taskRun ↔ Asana 多対多バインディング決定
- Related Specs:
  - [Spec-41: Asana Progress Hook (task-tracker-sync v0.2.0)](../spec/41_ASANA_PROGRESS_HOOK.md) — lifecycle イベントと resume の入力契約
  - Spec-42: session-manager Asana Bootstrap (本 ADR と同時に作成)
- Asana タスク: `1214356975323412` ([Spec] session-manager: Asana bootstrap 設計, Phase B, P1)
- Supersedes: なし — `.claude/skills/session-manager.md` v1.0.0 (ローカル開発用) の `bootstrap` 概念を Asana 連携用に拡張する追加 ADR

## Context

`session-manager` skill (現状 `.claude/skills/session-manager.md` v1.0.0、配布対象テンプレートは未整備) は新セッション開始時に以下を判定する責務を持つ:

1. `sessionId` を払い出す (`session-YYYY-MM-DD-XXXXXX`)
2. `taskRunId` を払い出す (`YYYY-MM-DD-NNN`)
3. ユーザー入力が「続き (same_task)」か「新タスク (new_task)」かを判定 (continuationMode)
4. session JSON (`.claude/sessions/<sessionId>.json`) を初期化または更新

ADR-0006 と Spec-41 で **task-tracker-sync v0.2.0** が定義され、taskRun の lifecycle (adopt / create / progress / complete / abandon / **resume**) を Asana に同期する仕組みが整った。しかし以下が未決定:

1. **session 開始時の Asana コンテキスト読み取りタイミング**: `task-tracker-sync` の `resume` イベントは「呼び出された時点で `previousTaskRunId` と `asanaTaskGid` を既に知っている」前提。これを **誰が** **いつ** 解決するかが Spec-41 では未定 (Spec-41 §6.6 で「session-manager bootstrap」と書かれているが具体仕様なし)。
2. **My Tasks の取得スコープ**: 「Asana の running task を全部表示 → 続きか聞く」のか「直近 N=3 を提案」のか「ユーザー明示参照のみ」なのかの方針未定。
3. **session JSON 不在時 vs 既存 session 継続時の差分**: 新セッション (sessionId が新規) でも、必ずしも new_task とは限らない (前セッションの abandon を別シェルで再開するケース)。
4. **Asana MCP 不在時のフォールバック**: 現状の session-manager v1.0.0 は Asana を全く参照しない。MCP 不在でも v1.0.0 と同等の動作 (Asana なしでも sessionId / taskRunId は払い出せる) を保証する必要がある。

これらが未決定のままだと、Spec-41 AC-41-9 (resume での前回履歴復元) のテストが書けない。AC-41-9 は session B が「session A で abandon したタスクを resume」するシナリオであり、bootstrap が `previousTaskRunId` と `asanaTaskGid` を解決して `task-tracker-sync.resume` に渡す前提だからである。

加えて `asana-task-map.md` (35+ 件のタスク台帳) と Asana 上の `My Tasks` (running) は **どちらが優先か** が未定。`asana-task-map.md` は人間が curate する index、`My Tasks` は user への通知用、という性質の違いをどう調整するかが論点。

## Decision

**`session-manager` skill に `asana-bootstrap` フェーズを追加する。session 開始時に Asana の `My Tasks (running)` を **照会のみ** し、ユーザーに「続きをやるか / 新タスクとして開始するか」を提案する。MCP 不在時は v1.0.0 と完全同等動作にフォールバックする。**

### 1. Bootstrap 起動条件

`session-manager` の processing flow に `asana-bootstrap` フェーズを追加する。実行条件:

| 条件 | bootstrap 実行 |
|------|----------------|
| 新セッション開始 (session JSON 不在) かつ Asana MCP 接続成功 | **YES** |
| 新セッション開始 (session JSON 不在) かつ Asana MCP 不在 | NO (warning ログのみ、v1.0.0 動作にフォールバック) |
| 既存 session の継続 (session JSON 存在、runs[] に未閉鎖あり) | NO (continuation 判定は既存ロジックで処理) |
| 既存 session の継続 (runs[] 全て closed) かつ Asana MCP 接続成功 | **YES** (新 taskRun のための bootstrap) |
| ユーザー入力が `bootstrap-skip` フラグまたは環境変数 `PM_SKIP_ASANA_BOOTSTRAP=1` を含む | NO (デバッグ目的で skip 可能) |

### 2. Bootstrap 処理シーケンス

```
[session-manager.bootstrap 起動]
   ↓
[1] Asana MCP 接続確認
    - mcp__asana__asana_list_workspaces を呼んで疎通確認
    - 失敗 → fallback (v1.0.0 動作にフォールバック、warning を session JSON.meta.bootstrapWarnings[] に追記)
   ↓
[2] User context 取得
    - Asana の "My Tasks" を query (assignee=current_user, completed=false, modified_at >= now-30d)
    - mcp__asana__asana_search_tasks(workspace=81767308277002, ...) で取得
    - 上限: 直近 N=10 件 (ただし modified_at で desc sort、N>10 なら省略表示 "+N more")
   ↓
[3] User-explicit-reference 判定
    - ユーザー入力に明示的な Asana 参照 (URL / gid / B-NNN / ADR-NNNN / Spec-NN) が含まれる
      → ADR-0006 Decision 3 の existing-task lookup 1〜2 を session-manager 側で先行実行
      → 該当 gid を解決できたら、bootstrap 結果として
         { mode: "explicit-reference", asanaTaskGid: <gid>, previousTaskRunId: <story 検索で復元> }
         を返し、step [4] を skip
   ↓
[4] User prompt (TUI または Web UI コンソール)
    - 取得した My Tasks 一覧を提示:
      ```
      Asana の進行中タスク (直近修正順):
      [1] [Bug] B-016: タスク分解時の注入テキスト... (Phase A, P0, 2026-04-28 modified)
      [2] [Spec] session-manager: Asana bootstrap 設計 (Phase B, P1, 2026-04-29 modified)
      [3] [Refactor] dynamo-dal: 11 TODO migration markers... (Phase E, P1, 2026-04-27 modified)
      ...
      [N] None of the above (新タスクとして開始)
      ```
    - ユーザーが [1]〜[N-1] を選ぶ → resume 候補として bootstrap 結果に格納
    - ユーザーが [N] を選ぶ → 新タスク。bootstrap 結果は { mode: "new-task" }
    - ユーザー応答が無い (5 sec timeout) → デフォルトで [N] 扱い (継続を強制しない)
   ↓
[5] Resume 候補の前回 taskRunId 解決
    - 選んだ Asana task の最新 stories を取得 (mcp__asana__asana_get_stories_for_task, limit=10)
    - 最新の story から regex で `taskRunId: (\d{4}-\d{2}-\d{2}-\d{3})` をパース
    - 最後の story event_label が "🔴 中断" または "🟢 完了" → previousTaskRunId として記録
    - "🟢 完了" だった場合は warning「このタスクは既に完了しています。本当に resume しますか?」を出してユーザー再確認
   ↓
[6] bootstrap 結果を返却
    - pm-orchestrator が受け取り、適切な lifecycle event (resume / adopt) を task-tracker-sync に発行
```

### 3. Bootstrap 出力契約

```typescript
type BootstrapResult =
  | { mode: "skipped"; reason: "mcp-unavailable" | "explicit-skip" | "session-continuing" }
  | { mode: "new-task" }
  | { mode: "explicit-reference";
      asanaTaskGid: string;
      asanaTaskUrl: string;
      previousTaskRunId: string | null;
      lastEventLabel: string | null }
  | { mode: "resume-candidate";
      asanaTaskGid: string;
      asanaTaskUrl: string;
      title: string;
      homePhase: string;
      homeSectionGid: string;
      previousTaskRunId: string | null;
      lastEventLabel: string | null;
      userConfirmed: true }
  | { mode: "user-declined";
      offeredCandidates: Array<{ gid: string; title: string }>;
      userChoice: "none" };
```

`pm-orchestrator` 側で `mode` ごとに分岐:
- `skipped` / `new-task` / `user-declined` → 通常の new_task フロー (existing-task lookup → adopt or create)
- `explicit-reference` → `task-tracker-sync.adopt` (既に gid 解決済み、ユーザーが明示参照したので user prompt は出さない)
- `resume-candidate` → `task-tracker-sync.resume` (previousTaskRunId と asanaTaskGid を渡す)

### 4. session JSON への書き戻し

`bootstrap` 完了時に session JSON の `meta` セクションへ以下を書き込む:

```jsonc
{
  "meta": {
    "asanaBootstrap": {
      "ranAt": "2026-04-29T12:34:56Z",
      "result": { /* BootstrapResult */ },
      "warnings": [],
      "userPromptShown": true,
      "userPromptDurationMs": 1820
    }
  }
}
```

これにより session を再現するときに「bootstrap がどう判定したか」を後追いできる。次回以降の同 session では `meta.asanaBootstrap` が既に存在するため bootstrap は再実行しない。

### 5. Fallback 動作の互換性

Asana MCP 不在 / 通信失敗 / permission 拒否のいずれかが発生した場合、session-manager は以下にフォールバック:

| ケース | 動作 |
|--------|------|
| MCP 未接続 | bootstrap=skipped(mcp-unavailable)、v1.0.0 動作で継続。session JSON.meta.bootstrapWarnings に "Asana MCP unreachable" を追加 |
| MCP 接続するが workspace 取得失敗 | bootstrap=skipped(mcp-unavailable)、warning 同上 + 詳細エラーコード |
| user prompt timeout (5 sec) | mode: "user-declined" として継続 (ユーザーを止めない) |
| story パースで previousTaskRunId 解決不可 | mode: "resume-candidate" だが previousTaskRunId=null。pm-orchestrator は resume を adopt にダウングレード |

「Asana sync の失敗は taskRun を止めない」(ADR-0006 / Spec-41 §10 の原則) を session-manager レベルでも徹底する。

### 6. Privacy / Security

- bootstrap で取得する Asana データは **そのセッションの session JSON にのみ書き込む**。グローバルキャッシュや他 session への流出は禁止
- ユーザーが 5 sec で応答しなかった場合は「拒否」とみなして resume を提案しない (誤って前回タスクを掴むリスクを避ける)
- bootstrap が表示するタスク一覧は **assignee が current user のもの** に限定 (他人のタスクを覗き見しない)
- `asana-task-map.md` には gid のみ記載、Asana の private 情報 (notes 全文 / assignee email) は記載しない

## Alternatives Considered

### Option A: bootstrap を行わず、ユーザー明示参照のみで resume を実現

- Pros: 実装が最小、user prompt 不要
- Cons: ユーザーが毎回「B-016 の続き」のように明示しないと resume できない。Asana を真実の source-of-truth と謳いながら能動的に提案しないのは UX として弱い。Spec-41 AC-41-9 は user input 経路にしか依存しないため、bootstrap 無しでも理論上は通る (=設計目的を満たさないだけ)

### Option B: bootstrap を pm-orchestrator 側に実装する (session-manager は触らない)

- Pros: session-manager v1.0.0 をそのまま維持できる
- Cons: pm-orchestrator は「TaskType 判定 + サブエージェント chain」が責務であり、Asana MCP 呼び出しを混ぜると責務肥大化。session lifecycle (sessionId/taskRunId 管理) は明確に session-manager の責務であり、session 開始時の Asana 同期もそこに置くのが自然

### Option C: bootstrap で全 Asana タスクを fetch (assignee 制約なし)

- Pros: チーム作業時に他メンバーのタスクを確認できる
- Cons: My Tasks を超える全件取得は (a) 30+ 件規模では UX が劣化、(b) personal use の現状では他人タスクは雑音、(c) Free プランで rate limit を圧迫。また「他人のタスクを掴む」誤操作リスクが上がる

### Option D: bootstrap を asynchronous にする (background fetch、ユーザー入力には待ち時間ゼロ)

- Pros: 体感速度が良い
- Cons: ユーザーが既に入力を始めた後で「実は B-016 の続きでした」を提案する形になり、判定タイミングが遅すぎて意味を成さない。bootstrap は **ユーザー最初の入力を解釈する前** に終わっている必要がある

### Option E: bootstrap で My Tasks 全件 + asana-task-map.md 全件をマージして提示

- Pros: 棚卸し済みタスクと running タスクを統合した広い提案ができる
- Cons: リスト件数が膨大になり (現状 35+)、ユーザー選択の認知負荷が高い。`asana-task-map.md` は backlog index であり「running」とは異なる概念 (Done / Backlog も含む) なので、混ぜると意味論が崩れる

→ Option B/C/D/E は問題があり、Option A は設計目的に届かない。本 ADR の Decision (My Tasks + 明示参照、5 sec timeout、MCP 不在時 fallback) を採択。

## Consequences

### 良い影響

- 新セッションで「前回どこまで進んだか」を Asana stories から自動復元できる → セッション横断の生産性向上
- Spec-41 AC-41-9 (resume での前回履歴復元) の実装/テストに必要な前提条件が揃う
- ユーザー明示参照 (URL / gid / B-NNN) の場合は user prompt を出さず即 adopt できる → 体感速度の改善
- session JSON に `asanaBootstrap` を保存することで bootstrap の挙動が後追い可能 → デバッグしやすい
- MCP 不在時に v1.0.0 と完全同等動作 → 既存ユーザーへの破壊的変更なし

### 悪い影響

- session-manager skill の実装複雑度が v1.0.0 (~150 行と推定) → v0.2.0 (推定 ~400 行) に上昇
- 新セッション開始時のレイテンシが増加 (P95 < 5 sec を許容、Asana MCP 1〜3 calls 追加)
- user prompt の UI/UX (TUI? Web UI? Claude Code の inline prompt?) の実装方針が未定 (本 ADR では責務分離のみ定義、実 UI は実装フェーズで決定)
- 5 sec timeout の選択は trade-off: 短すぎるとユーザーが見落とす、長すぎると体感が悪い。実証実験で調整する余地を残す
- ユーザーの「うっかり 1 を選んでしまう」誤操作で誤った resume が発生するリスク → 確認ダイアログ (Decision 2 [4]) で緩和するが完全には防げない

### 今後の対応

- **Phase B-Asana-3**: 本 ADR + Spec-42 ([Spec] session-manager: Asana bootstrap) の merge
- **Phase C-Asana-2**: session-manager v0.2.0 実装 (RED → GREEN テスト先行)
  - 実装先は **`pm-orchestrator/templates/.claude/skills/session-manager.md`** (Rule 15 配布対象パス)。現状この template は不在のため、初回実装時に新規作成する
  - 既存の `.claude/skills/session-manager.md` (ローカル開発用 v1.0.0) は **触らない**。Rule 15 (Skill Distribution Repository Protection) に従う
- **Phase C-Asana-3**: pm-orchestrator skill が `BootstrapResult.mode` を受け取って task-tracker-sync を発行する分岐実装
- **Phase D-Asana-2**: bootstrap の user prompt UI を Web UI コンソールで具体化 (現状は CLI/TUI 想定)

## 補足: Rule 15 (Skill Distribution Repository Protection) の取り扱い

本リポジトリでは `.claude/skills/session-manager.md` (v1.0.0) は **ローカル開発用** であり、配布対象ではない。Spec-42 の実装フェーズでは:

1. `pm-orchestrator/templates/.claude/skills/session-manager.md` を新規作成 (template 化)
2. v0.2.0 として asana-bootstrap フェーズを含める
3. 既存の `.claude/skills/session-manager.md` (v1.0.0) は維持 (互換性のため、または将来の取り回しによっては削除を別 ADR で議論)
4. テストは外部 install 経路で `scripts/test-external-install.sh` 相当を実行して検証

これは ADR-0006 の `task-tracker-sync` v0.2.0 の配布先と同じパターンになる。
