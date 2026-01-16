# 05_CLI.md

## 1. 目的

本ドキュメントは、PM Orchestrator Runner の CLI インターフェース仕様を定義する。

CLI は Runner への唯一のユーザー入力窓口であり、以下を提供する。

- 非対話コマンド（start / continue / status / validate）
- 対話型 REPL モードのエントリ（repl）

CLI は入力を Runner Core に委譲し、ライフサイクル・正当性判定・出力制御・証跡整合性を変更してはならない。

---

## 2. コマンド一覧

CLI が提供するコマンドは以下のみとする。

- pm-orchestrator start
- pm-orchestrator continue <session-id>
- pm-orchestrator status <session-id>
- pm-orchestrator validate
- pm-orchestrator repl

これ以外のコマンドは未知コマンドとして ERROR とする（fail-closed）。

---

## 3. 共通オプション

### 3.1 --project <path>

--project フラグが指定された場合、そのパスを対象プロジェクトとして絶対的に使用する。

- --project が指定された場合、他のすべての推論や補完よりも優先される
- --project が指定されない場合、現在の作業ディレクトリを対象プロジェクトとする

Project Resolution Rules の詳細は 04_COMPONENTS.md に完全準拠する。

---

## 4. Project Resolution Rules（CLI 適用）

CLI は Runner Core に処理を委譲する前に、対象プロジェクト解決を行う。

- --project が指定された場合、そのパスを対象プロジェクトとする
- --project が指定されない場合、カレントディレクトリを対象プロジェクトとする
- 親ディレクトリへの探索は禁止する
- グローバル設定の参照は禁止する
- エラーメッセージは不足しているパスを明示的に示さなければならない

### 4.1 .claude の扱い（重要）

CLI の Project Resolution は「対象ディレクトリの決定」までを責務とする。

- validate コマンドは .claude の存在を必須要件として検証する（5.4 参照）
- repl コマンドは .claude の有無に応じて、REPL 側仕様（10_REPL_UX.md）に従い挙動を分岐する
  - 例: init-only mode / fail-closed / 起動時検証など
- start/continue/status は Runner Core 側の正当性判定・fail-closed に従う（CLI は独自判断しない）

---

## 5. 非対話コマンド仕様

### 5.1 pm-orchestrator start

目的  
新しい実行セッションを開始する。

処理

- Project Resolution Rules により対象プロジェクトを確定する
- Runner Core の start(projectPath) を呼ぶ

出力

- ExecutionResult を返す

---

### 5.2 pm-orchestrator continue <session-id>

目的  
既存セッションを継続する。

処理

- Runner Core の continue(sessionId) を呼ぶ

エラー

- session-id が欠落している場合は ERROR
- 存在しない session-id の場合は ERROR

---

### 5.3 pm-orchestrator status <session-id>

目的  
指定セッションの状態を取得する。

処理

- Runner Core の status(sessionId) を呼ぶ

エラー

- session-id が欠落している場合は ERROR
- 存在しない session-id の場合は ERROR

---

### 5.4 pm-orchestrator validate

目的  
プロジェクト構造のみを検証し、実行は行わない。

処理

- Project Resolution Rules により対象プロジェクトを確定する
- Runner Core の validate(projectPath) を呼ぶ

期待動作（例）

- .claude が存在しない場合は INVALID を返す（exit code は仕様に従い非ゼロ）
- .claude が存在しても必須ファイルが不足している場合は INVALID を返す
- VALID の場合のみ success を返す

---

## 6. 対話型 REPL モード

### 6.1 pm-orchestrator repl

目的  
対話型入力環境（REPL UX）を起動する。

処理

- Project Resolution Rules により対象プロジェクトを確定する
- REPL ループを開始する

REPL の入力規則、スラッシュコマンド、出力制約、fail-closed、証跡、Runner Core へのマッピングは 10_REPL_UX.md に完全準拠する。

---

## 7. Runner Core へのマッピング

CLI と Runner Core の対応関係は以下に固定される。

- start -> RunnerCore.start(projectPath)
- continue -> RunnerCore.continue(sessionId)
- status -> RunnerCore.status(sessionId)
- validate -> RunnerCore.validate(projectPath)
- repl -> REPL ループ（10_REPL_UX.md に従う）

---

## 8. 出力およびエラーの原則

- CLI は Runner Core の返却結果を改変してはならない
- エラーは隠蔽してはならない
- fail-closed を維持しなければならない
- エラーコード体系は 07_ERROR_HANDLING.md に準拠する

---

## 9. 非目標

本仕様は以下を定義しない。

- REPL の詳細挙動（10_REPL_UX.md の責務）
- ライフサイクル定義の変更
- 正当性プロパティの変更
- 外部サービス設定や課金管理（Warp レイヤーの具体仕様は別ドキュメントで定義する）
