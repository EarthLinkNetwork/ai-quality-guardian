> **⚠️ DEPRECATION NOTICE**
> このファイルの内容は [docs/QUALITY_GUARDIAN.md](../../docs/QUALITY_GUARDIAN.md) に移行されました。
> 今後は docs/QUALITY_GUARDIAN.md を正式な参照先としてください。
> このファイルは後方互換性のために残されていますが、将来的に削除される可能性があります。

# Git操作の詳細ルール

このファイルには、Git操作に関する詳細ルールをまとめています。

## 危険なGit操作の禁止

**Git履歴を書き換える操作や、複数ブランチに影響する操作は、ユーザーの明示的な確認なしに実行してはいけない。**

### 絶対禁止のGit操作（明示的な指示がない限り）

```
❌ git filter-branch --all
❌ git filter-branch（ブランチ指定なし）
❌ git push --force origin main
❌ git push --force origin develop
❌ git reset --hard HEAD~N（コミット削除）
❌ git rebase -i（インタラクティブrebase）
❌ git commit --amend（他人のコミットの場合）
```

### 特に危険：git filter-branch --all

**`--all` フラグは全てのブランチを書き換える最も危険なオプション**

## 重要ブランチへの直接変更禁止

**main・master・develop・production・staging等の重要ブランチには、絶対に直接コミット・プッシュしてはいけない。**

### 直接変更禁止のブランチ

- `main` / `master`（本番ブランチ）
- `develop`（開発統合ブランチ）
- `production`（本番環境ブランチ）
- `staging`（ステージング環境ブランチ）
- `release/*`（リリースブランチ）
- その他、チームで保護されているブランチ

### 正しいフロー

```bash
# 1. developを最新化
git checkout develop
git pull origin develop

# 2. featureブランチ作成
git checkout -b feature/add-something

# 3. 作業・コミット
git add <files>
git commit -m "feat: Add something"

# 4. プッシュ
git push -u origin feature/add-something

# 5. PR作成
gh pr create --base develop --title "Add something"

# 6. レビュー・承認後、GitHub UIでマージ
```

## Git操作後のメッセージ表示義務

**Git操作（ブランチ作成・コミット・プッシュ）後は必ず確認メッセージを表示し、作業ごとに定期的にコミットすること。**

### ブランチ作成後

```bash
✓ ブランチを作成しました: feature/add-user-auth

次のステップ:
  git push -u origin feature/add-user-auth
  gh pr create --base main --title "Add user authentication"
```

### コミット後

```bash
✓ コミット完了: a1b2c3d feat: Add user authentication

いつでもこのコミットに戻れます:
  git reset --hard a1b2c3d

次のステップ:
  - 動作確認をしてください
  - 問題なければ次の作業に進めます
```

### プッシュ後

```bash
✓ プッシュ完了: origin/feature/add-user-auth

PR作成:
  gh pr create --base main --title "Add user authentication"

リモートブランチ:
  https://github.com/owner/repo/tree/feature/add-user-auth
```

## 定期コミット義務

**Git管理下のプロジェクトでは、作業ごとに必ずコミットする**

### 厳守事項

1. **機能追加・修正のたびにコミット**
   ```
   機能Aを実装 → コミット
   機能Bを実装 → コミット
   バグを修正 → コミット
   ```

2. **いつでも作業を戻せる状態を維持**
3. **コミットなしで次のタスクに進まない**
4. **大きな変更は複数コミットに分割**

## 意図しないファイルの混入防止

**Git操作（特にcommit）時に、ユーザーが指示していないファイルを勝手にcommitに含めてはいけない。**

### commit前の必須手順

1. **git status で確認**
   ```bash
   git status
   # Staged filesを確認
   ```

2. **git diff --cached で内容確認**
   ```bash
   git diff --cached
   # Staged changesの内容を確認
   ```

3. **ファイルを明示的に指定してadd**
   ```bash
   # 正しい：ファイル名を明示
   git add src/components/RepeatBlock/RepeatBlock.test.tsx

   # 間違い：ワイルドカード
   git add .
   git add *
   ```

### 禁止事項

```
❌ git add . を使用
❌ git add * を使用
❌ git status を実行せずにcommit
❌ git diff --cached を確認せずにcommit
```

## チェックリスト

**Git操作前に必ず確認:**

- [ ] **現在のブランチ名を確認した**
- [ ] **重要ブランチ（develop/main/master）ではない**
- [ ] **featureブランチで作業している**
- [ ] **git status で staged files を確認した**
- [ ] **git diff --cached で内容を確認した**
- [ ] **意図しないファイルを含めていない**

**Git操作後に必ず実施:**

- [ ] **ブランチ作成後、プッシュコマンドとPR作成コマンドを案内した**
- [ ] **コミット後、コミットハッシュとリセットコマンドを表示した**
- [ ] **プッシュ後、PR作成コマンドとURLを案内した**
