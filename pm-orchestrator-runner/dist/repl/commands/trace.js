"use strict";
/**
 * Trace Command
 *
 * Per spec 28_CONVERSATION_TRACE.md Section 5.1:
 * - /trace <task-id|#>: Show conversation trace for a task
 * - /trace <task-id|#> --latest: Show only latest iteration
 * - /trace <task-id|#> --raw: Show raw JSONL data
 *
 * Records all LLM round-trips for post-hoc analysis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceCommand = void 0;
const conversation_tracer_1 = require("../../trace/conversation-tracer");
/**
 * Trace Command class
 * Per spec/28_CONVERSATION_TRACE.md Section 5.1
 */
class TraceCommand {
    /**
     * Get conversation trace for a task
     *
     * @param stateDir - State directory (e.g., .pm-orchestrator)
     * @param taskId - Task ID
     * @param options - Display options (latest, raw)
     * @returns Trace result
     */
    getTrace(stateDir, taskId, options = {}) {
        try {
            // Find trace file for the task
            const traceFile = conversation_tracer_1.ConversationTracer.getLatestTraceFile(stateDir, taskId);
            if (!traceFile) {
                return {
                    success: false,
                    message: 'No trace found for task',
                    error: {
                        code: 'E120',
                        message: `No conversation trace found for task: ${taskId}`,
                    },
                };
            }
            // Read trace entries
            const entries = conversation_tracer_1.ConversationTracer.readTrace(traceFile);
            if (entries.length === 0) {
                return {
                    success: false,
                    message: 'Trace file is empty',
                    error: {
                        code: 'E121',
                        message: `Conversation trace is empty for task: ${taskId}`,
                    },
                };
            }
            // Format output based on options
            const output = conversation_tracer_1.ConversationTracer.formatTraceForDisplay(entries, {
                latestOnly: options.latest,
                raw: options.raw,
            });
            return {
                success: true,
                message: 'Trace retrieved',
                output,
            };
        }
        catch (err) {
            return {
                success: false,
                message: 'Failed to retrieve trace',
                error: {
                    code: 'E122',
                    message: 'Failed to retrieve trace: ' + err.message,
                },
            };
        }
    }
    /**
     * List available trace files for a task
     *
     * @param stateDir - State directory
     * @param taskId - Task ID
     * @returns List of trace file paths
     */
    listTraceFiles(stateDir, taskId) {
        return conversation_tracer_1.ConversationTracer.findTraceFiles(stateDir, taskId);
    }
}
exports.TraceCommand = TraceCommand;
//# sourceMappingURL=trace.js.map