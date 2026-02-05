/**
 * Semantic Resolver
 *
 * Resolves user input to structured values before presenting
 * a clarification dialog. If the user's prior input already
 * contains a recognisable answer, the clarification is auto-resolved.
 *
 * Tier-0 Rule I compliance (reduces unnecessary clarifications).
 */
import { ClarificationType } from '../models/clarification';
/**
 * Result of a semantic resolution attempt.
 */
export interface SemanticResolution {
    /** Whether the input was resolved */
    resolved: boolean;
    /** The resolved value (if resolved) */
    value?: string;
    /** Confidence level */
    confidence: 'high' | 'medium' | 'low';
    /** Which pattern matched */
    matchedPattern?: string;
}
/**
 * Built-in patterns for common resolutions.
 */
interface ResolverPattern {
    /** Pattern name for logging */
    name: string;
    /** Input patterns that match (lowercase) */
    inputs: string[];
    /** The resolved value */
    resolvedValue: string;
    /** Applicable clarification types */
    applicableTypes: ClarificationType[];
    /** Confidence level */
    confidence: 'high' | 'medium' | 'low';
}
/**
 * SemanticResolver - resolves user input to structured values.
 */
export declare class SemanticResolver {
    private customPatterns;
    /**
     * Add a custom pattern for resolution.
     */
    addPattern(pattern: ResolverPattern): void;
    /**
     * Attempt to resolve user input for a given clarification type.
     */
    resolve(input: string, clarificationType: ClarificationType): SemanticResolution;
    /**
     * Resolve against a list of options (for SELECT_ONE).
     * Returns the best matching option if found.
     */
    resolveFromOptions(input: string, options: string[]): SemanticResolution;
}
/**
 * Module-level resolver instance for convenience.
 */
export declare const resolveSemanticInput: (input: string, type: ClarificationType) => SemanticResolution;
export {};
//# sourceMappingURL=semantic-resolver.d.ts.map