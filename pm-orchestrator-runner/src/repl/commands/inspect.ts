/**
 * Inspect Command
 *
 * Single unified UI for browsing and inspecting all events.
 * No symptom-specific handling - all events are treated uniformly.
 *
 * Commands:
 * - /inspect ui     - Interactive event browser (fzf-style picker)
 * - /inspect        - Alias for /inspect ui
 * - /inspect <id>   - View specific event details
 *
 * Design principles:
 * - Single UI for all event types
 * - No category branching
 * - Non-destructive (read-only)
 * - Events shown chronologically
 */

import { execSync } from 'child_process';
import * as path from 'path';
import {
  Event,
  EventStore,
  initEventStore,
  getEventStore,
  isEventStoreInitialized,
  isFileChangeData,
  isExecutorEventData,
  isTaskEventData,
  isSessionEventData,
  isCommandEventData,
} from '../../events';

/**
 * Inspect command result
 */
export interface InspectCommandResult {
  success: boolean;
  message: string;
  output?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Format event for display in picker list
 */
function formatEventForPicker(event: Event, index: number): string {
  const time = new Date(event.timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const date = new Date(event.timestamp).toLocaleDateString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
  });

  // Source icon
  const icons: Record<string, string> = {
    file_change: 'F',
    executor: 'E',
    task: 'T',
    session: 'S',
    command: 'C',
    system: '*',
  };
  const icon = icons[event.source] || '?';

  // Truncate summary
  const maxLen = 50;
  const summary =
    event.summary.length > maxLen
      ? event.summary.slice(0, maxLen - 3) + '...'
      : event.summary;

  return `${index + 1}. [${icon}] ${date} ${time} ${summary}`;
}

/**
 * Format event details for drill-down view
 */
function formatEventDetails(event: Event, relatedEvents: Event[]): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push('='.repeat(60));
  lines.push(`Event: ${event.id}`);
  lines.push('='.repeat(60));
  lines.push('');

  // Basic info
  lines.push(`Timestamp: ${event.timestamp}`);
  lines.push(`Source:    ${event.source}`);
  lines.push(`Summary:   ${event.summary}`);
  lines.push('');

  // Relations
  if (Object.keys(event.relations).some(k => event.relations[k as keyof typeof event.relations])) {
    lines.push('--- Relations ---');
    if (event.relations.taskId) lines.push(`  Task:     ${event.relations.taskId}`);
    if (event.relations.sessionId) lines.push(`  Session:  ${event.relations.sessionId}`);
    if (event.relations.executorId) lines.push(`  Executor: ${event.relations.executorId}`);
    if (event.relations.parentEventId) lines.push(`  Parent:   ${event.relations.parentEventId}`);
    lines.push('');
  }

  // Data (source-specific)
  lines.push('--- Data ---');
  if (isFileChangeData(event.data)) {
    lines.push(`  Path:   ${event.data.path}`);
    lines.push(`  Status: ${event.data.status}`);
    if (event.data.oldPath) lines.push(`  Old Path: ${event.data.oldPath}`);
    if (event.data.diff) {
      lines.push('  Diff:');
      for (const line of event.data.diff.split('\n').slice(0, 20)) {
        lines.push(`    ${line}`);
      }
      if (event.data.diff.split('\n').length > 20) {
        lines.push('    ... (truncated)');
      }
    }
  } else if (isExecutorEventData(event.data)) {
    lines.push(`  Executor: ${event.data.executorId}`);
    lines.push(`  Action:   ${event.data.action}`);
    if (event.data.command) lines.push(`  Command:  ${event.data.command}`);
    if (event.data.exitCode !== undefined) lines.push(`  Exit:     ${event.data.exitCode}`);
    if (event.data.durationMs !== undefined) lines.push(`  Duration: ${event.data.durationMs}ms`);
    if (event.data.stdout) {
      lines.push('  Stdout:');
      for (const line of event.data.stdout.split('\n').slice(0, 20)) {
        lines.push(`    ${line}`);
      }
      if (event.data.stdout.split('\n').length > 20) {
        lines.push('    ... (truncated)');
      }
    }
    if (event.data.stderr) {
      lines.push('  Stderr:');
      for (const line of event.data.stderr.split('\n').slice(0, 10)) {
        lines.push(`    ${line}`);
      }
      if (event.data.stderr.split('\n').length > 10) {
        lines.push('    ... (truncated)');
      }
    }
  } else if (isTaskEventData(event.data)) {
    lines.push(`  Task ID:  ${event.data.taskId}`);
    lines.push(`  Status:   ${event.data.newStatus}`);
    if (event.data.previousStatus) lines.push(`  Previous: ${event.data.previousStatus}`);
    if (event.data.description) lines.push(`  Desc:     ${event.data.description}`);
    if (event.data.filesModified && event.data.filesModified.length > 0) {
      lines.push('  Files Modified:');
      for (const f of event.data.filesModified.slice(0, 10)) {
        lines.push(`    - ${f}`);
      }
      if (event.data.filesModified.length > 10) {
        lines.push(`    ... and ${event.data.filesModified.length - 10} more`);
      }
    }
    if (event.data.error) {
      lines.push(`  Error:    ${event.data.error.code}: ${event.data.error.message}`);
    }
  } else if (isSessionEventData(event.data)) {
    lines.push(`  Session: ${event.data.sessionId}`);
    lines.push(`  Action:  ${event.data.action}`);
    if (event.data.projectPath) lines.push(`  Project: ${event.data.projectPath}`);
    if (event.data.status) lines.push(`  Status:  ${event.data.status}`);
  } else if (isCommandEventData(event.data)) {
    lines.push(`  Command: ${event.data.command}`);
    if (event.data.args) lines.push(`  Args:    ${event.data.args}`);
    lines.push(`  Success: ${event.data.success}`);
    if (event.data.output) {
      lines.push('  Output:');
      for (const line of event.data.output.split('\n').slice(0, 10)) {
        lines.push(`    ${line}`);
      }
    }
    if (event.data.error) {
      lines.push(`  Error:   ${event.data.error}`);
    }
  } else {
    // Generic data display
    lines.push(JSON.stringify(event.data, null, 2).split('\n').map(l => '  ' + l).join('\n'));
  }
  lines.push('');

  // Related events
  if (relatedEvents.length > 0) {
    lines.push('--- Related Events ---');
    for (const related of relatedEvents.slice(0, 10)) {
      const time = new Date(related.timestamp).toLocaleTimeString('ja-JP');
      lines.push(`  [${related.source}] ${time} ${related.summary}`);
      lines.push(`    ID: ${related.id}`);
    }
    if (relatedEvents.length > 10) {
      lines.push(`  ... and ${relatedEvents.length - 10} more related events`);
    }
    lines.push('');
  }

  // File diffs (for tracing)
  const fileChangeEvents = relatedEvents.filter(e => e.source === 'file_change');
  if (fileChangeEvents.length > 0) {
    lines.push('--- Affected Files ---');
    for (const fe of fileChangeEvents.slice(0, 10)) {
      if (isFileChangeData(fe.data)) {
        lines.push(`  [${fe.data.status}] ${fe.data.path}`);
      }
    }
    if (fileChangeEvents.length > 10) {
      lines.push(`  ... and ${fileChangeEvents.length - 10} more files`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Get current git diff for file changes
 */
function getCurrentFileDiffs(projectPath: string): string[] {
  try {
    const result = execSync('git status --porcelain', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.trim().split('\n').filter(line => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * InspectCommand - unified event browser
 */
export class InspectCommand {
  private readonly projectPath: string;
  private eventStore: EventStore | null = null;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Initialize event store (lazy)
   */
  private ensureEventStore(): EventStore {
    if (!this.eventStore) {
      const stateDir = path.join(this.projectPath, '.pm-state');
      this.eventStore = initEventStore(stateDir);
    }
    return this.eventStore;
  }

  /**
   * Execute inspect command
   */
  async execute(args: string): Promise<InspectCommandResult> {
    const trimmed = args.trim();

    // /inspect or /inspect ui - show picker UI
    if (!trimmed || trimmed === 'ui') {
      return this.showPickerUI();
    }

    // /inspect <id> - show specific event details
    if (trimmed.startsWith('evt-') || /^[0-9a-f-]+$/i.test(trimmed)) {
      return this.showEventDetails(trimmed);
    }

    return {
      success: false,
      message: 'Unknown inspect command',
      error: {
        code: 'UNKNOWN_COMMAND',
        message: `Unknown argument: ${trimmed}. Use /inspect ui or /inspect <event-id>`,
      },
    };
  }

  /**
   * Show picker UI for event selection
   */
  async showPickerUI(): Promise<InspectCommandResult> {
    const store = this.ensureEventStore();

    // Get recent events
    const events = await store.query({ limit: 50, order: 'desc' });

    if (events.length === 0) {
      // Show empty state with help
      const output = `
No events recorded yet.

Events are automatically recorded when:
- Files change (src/, dist/, docs/, etc.)
- Executors run (Claude Code, etc.)
- Tasks change status
- Sessions start/end
- Commands execute

Start using the REPL to generate events!
`;
      console.log(output);
      return {
        success: true,
        message: 'No events found',
        output,
      };
    }

    // Format events for display
    const lines: string[] = [];
    lines.push('');
    lines.push('Select an event to inspect:');
    lines.push('');

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      lines.push(formatEventForPicker(event, i));
      lines.push(`   ${event.id}`);
    }

    lines.push('');
    lines.push('Enter number (1-' + events.length + ') to view details, or q to cancel:');

    console.log(lines.join('\n'));

    return {
      success: true,
      message: 'Event list displayed',
      output: lines.join('\n'),
    };
  }

  /**
   * Show details for a specific event
   */
  async showEventDetails(eventId: string): Promise<InspectCommandResult> {
    const store = this.ensureEventStore();

    const event = await store.get(eventId);
    if (!event) {
      return {
        success: false,
        message: 'Event not found',
        error: {
          code: 'NOT_FOUND',
          message: `Event not found: ${eventId}`,
        },
      };
    }

    // Get related events
    const related = await store.getRelated(eventId);

    // Format details
    const details = formatEventDetails(event, related);
    console.log(details);

    return {
      success: true,
      message: 'Event details displayed',
      output: details,
    };
  }

  /**
   * Get events for picker (called by REPLInterface for interactive mode)
   */
  async getEventsForPicker(): Promise<{ id: string; display: string }[]> {
    const store = this.ensureEventStore();
    const events = await store.query({ limit: 50, order: 'desc' });

    return events.map((event, index) => ({
      id: event.id,
      display: formatEventForPicker(event, index),
    }));
  }

  /**
   * Process selection from picker UI
   */
  async processSelection(selection: string): Promise<InspectCommandResult> {
    // If it's a number, convert to event ID
    const num = parseInt(selection, 10);
    if (!isNaN(num) && num > 0) {
      const store = this.ensureEventStore();
      const events = await store.query({ limit: 50, order: 'desc' });
      const index = num - 1;
      if (index >= 0 && index < events.length) {
        return this.showEventDetails(events[index].id);
      }
      return {
        success: false,
        message: 'Invalid selection',
        error: {
          code: 'INVALID_SELECTION',
          message: `Selection ${num} is out of range (1-${events.length})`,
        },
      };
    }

    // Otherwise treat as event ID
    return this.showEventDetails(selection);
  }

  /**
   * Record a file change event (helper for integration)
   */
  async recordFileChange(
    filePath: string,
    status: 'added' | 'modified' | 'deleted' | 'renamed',
    options?: {
      oldPath?: string;
      diff?: string;
      taskId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const store = this.ensureEventStore();
    const { createFileChangeEvent } = await import('../../events');
    const event = createFileChangeEvent(filePath, status, options);
    await store.record(event);
  }

  /**
   * Record an executor event (helper for integration)
   */
  async recordExecutorEvent(
    executorId: string,
    action: 'start' | 'end' | 'output' | 'error',
    options?: {
      taskId?: string;
      sessionId?: string;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      command?: string;
      durationMs?: number;
    }
  ): Promise<void> {
    const store = this.ensureEventStore();
    const { createExecutorEvent } = await import('../../events');
    const event = createExecutorEvent(executorId, action, options);
    await store.record(event);
  }

  /**
   * Record a task event (helper for integration)
   */
  async recordTaskEvent(
    taskId: string,
    newStatus: string,
    options?: {
      previousStatus?: string;
      description?: string;
      sessionId?: string;
      filesModified?: string[];
      error?: { code: string; message: string };
    }
  ): Promise<void> {
    const store = this.ensureEventStore();
    const { createTaskEvent } = await import('../../events');
    const event = createTaskEvent(taskId, newStatus, options);
    await store.record(event);
  }

  /**
   * Record a session event (helper for integration)
   */
  async recordSessionEvent(
    sessionId: string,
    action: 'start' | 'end' | 'pause' | 'resume',
    options?: {
      projectPath?: string;
      status?: string;
    }
  ): Promise<void> {
    const store = this.ensureEventStore();
    const { createSessionEvent } = await import('../../events');
    const event = createSessionEvent(sessionId, action, options);
    await store.record(event);
  }

  /**
   * Record a command event (helper for integration)
   */
  async recordCommandEvent(
    command: string,
    success: boolean,
    options?: {
      args?: string;
      output?: string;
      error?: string;
      taskId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    const store = this.ensureEventStore();
    const { createCommandEvent } = await import('../../events');
    const event = createCommandEvent(command, success, options);
    await store.record(event);
  }

  /**
   * Get event store stats
   */
  async getStats(): Promise<{
    totalEvents: number;
    fileCount: number;
    oldestEvent?: string;
    newestEvent?: string;
    bySource: Record<string, number>;
  }> {
    const store = this.ensureEventStore();
    return store.getStats();
  }
}
