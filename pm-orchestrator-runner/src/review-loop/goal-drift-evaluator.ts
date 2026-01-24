/**
 * Goal Drift Guard Evaluator
 *
 * Per spec 32_TEMPLATE_INJECTION.md Section 2.4 and enforcement requirements
 *
 * This evaluator runs ONLY when activeTemplateId === 'goal_drift_guard'
 * and maps Goal Drift violations to existing Q1-Q6 style judgments.
 *
 * GD1: No Escape Phrases (maps to Q2-style)
 * GD2: No Premature Completion (maps to Q5-style)
 * GD3: Requirement Checklist Present (maps to Q5-style)
 * GD4: Completion Statement Valid (maps to Q5-style)
 * GD5: No Scope Reduction (maps to Q3-style)
 *
 * Design Principle:
 * - Fail-Closed: Evaluator errors result in REJECT
 * - Deterministic: No LLM calls, pattern-based detection
 * - Zero overhead when template not selected
 */

import type { ExecutorResult } from '../executor/claude-code-executor';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Goal Drift Criteria IDs
 */
export type GoalDriftCriteriaId = 'GD1' | 'GD2' | 'GD3' | 'GD4' | 'GD5';

/**
 * Escape phrase violation detail
 */
export interface EscapePhraseViolation {
  phrase: string;
  context: string;
  lineNumber?: number;
  line?: number; // Alias for backwards compatibility
}

/**
 * Premature completion violation detail
 */
export interface PrematureCompletionViolation {
  pattern: string;
  context: string;
  lineNumber?: number;
}

/**
 * Scope reduction violation detail
 */
export interface ScopeReductionViolation {
  pattern: string;
  context: string;
  lineNumber?: number;
}

/**
 * Generic violation for backward compat with tests
 */
export interface GenericViolation {
  phrase?: string;
  pattern?: string;
  context?: string;
  lineNumber?: number;
  line?: number;
  criteria_id?: GoalDriftCriteriaId;
}

/**
 * Individual criteria check result
 */
export interface GoalDriftCriteriaResult {
  criteria_id: GoalDriftCriteriaId;
  passed: boolean;
  details?: string;
  violations: GenericViolation[];
}

/**
 * Structured reason for machine-readable output
 */
export interface StructuredReason {
  criteria_id: GoalDriftCriteriaId;
  violation_type: 'escape_phrase' | 'premature_completion' | 'missing_checklist' | 'invalid_completion_statement' | 'scope_reduction';
  description: string;
  evidence: string[];
}

/**
 * Goal Drift Evaluator result
 */
export interface GoalDriftEvaluatorResult {
  passed: boolean;
  criteriaResults: GoalDriftCriteriaResult[];
  criteria_results: GoalDriftCriteriaResult[];
  failed_criteria: GoalDriftCriteriaId[];
  structured_reasons: StructuredReason[];
  violations: GenericViolation[];
  summary: string;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Goal Drift Guard template ID
 */
export const GOAL_DRIFT_GUARD_TEMPLATE_ID = 'goal_drift_guard';

/**
 * Escape phrases to detect (per spec 32_TEMPLATE_INJECTION.md Section 2.4)
 * Case-insensitive matching
 */
export const ESCAPE_PHRASES: readonly string[] = [
  'if needed',
  'if required',
  'optional',
  'as needed',
  'when necessary',
  'could be added later',
  'might need',
  'consider adding',
  'you may want to',
  'left as an exercise',
  'beyond the scope',
  'out of scope',
  'future enhancement',
  'future work',
  'not implemented yet',
  'to be determined',
  'tbd',
];

/**
 * Premature completion patterns (per spec 32_TEMPLATE_INJECTION.md Section 2.4)
 * Case-insensitive matching
 */
export const PREMATURE_COMPLETION_PATTERNS: readonly string[] = [
  'basic implementation complete',
  'basic implementation',
  'skeleton',
  'scaffold',
  'starter',
  'please verify',
  'please check',
  'you should verify',
  'you should check',
  'verify yourself',
  'check yourself',
  'left for you to',
  'up to you to',
  'i\'ll leave it to you',
];

/**
 * Scope reduction patterns
 * Case-insensitive matching
 */
export const SCOPE_REDUCTION_PATTERNS: readonly string[] = [
  'simplified version',
  'reduced scope',
  'minimal implementation',
  'basic version',
  'for now',
  'for the time being',
  'temporarily',
  'as a first step',
  'initial version',
  'partial implementation',
  'subset of',
  'instead of',
  'rather than',
];

/**
 * Valid completion statement patterns
 * Must contain one of these to be valid
 */
export const VALID_COMPLETION_PATTERNS: readonly RegExp[] = [
  /COMPLETE:\s*All\s+\d+\s+requirements?\s+fulfilled/i,
  /COMPLETE:\s*all\s+requirements?\s+met/i,
  /INCOMPLETE:\s*Requirements?\s+[\w,\s]+\s+remain/i,
  /INCOMPLETE:\s*\d+\s+requirements?\s+remain/i,
];

/**
 * Requirement checklist patterns
 * Must contain checkbox-style items
 */
export const CHECKLIST_PATTERNS: readonly RegExp[] = [
  /^[-*]\s*\[\s*[xX✓✔ ]\s*\]/m,  // - [ ] or - [x] style
  /^[-*]\s*Requirement\s+\d+:/mi, // - Requirement 1: style
  /###\s*Requirement\s+Checklist/i, // Section header
  /^\d+\.\s+.+:\s*(done|complete|implemented|finished)/mi, // 1. Feature: done style
];

// ============================================================================
// Checker Functions
// ============================================================================

/**
 * GD1: Check for escape phrases in output
 *
 * @param output - Executor output to check
 * @returns Criteria result with violations
 */
export function checkGD1NoEscapePhrases(output: string): GoalDriftCriteriaResult {
  const violations: GenericViolation[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    for (const phrase of ESCAPE_PHRASES) {
      if (lowerLine.includes(phrase.toLowerCase())) {
        // Get context (surrounding text)
        const phraseIndex = lowerLine.indexOf(phrase.toLowerCase());
        const contextStart = Math.max(0, phraseIndex - 20);
        const contextEnd = Math.min(line.length, phraseIndex + phrase.length + 20);
        const context = line.substring(contextStart, contextEnd);

        violations.push({
          phrase,
          context: context.trim(),
          lineNumber: i + 1,
          line: i + 1,
          criteria_id: 'GD1',
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      criteria_id: 'GD1',
      passed: false,
      details: 'Found ' + violations.length + ' escape phrase(s): ' + violations.slice(0, 3).map(v => '"' + v.phrase + '"').join(', ') + (violations.length > 3 ? '...' : ''),
      violations,
    };
  }

  return {
    criteria_id: 'GD1',
    passed: true,
    details: 'No escape phrases detected',
    violations: [],
  };
}

/**
 * GD2: Check for premature completion language
 *
 * @param output - Executor output to check
 * @returns Criteria result with violations
 */
export function checkGD2NoPrematureCompletion(output: string): GoalDriftCriteriaResult {
  const violations: GenericViolation[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    for (const pattern of PREMATURE_COMPLETION_PATTERNS) {
      if (lowerLine.includes(pattern.toLowerCase())) {
        const patternIndex = lowerLine.indexOf(pattern.toLowerCase());
        const contextStart = Math.max(0, patternIndex - 20);
        const contextEnd = Math.min(line.length, patternIndex + pattern.length + 20);
        const context = line.substring(contextStart, contextEnd);

        violations.push({
          phrase: pattern,
          pattern,
          context: context.trim(),
          lineNumber: i + 1,
          line: i + 1,
          criteria_id: 'GD2',
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      criteria_id: 'GD2',
      passed: false,
      details: 'Found ' + violations.length + ' premature completion pattern(s): ' + violations.slice(0, 3).map(v => '"' + v.pattern + '"').join(', ') + (violations.length > 3 ? '...' : ''),
      violations,
    };
  }

  return {
    criteria_id: 'GD2',
    passed: true,
    details: 'No premature completion patterns detected',
    violations: [],
  };
}

/**
 * GD3: Check for requirement checklist presence
 *
 * @param output - Executor output to check
 * @returns Criteria result
 */
export function checkGD3RequirementChecklistPresent(output: string): GoalDriftCriteriaResult {
  // Check for checklist patterns
  for (const pattern of CHECKLIST_PATTERNS) {
    if (pattern.test(output)) {
      return {
        criteria_id: 'GD3',
        passed: true,
        details: 'Requirement checklist detected',
        violations: [],
      };
    }
  }

  return {
    criteria_id: 'GD3',
    passed: false,
    details: 'No requirement checklist found - Goal Drift Guard requires explicit requirement tracking',
    violations: [{
      phrase: 'missing checklist',
      criteria_id: 'GD3',
    }],
  };
}

/**
 * GD4: Check for valid completion statement
 *
 * @param output - Executor output to check
 * @returns Criteria result
 */
export function checkGD4CompletionStatementValid(output: string): GoalDriftCriteriaResult {
  // Check for valid completion statement
  for (const pattern of VALID_COMPLETION_PATTERNS) {
    if (pattern.test(output)) {
      const match = output.match(pattern);
      return {
        criteria_id: 'GD4',
        passed: true,
        details: 'Valid completion statement found: "' + (match?.[0] || '') + '"',
        violations: [],
      };
    }
  }

  // Check for ambiguous completion language (should be flagged)
  const ambiguousPatterns = [
    /done\.?$/im,
    /that's all/i,
    /finished/i,
    /completed\.?$/im,
    /all set/i,
  ];

  for (const pattern of ambiguousPatterns) {
    if (pattern.test(output)) {
      return {
        criteria_id: 'GD4',
        passed: false,
        details: 'Ambiguous completion statement found - use "COMPLETE: All N requirements fulfilled" or "INCOMPLETE: Requirements X, Y, Z remain"',
        violations: [{
          phrase: 'invalid completion statement',
          criteria_id: 'GD4',
        }],
      };
    }
  }

  return {
    criteria_id: 'GD4',
    passed: false,
    details: 'No valid completion statement found - Goal Drift Guard requires explicit "COMPLETE" or "INCOMPLETE" statement',
    violations: [{
      phrase: 'missing completion statement',
      criteria_id: 'GD4',
    }],
  };
}

/**
 * GD5: Check for scope reduction language
 *
 * @param output - Executor output to check
 * @returns Criteria result with violations
 */
export function checkGD5NoScopeReduction(output: string): GoalDriftCriteriaResult {
  const violations: GenericViolation[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    for (const pattern of SCOPE_REDUCTION_PATTERNS) {
      if (lowerLine.includes(pattern.toLowerCase())) {
        const patternIndex = lowerLine.indexOf(pattern.toLowerCase());
        const contextStart = Math.max(0, patternIndex - 20);
        const contextEnd = Math.min(line.length, patternIndex + pattern.length + 20);
        const context = line.substring(contextStart, contextEnd);

        violations.push({
          phrase: pattern,
          pattern,
          context: context.trim(),
          lineNumber: i + 1,
          line: i + 1,
          criteria_id: 'GD5',
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      criteria_id: 'GD5',
      passed: false,
      details: 'Found ' + violations.length + ' scope reduction pattern(s): ' + violations.slice(0, 3).map(v => '"' + v.pattern + '"').join(', ') + (violations.length > 3 ? '...' : ''),
      violations,
    };
  }

  return {
    criteria_id: 'GD5',
    passed: true,
    details: 'No scope reduction patterns detected',
    violations: [],
  };
}

// ============================================================================
// Main Evaluator
// ============================================================================

/**
 * Evaluate Goal Drift Guard criteria on output
 *
 * @param input - Output string or ExecutorResult to evaluate
 * @returns Goal Drift evaluation result
 */
export function evaluateGoalDrift(input: string | ExecutorResult): GoalDriftEvaluatorResult {
  const output = typeof input === 'string' ? input : input.output;
  const criteriaResults: GoalDriftCriteriaResult[] = [];
  const failed_criteria: GoalDriftCriteriaId[] = [];
  const structured_reasons: StructuredReason[] = [];
  const allViolations: GenericViolation[] = [];

  // Run all GD checks
  const gd1 = checkGD1NoEscapePhrases(output);
  criteriaResults.push(gd1);
  allViolations.push(...gd1.violations);
  if (!gd1.passed) {
    failed_criteria.push('GD1');
    structured_reasons.push({
      criteria_id: 'GD1',
      violation_type: 'escape_phrase',
      description: gd1.details || 'Escape phrases detected',
      evidence: gd1.violations.map(v => 'Line ' + v.lineNumber + ': "' + v.phrase + '" in "' + v.context + '"'),
    });
  }

  const gd2 = checkGD2NoPrematureCompletion(output);
  criteriaResults.push(gd2);
  allViolations.push(...gd2.violations);
  if (!gd2.passed) {
    failed_criteria.push('GD2');
    structured_reasons.push({
      criteria_id: 'GD2',
      violation_type: 'premature_completion',
      description: gd2.details || 'Premature completion language detected',
      evidence: gd2.violations.map(v => 'Line ' + v.lineNumber + ': "' + v.pattern + '" in "' + v.context + '"'),
    });
  }

  const gd3 = checkGD3RequirementChecklistPresent(output);
  criteriaResults.push(gd3);
  allViolations.push(...gd3.violations);
  if (!gd3.passed) {
    failed_criteria.push('GD3');
    structured_reasons.push({
      criteria_id: 'GD3',
      violation_type: 'missing_checklist',
      description: gd3.details || 'Requirement checklist missing',
      evidence: ['No checkbox-style requirement tracking found'],
    });
  }

  const gd4 = checkGD4CompletionStatementValid(output);
  criteriaResults.push(gd4);
  allViolations.push(...gd4.violations);
  if (!gd4.passed) {
    failed_criteria.push('GD4');
    structured_reasons.push({
      criteria_id: 'GD4',
      violation_type: 'invalid_completion_statement',
      description: gd4.details || 'Invalid or missing completion statement',
      evidence: ['Expected: "COMPLETE: All N requirements fulfilled" or "INCOMPLETE: Requirements X, Y, Z remain"'],
    });
  }

  const gd5 = checkGD5NoScopeReduction(output);
  criteriaResults.push(gd5);
  allViolations.push(...gd5.violations);
  if (!gd5.passed) {
    failed_criteria.push('GD5');
    structured_reasons.push({
      criteria_id: 'GD5',
      violation_type: 'scope_reduction',
      description: gd5.details || 'Scope reduction language detected',
      evidence: gd5.violations.map(v => 'Line ' + v.lineNumber + ': "' + v.pattern + '" in "' + v.context + '"'),
    });
  }

  const passed = failed_criteria.length === 0;
  const summary = passed
    ? 'All Goal Drift Guard criteria passed'
    : 'Goal Drift Guard: ' + failed_criteria.length + ' criteria failed (' + failed_criteria.join(', ') + ')';

  return {
    passed,
    criteriaResults,
    criteria_results: criteriaResults,
    failed_criteria,
    structured_reasons,
    violations: allViolations,
    summary,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if Goal Drift Guard evaluator should run
 *
 * @param activeTemplateId - Currently active template ID
 * @returns true if evaluator should run
 */
export function shouldRunGoalDriftEvaluator(activeTemplateId: string | null | undefined): boolean {
  return activeTemplateId === GOAL_DRIFT_GUARD_TEMPLATE_ID;
}

/**
 * Fail-closed wrapper for Goal Drift evaluation
 *
 * @param input - Executor result or output string to evaluate
 * @returns Goal Drift evaluation result
 * @throws Never - Returns REJECT-equivalent on error (fail-closed)
 */
export function safeEvaluateGoalDrift(
  input: ExecutorResult | string | null | undefined
): GoalDriftEvaluatorResult {
  try {
    if (input === null || input === undefined) {
      return createFailedResult('Input is null or undefined');
    }
    
    let output: string;
    if (typeof input === 'string') {
      output = input;
    } else if (typeof input === 'object' && 'output' in input) {
      output = (input as ExecutorResult).output;
      if (output === null || output === undefined) {
        return createFailedResult('ExecutorResult.output is null or undefined');
      }
    } else {
      return createFailedResult('Invalid input type');
    }

    return evaluateGoalDrift(output);
  } catch (error) {
    // Fail-closed: evaluator errors result in REJECT
    return createFailedResult(
      'Goal Drift Guard evaluator error (fail-closed): ' + (error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

/**
 * Create a failed result for fail-closed scenarios
 */
function createFailedResult(errorMessage: string): GoalDriftEvaluatorResult {
  return {
    passed: false,
    criteriaResults: [],
    criteria_results: [],
    failed_criteria: ['GD1', 'GD2', 'GD3', 'GD4', 'GD5'],
    structured_reasons: [{
      criteria_id: 'GD1',
      violation_type: 'escape_phrase',
      description: errorMessage,
      evidence: ['Evaluator failed - treating as REJECT per fail-closed principle'],
    }],
    violations: [],
    summary: errorMessage,
    error: errorMessage,
  };
}
