/**
 * Selftest Types
 * Per SELFTEST_AI_JUDGE.md specification
 */

/**
 * Score breakdown for AI Judge evaluation
 */
export interface SelftestScores {
  format_score: number;      // 0.0 - 1.0
  factuality_score: number;  // 0.0 - 1.0
  instruction_following_score: number;  // 0.0 - 1.0
  safety_score: number;      // 0.0 - 1.0
  overall_score: number;     // weighted average
}

/**
 * Scoring weights from config
 */
export interface ScoreWeights {
  format_score: number;
  factuality_score: number;
  instruction_following_score: number;
  safety_score: number;
}

/**
 * Generator settings from config
 */
export interface GeneratorConfig {
  use_mock: boolean;
  model: string;
  temperature: number;
  max_tokens: number;
}

/**
 * Judge settings from config
 */
export interface JudgeConfig {
  use_mock: boolean;
  model: string;
  temperature: number;
  max_tokens: number;
}

/**
 * Test scenario definition from config
 */
export interface SelftestScenario {
  id: string;
  description: string;
  expected_status: 'COMPLETE' | 'AWAITING_RESPONSE' | 'ERROR';
  ci_included: boolean;
  prompt_template: string;
  hints: string[];
  requires_reply?: boolean;
  reply_flow?: Array<{
    reply: string;
    expected_status: string;
  }>;
}

/**
 * Full selftest configuration
 */
export interface SelftestConfig {
  version: number;
  strictness: number;
  min_score_to_pass: number;
  allow_minor_format_deviation: boolean;
  max_questions_allowed: number;
  timeout_seconds: number;
  generator: GeneratorConfig;
  judge: JudgeConfig;
  weights: ScoreWeights;
  scenarios: SelftestScenario[];
}

/**
 * Generator output
 */
export interface GeneratedPrompt {
  prompt: string;
  hints: string[];
  scenario_id: string;
}

/**
 * Judge evaluation input
 */
export interface JudgeInput {
  scenario_id: string;
  prompt: string;
  output: string;
  hints: string[];
  expected_status: string;
  actual_status: string;
  config: SelftestConfig;
}

/**
 * Judge evaluation output
 */
export interface JudgeResult {
  scores: SelftestScores;
  pass: boolean;
  reasoning: string;
  status_match: boolean;
}

/**
 * Single test case result
 */
export interface SelftestCaseResult {
  id: string;
  description: string;
  prompt: string;
  output: string;
  expected_status: string;
  actual_status: string;
  scores: SelftestScores;
  pass: boolean;
  reasoning: string;
  duration_ms: number;
}

/**
 * Full selftest report
 */
export interface SelftestReport {
  run_id: string;
  timestamp: string;
  config: {
    strictness: number;
    min_score_to_pass: number;
    effective_threshold: number;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    pass_rate: number;
  };
  cases: SelftestCaseResult[];
}

/**
 * Selftest run options
 */
export interface SelftestOptions {
  /** Use CI mode (short version, 2 scenarios) */
  ci: boolean;
  /** Override timeout in ms */
  timeoutMs?: number;
  /** Custom config path */
  configPath?: string;
  /** Base directory for output */
  baseDir: string;
  /** Session ID prefix */
  sessionPrefix?: string;
}
