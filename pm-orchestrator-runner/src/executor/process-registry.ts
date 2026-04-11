/**
 * Process Registry - tracks running Claude Code child processes
 *
 * Each entry holds:
 * - PID of the spawned child (for OS-level identification)
 * - Task metadata (task_id, task_group_id, project_path) so ghost-process
 *   detection can associate live PIDs with their originating task + status
 * - killFn closure so cancel API can terminate the process
 *
 * This is intentionally a single source of truth for "processes PM Runner
 * spawned". The /api/system/processes endpoint uses this registry exclusively
 * so that unrelated processes (e.g. user's terminal `claude` sessions,
 * Claude Desktop app, etc.) never appear in the UI and cannot be killed.
 */

export interface TaskProcessInfo {
  /** OS process id of the child */
  pid: number;
  /** Task id that spawned this process */
  taskId: string;
  /** Parent task group id (optional - may be unknown for legacy callers) */
  taskGroupId?: string;
  /** Absolute path of the project the task runs against */
  projectPath?: string;
  /** ISO timestamp when the process was registered */
  spawnedAt: string;
  /** Close function to terminate the process (SIGTERM → SIGKILL) */
  killFn: () => void;
}

/** Public snapshot (without killFn, safe to serialize) */
export type TaskProcessSnapshot = Omit<TaskProcessInfo, 'killFn'>;

const _registry = new Map<string, TaskProcessInfo>();

/**
 * Legacy signature: register with only a kill function.
 * Prefer `registerTaskProcessDetailed` when task metadata is available.
 */
export function registerTaskProcess(taskId: string, killFn: () => void): void;
/**
 * Extended signature: register with PID + task metadata.
 */
export function registerTaskProcess(taskId: string, info: Omit<TaskProcessInfo, 'taskId' | 'spawnedAt'> & { spawnedAt?: string }): void;
export function registerTaskProcess(
  taskId: string,
  arg: (() => void) | (Omit<TaskProcessInfo, 'taskId' | 'spawnedAt'> & { spawnedAt?: string })
): void {
  if (typeof arg === 'function') {
    // Legacy call: killFn only, PID unknown → record with pid=-1
    _registry.set(taskId, {
      pid: -1,
      taskId,
      spawnedAt: new Date().toISOString(),
      killFn: arg,
    });
    return;
  }
  _registry.set(taskId, {
    pid: arg.pid,
    taskId,
    taskGroupId: arg.taskGroupId,
    projectPath: arg.projectPath,
    spawnedAt: arg.spawnedAt ?? new Date().toISOString(),
    killFn: arg.killFn,
  });
}

/** Deregister when process ends */
export function deregisterTaskProcess(taskId: string): void {
  _registry.delete(taskId);
}

/**
 * Kill the process for a task.
 * @returns true if a process was found and killed, false if not registered
 */
export function killTaskProcess(taskId: string): boolean {
  const info = _registry.get(taskId);
  if (info) {
    info.killFn();
    _registry.delete(taskId);
    return true;
  }
  return false;
}

/** Kill by PID (matches any registered entry regardless of task id) */
export function killTaskProcessByPid(pid: number): boolean {
  for (const [taskId, info] of _registry.entries()) {
    if (info.pid === pid) {
      info.killFn();
      _registry.delete(taskId);
      return true;
    }
  }
  return false;
}

/** Get all task IDs with registered processes */
export function getRegisteredTaskIds(): string[] {
  return Array.from(_registry.keys());
}

/**
 * Snapshot all registered task processes (without killFn).
 * Used by /api/system/processes for ghost-process detection UI.
 */
export function listTaskProcesses(): TaskProcessSnapshot[] {
  return Array.from(_registry.values()).map(({ killFn: _killFn, ...rest }) => rest);
}

/** Reset registry (test-only helper) */
export function _resetRegistry(): void {
  _registry.clear();
}
