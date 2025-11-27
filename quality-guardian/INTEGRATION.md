# Quality Guardian 統合管理ガイド

既存のスクリプトとの統合・管理戦略

## 既存スクリプトとの関係

### 1. ai-quality-enforcer.sh との統合

**Quality Guardian** は `ai-quality-enforcer.sh` の完全上位互換として設計されています。

```bash
# 移行手順
# 1. Quality Guardian をインストール
bash ~/dev/ai/scripts/quality-guardian/install.sh

# 2. 既存の設定を移行
# ai-quality-enforcer の設定を .quality-guardian.json に反映

# 3. スクリプトを置換
# 既存のCIスクリプトを Quality Guardian に変更
```

### 2. install-ai-quality.sh との統合

`install-ai-quality.sh` の機能は Quality Guardian の `install.sh` に統合されました。

**移行後の利点:**
- より包括的な品質チェック
- AIのズル検出機能
- モジュラー設計
- 設定ファイルベースの管理

## 統合アーキテクチャ

```
Quality Guardian (統合品質管理)
├── baseline-monitor     # ベースライン比較
├── context-analyzer     # 文脈分析
├── invariant-checker    # 不変式チェック
├── deep-quality-analyzer # 深層品質分析
└── pr-reviewer         # PR分析

既存ツール (継続使用)
├── ESLint/Biome        # 構文チェック
├── TypeScript          # 型チェック
├── Jest/Vitest         # テスト実行
└── Prettier            # フォーマット
```

## スクリプト管理戦略

### 1. ディレクトリ構造

```
~/dev/ai/scripts/
├── .claude/                    # Claude Code設定
│   ├── agents/                 # サブエージェント定義
│   └── CLAUDE.md               # プロジェクトルール
│
├── quality-guardian/           # 統合品質管理
│   ├── cli.js                  # CLI エントリポイント
│   ├── quality-guardian.js     # メインコントローラー
│   ├── install.sh              # インストーラー
│   ├── modules/                # モジュール群
│   └── templates/              # インストール用テンプレート
│
├── pm-orchestrator/            # PM Orchestrator 実装（TypeScript）
│
└── script-manager.sh           # スクリプト管理ユーティリティ
```

### 2. 統一インターフェース

全てのプロジェクトで同じコマンド体系を使用：

```bash
# 品質管理コマンド (統一)
./quality-guardian init       # 初期化
./quality-guardian baseline   # ベースライン
./quality-guardian check      # チェック
./quality-guardian pr         # PR分析
./quality-guardian fix        # 修復

# 既存ツール (継続)
npm run lint                  # 構文チェック
npm run test                  # テスト実行
npm run typecheck            # 型チェック
```

## インストール方法

### CLI経由（推奨）

```bash
# グローバルにCLIをリンク
cd ~/dev/ai/scripts/quality-guardian
npm link

# プロジェクトにインストール
quality-guardian install /path/to/project

# Personal Mode でインストール
quality-guardian install --mode=personal

# アップグレード
quality-guardian upgrade /path/to/project
```

### 直接スクリプト実行

```bash
# 新規プロジェクト
bash ~/dev/ai/scripts/quality-guardian/install.sh /path/to/project

# 既存プロジェクト
cd existing-project
bash ~/dev/ai/scripts/quality-guardian/install.sh
```

## 設定統合例

### 既存の ai-quality-enforcer.sh 設定

```bash
# ai-quality-enforcer.sh
MIN_COVERAGE=80
MAX_MOCK_RATIO=0.3
STRICT_MODE=true
```

### Quality Guardian 設定に変換

```json
{
  "rules": {
    "testing": {
      "minCoverage": 80,
      "maxMockRatio": 0.3,
      "requireAssertions": true
    }
  },
  "modules": {
    "context": { "strictMode": true }
  }
}
```

## トラブルシューティング

### 既存スクリプトとの競合

```bash
# Quality Guardian を優先
export QUALITY_GUARDIAN_MODE=primary

# 既存スクリプトを無効化
mv ai-quality-enforcer.sh ai-quality-enforcer.sh.bak
```

### 段階的移行

```bash
# 並行運用期間
./quality-guardian check        # 新システム
bash ai-quality-enforcer.sh    # 既存システム

# 結果を比較して信頼性確認
```

## 利点の整理

### Quality Guardian の優位性

| 機能 | 既存スクリプト | Quality Guardian |
|------|-------------|-----------------|
| **AIズル検出** | ❌ なし | ✅ 完全対応 |
| **文脈理解** | ❌ 基本的 | ✅ 高度 |
| **ベースライン比較** | ❌ なし | ✅ 完全対応 |
| **モジュラー設計** | ❌ 単一スクリプト | ✅ 分離設計 |
| **設定管理** | ❌ ハードコード | ✅ JSON設定 |
| **自動修復** | ❌ 基本的 | ✅ 高度 |

### 移行の理由

1. **包括性**: AIの全ての「ズル」パターンを検出
2. **拡張性**: 新しいチェック機能を簡単に追加
3. **保守性**: モジュラー設計で管理が容易
4. **統一性**: 全プロジェクトで同じ品質基準

## 推奨プロセス

### 新規プロジェクト

```bash
# Quality Guardian のみ使用
bash ~/dev/ai/scripts/quality-guardian/install.sh
./quality-guardian init
./quality-guardian baseline
```

### 既存プロジェクト

```bash
# 1. 並行導入
bash ~/dev/ai/scripts/quality-guardian/install.sh

# 2. 比較検証
./quality-guardian check
bash ai-quality-enforcer.sh  # 比較用

# 3. 段階的移行
# 信頼性確認後、既存スクリプトを停止
```

---

**Quality Guardian により、散在していた品質管理スクリプトを統一し、AIによるコード変更の品質を包括的に管理できます。**