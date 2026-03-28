/**
 * Tests for Review Loop Implementation
 *
 * Per spec 25_REVIEW_LOOP.md: Automatic quality judgment with PASS/REJECT/RETRY
 *
 * Tests cover:
 * - Q1-Q6 quality criteria checkers
 * - Q10-Q12 tautological test detection criteria
 * - Quality judgment engine (performQualityJudgment)
 * - Modification prompt generation
 * - ReviewLoopExecutorWrapper PASS/REJECT/RETRY flows
 * - Event emission
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import type { ExecutorResult, ExecutorTask, IExecutor, AuthCheckResult, VerifiedFile } from '../../../src/executor/claude-code-executor';
import {
  ReviewLoopExecutorWrapper,
  checkQ1FilesVerified,
  checkQ2NoTodoLeft,
  checkQ3NoOmissionMarkers,
  checkQ4NoIncompleteSyntax,
  checkQ5EvidencePresent,
  checkQ6NoEarlyTermination,
  checkQ10TautologicalTest,
  checkQ11SpecTraceability,
  checkQ12ImplementationIsolation,
  performQualityJudgment,
  generateModificationPrompt,
  generateIssuesFromCriteria,
  DEFAULT_REVIEW_LOOP_CONFIG,
  type ReviewLoopConfig,
  type CriteriaResult,
  type ReviewLoopEventCallback,
} from '../../../src/review-loop/review-loop';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal ExecutorResult for testing
 */
function createTestResult(overrides: Partial<ExecutorResult> = {}): ExecutorResult {
  return {
    executed: true,
    output: '',
    files_modified: [],
    duration_ms: 100,
    status: 'COMPLETE',
    cwd: '/tmp/test',
    verified_files: [],
    unverified_files: [],
    ...overrides,
  };
}

/**
 * Create a FakeExecutor that returns configurable results
 */
class ConfigurableFakeExecutor implements IExecutor {
  private results: ExecutorResult[];
  private callIndex: number = 0;

  constructor(results: ExecutorResult[]) {
    this.results = results;
  }

  async isClaudeCodeAvailable(): Promise<boolean> {
    return true;
  }

  async checkAuthStatus(): Promise<AuthCheckResult> {
    return { available: true, loggedIn: true };
  }

  async execute(_task: ExecutorTask): Promise<ExecutorResult> {
    const result = this.results[this.callIndex] ?? this.results[this.results.length - 1];
    this.callIndex++;
    return result;
  }
}

// ============================================================================
// Q1: Files Verified Tests
// ============================================================================

describe('Review Loop - Q1: Files Verified', () => {
  it('should PASS when verified files exist on disk', () => {
    const result = createTestResult({
      verified_files: [
        { path: '/tmp/test/hello.txt', exists: true, size: 100 },
        { path: '/tmp/test/world.txt', exists: true, size: 200 },
      ],
    });

    const criteria = checkQ1FilesVerified(result);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q1');
    assert.ok(criteria.details?.includes('2 files verified'));
  });

  it('should FAIL when unverified files exist', () => {
    const result = createTestResult({
      verified_files: [],
      unverified_files: ['/tmp/test/missing.txt'],
    });

    const criteria = checkQ1FilesVerified(result);

    assert.strictEqual(criteria.passed, false);
    assert.strictEqual(criteria.criteria_id, 'Q1');
    assert.ok(criteria.details?.includes('missing.txt'));
  });

  it('should FAIL when files_modified but none verified', () => {
    const result = createTestResult({
      files_modified: ['/tmp/test/file.txt'],
      verified_files: [],
    });

    const criteria = checkQ1FilesVerified(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('none verified'));
  });

  it('should PASS when no files expected or modified', () => {
    const result = createTestResult({
      files_modified: [],
      verified_files: [],
    });

    const criteria = checkQ1FilesVerified(result);

    assert.strictEqual(criteria.passed, true);
    assert.ok(criteria.details?.includes('No files expected'));
  });
});

// ============================================================================
// Q2: No TODO/FIXME Left Tests
// ============================================================================

describe('Review Loop - Q2: No TODO/FIXME Left', () => {
  it('should PASS when no TODO markers in output', () => {
    const result = createTestResult({
      output: 'Implementation complete. All features working.',
    });

    const criteria = checkQ2NoTodoLeft(result);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q2');
  });

  it('should FAIL when TODO marker found in output', () => {
    const result = createTestResult({
      output: 'Created file. TODO: add error handling',
    });

    const criteria = checkQ2NoTodoLeft(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('TODO'));
  });

  it('should FAIL when FIXME marker found in output', () => {
    const result = createTestResult({
      output: 'Function created. FIXME: optimize later',
    });

    const criteria = checkQ2NoTodoLeft(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('FIXME'));
  });

  it('should FAIL when TBD marker found', () => {
    const result = createTestResult({
      output: 'Interface defined. TBD: implementation details',
    });

    const criteria = checkQ2NoTodoLeft(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('TBD'));
  });

  it('should detect TODO in verified file content preview', () => {
    const result = createTestResult({
      output: 'File created successfully.',
      verified_files: [
        {
          path: '/tmp/test/file.ts',
          exists: true,
          size: 100,
          content_preview: '// TODO: implement this function',
        },
      ],
    });

    const criteria = checkQ2NoTodoLeft(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('TODO'));
    assert.ok(criteria.details?.includes('file.ts'));
  });
});

// ============================================================================
// Q3: No Omission Markers Tests
// ============================================================================

describe('Review Loop - Q3: No Omission Markers', () => {
  const patterns = DEFAULT_REVIEW_LOOP_CONFIG.omission_patterns;

  it('should PASS when no omission markers present', () => {
    const result = createTestResult({
      output: 'Complete implementation with all code.',
    });

    const criteria = checkQ3NoOmissionMarkers(result, patterns);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q3');
  });

  it('should FAIL when // 残り省略 found', () => {
    const result = createTestResult({
      output: 'function process() { // 残り省略 }',
    });

    const criteria = checkQ3NoOmissionMarkers(result, patterns);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('残り省略'));
  });

  it('should FAIL when // etc. found', () => {
    const result = createTestResult({
      output: 'const items = [a, b, // etc.]',
    });

    const criteria = checkQ3NoOmissionMarkers(result, patterns);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('etc.'));
  });

  it('should FAIL when // 以下同様 found', () => {
    const result = createTestResult({
      output: 'case 1: return "one"; // 以下同様',
    });

    const criteria = checkQ3NoOmissionMarkers(result, patterns);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('以下同様'));
  });

  it('should FAIL when ... omission found in code', () => {
    const result = createTestResult({
      output: '```\nfunction test() {\n  ...\n}\n```',
    });

    const criteria = checkQ3NoOmissionMarkers(result, patterns);

    assert.strictEqual(criteria.passed, false);
  });

  it('should detect omission in verified file content preview', () => {
    const result = createTestResult({
      output: 'File created.',
      verified_files: [
        {
          path: '/tmp/test/file.ts',
          exists: true,
          size: 100,
          content_preview: '// 残り省略',
        },
      ],
    });

    const criteria = checkQ3NoOmissionMarkers(result, patterns);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('file.ts'));
  });
});

// ============================================================================
// Q4: No Incomplete Syntax Tests
// ============================================================================

describe('Review Loop - Q4: No Incomplete Syntax', () => {
  it('should PASS when syntax is complete', () => {
    const result = createTestResult({
      output: '```javascript\nfunction test() {\n  return 42;\n}\n```',
    });

    const criteria = checkQ4NoIncompleteSyntax(result);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q4');
  });

  it('should FAIL when braces are unmatched', () => {
    const result = createTestResult({
      output: '```javascript\nfunction test() {\n  return 42;\n```',
    });

    const criteria = checkQ4NoIncompleteSyntax(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('Unmatched braces'));
  });

  it('should FAIL when brackets are unmatched', () => {
    const result = createTestResult({
      output: '```javascript\nconst arr = [1, 2, 3\n```',
    });

    const criteria = checkQ4NoIncompleteSyntax(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('Unmatched brackets'));
  });

  it('should FAIL when parentheses are unmatched', () => {
    const result = createTestResult({
      output: '```javascript\nfunction(x, y {\n}\n```',
    });

    const criteria = checkQ4NoIncompleteSyntax(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('Unmatched parentheses'));
  });

  it('should detect truncated output', () => {
    const result = createTestResult({
      output: 'The output was truncated due to length',
    });

    const criteria = checkQ4NoIncompleteSyntax(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('truncated'));
  });
});

// ============================================================================
// Q5: Evidence Present Tests
// ============================================================================

describe('Review Loop - Q5: Evidence Present', () => {
  it('should PASS when verified files exist', () => {
    const result = createTestResult({
      verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
    });

    const criteria = checkQ5EvidencePresent(result);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q5');
    assert.ok(criteria.details?.includes('verified files'));
  });

  it('should PASS with successful execution and modified files', () => {
    const result = createTestResult({
      executed: true,
      status: 'COMPLETE',
      files_modified: ['/tmp/test/file.txt'],
      verified_files: [],
    });

    const criteria = checkQ5EvidencePresent(result);

    assert.strictEqual(criteria.passed, true);
    assert.ok(criteria.details?.includes('Successful execution'));
  });

  it('should FAIL when status is NO_EVIDENCE', () => {
    const result = createTestResult({
      status: 'NO_EVIDENCE',
      verified_files: [],
    });

    const criteria = checkQ5EvidencePresent(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('NO_EVIDENCE'));
  });

  it('should FAIL when no verified evidence', () => {
    const result = createTestResult({
      executed: false,
      status: 'INCOMPLETE',
      verified_files: [],
    });

    const criteria = checkQ5EvidencePresent(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('No verified evidence'));
  });
});

// ============================================================================
// Q6: No Early Termination Tests
// ============================================================================

describe('Review Loop - Q6: No Early Termination', () => {
  const patterns = DEFAULT_REVIEW_LOOP_CONFIG.early_termination_patterns;

  it('should PASS when no termination phrases and no evidence required', () => {
    const result = createTestResult({
      output: 'Created the file as requested.',
      verified_files: [],
    });

    const criteria = checkQ6NoEarlyTermination(result, patterns);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q6');
  });

  it('should PASS when termination phrase found but evidence exists', () => {
    const result = createTestResult({
      output: '完了しました',
      verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
    });

    const criteria = checkQ6NoEarlyTermination(result, patterns);

    assert.strictEqual(criteria.passed, true);
    assert.ok(criteria.details?.includes('evidence present'));
  });

  it('should FAIL when 完了しました without evidence', () => {
    const result = createTestResult({
      output: '完了しました',
      verified_files: [],
    });

    const criteria = checkQ6NoEarlyTermination(result, patterns);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('Early termination'));
    assert.ok(criteria.details?.includes('完了しました'));
  });

  it('should FAIL when これで完了です without evidence', () => {
    const result = createTestResult({
      output: 'これで完了です',
      verified_files: [],
    });

    const criteria = checkQ6NoEarlyTermination(result, patterns);

    assert.strictEqual(criteria.passed, false);
  });

  it('should FAIL when 以上です without evidence', () => {
    const result = createTestResult({
      output: '以上です',
      verified_files: [],
    });

    const criteria = checkQ6NoEarlyTermination(result, patterns);

    assert.strictEqual(criteria.passed, false);
  });
});

// ============================================================================
// Q10: Tautological Test Detection Tests
// ============================================================================

describe('Review Loop - Q10: Tautological Test Detection', () => {
  it('should PASS when test assertions do not mirror implementation logic', () => {
    const result = createTestResult({
      output: 'expect(add(1, 2)).toBe(3)',
      verified_files: [
        {
          path: '/tmp/test/math.test.ts',
          exists: true,
          size: 200,
          content_preview: 'expect(add(1, 2)).toBe(3); // spec: simple addition',
        },
      ],
    });

    const criteria = checkQ10TautologicalTest(result);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q10');
    assert.ok(criteria.details?.includes('No tautological test patterns detected'));
  });

  it('should FAIL when expect value mirrors implementation: expect(fn(x)).toBe(fn(x))', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/calculator.test.ts',
          exists: true,
          size: 300,
          content_preview: 'expect(calculate(input)).toBe(calculate(input))',
        },
      ],
    });

    const criteria = checkQ10TautologicalTest(result);

    assert.strictEqual(criteria.passed, false);
    assert.strictEqual(criteria.criteria_id, 'Q10');
    assert.ok(criteria.details?.includes('Tautological test detected'));
  });

  it('should FAIL when expect calls private/internal implementation functions', () => {
    const result = createTestResult({
      output: 'expect(result).toBe(privateHelper(input))',
      verified_files: [],
    });

    const criteria = checkQ10TautologicalTest(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('Tautological test detected'));
  });

  it('should PASS when no test files in verified files', () => {
    const result = createTestResult({
      output: 'Implementation complete.',
      verified_files: [
        {
          path: '/tmp/test/utils.ts',
          exists: true,
          size: 100,
          content_preview: 'export function add(a: number, b: number): number { return a + b; }',
        },
      ],
    });

    const criteria = checkQ10TautologicalTest(result);

    assert.strictEqual(criteria.passed, true);
  });

  it('should detect tautological pattern with toEqual', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/transform.spec.ts',
          exists: true,
          size: 400,
          content_preview: 'expect(transform(data)).toEqual(transform(data))',
        },
      ],
    });

    const criteria = checkQ10TautologicalTest(result);

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('Tautological test detected'));
  });
});

// ============================================================================
// Q11: Spec Traceability Tests
// ============================================================================

describe('Review Loop - Q11: Spec Traceability', () => {
  it('should PASS when test descriptions contain spec: references', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/auth.test.ts',
          exists: true,
          size: 500,
          content_preview: 'describe("spec: user authentication", () => { it("spec: should validate JWT", () => {}) })',
        },
      ],
    });

    const criteria = checkQ11SpecTraceability(result);

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q11');
    assert.ok(criteria.details?.includes('spec/requirement references'));
  });

  it('should PASS when test descriptions use Given/When/Then format', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/login.test.ts',
          exists: true,
          size: 400,
          content_preview: 'it("given valid credentials, when login is called, then returns token", () => {})',
        },
      ],
    });

    const criteria = checkQ11SpecTraceability(result);

    assert.strictEqual(criteria.passed, true);
  });

  it('should PASS when test descriptions contain AC: references', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/payment.test.ts',
          exists: true,
          size: 300,
          content_preview: 'describe("AC: payment processing", () => {})',
        },
      ],
    });

    const criteria = checkQ11SpecTraceability(result);

    assert.strictEqual(criteria.passed, true);
  });

  it('should FAIL when no spec references in test descriptions', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/utils.test.ts',
          exists: true,
          size: 200,
          content_preview: 'describe("utility functions", () => { it("should add numbers", () => {}) })',
        },
      ],
    });

    const criteria = checkQ11SpecTraceability(result);

    assert.strictEqual(criteria.passed, false);
    assert.strictEqual(criteria.criteria_id, 'Q11');
    assert.ok(criteria.details?.includes('lack spec references'));
  });

  it('should PASS when no test files detected (not applicable)', () => {
    const result = createTestResult({
      output: 'Implementation complete.',
      verified_files: [
        {
          path: '/tmp/test/utils.ts',
          exists: true,
          size: 100,
          content_preview: 'export function add(a: number, b: number): number { return a + b; }',
        },
      ],
    });

    const criteria = checkQ11SpecTraceability(result);

    assert.strictEqual(criteria.passed, true);
    assert.ok(criteria.details?.includes('not applicable'));
  });

  it('should PASS when output contains test descriptions with spec references', () => {
    const result = createTestResult({
      output: 'describe("req: API rate limiting", () => { it("req: should throttle after 100 requests", () => {}) })',
      verified_files: [],
    });

    const criteria = checkQ11SpecTraceability(result);

    assert.strictEqual(criteria.passed, true);
  });

  it('should PASS when test descriptions contain REQ-123 style references', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/feature.test.ts',
          exists: true,
          size: 300,
          content_preview: 'it("REQ-42: validates input schema", () => {})',
        },
      ],
    });

    const criteria = checkQ11SpecTraceability(result);

    assert.strictEqual(criteria.passed, true);
  });
});

// ============================================================================
// Q12: Implementation Isolation Compliance Tests
// ============================================================================

describe('Review Loop - Q12: Implementation Isolation Compliance', () => {
  it('should PASS when not in TEST ISOLATION MODE (no check)', () => {
    const result = createTestResult({
      output: 'import { add } from "../src/utils";\nexpect(add(1, 2)).toBe(3)',
      verified_files: [
        {
          path: '/tmp/test/utils.test.ts',
          exists: true,
          size: 200,
          content_preview: 'import { add } from "../src/utils";\nexpect(add(1, 2)).toBe(3)',
        },
      ],
    });

    const criteria = checkQ12ImplementationIsolation(result, 'Write tests for the calculator module');

    assert.strictEqual(criteria.passed, true);
    assert.strictEqual(criteria.criteria_id, 'Q12');
    assert.ok(criteria.details?.includes('TEST ISOLATION MODE not active'));
  });

  it('should FAIL when TEST ISOLATION MODE active and test imports from src/', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/calculator.test.ts',
          exists: true,
          size: 300,
          content_preview: 'import { Calculator } from "../src/calculator";\ndescribe("Calculator", () => {})',
        },
      ],
    });

    const criteria = checkQ12ImplementationIsolation(
      result,
      '[TEST ISOLATION MODE] Write tests for calculator based on spec only'
    );

    assert.strictEqual(criteria.passed, false);
    assert.strictEqual(criteria.criteria_id, 'Q12');
    assert.ok(criteria.details?.includes('TEST ISOLATION MODE violation'));
    assert.ok(criteria.details?.includes('src/'));
  });

  it('should FAIL when TEST ISOLATION MODE active and output contains src/ import', () => {
    const result = createTestResult({
      output: 'import { helper } from "../../src/utils/helper";\nconst result = helper();',
      verified_files: [],
    });

    const criteria = checkQ12ImplementationIsolation(
      result,
      '[TEST ISOLATION MODE] Generate spec-only tests'
    );

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('TEST ISOLATION MODE violation'));
  });

  it('should PASS when TEST ISOLATION MODE active and no src/ imports', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/calculator.test.ts',
          exists: true,
          size: 300,
          content_preview: 'describe("Calculator - spec: basic arithmetic", () => { it("given 1+2, then returns 3", () => {}) })',
        },
      ],
    });

    const criteria = checkQ12ImplementationIsolation(
      result,
      '[TEST ISOLATION MODE] Write specification-driven tests'
    );

    assert.strictEqual(criteria.passed, true);
    assert.ok(criteria.details?.includes('no src/ imports detected'));
  });

  it('should detect require() style src/ imports in TEST ISOLATION MODE', () => {
    const result = createTestResult({
      output: '',
      verified_files: [
        {
          path: '/tmp/test/parser.test.ts',
          exists: true,
          size: 200,
          content_preview: 'const parser = require("../src/parser");',
        },
      ],
    });

    const criteria = checkQ12ImplementationIsolation(
      result,
      '[TEST ISOLATION MODE] Create parser tests from specification'
    );

    assert.strictEqual(criteria.passed, false);
    assert.ok(criteria.details?.includes('TEST ISOLATION MODE violation'));
  });
});

// ============================================================================
// Quality Judgment Engine Tests
// ============================================================================

describe('Review Loop - performQualityJudgment', () => {
  const config = DEFAULT_REVIEW_LOOP_CONFIG;

  it('should return PASS when all criteria pass', () => {
    const result = createTestResult({
      executed: true,
      status: 'COMPLETE',
      output: 'Implementation complete.',
      files_modified: ['/tmp/test/file.txt'],
      verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
    });

    const judgment = performQualityJudgment(result, config);

    assert.strictEqual(judgment.judgment, 'PASS');
    assert.strictEqual(judgment.failed_criteria.length, 0);
    assert.ok(judgment.criteria_results.length > 0);
  });

  it('should return REJECT when Q2 fails (TODO left)', () => {
    const result = createTestResult({
      executed: true,
      status: 'COMPLETE',
      output: 'TODO: implement error handling',
      files_modified: ['/tmp/test/file.txt'],
      verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
    });

    const judgment = performQualityJudgment(result, config);

    assert.strictEqual(judgment.judgment, 'REJECT');
    assert.ok(judgment.failed_criteria.includes('Q2'));
  });

  it('should return REJECT when Q3 fails (omission)', () => {
    const result = createTestResult({
      executed: true,
      status: 'COMPLETE',
      output: '// 残り省略',
      files_modified: ['/tmp/test/file.txt'],
      verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
    });

    const judgment = performQualityJudgment(result, config);

    assert.strictEqual(judgment.judgment, 'REJECT');
    assert.ok(judgment.failed_criteria.includes('Q3'));
  });

  it('should return RETRY when status is ERROR', () => {
    const result = createTestResult({
      executed: false,
      status: 'ERROR',
      error: 'Connection timeout',
    });

    const judgment = performQualityJudgment(result, config);

    assert.strictEqual(judgment.judgment, 'RETRY');
  });

  it('should return RETRY when status is BLOCKED', () => {
    const result = createTestResult({
      executed: false,
      status: 'BLOCKED',
      blocked_reason: 'INTERACTIVE_PROMPT',
    });

    const judgment = performQualityJudgment(result, config);

    assert.strictEqual(judgment.judgment, 'RETRY');
  });

  it('should return RETRY when status is INCOMPLETE', () => {
    const result = createTestResult({
      executed: true,
      status: 'INCOMPLETE',
      output: 'Partial execution',
    });

    const judgment = performQualityJudgment(result, config);

    assert.strictEqual(judgment.judgment, 'RETRY');
  });
});

// ============================================================================
// Modification Prompt Generation Tests
// ============================================================================

describe('Review Loop - generateModificationPrompt', () => {
  it('should generate prompt with failed criteria', () => {
    const criteriaResults: CriteriaResult[] = [
      { criteria_id: 'Q1', passed: true },
      { criteria_id: 'Q2', passed: false, details: 'TODO marker found' },
      { criteria_id: 'Q3', passed: false, details: 'Omission marker found' },
    ];

    const issues = generateIssuesFromCriteria(criteriaResults);
    const prompt = generateModificationPrompt('Create a file', criteriaResults, issues);

    assert.ok(prompt.includes('前回の出力に問題が検出されました'));
    assert.ok(prompt.includes('Q2'));
    assert.ok(prompt.includes('Q3'));
    assert.ok(prompt.includes('Create a file'));
    assert.ok(prompt.includes('修正要求'));
  });

  it('should include original prompt at the end', () => {
    const criteriaResults: CriteriaResult[] = [
      { criteria_id: 'Q2', passed: false, details: 'TODO found' },
    ];
    const issues = generateIssuesFromCriteria(criteriaResults);
    const originalPrompt = 'Create a comprehensive test suite';

    const prompt = generateModificationPrompt(originalPrompt, criteriaResults, issues);

    assert.ok(prompt.includes('前回のタスク'));
    assert.ok(prompt.includes('Create a comprehensive test suite'));
  });
});

describe('Review Loop - generateIssuesFromCriteria', () => {
  it('should map Q1 to missing_file type', () => {
    const criteriaResults: CriteriaResult[] = [
      { criteria_id: 'Q1', passed: false, details: 'File not found' },
    ];

    const issues = generateIssuesFromCriteria(criteriaResults);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].type, 'missing_file');
  });

  it('should map Q2 to todo_left type', () => {
    const criteriaResults: CriteriaResult[] = [
      { criteria_id: 'Q2', passed: false, details: 'TODO marker' },
    ];

    const issues = generateIssuesFromCriteria(criteriaResults);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].type, 'todo_left');
  });

  it('should map Q3 to omission type', () => {
    const criteriaResults: CriteriaResult[] = [
      { criteria_id: 'Q3', passed: false, details: 'Omission found' },
    ];

    const issues = generateIssuesFromCriteria(criteriaResults);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].type, 'omission');
  });

  it('should skip passed criteria', () => {
    const criteriaResults: CriteriaResult[] = [
      { criteria_id: 'Q1', passed: true },
      { criteria_id: 'Q2', passed: false, details: 'TODO' },
      { criteria_id: 'Q3', passed: true },
    ];

    const issues = generateIssuesFromCriteria(criteriaResults);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].type, 'todo_left');
  });
});

// ============================================================================
// ReviewLoopExecutorWrapper Tests
// ============================================================================

describe('Review Loop - ReviewLoopExecutorWrapper', () => {
  describe('PASS Flow', () => {
    it('should return COMPLETE on first iteration when all criteria pass', async () => {
      const successResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'Implementation complete.',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([successResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor);

      const result = await wrapper.executeWithReview({
        id: 'test-1',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      assert.strictEqual(result.final_status, 'COMPLETE');
      assert.strictEqual(result.total_iterations, 1);
      assert.strictEqual(result.iteration_history[0].judgment, 'PASS');
    });
  });

  describe('REJECT Flow', () => {
    it('should retry with modification prompt when REJECT', async () => {
      // First call: returns with TODO marker (REJECT)
      // Second call: returns clean result (PASS)
      const rejectResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'TODO: implement this',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const passResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'Fully implemented.',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([rejectResult, passResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor);

      const result = await wrapper.executeWithReview({
        id: 'test-2',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      assert.strictEqual(result.final_status, 'COMPLETE');
      assert.strictEqual(result.total_iterations, 2);
      assert.strictEqual(result.iteration_history[0].judgment, 'REJECT');
      assert.strictEqual(result.iteration_history[1].judgment, 'PASS');
      assert.ok(result.iteration_history[0].rejection_details);
    });

    it('should reach max_iterations and return INCOMPLETE', async () => {
      // All calls return with TODO marker (REJECT)
      const rejectResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'TODO: always incomplete',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([rejectResult, rejectResult, rejectResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, { max_iterations: 3 });

      const result = await wrapper.executeWithReview({
        id: 'test-3',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      assert.strictEqual(result.final_status, 'INCOMPLETE');
      assert.strictEqual(result.total_iterations, 3);
      assert.strictEqual(result.iteration_history.length, 3);
      result.iteration_history.forEach((record) => {
        assert.strictEqual(record.judgment, 'REJECT');
      });
    });
  });

  describe('RETRY Flow', () => {
    it('should retry with same prompt when RETRY', async () => {
      // First call: returns ERROR (RETRY)
      // Second call: returns success (PASS)
      const errorResult = createTestResult({
        executed: false,
        status: 'ERROR',
        error: 'Temporary failure',
      });

      const passResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'Success after retry.',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([errorResult, passResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, { retry_delay_ms: 10 });

      const result = await wrapper.executeWithReview({
        id: 'test-4',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      assert.strictEqual(result.final_status, 'COMPLETE');
      assert.strictEqual(result.total_iterations, 2);
      assert.strictEqual(result.iteration_history[0].judgment, 'RETRY');
      assert.strictEqual(result.iteration_history[1].judgment, 'PASS');
    });
  });

  describe('Event Emission', () => {
    it('should emit REVIEW_LOOP_START and REVIEW_LOOP_END events', async () => {
      const events: { type: string; content: Record<string, unknown> }[] = [];
      const eventCallback: ReviewLoopEventCallback = (type, content) => {
        events.push({ type, content });
      };

      const successResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'Done.',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([successResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, {}, eventCallback);

      await wrapper.executeWithReview({
        id: 'test-5',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      const eventTypes = events.map((e) => e.type);
      assert.ok(eventTypes.includes('REVIEW_LOOP_START'));
      assert.ok(eventTypes.includes('REVIEW_LOOP_END'));
    });

    it('should emit QUALITY_JUDGMENT event for each iteration', async () => {
      const events: { type: string; content: Record<string, unknown> }[] = [];
      const eventCallback: ReviewLoopEventCallback = (type, content) => {
        events.push({ type, content });
      };

      const rejectResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'TODO: incomplete',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const passResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'Done.',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([rejectResult, passResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, {}, eventCallback);

      await wrapper.executeWithReview({
        id: 'test-6',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      const judgmentEvents = events.filter((e) => e.type === 'QUALITY_JUDGMENT');
      assert.strictEqual(judgmentEvents.length, 2);
      assert.strictEqual(judgmentEvents[0].content.judgment, 'REJECT');
      assert.strictEqual(judgmentEvents[1].content.judgment, 'PASS');
    });

    it('should emit REJECTION_DETAILS and MODIFICATION_PROMPT on REJECT', async () => {
      const events: { type: string; content: Record<string, unknown> }[] = [];
      const eventCallback: ReviewLoopEventCallback = (type, content) => {
        events.push({ type, content });
      };

      const rejectResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'TODO: incomplete',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const passResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'Done.',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([rejectResult, passResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, {}, eventCallback);

      await wrapper.executeWithReview({
        id: 'test-7',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      const eventTypes = events.map((e) => e.type);
      assert.ok(eventTypes.includes('REJECTION_DETAILS'));
      assert.ok(eventTypes.includes('MODIFICATION_PROMPT'));
    });

    it('should emit REVIEW_ITERATION_START and REVIEW_ITERATION_END for each iteration', async () => {
      const events: { type: string; content: Record<string, unknown> }[] = [];
      const eventCallback: ReviewLoopEventCallback = (type, content) => {
        events.push({ type, content });
      };

      const rejectResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'TODO: incomplete',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const passResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'Done.',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([rejectResult, passResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, {}, eventCallback);

      await wrapper.executeWithReview({
        id: 'test-8',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      const startEvents = events.filter((e) => e.type === 'REVIEW_ITERATION_START');
      const endEvents = events.filter((e) => e.type === 'REVIEW_ITERATION_END');

      assert.strictEqual(startEvents.length, 2);
      assert.strictEqual(endEvents.length, 2);
      assert.strictEqual(startEvents[0].content.iteration, 1);
      assert.strictEqual(startEvents[1].content.iteration, 2);
    });
  });

  describe('Configuration', () => {
    it('should use custom max_iterations', async () => {
      const rejectResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'TODO: always fail',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([
        rejectResult,
        rejectResult,
        rejectResult,
        rejectResult,
        rejectResult,
      ]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, { max_iterations: 5 });

      const result = await wrapper.executeWithReview({
        id: 'test-9',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      assert.strictEqual(result.total_iterations, 5);
      assert.strictEqual(result.iteration_history.length, 5);
    });

    it('should return ERROR when escalate_on_max is false', async () => {
      const rejectResult = createTestResult({
        executed: true,
        status: 'COMPLETE',
        output: 'TODO: always fail',
        files_modified: ['/tmp/test/file.txt'],
        verified_files: [{ path: '/tmp/test/file.txt', exists: true, size: 100 }],
      });

      const executor = new ConfigurableFakeExecutor([rejectResult, rejectResult, rejectResult]);
      const wrapper = new ReviewLoopExecutorWrapper(executor, {
        max_iterations: 3,
        escalate_on_max: false,
      });

      const result = await wrapper.executeWithReview({
        id: 'test-10',
        prompt: 'Create a file',
        workingDir: '/tmp/test',
      });

      assert.strictEqual(result.final_status, 'ERROR');
    });
  });
});
