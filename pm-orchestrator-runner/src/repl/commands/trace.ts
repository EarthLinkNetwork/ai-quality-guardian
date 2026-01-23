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

import { ConversationTracer } from '../../trace/conversation-tracer';

/**
 * Trace command result
 */
export interface TraceResult {
  success: boolean;
  message: string;
  output?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Trace options
 */
export interface TraceOptions {
  /** Show only latest iteration */
  latest?: boolean;
  /** Show raw JSONL data */
  raw?: boolean;
}

/**
 * Trace Command class
 * Per spec/28_CONVERSATION_TRACE.md Section 5.1
 */
export class TraceCommand {
  /**
   * Get conversation trace for a task
   *
   * @param stateDir - State directory (e.g., .pm-orchestrator)
   * @param taskId - Task ID
   * @param options - Display options (latest, raw)
   * @returns Trace result
   */
  getTrace(stateDir: string, taskId: string, options: TraceOptions = {}): TraceResult {
    try {
      // Find trace file for the task
      const traceFile = ConversationTracer.getLatestTraceFile(stateDir, taskId);

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
      const entries = ConversationTracer.readTrace(traceFile);

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
      const output = ConversationTracer.formatTraceForDisplay(entries, {
        latestOnly: options.latest,
        raw: options.raw,
      });

      return {
        success: true,
        message: 'Trace retrieved',
        output,
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to retrieve trace',
        error: {
          code: 'E122',
          message: 'Failed to retrieve trace: ' + (err as Error).message,
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
  listTraceFiles(stateDir: string, taskId: string): string[] {
    return ConversationTracer.findTraceFiles(stateDir, taskId);
  }
}
