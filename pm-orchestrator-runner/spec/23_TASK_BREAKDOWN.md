# 23_TASK_BREAKDOWN.md

# タスク分解（必須順）

本章は実装タスクの分解と順序を定義する。


## Task 1: API Key / env sanitize 実装

- child_process 起動時の env 制御
- 削除対象環境変数の除去
- 起動時チェック（Claude Code CLI 存在確認、ログイン確認）
- 起動時表示の実装

参照: 15_API_KEY_ENV_SANITIZE.md


## Task 2: Session / Task Group / Task モデル実装

- Session データ構造の永続化
- Task Group データ構造の実装
- Task データ構造の拡張
- 再起動時の復元機能

参照: 05_DATA_MODELS.md, 16_TASK_GROUP.md


## Task 3: Prompt テンプレート結合機構実装

- 5段階の prompt 結合
- 設定ファイルからの読み込み
- task group prelude の動的生成

参照: 17_PROMPT_TEMPLATE.md


## Task 4: CLI 2ペイン UI 実装

- 上部ペイン（ログ表示）
- 下部ペイン（入力専用）
- 入力中のログ割り込み防止
- 実行中表示（1行ステータス）
- 完了時表示

参照: 18_CLI_TWO_PANE.md


## Task 5: Queue Store (DynamoDB Local) 実装

- DynamoDB Local 接続
- Queue Item スキーマ実装
- Polling 機構
- 二重実行防止

参照: 20_QUEUE_STORE.md


## Task 6: Web UI (ngrok 前提) 実装

- Task Group 一覧画面
- Task 一覧画面
- Task ログ閲覧画面
- 新規命令投入フォーム

参照: 19_WEB_UI.md


## Task 7: stable / dev 構成整理

- ディレクトリ構成
- バージョン管理
- stable から dev への開発フロー

参照: 21_STABLE_DEV.md


## Task 8: 受入基準 E2E テスト実装

- 8つの受入基準をテストとして実装
- 全テストが通ることを確認

参照: 22_ACCEPTANCE_CRITERIA_STRICT.md
