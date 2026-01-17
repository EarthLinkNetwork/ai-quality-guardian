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


## Cross-References

- 05_DATA_MODELS.md (Task / Evidence データ構造)
- 04_COMPONENTS.md (Configuration Manager)
