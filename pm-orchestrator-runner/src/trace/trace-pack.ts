/**
 * Trace Pack - Minimal JSONL logging for session/task state transitions
 *
 * Per spec:
 * - JSONL format (one JSON object per line)
 * - Records: session_id, task_group_id, task_id, state transitions, verification results
 * - Verify function for output format compliance
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Trace entry types
 */
export type TraceEventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'TASK_GROUP_START'
  | 'TASK_GROUP_END'
  | 'TASK_START'
  | 'TASK_STATE_CHANGE'
  | 'TASK_END'
  | 'EXECUTOR_CALL'
  | 'EXECUTOR_RESULT'
  | 'VERIFICATION_START'
  | 'VERIFICATION_RESULT'
  | 'ERROR'
  | 'WARNING';

/**
 * Base trace entry structure
 */
export interface TraceEntry {
  /** ISO timestamp */
  timestamp: string;
  /** Event type */
  event: TraceEventType;
  /** Session identifier */
  session_id: string;
  /** Task group identifier (optional) */
  task_group_id?: string;
  /** Task identifier (optional) */
  task_id?: string;
  /** Previous state (for state transitions) */
  from_state?: string;
  /** New state (for state transitions) */
  to_state?: string;
  /** Additional data */
  data?: Record<string, unknown>;
  /** Verification result (for verification events) */
  verification_result?: {
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }>;
  };
  /** Error information */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

/**
 * Trace Pack configuration
 */
export interface TracePackConfig {
  /** Output directory for trace files */
  outputDir: string;
  /** Session ID */
  sessionId: string;
  /** Whether to buffer writes */
  buffered?: boolean;
  /** Max buffer size before flush */
  maxBufferSize?: number;
}

/**
 * Trace Pack - JSONL logger for session/task state transitions
 */
export class TracePack {
  private config: TracePackConfig;
  private outputPath: string;
  private buffer: TraceEntry[] = [];
  private writeStream: fs.WriteStream | null = null;

  constructor(config: TracePackConfig) {
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
    this.outputPath = path.join(
      this.config.outputDir,
      'trace-' + this.config.sessionId + '-' + timestamp + '.jsonl'
    );
  }

  /**
   * Get the output file path
   */
  getOutputPath(): string {
    return this.outputPath;
  }

  /**
   * Log a trace entry
   */
  log(entry: Omit<TraceEntry, 'timestamp' | 'session_id'>): void {
    const fullEntry: TraceEntry = {
      timestamp: new Date().toISOString(),
      session_id: this.config.sessionId,
      ...entry,
    };

    if (this.config.buffered) {
      this.buffer.push(fullEntry);
      if (this.buffer.length >= (this.config.maxBufferSize || 100)) {
        this.flush();
      }
    } else {
      this.writeEntry(fullEntry);
    }
  }

  /**
   * Log session start
   */
  sessionStart(data?: Record<string, unknown>): void {
    this.log({
      event: 'SESSION_START',
      data,
    });
  }

  /**
   * Log session end
   */
  sessionEnd(data?: Record<string, unknown>): void {
    this.log({
      event: 'SESSION_END',
      data,
    });
    this.flush();
  }

  /**
   * Log task group start
   */
  taskGroupStart(taskGroupId: string, data?: Record<string, unknown>): void {
    this.log({
      event: 'TASK_GROUP_START',
      task_group_id: taskGroupId,
      data,
    });
  }

  /**
   * Log task group end
   */
  taskGroupEnd(taskGroupId: string, data?: Record<string, unknown>): void {
    this.log({
      event: 'TASK_GROUP_END',
      task_group_id: taskGroupId,
      data,
    });
  }

  /**
   * Log task start
   */
  taskStart(taskGroupId: string, taskId: string, data?: Record<string, unknown>): void {
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
  taskStateChange(
    taskGroupId: string,
    taskId: string,
    fromState: string,
    toState: string,
    data?: Record<string, unknown>
  ): void {
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
  taskEnd(
    taskGroupId: string,
    taskId: string,
    finalState: string,
    data?: Record<string, unknown>
  ): void {
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
  executorCall(taskGroupId: string, taskId: string, data?: Record<string, unknown>): void {
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
  executorResult(
    taskGroupId: string,
    taskId: string,
    status: string,
    data?: Record<string, unknown>
  ): void {
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
  verificationStart(taskGroupId: string, taskId: string, data?: Record<string, unknown>): void {
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
  verificationResult(
    taskGroupId: string,
    taskId: string,
    passed: boolean,
    checks: Array<{ name: string; passed: boolean; message?: string }>,
    data?: Record<string, unknown>
  ): void {
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
  error(message: string, code?: string, taskGroupId?: string, taskId?: string): void {
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
  warning(message: string, taskGroupId?: string, taskId?: string): void {
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
  flush(): void {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0, this.buffer.length);
    for (const entry of entries) {
      this.writeEntry(entry);
    }
  }

  /**
   * Write single entry to file
   */
  private writeEntry(entry: TraceEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.outputPath, line, 'utf-8');
  }

  /**
   * Close the trace pack
   */
  close(): void {
    this.flush();
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

/**
 * Verify trace file format compliance
 */
export interface VerifyResult {
  valid: boolean;
  entryCount: number;
  errors: Array<{
    line: number;
    error: string;
  }>;
  warnings: Array<{
    line: number;
    warning: string;
  }>;
  summary: {
    sessionStarts: number;
    sessionEnds: number;
    taskGroupStarts: number;
    taskGroupEnds: number;
    taskStarts: number;
    taskEnds: number;
    stateChanges: number;
    verificationResults: number;
    errors: number;
  };
}

/**
 * Verify a trace file for format compliance
 */
export function verifyTraceFile(filePath: string): VerifyResult {
  const result: VerifyResult = {
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
      const entry = JSON.parse(line) as TraceEntry;
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
    } catch (e) {
      result.valid = false;
      const errMsg = (e as Error).message;
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
export function readTraceFile(filePath: string): TraceEntry[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  return lines.map((line) => JSON.parse(line) as TraceEntry);
}
