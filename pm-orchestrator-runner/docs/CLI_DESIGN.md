# PM Orchestrator Runner - CLI 設計メモ

## 概要

`pm-orchestrator-runner` は Claude Code の実行を制御するCLIツール。
タスクキュー管理、自動質問解決、Web UI を備えた統合オーケストレーター。

## アーキテクチャ

```
pm (bin entry)
 |
 +-- repl      対話モード (デフォルト)
 +-- web       Web UI サーバー + キューポーラー
 +-- web-stop  バックグラウンドサーバー停止
 +-- selftest  AI ジャッジ付きセルフテスト
 +-- start     セッション開始
 +-- continue  セッション再開
 +-- status    セッション状態取得
 +-- validate  プロジェクト構造バリデーション
```

## コアモジュール構成

| ディレクトリ | 責務 |
|---|---|
| `src/cli/` | CLIエントリポイント、引数パース |
| `src/repl/` | REPL インターフェース、スラッシュコマンド |
| `src/web/` | Express Web サーバー、REST API、静的ファイル配信 |
| `src/queue/` | タスクキュー (DynamoDB / File / InMemory) |
| `src/executor/` | Claude Code 実行、自動質問解決、タイムアウト管理 |
| `src/core/` | RunnerCore (セッション・ライフサイクル管理) |
| `src/config/` | Namespace 設定、グローバル設定 |
| `src/keys/` | API キーオンボーディング |
| `src/diagnostics/` | Preflight チェック、ゲート検証 |
| `src/selftest/` | AI ジャッジ付きセルフテスト |

## CLI エントリフロー

```
process.argv
  -> コマンド判定 (repl | web | web-stop | selftest | start | ...)
  -> 引数パース (parseReplArgs / parseWebArgs / ...)
  -> Namespace 設定構築 (buildNamespaceConfig)
  -> 実行
```

## 主要な設計判断

### 1. キューストア 3層構成

- **FileQueueStore** (デフォルト): JSON ファイルベース。永続。ローカル開発向き。
- **QueueStore (DynamoDB)**: クラウド向け永続ストア。`docker-compose up -d dynamodb` で Local も可。
- **InMemoryQueueStore**: 非永続。テスト・セルフテスト用。

選択優先度: CLI フラグ > 環境変数 (`PM_WEB_STORE_MODE`) > デフォルト (`file`)

### 2. AutoResolvingExecutor

Claude Code が質問を返した場合、LLM が自動回答して再実行する。
Web UI のようなヘッドレス環境で人間の介入なしにタスクを完了させるための機構。

- 最大2回のリトライ
- Progress-aware タイムアウト (出力がある間はタイムアウトをリセット)

### 3. TaskType による完了判定分岐

| TaskType | INCOMPLETE 時の挙動 |
|---|---|
| READ_INFO / REPORT | 出力があれば COMPLETE 扱い |
| IMPLEMENTATION 等 | 出力に質問があれば AWAITING_RESPONSE、なければ ERROR |

### 4. Namespace によるステート分離

`--namespace stable` / `--namespace dev` で状態ディレクトリ・ポートを分離。
同一マシン上で複数インスタンスを安全に並行実行可能。

### 5. Preflight Check

サーバー起動前に Executor の設定を検証 (Claude Code CLI / API キー)。
設定不備は起動時に即失敗させ、タイムアウトで気づくことを防止。

## Web UI API エンドポイント (主要)

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| POST | `/api/tasks` | タスク投入 |
| GET | `/api/task-groups` | タスクグループ一覧 |
| GET | `/api/tasks/:id` | タスク詳細取得 |

## コマンド一覧と引数

### 共通オプション

| オプション | 短縮 | 説明 |
|---|---|---|
| `--help` | `-h` | ヘルプメッセージを表示して終了 |
| `--version` | `-v` | バージョン番号を表示して終了 |

---

### `pm repl` — 対話モード（デフォルト）

コマンドなしで `pm` を実行した場合もこのモードで起動する。

```bash
pm                                         # デフォルト起動
pm repl --project ./my-project             # プロジェクト指定
pm repl --namespace stable --port 5680     # namespace + ポート指定
pm --no-auth                               # API Key 不要モード
```

#### 引数

| オプション | 短縮 | 型 | デフォルト | 説明 |
|---|---|---|---|---|
| `--project <path>` | `-p` | string | カレントディレクトリ | プロジェクトのルートパス |
| `--evidence <path>` | `-e` | string | `<stateDir>/evidence` | 証跡ファイルの出力ディレクトリ |
| `--provider <name>` | — | string | (API Key に依存) | API プロバイダー。`openai` / `anthropic` / `claude-code` のいずれか |
| `--no-auth` | — | flag | — | API Key オンボーディングをスキップ。Claude Code CLI のみ使用。`--provider claude-code` を暗黙的に設定 |
| `--non-interactive` | — | flag | — | 非対話モード。TTY プロンプトを出さない。パイプ入力向き |
| `--exit-on-eof` | — | flag | — | EOF 受信時にプロセスを終了する（パイプ入力用） |
| `--project-mode <mode>` | — | string | `temp` | プロジェクトモード。`temp`（一時ディレクトリ）または `fixed`（固定ディレクトリ） |
| `--project-root <path>` | — | string | — | 検証用ルートディレクトリ。`--project-mode=fixed` 時に必須 |
| `--print-project-path` | — | flag | — | 起動時に `PROJECT_PATH=<path>` を stdout に出力 |
| `--namespace <name>` | — | string | `default` | ステート分離用の namespace。例: `stable`, `dev`, `test-1` |
| `--port <number>` | — | number | namespace に依存 | Web UI ポート。`default`/`stable` は 5678、`dev` は 5679 |

#### provider の選択基準

| provider | 必要な認証 | 用途 |
|---|---|---|
| `openai` | `OPENAI_API_KEY` 環境変数 | OpenAI API 経由の実行 |
| `anthropic` | `ANTHROPIC_API_KEY` 環境変数 | Anthropic API 経由の実行 |
| `claude-code` | Claude Code CLI ログイン済み | Claude Code CLI 経由の実行 |

---

### `pm web` — Web UI サーバー

タスクキューを管理する Web UI サーバーを起動する。REST API + 静的ファイル配信。

```bash
pm web --port 5678                         # フォアグラウンド起動
pm web --port 5678 --background            # バックグラウンド起動
pm web --namespace dev --dynamodb           # DynamoDB ストア使用
pm web --in-memory                          # 非永続（メモリのみ）
```

#### 引数

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `--port <number>` | number | 5678 | Web UI の待ち受けポート |
| `--namespace <name>` | string | `default` | ステート分離用の namespace |
| `--background` | flag | — | バックグラウンド（デタッチ）モードで起動。PID ファイルを生成 |
| `--dynamodb` | flag | — | DynamoDB をキューストアとして使用。未接続時は file にフォールバック |
| `--in-memory` | flag | — | インメモリキューストアを使用（非永続。テスト・デモ用） |
| `--no-dynamodb` | flag | — | (レガシー) `--in-memory` と同義 |

#### キューストアの選択優先度

1. CLI フラグ (`--dynamodb` / `--in-memory`)
2. 環境変数 `PM_WEB_STORE_MODE` (`dynamodb` / `file` / `memory`)
3. レガシー環境変数 (`PM_WEB_DYNAMODB=1` / `PM_WEB_NO_DYNAMODB=1`)
4. デフォルト: `file`（JSON ファイルベース永続ストア）

#### 関連環境変数

| 変数 | 説明 |
|---|---|
| `PM_WEB_STORE_MODE` | キューストアモード (`file` / `dynamodb` / `memory`) |
| `PM_WEB_ALLOW_PREFLIGHT_FAIL` | `1` で preflight 失敗時もサーバーを起動（ポーラーは無効） |
| `PM_E2E_STATE_DIR` | E2E テスト用のステートディレクトリオーバーライド |
| `PM_AUTO_SELFTEST` | `true` でサーバー起動後にセルフテストを自動実行して終了 |

---

### `pm web-stop` — バックグラウンドサーバー停止

`pm web --background` で起動したサーバープロセスを停止する。

```bash
pm web-stop                                # default namespace を停止
pm web-stop --namespace stable             # 指定 namespace を停止
```

#### 引数

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `--namespace <name>` | string | `default` | 停止対象の namespace |

#### 終了コード

| コード | 意味 |
|---|---|
| 0 | 正常停止 |
| 1 | PID ファイルが見つからない（サーバーが起動していない） |
| 2 | SIGTERM で停止せず SIGKILL で強制終了した |

---

### `pm selftest` — セルフテスト

AI Judge による品質自己検証を実行する。InMemoryQueueStore を使用して隔離環境で実行。

```bash
pm selftest                                # フル実行（全シナリオ）
pm selftest --ci                           # CI モード（短縮版：2シナリオ）
```

#### 引数

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `--ci` | flag | — | CI モード。テストシナリオを2件に絞って実行時間を短縮 |

#### 出力

- `selftest-report-*.json` — JSON 形式のレポート
- `selftest-report-*.md` — Markdown 形式のレポート

---

### `pm start <path>` — セッション開始

指定プロジェクトパスで新しいセッションを開始する。

```bash
pm start ./my-project
pm start ./my-project --dry-run
pm start ./my-project --config ./config.yml
```

#### 引数

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `<path>` (位置引数) | string | 必須 | プロジェクトのルートパス |
| `--config <path>` | string | — | YAML 設定ファイルのパス |
| `--output <path>` | string | — | 結果出力先のファイルパス |
| `--verbose` | flag | — | 詳細出力モード |
| `--quiet` | flag | — | 最小出力モード |
| `--dry-run` | flag | — | 実際に実行せずバリデーションのみ行う |
| `--stream` | flag | — | ストリーミング出力 |
| `--format <fmt>` | string | `json` | 出力形式。`json` または `compact` |
| `--max-files <n>` | number | — | 処理する最大ファイル数 |
| `--max-tests <n>` | number | — | 実行する最大テスト数 |
| `--max-seconds <n>` | number | — | タイムアウト秒数 |

---

### `pm continue <session-id>` — セッション再開

一時停止されたセッションを再開する。

```bash
pm continue session-2025-01-15-abc123
```

#### 引数

| オプション | 型 | 説明 |
|---|---|---|
| `<session-id>` (位置引数) | string | 再開するセッションの ID |

---

### `pm status <session-id>` — セッション状態取得

セッションの現在の状態を JSON 形式で取得する。

```bash
pm status session-2025-01-15-abc123
```

#### 引数

| オプション | 型 | 説明 |
|---|---|---|
| `<session-id>` (位置引数) | string | 状態を確認するセッションの ID |

---

### `pm validate <path>` — プロジェクト構造バリデーション

プロジェクトディレクトリの構造が PM Orchestrator Runner の要件を満たしているか検証する。

```bash
pm validate ./my-project
```

#### 引数

| オプション | 型 | 説明 |
|---|---|---|
| `<path>` (位置引数) | string | 検証するプロジェクトのルートパス |

---

### Namespace の命名規則

- 使用可能文字: 英小文字、数字、ハイフン (`a-z`, `0-9`, `-`)
- 先頭・末尾のハイフンは不可
- 連続ハイフンは不可
- 例: `default`, `stable`, `dev`, `test-1`, `feature-auth`

### Namespace とポートの自動マッピング

| Namespace | デフォルトポート |
|---|---|
| `default` / `stable` | 5678 |
| `dev` | 5679 |
| その他 | `--port` で明示指定が必要 |

---

## 技術スタック

- **言語**: TypeScript (Node.js >= 18)
- **ビルド**: tsc
- **テスト**: Mocha + Chai (単体/統合) / Playwright (E2E)
- **Web フレームワーク**: Express 5
- **CLI パース**: 手動パース (commander は依存にあるが CLI エントリは手動実装)
- **キュー永続化**: DynamoDB (AWS SDK v3) / JSON ファイル

## 開発コマンド

```bash
npm run build        # TypeScript ビルド
npm test             # 全テスト実行
npm run test:unit    # 単体テストのみ
npm run typecheck    # 型チェック
npm run lint         # ESLint
pm web --port 5678   # Web UI 起動
pm repl              # REPL 起動
```
