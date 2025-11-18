# Quality Guardian Check Command

**!! 最優先ルール !!**
**全ての応答を日本語で行うこと。英語は一切使用禁止。**
**絵文字は使わないこと。**

[NOTE] キャッシュを使わず、毎回最新バージョンをチェックします

## 実装手順（厳守）

### 1. GitHubから最新バージョンを取得（必須・毎回実行）

**重要**: この手順を絶対にスキップしてはいけません。

BashツールでcurlでGitHubから最新バージョンを取得：
```bash
curl -s https://raw.githubusercontent.com/EarthLinkNetwork/ai-quality-guardian/main/quality-guardian/VERSION
```

**必ず実行して結果を確認:**
```
例: curl実行結果 → 1.3.33
```

このURLから取得したバージョン番号を **LATEST_VERSION** として記録します。

### 2. 現在インストール済みバージョンの確認

プロジェクト内の `.quality-guardian.json` をReadツールで読んで、現在のバージョンを確認：
```json
{
  "version": "1.2.x"
}
```

このバージョン番号を **INSTALLED_VERSION** として記録します。

### 3. バージョン比較（必須）

**必ず両方のバージョンを表示してから判定:**

```
GitHubの最新版: 1.3.33 (LATEST_VERSION)
インストール済み: 1.3.25 (INSTALLED_VERSION)
比較結果: 1.3.25 < 1.3.33 → アップデートが必要
```

**判定ロジック:**
- **未インストール** (.quality-guardian.jsonが存在しない): インストール処理へ
- **INSTALLED_VERSION < LATEST_VERSION**: アップデート処理へ
- **INSTALLED_VERSION == LATEST_VERSION**: 品質チェックのみ実行
- **INSTALLED_VERSION > LATEST_VERSION**: 警告（開発版の可能性）

**重要**: 「最新バージョンXXXが既にインストールされている」という誤解を招く表現は使わない。
正しい表現: 「現在XXXがインストールされています。GitHubの最新版はYYYです。」

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
