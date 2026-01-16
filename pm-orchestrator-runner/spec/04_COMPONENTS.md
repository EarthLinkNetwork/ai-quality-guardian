# Components and Interfaces

## CLI Interface

CLI Interface は Runner への唯一のユーザー入力窓口である。
すべてのユーザー操作は CLI Interface を経由しなければならない。

CLI Interface は、通常のコマンド実行に加えて、
対話型入力環境（REPL UX）を提供してよい。

REPL UX の詳細な仕様は 10_REPL_UX.md に定義される。
REPL は CLI Interface の上位 UX レイヤーであり、
新しい実行権限やライフサイクルを導入してはならない。

### Commands

pm-orchestrator start は新しい実行セッションを開始する。
--project オプションが指定された場合、そのパスが絶対的に使用される。

pm-orchestrator continue は既存のセッションを再開する。
再開対象は session-id によって一意に指定される。

pm-orchestrator status は指定された session-id の状態を取得する。

pm-orchestrator validate はプロジェクト構造のみを検証し、実行は行わない。
--project が指定されない場合はカレントディレクトリを対象とする。

### Project Resolution Rules

--project フラグが指定された場合、他のすべての推論や補完よりも優先される。
--project が指定されない場合、現在の作業ディレクトリが対象プロジェクトとなる。
対象ディレクトリに .claude ディレクトリが存在しない場合、即座に ERROR で停止する。
親ディレクトリへの探索やグローバル設定の参照は禁止される。
すべての推論および検証は解決済みプロジェクトディレクトリ内で完結しなければならない。
エラーメッセージは不足しているパスを明示的に示さなければならない。

## Runner Core

Runner Core はシステム全体の唯一の実行制御主体である。

### Responsibilities

Runner Core は CLI コマンドの処理を行う。
Runner Core はプロジェクト解決および検証を行う。
Runner Core はセッションのライフサイクルを管理する。
Runner Core はすべてのコンポーネント間の調整を行う。

### Key Interfaces

RunnerCore は start、continue、status、validate の各操作を提供する。
start は新しい ExecutionResult を返す。
continue は既存セッションに対する ExecutionResult を返す。
status は SessionStatus を返す。
validate は ValidationResult を返す。

ExecutionResult には overall_status、session_id、evidence_path、next_action、violations が含まれる。
overall_status は COMPLETE、INCOMPLETE、ERROR、INVALID、NO_EVIDENCE のいずれかである。

## Configuration Manager

Configuration Manager は設定の正当性を保証する唯一の構成要素である。

### Responsibilities

Configuration Manager は settings.json のスキーマ検証を行う。
Configuration Manager はデフォルト値の適用を管理する。
Configuration Manager は設定エラーを検出し、Runner に通知する。

### Required Project Structure

対象プロジェクトは .claude ディレクトリを含まなければならない。
.claude ディレクトリには CLAUDE.md、settings.json、agents ディレクトリ、rules ディレクトリが必須である。
いずれかが欠落している場合、実行は即座に停止する。

### Configuration Schema

task_limits.files は 1 から 20 の範囲であり、デフォルトは 5 である。
task_limits.tests は 1 から 50 の範囲であり、デフォルトは 10 である。
task_limits.seconds は 30 から 900 の範囲であり、デフォルトは 300 である。

parallel_limits.subagents は最大 9 であり、上書き範囲は 1 から 9 である。
parallel_limits.executors は最大 4 であり、上書き範囲は 1 から 4 である。

timeouts.deadlock_timeout_seconds は 30 から 300 の範囲であり、デフォルトは 60 である。
timeouts.operation_timeout_seconds は 10 から 600 の範囲であり、デフォルトは 120 である。

evidence_settings.retention_days は 1 から 365 の範囲であり、デフォルトは 30 である。
evidence_settings.compression_enabled は真偽値であり、デフォルトは true である。

## Session Manager

Session Manager はセッションの永続性と一貫性を保証する。

### Responsibilities

Session Manager はセッション ID を生成する。
Session Manager はセッション証跡を初期化する。
Session Manager はセッション状態を永続化する。

### Session Evidence Structure

session.json には session_id、started_at、target_project、runner_version、configuration が含まれる。
executor_runs.jsonl には Executor 起動ごとの記録が 1 行ずつ保存される。

## L1 Subagent Pool

L1 Subagent Pool は分析および検証専用の実行単位である。

### Responsibilities

L1 Subagents は読み取り専用の分析および計画を行う。
L1 Subagents は Claude API を使用する。
同時実行数は最大 9 に制限される。

### Constraints

L1 Subagents はファイル書き込みを行ってはならない。
L1 Subagents は完了判定を行ってはならない。
L1 Subagents は定められたトークンおよび時間制限内で動作しなければならない。

## L2 Executor Pool

L2 Executor Pool は実装専用の実行単位である。

### Responsibilities

L2 Executors は実装およびファイル変更を行う。
L2 Executors は Claude Code CLI を executor-only モードで使用する。
L2 Executors は証跡を生成し、Runner に検証される。
L2 Executors は TDD を厳密に遵守する。

### Constraints

L2 Executors は必ず RUNNER_SESSION_ID= 行を出力しなければならない。
L2 Executors は実装以外の作業を行ってはならない。
L2 Executors はロックおよびセマフォ制御に従わなければならない。
テストが存在しない場合、実装を開始してはならない。
すべての出力は Runner によって検査される。

## Evidence Manager

Evidence Manager はすべての操作証跡を管理する。

### Responsibilities

Evidence Manager は証跡を収集する。
Evidence Manager はハッシュ検証および整合性検査を行う。
Evidence Manager は evidence_index を管理する。
Evidence Manager は証跡を原子的に記録する。

### Evidence Storage Structure

証跡は .claude/evidence ディレクトリ以下に保存される。
session.json、executor_runs.jsonl、各種 JSONL 証跡、raw_logs、evidence_index.json、evidence_index.sha256、report.json が含まれる。

### Atomic Evidence Recording

各論理操作につき証跡は 1 件でなければならない。
同時操作は個別に記録されなければならない。
証跡の集約は禁止される。
証跡が欠落した場合、そのタスクは NO_EVIDENCE と判定される。

## Continuation Control Manager

Continuation Control Manager は暗黙的な継続を防止する。

### Responsibilities

部分完了後の自動進行を禁止する。
継続には明示的承認を要求する。
継続条件を検証する。
意味のない継続要求を拒否する。

## Resource Limit Manager

Resource Limit Manager はすべての数値制限を強制する。

### Responsibilities

安全なデフォルト値を強制する。
測定可能な代理指標によって制限を適用する。
制限違反時は fail-closed で停止する。
必要に応じてチャンクサイズを調整する。

## Lock Manager

Lock Manager はファイル単位の排他制御を行う。

### Responsibilities

ロックの取得および解放を管理する。
デッドロックを検出および解消する。
ロック取得順序を強制する。
セマフォによる同時実行制御を行う。

### Lock Acquisition Protocol

最初に Executor 用グローバルセマフォを取得する。
次に対象ファイルのロックを決定順序で取得する。
操作を実行し証跡を記録する。
ロックを逆順で解放する。
最後にグローバルセマフォを解放する。

### Lock File Format

ロックファイルは lock_id、holder_executor_id、acquired_at、expires_at、file_path を含む。
expires_at はデッドロック検出の参考情報のみであり、自動解放のトリガーとして使用してはならない。
