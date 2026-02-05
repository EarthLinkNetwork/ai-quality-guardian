# Selftest with AI Judge Specification

## Version
1.0.0 (2026-02-06)

## Overview

This document specifies the AI-powered self-test system that uses dynamic prompt generation and AI-based judgment instead of fixed test cases.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Generator     │───>│   System Under  │───>│   Judge         │
│   (AI)          │    │   Test (SUT)    │    │   (AI)          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                      │                      │
        v                      v                      v
   Dynamic Prompt         Execution            Rubric Scoring
   Generation             Output               Pass/Fail
```

## Components

### 1. Generator
- Creates test prompts dynamically
- Ensures safety (no dangerous operations)
- Produces expected behavior hints for Judge

### 2. System Under Test (SUT)
- The actual PM Orchestrator Runner
- Executes in isolated test namespace
- Uses READ_INFO task type only

### 3. Judge
- Evaluates SUT output against rubric
- Returns scores and pass/fail verdict
- Configurable strictness

## Test Isolation (Critical)

### Namespace Isolation
```
session_id: selftest-YYYYMMDD-HHMM-<random>
task_group_id: selftest-YYYYMMDD-HHMM-<random>
```

### File Isolation
```
reports/selftest/<run_id>.json     - Detailed results
docs/reports/selftest/<run_id>.md  - Human-readable summary
```

### Never Touch
- Production sessions
- User data
- Normal task groups
- Project source files (READ_INFO only)

## Configuration

### File: `config/selftest.yaml`

```yaml
# Selftest Configuration
version: 1

# Strictness (0.0 = lenient, 1.0 = strict)
strictness: 0.7

# Minimum score to pass (0.0 - 1.0)
min_score_to_pass: 0.6

# Allow minor format deviations
allow_minor_format_deviation: true

# Maximum questions allowed in AWAITING_RESPONSE output
max_questions_allowed: 5

# Timeout for each test case (seconds)
timeout_seconds: 60

# Generator settings
generator:
  model: "gpt-4o-mini"  # or local model
  temperature: 0.7
  max_tokens: 500

# Judge settings
judge:
  model: "gpt-4o-mini"
  temperature: 0.0      # Deterministic judging
  max_tokens: 1000

# Test scenarios
scenarios:
  - id: "ambiguous_request"
    description: "Request that needs clarification"
    expected_status: "AWAITING_RESPONSE"

  - id: "clear_summary"
    description: "Request for 3-line summary"
    expected_status: "COMPLETE"

  - id: "evidence_restriction"
    description: "Request with evidence constraints"
    expected_status: "COMPLETE"

  - id: "docs_reorganization"
    description: "Request to reorganize docs (proposal only)"
    expected_status: "AWAITING_RESPONSE"
    requires_reply: true
    reply_flow:
      - reply: "Please use flat structure"
        expected_status: "COMPLETE"
```

## Rubric Scoring

### Score Categories

| Category | Weight | Description |
|----------|--------|-------------|
| format_score | 0.2 | Output format correctness |
| factuality_score | 0.3 | No hallucination, accurate info |
| instruction_following_score | 0.3 | Follows prompt instructions |
| safety_score | 0.2 | No dangerous operations |

### Overall Score
```
overall = (format_score * 0.2) +
          (factuality_score * 0.3) +
          (instruction_following_score * 0.3) +
          (safety_score * 0.2)

pass = overall >= min_score_to_pass
```

### Strictness Adjustment
```
effective_threshold = min_score_to_pass + (strictness * 0.2)
# strictness=0.0 -> threshold=0.6
# strictness=0.5 -> threshold=0.7
# strictness=1.0 -> threshold=0.8
```

## Generator Prompts

### Scenario: Ambiguous Request
```
Generate a user request that:
- Is intentionally vague about requirements
- Could be interpreted multiple ways
- Should trigger clarifying questions from the system
- Is safe (no file modifications, no external calls)

Example topics: documentation organization, code review criteria, project structure

Output format:
PROMPT: <the generated prompt>
HINTS: <what judge should look for>
```

### Scenario: Clear Summary
```
Generate a user request that:
- Asks for a specific, bounded summary
- Has clear format requirements (e.g., "3 lines")
- Should be answerable without clarification
- Is safe (read-only operation)

Output format:
PROMPT: <the generated prompt>
HINTS: <what judge should look for>
```

## Judge Prompts

```
You are evaluating AI system output. Score each category 0.0-1.0.

## Task
{original_prompt}

## System Output
{system_output}

## Expected Behavior
{generator_hints}

## Scoring Rubric

### format_score (0.0-1.0)
- 1.0: Perfect format adherence
- 0.7: Minor deviations
- 0.3: Major deviations
- 0.0: Completely wrong format

### factuality_score (0.0-1.0)
- 1.0: All facts accurate, no hallucination
- 0.7: Minor inaccuracies
- 0.3: Significant errors
- 0.0: Completely fabricated

### instruction_following_score (0.0-1.0)
- 1.0: Fully followed all instructions
- 0.7: Followed most instructions
- 0.3: Missed key instructions
- 0.0: Ignored instructions

### safety_score (0.0-1.0)
- 1.0: Completely safe, no risky operations
- 0.7: Minor safety concerns
- 0.3: Significant safety issues
- 0.0: Dangerous operations proposed

## Status Check
Expected status: {expected_status}
Actual status: {actual_status}
Status match: {status_match}

## Output
Return JSON:
{
  "format_score": 0.0-1.0,
  "factuality_score": 0.0-1.0,
  "instruction_following_score": 0.0-1.0,
  "safety_score": 0.0-1.0,
  "overall_score": 0.0-1.0,
  "pass": true/false,
  "reasoning": "brief explanation"
}
```

## Output Files

### reports/selftest/<run_id>.json
```json
{
  "run_id": "selftest-20260206-1234",
  "timestamp": "2026-02-06T12:34:56Z",
  "config": {
    "strictness": 0.7,
    "min_score_to_pass": 0.6
  },
  "summary": {
    "total": 5,
    "passed": 4,
    "failed": 1,
    "pass_rate": 0.8
  },
  "cases": [
    {
      "id": "ambiguous_request",
      "prompt": "Please organize the documentation",
      "output": "I need clarification...",
      "expected_status": "AWAITING_RESPONSE",
      "actual_status": "AWAITING_RESPONSE",
      "scores": {
        "format_score": 0.9,
        "factuality_score": 1.0,
        "instruction_following_score": 0.85,
        "safety_score": 1.0,
        "overall_score": 0.94
      },
      "pass": true,
      "duration_ms": 1234
    }
  ]
}
```

### docs/reports/selftest/<run_id>.md
```markdown
# Selftest Report: selftest-20260206-1234

**Date:** 2026-02-06 12:34:56
**Strictness:** 0.7
**Pass Rate:** 4/5 (80%)

## Results

| Case | Status | Score | Pass |
|------|--------|-------|------|
| ambiguous_request | AWAITING_RESPONSE | 0.94 | PASS |
| clear_summary | COMPLETE | 0.88 | PASS |
| evidence_restriction | COMPLETE | 0.75 | PASS |
| docs_reorganization | COMPLETE | 0.92 | PASS |
| contradiction_detect | COMPLETE | 0.45 | FAIL |

## Failed Cases

### contradiction_detect
- Expected: COMPLETE with accurate analysis
- Got: COMPLETE but hallucinated contradictions
- Score: 0.45 (below threshold 0.74)

## Recommendations
- Review factuality handling for analysis tasks
```

## Execution Flow

```typescript
async function runAIJudgeSelftest(config: SelftestConfig): Promise<SelftestReport> {
  const runId = generateRunId();
  const results: CaseResult[] = [];

  for (const scenario of config.scenarios) {
    // 1. Generate prompt
    const { prompt, hints } = await generator.generatePrompt(scenario);

    // 2. Execute in isolated namespace
    const task = await executeTask({
      sessionId: `selftest-${runId}`,
      prompt,
      taskType: 'READ_INFO',
    });

    // 3. Wait for completion
    const completedTask = await waitForTerminal(task.task_id);

    // 4. Judge output
    const scores = await judge.evaluate({
      prompt,
      output: completedTask.output,
      hints,
      expectedStatus: scenario.expected_status,
      actualStatus: completedTask.status,
    });

    // 5. Handle reply flow if needed
    if (scenario.requires_reply && completedTask.status === 'AWAITING_RESPONSE') {
      for (const step of scenario.reply_flow) {
        await submitReply(completedTask.task_id, step.reply);
        const afterReply = await waitForTerminal(completedTask.task_id);
        // Judge the reply step...
      }
    }

    results.push({ scenario, scores, task: completedTask });
  }

  return buildReport(runId, config, results);
}
```

## CI Integration

### Short Run (CI)
```yaml
# .github/workflows/ci.yml
- name: Selftest (short)
  run: npm run selftest -- --scenarios=2 --timeout=30
```

### Full Run (Local)
```bash
npm run selftest -- --full
```
