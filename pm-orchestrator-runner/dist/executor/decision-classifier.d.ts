/**
 * Decision Classifier
 *
 * Classifies clarification requests into categories:
 * - BEST_PRACTICE: Can be auto-resolved using established conventions
 * - CASE_BY_CASE: Requires user input (product direction, preference)
 *
 * The key insight: Not all clarifications are equal.
 * Some have "correct" answers (docs go in docs/), while others
 * depend on user preference (feature A vs feature B).
 */
import { LLMClient } from '../mediation/llm-client';
/**
 * Decision category for clarification routing
 */
export type DecisionCategory = 'best_practice' | 'case_by_case' | 'unknown';
/**
 * Best practice rules that can be auto-resolved
 * These are industry conventions that are generally accepted
 */
export interface BestPracticeRule {
    /** Rule identifier */
    id: string;
    /** Pattern to match (regex or keyword) */
    pattern: RegExp | string;
    /** Category of the rule */
    category: string;
    /** The best practice resolution */
    resolution: string;
    /** Reasoning for this best practice */
    reasoning: string;
}
/**
 * Classification result
 */
export interface ClassificationResult {
    category: DecisionCategory;
    confidence: number;
    matchedRule?: BestPracticeRule;
    reasoning: string;
    suggestedResolution?: string;
}
/**
 * Built-in best practice rules
 * These can be auto-resolved without asking the user
 */
export declare const DEFAULT_BEST_PRACTICE_RULES: BestPracticeRule[];
/**
 * Decision Classifier
 * Determines whether a clarification can be auto-resolved
 * or requires user input
 */
export declare class DecisionClassifier {
    private readonly rules;
    private readonly llmClient?;
    constructor(customRules?: BestPracticeRule[], llmClient?: LLMClient);
    /**
     * Classify a clarification question
     */
    classify(question: string, context?: string): ClassificationResult;
    /**
     * Classify using LLM for complex cases
     * Only called when rule-based classification returns 'unknown'
     */
    classifyWithLLM(question: string, context?: string): Promise<ClassificationResult>;
    /**
     * Full classification with fallback to LLM
     */
    classifyFull(question: string, context?: string): Promise<ClassificationResult>;
    /**
     * Add a custom rule
     */
    addRule(rule: BestPracticeRule): void;
    /**
     * Get all rules
     */
    getRules(): BestPracticeRule[];
}
//# sourceMappingURL=decision-classifier.d.ts.map