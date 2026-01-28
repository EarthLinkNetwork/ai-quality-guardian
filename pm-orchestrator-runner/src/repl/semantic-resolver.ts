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

const BUILTIN_PATTERNS: ResolverPattern[] = [
  // Project root references
  {
    name: 'project-root',
    inputs: ['root', 'root直下', '.', 'ここ', 'here', 'project root', 'ルート', 'プロジェクトルート'],
    resolvedValue: '.',
    applicableTypes: [ClarificationType.TARGET_FILE, ClarificationType.FREE_TEXT],
    confidence: 'high',
  },
  // Affirmative responses
  {
    name: 'affirmative',
    inputs: ['yes', 'はい', 'y', 'ok', 'sure', 'はいはい', 'うん', 'ええ'],
    resolvedValue: 'yes',
    applicableTypes: [ClarificationType.CONFIRM],
    confidence: 'high',
  },
  // Negative responses
  {
    name: 'negative',
    inputs: ['no', 'いいえ', 'n', 'nope', 'いや', 'やめ', 'やめて', 'cancel', 'キャンセル'],
    resolvedValue: 'no',
    applicableTypes: [ClarificationType.CONFIRM],
    confidence: 'high',
  },
  // Current directory
  {
    name: 'current-dir',
    inputs: ['current', 'cwd', 'pwd', '現在のディレクトリ', 'カレント'],
    resolvedValue: '.',
    applicableTypes: [ClarificationType.TARGET_FILE],
    confidence: 'medium',
  },
];

/**
 * SemanticResolver - resolves user input to structured values.
 */
export class SemanticResolver {
  private customPatterns: ResolverPattern[] = [];

  /**
   * Add a custom pattern for resolution.
   */
  addPattern(pattern: ResolverPattern): void {
    this.customPatterns.push(pattern);
  }

  /**
   * Attempt to resolve user input for a given clarification type.
   */
  resolve(input: string, clarificationType: ClarificationType): SemanticResolution {
    const normalised = input.trim().toLowerCase();

    if (!normalised) {
      return { resolved: false, confidence: 'low' };
    }

    // Check custom patterns first (higher priority)
    for (const pattern of this.customPatterns) {
      if (!pattern.applicableTypes.includes(clarificationType)) continue;
      if (pattern.inputs.includes(normalised)) {
        return {
          resolved: true,
          value: pattern.resolvedValue,
          confidence: pattern.confidence,
          matchedPattern: pattern.name,
        };
      }
    }

    // Check built-in patterns
    for (const pattern of BUILTIN_PATTERNS) {
      if (!pattern.applicableTypes.includes(clarificationType)) continue;
      if (pattern.inputs.includes(normalised)) {
        return {
          resolved: true,
          value: pattern.resolvedValue,
          confidence: pattern.confidence,
          matchedPattern: pattern.name,
        };
      }
    }

    // Check if input looks like a file path (for TARGET_FILE)
    if (clarificationType === ClarificationType.TARGET_FILE) {
      if (normalised.includes('/') || normalised.includes('\\') || normalised.endsWith('.ts') || normalised.endsWith('.js') || normalised.endsWith('.md')) {
        return {
          resolved: true,
          value: input.trim(), // preserve original case for paths
          confidence: 'medium',
          matchedPattern: 'file-path-heuristic',
        };
      }
    }

    return { resolved: false, confidence: 'low' };
  }

  /**
   * Resolve against a list of options (for SELECT_ONE).
   * Returns the best matching option if found.
   */
  resolveFromOptions(input: string, options: string[]): SemanticResolution {
    const normalised = input.trim().toLowerCase();

    if (!normalised) {
      return { resolved: false, confidence: 'low' };
    }

    // Exact match
    const exactMatch = options.find(o => o.toLowerCase() === normalised);
    if (exactMatch) {
      return {
        resolved: true,
        value: exactMatch,
        confidence: 'high',
        matchedPattern: 'exact-option-match',
      };
    }

    // Prefix match (unambiguous)
    const prefixMatches = options.filter(o => o.toLowerCase().startsWith(normalised));
    if (prefixMatches.length === 1) {
      return {
        resolved: true,
        value: prefixMatches[0],
        confidence: 'medium',
        matchedPattern: 'prefix-option-match',
      };
    }

    return { resolved: false, confidence: 'low' };
  }
}

/**
 * Module-level resolver instance for convenience.
 */
export const resolveSemanticInput = (input: string, type: ClarificationType): SemanticResolution => {
  const resolver = new SemanticResolver();
  return resolver.resolve(input, type);
};
