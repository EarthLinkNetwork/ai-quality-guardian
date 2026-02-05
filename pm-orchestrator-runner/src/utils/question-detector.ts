/**
 * Question Detector - Detects unanswered questions in task output
 * Per spec COMPLETION_JUDGMENT.md
 *
 * Used to determine if READ_INFO/REPORT tasks should be:
 * - COMPLETE: No pending questions
 * - AWAITING_RESPONSE: Contains questions requiring user input
 */

/**
 * Question detection result
 */
export interface QuestionDetectionResult {
  /** Whether unanswered questions were detected */
  hasQuestions: boolean;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** Detected patterns that triggered the detection */
  matchedPatterns: string[];
}

/**
 * Question patterns with weights
 * Higher weight = higher confidence that user response is needed
 */
interface QuestionPattern {
  pattern: RegExp;
  weight: number;
  description: string;
}

/**
 * Direct question patterns (Japanese + English)
 * Per spec COMPLETION_JUDGMENT.md L71-85
 */
const QUESTION_PATTERNS: QuestionPattern[] = [
  // Japanese patterns
  { pattern: /どう(します|しましょう)か/, weight: 0.8, description: 'JP: どうしますか' },
  { pattern: /どちら(にしますか|を選びますか)/, weight: 0.9, description: 'JP: どちらにしますか' },
  { pattern: /よろしい(です)?か/, weight: 0.8, description: 'JP: よろしいですか' },
  { pattern: /確認(させて)?ください/, weight: 0.7, description: 'JP: 確認ください' },
  { pattern: /教えてください/, weight: 0.6, description: 'JP: 教えてください' },
  { pattern: /お知らせください/, weight: 0.7, description: 'JP: お知らせください' },
  { pattern: /選んでください/, weight: 0.9, description: 'JP: 選んでください' },
  { pattern: /お選びください/, weight: 0.9, description: 'JP: お選びください' },
  { pattern: /いかがでしょうか/, weight: 0.7, description: 'JP: いかがでしょうか' },
  { pattern: /ご希望/, weight: 0.6, description: 'JP: ご希望' },
  { pattern: /しますか[？?]?/, weight: 0.7, description: 'JP: 〜しますか' },

  // English patterns
  { pattern: /please (let me know|confirm|clarify)/i, weight: 0.7, description: 'EN: please let me know' },
  { pattern: /could you (please )?(specify|clarify)/i, weight: 0.7, description: 'EN: could you specify' },
  { pattern: /which (option|approach|method)/i, weight: 0.6, description: 'EN: which option' },
  { pattern: /do you (want|prefer|need)/i, weight: 0.7, description: 'EN: do you want' },
  { pattern: /should I (proceed|continue|use)/i, weight: 0.6, description: 'EN: should I proceed' },
  { pattern: /would you like/i, weight: 0.7, description: 'EN: would you like' },
  { pattern: /can you (tell|specify|provide)/i, weight: 0.6, description: 'EN: can you tell' },
  { pattern: /what (do you|would you)/i, weight: 0.7, description: 'EN: what do you' },
  { pattern: /how (do you|would you|should)/i, weight: 0.6, description: 'EN: how do you' },
];

/**
 * Option patterns (numbered/lettered choices)
 * Per spec COMPLETION_JUDGMENT.md L94-99
 */
const OPTION_PATTERNS: QuestionPattern[] = [
  { pattern: /[1-9]\)\s+\S/m, weight: 0.3, description: 'Numbered option: 1)' },
  { pattern: /[A-D]\)\s+\S/m, weight: 0.3, description: 'Lettered option: A)' },
  { pattern: /オプション\s*[1-9A-Z]/i, weight: 0.4, description: 'JP: オプション1' },
  { pattern: /選択肢/, weight: 0.3, description: 'JP: 選択肢' },
];

/**
 * Awaiting indicators that combine with options
 * Per spec COMPLETION_JUDGMENT.md L112-119
 */
const AWAITING_INDICATORS: QuestionPattern[] = [
  { pattern: /選んでください/, weight: 0.5, description: 'JP: 選んでください' },
  { pattern: /お選びください/, weight: 0.5, description: 'JP: お選びください' },
  { pattern: /please (select|choose)/i, weight: 0.5, description: 'EN: please select' },
  { pattern: /which.*prefer/i, weight: 0.4, description: 'EN: which prefer' },
];

/**
 * Question mark patterns (less reliable alone)
 */
const QUESTION_MARK_PATTERNS: QuestionPattern[] = [
  { pattern: /\?[\s\n]*$/m, weight: 0.4, description: 'Ends with question mark' },
  { pattern: /\?[\s]*\n/m, weight: 0.3, description: 'Question mark at line end' },
];

/**
 * Code block detection (to exclude false positives from code examples)
 */
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

/**
 * Remove code blocks from text to avoid false positives
 */
function removeCodeBlocks(text: string): string {
  return text.replace(CODE_BLOCK_PATTERN, '');
}

/**
 * Detect if output contains unanswered questions requiring user response
 * Per spec COMPLETION_JUDGMENT.md
 *
 * @param output - The task output to analyze
 * @returns Detection result with confidence score
 */
export function detectQuestions(output: string): QuestionDetectionResult {
  if (!output || typeof output !== 'string') {
    return {
      hasQuestions: false,
      confidence: 0,
      matchedPatterns: [],
    };
  }

  // Remove code blocks to avoid false positives
  const cleanOutput = removeCodeBlocks(output);

  let totalWeight = 0;
  const matchedPatterns: string[] = [];

  // Check direct question patterns
  for (const { pattern, weight, description } of QUESTION_PATTERNS) {
    if (pattern.test(cleanOutput)) {
      totalWeight += weight;
      matchedPatterns.push(description);
    }
  }

  // Check question mark patterns (lower weight)
  for (const { pattern, weight, description } of QUESTION_MARK_PATTERNS) {
    if (pattern.test(cleanOutput)) {
      totalWeight += weight;
      matchedPatterns.push(description);
    }
  }

  // Check for options + awaiting indicators combination
  let hasOptions = false;
  for (const { pattern, description } of OPTION_PATTERNS) {
    if (pattern.test(cleanOutput)) {
      hasOptions = true;
      matchedPatterns.push(description);
      break;
    }
  }

  if (hasOptions) {
    for (const { pattern, weight, description } of AWAITING_INDICATORS) {
      if (pattern.test(cleanOutput)) {
        totalWeight += weight;
        matchedPatterns.push(description + ' (with options)');
      }
    }
  }

  // Per spec: threshold >= 0.6
  const THRESHOLD = 0.6;
  const confidence = Math.min(totalWeight, 1.0);
  const hasQuestions = confidence >= THRESHOLD;

  return {
    hasQuestions,
    confidence,
    matchedPatterns,
  };
}

/**
 * Check if output has unanswered questions (simple boolean version)
 * Per spec COMPLETION_JUDGMENT.md L69-126
 */
export function hasUnansweredQuestions(output: string): boolean {
  return detectQuestions(output).hasQuestions;
}

/**
 * Determine the appropriate status for a READ_INFO/REPORT task based on output
 * Per spec COMPLETION_JUDGMENT.md L149-157
 *
 * @param output - Task output to analyze
 * @returns 'COMPLETE' if no questions, 'AWAITING_RESPONSE' if questions detected
 */
export function determineCompletionStatus(
  output: string | undefined
): 'COMPLETE' | 'AWAITING_RESPONSE' | 'INCOMPLETE' {
  // Empty output = INCOMPLETE
  if (!output || output.trim() === '') {
    return 'INCOMPLETE';
  }

  // Check for questions
  if (hasUnansweredQuestions(output)) {
    return 'AWAITING_RESPONSE';
  }

  // Has output, no questions = COMPLETE
  return 'COMPLETE';
}
