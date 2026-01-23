/**
 * Conversation Tracer - JSONL logging for LLM round-trips
 *
 * Per spec/28_CONVERSATION_TRACE.md:
 * - Records all LLM round-trips (request → response → judgment → retry)
 * - JSONL format (one JSON object per line)
 * - Separate from TracePack (complementary, not extending)
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Conversation trace event types
 */
export type ConversationTraceEventType =
  | 'USER_REQUEST'
  | 'SYSTEM_RULES'
  | 'CHUNKING_PLAN'
  | 'LLM_REQUEST'
  | 'LLM_RESPONSE'
  | 'QUALITY_JUDGMENT'
  | 'REJECTION_DETAILS'
  | 'ITERATION_END'
  | 'FINAL_SUMMARY';

/**
 * Quality criteria result
 */
export interface CriteriaResult {
  /** Criteria ID (Q1-Q9) */
  id: string;
  /** Criteria name */
  name: string;
  /** PASS/FAIL */
  passed: boolean;
  /** Reason for the result */
  reason?: string;
}

/**
 * Subtask plan for chunking
 */
export interface SubtaskPlan {
  /** Subtask ID */
  id: string;
  /** Subtask description */
  description: string;
  /** Dependencies on other subtasks */
  dependencies?: string[];
}

/**
 * Conversation trace entry (1 line in JSONL)
 */
export interface ConversationTraceEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Event type */
  event: ConversationTraceEventType;
  /** Session ID */
  session_id: string;
  /** Task ID */
  task_id: string;
  /** Subtask ID (for Task Chunking) */
  subtask_id?: string;
  /** Iteration index (0-based) */
  iteration_index?: number;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/**
 * Configuration for ConversationTracer
 */
export interface ConversationTracerConfig {
  /** State directory for trace files */
  stateDir: string;
  /** Session ID */
  sessionId: string;
  /** Task ID */
  taskId: string;
}

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
export class ConversationTracer {
  private config: ConversationTracerConfig;
  private traceFilePath: string;
  private buffer: ConversationTraceEntry[] = [];

  constructor(config: ConversationTracerConfig) {
    this.config = config;

    // Ensure traces directory exists
    const tracesDir = path.join(config.stateDir, 'traces');
    if (!fs.existsSync(tracesDir)) {
      fs.mkdirSync(tracesDir, { recursive: true });
    }

    // Create trace file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.traceFilePath = path.join(
      tracesDir,
      `conversation-${config.taskId}-${timestamp}.jsonl`
    );
  }

  /**
   * Get the trace file path
   */
  getTraceFilePath(): string {
    return this.traceFilePath;
  }

  /**
   * Log a trace entry
   */
  private log(
    event: ConversationTraceEventType,
    data: Record<string, unknown>,
    options?: {
      iterationIndex?: number;
      subtaskId?: string;
    }
  ): void {
    const entry: ConversationTraceEntry = {
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
  private writeEntry(entry: ConversationTraceEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.traceFilePath, line, 'utf-8');
  }

  /**
   * Log user request
   */
  logUserRequest(prompt: string): void {
    this.log('USER_REQUEST', { prompt });
  }

  /**
   * Log system rules injection
   */
  logSystemRules(rules: string): void {
    this.log('SYSTEM_RULES', { rules });
  }

  /**
   * Log chunking plan
   */
  logChunkingPlan(subtasks: SubtaskPlan[]): void {
    this.log('CHUNKING_PLAN', { subtasks });
  }

  /**
   * Log LLM request
   */
  logLLMRequest(
    prompt: string,
    iterationIndex: number,
    subtaskId?: string
  ): void {
    this.log(
      'LLM_REQUEST',
      { prompt, subtask_id: subtaskId },
      { iterationIndex, subtaskId }
    );
  }

  /**
   * Log LLM response
   */
  logLLMResponse(
    output: string,
    status: string,
    filesModified: string[],
    iterationIndex: number,
    subtaskId?: string
  ): void {
    this.log(
      'LLM_RESPONSE',
      {
        output,
        status,
        files_modified: filesModified,
      },
      { iterationIndex, subtaskId }
    );
  }

  /**
   * Log quality judgment
   */
  logQualityJudgment(
    judgment: 'PASS' | 'REJECT' | 'RETRY',
    criteriaResults: CriteriaResult[],
    iterationIndex: number,
    summary?: string,
    subtaskId?: string
  ): void {
    this.log(
      'QUALITY_JUDGMENT',
      {
        judgment,
        criteria_results: criteriaResults,
        summary,
      },
      { iterationIndex, subtaskId }
    );
  }

  /**
   * Log rejection details
   */
  logRejectionDetails(
    criteriaFailed: string[],
    modificationPrompt: string,
    iterationIndex: number,
    subtaskId?: string
  ): void {
    this.log(
      'REJECTION_DETAILS',
      {
        criteria_failed: criteriaFailed,
        modification_prompt: modificationPrompt,
      },
      { iterationIndex, subtaskId }
    );
  }

  /**
   * Log iteration end
   */
  logIterationEnd(
    iterationIndex: number,
    judgment: string,
    subtaskId?: string
  ): void {
    this.log(
      'ITERATION_END',
      {
        iteration_index: iterationIndex,
        judgment,
      },
      { iterationIndex, subtaskId }
    );
  }

  /**
   * Log final summary
   */
  logFinalSummary(
    status: string,
    totalIterations: number,
    filesModified: string[]
  ): void {
    this.log('FINAL_SUMMARY', {
      status,
      total_iterations: totalIterations,
      files_modified: filesModified,
    });
  }

  /**
   * Get all buffered entries (for testing)
   */
  getEntries(): ConversationTraceEntry[] {
    return [...this.buffer];
  }

  /**
   * Read trace from file
   */
  static readTrace(filePath: string): ConversationTraceEntry[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    return lines.map((line) => JSON.parse(line) as ConversationTraceEntry);
  }

  /**
   * Find trace files for a task
   */
  static findTraceFiles(stateDir: string, taskId: string): string[] {
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
  static getLatestTraceFile(stateDir: string, taskId: string): string | null {
    const files = ConversationTracer.findTraceFiles(stateDir, taskId);
    return files.length > 0 ? files[0] : null;
  }

  /**
   * Format trace entries for display
   */
  static formatTraceForDisplay(
    entries: ConversationTraceEntry[],
    options?: { latestOnly?: boolean; raw?: boolean }
  ): string {
    if (options?.raw) {
      return entries.map((e) => JSON.stringify(e)).join('\n');
    }

    if (options?.latestOnly && entries.length > 0) {
      // Find the last iteration's entries
      const lastIterationIndex = Math.max(
        ...entries
          .filter((e) => e.iteration_index !== undefined)
          .map((e) => e.iteration_index!)
      );
      entries = entries.filter(
        (e) =>
          e.iteration_index === undefined ||
          e.iteration_index === lastIterationIndex ||
          e.event === 'USER_REQUEST' ||
          e.event === 'SYSTEM_RULES' ||
          e.event === 'FINAL_SUMMARY'
      );
    }

    const lines: string[] = [];

    for (const entry of entries) {
      const time = new Date(entry.timestamp).toLocaleString();
      const iterStr =
        entry.iteration_index !== undefined ? `[${entry.iteration_index}]` : '';

      switch (entry.event) {
        case 'USER_REQUEST':
          lines.push(`[${time}] USER_REQUEST: ${truncate(entry.data.prompt as string, 100)}`);
          break;
        case 'SYSTEM_RULES':
          lines.push(`[${time}] SYSTEM_RULES: (Mandatory Rules injected)`);
          break;
        case 'CHUNKING_PLAN':
          const subtasks = entry.data.subtasks as SubtaskPlan[];
          lines.push(`[${time}] CHUNKING_PLAN: ${subtasks.length} subtasks`);
          break;
        case 'LLM_REQUEST':
          lines.push(`[${time}] LLM_REQUEST${iterStr}: (prompt sent)`);
          break;
        case 'LLM_RESPONSE':
          lines.push(
            `[${time}] LLM_RESPONSE${iterStr}: ${truncate(entry.data.output as string, 100)}`
          );
          break;
        case 'QUALITY_JUDGMENT':
          const criteria = entry.data.criteria_results as CriteriaResult[];
          const failed = criteria.filter((c) => !c.passed);
          const failedStr =
            failed.length > 0
              ? ` (${failed.map((c) => `${c.id}: ${c.reason || 'failed'}`).join(', ')})`
              : '';
          lines.push(
            `[${time}] QUALITY_JUDGMENT${iterStr}: ${entry.data.judgment}${failedStr}`
          );
          break;
        case 'REJECTION_DETAILS':
          lines.push(
            `[${time}] REJECTION_DETAILS${iterStr}: ${truncate(entry.data.modification_prompt as string, 100)}`
          );
          break;
        case 'ITERATION_END':
          lines.push(
            `[${time}] ITERATION_END${iterStr}: ${entry.data.judgment}`
          );
          break;
        case 'FINAL_SUMMARY':
          lines.push(
            `[${time}] FINAL_SUMMARY: ${entry.data.status} (${entry.data.total_iterations} iterations)`
          );
          break;
      }
    }

    return lines.join('\n');
  }
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  const cleaned = str.replace(/\n/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.substring(0, maxLen - 3) + '...';
}

/**
 * Verify conversation trace file format compliance
 */
export interface ConversationTraceVerifyResult {
  valid: boolean;
  entryCount: number;
  errors: Array<{ line: number; error: string }>;
  summary: {
    userRequests: number;
    systemRules: number;
    chunkingPlans: number;
    llmRequests: number;
    llmResponses: number;
    qualityJudgments: number;
    rejectionDetails: number;
    iterationEnds: number;
    finalSummaries: number;
    judgments: string[];
    totalIterations: number;
  };
}

/**
 * Verify a conversation trace file
 */
export function verifyConversationTrace(
  filePath: string
): ConversationTraceVerifyResult {
  const result: ConversationTraceVerifyResult = {
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
          result.summary.judgments.push(entry.data.judgment as string);
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
