# Spec-41: Asana Progress Hook (task-tracker-sync v0.2.0 interface)

- Status: Design (Spec-First-TDD; 実装は Phase C で着手)
- Owners: pm-orchestrator-runner team
- Related ADR: [ADR-0006: Asana Progress Sync on Free Plan](../adr/0006-asana-progress-sync-on-free-plan.md)
- Related skills:
  - `eln-pm-orchestrator/skills/task-tracker-sync` (本仕様で v0.1.0 → v0.2.0 へ)
  - `eln-pm-orchestrator/skills/session-manager` (bootstrap 連携先、別 spec で詳述)
  - `eln-pm-orchestrator/skills/eln-asana-setup` v0.1.1 (Free プラン規約)

## 1. 目的

PM Orchestrator が Asana を **真実の source-of-truth** として扱えるよう、taskRun の lifecycle イベントと Asana タスクの状態を同期する hook を定義する。Asana Free プランの制約を吸収しつつ、複数セッションをまたぐ作業継続を可能にする。

## 2. スコープ

### 含む
- `task-tracker-sync` skill の Asana 専用 lifecycle ロジック (adopt / create / progress / complete / abandon / resume)
- session JSON への `asanaBindings` 追加と読み書き
- Asana MCP (`mcp__asana__*` または `mcp__claude_ai_Asana__*`) 経由の API 呼び出し
- Free プランフォールバック (eln-asana-setup v0.1.1) の機械的反映 (タグ / section / notes prefix-suffix)
- 既存タスク adopt 判定 (gid 直指定 / B-NNN ID マッチ)
- story comment テンプレート

### 含まない
- session-manager の bootstrap 詳細 (別 spec; Asana gid `1214356975323412`)
- Levenshtein 類似度マッチング (ADR-0006 Decision 3-3) — v0.2.0 では off
- ClickUp 実装 (v0.1.0 の抽象 API は残すが具体化は別途)
- Slack 通知連動 (B-003 Slack Integration で別途実装)

## 3. 用語

| 用語 | 定義 |
|------|------|
| **taskRun** | session-manager が払い出す `taskRunId` 単位の作業 (例: `2026-04-29-001`) |
| **Asana Task** | Asana 上の 1 行のタスク (gid 持ち) |
| **binding** | 1 taskRun と 1 Asana Task の紐付け関係。session JSON に保持 |
| **Phase X** | Asana の `Phase A: 即時対応` 〜 `Phase F: 将来対応` セクション |
| **home phase** | あるタスクが属する categorical な Phase X (タスク作成時に決まる) |
| **lifecycle event** | adopt / create / progress / complete / abandon / resume の 6 種 |

## 4. データ構造

### 4.1 session JSON 拡張

`.claude/sessions/<sessionId>.json` の `runs[].meta` に以下を追加:

```typescript
type AsanaBinding = {
  gid: string;                // Asana task gid
  url: string;                // Asana web UI URL (full)
  title: string;              // タスク名 (snapshot, debugging 用)
  homePhase: string;          // 例: "Phase A: 即時対応"
  homeSectionGid: string;     // 例: "1214338125692623"
  boundAt: string;            // ISO 8601
  boundBy:
    | "task-tracker-sync.create"   // 新規起票
    | "task-tracker-sync.adopt"    // 既存タスクを掴む
    | "session-manager.bootstrap"; // 新セッションで Asana 由来で復元
  closedAt?: string;          // taskRun 終了時 (complete or abandon)
  closeReason?: "complete" | "abandon" | "session-end";
};

type RunMeta = {
  // 既存フィールド...
  repoPath: string;
  targetDir: string | null;
  taskType: string;
  continuationMode: "new_task" | "same_task" | "unknown";
  colorTag: string;
  role: string;
  // v0.2.0 追加
  asanaBindings?: AsanaBinding[];
};
```

### 4.2 work_log frontmatter (オプション)

`.claude/work_log/open/*.md` 内に Asana binding を記録する場合の frontmatter:

```yaml
---
taskRunId: 2026-04-29-001
asana:
  - gid: 1214356816544961
    url: https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214356816544961
---
```

session JSON が真実の source であり、work_log frontmatter は人間が grep しやすくするための duplicate (任意)。

### 4.3 Asana 側で利用するセクション gid 表 (snapshot 2026-04-29)

`asana-task-map.md` を読んで動的に解決すべき。実装側ではコード内ハードコードしない。
ただし設計上の参考値として:

| Phase | Section gid |
|-------|-------------|
| Active Sprint | `1214370576492665` |
| Phase A: 即時対応 | `1214338125692623` |
| Phase B: 設計基盤 | `1214344784396324` |
| Phase C: 主要機能実装 | `1214338125749479` |
| Phase D: 既存機能の改善 | `1214342302941887` |
| Phase E: アーキテクチャ改善 | `1214344784588480` |
| Phase F: 将来対応 | `1214340333901982` |
| Backlog | `1214344784084921` |
| Done | `1214344784545305` |

| Priority Tag | gid |
|--------------|-----|
| P0 | `1214340344434307` |
| P1 | `1214338136030617` |
| P2 | `1214344794652240` |
| P3 | `1214344794765538` |

## 5. インターフェース

### 5.1 task-tracker-sync skill 入力契約

PM Orchestrator が呼び出すときの input schema:

```typescript
type SyncInput =
  | { event: "adopt"; taskRunId: string; asanaTaskGid: string; reason: string }
  | { event: "create"; taskRunId: string; spec: CreateSpec }
  | { event: "progress"; taskRunId: string; summary: string; subagent?: string }
  | { event: "complete"; taskRunId: string; finalReport: FinalReport }
  | { event: "abandon"; taskRunId: string; reason: string }
  | { event: "resume"; taskRunId: string; previousTaskRunId: string; asanaTaskGid: string };

type CreateSpec = {
  title: string;                 // [Type] Bug-XXX: 〜 形式 (Free プラン Type prefix 規約)
  taskType: "Spec" | "Impl" | "Bug" | "Test" | "Docs" | "DevOps" | "Refactor" | "Process";
  priority: "P0" | "P1" | "P2" | "P3" | null;
  phase: "A" | "B" | "C" | "D" | "E" | "F" | null;
  specRef?: string;              // 例: "ADR-0006" → notes 冒頭 "Spec: ADR-0006"
  notes?: string;                // notes 本文
  parentGid?: string;            // 親タスクとの紐付け (Epic 配下サブタスクなど)
};

type FinalReport = {
  summary: string;               // 完了の 1-3 行要約
  prUrl?: string;                // GitHub PR URL → notes に "PR: <url>" として追加
  commitSha?: string;
  metrics?: {
    filesChanged: number;
    testsRun: number;
    testsPassed: number;
  };
};
```

### 5.2 task-tracker-sync skill 出力契約

```typescript
type SyncOutput = {
  ok: boolean;
  event: SyncInput["event"];
  taskRunId: string;
  asanaBinding: AsanaBinding | null;  // create/adopt/resume で更新後の binding を返す
  storyGid?: string;                  // 投稿した story の gid
  errors?: Array<{
    code: "RATE_LIMIT" | "PERMISSION" | "NOT_FOUND" | "BAD_INPUT" | "MCP_UNAVAILABLE" | "NETWORK";
    message: string;
    retried: number;
  }>;
};
```

### 5.3 Asana MCP 呼び出しマッピング

| 操作 | Asana MCP tool | 備考 |
|------|----------------|------|
| 新規タスク作成 | `mcp__asana__asana_create_task` | parent_gid 指定で subtask 化 |
| section 取得 | `mcp__asana__asana_get_project_sections` | 起動時 1 回 cache, TTL 5 分 |
| section 移動 | `mcp__asana__asana_add_task_to_section` | Done への移動はこれ |
| story 投稿 | `mcp__asana__asana_create_task_story` | text フィールドに markdown 可 |
| notes 更新 | `mcp__asana__asana_update_task` | `notes` フィールド (replace, 部分更新不可) |
| tag 追加 | `mcp__asana__asana_add_tag_to_task` | Priority タグ |
| 既存タスク取得 | `mcp__asana__asana_get_task` | adopt 時の検証 |
| ID マッチ検索 | `mcp__asana__asana_search_tasks` | Decision 3-2 の B-NNN 検索 |

## 6. シーケンス

### 6.1 既存タスク adopt フロー

```
[User] "B-016 の続きやって"
   ↓
[session-manager] same_task or new_task 判定 → new_task with continuation flag
   ↓
[session-manager] asana-task-map.md を grep "B-016" → gid 1214356816544961 を解決
   ↓
[pm-orchestrator] task-tracker-sync を起動 (event: adopt)
   ↓
[task-tracker-sync]
  1. asana_get_task(gid) で現在状態を確認
  2. 現在 section が "Phase A: 即時対応" → homePhase に保存し、Active Sprint section へ移動 (asana_add_task_to_section, Active Sprint gid)
  3. asanaBindings に追加 (boundBy: "task-tracker-sync.adopt")
  4. asana_create_task_story で
     "🟡 taskRun 開始: 2026-04-29-001
      session: session-2026-04-29-xxx
      operator: pm-orchestrator
      reason: ユーザー入力 'B-016 の続きやって'
      home phase: Phase A: 即時対応 (Active Sprint へ一時移動)"
   ↓
[pm-orchestrator] 通常の implementer/qa フローへ
```

### 6.2 新規 create フロー (PM Orchestrator が新タスクと判定したとき)

```
[User] "ログイン画面のバリデーションを追加してください"
   ↓
[pm-orchestrator]
  1. requirement-analyzer → priority=P2, phase=C, taskType=Impl
  2. existing-task lookup → no match
  3. task-tracker-sync (event: create, spec: { title: "[Impl] ログイン画面バリデーション追加", priority: "P2", phase: "C", ... })
   ↓
[task-tracker-sync]
  1. asana_create_task(name="[Impl] ログイン画面バリデーション追加",
                       notes="taskRunId: 2026-04-29-001\nrepo: pm-orchestrator-runner\n",
                       projects=[1214289977522742])
     → gid 取得
  2. asana_add_task_to_section(section_gid="1214338125749479" /* Phase C */, task_gid=...)
     ※ homePhase = Phase C を asanaBindings に記録
  3. asana_add_task_to_section(section_gid=<Active Sprint gid>, task_gid=...)
     ※ adopt/progress 中は Active Sprint に集約
  4. asana_add_tag_to_task(task_gid=..., tag_gid="1214344794652240" /* P2 */)
  5. asanaBindings に追加 (boundBy: "task-tracker-sync.create", homePhase: "Phase C: 主要機能実装")
  6. asana_create_task_story("🟡 taskRun 作成 ...")
```

### 6.3 progress フロー

```
[implementer 完了]
   ↓
[pm-orchestrator] task-tracker-sync (event: progress, summary: "src/components/Login.tsx を修正、テスト 3 件追加")
   ↓
[task-tracker-sync]
  1. asanaBindings から該当 gid を取り出し (1 taskRun = N binding 全てに同じ story を投稿)
  2. asana_create_task_story("🔵 ステップ完了: src/components/Login.tsx を修正、テスト 3 件追加 (taskRunId: 2026-04-29-001)")
```

### 6.4 complete フロー

```
[reporter 完了]
   ↓
[pm-orchestrator] task-tracker-sync (event: complete, finalReport: { prUrl: "...", commitSha: "..." })
   ↓
[task-tracker-sync] 各 binding に対して
  1. asana_get_task → 現在 notes を取得
  2. notes に "PR: <prUrl>" suffix 追加 (既に同 URL があれば skip) → asana_update_task
  3. asana_add_task_to_section(section_gid="1214344784545305" /* Done */)
     ※ Active Sprint からは Done への移動で自動的に外れる (Asana の section は単一所属)
  4. asana_create_task_story("🟢 完了: <summary>\nPR: <prUrl>\nCommit: <sha>")
  5. binding.closedAt = now, closeReason = "complete"
     ※ 完了時に homePhase は記録のみ (元の Phase X には戻さない。Done が終着点)
```

### 6.5 abandon フロー

```
[エラーで打ち切り or ユーザー指示で中断]
   ↓
[pm-orchestrator] task-tracker-sync (event: abandon, reason: "テストが収束せず、ユーザー判断で中断")
   ↓
[task-tracker-sync]
  1. asana_add_task_to_section(section_gid=<homePhase の section gid>, task_gid=...)
     ※ Active Sprint から外し、元の home phase に戻す (中断タスクは Active Sprint に滞留させない)
  2. asana_create_task_story("🔴 中断: テストが収束せず、ユーザー判断で中断")
  3. binding.closedAt = now, closeReason = "abandon"
```

### 6.6 resume フロー

```
[新セッション] "B-016 の続き、前回のテスト失敗を直して"
   ↓
[session-manager bootstrap]
  1. asana-task-map.md grep → gid 1214356816544961
  2. asana_get_task(gid) → notes と直近 N=10 stories を取得
  3. 前回 taskRunId を story から復元 (例: "🔴 中断: ...(taskRunId: 2026-04-28-003)")
  4. PM Orchestrator のコンテキストに注入
   ↓
[pm-orchestrator] task-tracker-sync (event: resume, previousTaskRunId: "2026-04-28-003", asanaTaskGid: ...)
   ↓
[task-tracker-sync]
  1. asanaBindings に新 taskRunId で binding 追加
  2. asana_get_task で現在 section を確認 → Active Sprint でなければ asana_add_task_to_section で Active Sprint へ移動 (homePhase は元の section を記録)
  3. asana_create_task_story("🔄 taskRun 再開: 2026-04-29-001 (前回 2026-04-28-003)\n前回までの進捗: <stories から要約>")
```

## 7. story comment テンプレート

全 story に共通の prefix:
```
{emoji} {event_label}: {message}
taskRunId: {taskRunId}
session: {sessionId}
operator: pm-orchestrator
timestamp: {ISO8601}
```

| event | emoji | event_label |
|-------|-------|-------------|
| adopt | 🟡 | taskRun 開始 (adopt) |
| create | 🟡 | taskRun 作成 |
| progress | 🔵 | ステップ完了 |
| complete | 🟢 | 完了 |
| abandon | 🔴 | 中断 |
| resume | 🔄 | taskRun 再開 |

セッション復元時に regex 1 行で `taskRunId` / `event_label` をパースできるようにする。

## 8. 受け入れ基準 (AC)

### AC-41-1: adopt ハッピーパス
- 既存 Asana タスク (例: gid `1214356816544961`) を adopt
- 期待: `asanaBindings` に 1 件追加、Asana 側に "🟡 taskRun 開始 (adopt)" story が投稿される、section 移動なし、notes 変更なし

### AC-41-2: create with full spec
- 全フィールド (title, taskType, priority, phase, specRef) を持つ create
- 期待: name = `[Impl] ...`, notes 冒頭 = `Spec: ADR-0006`, P2 タグ付与, Phase C section 配置

### AC-41-3: create with partial spec
- priority/phase 不明な状態で create
- 期待: name の type prefix のみ付与、tag/section は default なし (set されない)、notes は空 or 提供分のみ

### AC-41-4: complete → Done 移動
- adopt 状態のタスクを complete
- 期待: section が Done (`1214344784545305`) に移動、notes に `PR: <url>` suffix 追加、🟢 story 投稿、`asanaBindings[0].closedAt` がセット

### AC-41-5: complete 連続呼び出しの冪等性
- 同じ taskRun に対して complete を 2 回呼ぶ
- 期待: 2 回目はエラーなし、PR URL の重複追加なし、Done への再移動 no-op、🟢 story は 1 回だけ投稿 (2 回目は skip ロジックで防ぐ)

### AC-41-6: rate limit 時の指数バックオフ
- Asana API が 429 を返したケース
- 期待: 1s → 2s → 4s → 8s → 失敗報告 (`errors[].code: "RATE_LIMIT"`, `retried: 4`)

### AC-41-7: MCP 不在時の縮退動作
- Asana MCP が未接続
- 期待: PM Orchestrator のメイン処理は **継続** する (Asana sync 失敗で taskRun を止めない)、`SyncOutput.errors` に `MCP_UNAVAILABLE` を返し、ユーザー向けレポートに警告を含める

### AC-41-8: 多対多バインディング
- 1 taskRun が 2 つの Asana タスク (例: B-016 + DEF-001 と同 gid 別に存在する仮想ケース) に bind されている状態で progress
- 期待: 両方の Asana タスクに同一 story が投稿される

### AC-41-9: resume での前回履歴復元
- session A で taskRun X を abandon → session B で resume
- 期待: session B の `asanaBindings[0]` が前回と同じ gid、🔄 story に "前回 X" が含まれる、PM Orchestrator のコンテキストに前回 stories の要約が注入される

### AC-41-10: notes prefix `Spec:` の append (重複防止)
- 既に notes 冒頭に `Spec: ADR-0003` が存在するタスクに対し、create-like update で `specRef: "ADR-0003"` を渡す
- 期待: 重複 append しない (既存をそのまま維持)

### AC-41-11: existing-task lookup (gid 直指定)
- ユーザー入力 `https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214356816544961` を含む
- 期待: 該当 gid を adopt、create に進まない

### AC-41-12: existing-task lookup (B-NNN マッチ)
- ユーザー入力に "B-016" を含み、`asana-task-map.md` に B-016 が登録されている
- 期待: 該当 gid を adopt

### AC-41-13: existing-task lookup (B-NNN マッチ無し)
- ユーザー入力に "B-999" を含むが asana-task-map.md に未登録
- 期待: adopt せず create に進む (false positive 回避)

### AC-41-14: adopt/progress で Active Sprint 移動
- adopt 時に既存タスクが home phase (例: Phase A) に在籍
- 期待: section が Active Sprint に移動し、`asanaBindings[].homePhase` に元の Phase 名 ("Phase A: 即時対応") と `homeSectionGid` が保存される。progress event でも Active Sprint 在籍を維持
- create 時も同様: home phase 記録後 Active Sprint に配置

### AC-41-15: complete 時 Active Sprint から外れて Done のみに到達
- complete を呼んだ後、対象タスクの section を確認
- 期待: section が Done (`1214344784545305`) のみで、Active Sprint には在籍していない (Asana は section 単一所属モデルのため自動)
- abandon の場合は Active Sprint から外れて homePhase の section に戻る (Done には行かない)

## 9. テスト計画 (Spec-First-TDD)

| AC | テスト種別 | ファイル候補 |
|----|------------|--------------|
| AC-41-1 〜 AC-41-3 | unit (mock Asana MCP) | `test/unit/skills/task-tracker-sync/adopt-create.test.ts` |
| AC-41-4 〜 AC-41-6 | unit | `test/unit/skills/task-tracker-sync/lifecycle.test.ts` |
| AC-41-7 | unit | `test/unit/skills/task-tracker-sync/mcp-fallback.test.ts` |
| AC-41-8 | unit | `test/unit/skills/task-tracker-sync/multi-binding.test.ts` |
| AC-41-9 | integration (session-manager 連動) | `test/integration/session-manager-asana-resume.test.ts` |
| AC-41-10 | unit | `test/unit/skills/task-tracker-sync/notes-spec-prefix.test.ts` |
| AC-41-11 〜 AC-41-13 | unit | `test/unit/skills/task-tracker-sync/existing-task-lookup.test.ts` |
| AC-41-14 | unit | `test/unit/skills/task-tracker-sync/active-sprint-move.test.ts` |
| AC-41-15 | unit | `test/unit/skills/task-tracker-sync/complete-vs-abandon-section.test.ts` |

E2E テストは Asana 本番に副作用が出るため、専用のテスト project を別途作成して `ASANA_TEST_PROJECT_GID` env で切り替える。CI からは default で skip (test.skip 禁止に違反しないよう、env 不在時は describe.skip ではなく動的に describe を構築する) にする。

## 10. エラーハンドリング

| 状況 | 動作 | reporter への影響 |
|------|------|-------------------|
| Asana MCP 未接続 | warning ログ + `errors[]` に `MCP_UNAVAILABLE` | reporter 最終レポートに警告を含める。taskRun 自体は継続 |
| API rate limit (429) | 指数バックオフ最大 4 回 | 4 回失敗で `RATE_LIMIT` を `errors[]` に。taskRun は継続 |
| permission error (403) | 即時失敗 | reporter にユーザー向けの「token を確認してください」案内 |
| asana_get_task で 404 | binding は invalidate (closedAt 設定) | reporter で "binding 失効" を通知 |
| section gid 解決失敗 | section 移動を skip + warning | taskRun 継続 |
| ネットワーク (一般) | 指数バックオフ最大 4 回 | 同上 |

**原則**: Asana sync の失敗は **taskRun を止めない**。Asana を真実の source-of-truth と謳いつつも、ローカル session JSON が backup として機能する。

## 11. パフォーマンス予算

| 操作 | 目標レイテンシ | 備考 |
|------|----------------|------|
| adopt (1 binding) | < 2 sec (P95) | get_task + create_story の 2 call |
| create (full spec) | < 4 sec (P95) | create_task + add_to_section + add_tag + create_story の 4 call |
| progress (1 binding) | < 1 sec (P95) | create_story 1 call |
| complete (1 binding) | < 3 sec (P95) | get_task + update_task + add_to_section + create_story の 4 call |
| resume (1 binding) | < 5 sec (P95) | get_task + get_stories + create_story の 3 call (stories N=10) |

P95 を超えた場合は warning ログのみ (失敗とは扱わない)。

## 12. 後方互換性

- task-tracker-sync v0.1.0 の input schema (`create_task` / `add_comment` / `update_status`) は **deprecated** だが maintained。v0.2.0 内部では新 lifecycle event に変換して処理する
- session JSON で `meta.asanaBindings` が undefined の旧 session は、空配列として扱う
- ClickUp 利用者は v0.1.0 抽象 API のまま (本 spec の Asana 専用挙動は呼ばれない)

## 13. 依存関係

```
[Spec-41]
  ├─ depends on: ADR-0006 (Free プランフォールバック決定)
  ├─ depends on: eln-asana-setup v0.1.1 (フォールバック規約)
  ├─ depends on: asana-task-map.md (section/tag gid の動的解決元)
  └─ extends: task-tracker-sync v0.1.0 (抽象 API)

[Spec-41 を blocking する spec]
  └─ session-manager Asana bootstrap spec (Asana gid 1214356975323412)
       ※ resume イベント (AC-41-9) のテストには bootstrap 実装が必要
```

## 14. 未解決事項 / 将来課題

- **Levenshtein 類似度マッチング (ADR-0006 Decision 3-3)**: v0.2.0 では off。実証実験フェーズ (Phase D-Asana-1) で誤マッチ率を計測してから判定
- **Asana ↔ GitHub PR の双方向同期**: 現状は片方向 (Asana に PR URL を書き込むのみ)。GitHub PR comment から Asana を更新する逆向きは future work
- **複数 project 対応**: 現状は project gid `1214289977522742` (pm-runner) 固定。multi-project は project-config.json の `taskTracker.projects[]` 配列対応で別途
- **Notification 連動 (B-002 Email, B-003 Slack)**: complete event に hook して Slack/Email 通知を出す設計は本 spec の対象外
