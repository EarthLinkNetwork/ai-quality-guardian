# Spec-42: session-manager Asana Bootstrap (skill v0.2.0 — Asana 由来コンテキスト復元フェーズ)

- Status: Design (Spec-First-TDD; 実装は Phase C-Asana-2 で着手)
- Owners: pm-orchestrator-runner team
- Asana タスク: `1214356975323412` ([Spec] session-manager: Asana bootstrap 設計, Phase B, P1)
- Related ADRs:
  - [ADR-0007: session-manager Asana Bootstrap (新セッション開始時の Asana 由来コンテキスト復元)](../adr/0007-session-manager-asana-bootstrap.md) — 本 spec の Decision/Context source
  - [ADR-0006: Asana Progress Sync on Free Plan](../adr/0006-asana-progress-sync-on-free-plan.md) — taskRun ↔ Asana バインディング前提
- Related Specs:
  - [Spec-41: Asana Progress Hook (task-tracker-sync v0.2.0)](./41_ASANA_PROGRESS_HOOK.md) — resume イベントの input 仕様 (AC-41-9 を含む)
- Related skills (実装ターゲット):
  - 実装先: `pm-orchestrator/templates/.claude/skills/session-manager.md` (新規作成、Rule 15 配布対象)
  - 既存ローカル開発用: `.claude/skills/session-manager.md` v1.0.0 (本 spec では touch しない)

## 1. 目的

新セッション開始時に Asana の `My Tasks (running)` を自動照会し、ユーザーに「続きをやるか / 新タスクとして開始するか」を提示する `asana-bootstrap` フェーズを `session-manager` skill v0.2.0 として定義する。bootstrap の出力 (`BootstrapResult`) を pm-orchestrator が受け取り、task-tracker-sync の `adopt` / `resume` / 通常 `create` を分岐起動する仕組みを成立させる。

## 2. スコープ

### 含む
- `session-manager` skill v0.2.0 の `asana-bootstrap` フェーズ仕様
- Asana MCP (`mcp__asana__*`) 経由で My Tasks を query する手順
- ユーザー明示参照 (URL / gid / B-NNN / ADR-NNNN / Spec-NN) の検出ロジック (ADR-0006 Decision 3-1 / 3-2 と同等規約)
- user prompt のフロー (TUI 想定、Web UI 対応は後続 Phase D-Asana-2)
- `BootstrapResult` の出力契約と pm-orchestrator 側の分岐責務
- session JSON `meta.asanaBootstrap` への書き戻し
- MCP 不在時 / timeout 時のフォールバック動作

### 含まない
- task-tracker-sync v0.2.0 の lifecycle 動作 (Spec-41 で別途定義)
- Asana custom field 利用 (Free プランで利用不可、ADR-0006 で確定)
- Levenshtein 類似度マッチング (ADR-0006 Decision 3-3 で v0.2.0 では off)
- Web UI での bootstrap user prompt 実装 (本 spec は責務契約のみ、UI は実装フェーズで具体化)
- `.claude/skills/session-manager.md` (v1.0.0) の改修 (Rule 15 によりローカル開発用は触らない)
- ClickUp 対応 (本 spec は Asana 専用)

## 3. 用語

| 用語 | 定義 |
|------|------|
| **bootstrap** | session-manager が新 session 開始時に行う Asana コンテキスト同期処理 |
| **BootstrapResult** | bootstrap が pm-orchestrator に返す judgment 結果 (mode 5 種) |
| **My Tasks** | Asana の "current user に assign された未完了タスク" の集合 |
| **explicit-reference** | ユーザー入力に Asana URL / gid / B-NNN 等が含まれる状態 |
| **resume-candidate** | 過去に taskRun が走っていた Asana タスクで、ユーザーが「続き」と確認したもの |
| **previous taskRunId** | 過去の taskRun を識別する `YYYY-MM-DD-NNN` 形式の ID。Asana stories に埋め込まれている |

## 4. データ構造

### 4.1 BootstrapResult (出力)

```typescript
type BootstrapResult =
  | { mode: "skipped";
      reason: "mcp-unavailable" | "explicit-skip" | "session-continuing" | "test-env" }
  | { mode: "new-task";
      reason: "no-my-tasks" | "user-declined" }
  | { mode: "explicit-reference";
      asanaTaskGid: string;
      asanaTaskUrl: string;
      title: string;
      homePhase: string;
      homeSectionGid: string;
      previousTaskRunId: string | null;
      lastEventLabel: "🟡 taskRun 開始 (adopt)" | "🟡 taskRun 作成" | "🔵 ステップ完了"
                     | "🟢 完了" | "🔴 中断" | "🔄 taskRun 再開" | null;
      detectedBy: "url" | "gid" | "id-tag" }
  | { mode: "resume-candidate";
      asanaTaskGid: string;
      asanaTaskUrl: string;
      title: string;
      homePhase: string;
      homeSectionGid: string;
      previousTaskRunId: string | null;
      lastEventLabel: string | null;
      offeredCandidates: Array<{ gid: string; title: string; lastModifiedAt: string }>;
      userChoiceIndex: number;
      userPromptDurationMs: number };
```

### 4.2 session JSON 拡張

`.claude/sessions/<sessionId>.json` の `meta` セクションに追加:

```jsonc
{
  "sessionId": "session-2026-04-29-abc123",
  "createdAt": "2026-04-29T12:34:56Z",
  "meta": {
    "asanaBootstrap": {
      "ranAt": "2026-04-29T12:34:56Z",
      "result": { /* BootstrapResult */ },
      "warnings": [
        "Asana MCP responded with 429, retried 2 times (succeeded on 3rd)"
      ],
      "userPromptShown": true,
      "userPromptDurationMs": 1820,
      "myTasksFetched": 7,
      "myTasksDisplayed": 5
    },
    "bootstrapWarnings": [
      "Asana MCP unreachable on initial connect, retried"
    ]
  },
  "runs": [{
    "taskRunId": "2026-04-29-001",
    "meta": {
      "asanaBindings": [/* ADR-0006/Spec-41 で定義 */]
    }
  }]
}
```

`asanaBootstrap` は session スコープで 1 回だけ書き込まれる (再 bootstrap は行わない、Decision 4)。

### 4.3 環境変数 / フラグ

| 名前 | 型 | デフォルト | 効果 |
|------|----|-----------|------|
| `PM_SKIP_ASANA_BOOTSTRAP` | "1" or unset | unset | 1 のとき bootstrap 全体を skip。`mode: "skipped", reason: "explicit-skip"` を返す |
| `PM_ASANA_BOOTSTRAP_TIMEOUT_MS` | number | 5000 | user prompt の timeout (ms) |
| `PM_ASANA_BOOTSTRAP_MAX_TASKS` | number | 10 | My Tasks の取得上限 |
| `PM_ASANA_BOOTSTRAP_DISPLAY_LIMIT` | number | 5 | UI に表示する件数 (超過分は "+N more") |

## 5. インターフェース

### 5.1 session-manager skill 入力

pm-orchestrator が session-manager を起動するときの入力 (既存 v1.0.0 と互換):

```typescript
type SessionManagerInput = {
  userPrompt: string;            // 直近のユーザー入力 (raw)
  hookOutput?: string;           // user-prompt-submit.sh 出力 (空の場合あり)
  projectConfig: ProjectConfig;  // .claude/project-config.json
  cwd: string;                   // current working directory
  // v0.2.0 で追加 (optional, 未指定なら .claude/sessions/ から自動推定)
  forceSessionId?: string;
  forceTaskRunId?: string;
};

type ProjectConfig = {
  taskTracker: {
    provider: "asana" | "clickup" | "none";
    projectId?: string;
    workspaceId?: string;
    mcpServerName?: string;      // 例: "asana"
  };
  // ... (既存フィールド省略)
};
```

### 5.2 session-manager skill 出力

```typescript
type SessionManagerOutput = {
  sessionId: string;
  taskRunId: string;
  isNewSession: boolean;
  isNewTaskRun: boolean;
  continuationMode: "new_task" | "same_task" | "unknown";  // 既存 v1.0.0
  // v0.2.0 で追加
  asanaBootstrap: BootstrapResult;
  // 既存 v1.0.0 の他フィールド
  meta: { /* ... */ };
};
```

`asanaBootstrap` は **常に** 出力する (skipped でも)。pm-orchestrator は `mode` を見て分岐する。

### 5.3 Asana MCP 呼び出しマッピング

| 操作 | Asana MCP tool | 用途 / 備考 |
|------|----------------|-------------|
| 接続疎通確認 | `mcp__asana__asana_list_workspaces` | bootstrap [1] で 1 回呼ぶ。3 sec timeout |
| My Tasks 取得 | `mcp__asana__asana_search_tasks` | params: `workspace=<workspaceId>, assignee.any=me, completed=false, sort_by=modified_at, sort_ascending=false, limit=<MAX_TASKS>` |
| story 取得 | `mcp__asana__asana_get_stories_for_task` | resume 候補の前回 taskRunId 解決 (Step [5])。limit=10 |
| task 詳細取得 | `mcp__asana__asana_get_task` | explicit-reference のとき、gid から title/section を解決 |

### 5.4 user prompt の責務契約

session-manager は **prompt 文字列を返す** だけ。実際の入出力 (TUI / Web UI / Claude Code inline) は呼び出し元 (pm-orchestrator または Web UI runner) の責務。

```typescript
type UserPromptRequest = {
  kind: "asana-bootstrap-choice";
  message: string;               // 表示する prompt 全文 (markdown)
  candidates: Array<{
    index: number;                 // 1-based
    label: string;                 // "[Bug] B-016: タスク分解時の注入..."
    asanaTaskGid: string;
    asanaTaskUrl: string;
    homePhase: string;
    lastModifiedAt: string;
  }>;
  defaultIndex: number;           // タイムアウト時のデフォルト = "None of the above" のインデックス
  timeoutMs: number;              // Decision 5 で 5000
};

type UserPromptResponse = {
  chosenIndex: number;            // 1-based。0 は "None of the above"
  durationMs: number;
  timedOut: boolean;
};
```

## 6. シーケンス

### 6.1 ハッピーパス: My Tasks 取得 → ユーザーが [1] を選ぶ → resume

```
[新セッション開始]
   ↓
[session-manager v0.2.0] processing flow 開始
   ↓
[1] sessionId 払い出し (session-2026-04-29-abc123)
   ↓
[2] session JSON 不在を確認 → bootstrap 実行条件を満たす
   ↓
[3] asana-bootstrap [1]: mcp__asana__asana_list_workspaces で疎通確認 → OK
   ↓
[4] asana-bootstrap [2]: mcp__asana__asana_search_tasks で My Tasks 取得
       → 7 件取得、modified_at desc sort
   ↓
[5] asana-bootstrap [3]: ユーザー入力 "B-016 の続きをやって" を解析
       → "B-016" 検出 → asana-task-map.md grep → gid 1214356816544961
       → mode: "explicit-reference" として step [4] (user prompt) を skip
   ↓
[6] asana-bootstrap [5]: get_stories_for_task(gid=...) で stories 取得 (limit=10)
       → 最新 story から regex で previousTaskRunId="2026-04-28-003" を解決
       → lastEventLabel = "🔴 中断"
   ↓
[7] BootstrapResult を構築:
       { mode: "explicit-reference", asanaTaskGid: "1214356816544961", ...,
         previousTaskRunId: "2026-04-28-003", lastEventLabel: "🔴 中断", detectedBy: "id-tag" }
   ↓
[8] taskRunId 払い出し (2026-04-29-001)
   ↓
[9] session JSON を初期化、meta.asanaBootstrap を書き込み
   ↓
[10] SessionManagerOutput を pm-orchestrator に返却
   ↓
[pm-orchestrator] mode==="explicit-reference" → task-tracker-sync.adopt を発行
   または "🔴 中断" だったら → task-tracker-sync.resume を発行 (前回 abandon の続き)
```

### 6.2 ハッピーパス: My Tasks 取得 → ユーザーが [1] を選ぶ → resume (明示参照なし)

```
[新セッション開始, ユーザー入力 "前回の続きをやって"]
   ↓
[session-manager v0.2.0]
   ↓
asana-bootstrap [1] 疎通 OK
asana-bootstrap [2] My Tasks 5 件取得
asana-bootstrap [3] 明示参照なし (B-NNN, gid, URL 全て不検出)
   ↓
asana-bootstrap [4] user prompt 表示:
   ```
   Asana の進行中タスク (直近修正順):
   [1] [Bug] B-016: タスク分解時の注入テキスト... (Phase A, P0, 2026-04-28)
   [2] [Refactor] dynamo-dal: 11 TODO migration markers... (Phase E, P1, 2026-04-27)
   [3] [Spec] session-manager: Asana bootstrap 設計 (Phase B, P1, 2026-04-29)
   [4] [Test] task-log-lifecycle: 3 historical bug reproductions... (Phase D, P2, 2026-04-26)
   [5] [Impl] B-001: WebSocket Real-time Updates (Phase C, P2, 2026-04-25)
   [0] None of the above (新タスクとして開始)
   どれを続けますか? (5 sec で [0] にデフォルト)
   ```
   ↓
[ユーザー] "1" と入力 (1820ms 後)
   ↓
asana-bootstrap [5] get_stories_for_task(B-016 gid) → previousTaskRunId="2026-04-28-003" 解決
   ↓
BootstrapResult: { mode: "resume-candidate", asanaTaskGid: ..., previousTaskRunId: "2026-04-28-003",
                   userChoiceIndex: 1, userPromptDurationMs: 1820, ... }
   ↓
[pm-orchestrator] mode==="resume-candidate" → task-tracker-sync.resume を発行
```

### 6.3 ユーザー declined: My Tasks 表示するが [0] を選ぶ

```
asana-bootstrap [4] user prompt 表示
   ↓
[ユーザー] "0" 入力 (980ms)
   ↓
BootstrapResult: { mode: "new-task", reason: "user-declined" }
   ↓
[pm-orchestrator] 通常の new_task フロー
   - existing-task lookup (ADR-0006 Decision 3) → no match
   - task-tracker-sync.create を発行
```

### 6.4 Timeout: 5 sec 経過、ユーザー無応答

```
asana-bootstrap [4] user prompt 表示
   ↓
[5 sec 経過] timeout
   ↓
BootstrapResult: { mode: "new-task", reason: "user-declined" }
   (timedOut=true は内部的に記録、ただし mode 上は user-declined と同等)
   ↓
[pm-orchestrator] 通常の new_task フロー
```

### 6.5 MCP 不在: skipped

```
asana-bootstrap [1] mcp__asana__asana_list_workspaces を呼ぶ → MCP_UNAVAILABLE
   ↓
warning ログ "Asana MCP unreachable: <error>" を session JSON.meta.bootstrapWarnings[] に追加
   ↓
BootstrapResult: { mode: "skipped", reason: "mcp-unavailable" }
   ↓
[pm-orchestrator] mode==="skipped" → 通常の new_task フロー (Asana なしで継続)
```

### 6.6 PM_SKIP_ASANA_BOOTSTRAP=1: skipped

```
asana-bootstrap が起動する直前に env チェック
   ↓
BootstrapResult: { mode: "skipped", reason: "explicit-skip" }
   ↓
[pm-orchestrator] mode==="skipped" → 通常の new_task フロー
```

### 6.7 既存 session 継続: bootstrap skip

```
[既存 session の継続入力]
   ↓
[session-manager] session JSON 既存を確認、runs[].closedAt 未設定の run あり
   ↓
continuation 判定 (既存 v1.0.0 ロジック) で same_task or new_task 判定
   ↓
asana-bootstrap は skip (mode: "skipped", reason: "session-continuing")
   ↓
[pm-orchestrator] 既存 binding (asanaBindings[]) をそのまま使う
```

### 6.8 完了済タスクへの resume 警告

```
asana-bootstrap [5] で lastEventLabel = "🟢 完了" を検出
   ↓
user prompt 拡張版を表示:
   "選択 [1] [Bug] B-016 は既に完了しています (2026-04-28 に🟢 完了)。
    本当に resume しますか? (y/n, 5 sec で n)"
   ↓
ユーザー "n" → mode: "new-task", reason: "user-declined" として再判定 (offer から外す)
ユーザー "y" → mode: "resume-candidate" のまま、warnings[] に "resuming completed task" を追記
```

## 7. 受け入れ基準 (AC)

### AC-42-1: bootstrap が Asana MCP 不在時に skipped を返す

- 前提: `mcp__asana__asana_list_workspaces` が `MCP_UNAVAILABLE` を返す
- 期待: `BootstrapResult.mode === "skipped"`, `reason === "mcp-unavailable"`, session JSON.meta.bootstrapWarnings に entry 追加, sessionId/taskRunId は通常払い出される

### AC-42-2: bootstrap が PM_SKIP_ASANA_BOOTSTRAP=1 で skipped を返す

- 前提: 環境変数 `PM_SKIP_ASANA_BOOTSTRAP=1`
- 期待: MCP 接続を試みない, `mode === "skipped"`, `reason === "explicit-skip"`

### AC-42-3: bootstrap が既存 session 継続時に skipped を返す

- 前提: session JSON が存在し runs[].closedAt 未設定の run が 1 件以上ある
- 期待: `mode === "skipped"`, `reason === "session-continuing"`, 既存 continuationMode 判定が動作

### AC-42-4: explicit-reference (URL) を解決して prompt skip

- 前提: ユーザー入力に `https://app.asana.com/.../task/1214356816544961` を含む
- 期待: user prompt を出さない, `mode === "explicit-reference"`, `detectedBy === "url"`, asanaTaskGid 一致, previousTaskRunId は stories から解決

### AC-42-5: explicit-reference (B-NNN id-tag) を解決して prompt skip

- 前提: ユーザー入力に "B-016 の続き" を含み、`asana-task-map.md` に B-016 が登録されている
- 期待: `mode === "explicit-reference"`, `detectedBy === "id-tag"`, asanaTaskGid 一致

### AC-42-6: explicit-reference (gid 直指定) を解決して prompt skip

- 前提: ユーザー入力に "asana://1214356816544961" または "gid: 1214356816544961" を含む
- 期待: `mode === "explicit-reference"`, `detectedBy === "gid"`

### AC-42-7: My Tasks 取得 → ユーザーが候補 [1] を選ぶ → resume-candidate

- 前提: My Tasks に 5 件あり、ユーザーが応答 "1" を 1820ms で返す
- 期待: `mode === "resume-candidate"`, `userChoiceIndex === 1`, `userPromptDurationMs === 1820`, 該当タスクの previousTaskRunId が stories から解決される

### AC-42-8: My Tasks 取得 → ユーザーが [0] を選ぶ → new-task (declined)

- 前提: My Tasks 5 件、ユーザー応答 "0"
- 期待: `mode === "new-task"`, `reason === "user-declined"`

### AC-42-9: user prompt の timeout で new-task に倒れる

- 前提: My Tasks 5 件、ユーザー応答なし、5 sec timeout
- 期待: `mode === "new-task"`, `reason === "user-declined"` (timedOut の事実は session JSON.meta.asanaBootstrap.userPromptShown=false で記録)

### AC-42-10: My Tasks が 0 件 → new-task に倒れる (prompt skip)

- 前提: assignee=current_user の未完了タスクが 0 件
- 期待: user prompt を出さない, `mode === "new-task"`, `reason === "no-my-tasks"`

### AC-42-11: My Tasks が DISPLAY_LIMIT を超える場合の "+N more" 表示

- 前提: My Tasks 12 件、`PM_ASANA_BOOTSTRAP_DISPLAY_LIMIT=5`
- 期待: prompt に上位 5 件 + "+7 more" を表示, candidates 配列は 5 件のみ含む

### AC-42-12: 完了済タスクへの resume 確認ダイアログ

- 前提: ユーザーが選んだタスクの最新 story が "🟢 完了"
- 期待: 確認 prompt が表示される, "y" で resume-candidate, "n" で new-task (user-declined)

### AC-42-13: previousTaskRunId 解決失敗 (stories に taskRunId なし)

- 前提: stories は取れたが正規表現にマッチする `taskRunId: YYYY-MM-DD-NNN` が無い
- 期待: `mode === "resume-candidate"`, `previousTaskRunId === null`, lastEventLabel は取得できれば設定 (なければ null)
- pm-orchestrator 側の挙動: previousTaskRunId が null の場合 resume を adopt にダウングレードする (Spec-41 §10 のフォールバック方針と整合)

### AC-42-14: rate limit 時の再試行

- 前提: `mcp__asana__asana_search_tasks` が 429 を 2 回返してから 200
- 期待: 指数バックオフ (1s → 2s) で 3 回目に成功, warnings[] に "search_tasks retried 2 times" 追加, bootstrap 全体は成功

### AC-42-15: bootstrap が session JSON に書き戻される

- 前提: 任意の bootstrap 実行
- 期待: session JSON.meta.asanaBootstrap が記録される。再度同 sessionId で session-manager を呼んでも bootstrap は再実行されない (ranAt が既存 → skip)

### AC-42-16: SessionManagerOutput.asanaBootstrap が常に存在する

- 前提: 任意の処理経路
- 期待: SessionManagerOutput.asanaBootstrap は undefined にならない (skipped でも mode フィールドあり)

### AC-42-17: project config の taskTracker.provider !== "asana" 時の挙動

- 前提: `.claude/project-config.json` の `taskTracker.provider` が "clickup" または "none"
- 期待: bootstrap 起動せず, `mode === "skipped"`, `reason === "explicit-skip"` (provider 不一致を explicit-skip 扱い)

### AC-42-18: 後方互換性 — session-manager v1.0.0 を呼んでいる既存 caller の挙動

- 前提: pm-orchestrator (古いバージョン) が SessionManagerOutput.asanaBootstrap を読まない
- 期待: 既存フィールド (sessionId, taskRunId, continuationMode 等) はすべて v1.0.0 と同じ意味で出力される (フィールド追加のみ、削除/変更なし)

## 8. テスト計画 (Spec-First-TDD)

| AC | テスト種別 | ファイル候補 |
|----|------------|--------------|
| AC-42-1, AC-42-2, AC-42-3 | unit (mock MCP, mock fs) | `test/unit/skills/session-manager/bootstrap-skip.test.ts` |
| AC-42-4, AC-42-5, AC-42-6 | unit (mock MCP) | `test/unit/skills/session-manager/explicit-reference.test.ts` |
| AC-42-7, AC-42-8, AC-42-9, AC-42-10, AC-42-11 | unit (mock MCP, mock prompt) | `test/unit/skills/session-manager/my-tasks-prompt.test.ts` |
| AC-42-12 | unit (mock MCP, mock prompt) | `test/unit/skills/session-manager/completed-task-confirm.test.ts` |
| AC-42-13 | unit (mock MCP) | `test/unit/skills/session-manager/previous-taskrunid-resolve.test.ts` |
| AC-42-14 | unit (mock MCP with retry) | `test/unit/skills/session-manager/rate-limit-retry.test.ts` |
| AC-42-15, AC-42-16 | unit (mock fs) | `test/unit/skills/session-manager/session-json-writeback.test.ts` |
| AC-42-17 | unit (project-config variants) | `test/unit/skills/session-manager/provider-gate.test.ts` |
| AC-42-18 | unit (interface invariants) | `test/unit/skills/session-manager/v1-compat.test.ts` |
| **integration** | session-manager + task-tracker-sync の連動 | `test/integration/session-manager-asana-resume.test.ts` (Spec-41 AC-41-9 と同居) |

E2E は Asana 本番に副作用が出るため、Spec-41 と同じく `ASANA_TEST_PROJECT_GID` env で切り替え、CI default skip。

### Spec-41 AC-41-9 との相互依存

Spec-41 AC-41-9 は「session B で taskRun X を resume → 🔄 story 投稿」の検証。本 spec の bootstrap が `previousTaskRunId` と `asanaTaskGid` を解決した結果を pm-orchestrator が `task-tracker-sync.resume` に渡す経路があって初めて成立する。よって:

- Spec-41 AC-41-9 の test fixture は `BootstrapResult.mode === "resume-candidate"` で構成する
- Spec-42 AC-42-7 の test fixture は task-tracker-sync の resume を mock し、bootstrap までで切る (responsibility 分離)

## 9. エラーハンドリング

| 状況 | 動作 | session JSON 影響 |
|------|------|-------------------|
| Asana MCP 未接続 (list_workspaces 失敗) | `mode: "skipped", reason: "mcp-unavailable"` | meta.bootstrapWarnings にエラー記録 |
| search_tasks 失敗 (rate limit) | 指数バックオフ最大 4 回, 失敗時は `mode: "skipped"` | warnings 記録 |
| search_tasks 失敗 (permission/403) | 即時 `mode: "skipped", reason: "mcp-unavailable"` | warnings 記録 (token 確認案内を含む) |
| asana-task-map.md 不在 (B-NNN マッチ用) | id-tag 解決を skip, URL/gid のみ評価 | warnings 記録 |
| get_stories_for_task 失敗 | previousTaskRunId=null, lastEventLabel=null で続行 | warnings 記録 |
| user prompt UI 不在 (caller が pop-up を実装していない) | timeout 動作と同じ (`mode: "new-task", reason: "user-declined"`) | userPromptShown=false |
| session JSON 書き込み失敗 (fs error) | bootstrap 結果は返すが warnings に "session JSON write failed" | (書き込めない) |

**原則**: bootstrap の失敗で session-manager 全体を止めない。sessionId/taskRunId の払い出しは bootstrap と独立に成功する。

## 10. パフォーマンス予算

| 操作 | 目標レイテンシ | 備考 |
|------|----------------|------|
| MCP 疎通確認 (list_workspaces) | < 1 sec (P95) | timeout 3 sec で打ち切り |
| My Tasks 取得 (search_tasks) | < 2 sec (P95) | limit=10, sort_by=modified_at |
| stories 取得 (get_stories_for_task) | < 1.5 sec (P95) | limit=10, candidate 1 件のみ呼ぶ |
| user prompt 表示〜応答 | < 5 sec (timeout) | デフォルト 5 sec、env 変数で override 可 |
| bootstrap 全体 (P95) | < 5 sec (skipped 時) / < 10 sec (resume-candidate 時) | user prompt 含む場合は user 応答待ちが支配的 |

P95 を超えても warning ログのみ (失敗扱いしない)。

## 11. 後方互換性

- session-manager v1.0.0 の output schema は **そのまま** v0.2.0 でも維持。`asanaBootstrap` フィールドが追加されるのみ
- session JSON v1.0.0 形式の既存ファイルは `meta.asanaBootstrap === undefined` として読まれ、bootstrap が必要なら新規実行 (`AC-42-15` の "ranAt 既存→skip" 判定は undefined なら false)
- `taskTracker.provider !== "asana"` の project では bootstrap 起動せず、v1.0.0 と完全同等動作 (AC-42-17)
- 環境変数 `PM_SKIP_ASANA_BOOTSTRAP=1` で v1.0.0 動作にダウングレード可能
- 既存 `.claude/skills/session-manager.md` (v1.0.0, ローカル開発用) は touch しない。v0.2.0 の実装は `pm-orchestrator/templates/.claude/skills/session-manager.md` (新規作成) にのみ反映する (Rule 15)

## 12. 依存関係

```
[Spec-42 (本 spec)]
  ├─ depends on: ADR-0007 (本 spec の Decision/Context source)
  ├─ depends on: ADR-0006 (Free プランフォールバック規約 + existing-task lookup)
  ├─ depends on: Spec-41 (resume イベントの input 仕様)
  ├─ depends on: asana-task-map.md (B-NNN id-tag 解決元)
  └─ depends on: project-config.json schema (taskTracker.provider)

[Spec-42 を blocking する spec]
  └─ なし (Spec-42 は Spec-41 AC-41-9 の前提を提供する側)

[Spec-42 が blocking する後続作業]
  ├─ Phase C-Asana-2: session-manager v0.2.0 実装 (Spec-42 を input として TDD)
  └─ Phase C-Asana-3: pm-orchestrator が BootstrapResult.mode で分岐するロジック実装
```

## 13. 未解決事項 / 将来課題

- **user prompt UI の具体形**: TUI / Web UI / Claude Code inline のどれで実装するかは Phase D-Asana-2 で決定。本 spec は「prompt 文字列を返し、応答を受け取る」という責務契約のみ定義
- **asana-task-map.md と My Tasks の差分検出**: My Tasks には map.md に未登録のタスクがある可能性 (人間が Asana Web UI で直接追加した場合)。bootstrap で「map.md にないタスクを検出したら警告 → 追記提案」する機能は将来拡張
- **複数 workspace 対応**: 現状 1 workspace 固定 (`81767308277002`)。複数 org 対応は ADR-0006 と同じく project-config の `taskTracker.workspaces[]` 配列対応で別途
- **bootstrap キャッシュ**: My Tasks のキャッシュ (TTL 5 min) を導入すると同 session 内での再 bootstrap (例: 別ブランチ作業に切り替え) を高速化できる。本 spec では「session 内 1 回のみ」と定めているが、緩和も検討余地
- **完了済タスクへの resume 警告の閾値**: 現状 lastEventLabel === "🟢 完了" でのみ確認ダイアログ。いつ完了したか (例: 30 日以内 vs それ以前) で警告強度を変える等の拡張余地

## 14. 実装メモ (Phase C-Asana-2 向け)

実装フェーズで本 spec を input として TDD する際の注意:

1. 実装先は **`pm-orchestrator/templates/.claude/skills/session-manager.md`** (Rule 15 配布対象)。このパスは現状不在のため、初回実装時に新規作成する
2. 既存の `.claude/skills/session-manager.md` (v1.0.0, ローカル開発用) は **触らない**
3. テストは `pm-orchestrator-runner/test/unit/skills/session-manager/` 配下に新規作成 (現状 v1.0.0 用テストが `pm-orchestrator-runner/test/unit/session/session-manager.test.ts` にある)
4. Asana MCP 呼び出しは全て mock 化、E2E は別 project gid で
5. user prompt の I/O 抽象は `UserPromptPort` interface として注入する設計を推奨 (テスト容易性のため)
6. `BootstrapResult` は discriminated union のため、TypeScript の type narrowing で全 mode を網羅 (`switch (result.mode)` の exhaustiveness check を活用)
7. AC-42-1 〜 AC-42-18 を RED テストとして全て先に書き、GREEN にする順序で実装

## 15. 参照

- `pm-orchestrator-runner/docs/adr/0007-session-manager-asana-bootstrap.md` (本 spec の ADR)
- `pm-orchestrator-runner/docs/adr/0006-asana-progress-sync-on-free-plan.md`
- `pm-orchestrator-runner/docs/spec/41_ASANA_PROGRESS_HOOK.md`
- `pm-orchestrator-runner/docs/plans/asana-task-map.md` (Asana タスク台帳, section/tag gid 解決元)
- `.claude/skills/session-manager.md` v1.0.0 (現状のローカル開発用 skill, 本 spec では touch しない)
- `.claude/project-config.json` (taskTracker.provider=asana, workspaceId=81767308277002, projectId=1214289977522742)
- `.mcp.json` (project-level Asana MCP 登録)
