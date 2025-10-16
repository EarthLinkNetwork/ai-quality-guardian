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
- ❌ Git pre-commit hook の設定なし
- ❌ GitHub Actions workflow の作成なし
- ❌ package.json の変更なし
- ❌ .claude/CLAUDE.md の変更なし

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
├── install.sh              # インストーラー
└── README.md               # このファイル
```

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

## 更新方法

```bash
# 最新版をダウンロード
bash ~/dev/ai/scripts/quality-guardian/install.sh

# 設定を保持したまま更新
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