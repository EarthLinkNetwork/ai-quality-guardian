"use strict";
/**
 * Conversation Tracer - JSONL logging for LLM round-trips
 *
 * Per spec/28_CONVERSATION_TRACE.md:
 * - Records all LLM round-trips (request → response → judgment → retry)
 * - JSONL format (one JSON object per line)
 * - Separate from TracePack (complementary, not extending)
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
exports.ConversationTracer = void 0;
exports.verifyConversationTrace = verifyConversationTrace;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Conversation Tracer - JSONL logger for LLM round-trips
 *
 * Records complete conversation history including:
 * - User requests
 * - System rules injection
 * - LLM requests and responses
 * - Quality judgments
 * - Rejection details and modification prompts
 * - Final summaries
 */
class ConversationTracer {
    config;
    traceFilePath;
    buffer = [];
    constructor(config) {
        this.config = config;
        // Ensure traces directory exists
        const tracesDir = path.join(config.stateDir, 'traces');
        if (!fs.existsSync(tracesDir)) {
            fs.mkdirSync(tracesDir, { recursive: true });
        }
        // Create trace file path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.traceFilePath = path.join(tracesDir, `conversation-${config.taskId}-${timestamp}.jsonl`);
    }
    /**
     * Get the trace file path
     */
    getTraceFilePath() {
        return this.traceFilePath;
    }
    /**
     * Log a trace entry
     */
    log(event, data, options) {
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            session_id: this.config.sessionId,
            task_id: this.config.taskId,
            data,
        };
        if (options?.iterationIndex !== undefined) {
            entry.iteration_index = options.iterationIndex;
        }
        if (options?.subtaskId) {
            entry.subtask_id = options.subtaskId;
        }
        this.buffer.push(entry);
        this.writeEntry(entry);
    }
    /**
     * Write entry to file
     */
    writeEntry(entry) {
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(this.traceFilePath, line, 'utf-8');
    }
    /**
     * Log user request
     */
    logUserRequest(prompt) {
        this.log('USER_REQUEST', { prompt });
    }
    /**
     * Log system rules injection
     */
    logSystemRules(rules) {
        this.log('SYSTEM_RULES', { rules });
    }
    /**
     * Log chunking plan
     */
    logChunkingPlan(subtasks) {
        this.log('CHUNKING_PLAN', { subtasks });
    }
    /**
     * Log LLM request
     */
    logLLMRequest(prompt, iterationIndex, subtaskId) {
        this.log('LLM_REQUEST', { prompt, subtask_id: subtaskId }, { iterationIndex, subtaskId });
    }
    /**
     * Log LLM response
     */
    logLLMResponse(output, status, filesModified, iterationIndex, subtaskId) {
        this.log('LLM_RESPONSE', {
            output,
            status,
            files_modified: filesModified,
        }, { iterationIndex, subtaskId });
    }
    /**
     * Log quality judgment
     */
    logQualityJudgment(judgment, criteriaResults, iterationIndex, summary, subtaskId) {
        this.log('QUALITY_JUDGMENT', {
            judgment,
            criteria_results: criteriaResults,
            summary,
        }, { iterationIndex, subtaskId });
    }
    /**
     * Log rejection details
     */
    logRejectionDetails(criteriaFailed, modificationPrompt, iterationIndex, subtaskId) {
        this.log('REJECTION_DETAILS', {
            criteria_failed: criteriaFailed,
            modification_prompt: modificationPrompt,
        }, { iterationIndex, subtaskId });
    }
    /**
     * Log iteration end
     */
    logIterationEnd(iterationIndex, judgment, subtaskId) {
        this.log('ITERATION_END', {
            iteration_index: iterationIndex,
            judgment,
        }, { iterationIndex, subtaskId });
    }
    /**
     * Log final summary
     */
    logFinalSummary(status, totalIterations, filesModified) {
        this.log('FINAL_SUMMARY', {
            status,
            total_iterations: totalIterations,
            files_modified: filesModified,
        });
    }
    /**
     * Get all buffered entries (for testing)
     */
    getEntries() {
        return [...this.buffer];
    }
    /**
     * Read trace from file
     */
    static readTrace(filePath) {
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter((line) => line.trim().length > 0);
        return lines.map((line) => JSON.parse(line));
    }
    /**
     * Find trace files for a task
     */
    static findTraceFiles(stateDir, taskId) {
        const tracesDir = path.join(stateDir, 'traces');
        if (!fs.existsSync(tracesDir)) {
            return [];
        }
        const files = fs.readdirSync(tracesDir);
        return files
            .filter((f) => f.startsWith(`conversation-${taskId}-`) && f.endsWith('.jsonl'))
            .map((f) => path.join(tracesDir, f))
            .sort()
            .reverse(); // Most recent first
    }
    /**
     * Get the latest trace file for a task
     */
    static getLatestTraceFile(stateDir, taskId) {
        const files = ConversationTracer.findTraceFiles(stateDir, taskId);
        return files.length > 0 ? files[0] : null;
    }
    /**
     * Format trace entries for display
     */
    static formatTraceForDisplay(entries, options) {
        if (options?.raw) {
            return entries.map((e) => JSON.stringify(e)).join('\n');
        }
        if (options?.latestOnly && entries.length > 0) {
            // Find the last iteration's entries
            const lastIterationIndex = Math.max(...entries
                .filter((e) => e.iteration_index !== undefined)
                .map((e) => e.iteration_index));
            entries = entries.filter((e) => e.iteration_index === undefined ||
                e.iteration_index === lastIterationIndex ||
                e.event === 'USER_REQUEST' ||
                e.event === 'SYSTEM_RULES' ||
                e.event === 'FINAL_SUMMARY');
        }
        const lines = [];
        for (const entry of entries) {
            const time = new Date(entry.timestamp).toLocaleString();
            const iterStr = entry.iteration_index !== undefined ? `[${entry.iteration_index}]` : '';
            switch (entry.event) {
                case 'USER_REQUEST':
                    lines.push(`[${time}] USER_REQUEST: ${truncate(entry.data.prompt, 100)}`);
                    break;
                case 'SYSTEM_RULES':
                    lines.push(`[${time}] SYSTEM_RULES: (Mandatory Rules injected)`);
                    break;
                case 'CHUNKING_PLAN':
                    const subtasks = entry.data.subtasks;
                    lines.push(`[${time}] CHUNKING_PLAN: ${subtasks.length} subtasks`);
                    break;
                case 'LLM_REQUEST':
                    lines.push(`[${time}] LLM_REQUEST${iterStr}: (prompt sent)`);
                    break;
                case 'LLM_RESPONSE':
                    lines.push(`[${time}] LLM_RESPONSE${iterStr}: ${truncate(entry.data.output, 100)}`);
                    break;
                case 'QUALITY_JUDGMENT':
                    const criteria = entry.data.criteria_results;
                    const failed = criteria.filter((c) => !c.passed);
                    const failedStr = failed.length > 0
                        ? ` (${failed.map((c) => `${c.id}: ${c.reason || 'failed'}`).join(', ')})`
                        : '';
                    lines.push(`[${time}] QUALITY_JUDGMENT${iterStr}: ${entry.data.judgment}${failedStr}`);
                    break;
                case 'REJECTION_DETAILS':
                    lines.push(`[${time}] REJECTION_DETAILS${iterStr}: ${truncate(entry.data.modification_prompt, 100)}`);
                    break;
                case 'ITERATION_END':
                    lines.push(`[${time}] ITERATION_END${iterStr}: ${entry.data.judgment}`);
                    break;
                case 'FINAL_SUMMARY':
                    lines.push(`[${time}] FINAL_SUMMARY: ${entry.data.status} (${entry.data.total_iterations} iterations)`);
                    break;
            }
        }
        return lines.join('\n');
    }
}
exports.ConversationTracer = ConversationTracer;
/**
 * Truncate string with ellipsis
 */
function truncate(str, maxLen) {
    if (!str)
        return '';
    const cleaned = str.replace(/\n/g, ' ').trim();
    if (cleaned.length <= maxLen)
        return cleaned;
    return cleaned.substring(0, maxLen - 3) + '...';
}
/**
 * Verify a conversation trace file
 */
function verifyConversationTrace(filePath) {
    const result = {
        valid: true,
        entryCount: 0,
        errors: [],
        summary: {
            userRequests: 0,
            systemRules: 0,
            chunkingPlans: 0,
            llmRequests: 0,
            llmResponses: 0,
            qualityJudgments: 0,
            rejectionDetails: 0,
            iterationEnds: 0,
            finalSummaries: 0,
            judgments: [],
            totalIterations: 0,
        },
    };
    if (!fs.existsSync(filePath)) {
        result.valid = false;
        result.errors.push({ line: 0, error: 'File does not exist' });
        return result;
    }
    const entries = ConversationTracer.readTrace(filePath);
    result.entryCount = entries.length;
    let maxIteration = -1;
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const lineNum = i + 1;
        // Validate required fields
        if (!entry.timestamp) {
            result.errors.push({ line: lineNum, error: 'Missing timestamp' });
            result.valid = false;
        }
        if (!entry.event) {
            result.errors.push({ line: lineNum, error: 'Missing event type' });
            result.valid = false;
        }
        if (!entry.session_id) {
            result.errors.push({ line: lineNum, error: 'Missing session_id' });
            result.valid = false;
        }
        if (!entry.task_id) {
            result.errors.push({ line: lineNum, error: 'Missing task_id' });
            result.valid = false;
        }
        // Track max iteration
        if (entry.iteration_index !== undefined && entry.iteration_index > maxIteration) {
            maxIteration = entry.iteration_index;
        }
        // Count event types
        switch (entry.event) {
            case 'USER_REQUEST':
                result.summary.userRequests++;
                break;
            case 'SYSTEM_RULES':
                result.summary.systemRules++;
                break;
            case 'CHUNKING_PLAN':
                result.summary.chunkingPlans++;
                break;
            case 'LLM_REQUEST':
                result.summary.llmRequests++;
                break;
            case 'LLM_RESPONSE':
                result.summary.llmResponses++;
                break;
            case 'QUALITY_JUDGMENT':
                result.summary.qualityJudgments++;
                if (entry.data.judgment) {
                    result.summary.judgments.push(entry.data.judgment);
                }
                break;
            case 'REJECTION_DETAILS':
                result.summary.rejectionDetails++;
                break;
            case 'ITERATION_END':
                result.summary.iterationEnds++;
                break;
            case 'FINAL_SUMMARY':
                result.summary.finalSummaries++;
                break;
        }
    }
    result.summary.totalIterations = maxIteration + 1;
    return result;
}
//# sourceMappingURL=conversation-tracer.js.map