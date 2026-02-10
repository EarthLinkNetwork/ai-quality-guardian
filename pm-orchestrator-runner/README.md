# PM Orchestrator Runner

**LLMの出力をそのまま信じない。検証して、直させて、証跡を残す。**

> Don't trust LLM output blindly. Verify it, make it fix itself, and keep evidence.

---

## What is This?

Claude Code などの LLM ツールは、大きなタスクで省略・早期完了しがち。
**PM Orchestrator Runner** は LLM の上に被せる **LLM Layer** で、品質を機械的に矯正する。

```
User
  │
  v
PM Orchestrator Runner (LLM Layer)
  ├── Review Loop: PASS/REJECT/RETRY/ESCALATE
  ├── Task Chunking: 大きいタスクを自動分割
  ├── Conversation Trace: 全往復をJSONL保存
  ├── Mandatory Rules: 省略禁止・証跡必須を自動注入
  │
  v
Claude Code / LLM API
```

---

## Core Features

### Review Loop - 品質検証の自動化

| 判定 | 意味 |
|------|------|
| **PASS** | Q1-Q6 全て合格。タスク完了。 |
| **REJECT** | 品質基準未達。修正指示を自動生成して再実行。 |
| **RETRY** | 一時的エラー。リトライ。 |
| **ESCALATE** | max_iterations 到達。人間にエスカレ。 |

**Q1-Q6 品質基準:**
- Q1: ファイル存在（File Existence）
- Q2: TODO/FIXME 不在（No Incomplete Markers）
- Q3: 省略マーカー不在（No Omission: `...`, `// 残り省略` 等）
- Q4: 構文エラー不在（No Syntax Errors）
- Q5: 証跡出力（Evidence Output）
- Q6: 早期終了不在（No Early Termination）

### Task Chunking - 大規模タスクの分割

大きなタスクを自動で分割し、並列/逐次実行。依存関係を考慮。

### Conversation Trace - セルフヒーリングの証跡

全ての LLM 往復を JSONL 形式で記録。REJECT → RETRY → PASS のセルフヒーリングを事後検証可能。

**記録されるイベント:**
- `USER_REQUEST`: ユーザーからの元リクエスト
- `LLM_REQUEST` / `LLM_RESPONSE`: LLM との往復
- `QUALITY_JUDGMENT`: 品質判定結果
- `REJECTION_DETAILS`: REJECT の詳細理由
- `FINAL_SUMMARY`: 最終結果サマリー

---

## Quickstart

### 1. Install

```bash
npm install -g pm-orchestrator-runner
```

### 2. API Key Setup

初回起動時に API Key 入力フローが開始されます。

**方法A: 環境変数（推奨）**
```bash
export OPENAI_API_KEY=sk-...
# または
export ANTHROPIC_API_KEY=sk-ant-...
```

**方法B: 対話式セットアップ**
```bash
pm
# → API Key Setup が開始
# → [1] OpenAI / [2] Anthropic を選択
# → API Key を入力
```

**方法C: REPL内で設定**
```bash
pm --no-auth  # API Key なしで起動
/keys set openai sk-...
```

### 3. Start REPL

```bash
pm
# または
pm --project /path/to/project
```

### 4. Submit Task

```bash
pm> /start
Enter task: READMEを作成して

# タスクが Review Loop に投入される
# Q1-Q6 で検証 → REJECT なら自動修正指示 → PASS まで繰り返し
```

### 5. Check Status

```bash
pm> /tasks
# タスク一覧を表示

pm> /logs 1
# タスク #1 のログを表示

pm> /trace 1
# タスク #1 の会話トレース（セルフヒーリング証跡）を表示
```

### 6. AWAITING_RESPONSE への対応

タスクが `AWAITING_RESPONSE`（LLM からの質問待ち）状態のとき:

```bash
pm> /respond 1 はい、その方針で進めてください
# タスク #1 に回答を送信して継続
```

---

## Web UI

REPL と同一キュー（同一 namespace）で動作する Web UI を起動できます。

### Start Web UI

```bash
pm web --port 5678
# または namespace 指定
pm web --port 5678 --namespace stable
```

### Verify

```bash
# Health check
curl http://localhost:5678/api/health

# Submit task via API
curl -X POST http://localhost:5678/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"task_group_id":"test","prompt":"hello world"}'

# View task groups
curl http://localhost:5678/api/task-groups

# View conversation trace
curl http://localhost:5678/api/tasks/<task_id>/trace
```

### REPL + Web 同時利用

```bash
# Terminal 1: Web UI
pm web --port 5678 --namespace stable

# Terminal 2: REPL (同一 namespace)
pm --namespace stable

# 両方から同じキューを操作可能
```

---

## Trace（証跡の確認）

セルフヒーリング（REJECT → RETRY → PASS）が本当に起きたことを確認する方法:

### REPL から

```bash
pm> /trace 1
# または
pm> /trace 1 --latest   # 最新イテレーションのみ
pm> /trace 1 --raw      # 生 JSONL データ
```

### Web API から

```bash
curl http://localhost:5678/api/tasks/<task_id>/trace
curl http://localhost:5678/api/tasks/<task_id>/trace?latest=true
```

### 出力例

```
=== SELF-HEAL EVIDENCE TRACE ===
[2026-01-23T10:15:32] USER_REQUEST: Implement add function
[2026-01-23T10:15:32] LLM_REQUEST[0]: (prompt sent)
[2026-01-23T10:15:33] LLM_RESPONSE[0]: function add(a, b) { /* TODO */ }
[2026-01-23T10:15:33] QUALITY_JUDGMENT[0]: REJECT (Q2: TODO marker detected)
[2026-01-23T10:15:33] REJECTION_DETAILS[0]: Please remove TODO markers...
[2026-01-23T10:15:34] LLM_REQUEST[1]: (retry prompt sent)
[2026-01-23T10:15:35] LLM_RESPONSE[1]: function add(a, b) { return a + b; }
[2026-01-23T10:15:35] QUALITY_JUDGMENT[1]: PASS
[2026-01-23T10:15:35] FINAL_SUMMARY: PASS (2 iterations)
=== END TRACE ===
```

詳細: [docs/EVIDENCE_SELF_HEAL_CONVERSATION.md](docs/EVIDENCE_SELF_HEAL_CONVERSATION.md)

---

## P0 Completion Declaration Rules

P0/P1 の完了宣言は固定フォーマットに従う。違反は gate:spec で FAIL。

```
verdict:       PASS | FAIL
violations:    <number>
sessionCount:  <number>
staleFiltered: <number>
totalChunks:   <number>
evidencePath:  <path to JSON evidence>
```

**Rules:**
- 上記 6 キーが全て揃っていなければ FAIL
- `evidencePath` のファイルが存在しなければ FAIL
- AWAITING_RESPONSE は trigger → reply → resume → COMPLETE の機械実行証拠が必須
- 曖昧表現（"たぶん", "かもしれない", "probably", "maybe"）を含む完了レポートは FAIL
- 手順・レポートはコードブロックで提示（コードブロック外の手順提示は禁止）

詳細: [docs/spec/P0_RUNTIME_GUARANTEE.md](docs/spec/P0_RUNTIME_GUARANTEE.md)

---

## Why This Exists

Claude Code などの LLM ツールは:
- 大きなタスクで **省略** しがち（`...`, `// 残り省略`）
- **早期完了** を宣言しがち（「これで完了です」）
- **TODO/FIXME** を残しがち

これを **機械的に矯正** するのが LLM Layer の役割:
- 省略マーカー検出 → REJECT → 「全て出力せよ」と修正指示
- 早期終了検出 → REJECT → 「Runner が完了を判定する」と修正指示
- TODO/FIXME 検出 → REJECT → 「完全な実装を提供せよ」と修正指示

**人間が毎回チェックする代わりに、機械がチェックする。**

---

## Safety / Fail-Closed

| 状況 | 判定 |
|------|------|
| API Key 未設定 | 起動時に入力フローを強制 |
| 証跡なし（Evidence なし） | REJECT |
| 省略マーカー検出 | REJECT |
| TODO/FIXME 検出 | REJECT |
| 早期終了宣言 | REJECT |
| max_iterations 到達 | ESCALATE（人間にエスカレ） |

**不明な場合は安全側に倒す（Fail-Closed）。**

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `pm` | Start interactive REPL (default) |
| `pm repl` | Start interactive REPL |
| `pm web` | Start Web UI server |
| `pm web-stop` | Stop background Web UI |
| `pm start <path>` | Start a new session |
| `pm continue <id>` | Continue a session |
| `pm status <id>` | Get session status |
| `pm validate <path>` | Validate project structure |

### REPL Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/start` | Start a new task |
| `/tasks` | List all tasks |
| `/logs [#]` | Show task logs |
| `/trace [#]` | Show conversation trace |
| `/respond [#] <message>` | Respond to AWAITING_RESPONSE |
| `/keys` | Manage API keys |
| `/exit` | Exit REPL |

---

## Requirements

- Node.js >= 18.0.0
- API Key (OpenAI or Anthropic) or Claude Code CLI

---

## License

MIT
