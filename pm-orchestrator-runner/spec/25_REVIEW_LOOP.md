# 25_REVIEW_LOOP.md

# Review Loop (Self-Improvement Loop)

本章は Runner の自己改善ループ（PASS/REJECT/RETRY）を定義する。

---

## 1. Overview

### 1.1 目的

Claude Code の出力を LLM レイヤーが自動品質判定し、不完全な場合は修正指示付きで再投入する。
ユーザーには「1 タスク」として見えるが、内部で複数回のイテレーションが発生する。

### 1.2 設計原則

- **Claude Code に「完了」を勝手に宣言させない**: Runner が唯一の完了判定者
- **Fail-Closed**: 品質判定できない場合は REJECT として再試行
- **Evidence-Based**: ファイル検証・出力検証に基づく判定
- **Persistent Logging**: 全ての PASS/REJECT/RETRY 判定とその理由を記録

---

## 2. Review Loop Flow

### 2.1 基本フロー

```
User Input
    │
    v
┌─────────────────────────────────────────┐
│ Review Loop (iteration 1...N)           │
│                                         │
│  1. Prompt Assembly (with rules)        │
│  2. Execute via Claude Code             │
│  3. Capture Output                      │
│  4. Quality Judgment (LLM Layer)        │
│     ├── PASS → Exit Loop                │
│     ├── REJECT → Modify & Re-submit     │
│     └── RETRY → Re-submit (same prompt) │
│                                         │
└─────────────────────────────────────────┘
    │
    v
Final Result (with review history)
```

### 2.2 Quality Judgment 結果

| Result   | 条件                                        | 次のアクション                     |
| -------- | ------------------------------------------- | ---------------------------------- |
| `PASS`   | 品質基準を全て満たす                        | ループ終了、タスク COMPLETE        |
| `REJECT` | 品質基準を満たさない、修正指示が生成可能    | 修正指示付きで再投入               |
| `RETRY`  | 一時的なエラー、修正指示なしで再試行可能    | 同じプロンプトで再投入             |

---

## 3. Quality Criteria (品質基準)

### 3.1 Mandatory Criteria (必須基準)

以下の基準を全て満たさない限り、PASS にならない:

| ID   | Criteria                    | Description                                           |
| ---- | --------------------------- | ----------------------------------------------------- |
| Q1   | Files Verified              | 期待されるファイルがディスク上に存在する              |
| Q2   | No TODO/FIXME Left          | 出力に TODO/FIXME/TBD が残っていない                  |
| Q3   | No Omission Markers         | `...` `// 残り省略` `etc.` 等の省略マーカーがない     |
| Q4   | No Incomplete Syntax        | 構文エラー、閉じ括弧の欠落等がない                    |
| Q5   | Evidence Present            | 完了を証明する証跡が存在する                          |
| Q6   | No Early Termination        | `これで完了です` 等の早期終了宣言がない（Runner が判定）|

### 3.2 Optional Criteria (オプション基準)

設定で有効化可能な追加基準:

| ID   | Criteria                    | Description                                           |
| ---- | --------------------------- | ----------------------------------------------------- |
| Q7   | Test Passed                 | テストが全て成功する                                  |
| Q8   | Lint Passed                 | Lint エラーがない                                     |
| Q9   | TypeCheck Passed            | 型エラーがない                                        |

---

## 4. Rejection Handling (差戻し処理)

### 4.1 Modification Prompt Generation

REJECT 時、LLM レイヤーが修正指示を自動生成する:

```typescript
interface RejectionDetails {
  criteria_failed: string[];      // 失敗した基準 ID リスト
  issues_detected: IssueDetail[]; // 検出された問題の詳細
  modification_prompt: string;    // 修正指示テキスト
  iteration: number;              // 現在のイテレーション番号
}

interface IssueDetail {
  type: 'omission' | 'incomplete' | 'missing_file' | 'early_termination' | 'syntax_error';
  location?: string;              // ファイルパスまたは出力位置
  description: string;            // 問題の説明
  suggestion?: string;            // 修正提案
}
```

### 4.2 Modification Prompt Template

```markdown
## 前回の出力に問題が検出されました

### 検出された問題
{{#each issues_detected}}
- **{{type}}**: {{description}}
  {{#if location}}場所: {{location}}{{/if}}
  {{#if suggestion}}提案: {{suggestion}}{{/if}}
{{/each}}

### 修正要求
以下の点を修正して、再度完全な実装を提供してください:

1. 省略せず全てのコードを出力する
2. TODO/FIXME を残さない
3. 全ての期待されるファイルを作成する
4. 「完了です」等の早期終了宣言をしない

### 前回のタスク
{{original_prompt}}
```

---

## 5. Iteration Control (イテレーション制御)

### 5.1 設定

```typescript
interface ReviewLoopConfig {
  max_iterations: number;         // 最大イテレーション数（デフォルト: 3）
  retry_delay_ms: number;         // RETRY 間の待機時間（デフォルト: 1000）
  escalate_on_max: boolean;       // 最大到達時にユーザーに問い合わせるか
}
```

### 5.2 最大イテレーション到達時の動作

`max_iterations` に到達した場合:

- `escalate_on_max: true` → ユーザーに確認（AWAITING_RESPONSE 状態へ）
- `escalate_on_max: false` → INCOMPLETE として終了

### 5.3 イテレーション履歴

各イテレーションの情報を保持:

```typescript
interface IterationRecord {
  iteration: number;
  started_at: string;              // ISO 8601
  ended_at: string;                // ISO 8601
  judgment: 'PASS' | 'REJECT' | 'RETRY';
  criteria_results: CriteriaResult[];
  rejection_details?: RejectionDetails;
  executor_output_ref: string;     // 生ログへの参照
}

interface CriteriaResult {
  criteria_id: string;             // Q1, Q2, ...
  passed: boolean;
  details?: string;
}
```

---

## 6. Logging Requirements (ログ要件)

### 6.1 必須ログイベント

Review Loop は以下のイベントを必ずログに記録する:

| Event Type              | Visibility | Description                              |
| ----------------------- | ---------- | ---------------------------------------- |
| `REVIEW_LOOP_START`     | summary    | Review Loop 開始                         |
| `REVIEW_ITERATION_START`| full       | イテレーション開始                       |
| `QUALITY_JUDGMENT`      | summary    | 品質判定結果（PASS/REJECT/RETRY）        |
| `REJECTION_DETAILS`     | full       | REJECT 時の詳細（失敗基準、問題、修正指示）|
| `MODIFICATION_PROMPT`   | full       | 修正指示プロンプト全文                   |
| `REVIEW_ITERATION_END`  | full       | イテレーション終了                       |
| `REVIEW_LOOP_END`       | summary    | Review Loop 終了（最終結果）             |

### 6.2 イベント構造例

```json
{
  "event_type": "QUALITY_JUDGMENT",
  "timestamp": "2025-01-23T10:00:30.000Z",
  "visibility": "summary",
  "content": {
    "iteration": 2,
    "judgment": "REJECT",
    "criteria_failed": ["Q2", "Q3"],
    "summary": "TODO markers and omission detected"
  }
}
```

```json
{
  "event_type": "REJECTION_DETAILS",
  "timestamp": "2025-01-23T10:00:30.100Z",
  "visibility": "full",
  "content": {
    "issues_detected": [
      {
        "type": "omission",
        "location": "src/utils.ts:45",
        "description": "Code ends with '// 残りは同様に実装'",
        "suggestion": "Implement all remaining functions without omission"
      }
    ],
    "modification_prompt": "## 前回の出力に問題が検出されました..."
  }
}
```

---

## 7. Integration with Existing Components

### 7.1 Executor との統合

```typescript
interface ReviewLoopExecutorWrapper {
  // Executor を Review Loop でラップ
  executeWithReview(
    task: Task,
    config: ReviewLoopConfig
  ): Promise<ReviewLoopResult>;
}

interface ReviewLoopResult {
  final_status: 'COMPLETE' | 'INCOMPLETE' | 'ERROR';
  total_iterations: number;
  iteration_history: IterationRecord[];
  final_output: ExecutorResult;
}
```

### 7.2 Queue Store との統合

- Review Loop 中は QueueItem の status は `RUNNING` のまま
- 内部イテレーションは QueueItem に直接影響しない
- Review Loop 完了後、最終結果に基づいて status を更新

### 7.3 Web UI との統合

Web UI は Review Loop の状態を表示:

- 現在のイテレーション番号
- 前回の判定結果
- イテレーション履歴（展開可能）

---

## 8. Fail-Closed Principles

### 8.1 判定不能時の動作

LLM レイヤーが品質判定できない場合:

- 出力が空 → REJECT
- パース不能 → REJECT
- タイムアウト → RETRY（最大 2 回）
- LLM エラー → RETRY（最大 2 回）

### 8.2 安全側への倒し込み

不明な状況では常に REJECT:

```
判定可能で基準を満たす → PASS
判定可能で基準を満たさない → REJECT
判定不能（エラー等） → REJECT
一時的なエラー → RETRY（回数制限あり）
```

---

## 9. Configuration

### 9.1 設定ファイル

```json
// .claude/review-loop.json
{
  "enabled": true,
  "max_iterations": 3,
  "retry_delay_ms": 1000,
  "escalate_on_max": true,
  "criteria": {
    "mandatory": ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
    "optional": []
  },
  "omission_patterns": [
    "...",
    "// 残り省略",
    "// etc.",
    "// 以下同様",
    "/* 省略 */",
    "// ...",
    "// remaining",
    "// and so on"
  ],
  "early_termination_patterns": [
    "これで完了です",
    "以上です",
    "完了しました",
    "This completes",
    "Done.",
    "That's all"
  ]
}
```

---

## 10. Cross-References

- spec/13_LOGGING_AND_OBSERVABILITY.md (ログイベント定義)
- spec/17_PROMPT_TEMPLATE.md (Modification Prompt の注入)
- spec/06_CORRECTNESS_PROPERTIES.md (Evidence 検証)
- spec/20_QUEUE_STORE.md (Queue との統合)
- spec/26_TASK_CHUNKING.md (サブタスクでの Review Loop)

## 11. Template-Selected Evaluators

### 11.1 概要

Review Loop は、選択されたテンプレートに応じて追加のエバリュエーターを実行する。
これにより、テンプレート固有の品質基準を適用できる。

### 11.2 設計原則

- **ゼロオーバーヘッド**: テンプレートが選択されていない場合、追加のエバリュエーターは実行されない
- **プラガブル**: 新しいテンプレートに対応するエバリュエーターを追加可能
- **独立動作**: 既存の Q1-Q6 チェックに影響しない
- **Fail-Closed**: エバリュエーターでエラーが発生した場合、REJECT として扱う

### 11.3 エバリュエーター起動フロー

```
Review Loop 実行
    │
    ├── Q1-Q6 品質チェック（必須）
    │
    ├── activeTemplateId を確認
    │   │
    │   ├── [activeTemplateId === 'goal_drift_guard']
    │   │   └── Goal Drift Guard Evaluator (GD1-GD5) 実行
    │   │
    │   ├── [activeTemplateId === 'other_template']
    │   │   └── Other Template Evaluator 実行
    │   │
    │   └── [activeTemplateId が null または 未対応]
    │       └── 追加エバリュエーターなし（Q1-Q6 のみ）
    │
    ▼
最終判定 (PASS/REJECT/RETRY)
```

### 11.4 エバリュエーター登録

```typescript
interface TemplateEvaluator {
  templateId: string;
  name: string;
  evaluate(output: string): TemplateEvaluatorResult;
}

interface TemplateEvaluatorResult {
  passed: boolean;
  criteriaResults: CriteriaResult[];
  structuredReasons?: StructuredReason[];
}

// 登録例
const evaluators: TemplateEvaluator[] = [
  {
    templateId: 'goal_drift_guard',
    name: 'Goal Drift Guard Evaluator',
    evaluate: evaluateGoalDrift,
  },
  // 新しいテンプレート用エバリュエーターをここに追加
];
```

### 11.5 実装済みエバリュエーター

| Template ID | Evaluator | Criteria | 詳細 |
|-------------|-----------|----------|------|
| `goal_drift_guard` | Goal Drift Guard Evaluator | GD1-GD5 | spec/32_TEMPLATE_INJECTION.md Section 11 参照 |

### 11.6 エバリュエーター結果の統合

Template-Selected Evaluator の結果は、既存の Q1-Q6 判定と統合される:

```typescript
// 最終判定ロジック
const q1to6Passed = q1to6Results.every(r => r.passed);
const templateEvalPassed = templateEvalResult?.passed ?? true;

const finalJudgment = (q1to6Passed && templateEvalPassed) ? 'PASS' : 'REJECT';
```

### 11.7 Modification Prompt への追加

Template-Selected Evaluator が失敗した場合、Modification Prompt に追加セクションが挿入される:

```markdown
## Template-Specific Issues ({{templateName}})

### 検出された問題
{{#each templateIssues}}
- **{{criteria_id}}** ({{violation_type}}): {{description}}
  Evidence: {{#each evidence}}{{.}}{{/each}}
{{/each}}

### 修正要求
{{templateSpecificInstructions}}
```

### 11.8 新しいエバリュエーターの追加手順

1. `src/review-loop/` に新しいエバリュエーターを作成
2. `TemplateEvaluator` インターフェースを実装
3. `src/review-loop/index.ts` でエクスポート
4. Review Loop に登録
5. spec/32_TEMPLATE_INJECTION.md に詳細を追加

### 11.9 Cross-References

- spec/32_TEMPLATE_INJECTION.md Section 11 (Goal Drift Guard Enforcement Hook)
- src/review-loop/goal-drift-evaluator.ts (Goal Drift Guard 実装)
- src/review-loop/goal-drift-integration.ts (Review Loop 統合)
