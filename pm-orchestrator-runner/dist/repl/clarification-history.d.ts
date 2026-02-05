/**
 * Clarification History
 *
 * Tracks answered clarifications to prevent repeat questions.
 * If the same question arises again, auto-applies the previous answer.
 *
 * Tier-0 Rule I compliance (no repeat clarification after /respond).
 */
import { ClarificationType } from '../models/clarification';
/**
 * A single entry in the clarification history.
 */
export interface ClarificationHistoryEntry {
    /** SHA-256 hash of the normalised question text */
    questionHash: string;
    /** Original question text (for debugging) */
    originalQuestion: string;
    /** Type of clarification */
    clarificationType: ClarificationType;
    /** The answer that was provided */
    answer: string;
    /** When the answer was recorded */
    timestamp: number;
}
/**
 * Result of checking the history.
 */
export interface HistoryLookupResult {
    /** Whether a previous answer was found */
    found: boolean;
    /** The previous answer (if found) */
    answer?: string;
    /** The original entry (if found) */
    entry?: ClarificationHistoryEntry;
}
/**
 * ClarificationHistory - session-scoped history of answered clarifications.
 */
export declare class ClarificationHistory {
    private entries;
    /**
     * Normalise question text before hashing.
     * - Lowercase
     * - Trim whitespace
     * - Remove trailing punctuation
     * - Collapse multiple spaces
     */
    static normalise(question: string): string;
    /**
     * Compute SHA-256 hash of normalised question text.
     */
    static hash(question: string): string;
    /**
     * Record an answered clarification.
     */
    record(question: string, type: ClarificationType, answer: string): void;
    /**
     * Look up a previous answer for a question.
     */
    lookup(question: string): HistoryLookupResult;
    /**
     * Check if a question has been answered before.
     */
    hasAnswer(question: string): boolean;
    /**
     * Get all entries (for debugging/inspection).
     */
    getAll(): ClarificationHistoryEntry[];
    /**
     * Clear all history.
     */
    clear(): void;
    /**
     * Get entry count.
     */
    get size(): number;
}
//# sourceMappingURL=clarification-history.d.ts.map