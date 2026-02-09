/**
 * AI Judge
 *
 * Evaluates test responses dynamically using AI.
 * No fixed expected values - AI determines pass/fail based on context.
 */
import { JudgeInput, JudgeResult, AITestConfig } from './types';
/**
 * Default judge prompt template
 */
declare const JUDGE_SYSTEM_PROMPT = "You are an AI test judge. Your task is to evaluate whether a response adequately addresses the given prompt.\n\nEvaluation criteria:\n1. Does the response directly address the prompt?\n2. Is the response complete and not truncated?\n3. Does it follow any specified format requirements?\n4. Is the content factually reasonable (if applicable)?\n5. Does it avoid asking unnecessary questions when a direct answer is expected?\n\nYou MUST respond in valid JSON format only:\n{\n  \"pass\": true/false,\n  \"score\": 0.0-1.0,\n  \"reason\": \"brief explanation\"\n}\n\nScore guidelines:\n- 0.9-1.0: Excellent response, fully addresses the prompt\n- 0.7-0.89: Good response, minor issues\n- 0.5-0.69: Partial response, significant gaps\n- 0.3-0.49: Poor response, major issues\n- 0.0-0.29: Failed to address prompt";
/**
 * AI Judge - Evaluates a response against a prompt
 */
export declare function judge(input: JudgeInput, config: AITestConfig): Promise<JudgeResult>;
/**
 * Batch judge multiple test results
 */
export declare function judgeBatch(inputs: JudgeInput[], config: AITestConfig): Promise<JudgeResult[]>;
/**
 * Quick check if response likely contains questions (heuristic)
 */
export declare function containsQuestions(text: string): boolean;
export { JUDGE_SYSTEM_PROMPT };
//# sourceMappingURL=judge.d.ts.map