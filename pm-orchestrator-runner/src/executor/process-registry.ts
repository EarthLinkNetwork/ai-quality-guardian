/**
 * Process Registry - tracks running Claude Code child processes by task ID
 * Allows external callers (e.g., cancel API) to kill running processes
 */

const _registry = new Map<string, () => void>();

/** Register a kill function for a task */
export function registerTaskProcess(taskId: string, killFn: () => void): void {
  _registry.set(taskId, killFn);
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
  const killFn = _registry.get(taskId);
  if (killFn) {
    killFn();
    _registry.delete(taskId);
    return true;
  }
  return false;
}

/** Get all task IDs with registered processes */
export function getRegisteredTaskIds(): string[] {
  return Array.from(_registry.keys());
}
