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
 * Detect if output contains unanswered questions requiring user response
 * Per spec COMPLETION_JUDGMENT.md
 *
 * @param output - The task output to analyze
 * @returns Detection result with confidence score
 */
export declare function detectQuestions(output: string): QuestionDetectionResult;
/**
 * Check if output has unanswered questions (simple boolean version)
 * Per spec COMPLETION_JUDGMENT.md L69-126
 */
export declare function hasUnansweredQuestions(output: string): boolean;
/**
 * Determine the appropriate status for a READ_INFO/REPORT task based on output
 * Per spec COMPLETION_JUDGMENT.md L149-157
 *
 * @param output - Task output to analyze
 * @returns 'COMPLETE' if no questions, 'AWAITING_RESPONSE' if questions detected
 */
export declare function determineCompletionStatus(output: string | undefined): 'COMPLETE' | 'AWAITING_RESPONSE' | 'INCOMPLETE';
//# sourceMappingURL=question-detector.d.ts.map