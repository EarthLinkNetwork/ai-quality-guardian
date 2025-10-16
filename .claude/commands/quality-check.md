# Quality Guardian Check Command

**⚠️ キャッシュを使わず、毎回最新バージョンをチェックします**

## 実装手順（厳守）

### 1. 最新バージョンの確認（毎回実行）

Readツールで以下のファイルを読む（WebFetchは使わない）：
```
/Users/masa/dev/ai/scripts/quality-guardian/VERSION
```

このファイルには最新バージョン番号が書かれています。

### 2. 現在インストール済みバージョンの確認

プロジェクト内の `.quality-guardian.json` をReadツールで読んで、現在のバージョンを確認：
```json
{
  "version": "1.2.x"
}
```

### 3. バージョン比較

- **未インストール**: インストール処理へ
- **バージョンが古い**: アップデート処理へ
- **最新版**: 「既に最新版です」と報告

### 4. インストール/アップデート実行

Personal Mode か Team Mode かユーザーに確認してから、以下を実行：

```bash
bash /Users/masa/dev/ai/scripts/quality-guardian/install.sh --personal
# または
bash /Users/masa/dev/ai/scripts/quality-guardian/install.sh --team
```

## 重要なルール

1. **WebFetchは使わない** - キャッシュが効いて最新版を取得できない
2. **毎回VERSIONファイルを直接読む** - Readツールを使用
3. **バージョン比較は必ず実行** - スキップしない
4. **ユーザーにモードを確認** - Personal/Teamの選択

## 正しい実装例

```
1. Read /Users/masa/dev/ai/scripts/quality-guardian/VERSION
   → 最新: 1.2.12

2. Read .quality-guardian.json
   → 現在: 1.2.8

3. バージョン比較: 1.2.8 < 1.2.12 → アップデートが必要

4. ユーザーに確認: Personal Mode か Team Mode か

5. bash /Users/masa/dev/ai/scripts/quality-guardian/install.sh --personal
```

## 誤った実装例（やってはいけない）

❌ WebFetch https://github.com/... を使う（キャッシュで古い情報）
❌ 前回のバージョン情報を記憶して使う
❌ バージョンチェックをスキップする
