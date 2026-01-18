"use strict";
/**
 * Trace Pack - Minimal JSONL logging for session/task state transitions
 *
 * Per spec:
 * - JSONL format (one JSON object per line)
 * - Records: session_id, task_group_id, task_id, state transitions, verification results
 * - Verify function for output format compliance
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
exports.TracePack = void 0;
exports.verifyTraceFile = verifyTraceFile;
exports.readTraceFile = readTraceFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Trace Pack - JSONL logger for session/task state transitions
 */
class TracePack {
    config;
    outputPath;
    buffer = [];
    writeStream = null;
    constructor(config) {
        this.config = {
            buffered: true,
            maxBufferSize: 100,
            ...config,
        };
        // Ensure output directory exists
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true });
        }
        // Create trace file path
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.outputPath = path.join(this.config.outputDir, 'trace-' + this.config.sessionId + '-' + timestamp + '.jsonl');
    }
    /**
     * Get the output file path
     */
    getOutputPath() {
        return this.outputPath;
    }
    /**
     * Log a trace entry
     */
    log(entry) {
        const fullEntry = {
            timestamp: new Date().toISOString(),
            session_id: this.config.sessionId,
            ...entry,
        };
        if (this.config.buffered) {
            this.buffer.push(fullEntry);
            if (this.buffer.length >= (this.config.maxBufferSize || 100)) {
                this.flush();
            }
        }
        else {
            this.writeEntry(fullEntry);
        }
    }
    /**
     * Log session start
     */
    sessionStart(data) {
        this.log({
            event: 'SESSION_START',
            data,
        });
    }
    /**
     * Log session end
     */
    sessionEnd(data) {
        this.log({
            event: 'SESSION_END',
            data,
        });
        this.flush();
    }
    /**
     * Log task group start
     */
    taskGroupStart(taskGroupId, data) {
        this.log({
            event: 'TASK_GROUP_START',
            task_group_id: taskGroupId,
            data,
        });
    }
    /**
     * Log task group end
     */
    taskGroupEnd(taskGroupId, data) {
        this.log({
            event: 'TASK_GROUP_END',
            task_group_id: taskGroupId,
            data,
        });
    }
    /**
     * Log task start
     */
    taskStart(taskGroupId, taskId, data) {
        this.log({
            event: 'TASK_START',
            task_group_id: taskGroupId,
            task_id: taskId,
            data,
        });
    }
    /**
     * Log task state change
     */
    taskStateChange(taskGroupId, taskId, fromState, toState, data) {
        this.log({
            event: 'TASK_STATE_CHANGE',
            task_group_id: taskGroupId,
            task_id: taskId,
            from_state: fromState,
            to_state: toState,
            data,
        });
    }
    /**
     * Log task end
     */
    taskEnd(taskGroupId, taskId, finalState, data) {
        this.log({
            event: 'TASK_END',
            task_group_id: taskGroupId,
            task_id: taskId,
            to_state: finalState,
            data,
        });
    }
    /**
     * Log executor call
     */
    executorCall(taskGroupId, taskId, data) {
        this.log({
            event: 'EXECUTOR_CALL',
            task_group_id: taskGroupId,
            task_id: taskId,
            data,
        });
    }
    /**
     * Log executor result
     */
    executorResult(taskGroupId, taskId, status, data) {
        this.log({
            event: 'EXECUTOR_RESULT',
            task_group_id: taskGroupId,
            task_id: taskId,
            to_state: status,
            data,
        });
    }
    /**
     * Log verification start
     */
    verificationStart(taskGroupId, taskId, data) {
        this.log({
            event: 'VERIFICATION_START',
            task_group_id: taskGroupId,
            task_id: taskId,
            data,
        });
    }
    /**
     * Log verification result
     */
    verificationResult(taskGroupId, taskId, passed, checks, data) {
        this.log({
            event: 'VERIFICATION_RESULT',
            task_group_id: taskGroupId,
            task_id: taskId,
            verification_result: { passed, checks },
            data,
        });
    }
    /**
     * Log error
     */
    error(message, code, taskGroupId, taskId) {
        this.log({
            event: 'ERROR',
            task_group_id: taskGroupId,
            task_id: taskId,
            error: { message, code },
        });
    }
    /**
     * Log warning
     */
    warning(message, taskGroupId, taskId) {
        this.log({
            event: 'WARNING',
            task_group_id: taskGroupId,
            task_id: taskId,
            data: { message },
        });
    }
    /**
     * Flush buffer to file
     */
    flush() {
        if (this.buffer.length === 0)
            return;
        const entries = this.buffer.splice(0, this.buffer.length);
        for (const entry of entries) {
            this.writeEntry(entry);
        }
    }
    /**
     * Write single entry to file
     */
    writeEntry(entry) {
        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(this.outputPath, line, 'utf-8');
    }
    /**
     * Close the trace pack
     */
    close() {
        this.flush();
        if (this.writeStream) {
            this.writeStream.end();
            this.writeStream = null;
        }
    }
}
exports.TracePack = TracePack;
/**
 * Verify a trace file for format compliance
 */
function verifyTraceFile(filePath) {
    const result = {
        valid: true,
        entryCount: 0,
        errors: [],
        warnings: [],
        summary: {
            sessionStarts: 0,
            sessionEnds: 0,
            taskGroupStarts: 0,
            taskGroupEnds: 0,
            taskStarts: 0,
            taskEnds: 0,
            stateChanges: 0,
            verificationResults: 0,
            errors: 0,
        },
    };
    if (!fs.existsSync(filePath)) {
        result.valid = false;
        result.errors.push({ line: 0, error: 'File does not exist' });
        return result;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i];
        try {
            const entry = JSON.parse(line);
            result.entryCount++;
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
            // Validate timestamp format
            if (entry.timestamp && isNaN(Date.parse(entry.timestamp))) {
                result.errors.push({ line: lineNum, error: 'Invalid timestamp format' });
                result.valid = false;
            }
            // Count event types
            switch (entry.event) {
                case 'SESSION_START':
                    result.summary.sessionStarts++;
                    break;
                case 'SESSION_END':
                    result.summary.sessionEnds++;
                    break;
                case 'TASK_GROUP_START':
                    result.summary.taskGroupStarts++;
                    break;
                case 'TASK_GROUP_END':
                    result.summary.taskGroupEnds++;
                    break;
                case 'TASK_START':
                    result.summary.taskStarts++;
                    break;
                case 'TASK_END':
                    result.summary.taskEnds++;
                    break;
                case 'TASK_STATE_CHANGE':
                    result.summary.stateChanges++;
                    break;
                case 'VERIFICATION_RESULT':
                    result.summary.verificationResults++;
                    break;
                case 'ERROR':
                    result.summary.errors++;
                    break;
            }
            // Validate state change events have from_state and to_state
            if (entry.event === 'TASK_STATE_CHANGE') {
                if (!entry.from_state) {
                    result.warnings.push({ line: lineNum, warning: 'State change missing from_state' });
                }
                if (!entry.to_state) {
                    result.warnings.push({ line: lineNum, warning: 'State change missing to_state' });
                }
            }
            // Validate verification result events have verification_result
            if (entry.event === 'VERIFICATION_RESULT' && !entry.verification_result) {
                result.warnings.push({ line: lineNum, warning: 'Verification result event missing verification_result' });
            }
            // Validate error events have error
            if (entry.event === 'ERROR' && !entry.error) {
                result.warnings.push({ line: lineNum, warning: 'Error event missing error details' });
            }
        }
        catch (e) {
            result.valid = false;
            const errMsg = e.message;
            result.errors.push({ line: lineNum, error: 'Invalid JSON: ' + errMsg });
        }
    }
    // Check for balanced starts/ends
    if (result.summary.sessionStarts !== result.summary.sessionEnds) {
        result.warnings.push({
            line: 0,
            warning: 'Unbalanced sessions: ' + result.summary.sessionStarts + ' starts, ' + result.summary.sessionEnds + ' ends',
        });
    }
    if (result.summary.taskGroupStarts !== result.summary.taskGroupEnds) {
        result.warnings.push({
            line: 0,
            warning: 'Unbalanced task groups: ' + result.summary.taskGroupStarts + ' starts, ' + result.summary.taskGroupEnds + ' ends',
        });
    }
    if (result.summary.taskStarts !== result.summary.taskEnds) {
        result.warnings.push({
            line: 0,
            warning: 'Unbalanced tasks: ' + result.summary.taskStarts + ' starts, ' + result.summary.taskEnds + ' ends',
        });
    }
    return result;
}
/**
 * Read and parse a trace file
 */
function readTraceFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line) => JSON.parse(line));
}
//# sourceMappingURL=trace-pack.js.map