---
skill: task-tracker-sync
version: 2.0.0
category: integration
description: Asana (Free Plan) を canonical な provider として、Spec-41 v0.2.0 契約 (adopt/create/progress/complete/abandon/resume) に従い PM Orchestrator の taskRun を Asana タスクに同期する。Active Sprint section + Phase A-F section 構造を前提とする二段管理を実装。
metadata:
  id: task-tracker-sync
  display_name: Task Tracker Sync (Spec-41 v0.2.0)
  risk_level: low
  color_tag: YELLOW
  task_types:
    - IMPLEMENTATION
    - REVIEW_RESPONSE
    - CONFIG_CI_CHANGE
  spec_ref: docs/spec/41_ASANA_PROGRESS_HOOK.md
  adr_ref: docs/adr/0006-asana-progress-sync-on-free-plan.md
capabilities:
  - adopt_existing_task
  - create_task
  - add_progress_story
  - finalize_task
  - abandon_task
  - resume_task
  - active_sprint_management
tools:
  - Read
  - Bash
  - Task
priority: medium
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: session-manager
    relationship: receives_input_from
---

# Task Tracker Sync (Spec-41 v0.2.0)

PM Orchestrator の taskRun を Asana タスクに同期する skill。Spec-41 v0.2.0 (Active Sprint 二段管理 + Free Plan fallback) に準拠。

## Activation Conditions

PM Orchestrator が以下の `event` のいずれかで呼び出す:

| event | 起動タイミング |
|-------|---------------|
| `adopt` | session-manager が既存 Asana タスクを taskRun に紐付けたとき |
| `create` | requirement-analyzer が新規タスクと判定したとき |
| `progress` | implementer / qa など重要なステップ完了時 |
| `complete` | reporter の最終レポート受領時 |
| `abandon` | エラー打ち切り / ユーザー中断 |
| `resume` | 新セッションが既存 Asana タスクの続きを開始するとき |

## Provider 設定

`project-config.json`:

```json
{
  "taskTracker": {
    "provider": "asana",
    "projectGid": "1214289977522742",
    "mcpServerName": "asana",
    "freePlan": true
  }
}
```

`provider` が `none` の場合は全 event を skip し、`{ ok: true, event, taskRunId, asanaBinding: null }` を返す。

## Section gid 表 (snapshot 2026-04-29)

`asana-task-map.md` Sections 表と Spec-41 §4.3 の正本。

| 名前 | gid |
|------|-----|
| Active Sprint | `1214370576492665` |
| Phase A: 即時対応 | `1214338125692623` |
| Phase B: 設計基盤 | `1214344784396324` |
| Phase C: 主要機能実装 | `1214338125749479` |
| Phase D: 既存機能の改善 | `1214342302941887` |
| Phase E: アーキテクチャ改善 | `1214344784588480` |
| Phase F: 将来対応 | `1214340333901982` |
| Backlog | `1214344784084921` |
| Done | `1214344784545305` |

起動時に `mcp__asana__asana_get_project_sections` で 1 回取得し 5 分 cache。表との不一致を検出した場合は warning を出して MCP 結果を優先する。

## Active Sprint 二段管理

Spec-41 v0.2.0 / ADR-0006 Decision 8 の中核ロジック:

- `adopt` / `create` 時: タスクを **Active Sprint** に移動。元の Phase は `asanaBindings[].homePhase` と `homeSectionGid` に保存
- `progress` 時: section 移動は不要 (Active Sprint に既在)。story 投稿のみ
- `complete` 時: タスクを **Done** に移動 (Asana の section は単一所属モデルなので Active Sprint からは自動的に外れる)
- `abandon` 時: タスクを `homeSectionGid` (元の Phase) に戻す。Active Sprint には滞留させない

これにより「現在進行中のタスク一覧」を Active Sprint に集約しつつ、ロールバック時には元の Phase 構造を保持できる。

## 入力契約 (SyncInput)

```typescript
type SyncInput =
  | { event: "adopt"; taskRunId: string; asanaTaskGid: string; reason: string }
  | { event: "create"; taskRunId: string; spec: CreateSpec }
  | { event: "progress"; taskRunId: string; summary: string; subagent?: string }
  | { event: "complete"; taskRunId: string; finalReport: FinalReport }
  | { event: "abandon"; taskRunId: string; reason: string }
  | { event: "resume"; taskRunId: string; previousTaskRunId: string; asanaTaskGid: string };

type CreateSpec = {
  title: string;
  taskType: "Spec" | "Impl" | "Bug" | "Test" | "Docs" | "DevOps" | "Refactor" | "Process";
  priority: "P0" | "P1" | "P2" | "P3" | null;
  phase: "A" | "B" | "C" | "D" | "E" | "F" | null;
  specRef?: string;
  notes?: string;
  parentGid?: string;
};

type FinalReport = {
  summary: string;
  prUrl?: string;
  commitSha?: string;
  metrics?: { filesChanged: number; testsRun: number; testsPassed: number };
};
```

## 出力契約 (SyncOutput)

```typescript
type SyncOutput = {
  ok: boolean;
  event: SyncInput["event"];
  taskRunId: string;
  asanaBinding: AsanaBinding | null;
  storyGid?: string;
  errors?: Array<{
    code: "RATE_LIMIT" | "PERMISSION" | "NOT_FOUND" | "BAD_INPUT" | "MCP_UNAVAILABLE" | "NETWORK";
    message: string;
    retried: number;
  }>;
};

type AsanaBinding = {
  taskGid: string;
  taskRunId: string;
  homePhase: string | null;        // "Phase C: 主要機能実装" など
  homeSectionGid: string | null;   // 上記の section gid
  boundBy: "task-tracker-sync.adopt" | "task-tracker-sync.create" | "task-tracker-sync.resume";
  boundAt: string;                 // ISO8601
  closedAt?: string;
  closeReason?: "complete" | "abandon";
};
```

## Asana MCP 呼び出しマッピング

| 操作 | Asana MCP tool | 備考 |
|------|----------------|------|
| 新規タスク作成 | `mcp__asana__asana_create_task` | parent_gid 指定で subtask 化 |
| section 取得 | `mcp__asana__asana_get_project_sections` | 起動時 1 回 cache, TTL 5 分 |
| section 移動 | `mcp__asana__asana_add_task_to_section` | Active Sprint / Done への移動はこれ |
| story 投稿 | `mcp__asana__asana_create_task_story` | text に markdown 可 |
| notes 更新 | `mcp__asana__asana_update_task` | `notes` フィールド (replace) |
| tag 追加 | `mcp__asana__asana_add_tag_to_task` | Priority タグ (Free plan) |
| 既存タスク取得 | `mcp__asana__asana_get_task` | adopt 時の検証 |
| ID マッチ検索 | `mcp__asana__asana_search_tasks` | B-NNN 検索 |

`ASANA_ACCESS_TOKEN` 未設定時は MCP_UNAVAILABLE で縮退し、session JSON に "synced=false, reason=mcp-unavailable" を記録 (AC-41-7)。

## イベント別シーケンス

### adopt (既存タスク取り込み)

```
1. asana_get_task(asanaTaskGid) で現在 section を取得
2. 現 section が Active Sprint 以外 → homePhase / homeSectionGid に保存
3. asana_add_task_to_section(Active Sprint gid, asanaTaskGid)
4. asanaBindings に push (boundBy: "task-tracker-sync.adopt")
5. asana_create_task_story:
     "🟡 taskRun 開始: <taskRunId>
      session: <sessionId>
      operator: pm-orchestrator
      reason: <reason>
      home phase: <homePhase> (Active Sprint へ一時移動)"
```

### create (新規作成)

```
1. Free plan 規約に従い title を生成: "[<TaskType>] <body>"
   例: "[Impl] ログイン画面バリデーション追加"
2. asana_create_task(
     name=title,
     notes=composeNotes(specRef, notes, taskRunId),
     projects=[projectGid],
     parent=parentGid (optional)
   ) → 新 gid
3. asana_add_task_to_section(homeSectionGid /* phase mapping */, gid)
   ※ homePhase 記録目的で先に home に置く
4. asana_add_task_to_section(Active Sprint gid, gid)
   ※ Asana は単一所属なので最終的に Active Sprint のみ在籍
5. priority が指定されていれば asana_add_tag_to_task(P0/P1/P2/P3 tag_gid, gid)
6. asanaBindings に push (boundBy: "task-tracker-sync.create", homePhase: <phaseName>, homeSectionGid)
7. asana_create_task_story("🟡 taskRun 作成 ...")
```

`composeNotes`:
```
Spec: <specRef>          ← specRef があれば 1 行目
taskRunId: <taskRunId>
repo: pm-orchestrator-runner

<notes 本文>
```

### progress

```
For each binding in asanaBindings (closedAt 未設定):
  asana_create_task_story(
    "🔵 ステップ完了: <summary> (taskRunId: <taskRunId>" +
    (subagent ? ", by: <subagent>" : "") + ")"
  )
```

section 移動は無い (Active Sprint に既在のため)。

### complete

```
For each binding in asanaBindings (closedAt 未設定):
  1. asana_get_task(taskGid) → 現在 notes 取得
  2. prUrl があり notes に未含有 → notes に "PR: <prUrl>" suffix 追加 → asana_update_task
  3. asana_add_task_to_section(Done gid, taskGid)
     ※ Active Sprint 単一所属モデルにより自動的に Active Sprint から外れる
  4. asana_create_task_story("🟢 完了: <summary>\nPR: <prUrl>\nCommit: <sha>")
  5. binding.closedAt = now, closeReason = "complete"
```

`homePhase` には戻さない (Done が終着点)。

### abandon

```
For each binding in asanaBindings (closedAt 未設定):
  1. asana_add_task_to_section(homeSectionGid, taskGid)
     ※ Active Sprint から外し、元の home phase に戻す
  2. asana_create_task_story("🔴 中断: <reason> (taskRunId: <taskRunId>)")
  3. binding.closedAt = now, closeReason = "abandon"
```

### resume

```
1. asanaBindings に新 taskRunId で binding を push
   (homePhase / homeSectionGid は asana_get_task の結果から再構築)
2. 現 section が Active Sprint でなければ asana_add_task_to_section(Active Sprint gid, taskGid)
3. asana_create_task_story(
     "🔄 taskRun 再開: <taskRunId> (前回 <previousTaskRunId>)
      前回までの進捗: <直近 stories から要約 (max 5 件)>"
   )
```

## Story テンプレート (絵文字プレフィクス)

| 状態 | 絵文字 | 用途 |
|------|--------|------|
| 開始 | 🟡 | adopt / create |
| 進行 | 🔵 | progress |
| 完了 | 🟢 | complete |
| 中断 | 🔴 | abandon |
| 再開 | 🔄 | resume |

これにより Asana タイムラインから一目で taskRun ライフサイクルを追える。

## エラーハンドリング

| code | 検出条件 | 動作 |
|------|---------|------|
| `RATE_LIMIT` | Asana API 429 | 1s → 2s → 4s → 8s で最大 4 回再試行。全失敗で errors に記録 |
| `PERMISSION` | 401/403 | 即時失敗。ユーザーに `ASANA_ACCESS_TOKEN` 確認を促す |
| `NOT_FOUND` | 404 (taskGid 不正) | adopt/resume なら BAD_INPUT 扱い、create なら親側エラーを返す |
| `BAD_INPUT` | spec 必須項目欠落 | 即時失敗、検証メッセージ返却 |
| `MCP_UNAVAILABLE` | mcp ツール呼び出しでサーバー応答なし | session JSON に `synced=false` を書いて skip (PM Orchestrator は実装側を継続) |
| `NETWORK` | timeout / DNS / connect refused | RATE_LIMIT と同じバックオフ |

`MCP_UNAVAILABLE` 時の縮退動作 (AC-41-7) では PM Orchestrator のメイン処理は止めない。Asana 同期はあくまで auxiliary。

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 Task Tracker Sync (Spec-41 v0.2.0)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: YELLOW | Risk: LOW | Category: integration

Event: adopt | create | progress | complete | abandon | resume
Task: <Asana task name>
Gid: <taskGid>
URL: https://app.asana.com/0/<projectGid>/<taskGid>
Section: Active Sprint  (home: <homePhase>)
Story: <storyGid>

ok: true | false
errors: [...]
Status: completed | failed | skipped
```

## Examples

### Example 1: adopt (B-016 取り込み)

**Input:**
```json
{ "event": "adopt", "taskRunId": "2026-04-29-001", "asanaTaskGid": "1214356816544961", "reason": "ユーザー入力 'B-016 の続きやって'" }
```

**Asana operations:**
1. `asana_get_task(1214356816544961)` → 現 section "Phase A: 即時対応"
2. `asana_add_task_to_section(1214370576492665, 1214356816544961)` → Active Sprint へ移動
3. `asana_create_task_story` → "🟡 taskRun 開始: 2026-04-29-001..."

**Output binding:**
```json
{
  "taskGid": "1214356816544961",
  "taskRunId": "2026-04-29-001",
  "homePhase": "Phase A: 即時対応",
  "homeSectionGid": "1214338125692623",
  "boundBy": "task-tracker-sync.adopt",
  "boundAt": "2026-04-29T01:23:45Z"
}
```

### Example 2: create (新規 P2 / Phase C / Impl)

**Input:**
```json
{ "event": "create", "taskRunId": "2026-04-29-002",
  "spec": { "title": "ログイン画面バリデーション追加", "taskType": "Impl",
            "priority": "P2", "phase": "C", "specRef": "ADR-0010" } }
```

**Asana operations:**
1. `asana_create_task(name="[Impl] ログイン画面バリデーション追加", notes="Spec: ADR-0010\ntaskRunId: 2026-04-29-002\nrepo: pm-orchestrator-runner\n", projects=[1214289977522742])` → gid X
2. `asana_add_task_to_section(1214338125749479 /* Phase C */, X)`
3. `asana_add_task_to_section(1214370576492665 /* Active Sprint */, X)`
4. `asana_add_tag_to_task(<P2 tag gid>, X)`
5. `asana_create_task_story("🟡 taskRun 作成 ...")`

### Example 3: complete

**Input:**
```json
{ "event": "complete", "taskRunId": "2026-04-29-001",
  "finalReport": { "summary": "B-016 fix 完了", "prUrl": "https://github.com/.../pull/123", "commitSha": "abc1234" } }
```

**Asana operations (each binding):**
1. `asana_get_task` → 現 notes 取得
2. notes に "PR: https://github.com/.../pull/123" を append → `asana_update_task`
3. `asana_add_task_to_section(1214344784545305 /* Done */, taskGid)` → Active Sprint から自動離脱
4. `asana_create_task_story("🟢 完了: B-016 fix 完了\nPR: ...\nCommit: abc1234")`
5. binding.closedAt / closeReason="complete" を記録

## 受け入れ基準 (AC-41-1 〜 AC-41-15)

`docs/spec/41_ASANA_PROGRESS_HOOK.md` §8 に対応。Spec-First-TDD 準拠で実装する場合、各 AC を Red テストとして先に書くこと。

| AC | 内容 |
|----|------|
| AC-41-1 | adopt ハッピーパス: 既存タスクが Active Sprint へ、homePhase 保存 |
| AC-41-2 | create with full spec: 9 フィールド全充填でタスク作成 + 全 section/tag が正しく |
| AC-41-3 | create with partial spec: priority/phase 欠落時にタグ/section 付与を skip |
| AC-41-4 | complete → Done 移動 + Active Sprint から自動離脱 |
| AC-41-5 | complete 連続呼び出しの冪等性: 同 PR URL を 2 回送っても notes に重複しない |
| AC-41-6 | RATE_LIMIT 時の指数バックオフ (1/2/4/8s) |
| AC-41-7 | MCP_UNAVAILABLE 時の縮退: PM Orchestrator メイン処理を停めない |
| AC-41-8 | 多対多バインディング: 1 taskRun が複数 Asana タスクに同時バインド可 |
| AC-41-9 | resume での前回履歴復元 (直近 5 stories から要約) |
| AC-41-10 | notes prefix `Spec:` の append (重複防止) |
| AC-41-11 | existing-task lookup (gid 直指定) → そのまま adopt |
| AC-41-12 | existing-task lookup (B-NNN マッチ) → asana_search_tasks で gid 解決 → adopt |
| AC-41-13 | existing-task lookup (B-NNN マッチ無し) → create にフォールバック |
| AC-41-14 | adopt/progress で Active Sprint 移動 + homePhase 保存 |
| AC-41-15 | complete 時 Active Sprint から外れて Done のみに到達 (abandon の場合は homePhase へ) |

## Integration Points

- **入力元**: pm-orchestrator (event 起動), session-manager (asana-task-map.md gid 解決)
- **出力先**: pm-orchestrator (SyncOutput 返却), session JSON (asanaBindings 永続化)
- **副作用**: Asana プロジェクト 1214289977522742 の section 配置と story タイムライン

## v1.0.0 → v2.0.0 移行ノート

旧 v1.0.0 (汎用 ClickUp/Asana create/comment/update) は廃止。Asana 専用の event-driven 契約に置き換わった。ClickUp 連携が必要な場合は別 skill (`task-tracker-sync-clickup`) として分離する方針 (現時点で実装予定なし)。
