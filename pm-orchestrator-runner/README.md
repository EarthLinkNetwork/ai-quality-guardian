# PM Orchestrator Runner

**LLMの出力をそのまま信じない。検証して、直させて、証跡を残す。**

LLM の上に被せる品質矯正レイヤー。省略・TODO残し・早期完了を機械的に検出し、PASS するまで自動リトライさせる。

---

## 起動方法

### インストール

```bash
npm install -g pm-orchestrator-runner
```

### API Key 設定

```bash
# 方法A: 環境変数（推奨）
export OPENAI_API_KEY=sk-...
# または
export ANTHROPIC_API_KEY=sk-ant-...

# 方法B: 対話式（初回起動時に自動開始）
pm
```

### REPL モード

```bash
pm                              # カレントディレクトリで起動
pm --project /path/to/project   # プロジェクト指定
pm --namespace stable           # namespace 分離
pm --no-auth                    # API Key 不要（Claude Code CLI 使用）
```

REPL 内コマンド:

| コマンド | 説明 |
|---------|------|
| `/start` | 新規タスク投入 |
| `/tasks` | タスク一覧 |
| `/logs [#]` | タスクログ表示 |
| `/trace [#]` | 会話トレース（セルフヒーリング証跡） |
| `/respond [#] <msg>` | AWAITING_RESPONSE に回答 |
| `/keys` | API Key 管理 |
| `/exit` | 終了 |

### Web UI モード

```bash
pm web --port 5678                          # フォアグラウンド起動
pm web --port 5678 --background             # バックグラウンド起動
pm web --port 5678 --namespace stable       # namespace 指定
pm web-stop --namespace stable              # バックグラウンド停止
```

API 確認:

```bash
curl http://localhost:5678/api/health
curl http://localhost:5678/api/task-groups
curl -X POST http://localhost:5678/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"task_group_id":"test","prompt":"hello world"}'
```

REPL と Web UI は同一 namespace で同時利用可能。

### Selftest モード

```bash
pm selftest          # AI Judge による品質自己検証
pm selftest --ci     # CI 用（短縮版）
```

---

## 品質ルール (Q1-Q6)

タスク出力は以下の品質基準で自動検証される。1つでも不合格なら REJECT → 修正指示 → 再実行。

| ID | 基準 | REJECT 条件 |
|----|------|-------------|
| Q1 | File Existence | 参照ファイルが存在しない |
| Q2 | No Incomplete Markers | `TODO`, `FIXME` が残っている |
| Q3 | No Omission | `...`, `// 残り省略` 等の省略マーカー |
| Q4 | No Syntax Errors | 構文エラーがある |
| Q5 | Evidence Output | 証跡（実行結果）が出力されていない |
| Q6 | No Early Termination | LLM が勝手に「完了」を宣言 |

### Review Loop

```
タスク投入 → LLM実行 → Q1-Q6検証
                          ├─ PASS     → 完了
                          ├─ REJECT   → 修正指示を自動生成 → 再実行
                          ├─ RETRY    → 一時エラー → リトライ
                          └─ ESCALATE → max_iterations到達 → 人間にエスカレ
```

### Fail-Closed 原則

不明な場合は安全側に倒す。

| 状況 | 判定 |
|------|------|
| API Key 未設定 | 起動時に入力を強制 |
| 証跡なし | REJECT |
| 省略マーカー検出 | REJECT |
| TODO/FIXME 検出 | REJECT |
| 早期終了宣言 | REJECT |
| max_iterations 到達 | ESCALATE |

---

## P0 完了宣言フォーマット

完了レポートは以下のフォーマット必須。欠けていれば FAIL。

```
verdict:       PASS | FAIL
violations:    <number>
sessionCount:  <number>
staleFiltered: <number>
totalChunks:   <number>
evidencePath:  <path to JSON evidence>
```

曖昧表現（"たぶん", "maybe" 等）を含む完了レポートも FAIL。

---

## 開発

```bash
npm run build        # TypeScript ビルド
npm test             # 全テスト
npm run typecheck    # 型チェック
npm run lint         # Lint
npm run gate:all     # 全 gate チェック
```

## Requirements

- Node.js >= 18.0.0
- API Key (OpenAI or Anthropic) or Claude Code CLI

## License

MIT
