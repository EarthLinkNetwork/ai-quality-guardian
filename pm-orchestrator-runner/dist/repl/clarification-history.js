"use strict";
/**
 * Clarification History
 *
 * Tracks answered clarifications to prevent repeat questions.
 * If the same question arises again, auto-applies the previous answer.
 *
 * Tier-0 Rule I compliance (no repeat clarification after /respond).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClarificationHistory = void 0;
const crypto_1 = require("crypto");
/**
 * ClarificationHistory - session-scoped history of answered clarifications.
 */
class ClarificationHistory {
    entries = new Map();
    /**
     * Normalise question text before hashing.
     * - Lowercase
     * - Trim whitespace
     * - Remove trailing punctuation
     * - Collapse multiple spaces
     */
    static normalise(question) {
        return question
            .toLowerCase()
            .trim()
            .replace(/[?!.]+$/, '')
            .replace(/\s+/g, ' ');
    }
    /**
     * Compute SHA-256 hash of normalised question text.
     */
    static hash(question) {
        const normalised = ClarificationHistory.normalise(question);
        return (0, crypto_1.createHash)('sha256').update(normalised).digest('hex');
    }
    /**
     * Record an answered clarification.
     */
    record(question, type, answer) {
        const questionHash = ClarificationHistory.hash(question);
        this.entries.set(questionHash, {
            questionHash,
            originalQuestion: question,
            clarificationType: type,
            answer,
            timestamp: Date.now(),
        });
    }
    /**
     * Look up a previous answer for a question.
     */
    lookup(question) {
        const questionHash = ClarificationHistory.hash(question);
        const entry = this.entries.get(questionHash);
        if (entry) {
            return { found: true, answer: entry.answer, entry };
        }
        return { found: false };
    }
    /**
     * Check if a question has been answered before.
     */
    hasAnswer(question) {
        return this.lookup(question).found;
    }
    /**
     * Get all entries (for debugging/inspection).
     */
    getAll() {
        return Array.from(this.entries.values());
    }
    /**
     * Clear all history.
     */
    clear() {
        this.entries.clear();
    }
    /**
     * Get entry count.
     */
    get size() {
        return this.entries.size;
    }
}
exports.ClarificationHistory = ClarificationHistory;
//# sourceMappingURL=clarification-history.js.map