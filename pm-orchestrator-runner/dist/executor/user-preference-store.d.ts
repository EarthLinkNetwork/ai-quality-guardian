/**
 * User Preference Store
 *
 * Learns and stores user preferences over time.
 * When users answer case-by-case questions, we record
 * their patterns to auto-resolve similar questions in the future.
 *
 * Key insight: Users are consistent. If they prefer React over Vue once,
 * they'll likely prefer it again. Track these patterns.
 */
/**
 * A single recorded preference
 */
export interface UserPreference {
    /** Unique ID for this preference */
    id: string;
    /** Category of the preference (e.g., 'framework_choice', 'naming_style') */
    category: string;
    /** Keywords that triggered this preference */
    keywords: string[];
    /** The user's choice */
    choice: string;
    /** Context in which this choice was made */
    context?: string;
    /** How many times this preference has been confirmed */
    confirmationCount: number;
    /** When first recorded */
    createdAt: string;
    /** When last confirmed/updated */
    updatedAt: string;
    /** Confidence level (0-1), increases with confirmations */
    confidence: number;
}
/**
 * Preference match result
 */
export interface PreferenceMatch {
    preference: UserPreference;
    matchScore: number;
    matchedKeywords: string[];
}
/**
 * Store configuration
 */
export interface PreferenceStoreConfig {
    /** Path to store preferences (default: ~/.pm-runner/preferences.json) */
    storagePath?: string;
    /** Namespace for preferences (default: 'default') */
    namespace?: string;
    /** Minimum confidence to auto-apply (default: 0.7) */
    minAutoApplyConfidence?: number;
    /** Minimum keyword match ratio (default: 0.5) */
    minKeywordMatchRatio?: number;
}
/**
 * User Preference Store
 * Persists user preferences to learn from their choices
 */
export declare class UserPreferenceStore {
    private preferences;
    private readonly storagePath;
    private readonly namespace;
    private readonly minAutoApplyConfidence;
    private readonly minKeywordMatchRatio;
    constructor(config?: PreferenceStoreConfig);
    /**
     * Load preferences from disk
     */
    private loadFromDisk;
    /**
     * Save preferences to disk
     */
    private saveToDisk;
    /**
     * Extract keywords from a question/context
     */
    private extractKeywords;
    /**
     * Generate a unique ID for a preference
     */
    private generateId;
    /**
     * Record a new preference from user choice
     */
    recordPreference(category: string, question: string, choice: string, context?: string): UserPreference;
    /**
     * Find a similar existing preference
     */
    private findSimilarPreference;
    /**
     * Find matching preference for a question
     */
    findMatch(category: string, question: string, context?: string): PreferenceMatch | null;
    /**
     * Check if a preference can be auto-applied
     */
    canAutoApply(match: PreferenceMatch): boolean;
    /**
     * Get all preferences for a category
     */
    getByCategory(category: string): UserPreference[];
    /**
     * Get all preferences
     */
    getAll(): UserPreference[];
    /**
     * Delete a preference
     */
    delete(id: string): boolean;
    /**
     * Clear all preferences
     */
    clear(): void;
    /**
     * Get statistics
     */
    getStats(): {
        totalPreferences: number;
        byCategory: Record<string, number>;
        avgConfidence: number;
        highConfidenceCount: number;
    };
}
//# sourceMappingURL=user-preference-store.d.ts.map