/**
 * Selftest Judge
 * Evaluates SUT output against rubric
 * Per SELFTEST_AI_JUDGE.md specification
 */
import { JudgeConfig, JudgeInput, JudgeResult } from './types';
/**
 * Judge interface for output evaluation
 */
export interface ISelftestJudge {
    /**
     * Evaluate system output and return scores
     */
    evaluate(input: JudgeInput): Promise<JudgeResult>;
}
/**
 * Mock Judge - rule-based evaluation without AI
 * Used for testing without API calls
 */
export declare class MockJudge implements ISelftestJudge {
    evaluate(input: JudgeInput): Promise<JudgeResult>;
    private calculateScores;
    private buildReasoning;
}
/**
 * AI Judge - uses LLM for nuanced evaluation
 */
export declare class AIJudge implements ISelftestJudge {
    private config;
    constructor(config: JudgeConfig);
    evaluate(input: JudgeInput): Promise<JudgeResult>;
    /**
     * Build the judge system prompt
     */
    private buildSystemPrompt;
    /**
     * Build the evaluation prompt
     */
    private buildEvaluationPrompt;
}
/**
 * Create a judge based on config
 */
export declare function createJudge(config: JudgeConfig): ISelftestJudge;
//# sourceMappingURL=judge.d.ts.map