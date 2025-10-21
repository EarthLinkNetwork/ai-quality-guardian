# Quality Guardian 🛡️

AI品質管理システム - Claude Codeプロジェクト用統合品質管理ツール

## 概要

Quality Guardianは、AIによるコード変更の品質を多角的に検証し、「AIのズル」を検出して品質劣化を防ぐシステムです。

### 主な機能

- 🔍 **実装前後のベースライン比較**
- 🧠 **文脈を理解したPR分析**
- 🔐 **不変式チェック（Migration削除等の検出）**
- 🔬 **深層品質分析（ミューテーションテスト等）**
- 🤖 **自動修復機能**

## インストール

### 新しいプロジェクトに導入

#### Personal Mode（個人用 - 他の開発者に影響なし）

```bash
# Personal Mode: Git hooks/CI統合なし、自分だけが使える
bash ~/dev/ai/scripts/quality-guardian/install.sh --personal

# またはカレントディレクトリに
cd your-project
bash ~/dev/ai/scripts/quality-guardian/install.sh --personal
```

**Personal Modeの特徴:**
- ✅ `.quality-guardian/` モジュールのインストール
- ✅ `quality-guardian` 実行スクリプト作成
- ✅ `.quality-guardian.json` 設定ファイル作成
- ✅ `.gitignore` に追加（ログファイル除外）
- ✅ Git pre-commit hook の設定（ローカルのみ）
- ✅ `.claude/` 設定（エージェント・CLAUDE.md）のインストール
- ❌ GitHub Actions workflow の作成なし
- ❌ package.json の変更なし

**v1.2.19+の標準ディレクトリ構造:**
Personal Modeでは、`.claude/` と Gitリポジトリを別々のディレクトリに配置できます：
```
~/dev/workspace/          ← Claude Code実行ディレクトリ（.claude/を配置）
└── my-project/           ← Gitリポジトリ（Quality Guardianを配置）
    ├── .git/
    ├── .quality-guardian/
    └── quality-guardian
```

この構造により、`.gitignore` を変更せずに `.claude/` を使用できます。

インストール時に自動的にGitリポジトリを検出し、選択できます：
- 複数のGitリポジトリがある場合は選択可能
- カレントディレクトリも選択肢に含まれる
- 手動入力も可能

**他の開発者への影響: なし** - 自分だけが `./quality-guardian` コマンドを実行できます

#### Team Mode（チーム用 - 全員で品質管理）

```bash
# Team Mode: Git hooks/CI統合あり、チーム全体で品質管理
bash ~/dev/ai/scripts/quality-guardian/install.sh --team

# または単に（デフォルトはTeam Mode）
bash ~/dev/ai/scripts/quality-guardian/install.sh
```

**Team Modeの特徴:**
- ✅ Personal Modeの全機能
- ✅ Git pre-commit hook 設定
- ✅ GitHub Actions workflow 作成
- ✅ package.json に npm scripts 追加
- ✅ .claude/CLAUDE.md 更新

**v1.2.38の新機能**: テストスキップの絶対禁止ルール追加 - Test First原則の徹底と一時的スキップの禁止

**v1.2.37の新機能**: curl経由インストールのバグ修正 - GitHubから直接実行時のファイルダウンロード対応

**v1.2.36の新機能**: テンプレート強化と絵文字削除 - 日本語応答徹底と絵文字使用禁止

**v1.2.19の新機能**: Personal Mode標準ディレクトリ構造対応 - `.claude/` を親ディレクトリに配置可能

**v1.2.5の新機能**: 自動バージョン確認・アップデート機能 - 既存インストールを検出して賢くアップデート

**v1.2.4の新機能**: AI回答表示ルール追加 - ツール実行ログで回答が流れても最後に再表示

**v1.2.3の新機能**: Personal Mode追加 - 他の開発者に影響なくインストール可能

**v1.2.2の新機能**: Claude Code実行ディレクトリの自動検出

- `.claude`ディレクトリが存在する場合、そこをClaude Codeの実行ディレクトリと判断し、自動的にそのディレクトリにインストールします
- プロジェクトルートで実行した場合は従来通りそのディレクトリにインストール
- プロジェクトの1階層上でClaude Codeを実行している場合も適切に対応

### 手動セットアップ

```bash
# 1. ファイルをコピー
cp -r ~/dev/ai/scripts/quality-guardian/modules ./quality-guardian/
cp ~/dev/ai/scripts/quality-guardian/quality-guardian.js ./quality-guardian/

# 2. 実行スクリプト作成
echo '#!/usr/bin/env node\nrequire("./quality-guardian/quality-guardian.js");' > quality-guardian
chmod +x quality-guardian

# 3. 初期化
./quality-guardian init
```

## 使用方法

### 基本フロー

```bash
# 1. 実装前のベースライン記録
./quality-guardian baseline

# 2. AIが実装作業

# 3. 品質チェック実行
./quality-guardian check

# 4. 問題があれば自動修復
./quality-guardian fix
```

### PRレビュー

```bash
# PRの品質分析
./quality-guardian pr main

# 文脈を理解した分析結果が出力される
```

### コマンド詳細

| コマンド | 説明 | 使用例 |
|---------|------|-------|
| `init` | プロジェクト初期化 | `./quality-guardian init` |
| `baseline` | ベースライン記録 | `./quality-guardian baseline` |
| `check` | 品質チェック | `./quality-guardian check` |
| `pr` | PR分析 | `./quality-guardian pr develop` |
| `fix` | 自動修復 | `./quality-guardian fix` |

## 設定ファイル

`.quality-guardian.json` で動作をカスタマイズできます：

```json
{
  "modules": {
    "baseline": { "enabled": true, "threshold": 0.95 },
    "context": { "enabled": true, "strictMode": false },
    "invariant": { "enabled": true },
    "deepQuality": { "enabled": true, "minScore": 60 },
    "prReview": { "enabled": true, "autoBlock": true }
  },
  "rules": {
    "migration": {
      "allowDeletion": false,
      "allowModification": false,
      "severity": "blocker"
    },
    "testing": {
      "minCoverage": 70,
      "maxMockRatio": 0.4,
      "requireAssertions": true
    },
    "typescript": {
      "allowAny": false,
      "allowTsIgnore": false
    }
  }
}
```

## CI/CD統合

### GitHub Actions

インストール時に自動生成される `.github/workflows/quality-guardian.yml` を使用：

```yaml
name: Quality Guardian
on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Quality Guardian
        run: ./quality-guardian check
```

### Pre-commit Hook

```bash
# 自動設定される
.git/hooks/pre-commit
```

## 検出できる問題

### 1. ベースライン劣化

```
❌ 品質劣化:
  - テストカバレッジ: 80% → 45%
  - Mock率: 20% → 70%
  - 型安全性: any使用 5 → 25個
```

### 2. 文脈矛盾

```
❌ 論理的矛盾:
  - 新機能追加なのにMigration削除
  - MasterMaker機能と無関係な変更多数
```

### 3. 不変式違反

```
🚫 ブロッカー:
  - Migration削除検出: 20250612_init.sql
  - データベース整合性違反
```

### 4. テスト品質低下

```
🔬 深層分析:
  - ミューテーション生存率: 85%（テストが無意味）
  - トートロジー: 15個（常に真のテスト）
  - パスカバレッジ: 20%（実行パス不足）
```

## npm scripts統合

インストール時に自動追加されるスクリプト：

```json
{
  "scripts": {
    "quality:baseline": "./quality-guardian baseline",
    "quality:check": "./quality-guardian check",
    "quality:pr": "./quality-guardian pr",
    "quality:fix": "./quality-guardian fix"
  }
}
```

## モジュール構成

```
quality-guardian/
├── quality-guardian.js     # メインコントローラー
├── modules/
│   ├── baseline-monitor.js # ベースライン比較
│   ├── context-analyzer.js # 文脈分析
│   ├── invariant-checker.js # 不変式チェック
│   ├── deep-quality-analyzer.js # 深層品質分析
│   └── pr-reviewer.js      # PR分析
├── agents/                 # サブエージェント設定（全11個）
│   ├── rule-advisor.md     # ルール選択専門 ⭐⭐⭐⭐⭐
│   ├── quality-fixer.md    # 品質修正専門 ⭐⭐⭐⭐⭐
│   ├── task-executor.md    # タスク実行専門 ⭐⭐⭐⭐
│   ├── requirement-analyzer.md # 要件分析専門 ⭐⭐⭐⭐
│   ├── technical-designer.md   # 技術設計専門 ⭐⭐⭐
│   ├── code-reviewer.md    # コードレビュー専門 ⭐⭐⭐
│   ├── work-planner.md     # 作業計画専門 ⭐⭐
│   ├── task-decomposer.md  # タスク分解専門 ⭐⭐
│   ├── document-reviewer.md # ドキュメントレビュー ⭐⭐
│   ├── prd-creator.md      # PRD作成専門 ⭐
│   └── e2e-test-generator.md # E2Eテスト生成 ⭐
├── install.sh              # インストーラー
└── README.md               # このファイル
```

## サブエージェント設定（v1.2.7+）

Team Modeでインストールすると、専門的なサブエージェント設定が自動的にインストールされます。

**⚠️ エージェント数**: 必ず**11個**です（33個や他の数値は誤り）

### 含まれるエージェント

#### 🌟 必須エージェント

1. **rule-advisor** ⭐⭐⭐⭐⭐
   - **役割**: タスク開始時に適切なルールを選択
   - **タイミング**: MUST BE USED PROACTIVELY - 全タスク開始時
   - **効果**: AIの実行精度を最大化、メタ認知を支援

2. **quality-fixer** ⭐⭐⭐⭐⭐
   - **役割**: 品質チェック・修正を完全自己完結で実行
   - **タイミング**: コード変更後、品質関連キーワード出現時
   - **効果**: テスト・ビルド・型チェックをゼロエラーまで修正

3. **task-executor** ⭐⭐⭐⭐
   - **役割**: 個別タスクを着実に実行
   - **タイミング**: 実装フェーズ
   - **効果**: TDD準拠で確実な実装、進捗を3箇所同期更新

#### 🟢 有用エージェント

4. **requirement-analyzer** ⭐⭐⭐⭐
   - **役割**: 要件分析と作業規模判定
   - **タイミング**: プロジェクト開始時
   - **効果**: PRD/Design Doc必要性を判定、適切なアプローチ提案

5. **technical-designer** ⭐⭐⭐
   - **役割**: Design Doc・ADR作成
   - **タイミング**: 中〜大規模機能開発
   - **効果**: 技術設計を構造化、実装前の設計整合性確保

6. **code-reviewer** ⭐⭐⭐
   - **役割**: Design Doc準拠検証
   - **タイミング**: 実装完了時
   - **効果**: 第三者視点でレビュー、受入条件充足確認

#### 🟡 状況によるエージェント

7. **work-planner** ⭐⭐
   - **役割**: 作業計画書作成
   - **タイミング**: 大規模プロジェクトの計画フェーズ
   - **効果**: タスク分解と作業計画の構造化

8. **task-decomposer** ⭐⭐
   - **役割**: タスクを細分化
   - **タイミング**: work-plannerと併用
   - **効果**: 複雑なタスクを実行可能な単位に分割

9. **document-reviewer** ⭐⭐
   - **役割**: ドキュメントの整合性チェック
   - **タイミング**: ドキュメント重視プロジェクト
   - **効果**: PRD/Design Doc/ADRの品質保証

#### 🔴 限定的なエージェント

10. **prd-creator** ⭐
   - **役割**: PRD(Product Requirements Document)作成
   - **タイミング**: プロダクト開発時のみ
   - **効果**: プロダクト要件の明確化

11. **e2e-test-generator** ⭐
   - **役割**: E2Eテスト生成
   - **タイミング**: E2Eテストを重視するプロジェクトのみ
   - **効果**: エンドツーエンドテストの自動生成

### 使用方法

エージェントはClaude Codeの Task ツールから呼び出されます。Team Modeでインストールすると、`.claude/agents/` ディレクトリに設定が配置され、自動的に利用可能になります。

```
プロジェクト/.claude/agents/
├── rule-advisor.md          ⭐⭐⭐⭐⭐
├── quality-fixer.md         ⭐⭐⭐⭐⭐
├── task-executor.md         ⭐⭐⭐⭐
├── requirement-analyzer.md  ⭐⭐⭐⭐
├── technical-designer.md    ⭐⭐⭐
├── code-reviewer.md         ⭐⭐⭐
├── work-planner.md          ⭐⭐
├── task-decomposer.md       ⭐⭐
├── document-reviewer.md     ⭐⭐
├── prd-creator.md           ⭐
└── e2e-test-generator.md    ⭐
```

### Personal Modeでの使用

**v1.2.9以降**、Personal Modeでも全11個のエージェント設定とCLAUDE.mdが自動的にインストールされます。

`.claude/`ディレクトリは個人設定なので、他の開発者に影響を与えません。Personal ModeとTeam Modeの違いは：

- **Personal Mode**: `.claude/`設定 + 品質チェックツール（Git hooks/CI/package.json変更なし）
- **Team Mode**: Personal Modeの全機能 + Git hooks + GitHub Actions + package.json scripts

## 他のツールとの統合

### 既存の品質管理ツールと併用

Quality Guardianは既存のツールを置き換えるのではなく、AIが作るコードの特有の問題を検出します：

- **ESLint/Biome**: 構文・スタイルチェック
- **TypeScript**: 型チェック
- **Jest/Vitest**: テスト実行
- **Quality Guardian**: AIのズル検出

### VS Code統合

```json
// .vscode/tasks.json
{
  "tasks": [
    {
      "label": "Quality Check",
      "type": "shell",
      "command": "./quality-guardian check",
      "group": "test"
    }
  ]
}
```

## AI回答表示ルール（v1.2.4+）

Team Modeでインストールすると、`.claude/CLAUDE.md`にAI回答表示ルールが自動的に追加されます。

### 問題の背景

Claude CodeでAIに質問した際、以下の問題が発生していました：

1. AIが即座に回答を表示
2. その後、ツール実行のログが大量に流れる
3. プロンプトに戻った時には最初の回答が見えなくなっている

### 解決方法

Quality Guardianは、インストール時に`.claude/CLAUDE.md`に以下のルールを自動追加します：

```markdown
## AI回答表示ルール

ユーザーからの質問や確認が必要な場合：

1. **即座に要約を表示**
   - 最初の1-2文で核心を伝える
   - ユーザーが見逃さないように

2. **ツール実行**
   - 必要な調査・確認を実行
   - ログが流れることを前提

3. **最後に詳細回答を再表示**
   - 📌 マークで目立たせる
   - ツール実行後の画面に残るように
   - ユーザーが読みやすい形で再度まとめる
```

### 効果

- ✅ ツール実行ログで回答が流れても、最後に再表示される
- ✅ 📌 マークで目立つので見つけやすい
- ✅ すべてのQuality Guardianインストール済みプロジェクトで自動適用

### Personal Modeでの使用

**v1.2.9以降**、Personal Modeでも`.claude/CLAUDE.md`が自動的に作成/更新されます。この機能は自動的に適用されます。

## トラブルシューティング

### よくある問題

1. **依存関係エラー**
   ```bash
   npm install glob
   ```

2. **権限エラー**
   ```bash
   chmod +x quality-guardian
   ```

3. **設定ファイルエラー**
   ```bash
   ./quality-guardian init  # 設定ファイル再生成
   ```

### ログファイル

```bash
# ログの確認
cat .quality-guardian/quality-guardian.log
```

## 更新方法（v1.2.5+）

Quality Guardianは既存インストールを自動検出し、賢くアップデートします。

### 自動アップデート

```bash
# 通常の更新（既存インストールを検出して自動アップデート）
bash ~/dev/ai/scripts/quality-guardian/install.sh
```

**動作:**
1. 既存インストールを検出
2. 現在のバージョンと最新バージョンを比較
3. アップデートが必要な場合:
   - ✅ モジュールを最新版に更新
   - ✅ バージョン番号のみ更新
   - ✅ **ユーザー設定を保持**（.quality-guardian.jsonのカスタム設定は維持）
   - ✅ バックアップ自動作成（.quality-guardian.json.backup）

### 強制再インストール

```bash
# 既に最新版の場合でも強制的に再インストール
bash ~/dev/ai/scripts/quality-guardian/install.sh --force
```

### アップデート例

```bash
$ bash ~/dev/ai/scripts/quality-guardian/install.sh

✅ Quality Guardian は既にインストール済みです
   現在のバージョン: 1.2.4
   最新バージョン: 1.2.5

🔄 アップデートを実行します...
   1.2.4 → 1.2.5

📦 Quality Guardianモジュールをインストール...
🔄 設定ファイルのバージョンを更新...
✅ バージョンを更新しました (1.2.4 → 1.2.5)
   バックアップ: .quality-guardian.json.backup
```

### 既に最新版の場合

```bash
$ bash ~/dev/ai/scripts/quality-guardian/install.sh

✅ Quality Guardian は既にインストール済みです
   現在のバージョン: 1.2.5
   最新バージョン: 1.2.5

✨ 既に最新バージョンです

次のアクション：
1. そのまま使用 - 現在の設定で問題なければ、特に作業不要
2. Team Modeに変更 - 現在Personal Modeの場合、--teamで再インストール
3. Personal Modeに変更 - 現在Team Modeの場合、--personalで再インストール
4. 強制再インストール - --forceオプションで再インストール

再インストールする場合は --force オプションを追加してください
```

## 🚨 重要：ソースコード変更時の確認義務

**Quality Guardianのソースコード（`.quality-guardian/`ディレクトリ内）を変更する際は、必ず以下の手順を守ってください：**

### 変更前の必須確認

1. **ユーザーへの確認**
   - ソースコード変更の必要性を説明
   - 変更内容の詳細を提示
   - ユーザーの承認を得る

2. **バックアップ作成**
   ```bash
   # 変更前に必ずバックアップ
   cp -r .quality-guardian .quality-guardian.backup
   ```

3. **変更理由の記録**
   - 何を修正するのか
   - なぜ修正が必要なのか
   - どのような影響があるのか

### 変更後の必須確認

1. **動作確認**
   ```bash
   ./quality-guardian check
   ```

2. **バージョン更新**
   - `~/dev/ai/scripts/quality-guardian/VERSION`を更新
   - 変更内容を記録

3. **コミット前の最終確認**
   ```bash
   git diff .quality-guardian/
   ```

### ❌ 絶対禁止事項

- **無断でのソースコード変更**
- **確認なしでの本番環境へのデプロイ**
- **バックアップなしでの変更**
- **変更理由の記録なし**

### ✅ 推奨される変更フロー

```bash
# 1. 現状確認
./quality-guardian check

# 2. バックアップ
cp -r .quality-guardian .quality-guardian.backup

# 3. ユーザー確認後に変更実施
# （変更作業）

# 4. 動作確認
./quality-guardian check

# 5. バージョン更新
echo "1.2.2" > ~/dev/ai/scripts/quality-guardian/VERSION

# 6. コミット
git add .quality-guardian/
git commit -m "fix: Quality Guardian修正 - [変更理由]"
```

### カスタムコマンド `/remind` の活用

AIアシスタントがこれらのルールを守るように、`/remind`コマンドで確認ルールをリマインドできます。

## 貢献

品質管理ルールの改善案やバグ報告は以下まで：

- GitHub Issues
- Pull Requests

## ライセンス

MIT License

## 関連ツール

- [Claude Code](https://claude.ai/code) - AIペアプログラミング
- [ai-quality-enforcer](~/dev/ai/scripts/ai-quality-enforcer.sh) - 既存の品質管理スクリプト

---

**Quality Guardian - AIと共に、品質を守る**