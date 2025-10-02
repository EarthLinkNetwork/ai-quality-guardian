# 🛡️ AI Quality Enforcer - 汎用品質強制システム

Claude Codeで開発する全プロジェクトの品質を技術的に強制するシステムです。

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