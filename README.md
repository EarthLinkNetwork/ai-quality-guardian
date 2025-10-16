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

**実行されない処理:**
- ❌ Git pre-commit hook の設定
- ❌ GitHub Actions workflow の作成
- ❌ package.json の変更
- ❌ .claude/CLAUDE.md の変更

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
- ✅ Personal Modeの全機能
- ✅ Git pre-commit hook 設定（全員のコミット時に品質チェック）
- ✅ GitHub Actions workflow 作成（CI/CDに統合）
- ✅ package.json に npm scripts 追加
- ✅ .claude/CLAUDE.md 更新（AIへの指示追加）

**使用例:**
- チーム全体で品質を担保したい場合
- CI/CDに統合したい場合
- 既にチームで合意が取れている場合

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
   - `/Users/masa/dev/ai/scripts/quality-guardian/README.md`
   - `/Users/masa/dev/ai/scripts/quality-guardian/INTEGRATION.md`

### 重要な注意事項

- **必ずユーザーに確認してからインストールすること**
- **Personal ModeとTeam Modeの違いを説明すること**
- **Team Modeは他の開発者に影響することを明確に伝えること**
- **インストール後は必ず動作確認を行うこと**

### カスタムコマンドの推奨実装

プロジェクトに `/quality-check` カスタムコマンドを作成する場合、以下のテンプレートを使用してください：

**`.claude/commands/quality-check.md`:**

```markdown
Read https://github.com/EarthLinkNetwork/ai-quality-guardian/blob/main/README.md の「🤖 AI（Claude Code）向けインストールガイド」セクションを読んで、そこに書かれた手順に従ってQuality Guardianをインストールしてください。

ユーザーにPersonal ModeとTeam Modeのどちらでインストールするか必ず確認してから実行すること。
```

**v1.2.5以降、バージョン管理は install.sh が自動で行います：**
- カスタムコマンドはシンプルに install.sh を呼び出すだけ
- バージョン検出・比較・アップデートは install.sh が自動処理
- ユーザー設定は自動的に保持されます

**テンプレートファイル:**
- `/Users/masa/dev/ai/scripts/.claude/commands/quality-check.md`

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