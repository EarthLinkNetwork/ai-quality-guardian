# 17_PROMPT_TEMPLATE.md

# Prompt テンプレート仕様

本章は Runner が Executor に渡す Prompt の構成規則を定義する。


## Prompt 結合順序（省略禁止）

Runner は毎回、必ず以下の順で prompt を結合する。

1. global prelude
2. project prelude
3. task group prelude
4. user input
5. output format epilogue


## 各セクションの役割

### 1. global prelude

- 必ず守るルール
- 禁止事項
- 出力形式の前提

### 2. project prelude

- このプロジェクト固有の制約
- ファイル構造の説明
- 使用技術の制約

### 3. task group prelude

- この会話スレッドでの目的
- 前提条件
- これまでの文脈要約

### 4. user input

- ユーザーが入力した内容
- そのまま渡す

### 5. output format epilogue

- 必ず従う報告フォーマット
- 証跡の出力形式
- 完了条件の明示


## 制約

- すべて毎回必ず送信する
- 省略禁止
- キャッシュ禁止（毎回再構築）

---

## Mandatory Rules Auto-Injection

### 目的

Review Loop（spec/25_REVIEW_LOOP.md）の品質基準を満たすため、
Claude Code に対して「省略禁止」「不完全禁止」「証跡必須」等のルールを
毎回自動的に注入する。

### 注入ルール一覧

以下のルールは global prelude に必ず含める:

```markdown
## 絶対厳守ルール（Mandatory Rules）

1. **省略禁止（No Omission）**
   - `...` `// 残り省略` `// etc.` `// 以下同様` 等の省略マーカー禁止
   - 全てのコードを完全に出力すること

2. **不完全禁止（No Incomplete）**
   - `TODO` `FIXME` `TBD` を残さない
   - 構文エラー、閉じ括弧の欠落を残さない
   - 部分的な実装で終わらない

3. **証跡必須（Evidence Required）**
   - 完了を主張する前に、ファイルの存在を確認すること
   - 作成・変更したファイルのパスを明示すること

4. **早期終了禁止（No Early Termination）**
   - 「これで完了です」「以上です」等の早期終了宣言禁止
   - Runner が完了を判定する

5. **Fail-Closed 原則**
   - 不明な場合は安全側に倒す
   - 推測で進めない
   - 確認が必要な場合は明示する
```

### 注入タイミング

| タイミング | 注入先 | 説明 |
|-----------|--------|------|
| 毎回 | global prelude | 上記 Mandatory Rules を常に注入 |
| REJECT 時 | user input 直前 | 修正指示（Modification Prompt）を追加注入 |
| RETRY 時 | user input 直前 | 前回と同一プロンプト（追加注入なし） |

### Modification Prompt 注入（REJECT 時）

Review Loop が REJECT 判定を返した場合、以下の構造で修正指示を注入:

```markdown
## 前回の出力に問題が検出されました

### 検出された問題
- [問題1の説明]
- [問題2の説明]

### 修正要求
以下の点を修正して、再度完全な実装を提供してください:
1. 省略せず全てのコードを出力する
2. TODO/FIXME を残さない
3. 全ての期待されるファイルを作成する

### 前回のタスク
[元のユーザー入力]
```

### 設定ファイル

Mandatory Rules は以下のファイルで管理:

```
.claude/prompt-templates/
  mandatory-rules.md      # Mandatory Rules 定義
  modification-template.md # REJECT 時の修正指示テンプレート
```

### Review Loop との連携

1. Prompt Assembler が Mandatory Rules を注入
2. Claude Code が実行
3. Review Loop が品質判定（PASS/REJECT/RETRY）
4. REJECT の場合、Prompt Assembler が Modification Prompt を追加注入
5. 2-4 を max_iterations まで繰り返し

---

## 設定

- prelude / epilogue は設定ファイルで変更可能
- 設定ファイルの場所: .claude/prompt-templates/


## 設定ファイル構造

```
.claude/prompt-templates/
  global-prelude.md
  project-prelude.md
  output-epilogue.md
```

task group prelude は動的に生成される。


---

## Planning Phase Rules Auto-Injection

### 目的

Task Planning フェーズ（spec/29_TASK_PLANNING.md）において、
タスクサイズ推定・チャンク判定・依存関係分析のための専用ルールを注入する。

### Planning Phase ルール一覧

Planning フェーズでは global prelude に以下を追加:

```markdown
## Planning Phase ルール

1. **サイズ推定ガイドライン**
   - タスクの複雑さを 1-10 のスコアで評価
   - 予想される変更ファイル数を推定
   - 予想されるトークン数を概算
   - 依存関係の深さを分析

2. **チャンク判定基準**
   - 推定トークン数が閾値を超える場合はチャンク化を推奨
   - 複数の独立した機能を含む場合はチャンク化を推奨
   - チャンク化する場合はサブタスク間の依存関係を明示

3. **出力フォーマット**
   - 以下の JSON 形式で分析結果を出力:
   ```json
   {
     "size_estimation": {
       "complexity_score": <1-10>,
       "estimated_file_count": <number>,
       "estimated_tokens": <number>,
       "size_category": "<XS|S|M|L|XL>"
     },
     "chunking_recommendation": {
       "should_chunk": <boolean>,
       "reason": "<string>",
       "subtasks": [...]
     }
   }
   ```
```

### Model-Aware Rules

Provider/Model 切り替え（spec/31_PROVIDER_MODEL_POLICY.md）に応じた追加ルール:

```markdown
## Model-Aware ルール

1. **コスト意識**
   - 現在のプロファイル: {profile_name}
   - コスト効率を意識した出力を心がける

2. **コンテキスト制限**
   - 現在のモデル: {model_id}
   - 最大コンテキスト: {max_context_tokens} トークン
   - 出力は {max_output_tokens} トークン以内に収める

3. **エスカレーション時の注意**
   - 前回のモデル: {previous_model}（失敗）
   - 今回のモデル: {current_model}（エスカレーション）
   - 前回の失敗理由を考慮して慎重に実行
```

### Retry Phase Rules

リトライフェーズ（spec/30_RETRY_AND_RECOVERY.md）での追加ルール:

```markdown
## Retry Phase ルール

1. **前回の失敗情報**
   - 失敗タイプ: {failure_type}
   - 失敗理由: {failure_reason}
   - リトライ回数: {retry_count}/{max_retries}

2. **修正要求**
   - {modification_hint}

3. **追加の注意**
   - 前回と同じ失敗パターンを避ける
   - より慎重に、より完全な出力を心がける
   - 省略せず全てを出力する
```

### 注入タイミング（拡張）

| タイミング | 注入先 | 説明 |
|-----------|--------|------|
| 毎回 | global prelude | Mandatory Rules を常に注入 |
| PLANNING | global prelude | Planning Phase ルールを追加注入 |
| REJECT 時 | user input 直前 | Modification Prompt を追加注入 |
| RETRY 時 | user input 直前 | Retry Phase ルールを追加注入 |
| MODEL_SWITCH 時 | global prelude | Model-Aware ルールを追加注入 |

### User Override

ユーザーは REPL コマンドで Mandatory Rules をカスタマイズ可能:

```
/rules show              現在の Mandatory Rules を表示
/rules set <rule_id>     特定ルールの有効/無効を切り替え
/rules reset             デフォルトに戻す
```

### 設定ファイル構造（拡張）

```
.claude/prompt-templates/
  mandatory-rules.md          # Mandatory Rules 定義
  modification-template.md    # REJECT 時の修正指示テンプレート
  planning-rules.md           # Planning Phase ルール（NEW）
  retry-rules.md              # Retry Phase ルール（NEW）
  model-aware-rules.md        # Model-Aware ルール（NEW）
```

---

## Cross-References

- 05_DATA_MODELS.md (Task / Evidence データ構造)
- 04_COMPONENTS.md (Configuration Manager)
- 25_REVIEW_LOOP.md (品質基準、REJECT 時の修正指示)
- 26_TASK_CHUNKING.md (サブタスクでの Prompt 注入)
- 29_TASK_PLANNING.md (Planning Phase ルール)
- 30_RETRY_AND_RECOVERY.md (Retry Phase ルール)
- 31_PROVIDER_MODEL_POLICY.md (Model-Aware ルール)
