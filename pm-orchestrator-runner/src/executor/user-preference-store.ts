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

import * as fs from 'fs';
import * as path from 'path';

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
export class UserPreferenceStore {
  private preferences: Map<string, UserPreference>;
  private readonly storagePath: string;
  private readonly namespace: string;
  private readonly minAutoApplyConfidence: number;
  private readonly minKeywordMatchRatio: number;

  constructor(config: PreferenceStoreConfig = {}) {
    this.namespace = config.namespace || 'default';
    this.minAutoApplyConfidence = config.minAutoApplyConfidence ?? 0.7;
    this.minKeywordMatchRatio = config.minKeywordMatchRatio ?? 0.5;
    
    // Default storage path
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const defaultPath = path.join(homeDir, '.pm-runner', 'preferences.json');
    this.storagePath = config.storagePath || defaultPath;
    
    this.preferences = new Map();
    this.loadFromDisk();
  }

  /**
   * Load preferences from disk
   */
  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(data) as Record<string, UserPreference[]>;
        
        const namespacePrefs = parsed[this.namespace] || [];
        for (const pref of namespacePrefs) {
          this.preferences.set(pref.id, pref);
        }
        
        console.log(`[UserPreferenceStore] Loaded ${this.preferences.size} preferences`);
      }
    } catch (error) {
      console.error('[UserPreferenceStore] Failed to load preferences:', error);
    }
  }

  /**
   * Save preferences to disk
   */
  private saveToDisk(): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Load existing data to preserve other namespaces
      let existingData: Record<string, UserPreference[]> = {};
      if (fs.existsSync(this.storagePath)) {
        existingData = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
      }
      
      // Update this namespace
      existingData[this.namespace] = Array.from(this.preferences.values());
      
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify(existingData, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[UserPreferenceStore] Failed to save preferences:', error);
    }
  }

  /**
   * Extract keywords from a question/context
   */
  private extractKeywords(text: string): string[] {
    // Common stop words to ignore
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
      'by', 'from', 'as', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'when', 'where',
      'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
      'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if',
      'or', 'because', 'until', 'while', 'although', 'though',
      'this', 'that', 'these', 'those', 'what', 'which', 'who',
      'whom', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my',
      'your', 'his', 'her', 'its', 'our', 'their',
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Generate a unique ID for a preference
   */
  private generateId(category: string, keywords: string[]): string {
    const keywordHash = keywords.sort().join('-').substring(0, 50);
    return `${category}-${keywordHash}-${Date.now()}`;
  }

  /**
   * Record a new preference from user choice
   */
  recordPreference(
    category: string,
    question: string,
    choice: string,
    context?: string
  ): UserPreference {
    const keywords = this.extractKeywords(question);
    const now = new Date().toISOString();
    
    // Check if similar preference exists
    const existing = this.findSimilarPreference(category, keywords);
    
    if (existing && existing.choice === choice) {
      // Same choice - increase confidence
      existing.confirmationCount++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
      existing.updatedAt = now;
      
      // Merge keywords
      const mergedKeywords = new Set([...existing.keywords, ...keywords]);
      existing.keywords = Array.from(mergedKeywords);
      
      this.preferences.set(existing.id, existing);
      this.saveToDisk();
      
      console.log(`[UserPreferenceStore] Updated preference: ${existing.id} (confidence: ${existing.confidence})`);
      return existing;
    }
    
    if (existing && existing.choice !== choice) {
      // Different choice - decrease confidence or replace
      if (existing.confirmationCount <= 1) {
        // Replace with new preference
        this.preferences.delete(existing.id);
      } else {
        existing.confidence = Math.max(0.3, existing.confidence - 0.2);
        existing.updatedAt = now;
        this.preferences.set(existing.id, existing);
      }
    }
    
    // Create new preference
    const newPref: UserPreference = {
      id: this.generateId(category, keywords),
      category,
      keywords,
      choice,
      context,
      confirmationCount: 1,
      createdAt: now,
      updatedAt: now,
      confidence: 0.6, // Start at 0.6, needs confirmation to reach auto-apply threshold
    };
    
    this.preferences.set(newPref.id, newPref);
    this.saveToDisk();
    
    console.log(`[UserPreferenceStore] Created preference: ${newPref.id}`);
    return newPref;
  }

  /**
   * Find a similar existing preference
   */
  private findSimilarPreference(
    category: string,
    keywords: string[]
  ): UserPreference | null {
    const candidates: Array<{ pref: UserPreference; score: number }> = [];
    
    for (const pref of this.preferences.values()) {
      if (pref.category !== category) continue;
      
      // Calculate keyword overlap
      const overlap = keywords.filter(k => pref.keywords.includes(k));
      const score = overlap.length / Math.max(keywords.length, pref.keywords.length);
      
      if (score >= this.minKeywordMatchRatio) {
        candidates.push({ pref, score });
      }
    }
    
    if (candidates.length === 0) return null;
    
    // Return best match
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].pref;
  }

  /**
   * Find matching preference for a question
   */
  findMatch(
    category: string,
    question: string,
    context?: string
  ): PreferenceMatch | null {
    const keywords = this.extractKeywords(question + ' ' + (context || ''));
    
    const matches: PreferenceMatch[] = [];
    
    for (const pref of this.preferences.values()) {
      if (pref.category !== category) continue;
      
      const matchedKeywords = keywords.filter(k => pref.keywords.includes(k));
      const matchScore = matchedKeywords.length / Math.max(keywords.length, 1);
      
      if (matchScore >= this.minKeywordMatchRatio) {
        matches.push({
          preference: pref,
          matchScore,
          matchedKeywords,
        });
      }
    }
    
    if (matches.length === 0) return null;
    
    // Return best match
    matches.sort((a, b) => {
      // Sort by score first, then by confidence
      const scoreDiff = b.matchScore - a.matchScore;
      if (Math.abs(scoreDiff) > 0.1) return scoreDiff;
      return b.preference.confidence - a.preference.confidence;
    });
    
    return matches[0];
  }

  /**
   * Check if a preference can be auto-applied
   */
  canAutoApply(match: PreferenceMatch): boolean {
    return (
      match.preference.confidence >= this.minAutoApplyConfidence &&
      match.matchScore >= this.minKeywordMatchRatio
    );
  }

  /**
   * Get all preferences for a category
   */
  getByCategory(category: string): UserPreference[] {
    return Array.from(this.preferences.values())
      .filter(p => p.category === category)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get all preferences
   */
  getAll(): UserPreference[] {
    return Array.from(this.preferences.values());
  }

  /**
   * Delete a preference
   */
  delete(id: string): boolean {
    const result = this.preferences.delete(id);
    if (result) {
      this.saveToDisk();
    }
    return result;
  }

  /**
   * Clear all preferences
   */
  clear(): void {
    this.preferences.clear();
    this.saveToDisk();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPreferences: number;
    byCategory: Record<string, number>;
    avgConfidence: number;
    highConfidenceCount: number;
  } {
    const byCategory: Record<string, number> = {};
    let totalConfidence = 0;
    let highConfidenceCount = 0;
    
    for (const pref of this.preferences.values()) {
      byCategory[pref.category] = (byCategory[pref.category] || 0) + 1;
      totalConfidence += pref.confidence;
      if (pref.confidence >= this.minAutoApplyConfidence) {
        highConfidenceCount++;
      }
    }
    
    return {
      totalPreferences: this.preferences.size,
      byCategory,
      avgConfidence: this.preferences.size > 0 
        ? totalConfidence / this.preferences.size 
        : 0,
      highConfidenceCount,
    };
  }
}
