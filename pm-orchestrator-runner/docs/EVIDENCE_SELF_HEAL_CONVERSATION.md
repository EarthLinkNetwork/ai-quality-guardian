# Self-Heal Conversation Trace 実機証跡

## 概要

このドキュメントは pm-orchestrator-runner の Conversation Trace 機能の動作証跡を記録します。
REJECT → RETRY → PASS のセルフヒーリングフローを会話ログとして記録し、事後分析を可能にします。

- **作成日**: 2026-01-23
- **仕様参照**: `spec/28_CONVERSATION_TRACE.md`
- **テスト実行環境**: Node.js + Mocha

## 機能概要

### Conversation Trace とは

Review Loop / Task Chunking 実行時の全ての往復（LLM リクエスト/レスポンス、品質判定結果）を
JSONL形式で記録し、以下を実現します:

1. **セルフヒーリングの証跡**: REJECT → RETRY → PASS フローを完全に追跡可能
2. **事後分析**: タスク失敗時の原因調査
3. **デバッグ支援**: 品質判定の詳細を確認

### トレースイベント種別

| イベント | 説明 |
|---------|------|
| `USER_REQUEST` | ユーザーからの元のリクエスト |
| `SYSTEM_RULES` | 適用された品質基準 (Q1-Q6) |
| `CHUNKING_PLAN` | タスク分割計画 (Task Chunking時) |
| `LLM_REQUEST` | LLMへのプロンプト |
| `LLM_RESPONSE` | LLMからのレスポンス |
| `QUALITY_JUDGMENT` | 品質判定結果 (PASS/REJECT/RETRY) |
| `REJECTION_DETAILS` | REJECTの詳細理由 |
| `ITERATION_END` | イテレーション終了 |
| `FINAL_SUMMARY` | 最終結果サマリー |

## テスト結果サマリー

### Self-Heal Conversation Trace テスト

```
Self-Heal Conversation Trace Integration Tests
  REJECT → RETRY → PASS Flow with Trace
    ✔ should record REJECT judgment and retry in conversation trace
    ✔ should record full REJECT→RETRY→PASS sequence in trace
    ✔ should record ESCALATE when max iterations reached

  Trace File Operations
    ✔ should find trace files by task ID
    ✔ should get latest trace file
    ✔ should format trace for display
    ✔ should format trace with latestOnly option

  Evidence Structure Verification
    ✔ should produce trace that proves self-healing capability
```

## セルフヒーリングフロー例

### シナリオ: TODO マーカー検出 → 修正 → 成功

```
=== SELF-HEAL EVIDENCE TRACE ===

[2026-01-23T10:15:32.001Z] USER_REQUEST
  Session: test-session-001
  Task: test-task-001
  Data: {
    "request": "Implement add function"
  }

[2026-01-23T10:15:32.002Z] SYSTEM_RULES
  Session: test-session-001
  Task: test-task-001
  Data: {
    "rules": [
      "Q1: File must exist and have content",
      "Q2: No TODO/FIXME markers allowed",
      "Q3: No code omissions",
      "Q4: Complete implementation required"
    ]
  }

[2026-01-23T10:15:32.100Z] QUALITY_JUDGMENT
  Session: test-session-001
  Task: test-task-001
  Iteration: 1
  Data: {
    "passed": false,
    "reason": "Q2 failed: TODO marker detected in output"
  }

[2026-01-23T10:15:32.101Z] REJECTION_DETAILS
  Session: test-session-001
  Task: test-task-001
  Iteration: 1
  Data: {
    "failed_checks": ["Q2: TODO marker detected"],
    "modification_hint": "Remove all TODO markers and provide complete implementation"
  }

[2026-01-23T10:15:32.102Z] ITERATION_END
  Session: test-session-001
  Task: test-task-001
  Iteration: 1
  Data: {
    "status": "REJECT",
    "summary": "Retry needed due to Q2 failure"
  }

[2026-01-23T10:15:32.200Z] QUALITY_JUDGMENT
  Session: test-session-001
  Task: test-task-001
  Iteration: 2
  Data: {
    "passed": true,
    "reason": "All quality checks passed"
  }

[2026-01-23T10:15:32.201Z] ITERATION_END
  Session: test-session-001
  Task: test-task-001
  Iteration: 2
  Data: {
    "status": "PASS",
    "summary": "Quality criteria satisfied"
  }

[2026-01-23T10:15:32.300Z] FINAL_SUMMARY
  Session: test-session-001
  Task: test-task-001
  Data: {
    "status": "PASS",
    "message": "Self-healing succeeded after 2 iteration(s)"
  }

=== END TRACE ===
```

## REPL コマンドによるトレース確認

```bash
# タスクのトレースを表示
/trace <task-id>

# 最新イテレーションのみ表示
/trace <task-id> --latest

# 生のJSONLデータを表示
/trace <task-id> --raw

# タスク番号で指定（REPL内で自動マッピング）
/trace 1
```

### 出力例

```
--- Conversation Trace for task-001 ---

[10:15:32] USER_REQUEST
  Request: "Implement add function"

[10:15:32] SYSTEM_RULES
  Applied rules: Q1, Q2, Q3, Q4

[10:15:32] QUALITY_JUDGMENT (Iteration 1)
  Result: REJECT
  Reason: Q2 failed - TODO marker detected

[10:15:32] QUALITY_JUDGMENT (Iteration 2)
  Result: PASS
  Reason: All checks passed

[10:15:32] FINAL_SUMMARY
  Status: PASS
  Message: Self-healing succeeded after 2 iteration(s)

---
```

## Web API によるトレース取得

### エンドポイント

```
GET /api/tasks/:task_id/trace
```

### クエリパラメータ

| パラメータ | 説明 |
|-----------|------|
| `latest=true` | 最新イテレーションのみ |
| `raw=true` | 生のJSONLエントリを返す |

### レスポンス例

```json
{
  "task_id": "task-001",
  "trace_file": "/state/traces/conversation-task-001-20260123.jsonl",
  "summary": {
    "total_iterations": 2,
    "judgments": [
      { "iteration": 1, "passed": false, "reason": "Q2 failed" },
      { "iteration": 2, "passed": true, "reason": "All passed" }
    ],
    "final_status": "PASS"
  },
  "formatted": "..."
}
```

## トレースファイル形式

### 保存場所

```
<state_dir>/traces/conversation-<task_id>-<timestamp>.jsonl
```

### JSONL エントリ形式

```json
{"timestamp":"2026-01-23T10:15:32.001Z","event":"USER_REQUEST","session_id":"session-001","task_id":"task-001","data":{"request":"..."}}
{"timestamp":"2026-01-23T10:15:32.002Z","event":"SYSTEM_RULES","session_id":"session-001","task_id":"task-001","data":{"rules":[...]}}
{"timestamp":"2026-01-23T10:15:32.100Z","event":"QUALITY_JUDGMENT","session_id":"session-001","task_id":"task-001","iteration_index":0,"data":{"passed":false,"reason":"..."}}
```

## コマンドによる証跡再現

```bash
# 自己改善トレーステストの実行
pnpm test -- --grep "Self-Heal Conversation Trace"

# トレースファイル操作テスト
pnpm test -- --grep "Trace File Operations"

# 証跡構造検証テスト
pnpm test -- --grep "Evidence Structure Verification"
```

## ファイル参照

- **統合テスト**: `test/integration/self-heal-conversation-trace.test.ts`
- **ConversationTracer 実装**: `src/trace/conversation-tracer.ts`
- **REPL /trace コマンド**: `src/repl/commands/trace.ts`
- **Web API トレースエンドポイント**: `src/web/server.ts`
- **仕様書**: `spec/28_CONVERSATION_TRACE.md`

## セルフヒーリング能力の証明

この Conversation Trace 機能により、以下が証明されます:

1. **検出能力**: 品質問題を自動検出 (Q1-Q6 チェック)
2. **修正能力**: REJECT 時に自動リトライで修正を試みる
3. **成功収束**: 多くの場合、リトライにより成功に収束
4. **完全な追跡性**: 全てのフローがトレースログに記録され、事後検証可能

```
User Request → Quality Check (REJECT) → Retry → Quality Check (PASS) → Success
     ↓              ↓                    ↓              ↓              ↓
  [Logged]       [Logged]            [Logged]       [Logged]       [Logged]
```
