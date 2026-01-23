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
- プロジェクトモード（--project-mode cwd|temp|fixed, --project-root, --print-project-path）。
- **cwd モードがデフォルト**（カレントディレクトリをそのまま使用）。
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

## 自己開発仕様（Self-Development Extension）

14_GOAL_AND_SCOPE.md

- pm-orchestrator-runner の目的とスコープ定義。
- 自分自身を開発できる Claude Code Wrapper としての最初のゴール。
- Claude Code を「考えさせない」原則。

15_API_KEY_ENV_SANITIZE.md

- API Key 環境変数のサニタイズ仕様。
- child_process 起動時の env 制御（**ALLOWLIST 方式**）。
- 許可する環境変数のみを明示的に渡す（PATH, HOME, USER, SHELL 等）。
- **DELETELIST 方式の採用を禁止**（新規 API Key の漏洩リスク）。
- 起動時チェック（Claude Code CLI 存在確認、ログイン確認）。

16_TASK_GROUP.md

- Task Group（会話・思考・文脈の単位）の概念定義。
- Session → Task Group → Task の階層構造。
- **コンテキスト継承規則**（Task Group 内で継承されるもの、されないもの）。
- Task Group 内での文脈維持と会話継続。
- Task Group ライフサイクル（Created → Active ↔ Paused → Completed）。

17_PROMPT_TEMPLATE.md

- 5段階の Prompt 結合仕様。
- global prelude / project prelude / task group prelude / user input / output epilogue。
- 設定ファイルからの読み込みと動的生成。

18_CLI_TWO_PANE.md

- CLI 2ペイン UI 仕様。
- 上部ペイン（ログ表示）と下部ペイン（入力専用）の分離。
- 入力中のログ割り込み防止。
- 実行中・完了時の表示形式。

19_WEB_UI.md

- Web UI（Phase 1）仕様。
- **ngrok 運用手順**（起動、設定、セキュリティ考慮）。
- Task Group 一覧 / Task 一覧 / Task ログ閲覧 / 新規命令投入。
- Web UI は Queue Store を操作するだけ（Runner に直接命令しない）。

20_QUEUE_STORE.md

- Queue Store（DynamoDB Local）仕様。
- Queue Item スキーマと状態遷移。
- Polling 機構と二重実行防止。

21_STABLE_DEV.md

- stable / dev 構成仕様。
- stable runner が dev runner を開発する構造（**逆は禁止**）。
- **開発ワークフロー**（stable から dev を編集・テスト・ビルド）。
- **マージ手順**（dev 安定化後の stable 更新）。
- ディレクトリ構成、バージョン管理、状態管理。

22_ACCEPTANCE_CRITERIA_STRICT.md

- 8つの受入基準（STRICT）定義。
- **各基準に検証コマンド・自動テストコード例を明記**。
- API Key 漏洩防止（ALLOWLIST 検証）、CLI 入力保護、Task Group 文脈維持、
  Task 完了後の会話継続、Web UI 命令投入、状態復元、stable/dev 構成。
- 一括検証スクリプト（scripts/verify-acceptance-criteria.sh）。

23_TASK_BREAKDOWN.md

- 実装タスクの分解と順序定義。
- Task 1-8 の依存関係と参照先。

24_BASIC_PRINCIPLES.md

- 基本原則と禁止事項。
- Claude Code は「設計者」ではなく「作業者」。
- 仕様に書いていない判断の禁止。
- 曖昧な場合は FAIL とする原則。

---

## LLM レイヤー仕様（Self-Improvement Loop）

25_REVIEW_LOOP.md

- Review Loop（PASS/REJECT/RETRY 自動品質判定）仕様。
- Claude Code 出力の自動品質検証。
- REJECT 時の修正指示生成と再投入。
- イテレーション制御と履歴ログ。
- Fail-Closed 原則（判定不能 → REJECT）。

26_TASK_CHUNKING.md

- Task Chunking（自動タスク分割）仕様。
- 大きなタスクを N 個のサブタスクに自動分割。
- 並列/逐次実行モード。
- サブタスク毎の Auto-Retry 戦略。
- 全サブタスク完了まで親タスクは COMPLETE にならない。

28_CONVERSATION_TRACE.md

- Conversation Trace（会話トレース）仕様。
- LLM 往復・品質判定・修正フローを JSONL 形式で記録。
- セルフヒーリングの証跡を事後検証可能に。
- /trace コマンドと Web API で参照。

29_TASK_PLANNING.md

- Task Planning（タスク計画）仕様。
- サイズ推定（トークン数、ファイル数、複雑度）。
- チャンク判定（分割要否の決定）。
- 依存関係分析と実行計画生成。
- PLANNING_* トレースイベント。

30_RETRY_AND_RECOVERY.md

- Retry and Recovery（リトライ・リカバリー）仕様。
- 原因別リトライ戦略（INCOMPLETE, QUALITY_FAILURE, TIMEOUT 等）。
- バックオフ戦略（exponential, fixed, linear）。
- ESCALATE フロー（リトライ上限到達時の人間エスカレ）。
- 部分成功時のリカバリーメカニズム。

31_PROVIDER_MODEL_POLICY.md

- Provider/Model Policy（Provider/Model 切り替え）仕様。
- フェーズ別モデル選択（計画=安価、実装=標準、リトライ=高品質）。
- プロファイル設定（stable, cheap, fast）。
- 失敗時の自動エスカレーション。
- コスト追跡と上限管理。

---

## テンプレート・設定永続化仕様（Template & Settings Persistence）

32_TEMPLATE_INJECTION.md

- テンプレート自動差し込み仕様。
- ルール（Rules）と出力形式（Output Format）のテンプレート管理。
- 組み込みテンプレート（minimal, standard, strict）。
- TemplateStore API と遅延ロード。
- 注入タイミングと位置。

33_PROJECT_SETTINGS_PERSISTENCE.md

- プロジェクト設定永続化仕様。
- プロジェクト固有設定（テンプレート選択、LLM設定）の保存。
- 起動時復元フロー。
- ProjectSettingsStore API。
- グローバル設定との優先順位。

---

## 運用仕様（Operations）

99_RUNBOOK.md

- 運用手順書。
- 実行コマンド、トラブルシューティング、保守手順。

---

## 仕様適用ルール

- 00_INDEX.md〜09_TRACEABILITY.md は「実行仕様」である。
- 10_REPL_UX.md は「UX 追加仕様」であり、実行権限・判断主体を増やさない。
- 複数仕様間で矛盾がある場合、以下の優先順位を厳守する：

  1. 06_CORRECTNESS_PROPERTIES.md
  2. 03_LIFECYCLE.md
  3. 04_COMPONENTS.md
  4. その他の基本仕様（00-09）
  5. 24_BASIC_PRINCIPLES.md（基本原則）
  6. 14_GOAL_AND_SCOPE.md（目的とスコープ）
  7. 15_API_KEY_ENV_SANITIZE.md（API Key 仕様）
  8. 16_TASK_GROUP.md〜21_STABLE_DEV.md（自己開発仕様）
  9. 22_ACCEPTANCE_CRITERIA_STRICT.md（受入基準）
  10. 23_TASK_BREAKDOWN.md（タスク分解）
  11. 10_REPL_UX.md（UX 仕様）
  12. 12_LLM_PROVIDER_AND_MODELS.md（Provider/Model 仕様）
  13. 13_LOGGING_AND_OBSERVABILITY.md（ログ仕様）
  14. 11_VIBE_CODING_ACCEPTANCE.md（検証・受入仕様）
  15. 25_REVIEW_LOOP.md（Review Loop 仕様）
  16. 26_TASK_CHUNKING.md（Task Chunking 仕様）
  17. 28_CONVERSATION_TRACE.md（Conversation Trace 仕様）
  18. 29_TASK_PLANNING.md（Task Planning 仕様）
  19. 30_RETRY_AND_RECOVERY.md（Retry and Recovery 仕様）
  20. 31_PROVIDER_MODEL_POLICY.md（Provider/Model Policy 仕様）
  21. 32_TEMPLATE_INJECTION.md（テンプレート注入仕様）
  22. 33_PROJECT_SETTINGS_PERSISTENCE.md（プロジェクト設定永続化仕様）
  23. 99_RUNBOOK.md（運用仕様）

- 本インデックスに記載のない挙動は仕様外とし、fail-closed とする。
