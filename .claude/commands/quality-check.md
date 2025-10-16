# Quality Guardian Check Command

[NOTE] キャッシュを使わず、毎回最新バージョンをチェックします

## 実装手順（厳守）

### 1. 最新バージョンの確認（毎回実行）

BashツールでcurlまたはWebFetchを使ってGitHubから最新バージョンを取得：
```bash
curl -s https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian/VERSION
```

このURLから最新バージョン番号を取得します。

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

Personal Mode か Team Mode かユーザーに確認してから、以下を実行（`--non-interactive`オプションを追加）：

```bash
curl -sSL https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian/install.sh | bash -s -- --personal --non-interactive
# または
curl -sSL https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian/install.sh | bash -s -- --team --non-interactive
```

## 重要なルール

1. **GitHubから直接取得** - 常に最新バージョンを確認
2. **毎回VERSIONファイルを取得** - curlまたはBashツールを使用
3. **バージョン比較は必ず実行** - スキップしない
4. **ユーザーにモードを確認** - Personal/Teamの選択

## 正しい実装例

```
1. curl https://raw.githubusercontent.com/.../VERSION
   → 最新: 1.2.12

2. Read .quality-guardian.json
   → 現在: 1.2.8

3. バージョン比較: 1.2.8 < 1.2.12 → アップデートが必要

4. ユーザーに確認: Personal Mode か Team Mode か

5. curl -sSL https://raw.githubusercontent.com/.../install.sh | bash -s -- --personal --non-interactive
```

## 誤った実装例（やってはいけない）

[NG] WebFetch https://github.com/... を使う（キャッシュで古い情報）
[NG] 前回のバージョン情報を記憶して使う
[NG] バージョンチェックをスキップする
