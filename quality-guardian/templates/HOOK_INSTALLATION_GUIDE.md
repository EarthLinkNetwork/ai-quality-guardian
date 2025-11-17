# Claude Code Hook インストールガイド

## 概要

各プロジェクトに `.claude/hooks/user-prompt-submit.sh` を配置することで、AIが作業を開始する前にそのプロジェクトのCLAUDE.mdを確認させることができます。

---

## インストール方法

### 1. hookファイルをコピー

```bash
# 各プロジェクトのディレクトリで実行
cd /path/to/your/project

# hooksディレクトリを作成
mkdir -p .claude/hooks

# テンプレートをコピー
cp /path/to/quality-guardian/templates/hooks/user-prompt-submit.sh .claude/hooks/

# 実行権限を付与
chmod +x .claude/hooks/user-prompt-submit.sh
```

**これだけで完了です。編集は不要です。**

プロジェクト名とパスは自動検出されます。

### 2. 動作確認

Claude Codeを起動して、任意のメッセージを送信します。

以下のようなメッセージが表示されれば成功：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 このプロジェクトで作業を開始します
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

プロジェクト名: your-project
プロジェクトパス: /path/to/your-project

【必須】作業開始前に以下を実行してください：

1. CLAUDE.mdを読む
   Read("/path/to/your-project/.claude/CLAUDE.md")

2. MUST Rulesを確認
   特に以下を確認：
   - 🚨 Git Worktree Usage (MUST Rule)
   - 🚨 Branch Naming Convention
   ...
```

---

## hookが実行されるタイミング

- **ユーザーがメッセージを送信した直後**
- **AIが応答を生成する前**

つまり、AIがCLAUDE.mdを読む前に警告が表示されます。

---

## 任意のプロジェクトへのインストール例

どのプロジェクトでも同じ手順です：

```bash
# 任意のプロジェクトのディレクトリに移動
cd /path/to/your-project

# hooksディレクトリを作成
mkdir -p .claude/hooks

# テンプレートをコピー
cp /path/to/quality-guardian/templates/hooks/user-prompt-submit.sh .claude/hooks/

# 実行権限を付与
chmod +x .claude/hooks/user-prompt-submit.sh
```

**完了です。編集は不要です。**

プロジェクト名（ディレクトリ名）とパスは自動検出されます。

---

## トラブルシューティング

### hookが実行されない

**原因1: 実行権限がない**
```bash
chmod +x .claude/hooks/user-prompt-submit.sh
```

**原因2: ファイルパスが間違っている**
- `.claude/hooks/user-prompt-submit.sh` の正確なパスを確認

**原因3: シェルスクリプトの構文エラー**
```bash
bash -n .claude/hooks/user-prompt-submit.sh
```

### プロジェクト名が正しく検出されない

プロジェクト名は、hookがインストールされたディレクトリの名前（`basename`）から自動検出されます。

例：
- `/Users/masa/dev/my-project/.claude/hooks/user-prompt-submit.sh`
- プロジェクト名: `my-project`

もし期待と異なる名前が表示される場合、ディレクトリ構造を確認してください。

---

## hookの無効化

一時的に無効化したい場合：

```bash
# ファイル名を変更（.disabledを追加）
mv .claude/hooks/user-prompt-submit.sh .claude/hooks/user-prompt-submit.sh.disabled

# 再度有効化する場合
mv .claude/hooks/user-prompt-submit.sh.disabled .claude/hooks/user-prompt-submit.sh
```

---

## hookのカスタマイズ

プロジェクト固有のチェック項目を追加できます。

例：API_KEYの確認を追加

```bash
cat <<EOF

【追加の確認事項】
□ API_KEYを確認しましたか？（.env.local）
□ データベース接続先を確認しましたか？（.env.local）

EOF
```

---

## 注意事項

1. **hookはユーザーメッセージごとに実行されます**
   - 毎回警告が表示されますが、これは正常です
   - AIがCLAUDE.mdを読むことを忘れないための仕組みです

2. **hookは終了コード0で終了する必要があります**
   - 終了コード0以外を返すと、AIの処理が中断されます
   - このテンプレートは常に終了コード0を返します

3. **hookは標準入力からユーザーメッセージを受け取ります**
   - `USER_MESSAGE=$(cat)` でメッセージを取得
   - `echo "$USER_MESSAGE"` で標準出力に渡す

4. **hookの出力はAIに見えます**
   - hookが出力したメッセージはAIのコンテキストに含まれます
   - これにより、AIにCLAUDE.mdの確認を促すことができます

---

## さらなる改善案

### 1. CLAUDE.mdを自動的に読み込む

hookでCLAUDE.mdを読み込んで、その内容をAIに渡すことも可能です：

```bash
if [ -f "${PROJECT_PATH}/.claude/CLAUDE.md" ]; then
  echo "【CLAUDE.mdの内容】"
  cat "${PROJECT_PATH}/.claude/CLAUDE.md"
fi
```

ただし、これはコンテキストを大量に消費するため推奨しません。

### 2. 特定のキーワードでhookを起動

例：「ブランチを作成」「git」等のキーワードが含まれる場合のみ警告を表示

```bash
if echo "$USER_MESSAGE" | grep -qE 'ブランチ|git|checkout'; then
  # Git関連の警告を表示
fi
```

### 3. hookの実行回数を制限

セッション開始時の最初の1回のみ警告を表示：

```bash
FLAG_FILE="/tmp/claude-hook-${PROJECT_NAME}-$$"
if [ ! -f "$FLAG_FILE" ]; then
  # 警告を表示
  touch "$FLAG_FILE"
fi
```

---

## まとめ

このhookを各プロジェクトに配置することで：

✅ AIが作業を開始する前にCLAUDE.mdを確認するよう促される
✅ Git Worktree使用違反を防げる
✅ データベース認証情報の誤りを防げる
✅ 「何回も言っている」という指摘を減らせる

**各プロジェクトにインストールして、AIのルール遵守を徹底させましょう。**
