/**
 * Clarification History
 *
 * Tracks answered clarifications to prevent repeat questions.
 * If the same question arises again, auto-applies the previous answer.
 *
 * Tier-0 Rule I compliance (no repeat clarification after /respond).
 */

import { createHash } from 'crypto';
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
export class ClarificationHistory {
  private entries: Map<string, ClarificationHistoryEntry> = new Map();

  /**
   * Normalise question text before hashing.
   * - Lowercase
   * - Trim whitespace
   * - Remove trailing punctuation
   * - Collapse multiple spaces
   */
  static normalise(question: string): string {
    return question
      .toLowerCase()
      .trim()
      .replace(/[?!.]+$/, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Compute SHA-256 hash of normalised question text.
   */
  static hash(question: string): string {
    const normalised = ClarificationHistory.normalise(question);
    return createHash('sha256').update(normalised).digest('hex');
  }

  /**
   * Record an answered clarification.
   */
  record(question: string, type: ClarificationType, answer: string): void {
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
  lookup(question: string): HistoryLookupResult {
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
  hasAnswer(question: string): boolean {
    return this.lookup(question).found;
  }

  /**
   * Get all entries (for debugging/inspection).
   */
  getAll(): ClarificationHistoryEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get entry count.
   */
  get size(): number {
    return this.entries.size;
  }
}
