# PM Orchestrator Runner Specification Index

本ディレクトリは、PM Orchestrator Runner の公式仕様を構成する
すべての仕様ドキュメントの一覧および位置づけを定義する。

ここに記載されていない仕様は正式仕様ではない。
記載順序は論理依存関係を示す。

---

## 基本仕様（Execution / Core）

00_INDEX.md

- 本ファイル。仕様体系全体のインデックスおよび位置づけ定義。

01_OVERVIEW.md

- システム全体の目的、設計思想、fail-closed モデルの概要。

02_ARCHITECTURE.md

- なぜこの設計になっているかの背景説明。
- 便利さよりも正当性・検証可能性を優先する理由。

03_LIFECYCLE.md

- 7 フェーズライフサイクルの厳密定義。
- フェーズ順序、遷移条件、省略禁止ルール。

04_COMPONENTS.md

- 主要コンポーネント（Runner Core / CLI / Managers / Pools 等）の責務定義。
- 実行主体および境界の定義。

05_CLI.md
05_DATA_MODELS.md

※ 05_CLI.md と 05_DATA_MODELS.md は同一レベルの基礎仕様である。

- 05_DATA_MODELS.md は Runner が生成・解釈・検証する
  すべてのデータ構造の意味論的基盤を定義する。
- 05_CLI.md は それらのデータ構造を前提として
  ユーザー入力を Runner Core に接続するインターフェースを定義する。

両者は相互依存関係にあり、上下関係は存在しない。

05_CLI.md

- CLI インターフェース仕様。
- 非対話コマンド（start / continue / status / validate）の定義。
- 対話型 REPL モード（pm-orchestrator repl）のエントリ定義。
- CLI から Runner Core へのマッピングルール。

05_DATA_MODELS.md

- Runner が生成・保持・通信する
  すべてのデータ構造の正確な定義。
- Session / Task / Evidence / ExecutionResult などの
  構造、必須フィールド、意味を固定する。
- ReplConfig（project_mode, project_root, print_project_path）。
- TaskLog の verification_root, verified_files フィールド。
- 本仕様に記載されていない
  フィールドの追加・省略・再解釈は禁止される。

06_CORRECTNESS_PROPERTIES.md

- システムが必ず満たすべき正当性プロパティ（Property 1–33）。
- 実装・テストの最終判断基準。
- Property 23: Provider and Model Configuration Control
- Property 24: API Key Secrecy
- Property 25: Log Visibility Control
- Property 30: Task ID Cross-Reference Display
- Property 31: Verified Files Detection
- Property 32: Non-Volatile Project Root（揮発性問題の解決）
- Property 33: Verified Files Traceability（検証済みファイル追跡）

07_ERROR_HANDLING.md

- エラーコード体系（E1xx–E5xx）と fail-closed 原則。

08_TESTING_STRATEGY.md

- テスト戦略、TDD 要件、Property-based test の最低要件。

09_TRACEABILITY.md

- Evidence、Trace、検証可能性の関係定義。

---

## 追加仕様（UX Extension）

10_REPL_UX.md

- REPL-first UX（対話型実行環境）の追加仕様。
- Claude Code / Codex と同等の使用感を提供するための UX レイヤー定義。
- プロジェクトモード（--project-mode, --project-root, --print-project-path）。
- 非対話モード（heredoc / pipe / stdin script）でのファイル検証。
- **既存仕様（Lifecycle / Components / Properties / Error Handling）を一切変更しない。**
- REPL は Runner Core を呼び出すための入力 UI であり、新しい実行権限を持たない。

11_VIBE_CODING_ACCEPTANCE.md

- REPL および自然言語タスク実行が
  「実際に作業を行い、成果物を生成する」ことを保証する受入基準。
- vibe coding が成立するための最低限の実行要件・検証シナリオを定義する。
- **本ファイルは仕様追加ではなく、検証・受入（Acceptance）仕様である。**
- 既存仕様（Lifecycle / Properties / Error Handling / Evidence）を変更しない。

12_LLM_PROVIDER_AND_MODELS.md

- LLM Provider（claude-code / openai / anthropic）の管理仕様。
- Provider 別モデル一覧、料金表示フォーマット、選択 UI 仕様。
- Provider / Model の検証ルールおよび永続化仕様。
- Property 23 (Provider and Model Configuration Control) の詳細実装規則。

13_LOGGING_AND_OBSERVABILITY.md

- TaskLog の保存先、ファイル形式、保持期間。
- 2 階層ログ閲覧（タスク一覧 → タスク詳細）の UI 仕様。
- 可視性レベル（summary / full）の制御仕様。
- 機密データマスキングのパターンと適用タイミング。
- Verified Files Detection と verification_root。
- Property 25 (Log Visibility Control) の詳細実装規則。
- Property 32, 33 関連のログ記録仕様。

---

## 仕様適用ルール

- 00_INDEX.md〜09_TRACEABILITY.md は「実行仕様」である。
- 10_REPL_UX.md は「UX 追加仕様」であり、実行権限・判断主体を増やさない。
- 複数仕様間で矛盾がある場合、以下の優先順位を厳守する：

  1. 06_CORRECTNESS_PROPERTIES.md
  2. 03_LIFECYCLE.md
  3. 04_COMPONENTS.md
  4. その他の基本仕様
  5. 10_REPL_UX.md（UX 仕様）
  6. 12_LLM_PROVIDER_AND_MODELS.md（Provider/Model 仕様）
  7. 13_LOGGING_AND_OBSERVABILITY.md（ログ仕様）
  8. 11_VIBE_CODING_ACCEPTANCE.md（検証・受入仕様）

- 本インデックスに記載のない挙動は仕様外とし、fail-closed とする。
