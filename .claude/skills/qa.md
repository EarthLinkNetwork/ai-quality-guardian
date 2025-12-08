---
skill: qa
version: 1.1.0
category: quality
description: 実装結果を検証し、品質問題を検出してPM Orchestratorに報告する
metadata:
  id: qa
  display_name: QA
  risk_level: medium
  color_tag: GREEN
  task_types:
    - LIGHT_EDIT
    - IMPLEMENTATION
    - REVIEW_RESPONSE
    - CONFIG_CI_CHANGE
capabilities:
  - test_verification
  - lint_verification
  - build_verification
  - functional_verification
  - coverage_analysis
tools:
  - Read
  - Bash
  - Grep
  - Glob
  - LS
  - TodoWrite
  - Task
priority: high
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: implementer
    relationship: receives_input_from
---

# QA - 品質保証スキル

## Activation Conditions

pm-orchestrator から以下の TaskType で起動される:
- IMPLEMENTATION
- LIGHT_EDIT
- CONFIG_CI_CHANGE

## Processing Flow

```
1. 実装結果（implementerの出力）を受け取る
2. ファイル存在確認
3. テスト実行
4. Lint実行
5. 型チェック実行
6. ビルド実行
7. 機能検証（必要に応じて）
8. 結果をフォーマットして返却
```

## Input Format

```
実装結果（implementerの出力）:
[implementerの結果]

実装の品質を検証してください。
テスト、Lint、Build、機能確認を実行してください。
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 QA - 品質検証結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: GREEN | Risk: MEDIUM | Category: quality

【ファイル検証】
✅ 全ファイルが存在

【テスト検証】
✅ npm test: 20/20 合格
✅ カバレッジ: 95%

【コード品質】
✅ npm run lint: エラー0件
✅ npm run typecheck: エラー0件
✅ npm run build: 成功

【機能検証】
✅ Playwright: ログインフローが正常動作

Status: pass / pass_with_warnings / fail
```

## Responsibilities

1. **実装結果の検証**
   - 機能検証: 要件通りに実装されているか
   - テスト検証: 全てのテストが通過しているか
   - コード品質: リント・型チェックが通過しているか

2. **品質問題の検出**
   - バグ: 機能が正しく動作しないか
   - パフォーマンス: 処理速度が遅くないか
   - セキュリティ: 脆弱性がないか
   - 保守性: コードが読みにくくないか

## Status Definitions

| Status | 意味 |
|--------|------|
| pass | 全検証合格 |
| pass_with_warnings | 合格だが警告あり |
| fail | 検証失敗 |

## Verification Commands

```bash
# テスト実行
npm test

# カバレッジ確認
npm run test:coverage

# Lint
npm run lint

# 型チェック
npm run typecheck

# ビルド
npm run build

# E2Eテスト（必要に応じて）
npx playwright test
```

## Integration Points

- **入力元**: implementer
- **出力先**: code-reviewer（次のステップ）

## Error Handling

- テスト失敗: 失敗詳細をPMに報告（修正は行わない）
- ビルド失敗: エラー詳細をPMに報告

## Important Rules

1. **検証のみ実行**: 修正は行わない（implementerの役割）
2. **エラー発見時**: PMに報告するだけ
3. **全検証結果を記録**: テスト/Lint/Build/機能確認

## Examples

### Example 1: 全検証合格

**入力:**
```
実装結果:
- src/components/LoginForm.tsx 作成
- src/api/auth.ts 作成
```

**出力:**
```
🔵 QA - 品質検証結果

【ファイル検証】
✅ 全ファイルが存在

【テスト検証】
✅ npm test: 12/12 合格
✅ カバレッジ: 92%

【コード品質】
✅ npm run lint: エラー0件
✅ npm run typecheck: エラー0件
✅ npm run build: 成功

Status: pass
```

### Example 2: テスト失敗

**出力:**
```
🔵 QA - 品質検証結果

【ファイル検証】
✅ 全ファイルが存在

【テスト検証】
❌ npm test: 10/12 合格、2失敗
   - LoginForm.test.tsx:42 - Expected 'success', got 'error'
   - auth.test.ts:28 - TypeError

【コード品質】
⏭ 未実行（テスト通過が先）

Status: fail
Action required: テストエラーを修正してください
```
