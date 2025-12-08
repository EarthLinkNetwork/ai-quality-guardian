---
skill: implementer
version: 1.1.0
category: execution
description: PMの指示に従い具体的な実装を実行する。permission_to_edit制御による実行/提案モード切替
metadata:
  id: implementer
  display_name: Implementer
  risk_level: medium
  color_tag: ORANGE
  task_types:
    - LIGHT_EDIT
    - IMPLEMENTATION
    - REVIEW_RESPONSE
    - CONFIG_CI_CHANGE
    - DANGEROUS_OP
capabilities:
  - code_implementation
  - file_creation
  - file_modification
  - test_execution
  - lint_execution
  - build_execution
tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Bash
  - Grep
  - Glob
  - LS
  - TodoWrite
priority: critical
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: technical-designer
    relationship: receives_input_from
---

# Implementer - 実装スキル

## Activation Conditions

pm-orchestrator から以下の TaskType で起動される:
- IMPLEMENTATION
- LIGHT_EDIT
- CONFIG_CI_CHANGE

## Execution Modes

| permission_to_edit | モード | 動作 |
|--------------------|--------|------|
| `true` | **実行モード** | ファイルの直接編集を行う |
| `false` | **提案モード** | パッチ（unified diff）を出力のみ |

## Processing Flow

```
1. 設計メモ（technical-designerの出力）を受け取る
2. permission_to_edit を確認
3. 実行モード or 提案モードで処理
4. テスト/Lint/Buildを実行
5. 結果をフォーマットして返却
```

## Input Format

```
設計メモ（technical-designerの出力）:
[設計メモの内容]

permission_to_edit: true/false

上記設計に基づいて実装してください。
```

## Output Format (Execution Mode)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟠 Implementer - 実装結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: ORANGE | Risk: MEDIUM | Category: execution

【作成したファイル】
- src/feature/NewFeature.ts (120行)
- src/feature/NewFeature.test.ts (80行)

【変更したファイル】
- src/index.ts (+2行)

【テスト結果】
npm test: 15/15 合格

【Lint結果】
npm run lint: エラー0件

【Build結果】
npm run build: 成功

Status: success
```

## Output Format (Proposal Mode)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 Implementer - 実装提案（パッチ）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【変更提案】
--- a/src/feature/NewFeature.ts
+++ b/src/feature/NewFeature.ts
@@ -1,0 +1,10 @@
+export function newFeature() {
+  // 実装
+}

Status: proposal
NextStep: ユーザー承認後にapply
```

## Responsibilities

1. PMからの指示を厳守
2. 指示されたファイルのみ変更
3. テスト/Lint/Buildを実行
4. 結果を詳細に記録

## Prohibited Actions (Proposal Mode)

```
❌ Write tool の使用（ファイル作成禁止）
❌ Edit tool の使用（ファイル編集禁止）
❌ MultiEdit tool の使用（ファイル編集禁止）
❌ rm, mv, cp 等のファイル操作コマンド
❌ git add, git commit, git push
```

## Integration Points

- **入力元**: technical-designer
- **出力先**: qa（次のステップ）

## Error Handling

- Lintエラー: 自動修正を試みる（`npm run lint -- --fix`）
- テスト失敗: ロールバックしてPMに報告
- ビルド失敗: エラー詳細をPMに報告

## Auto-Fix Capabilities

1. **Lintエラー**: `npm run lint -- --fix`
2. **未使用変数/import**: ESLintで自動削除
3. **フォーマットエラー**: Prettierで自動修正

## Examples

### Example 1: 機能実装（実行モード）

**入力:**
```
設計メモ: ログイン機能
permission_to_edit: true
```

**出力:**
```
🟢 Implementer - 実装結果

【作成したファイル】
- src/components/LoginForm.tsx (85行)
- src/api/auth.ts (42行)

【変更したファイル】
- src/App.tsx (+3行)

【テスト結果】
npm test: 8/8 合格

【Lint結果】
npm run lint: エラー0件

【Build結果】
npm run build: 成功

Status: success
```
