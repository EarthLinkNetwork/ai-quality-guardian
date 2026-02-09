"use strict";
/**
 * Selftest Config Loader
 * Loads and validates selftest.yaml configuration
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSelftestConfig = loadSelftestConfig;
exports.filterScenariosForCI = filterScenariosForCI;
exports.calculateEffectiveThreshold = calculateEffectiveThreshold;
exports.calculateOverallScore = calculateOverallScore;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
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
function loadSelftestConfig(configPath) {
    // Try multiple paths
    const searchPaths = [
        configPath,
        path.join(process.cwd(), 'config', 'selftest.yaml'),
        path.join(process.cwd(), 'config', 'selftest.yml'),
        path.join(__dirname, '..', '..', 'config', 'selftest.yaml'),
    ].filter(Boolean);
    let configContent;
    let usedPath;
    for (const p of searchPaths) {
        try {
            if (fs.existsSync(p)) {
                configContent = fs.readFileSync(p, 'utf-8');
                usedPath = p;
                break;
            }
        }
        catch {
            // Continue to next path
        }
    }
    if (!configContent) {
        console.warn('[selftest] Config file not found, using defaults');
        return DEFAULT_CONFIG;
    }
    console.log(`[selftest] Loading config from: ${usedPath}`);
    const parsed = yaml.load(configContent);
    return mergeWithDefaults(parsed);
}
/**
 * Merge parsed config with defaults
 */
function mergeWithDefaults(parsed) {
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
function filterScenariosForCI(config) {
    return {
        ...config,
        scenarios: config.scenarios.filter(s => s.ci_included),
    };
}
/**
 * Calculate effective threshold based on strictness
 * Per spec: effective_threshold = min_score_to_pass + (strictness * 0.2)
 */
function calculateEffectiveThreshold(config) {
    return config.min_score_to_pass + (config.strictness * 0.2);
}
/**
 * Calculate overall score from individual scores
 */
function calculateOverallScore(scores, weights) {
    return (scores.format_score * weights.format_score +
        scores.factuality_score * weights.factuality_score +
        scores.instruction_following_score * weights.instruction_following_score +
        scores.safety_score * weights.safety_score);
}
//# sourceMappingURL=config-loader.js.map