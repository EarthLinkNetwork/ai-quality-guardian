/**
 * Selftest Config Loader
 * Loads and validates selftest.yaml configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SelftestConfig, SelftestScenario, ScoreWeights } from './types';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: SelftestConfig = {
  version: 1,
  strictness: 0.7,
  min_score_to_pass: 0.6,
  allow_minor_format_deviation: true,
  max_questions_allowed: 5,
  timeout_seconds: 60,
  generator: {
    use_mock: true,
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 500,
  },
  judge: {
    use_mock: true,
    model: 'gpt-4o-mini',
    temperature: 0.0,
    max_tokens: 1000,
  },
  weights: {
    format_score: 0.2,
    factuality_score: 0.3,
    instruction_following_score: 0.3,
    safety_score: 0.2,
  },
  scenarios: [],
};

/**
 * Load selftest configuration from YAML file
 */
export function loadSelftestConfig(configPath?: string): SelftestConfig {
  // Try multiple paths
  const searchPaths = [
    configPath,
    path.join(process.cwd(), 'config', 'selftest.yaml'),
    path.join(process.cwd(), 'config', 'selftest.yml'),
    path.join(__dirname, '..', '..', 'config', 'selftest.yaml'),
  ].filter(Boolean) as string[];

  let configContent: string | undefined;
  let usedPath: string | undefined;

  for (const p of searchPaths) {
    try {
      if (fs.existsSync(p)) {
        configContent = fs.readFileSync(p, 'utf-8');
        usedPath = p;
        break;
      }
    } catch {
      // Continue to next path
    }
  }

  if (!configContent) {
    console.warn('[selftest] Config file not found, using defaults');
    return DEFAULT_CONFIG;
  }

  console.log(`[selftest] Loading config from: ${usedPath}`);

  const parsed = yaml.load(configContent) as Partial<SelftestConfig>;
  return mergeWithDefaults(parsed);
}

/**
 * Merge parsed config with defaults
 */
function mergeWithDefaults(parsed: Partial<SelftestConfig>): SelftestConfig {
  return {
    version: parsed.version ?? DEFAULT_CONFIG.version,
    strictness: parsed.strictness ?? DEFAULT_CONFIG.strictness,
    min_score_to_pass: parsed.min_score_to_pass ?? DEFAULT_CONFIG.min_score_to_pass,
    allow_minor_format_deviation: parsed.allow_minor_format_deviation ?? DEFAULT_CONFIG.allow_minor_format_deviation,
    max_questions_allowed: parsed.max_questions_allowed ?? DEFAULT_CONFIG.max_questions_allowed,
    timeout_seconds: parsed.timeout_seconds ?? DEFAULT_CONFIG.timeout_seconds,
    generator: {
      ...DEFAULT_CONFIG.generator,
      ...(parsed.generator || {}),
    },
    judge: {
      ...DEFAULT_CONFIG.judge,
      ...(parsed.judge || {}),
    },
    weights: {
      ...DEFAULT_CONFIG.weights,
      ...(parsed.weights || {}),
    },
    scenarios: parsed.scenarios || DEFAULT_CONFIG.scenarios,
  };
}

/**
 * Filter scenarios for CI mode (only ci_included: true)
 */
export function filterScenariosForCI(config: SelftestConfig): SelftestConfig {
  return {
    ...config,
    scenarios: config.scenarios.filter(s => s.ci_included),
  };
}

/**
 * Calculate effective threshold based on strictness
 * Per spec: effective_threshold = min_score_to_pass + (strictness * 0.2)
 */
export function calculateEffectiveThreshold(config: SelftestConfig): number {
  return config.min_score_to_pass + (config.strictness * 0.2);
}

/**
 * Calculate overall score from individual scores
 */
export function calculateOverallScore(
  scores: Omit<import('./types').SelftestScores, 'overall_score'>,
  weights: ScoreWeights,
): number {
  return (
    scores.format_score * weights.format_score +
    scores.factuality_score * weights.factuality_score +
    scores.instruction_following_score * weights.instruction_following_score +
    scores.safety_score * weights.safety_score
  );
}
