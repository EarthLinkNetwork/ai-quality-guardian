/**
 * Script Failure Classifier
 *
 * Categorizes script execution failures into actionable categories
 * so the UI can display targeted next-actions to the user.
 *
 * Categories:
 * - QUOTE_ERROR: Shell quoting / escaping issues (common with node -e)
 * - PATH_NOT_FOUND: File or directory not found
 * - COMMAND_NOT_FOUND: Binary/command not available
 * - PERMISSION: Permission denied errors
 * - TIMEOUT: Execution timed out
 * - UNKNOWN: Unclassified failure
 */

/**
 * Failure categories for script execution errors
 */
export type ScriptFailureCategory =
  | 'QUOTE_ERROR'
  | 'PATH_NOT_FOUND'
  | 'COMMAND_NOT_FOUND'
  | 'PERMISSION'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * Classified failure result
 */
export interface ClassifiedFailure {
  category: ScriptFailureCategory;
  summary: string;
  detail: string;
  nextActions: NextAction[];
}

/**
 * Next action suggestion for the user
 */
export interface NextAction {
  label: string;
  actionType: 'retry' | 'retry_fallback' | 'open_logs' | 'navigate';
  /** For navigate: the URL path. For retry: the task_id. */
  target?: string;
}

/**
 * Patterns for each failure category
 */
const CATEGORY_PATTERNS: Array<{
  category: ScriptFailureCategory;
  patterns: RegExp[];
  summaryTemplate: string;
}> = [
  {
    category: 'QUOTE_ERROR',
    patterns: [
      /SyntaxError:.*unexpected/i,
      /unterminated.*string/i,
      /unexpected.*token/i,
      /bad substitution/i,
      /unmatched.*quote/i,
      /unexpected.*EOF/i,
      /missing.*['"`]/i,
      /invalid.*escape/i,
      /cannot.*parse/i,
    ],
    summaryTemplate: 'Script failed due to quoting/syntax error',
  },
  {
    category: 'PATH_NOT_FOUND',
    patterns: [
      /ENOENT/i,
      /no such file or directory/i,
      /cannot find module/i,
      /module not found/i,
      /path.*not.*found/i,
      /file.*not.*found/i,
      /directory.*not.*found/i,
      /cannot open/i,
    ],
    summaryTemplate: 'Script failed: file or path not found',
  },
  {
    category: 'COMMAND_NOT_FOUND',
    patterns: [
      /command not found/i,
      /not recognized.*command/i,
      /is not a command/i,
      /ENOENT.*spawn/i,
      /no such command/i,
      /not found in PATH/i,
    ],
    summaryTemplate: 'Script failed: command not found',
  },
  {
    category: 'PERMISSION',
    patterns: [
      /EACCES/i,
      /permission denied/i,
      /access denied/i,
      /operation not permitted/i,
      /EPERM/i,
    ],
    summaryTemplate: 'Script failed: permission denied',
  },
  {
    category: 'TIMEOUT',
    patterns: [
      /timed?\s*out/i,
      /ETIMEDOUT/i,
      /exceeded.*timeout/i,
      /execution.*timeout/i,
      /deadline.*exceeded/i,
    ],
    summaryTemplate: 'Script failed: execution timed out',
  },
];

/**
 * Classify a script failure from error output.
 *
 * @param errorOutput - stderr or error message from the failed script
 * @param stdout - stdout (may contain useful context)
 * @param taskId - task ID for next-action linking
 * @param taskGroupId - task group ID for navigation
 * @returns ClassifiedFailure with category, summary, and suggested next actions
 */
export function classifyScriptFailure(
  errorOutput: string,
  stdout?: string,
  taskId?: string,
  taskGroupId?: string,
): ClassifiedFailure {
  const combined = `${errorOutput}\n${stdout || ''}`;

  for (const { category, patterns, summaryTemplate } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        return {
          category,
          summary: summaryTemplate,
          detail: errorOutput.substring(0, 500),
          nextActions: buildNextActions(category, taskId, taskGroupId),
        };
      }
    }
  }

  return {
    category: 'UNKNOWN',
    summary: 'Script failed with an unclassified error',
    detail: errorOutput.substring(0, 500),
    nextActions: buildNextActions('UNKNOWN', taskId, taskGroupId),
  };
}

/**
 * Build next-action suggestions for a given failure category.
 */
function buildNextActions(
  category: ScriptFailureCategory,
  taskId?: string,
  taskGroupId?: string,
): NextAction[] {
  const actions: NextAction[] = [];

  // Always offer retry
  actions.push({
    label: 'Retry same step',
    actionType: 'retry',
    target: taskId,
  });

  // Category-specific actions
  if (category === 'QUOTE_ERROR') {
    actions.push({
      label: 'Retry with tmpfile fallback',
      actionType: 'retry_fallback',
      target: taskId,
    });
  }

  if (category === 'TIMEOUT') {
    actions.push({
      label: 'Retry with extended timeout',
      actionType: 'retry',
      target: taskId,
    });
  }

  // Always offer log viewing
  actions.push({
    label: 'Open execution logs',
    actionType: 'open_logs',
    target: taskId ? `/tasks/${taskId}` : undefined,
  });

  // Navigate to task group if available
  if (taskGroupId) {
    actions.push({
      label: 'View task group',
      actionType: 'navigate',
      target: `/task-groups/${taskGroupId}`,
    });
  }

  return actions;
}

/**
 * Detect if a command is a fragile inline script (e.g. node -e "...")
 * that should be converted to a tmpfile-based execution.
 */
export function isFragileInlineCommand(command: string): boolean {
  const trimmed = command.trim();
  return /^node\s+-e\s+/i.test(trimmed) ||
         /^python\s+-c\s+/i.test(trimmed) ||
         /^ruby\s+-e\s+/i.test(trimmed) ||
         /^perl\s+-e\s+/i.test(trimmed);
}
