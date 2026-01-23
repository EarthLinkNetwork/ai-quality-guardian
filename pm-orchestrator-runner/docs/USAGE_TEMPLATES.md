# Template & Project Settings Usage Guide

このガイドでは、テンプレート機能とプロジェクト設定の永続化について説明します。

## 概要

PM Orchestrator Runner は以下の機能を提供します：

1. **テンプレート管理** - ルールと出力形式を再利用可能なテンプレートとして保存
2. **プロジェクト設定永続化** - テンプレート選択やLLM設定をプロジェクトごとに保存
3. **起動時復元** - `/exit` やプロセス終了後も設定を保持

## テンプレート機能

### テンプレートとは

テンプレートは、タスク投入時に自動的にプロンプトに差し込まれる「ルール」と「出力形式」のセットです。

**例: Standard テンプレート**
```yaml
rules: |
  ## 完了条件
  - UI/UX破綻（白画面、クラッシュ、操作不能）は完了条件未達とする
  - テスト失敗は完了条件未達とする
  - lint/typecheck エラーは完了条件未達とする

  ## 品質基準
  - TODO/FIXME を残さない
  - 省略マーカー（...、// etc.）を残さない

outputFormat: |
  ## 出力形式
  - 変更ファイル一覧（パス）
  - 実行したテスト結果
  - 残課題（あれば）
```

### 組み込みテンプレート

以下の組み込みテンプレートが提供されています（編集不可、コピー可）：

| 名前 | 説明 |
|------|------|
| `Minimal` | 最小限のルール（品質チェックのみ） |
| `Standard` | 標準ルール（UI/UX破綻=未完了含む） |
| `Strict` | 厳格ルール（全チェック有効） |

### テンプレートコマンド

```bash
# テンプレート一覧を表示
/templates

# 新しいテンプレートを作成
/templates new

# テンプレートを編集
/templates edit <name>

# テンプレートを削除（組み込みは削除不可）
/templates delete <name>

# テンプレートを使用（選択して有効化）
/template use <name>

# テンプレート注入を無効化（選択は維持）
/template off

# テンプレート注入を有効化
/template on

# 現在のテンプレート設定を表示
/template show
```

### テンプレート一覧表示

```
> /templates

╭─────────────────────────────────────────────────────╮
│ Templates                                            │
├─────────────────────────────────────────────────────┤
│ ● Standard (builtin-standard)              [ACTIVE] │
│   標準ルール（UI/UX破綻=未完了含む）                   │
│                                                     │
│ ○ Minimal (builtin-minimal)                         │
│   最小限のルール（品質チェックのみ）                    │
│                                                     │
│ ○ Strict (builtin-strict)                           │
│   厳格ルール（全チェック有効）                         │
│                                                     │
│ ○ my-project-rules (abc-123-def)                    │
│   プロジェクト固有ルール                               │
╰─────────────────────────────────────────────────────╯
```

### テンプレートの使用

```bash
# Standard テンプレートを選択して有効化
> /template use Standard

Template 'Standard' selected and enabled.
Rules and output format will be injected into prompts.

# テンプレート注入を一時的に無効化
> /template off

Template injection disabled.
Selected template: Standard (will be used when re-enabled)

# テンプレート注入を再度有効化
> /template on

Template injection enabled.
Using template: Standard
```

### テンプレートの新規作成

```bash
> /templates new

Enter template name: my-project-rules

Enter rules (end with blank line):
## 完了条件
- すべてのテストが通ること
- TypeScript エラーがないこと

Enter output format (end with blank line):
## 出力
- 変更ファイル一覧

Template 'my-project-rules' created.
```

## プロジェクト設定

### 自動保存される設定

以下の設定はプロジェクトごとに自動保存されます：

- **テンプレート設定**
  - 選択中のテンプレートID
  - テンプレート注入の有効/無効

- **LLM設定**
  - プロバイダー（anthropic, openai等）
  - モデル（claude-3-opus等）

- **プリファレンス**
  - 自動チャンク分割
  - コスト警告の有効/無効と閾値

### 設定の確認

```bash
> /config show

╭─────────────────────────────────────────────────────╮
│ Project Settings                                     │
├─────────────────────────────────────────────────────┤
│ Project: /Users/user/my-project                      │
│                                                     │
│ Template:                                           │
│   Selected: Standard (builtin-standard)              │
│   Enabled: Yes                                      │
│                                                     │
│ LLM:                                                │
│   Provider: anthropic                               │
│   Model: claude-3-opus                              │
│                                                     │
│ Preferences:                                        │
│   Auto Chunking: Yes                                │
│   Cost Warning: Yes (threshold: $0.50)              │
╰─────────────────────────────────────────────────────╯
```

### 設定のリセット

```bash
> /config reset

Project settings reset to defaults.
```

## 保存場所

設定は以下の場所に保存されます：

```
~/.pm-orchestrator/
├── templates/
│   ├── index.json          # テンプレート一覧
│   └── {id}.json           # 各テンプレート本文
└── projects/
    ├── index.json          # プロジェクト一覧
    └── {hash}.json         # 各プロジェクト設定
```

## 注入の仕組み

テンプレートが有効な場合、プロンプトは以下の構造になります：

```
[System Prompt]
...existing system instructions...

[Injected Rules - if enabled]
---
## Injected Rules (Template: Standard)
{rulesText}
---

[User Task]
{userTask}

[Injected Output Format - if enabled]
---
## Required Output Format (Template: Standard)
{outputFormatText}
---
```

**注意**: テンプレートが無効の場合、ルールと出力形式は注入されません。これによりコンテキストの肥大化を防ぎます。

## ベストプラクティス

### 1. テンプレートは必要な時だけ有効化

```bash
# 通常のタスクではテンプレートを無効に
> /template off

# 品質チェックが必要な時だけ有効化
> /template on
> implement the feature with full test coverage
```

### 2. プロジェクト固有のルールはカスタムテンプレートで

組み込みテンプレートをベースに、プロジェクト固有のルールを追加：

```bash
> /templates new
Enter template name: my-project-strict

Enter rules:
## 完了条件
- テスト失敗は完了条件未達
- lint/typecheck エラーは完了条件未達
- このプロジェクト固有: i18n キーは必ず翻訳ファイルに追加

Enter output format:
## 出力
- 変更ファイル一覧
- 追加した i18n キー一覧
```

### 3. 設定は自動保存される

設定は変更時に自動保存されるため、明示的な保存操作は不要です。`/exit` しても次回起動時に復元されます。

## トラブルシューティング

### テンプレートが適用されない

1. テンプレートが有効か確認：
   ```bash
   > /template show
   ```

2. 有効になっていない場合は有効化：
   ```bash
   > /template on
   ```

### 設定が復元されない

1. 設定ファイルの場所を確認：
   ```bash
   ls -la ~/.pm-orchestrator/projects/
   ```

2. ファイルが破損している場合は削除（デフォルト設定で再作成される）：
   ```bash
   rm ~/.pm-orchestrator/projects/{hash}.json
   ```

### テンプレートが表示されない

1. テンプレートファイルの場所を確認：
   ```bash
   ls -la ~/.pm-orchestrator/templates/
   ```

2. index.json を確認：
   ```bash
   cat ~/.pm-orchestrator/templates/index.json
   ```

## 関連仕様

- [spec/32_TEMPLATE_INJECTION.md](../spec/32_TEMPLATE_INJECTION.md) - テンプレート注入仕様
- [spec/33_PROJECT_SETTINGS_PERSISTENCE.md](../spec/33_PROJECT_SETTINGS_PERSISTENCE.md) - プロジェクト設定永続化仕様
