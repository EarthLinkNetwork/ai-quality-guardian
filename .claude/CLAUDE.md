# Claude Code Configuration for AI Scripts Repository

## プロジェクト概要

このリポジトリは、AI開発を支援するための品質管理スクリプト集です。

### 主要コンポーネント

- **quality-guardian/**: 統合品質管理システム
- **legacy/**: 旧バージョンのスクリプト
- **tools/**: 各種ユーティリティ

## Quality Guardian 開発ルール

### バージョン管理の厳守

**すべてのコード変更時は必ず以下を実行すること:**

1. **バージョンアップ必須**
   - `quality-guardian/VERSION` ファイルを更新
   - `quality-guardian/install.sh` 内の version を更新
   - `quality-guardian/quality-guardian.js` 内の version を更新
   - セマンティックバージョニングに従う（例: 1.2.1 → 1.2.2）

2. **README.md の更新必須**
   - `quality-guardian/README.md` を必ず確認・更新
   - 新機能追加時は必ず README に記載
   - 変更内容を明確に説明

3. **変更前の確認フロー**
   ```bash
   # 1. README.mdを読んで現在の仕様を確認
   cat quality-guardian/README.md

   # 2. 現在のバージョンを確認
   cat quality-guardian/VERSION

   # 3. 変更実施

   # 4. バージョン更新（3箇所すべて）
   # - quality-guardian/VERSION
   # - quality-guardian/install.sh (version: "x.x.x")
   # - quality-guardian/quality-guardian.js (version: 'x.x.x')

   # 5. README更新
   ```

### 禁止事項

❌ **絶対にやってはいけないこと:**

- README.md を読まずにコード変更
- バージョンアップせずにコード変更
- ユーザーへの確認なしでの破壊的変更
- バックアップなしでの重要な変更

### ファイル構成

```
/Users/masa/dev/ai/scripts/
├── .claude/
│   └── CLAUDE.md          # この設定ファイル
├── quality-guardian/
│   ├── VERSION            # バージョン番号（現在: 1.2.2）
│   ├── README.md          # 必読ドキュメント
│   ├── install.sh         # インストーラー
│   ├── quality-guardian.js # メインスクリプト
│   ├── modules/           # 各種モジュール
│   └── INTEGRATION.md     # 統合ガイド
├── legacy/                # 旧スクリプト
├── tools/                 # ユーティリティ
└── README.md              # リポジトリ全体の説明
```

### コーディング規約

- **シェルスクリプト**: bashの慣習に従う、set -e で エラー時即座に終了
- **JavaScript**: CommonJS形式、Node.js標準モジュール優先
- **エラーハンドリング**: すべてのエラーに適切なメッセージ
- **ユーザー通知**: 絵文字を使って分かりやすく（🚀✅❌⚠️💡）

### 開発時の心構え

1. **品質管理ツールの開発者として**
   - 自分自身が作るコードも高品質であるべき
   - ユーザーが期待する動作を正確に実現
   - 予期しない動作は絶対に避ける

2. **ドキュメント優先**
   - README.md は常に最新の状態に
   - 変更履歴を明確に記録
   - ユーザーが困らない説明を心がける

3. **後方互換性の維持**
   - 既存の動作を壊さない
   - 破壊的変更は必ず事前確認

### AI開発時の特記事項

このプロジェクト自体が「AI開発の品質を守る」ツールなので、
**開発者（AI）自身がルールを厳守すること**が極めて重要です。

- バージョン管理を忘れない
- READMEを必ず読む・更新する
- ユーザーの意図を正確に理解する
- 勝手な改変をしない

---

**Current Version: 1.2.2**
**Last Updated: 2025-10-02**
