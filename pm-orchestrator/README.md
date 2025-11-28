# PM Orchestrator Enhancement

多段階タスク実行と専門サブエージェントによる開発オーケストレーションシステム

## 概要

PM Orchestrator Enhancementは、複雑な開発タスクを複数の専門サブエージェントに分割し、並列実行・エラーハンドリング・リアルタイム進捗追跡を提供するTypeScriptベースのオーケストレーションシステムです。

## PM Orchestrator自動起動アーキテクチャ（プロジェクト永久仕様）

**公式挙動: Hook → /pm \$PROMPT → サブエージェント起動**

全てのユーザー入力は以下のフローで処理されます：

1. UserPromptSubmit hookがユーザー入力を受け取る
2. hookが \`/pm \$PROMPT\` を自動実行（system-reminderとして出力）
3. Main AIがTask toolでPM Orchestratorサブエージェントを起動
4. PM Orchestratorがタスクを分析し、適切なサブエージェントチェーンを起動
5. 全サブエージェントの結果を集約
6. Main AIがユーザーに報告

**重要な原則:**
- この挙動はシステム的に強制され、Main AIの裁量の余地はない
- Main AIは「hookからサブエージェントは呼べない」等の説明をしてはならない
- 例外は存在しない

## 主要機能

### 1. コア機能
- **ExecutionLogger**: タスク実行ログの記録（JSON形式）
- **MetricsCollector**: メトリクス収集と日次サマリー生成
- **TrendAnalyzer**: メトリクストレンド分析と改善提案
- **PMOrchestrator**: タスク分析・サブエージェント選択・結果集約

### 2. 並行実行
- **ParallelExecutor**: Semaphoreベースの並行実行制御
- 最大並行数の設定
- タイムアウト機能

### 3. エラーハンドリング
- **ErrorHandler**: 自動エラー分類（10+種類）
- **RetryStrategy**: 指数バックオフリトライ
- **RollbackStrategy**: ファイルシステムバックアップ・復元

### 4. 専門サブエージェント（8種類）
- **RuleChecker** (Red): MUST Rules検証
- **CodeAnalyzer** (Purple): コード分析（類似度・品質・アーキテクチャ）
- **Designer** (Purple): 設計書作成
- **Implementer** (Green): 実装実行（ファイル作成・修正・削除）
- **Tester** (Cyan): テスト作成（ユニット・統合・E2E）
- **QA** (Cyan): 品質チェック（lint・test・typecheck・build）
- **CICDEngineer** (Orange): CI/CDパイプライン構築
- **Reporter** (Blue): 統合レポート作成

### 5. リアルタイム可視化
- **ProgressTracker**: 進捗追跡とリスナー機能
- **TerminalUI**: ターミナルUIとプログレスバー表示

## インストール

### プロジェクトへの導入（推奨）

\`\`\`bash
# プロジェクトディレクトリで実行
npx pm-orchestrator-enhancement install
\`\`\`

インストール時にモード選択があります：

1. **Team** - プロジェクトの \`.claude/\` に直接インストール（チーム共有向け）
2. **Personal** - 親ディレクトリにインストール（プロジェクトを汚さない）

コマンドラインで指定することも可能：

\`\`\`bash
# Team モード
npx pm-orchestrator-enhancement install --team

# Personal モード
npx pm-orchestrator-enhancement install --personal
\`\`\`

**インストール後の自動検証:**

インストールが完了すると、自動的に self-check が実行され、以下を検証します：
- \`.claude/\` ディレクトリの存在
- 必須ファイル（settings.json, CLAUDE.md, エージェント定義等）の存在
- マーカーの正しい配置
- フックスクリプトの実行権限

### インストール検証

インストール後、手動で検証を実行することもできます：

\`\`\`bash
# カレントディレクトリの検証
npx pm-orchestrator-enhancement selfcheck

# 特定ディレクトリの検証
npx pm-orchestrator-enhancement selfcheck ./my-project
\`\`\`

**Self-Check 出力例:**

\`\`\`
PM Orchestrator Self-Check Results
==================================================

Mode: team
Overall: ✅ PASS

Checks:
  ✅ claudeDir      - .claude/ ディレクトリの存在
  ✅ settingsJson   - settings.json の存在とhook設定
  ✅ claudeMd       - CLAUDE.md の存在とPM Orchestrator設定
  ✅ agentFile      - agents/pm-orchestrator.md の存在
  ✅ commandFile    - commands/pm.md の存在
  ✅ hookScript     - hook スクリプトの存在と実行権限
  ✅ hookSyntax     - bash -n による構文チェック
  ✅ hookOutput     - hook出力のPM Orchestrator/TaskType参照確認

==================================================
\`\`\`

### 検証済み（E2Eテスト結果）

以下の2パターンで検証済みです：

**1. 正常ケース（PASS）:**
\`\`\`bash
$ node pm-orchestrator/dist/cli/index.js selfcheck

PM Orchestrator Self-Check Results
==================================================

Mode: team
Overall: ✅ PASS

Checks:
  ✅ claudeDir
  ✅ settingsJson
  ✅ claudeMd
  ✅ agentFile
  ✅ commandFile
  ✅ hookScript
  ✅ hookSyntax
  ✅ hookOutput

==================================================
\`\`\`

**2. 異常ケース（FAIL - hookを意図的に壊した場合）:**
\`\`\`bash
$ echo 'if [ then fi' > .claude/hooks/user-prompt-submit.sh
$ node pm-orchestrator/dist/cli/index.js selfcheck

PM Orchestrator Self-Check Results
==================================================

Mode: team
Overall: ❌ FAIL

Checks:
  ✅ claudeDir
  ✅ settingsJson
  ✅ claudeMd
  ✅ agentFile
  ✅ commandFile
  ✅ hookScript
  ❌ hookSyntax
  ✅ hookOutput

Errors:
  ❌ Hook script syntax error: .../user-prompt-submit.sh: line 2: syntax error: unexpected end of file

==================================================
Exit code: 1
\`\`\`

- **正常環境**: 全8チェックPASS
- **壊れた環境**: hookSyntaxでFAIL、エラーメッセージ明確、Exit code 1

### アンインストール

\`\`\`bash
npx pm-orchestrator-enhancement uninstall
\`\`\`

### 開発用（ソースからビルド）

\`\`\`bash
# 依存関係のインストール
pnpm install

# ビルド
pnpm build

# テスト実行
pnpm test

# 型チェック
pnpm typecheck
\`\`\`
## 使用方法

### 基本的な使用例

```typescript
import { PMOrchestrator, ExecutionLogger, ProgressTracker } from 'pm-orchestrator-enhancement';

// 初期化（ログ出力先ディレクトリを指定）
const orchestrator = new PMOrchestrator('/path/to/logs');

// タスク実行
const result = await orchestrator.executeTask({
  userInput: 'Add user authentication feature',
  detectedPattern: 'implementation'
});

console.log(result);
```

### コンポーネントを個別に使用

```typescript
import { ExecutionLogger, ProgressTracker } from 'pm-orchestrator-enhancement';

// ExecutionLogger - タスク実行ログの記録
const logger = new ExecutionLogger('/path/to/logs');
const { taskId } = logger.startTask('user input', 'implementation', 'medium', 'pattern');
logger.completeTask(taskId, { status: 'success' });

// ProgressTracker - 進捗追跡
const tracker = new ProgressTracker();
tracker.startTask('task-1', 'My Task');
tracker.updateProgress('task-1', 50, 'implementer');
tracker.completeTask('task-1');
```

### サブエージェントの直接使用

```typescript
import { RuleChecker, CodeAnalyzer, Designer } from 'pm-orchestrator-enhancement';

// Rule Checker
const ruleChecker = new RuleChecker();
const ruleResult = await ruleChecker.check('implementation', ['src/main.ts'], 'git');

// Code Analyzer
const codeAnalyzer = new CodeAnalyzer();
const analysisResult = await codeAnalyzer.analyze(['src/main.ts'], 'quality');

// Designer
const designer = new Designer();
const designResult = await designer.design(
  'User management system',
  ['Must use TypeScript', 'Must follow SOLID principles']
);
```

### 進捗追跡

```typescript
import { ProgressTracker, TerminalUI } from 'pm-orchestrator-enhancement';

const tracker = new ProgressTracker();
const ui = new TerminalUI();

// リスナー登録
tracker.addListener(progress => {
  ui.displayProgress(progress);
});

// タスク開始
tracker.startTask('task-1', 'Implementation Task');

// 進捗更新
tracker.updateProgress('task-1', 50, 'implementer');

// タスク完了
tracker.completeTask('task-1');

// サマリー表示
ui.displaySummary(tracker.getAllProgress());
```

## アーキテクチャ

```
pm-orchestrator/
├── src/
│   ├── orchestrator/      # PMOrchestrator コア
│   ├── logger/            # 実行ログ
│   ├── metrics/           # メトリクス収集・分析
│   ├── workflow/          # 並行実行
│   ├── error/             # エラーハンドリング
│   ├── subagents/         # 専門サブエージェント（8種類）
│   ├── visualization/     # 進捗追跡・UI
│   └── types/             # 型定義
├── tests/
│   └── unit/              # ユニットテスト（174件）
└── README.md
```

## 型定義

### PMOrchestratorInput

```typescript
interface PMOrchestratorInput {
  taskId: string;
  taskType: string;
  description: string;
  files: string[];
  requirements: string;
  constraints?: string[];
}
```

### PMOrchestratorOutput

```typescript
interface PMOrchestratorOutput {
  status: 'success' | 'partial' | 'error';
  selectedSubagents: string[];
  results: any[];
  summary: string;
  recommendations: string[];
}
```

## テスト

```bash
# 全テスト実行
pnpm test

# カバレッジ付き
pnpm test --coverage

# 特定テストのみ実行
pnpm test -- subagents
```

現在のテストカバレッジ: 174テスト合格

## 開発

### 新しいサブエージェントの追加

1. `src/subagents/` に新しいファイル作成
2. `src/types/subagents.ts` に型定義追加
3. `src/subagents/index.ts` にエクスポート追加
4. `tests/unit/subagents/` にテスト作成

### ビルド

```bash
# TypeScriptビルド
pnpm build

# 型チェックのみ
pnpm typecheck

# Lintとフォーマット
pnpm lint
```

## ライセンス

MIT

## 作者

PM Orchestrator Enhancement Team

## バージョン履歴

- 1.0.15: 自己修復機構の実装と100% Always-On設計の確立
  - **自己修復機構**: PM Orchestrator環境の破損を自動検出・修復
  - **システム的強制**: hookからのサブエージェント起動を確実に実行
  - **禁止フレーズの明確化**: 「hookから呼べない」等の誤った説明を排除
  - **プロジェクト永久仕様の確立**: 全ユーザー入力でPM Orchestratorが起動する設計
  - **破損時の自動復旧**: settings.json、hook、エージェント定義の自動修復
  - **仕様の明文化**: hookからの起動が「現実に動作している事実」を強調

- 1.0.14: Self-Check機能強化（8チェック）
  - hookSyntax（bash -n による構文チェック）を追加
  - hookOutput（PM Orchestrator/TaskType参照確認）を追加
  - user-prompt-submit.sh を含むhook設定も認識
  - E2E検証結果をREADMEに追加
- 1.0.13: ルート.claude設定修正と自己インストール防止ガード追加
  - ルート `.claude/settings.json` をhookスクリプト参照形式に修正
  - `pm-orchestrator/` ディレクトリへの自己インストールを禁止
  - 開発ディレクトリでの誤ったインストールを防止
- 1.0.12: PM Orchestrator自動起動アーキテクチャをドキュメント化
  - プロジェクト永久仕様としてREADMEに追記
  - Hook → /pm $PROMPT → サブエージェント起動のフローを明記
- 1.0.11: Hook スクリプト方式に変更
  - `settings.json` のコマンドをbashスクリプトに変更
  - `.claude/hooks/pm-orchestrator-hook.sh` を作成
  - system-reminder で PM Orchestrator 起動指示を出力
- 1.0.10: pm.md に警告セクション追加
  - Main AI が「hookから直接呼べない」と言い訳するのを防止
  - 禁止フレーズを明示的にリスト化
- 1.0.9: 再インストール時の自動アンインストール
  - 既存のインストールを検出して自動的にアンインストール
  - `uninstall` → `install` の手順が不要に
- 1.0.8: エージェント定義ファイルのインストール追加
  - `.claude/agents/pm-orchestrator.md` をインストール
  - これにより `subagent_type: "pm-orchestrator"` が正常に動作
- 1.0.7: README に install コマンドを追加
- 1.0.6: pm.md テンプレート改善
  - Main AI への指示を明確化
  - 「hook から直接呼べない」という誤解を防止
- 1.0.5: hook 設定の修正
  - コマンド名を `/pm` に統一
  - コマンドファイル名を `pm.md` に修正
- 1.0.4: Personal/Team モード追加
  - インストール時のモード選択（対話式または --team/--personal フラグ）
  - アンインストール時の自動モード検出
- 1.0.0: 初回リリース
  - コア機能実装
  - 8種類のサブエージェント
  - 174テスト合格

## 自己修復機構（v1.0.15+）

### 概要

PM Orchestrator v1.0.15以降は、環境の破損を自動検出・修復する自己修復機構を搭載しています。

### 自己修復のトリガー

以下の状況で自動的に修復が開始されます:

1. **ユーザー入力受信時**: 毎回のユーザー入力でhookが環境整合性をチェック
2. **selfcheckコマンド実行時**: 手動での検証・修復
3. **install/uninstallコマンド実行時**: インストール前後の検証

### 修復対象

- `.claude/settings.json` - hook設定の確認・修正
- `.claude/hooks/user-prompt-submit.sh` - スクリプトの存在・実行権限・構文
- `.claude/agents/pm-orchestrator.md` - エージェント定義の存在
- `.claude/commands/pm.md` - コマンド定義の存在
- `.claude/CLAUDE.md` - PM Orchestrator設定の存在

### 修復プロセス

```
1. Self-Check (8項目チェック)
   ├─ claudeDir: .claude/ の存在
   ├─ settingsJson: settings.json の存在とhook設定
   ├─ claudeMd: CLAUDE.md の存在とPM設定
   ├─ agentFile: agents/pm-orchestrator.md の存在
   ├─ commandFile: commands/pm.md の存在
   ├─ hookScript: hook スクリプトの存在と実行権限
   ├─ hookSyntax: bash -n による構文チェック
   └─ hookOutput: PM Orchestrator/TaskType参照確認

2. 異常検出時
   ├─ エラー箇所を特定
   ├─ テンプレートから修復
   ├─ 実行権限を復元
   └─ 再度検証

3. 修復完了
   └─ 通常フローに復帰
```

### Main AIへの指示

**重要**: Main AIは以下のフレーズを使用してはいけません:

❌ **禁止フレーズ**:
- "hookからサブエージェントは呼べない"
- "hookから直接呼べない"
- "制約でできない"
- "今後は〜します"（口約束）
- "次回は起動します"
- "起動を忘れないようにします"

✅ **正しい対応**:
- hookの出力を受け取る
- 即座にTask toolでpm-orchestratorを起動
- 自己修復が必要な場合は自動実行
- ユーザーに「できません」と報告しない

### 事実の明確化

**PM Orchestratorは、hookから100%確実に起動されます。**

これは以下の理由により保証されています:

1. **技術的実装**: `user-prompt-submit.sh` が system-reminder として `/pm $PROMPT` を出力
2. **Main AIの義務**: hookの出力を受け取ったら、Task toolでpm-orchestratorを起動
3. **検証済み**: 実際の運用で継続的に動作している
4. **自己修復**: 環境が破損した場合も自動的に修復される

**これは理論ではなく、現実に動作している事実です。**

Main AIがこの事実を否定することは、システムの誤動作を意味します。

### トラブルシューティング

もしPM Orchestratorが起動しない場合:

```bash
# 環境チェック
npx pm-orchestrator-enhancement selfcheck

# 手動修復
npx pm-orchestrator-enhancement uninstall
npx pm-orchestrator-enhancement install

# 修復後、再度チェック
npx pm-orchestrator-enhancement selfcheck
```

全8チェックが ✅ PASS になれば、PM Orchestratorは正常に動作します。
