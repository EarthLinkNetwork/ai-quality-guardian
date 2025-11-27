> **⚠️ DEPRECATION NOTICE**
> このファイルの内容は [docs/PROJECT_SPEC.md](../../docs/PROJECT_SPEC.md) に移行されました。
> 今後は docs/PROJECT_SPEC.md を正式な参照先としてください。
> このファイルは後方互換性のために残されていますが、将来的に削除される可能性があります。

# MUST Rule 18: プロジェクト固有ルール確認義務

**プロジェクト固有の命名規則・構造・パターンに従う操作を行う前に、必ず既存のパターンを確認し、プロジェクトのルールに従うこと。**

## 問題の本質

AIは以下の操作で、プロジェクト固有のルールを無視する：

1. **ブランチ作成時**
   - 一般的な命名規則（feature/、bugfix/）で判断
   - プロジェクト固有のパターンを確認しない
   - 「おそらくこうだろう」と推測

2. **ファイル作成時**
   - 一般的なディレクトリ構造を想定
   - プロジェクト固有の構造を確認しない

3. **命名規則**
   - 一般的な命名（camelCase、snake_case）を使用
   - プロジェクト固有の命名規則を確認しない

## 必須手順

### 1. ブランチ作成前の確認

**必須: 既存ブランチの命名パターンを確認**

```bash
# 必須コマンド
git branch -r | grep -E "(bugfix|feature)" | head -20

# パターンを分析:
# - feature/fix-* が多い → 修正系は feature/fix-* を使う
# - bugfix/* が多い → バグ修正は bugfix/* を使う
# - プロジェクト固有のパターンがある → それに従う
```

**分析すべき内容:**

```
例1: 修正系は feature/fix-* を使うプロジェクト
- origin/feature/fix-coupon-storybook
- origin/feature/fix-received-coupon-request-fixed
- origin/feature/fix-redirect-url-1105
→ このプロジェクトでは修正系も feature/fix-* を使う

例2: バグ修正は bugfix/* を使うプロジェクト
- origin/bugfix/JPP-38692
- origin/bugfix/carousel-show-all-button
- origin/bugfix/searchitems-404-handling
→ このプロジェクトではバグ修正は bugfix/* を使う

例3: チケット番号を含むプロジェクト
- origin/feature/JPP-12345-add-new-feature
- origin/bugfix/JPP-67890-fix-login-bug
→ このプロジェクトではチケット番号を含める
```

### 2. ファイル作成前の確認

**必須: 既存のディレクトリ構造を確認**

```bash
# 例: コンポーネント作成前
ls -la src/components/
tree src/components/ -L 2

# 例: テストファイル作成前
find . -name "*.test.ts" -o -name "*.spec.ts" | head -10

# パターンを分析:
# - *.test.ts が多い → テストは *.test.ts を使う
# - *.spec.ts が多い → テストは *.spec.ts を使う
```

### 3. 命名規則の確認

**必須: 既存のファイル命名規則を確認**

```bash
# 例: コンポーネント命名規則
ls src/components/*.tsx | head -10

# パターンを分析:
# - PascalCase が多い → PascalCase を使う
# - kebab-case が多い → kebab-case を使う
```

## 禁止事項

```
❌ 既存パターンを確認せずにブランチ作成
❌ 「おそらくこうだろう」と推測
❌ 「一般的にはこうだから」と判断
❌ プロジェクト固有のルールを無視
❌ 他のプロジェクトの経験で判断
❌ 「大体のプロジェクトはこうだから」と決めつける
```

## 正しい対応パターン

### パターン1: ブランチ作成

```
タスク: 404エラーハンドリングの修正

[誤った対応]
❌ 「404修正だからbugfix/だろう」と推測
❌ bugfix/searchitems-404-handling を作成

[正しい対応]
✅ 既存ブランチを確認
   git branch -r | grep -E "(bugfix|feature)" | head -20

✅ パターンを分析
   - feature/fix-coupon-storybook
   - feature/fix-received-coupon-request-fixed
   - feature/fix-redirect-url-1105
   → 修正系は feature/fix-* を使う

✅ プロジェクトのルールに従う
   feature/fix-404-handling-for-detail-routes を作成

✅ ユーザーに報告
   「既存ブランチを確認しました。
   このプロジェクトでは修正系も feature/fix-* を使うパターンです。
   feature/fix-404-handling-for-detail-routes を作成します。」
```

### パターン2: テストファイル作成

```
タスク: 新しいテストファイルを作成

[誤った対応]
❌ 「一般的には *.test.ts だから」と判断
❌ component.test.ts を作成

[正しい対応]
✅ 既存のテストファイルを確認
   find . -name "*.test.ts" -o -name "*.spec.ts" | head -10

✅ パターンを分析
   - component.spec.ts
   - service.spec.ts
   - utils.spec.ts
   → このプロジェクトは *.spec.ts を使う

✅ プロジェクトのルールに従う
   component.spec.ts を作成
```

### パターン3: ディレクトリ構造

```
タスク: 新しいコンポーネントを作成

[誤った対応]
❌ 「一般的には src/components/ だから」と判断
❌ src/components/NewComponent.tsx を作成

[正しい対応]
✅ 既存のディレクトリ構造を確認
   tree src/ -L 2

✅ パターンを分析
   - src/app/components/ にコンポーネントが配置されている
   - src/shared/ui/ に共有コンポーネントが配置されている
   → このプロジェクトは機能別に配置

✅ 適切な場所を確認
   「このコンポーネントは特定ページ専用ですか？
   それとも共有コンポーネントですか？」

✅ ユーザーの回答に応じて配置
```

## チェックリスト

**プロジェクト固有の操作前に必ず確認:**

- [ ] **ブランチ作成前: 既存ブランチの命名規則を確認した**
- [ ] **ファイル作成前: 既存のディレクトリ構造を確認した**
- [ ] **命名規則: 既存のファイル命名規則を確認した**
- [ ] **パターン分析: 既存パターンを分析した**
- [ ] **プロジェクトルールに従う: 一般的なルールではなく、プロジェクトのルールを優先した**
- [ ] **推測しない: 「おそらく」「大体」で判断しなかった**

## 過去の問題例

### 問題例1: ブランチ命名規則の無視

**状況:**
```
既存パターン: feature/fix-* (修正系)
AI: bugfix/searchitems-404-handling を作成
理由: 「一般的には修正は bugfix/ だから」
```

**ユーザーの指摘:**
```
「今回のブランチ名もそうです、なぜfeatureではないですか?」
```

**何が問題だったか:**
1. **既存ブランチの命名規則を確認しなかった**
2. **一般的な命名規則で判断した**
3. **プロジェクト固有のルールを無視した**

**本来すべきだったこと:**
1. `git branch -r | grep -E "(bugfix|feature)"` で既存パターンを確認
2. 修正系が `feature/fix-*` に分類されていることを発見
3. プロジェクト固有のルールに従う
4. `feature/fix-404-handling-for-detail-routes` を作成

### 問題例2: テストファイル命名規則の無視

**状況:**
```
既存パターン: *.spec.ts
AI: *.test.ts を作成
理由: 「Jest では一般的に *.test.ts を使うから」
```

**ユーザーの指摘:**
```
「このプロジェクトは *.spec.ts を使っているのに、なぜ *.test.ts を作ったんですか?」
```

**本来すべきだったこと:**
1. `find . -name "*.test.ts" -o -name "*.spec.ts"` で既存パターンを確認
2. このプロジェクトは *.spec.ts を使っていることを発見
3. プロジェクト固有のルールに従う
4. *.spec.ts を作成

## なぜこれがMUST Ruleなのか

- **プロジェクトの一貫性を損なう**
- **他の開発者が混乱する**（異なる命名規則が混在）
- **CI/CDが失敗する可能性**（プロジェクト固有の設定に依存）
- **コードレビューで指摘される**（無駄な手戻り）
- **MUST Rule 1違反**（ユーザー指示「このプロジェクトのルールに従う」を無視）

## git-operation-guardianとの連携

このルールは git-operation-guardian Section 0 によって自動的にチェックされます。

**トリガー:**
- `git checkout -b` (ブランチ作成)

**git-operation-guardianが検出した場合:**
1. 既存ブランチの命名規則を確認するよう警告
2. パターンを分析するよう指示
3. プロジェクトのルールに従うよう要求

---

**Current Version: 1.0**
**Last Updated: 2025-01-10**
