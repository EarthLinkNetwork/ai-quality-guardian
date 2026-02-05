# Completion Judgment Specification for READ_INFO/REPORT

## Version
1.0.0 (2026-02-06)

## Overview

This document specifies when READ_INFO/REPORT tasks should be marked as COMPLETE vs AWAITING_RESPONSE.

## Problem Statement

Previous implementation marked tasks as COMPLETE whenever output was present, even if the output contained unanswered questions requiring user input. This led to:
- Tasks stuck in COMPLETE state with pending questions
- Users unable to reply and continue the conversation
- Broken conversation flow

## Completion Criteria

### COMPLETE
Task output:
- Contains the requested deliverable
- **No pending questions requiring user response**
- No explicit request for user confirmation

Example outputs that ARE complete:
```
The docs folder contains:
- README.md (project overview)
- API.md (API documentation)
- CHANGELOG.md (version history)

Total: 3 files, 2,450 lines.
```

### AWAITING_RESPONSE
Task output:
- Contains questions requiring user input
- Requests confirmation before proceeding
- Needs additional information to complete

Example outputs that are NOT complete (should be AWAITING_RESPONSE):
```
Before proceeding with the docs reorganization, I need clarification:

1. Do you prefer a flat or nested structure?
2. Should I include auto-generated API docs?
3. Which sections should be prioritized?

Please let me know your preferences.
```

### ERROR
- Execution failure
- Exception thrown
- Invalid output format

### INCOMPLETE
- Empty output
- Output that doesn't address the task
- Format violations

## Question Detection Algorithm

### Pattern-Based Detection

Detect questions using multiple signals:

```typescript
function hasUnansweredQuestions(output: string): boolean {
  // 1. Direct question marks with question words
  const questionPatterns = [
    /\?[\s\n]*$/m,                              // Ends with ?
    /どう(します|しましょう)か/,                  // Japanese: どうしますか
    /どちら(にします|を選び)ますか/,              // Japanese: どちらにしますか
    /よろしい(です)?か/,                         // Japanese: よろしいですか
    /確認(させて)?ください/,                     // Japanese: 確認ください
    /教えてください/,                            // Japanese: 教えてください
    /お知らせください/,                          // Japanese: お知らせください
    /please (let me know|confirm|clarify)/i,    // English
    /could you (please )?(specify|clarify)/i,   // English
    /which (option|approach|method)/i,          // English
    /do you (want|prefer|need)/i,               // English
    /should I (proceed|continue|use)/i,         // English
    /would you like/i,                          // English
  ];

  for (const pattern of questionPatterns) {
    if (pattern.test(output)) {
      return true;
    }
  }

  // 2. Numbered options awaiting selection
  const optionPatterns = [
    /[1-9]\)\s+\S/m,                            // 1) Option
    /[A-D]\)\s+\S/m,                            // A) Option
    /オプション\s*[1-9A-Z]/i,                    // オプション1
    /選択肢/,                                   // 選択肢
  ];

  let hasOptions = false;
  for (const pattern of optionPatterns) {
    if (pattern.test(output)) {
      hasOptions = true;
      break;
    }
  }

  // Options alone don't mean awaiting response
  // But options + question indicator = awaiting response
  if (hasOptions) {
    const awaitingIndicators = [
      /選んでください/,
      /お選びください/,
      /please (select|choose)/i,
      /which.*prefer/i,
    ];
    for (const indicator of awaitingIndicators) {
      if (indicator.test(output)) {
        return true;
      }
    }
  }

  return false;
}
```

### Confidence Levels

| Signal | Weight | Example |
|--------|--------|---------|
| Direct question (?) | 0.6 | "どうしますか?" |
| Confirmation request | 0.8 | "よろしいですか" |
| Options + selection request | 0.9 | "1) A 2) B を選んでください" |
| "Let me know" | 0.7 | "Please let me know" |

Threshold for AWAITING_RESPONSE: total weight >= 0.6

## Implementation

### Location
`src/utils/question-detector.ts`

### Integration Point
`src/cli/index.ts` - `createTaskExecutor()` function

### Logic Flow
```
1. Executor produces output
2. If task_type is READ_INFO or REPORT:
   a. Check hasUnansweredQuestions(output)
   b. If true -> status = AWAITING_RESPONSE
   c. If false -> status = COMPLETE (if output exists)
3. If task_type is IMPLEMENTATION:
   a. Continue with existing evidence-based judgment
```

## Examples

### Example 1: Complete (no questions)
```
Input: "現在の状態を3行で要約してください"
Output: "1. プロジェクトは開発フェーズにあります
2. 主要な機能は80%完成しています
3. テストカバレッジは75%です"
Status: COMPLETE
```

### Example 2: Awaiting Response (has questions)
```
Input: "docsフォルダを整理してください"
Output: "docs整理の方針を確認させてください:
1. フラット構造にしますか?
2. カテゴリ別にネストしますか?
どちらがよろしいですか?"
Status: AWAITING_RESPONSE
```

### Example 3: Awaiting Response (confirmation needed)
```
Input: "READMEを更新してください"
Output: "以下の変更を提案します:
- インストール手順を追加
- APIセクションを更新
この内容で進めてよろしいですか?"
Status: AWAITING_RESPONSE
```

## Testing

### Unit Tests
- `test/unit/utils/question-detector.test.ts`
- Cover all patterns in both Japanese and English
- Edge cases: code blocks with ?, rhetorical questions

### E2E Tests
- Submit prompts that trigger questions
- Verify status = AWAITING_RESPONSE
- Reply and verify continuation to COMPLETE
