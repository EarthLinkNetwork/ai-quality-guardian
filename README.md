# 🛡️ AI Development Scripts

Claude Codeで開発する際に使用する品質管理ツール集です。

## 📦 Quality Guardian - 統合品質管理システム

AI（Claude Code）による開発の品質を多角的に検証し、「AIのズル」を検出して品質劣化を防ぐシステムです。

---

## 🤖 AI（Claude Code）向けインストールガイド

**このセクションはAIアシスタントが読むための詳細な手順です。**

### インストール前の確認事項

1. **ユーザーに必ず質問すること:**
   - 「Personal Mode（自分だけ）とTeam Mode（チーム全体）のどちらでインストールしますか？」
   - Personal Modeの場合、他の開発者には影響しません
   - Team Modeの場合、Git hooks/CI/package.json等を変更します

2. **インストール先の確認:**
   - 現在のディレクトリがプロジェクトルートか確認
   - `.claude`ディレクトリの存在を確認（Claude Code実行ディレクトリ）

### Personal Mode インストール（他の開発者に影響なし）

```bash
bash ~/dev/ai/scripts/quality-guardian/install.sh --personal
```

**実行される処理:**
- ✅ `.quality-guardian/` モジュールのインストール
- ✅ `quality-guardian` 実行スクリプト作成
- ✅ `.quality-guardian.json` 設定ファイル作成
- ✅ `.gitignore` に追加（ログファイル除外のみ）
- ✅ **サブエージェント設定（.claude/agents/）** - 全11個のエージェント
- ✅ **CLAUDE.md設定（.claude/CLAUDE.md）** - AI開発ルール

**実行されない処理:**
- ❌ Git pre-commit hook の設定
- ❌ GitHub Actions workflow の作成
- ❌ package.json の変更

**使用例:**
- ユーザーが個人的に試したい場合
- チームメンバーに影響を与えたくない場合
- まず自分だけで使ってみたい場合

### Team Mode インストール（チーム全体で品質管理）

```bash
bash ~/dev/ai/scripts/quality-guardian/install.sh --team
# または単に
bash ~/dev/ai/scripts/quality-guardian/install.sh
```

**実行される処理:**
- ✅ Personal Modeの全機能（サブエージェント・CLAUDE.md含む）
- ✅ Git pre-commit hook 設定（全員のコミット時に品質チェック）
- ✅ GitHub Actions workflow 作成（CI/CDに統合）
- ✅ package.json に npm scripts 追加

**使用例:**
- チーム全体で品質を担保したい場合
- CI/CDに統合したい場合
- 既にチームで合意が取れている場合

### サブエージェント設定（v1.2.9+）

**Personal ModeでもTeam Modeでも**、以下の**全11個**の専門エージェント設定が自動的にインストールされます：

**⚠️ 重要**: エージェント数は**必ず11個**です。33個や他の数値は誤りです。

#### 🌟 必須エージェント（⭐⭐⭐⭐⭐/⭐⭐⭐⭐）
- **rule-advisor** - タスク開始時に適切なルールを選択、AIの実行精度を最大化
- **quality-fixer** - 品質チェック・修正を完全自己完結で実行
- **task-executor** - 個別タスクを着実に実行、TDD準拠で確実な実装

#### 🟢 有用エージェント（⭐⭐⭐⭐/⭐⭐⭐）
- **requirement-analyzer** - 要件分析と作業規模判定
- **technical-designer** - Design Doc・ADR作成
- **code-reviewer** - Design Doc準拠検証、第三者視点でレビュー

#### 🟡 状況によるエージェント（⭐⭐）
- **work-planner** - 作業計画書作成
- **task-decomposer** - タスクを細分化
- **document-reviewer** - ドキュメントの整合性チェック

#### 🔴 限定的なエージェント（⭐）
- **prd-creator** - PRD(Product Requirements Document)作成
- **e2e-test-generator** - E2Eテスト生成

詳細は `<QUALITY_GUARDIAN_PATH>/README.md` の「サブエージェント設定」セクションを参照してください。

### インストール後の手順

1. **初期ベースライン記録（推奨）:**
   ```bash
   ./quality-guardian baseline
   ```

2. **使用方法をユーザーに伝える:**
   ```bash
   ./quality-guardian check     # 品質チェック
   ./quality-guardian pr main   # PR分析
   ./quality-guardian fix       # 自動修復
   ```

3. **詳細ドキュメントの場所:**
   - `<QUALITY_GUARDIAN_PATH>/README.md`
   - `<QUALITY_GUARDIAN_PATH>/INTEGRATION.md`

### 重要な注意事項

- **必ずユーザーに確認してからインストールすること**
- **Personal ModeとTeam Modeの違いを説明すること**
- **Team Modeは他の開発者に影響することを明確に伝えること**
- **インストール後は必ず動作確認を行うこと**

### カスタムコマンドの管理（v1.2.13+）

`/quality-check` カスタムコマンドは2つの場所に存在します：

#### 1. グローバル（全プロジェクト共通）
**場所**: `~/.claude/commands/quality-check.md`

**更新方法**:
```bash
cp ~/dev/ai/scripts/.claude/commands/quality-check.md ~/.claude/commands/
```

このグローバルコマンドは、まだQuality Guardianをインストールしていないプロジェクトで使用されます。

#### 2. ローカル（プロジェクト個別）
**場所**: `.claude/commands/quality-check.md`

Team Modeでインストールすると自動的に作成されます。ローカルコマンドは**グローバルより優先**されます。

#### カスタムコマンドの動作（v1.2.13+）

**キャッシュを使わない設計**:
1. ローカルの`<QUALITY_GUARDIAN_PATH>/VERSION`を直接読む
2. プロジェクトの`.quality-guardian.json`と比較
3. 必要に応じてアップデート実行

**v1.2.5以降の改善**:
- バージョン検出・比較・アップデートは install.sh が自動処理
- ユーザー設定は自動的に保持
- 同一セッション内でも最新バージョンを常に検知

**テンプレートファイル**:
- グローバル用: `~/dev/ai/scripts/.claude/commands/quality-check.md`
- ローカル用: Team Modeインストール時に自動作成

---

## 🛡️ Legacy: AI Quality Enforcer（旧バージョン）

Claude Codeで開発する全プロジェクトの品質を技術的に強制するシステムです。

**注意: 現在はQuality Guardianへの移行を推奨しています。**

## 🚀 クイックスタート

### 1. インストール（新規プロジェクト）

```bash
# 任意のプロジェクトディレクトリで実行
cd ~/dev/your-project
bash ~/dev/ai/scripts/install-ai-quality.sh
```

### 2. 基本的な使用方法

```bash
# 品質チェック実行
ai-quality check

# 監視モード（ファイル変更を自動検知）
ai-quality watch

# 違反レポート表示
ai-quality report
```

## 📋 機能

### 自動チェック項目
- ✅ TypeScript構文エラー検出
- ✅ ESLintルール違反検出
- ✅ テスト成功率100%強制
- ✅ ビルド成功確認
- ✅ コード品質基準維持

### 違反時の動作
- 🚫 コミットをブロック
- 📝 違反を永続的に記録
- 🔄 品質低下時は自動リバート（オプション）

## 🔧 設定

### `.ai-quality-config.json`

```json
{
  "checks": {
    "typescript": true,
    "eslint": true,
    "tests": true,
    "build": false,
    "prettier": true
  },
  "thresholds": {
    "test_coverage": 80,
    "test_pass_rate": 100,
    "max_typescript_errors": 0,
    "max_eslint_errors": 0
  },
  "auto_revert": true,
  "block_on_failure": true
}
```

## 📦 Node.jsプロジェクトでの使用

インストール後、package.jsonに以下のスクリプトが自動追加されます：

```json
{
  "scripts": {
    "ai:check": "ai-quality check",
    "ai:watch": "ai-quality watch",
    "ai:report": "ai-quality report",
    "quality:enforce": "ai-quality check && echo '✅ 品質基準クリア'"
  }
}
```

使用例：
```bash
npm run ai:check
npm run ai:watch
npm run ai:report
```

## 🔄 Git Integration

### Pre-commitフック
自動的にGit pre-commitフックが設定され、コミット前に品質チェックが実行されます。

```bash
# 品質基準を満たさない場合
git commit -m "低品質なコード"
# → ❌ コミットがブロックされます

# 品質基準を満たす場合
git commit -m "高品質なコード"
# → ✅ コミット成功
```

## 📊 レポート機能

### 違反レポート確認
```bash
ai-quality report

# 出力例：
📊 AI Quality Report
========================================
総違反数: 5

最近の違反:
  2024-01-20T10:30:00Z: TYPESCRIPT_ERROR
  2024-01-20T10:25:00Z: TEST_FAILURE
  2024-01-20T10:20:00Z: BUILD_FAILURE
```

## 🌍 対応プロジェクトタイプ

- ✅ Next.js
- ✅ React
- ✅ Vue.js
- ✅ Node.js
- ✅ TypeScript
- ✅ JavaScript
- 🔜 Rust（開発中）
- 🔜 Go（開発中）
- 🔜 Python（開発中）

## 🛠️ トラブルシューティング

### `ai-quality: command not found`

```bash
# PATHに追加
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# zshの場合
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 監視モードが動作しない

```bash
# macOSの場合
brew install fswatch

# Ubuntuの場合
sudo apt-get install inotify-tools
```

## 📝 ログファイル

- `.ai-quality.log` - 実行ログ
- `.ai-violations.json` - 違反記録
- `.ai-quality-config.json` - 設定ファイル

## 🤝 Claude Codeとの連携

Claude Codeで開発する際、以下のルールが自動的に適用されます：

1. **コード変更前** - 品質チェック必須
2. **コード変更後** - 品質維持確認必須
3. **違反時** - 変更が自動的にブロック/リバート

## 📈 品質メトリクス

定期的な品質レポート：
```bash
# 週次レポート
ai-quality report --weekly

# 月次レポート
ai-quality report --monthly
```

## 🔒 セキュリティ

- 機密情報はログに記録されません
- 違反記録は`.gitignore`に自動追加
- ローカル実行のみ（外部送信なし）

## 📚 詳細ドキュメント

- [設定詳細](./docs/configuration.md)
- [カスタマイズガイド](./docs/customization.md)
- [API仕様](./docs/api.md)

## 📄 ライセンス

MIT License

## 🙏 貢献

改善提案やバグ報告は大歓迎です！

---

**Remember**: 品質は約束ではなく、技術的に強制されるものです。
## ⚠️ Repository Protection Notice

This repository is an **npm package distribution repository** for Claude Code skills.

### Critical Directory Structure

```
.claude/                    ← Local development ONLY (NOT distributed)
├── skills/                 ← For testing skills locally
├── agents/                 ← Fallback (legacy)
└── hooks/                  ← Local hooks only

pm-orchestrator/
└── templates/              ← DISTRIBUTED via npm install ✅
    └── .claude/
        ├── skills/         ← Install destination
        ├── agents/         ← Install destination (fallback)
        └── hooks/          ← Install destination

quality-guardian/
└── templates/              ← DISTRIBUTED via npm install ✅
```

### ⚠️ DANGER: Common Mistake

**DO NOT implement new skills in `.claude/skills/`**

❌ Wrong:
```bash
# This will NOT be distributed via npm install
.claude/skills/my-new-skill.md
```

✅ Correct:
```bash
# This will be distributed via npm install
pm-orchestrator/templates/.claude/skills/my-new-skill.md
```

### Testing Your Changes

**Always test with external installation:**

```bash
# Test that your changes work after npm install
./pm-orchestrator/scripts/test-external-install.sh
```

This script:
1. Creates a fresh temporary directory
2. Runs `npm install` from the local package
3. Verifies all files are correctly installed
4. Validates hooks and skills

### More Information

- See `.claude/CLAUDE.md` 第15原則「スキル配布リポジトリ保護」
- See `.claude/project-type.json` for repository metadata
- See `pm-orchestrator/scripts/test-external-install.sh` for testing

