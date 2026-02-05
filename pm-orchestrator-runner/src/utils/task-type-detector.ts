/**
 * Task Type Detector - Detect task type from user input
 * Shared utility for both REPL and Web paths
 *
 * Task types:
 * - READ_INFO: Information requests, questions, analysis (no file changes)
 * - REPORT: Generating reports, summaries (no file changes)
 * - IMPLEMENTATION: Creating/modifying files, fixing bugs
 *
 * Design principle: Japanese inputs that don't clearly indicate file
 * creation/modification should default to READ_INFO (not IMPLEMENTATION)
 * to prevent INCOMPLETE -> ERROR misclassification in the executor pipeline.
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
    /(要約|まとめ|サマリ|レポート|概要)/i,  // Japanese patterns for reports
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
    /^(確認|教えて|見せて|説明|調べ|チェック)/i,  // Japanese patterns (start-anchored)
    // Japanese patterns (anywhere in input) - analysis/verification/inspection
    /(確認|教えて|見せて|説明して|調べて|チェックして)/,
    /(検知|検証|検査|診断|テスト|分析|解析|評価|監査|点検|確かめ)/,
    /(動作確認|整合性|ヘルスチェック|品質チェック)/,
  ];

  // IMPLEMENTATION patterns - file creation/modification
  // Note: English word boundaries (\b) work for English but not for Japanese.
  // Japanese IMPLEMENTATION detection uses start-anchored patterns for action verbs.
  const implementationPatterns = [
    /\b(create|add|write|implement|build|make|generate|update|modify|change|fix|refactor|delete|remove)\b/i,
    /\.(ts|js|tsx|jsx|py|go|rs|java|md|json|yaml|yml|toml|css|scss|html)$/i,
    /\b(file|code|function|class|component|module)\b/i,
    // Japanese: only match when the action verb is at the start (clear intent to modify)
    /^(追加|作成|実装|修正|変更|削除|リファクタリング)/,
    // Japanese: action verb + して/する patterns (clear modification intent)
    /(追加して|作成して|実装して|修正して|変更して|削除して|書いて|書き換えて)/,
    /(を追加|を作成|を実装|を修正|を変更|を削除|を書いて|を書き換え)/,
    // Explicit "create/write test" in Japanese (テストを書いて, テストを追加)
    /(テストを(書|追加|作成|実装))/,
  ];

  // Check for READ_INFO patterns
  for (const pattern of readInfoPatterns) {
    if (pattern.test(input)) {
      // But check if it also matches implementation patterns
      let hasImplementation = false;
      for (const implPattern of implementationPatterns) {
        if (implPattern.test(input)) {
          hasImplementation = true;
          break;
        }
      }
      if (!hasImplementation) {
        return 'READ_INFO';
      }
    }
  }

  // Check IMPLEMENTATION patterns explicitly
  for (const implPattern of implementationPatterns) {
    if (implPattern.test(input)) {
      return 'IMPLEMENTATION';
    }
  }

  // Default: for inputs that match no patterns (including ambiguous Japanese),
  // default to READ_INFO. This is safer because:
  // - READ_INFO INCOMPLETE -> AWAITING_RESPONSE (user can clarify)
  // - IMPLEMENTATION INCOMPLETE -> ERROR (loses task output)
  // English inputs are well-covered by the patterns above.
  // Japanese inputs without clear modification verbs are more likely
  // to be information requests or analysis tasks.
  return 'READ_INFO';
}
