/**
 * Task Type Detector - Detect task type from user input
 * Shared utility for both REPL and Web paths
 *
 * Task types:
 * - READ_INFO: Information requests, questions, analysis (no file changes)
 * - REPORT: Generating reports, summaries (no file changes)
 * - IMPLEMENTATION: Creating/modifying files, fixing bugs
 */

export type TaskType = 'READ_INFO' | 'IMPLEMENTATION' | 'REPORT';

/**
 * Detect task type from user input.
 * READ_INFO tasks are information requests that don't require file changes.
 * REPORT tasks are report/summary generation requests.
 * IMPLEMENTATION tasks involve creating/modifying files.
 */
export function detectTaskType(input: string): TaskType {
  const lowerInput = input.toLowerCase();

  // REPORT patterns - explicitly asking for reports/summaries
  const reportPatterns = [
    /\b(report|summary|summarize|overview|breakdown|stats|statistics)\b/i,
    /\b(generate|create|make|produce)\s+(a\s+)?(report|summary)/i,
  ];

  // Check for REPORT patterns first
  for (const pattern of reportPatterns) {
    if (pattern.test(lowerInput)) {
      return 'REPORT';
    }
  }

  // READ_INFO patterns - questions and information requests
  const readInfoPatterns = [
    /^(what|how|why|when|where|who|which|can you explain|tell me|show me|describe|list|find)/i,
    /\?$/,  // Ends with question mark
    /(explain|analyze|check|verify|review|look at|examine|inspect|investigate)/i,
    /(status|info|information|details)/i,
    /^read /i,
    /^(show|display|print|output)/i,
    /^(確認|教えて|見せて|説明|調べ|チェック)/i,  // Japanese patterns
  ];

  // IMPLEMENTATION patterns - file creation/modification
  const implementationPatterns = [
    /(create|add|write|implement|build|make|generate|update|modify|change|fix|refactor|delete|remove)/i,
    /\.(ts|js|tsx|jsx|py|go|rs|java|md|json|yaml|yml|toml|css|scss|html)$/i,
    /(file|code|function|class|component|module|test)/i,
    /^(追加|作成|実装|修正|変更|削除)/i,  // Japanese patterns
  ];

  // Check for READ_INFO patterns
  for (const pattern of readInfoPatterns) {
    if (pattern.test(lowerInput)) {
      // But check if it also matches implementation patterns
      let hasImplementation = false;
      for (const implPattern of implementationPatterns) {
        if (implPattern.test(lowerInput)) {
          hasImplementation = true;
          break;
        }
      }
      if (!hasImplementation) {
        return 'READ_INFO';
      }
    }
  }

  // Default to IMPLEMENTATION for ambiguous cases (fail-closed for safety)
  return 'IMPLEMENTATION';
}
