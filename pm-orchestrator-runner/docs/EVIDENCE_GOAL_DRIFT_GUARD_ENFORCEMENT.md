# Goal Drift Guard Enforcement 実機証跡

## 概要

このドキュメントは Goal Drift Guard Enforcement 機能の動作証跡を記録します。

- **作成日**: 2026-01-24
- **仕様参照**:
  - `spec/32_TEMPLATE_INJECTION.md` Section 11 (Goal Drift Guard Enforcement Hook)
  - `spec/25_REVIEW_LOOP.md` Section 11 (Template-Selected Evaluators)
- **テスト実行環境**: Node.js + Mocha

## 機能概要

### Goal Drift Guard Enforcement とは

Goal_Drift_Guard テンプレートが選択されている場合、Review Loop が追加のエンフォースメントチェック（GD1-GD5）を実行する機能:

1. **GD1 (No Escape Phrases)**: "if needed", "optional" 等のエスケープフレーズを検出
2. **GD2 (No Premature Completion)**: "basic implementation", "please verify" 等の早期完了パターンを検出
3. **GD3 (Requirement Checklist Present)**: チェックボックス形式の要件リストの存在を確認
4. **GD4 (Valid Completion Statement)**: "COMPLETE: All N requirements fulfilled" 形式の完了宣言を確認
5. **GD5 (No Scope Reduction)**: "simplified version", "for now" 等のスコープ縮小パターンを検出

### 設計原則

- **ゼロオーバーヘッド**: Goal_Drift_Guard テンプレートが選択されていない場合、エバリュエーターは実行されない
- **Fail-Closed**: エバリュエーターでエラーが発生した場合、REJECT として扱う
- **Q1-Q6 との独立性**: 既存の品質チェックに影響しない

## テスト結果サマリー

### Goal Drift Evaluator Unit Tests

\`\`\`
Goal Drift Guard Evaluator (spec/32_TEMPLATE_INJECTION.md Section 11)
  GD1: No Escape Phrases
    ✔ should detect "if needed" as escape phrase
    ✔ should detect "optional" as escape phrase
    ✔ should detect "consider adding" as escape phrase
    ✔ should pass when no escape phrases present
    ✔ should return line numbers for violations
  GD2: No Premature Completion
    ✔ should detect "basic implementation complete"
    ✔ should detect "please verify"
    ✔ should detect "skeleton"
    ✔ should pass when no premature completion patterns
  GD3: Requirement Checklist Present
    ✔ should pass when markdown checkbox present
    ✔ should pass when numbered checklist present
    ✔ should fail when no checklist present
  GD4: Valid Completion Statement
    ✔ should pass with "COMPLETE: All N requirements fulfilled"
    ✔ should pass with "INCOMPLETE: Requirements X remain"
    ✔ should fail with ambiguous completion
    ✔ should fail with no completion statement
  GD5: No Scope Reduction
    ✔ should detect "simplified version"
    ✔ should detect "for now"
    ✔ should detect "subset of"
    ✔ should pass when no scope reduction patterns
  evaluateGoalDrift
    ✔ should return passed:true when all criteria pass
    ✔ should return passed:false when any criteria fails
    ✔ should collect all violations
  shouldRunGoalDriftEvaluator
    ✔ should return true for goal_drift_guard template
    ✔ should return false for other templates
    ✔ should return false for null/undefined
  safeEvaluateGoalDrift (Fail-Closed)
    ✔ should return result on success
    ✔ should return failed result on error (fail-closed)
\`\`\`

### Goal Drift Integration Tests

\`\`\`
Goal Drift Guard Integration (spec/32_TEMPLATE_INJECTION.md Section 11)
  runGoalDriftIntegration
    ✔ should not run when template is not goal_drift_guard
    ✔ should run when template is goal_drift_guard
    ✔ should return passed:false when violations detected
  generateGoalDriftModificationSection
    ✔ should generate modification section with violations
    ✔ should include all violation details
  mapGoalDriftToQCriteria
    ✔ should map GD1 to Q2
    ✔ should map GD2, GD3, GD4 to Q5
    ✔ should map GD5 to Q3
  mapGoalDriftResultToReviewLoop
    ✔ should convert to ExtendedIssueDetail format
    ✔ should include all violations as issues
  REJECT -> RETRY -> PASS Flow Simulation
    ✔ Iteration 1: REJECT with escape phrases
    ✔ Iteration 2: REJECT with missing checklist
    ✔ Iteration 3: PASS with all criteria met
\`\`\`

## 主要な実装コンポーネント

### GD1-GD5 基準

| ID | 名前 | 検出対象 | Q基準マッピング |
|----|------|----------|----------------|
| GD1 | No Escape Phrases | "if needed", "optional", "consider adding" 等 | Q2相当 |
| GD2 | No Premature Completion | "basic implementation", "please verify" 等 | Q5相当 |
| GD3 | Requirement Checklist Present | チェックボックス形式の要件リスト | Q5相当 |
| GD4 | Valid Completion Statement | "COMPLETE: All N requirements fulfilled" 形式 | Q5相当 |
| GD5 | No Scope Reduction | "simplified version", "for now" 等 | Q3相当 |

### ファイル構成

\`\`\`
src/review-loop/
├── goal-drift-evaluator.ts      # GD1-GD5 エバリュエーター
├── goal-drift-integration.ts    # Review Loop 統合
├── index.ts                     # エクスポート
└── review-loop.ts               # 既存 Review Loop

test/unit/review-loop/
├── goal-drift-evaluator.test.ts      # エバリュエーターテスト
└── goal-drift-integration.test.ts    # 統合テスト
\`\`\`

## 再現可能なデモンストレーション

### 1. エバリュエーター実行確認

\`\`\`typescript
import {
  evaluateGoalDrift,
  shouldRunGoalDriftEvaluator,
  GOAL_DRIFT_GUARD_TEMPLATE_ID,
} from './src/review-loop';

// テンプレートIDの確認
console.log('Template ID:', GOAL_DRIFT_GUARD_TEMPLATE_ID);
// 出力: 'goal_drift_guard'

// エバリュエーター起動条件の確認
console.log(shouldRunGoalDriftEvaluator('goal_drift_guard'));  // true
console.log(shouldRunGoalDriftEvaluator('builtin-standard'));  // false
console.log(shouldRunGoalDriftEvaluator(null));                // false
\`\`\`

### 2. 違反検出の確認

\`\`\`typescript
// 違反を含む出力
const violatingOutput = \`
## Implementation

I've completed the basic implementation.
You can add more features if needed.

The task is done.
\`;

const result = evaluateGoalDrift(violatingOutput);
console.log('Passed:', result.passed);  // false
console.log('Violations:', result.violations.length);  // 2以上
// - GD1: "if needed" detected
// - GD2: "basic implementation" detected
// - GD3: No checklist present
// - GD4: No valid completion statement
\`\`\`

### 3. 正常な出力の確認

\`\`\`typescript
// 全基準を満たす出力
const validOutput = \`
## Implementation Complete

### Requirement Checklist
- [x] Feature A implemented
- [x] Feature B implemented
- [x] All tests passing

### Verification Evidence
All features verified and working.

### Completion Statement
COMPLETE: All 3 requirements fulfilled
\`;

const result = evaluateGoalDrift(validOutput);
console.log('Passed:', result.passed);  // true
console.log('Violations:', result.violations.length);  // 0
\`\`\`

### 4. テスト実行

\`\`\`bash
# Goal Drift Guard 関連テスト実行
npm test -- --grep "Goal Drift"

# 期待される出力:
#   Goal Drift Guard Evaluator
#     ✔ should detect "if needed" as escape phrase
#     ...
#   Goal Drift Guard Integration
#     ✔ REJECT -> RETRY -> PASS Flow Simulation
#     ...
\`\`\`

## ゼロオーバーヘッド原則の検証

\`\`\`typescript
import { runGoalDriftIntegration } from './src/review-loop';

// Goal Drift Guard が選択されていない場合
const result1 = runGoalDriftIntegration(executorResult, 'builtin-standard');
console.log(result1.ran);  // false
// → エバリュエーターは実行されない

// Goal Drift Guard が選択されている場合
const result2 = runGoalDriftIntegration(executorResult, 'goal_drift_guard');
console.log(result2.ran);  // true
// → エバリュエーターが実行される
\`\`\`

## Fail-Closed 原則の検証

\`\`\`typescript
import { safeEvaluateGoalDrift } from './src/review-loop';

// エラーが発生した場合でも安全に失敗
const result = safeEvaluateGoalDrift(null as any);  // 不正な入力
console.log(result.passed);  // false
console.log(result.error);   // エラーメッセージ
// → REJECT として扱われる
\`\`\`

## 禁止されるフレーズ一覧

### Escape Phrases (GD1)

- "if needed" / "if required"
- "optional" / "as needed"
- "when necessary"
- "could be added later"
- "might need" / "consider adding"
- "you may want to"

### Premature Completion Patterns (GD2)

- "basic implementation"
- "skeleton" / "scaffold" / "starter"
- "please verify" / "please check"
- "should work" / "might work"
- "I think this" / "I believe this"
- "you can test"

### Scope Reduction Patterns (GD5)

- "simplified version"
- "for now" / "for the moment"
- "subset of" / "partial"
- "minimal" / "basic version"
- "stripped down" / "reduced"

## 品質チェック結果

\`\`\`
typecheck: PASS (tsc --noEmit)
lint: PASS (新規ファイルに警告なし)
test: PASS (Goal Drift Guard 関連テスト全て通過)
build: PASS (tsc)
\`\`\`

## 結論

Goal Drift Guard Enforcement の実装は、仕様書に基づき以下を達成しました:

1. GD1-GD5 の決定論的エバリュエーター実装
2. Review Loop との統合（template-selected evaluators）
3. ゼロオーバーヘッド原則の遵守
4. Fail-Closed 原則の実装
5. 構造化された違反理由（machine-readable）
6. Modification Prompt への違反詳細の追加
7. 包括的なユニットテストと統合テスト
8. REJECT -> RETRY -> PASS フローの検証
