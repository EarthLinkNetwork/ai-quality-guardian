/**
 * Centralized Application Logger using @earthlink/logger
 *
 * Two log categories:
 * - app: Application-level logs (task execution, cost, user actions)
 * - sys: System-level logs (startup, shutdown, DynamoDB, auth)
 */

import { createLogger, Logger } from '@earthlink/logger';

// Application logger - business logic events
export const appLogger: Logger = createLogger({ name: 'app', level: 'info' });

// System logger - infrastructure events
export const sysLogger: Logger = createLogger({ name: 'sys', level: 'debug' });

/**
 * Log entry for in-memory buffer and Web UI display
 */
export interface AppLogEntry {
  id: string;
  timestamp: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  category: 'app' | 'sys';
  message: string;
  data?: Record<string, unknown>;
  projectId?: string;
  taskId?: string;
  sessionId?: string;
}

/**
 * In-memory log buffer for Web UI display.
 * Keeps last 500 entries in memory, queryable by category.
 */
const LOG_BUFFER_SIZE = 500;
const logBuffer: AppLogEntry[] = [];

export function addLogEntry(entry: Omit<AppLogEntry, 'id' | 'timestamp'>): AppLogEntry {
  const full: AppLogEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
  };
  logBuffer.push(full);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
  return full;
}

export function getLogEntries(options?: {
  category?: 'app' | 'sys';
  level?: string;
  limit?: number;
  projectId?: string;
}): AppLogEntry[] {
  let entries = [...logBuffer];
  if (options?.category) entries = entries.filter(e => e.category === options.category);
  if (options?.level) entries = entries.filter(e => e.level === options.level);
  if (options?.projectId) entries = entries.filter(e => e.projectId === options.projectId);
  entries.reverse(); // newest first
  if (options?.limit) entries = entries.slice(0, options.limit);
  return entries;
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

/**
 * Convenience log functions that log to both @earthlink/logger AND the buffer.
 *
 * Note: @earthlink/logger's error() signature is (msg, error?, obj?),
 * so we pass data as the obj parameter with undefined for the error.
 */
export const log = {
  app: {
    info: (msg: string, data?: Record<string, unknown>): void => {
      appLogger.info(msg, data);
      addLogEntry({ level: 'info', category: 'app', message: msg, data });
    },
    warn: (msg: string, data?: Record<string, unknown>): void => {
      appLogger.warn(msg, data);
      addLogEntry({ level: 'warn', category: 'app', message: msg, data });
    },
    error: (msg: string, data?: Record<string, unknown>): void => {
      appLogger.error(msg, undefined, data);
      addLogEntry({ level: 'error', category: 'app', message: msg, data });
    },
    debug: (msg: string, data?: Record<string, unknown>): void => {
      appLogger.debug(msg, data);
      addLogEntry({ level: 'debug', category: 'app', message: msg, data });
    },
  },
  sys: {
    info: (msg: string, data?: Record<string, unknown>): void => {
      sysLogger.info(msg, data);
      addLogEntry({ level: 'info', category: 'sys', message: msg, data });
    },
    warn: (msg: string, data?: Record<string, unknown>): void => {
      sysLogger.warn(msg, data);
      addLogEntry({ level: 'warn', category: 'sys', message: msg, data });
    },
    error: (msg: string, data?: Record<string, unknown>): void => {
      sysLogger.error(msg, undefined, data);
      addLogEntry({ level: 'error', category: 'sys', message: msg, data });
    },
    debug: (msg: string, data?: Record<string, unknown>): void => {
      sysLogger.debug(msg, data);
      addLogEntry({ level: 'debug', category: 'sys', message: msg, data });
    },
  },
};
