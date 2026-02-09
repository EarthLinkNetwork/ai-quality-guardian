/**
 * Selftest Config Loader
 * Loads and validates selftest.yaml configuration
 */
import { SelftestConfig, ScoreWeights } from './types';
/**
 * Load selftest configuration from YAML file
 */
export declare function loadSelftestConfig(configPath?: string): SelftestConfig;
/**
 * Filter scenarios for CI mode (only ci_included: true)
 */
export declare function filterScenariosForCI(config: SelftestConfig): SelftestConfig;
/**
 * Calculate effective threshold based on strictness
 * Per spec: effective_threshold = min_score_to_pass + (strictness * 0.2)
 */
export declare function calculateEffectiveThreshold(config: SelftestConfig): number;
/**
 * Calculate overall score from individual scores
 */
export declare function calculateOverallScore(scores: Omit<import('./types').SelftestScores, 'overall_score'>, weights: ScoreWeights): number;
//# sourceMappingURL=config-loader.d.ts.map