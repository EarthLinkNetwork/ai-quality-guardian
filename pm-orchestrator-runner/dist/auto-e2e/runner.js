"use strict";
/**
 * Auto E2E Runner
 *
 * Runs AI-driven E2E tests against the Web API.
 * Tests are generated dynamically and evaluated by AI judge.
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
exports.loadAITestConfig = loadAITestConfig;
exports.runAutoE2E = runAutoE2E;
exports.generateStandardTestCases = generateStandardTestCases;
exports.saveReport = saveReport;
exports.isAutoE2EAvailable = isAutoE2EAvailable;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const judge_1 = require("./judge");
const global_config_1 = require("../config/global-config");
/**
 * Default config path
 */
const CONFIG_PATH = path.join(__dirname, '../../config/ai-test-config.json');
/**
 * Load AI test config
 */
function loadAITestConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
            return JSON.parse(content);
        }
    }
    catch {
        // Fall through to defaults
    }
    return {
        passThreshold: 0.72,
        strictMode: false,
        maxAutoFixIterations: 5,
        sandboxDir: 'testsandbox',
        enableAutoE2E: true,
        judgeModel: 'gpt-4o-mini',
        testGeneratorModel: 'gpt-4o-mini',
        timeoutMs: 30000,
        retryDelayMs: 1000,
    };
}
/**
 * Generate unique run ID
 */
function generateRunId() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const random = Math.random().toString(36).slice(2, 8);
    return `auto-e2e-${timestamp}-${random}`;
}
/**
 * Submit task to Web API and get response
 */
async function submitTask(baseUrl, taskGroupId, prompt, timeoutMs) {
    // Enqueue task
    const enqueueRes = await fetch(`${baseUrl}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            task_group_id: taskGroupId,
            prompt,
        }),
    });
    if (!enqueueRes.ok) {
        throw new Error(`Failed to enqueue task: ${enqueueRes.status}`);
    }
    const enqueueData = await enqueueRes.json();
    const taskId = enqueueData.task_id;
    // Poll for completion
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        const statusRes = await fetch(`${baseUrl}/api/tasks/${taskId}`);
        if (!statusRes.ok) {
            throw new Error(`Failed to get task status: ${statusRes.status}`);
        }
        const taskData = await statusRes.json();
        const status = taskData.status;
        if (status === 'COMPLETE' || status === 'AWAITING_RESPONSE' || status === 'ERROR') {
            return {
                taskId,
                response: taskData.output || taskData.error_message || '',
                status,
            };
        }
        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Task timed out after ${timeoutMs}ms`);
}
/**
 * Run a single test case
 */
async function runTestCase(baseUrl, testCase, config) {
    const startTime = Date.now();
    const taskGroupId = `auto-test-${testCase.id}-${Date.now()}`;
    try {
        const { response, status } = await submitTask(baseUrl, taskGroupId, testCase.prompt, config.timeoutMs);
        // Check if response contains questions when it shouldn't
        if (testCase.expectedBehavior.includes('no questions') && (0, judge_1.containsQuestions)(response)) {
            return {
                testCase,
                response,
                judgeResult: {
                    pass: false,
                    score: 0.3,
                    reason: 'Response contains questions when direct answer was expected',
                },
                durationMs: Date.now() - startTime,
                timestamp: new Date().toISOString(),
            };
        }
        // Use AI judge for evaluation
        const judgeResult = await (0, judge_1.judge)({
            prompt: testCase.prompt,
            response,
            context: testCase.context,
            expectedBehavior: testCase.expectedBehavior,
        }, config);
        return {
            testCase,
            response,
            judgeResult,
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
        };
    }
    catch (error) {
        return {
            testCase,
            response: '',
            judgeResult: {
                pass: false,
                score: 0,
                reason: `Test execution error: ${error.message}`,
            },
            durationMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
        };
    }
}
/**
 * Run all test cases
 */
async function runAutoE2E(baseUrl, testCases, config) {
    const effectiveConfig = config || loadAITestConfig();
    const runId = generateRunId();
    const results = [];
    for (const testCase of testCases) {
        const result = await runTestCase(baseUrl, testCase, effectiveConfig);
        results.push(result);
        // Delay between tests
        await new Promise(resolve => setTimeout(resolve, effectiveConfig.retryDelayMs));
    }
    const passed = results.filter(r => r.judgeResult.pass).length;
    return {
        runId,
        timestamp: new Date().toISOString(),
        config: effectiveConfig,
        summary: {
            total: results.length,
            passed,
            failed: results.length - passed,
            passRate: results.length > 0 ? passed / results.length : 0,
        },
        results,
        overallPass: passed === results.length,
    };
}
/**
 * Generate standard test cases for a given functionality
 */
function generateStandardTestCases(functionality) {
    return [
        {
            id: `${functionality}-basic`,
            description: `Basic functionality test for ${functionality}`,
            prompt: `Test the ${functionality} feature with a simple case.`,
            expectedBehavior: 'Should work correctly with basic input',
        },
        {
            id: `${functionality}-edge`,
            description: `Edge case test for ${functionality}`,
            prompt: `Test the ${functionality} feature with edge cases (empty input, special characters).`,
            expectedBehavior: 'Should handle edge cases gracefully',
        },
    ];
}
/**
 * Save report to file
 */
function saveReport(report, outputDir) {
    const filename = `${report.runId}.json`;
    const filepath = path.join(outputDir, filename);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
    return filepath;
}
/**
 * Check if auto E2E is enabled and API key is available
 */
function isAutoE2EAvailable() {
    const config = loadAITestConfig();
    if (!config.enableAutoE2E) {
        return false;
    }
    const apiKey = (0, global_config_1.getApiKey)('openai');
    return !!apiKey;
}
//# sourceMappingURL=runner.js.map