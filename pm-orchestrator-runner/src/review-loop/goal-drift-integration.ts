/**
 * Goal Drift Guard Integration with Review Loop
 *
 * Per spec 32_TEMPLATE_INJECTION.md Section 2.4
 *
 * This module provides integration between the Goal Drift Guard evaluator
 * and the existing Review Loop quality judgment system.
 *
 * Key principle: Only run Goal Drift Guard when activeTemplateId === 'goal_drift_guard'
 * Zero overhead when template not selected.
 */

import type { ExecutorResult } from '../executor/claude-code-executor';
import type { CriteriaResult, IssueDetail, QualityCriteriaId } from './review-loop';
import {
  safeEvaluateGoalDrift,
  GOAL_DRIFT_GUARD_TEMPLATE_ID,
  type GoalDriftEvaluatorResult,
  type GoalDriftCriteriaId,
} from './goal-drift-evaluator';

// ============================================================================
// Type Extensions
// ============================================================================

/**
 * Extended issue types for Goal Drift Guard
 */
export type ExtendedIssueType =
  | IssueDetail['type']
  | 'escape_phrase'
  | 'premature_completion'
  | 'missing_checklist'
  | 'invalid_completion_statement'
  | 'scope_reduction';

/**
 * Extended issue detail including Goal Drift Guard violations
 */
export interface ExtendedIssueDetail {
  type: ExtendedIssueType;
  location?: string;
  description: string;
  suggestion?: string;
}

/**
 * Goal Drift Guard integration result
 */
export interface GoalDriftIntegrationResult {
  /** Whether Goal Drift Guard was run */
  ran: boolean;

  /** Whether Goal Drift Guard passed (true if not run) */
  passed: boolean;

  /** Goal Drift Guard specific results (null if not run) */
  goalDriftResult: GoalDriftEvaluatorResult | null;

  /** Criteria results mapped to Q-style format */
  mappedCriteriaResults: CriteriaResult[];

  /** Issues mapped to extended format */
  mappedIssues: ExtendedIssueDetail[];

  /** Human-readable summary */
  summary: string;
}

// ============================================================================
// Mapping Functions
// ============================================================================

/**
 * Map Goal Drift criteria ID to Q-style criteria ID
 *
 * GD1 (escape phrases) -> Q2 (No TODO/FIXME style - problematic language)
 * GD2 (premature completion) -> Q5 (Evidence Present style - incomplete work)
 * GD3 (missing checklist) -> Q5 (Evidence Present style - no verification)
 * GD4 (invalid completion) -> Q5 (Evidence Present style - false claims)
 * GD5 (scope reduction) -> Q3 (Omission Markers style - hidden reduction)
 */
export function mapGoalDriftToQCriteria(gdId: GoalDriftCriteriaId): QualityCriteriaId {
  switch (gdId) {
    case 'GD1': return 'Q2';  // Escape phrases -> problematic language
    case 'GD2': return 'Q5';  // Premature completion -> incomplete work
    case 'GD3': return 'Q5';  // Missing checklist -> no verification
    case 'GD4': return 'Q5';  // Invalid completion -> false claims
    case 'GD5': return 'Q3';  // Scope reduction -> hidden omission
    default: return 'Q5';     // Default to evidence check
  }
}

/**
 * Get human-readable name for Goal Drift criteria
 */
export function getGoalDriftCriteriaName(gdId: GoalDriftCriteriaId): string {
  switch (gdId) {
    case 'GD1': return 'No Escape Phrases';
    case 'GD2': return 'No Premature Completion';
    case 'GD3': return 'Requirement Checklist Present';
    case 'GD4': return 'Valid Completion Statement';
    case 'GD5': return 'No Scope Reduction';
    default: return 'Goal Drift ' + gdId;
  }
}

/**
 * Map Goal Drift evaluator result to Review Loop compatible format
 */
export function mapGoalDriftResultToReviewLoop(
  gdResult: GoalDriftEvaluatorResult
): { criteria: CriteriaResult[]; issues: ExtendedIssueDetail[] } {
  const criteria: CriteriaResult[] = [];
  const issues: ExtendedIssueDetail[] = [];

  for (const cr of gdResult.criteria_results) {
    // Map to Q-style criteria
    criteria.push({
      criteria_id: mapGoalDriftToQCriteria(cr.criteria_id),
      passed: cr.passed,
      details: '[' + cr.criteria_id + '] ' + (cr.details || ''),
    });
  }

  // Map structured reasons to issues
  for (const reason of gdResult.structured_reasons) {
    issues.push({
      type: reason.violation_type,
      description: reason.description,
      suggestion: getSuggestionForViolation(reason.violation_type),
    });
  }

  return { criteria, issues };
}

/**
 * Get suggestion for fixing a Goal Drift violation
 */
function getSuggestionForViolation(violationType: ExtendedIssueDetail['type']): string {
  switch (violationType) {
    case 'escape_phrase':
      return 'Remove escape phrases like "if needed", "optional", "consider adding". Be definitive about what was done.';
    case 'premature_completion':
      return 'Do not claim "basic implementation" or ask user to verify. Complete all requirements yourself.';
    case 'missing_checklist':
      return 'Add a requirement checklist with checkbox items: "- [ ] Requirement 1: [status]"';
    case 'invalid_completion_statement':
      return 'Use "COMPLETE: All N requirements fulfilled" or "INCOMPLETE: Requirements X, Y, Z remain"';
    case 'scope_reduction':
      return 'Do not reduce scope with phrases like "simplified version" or "for now". Complete the full requirement.';
    default:
      return 'Review Goal Drift Guard rules and ensure all requirements are fully addressed.';
  }
}

// ============================================================================
// Main Integration Function
// ============================================================================

/**
 * Run Goal Drift Guard integration if applicable
 *
 * @param result - Executor result to evaluate
 * @param activeTemplateId - Currently active template ID
 * @returns Integration result with mapped criteria and issues
 */
export function runGoalDriftIntegration(
  result: ExecutorResult,
  activeTemplateId: string | null | undefined
): GoalDriftIntegrationResult {
  // Check if Goal Drift Guard should run
  if (activeTemplateId !== GOAL_DRIFT_GUARD_TEMPLATE_ID) {
    return {
      ran: false,
      passed: true,
      goalDriftResult: null,
      mappedCriteriaResults: [],
      mappedIssues: [],
      summary: 'Goal Drift Guard not active',
    };
  }

  // Run Goal Drift Guard evaluation
  const gdResult = safeEvaluateGoalDrift(result);

  if (!gdResult) {
    // This should not happen since we checked activeTemplateId above
    return {
      ran: false,
      passed: true,
      goalDriftResult: null,
      mappedCriteriaResults: [],
      mappedIssues: [],
      summary: 'Goal Drift Guard not applicable',
    };
  }

  // Map results to Review Loop format
  const { criteria, issues } = mapGoalDriftResultToReviewLoop(gdResult);

  return {
    ran: true,
    passed: gdResult.passed,
    goalDriftResult: gdResult,
    mappedCriteriaResults: criteria,
    mappedIssues: issues,
    summary: gdResult.summary,
  };
}

/**
 * Generate modification prompt section for Goal Drift Guard failures
 *
 * @param gdResult - Goal Drift Guard evaluation result
 * @returns Modification prompt section
 */
export function generateGoalDriftModificationSection(
  gdResult: GoalDriftEvaluatorResult
): string {
  if (gdResult.passed) {
    return '';
  }

  let section = '\n### Goal Drift Guard Violations\n\n';
  section += 'The following Goal Drift Guard criteria failed:\n\n';

  for (const reason of gdResult.structured_reasons) {
    section += '**' + reason.criteria_id + ' - ' + getGoalDriftCriteriaName(reason.criteria_id as GoalDriftCriteriaId) + '**\n';
    section += '- ' + reason.description + '\n';
    if (reason.evidence.length > 0) {
      section += '- Evidence:\n';
      for (const e of reason.evidence.slice(0, 3)) {
        section += '  - ' + e + '\n';
      }
      if (reason.evidence.length > 3) {
        section += '  - ... and ' + (reason.evidence.length - 3) + ' more\n';
      }
    }
    section += '- Fix: ' + getSuggestionForViolation(reason.violation_type as ExtendedIssueDetail['type']) + '\n\n';
  }

  section += '\n**Required Output Format (Goal Drift Guard):**\n';
  section += '```\n';
  section += '### Requirement Checklist\n';
  section += '- [ ] Requirement 1: [status]\n';
  section += '- [ ] Requirement 2: [status]\n';
  section += '\n';
  section += '### Completion Statement\n';
  section += 'COMPLETE: All N requirements fulfilled\n';
  section += 'OR\n';
  section += 'INCOMPLETE: Requirements X, Y, Z remain\n';
  section += '```\n';

  return section;
}
