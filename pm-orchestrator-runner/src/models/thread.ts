/**
 * Thread Model
 * Per spec 05_DATA_MODELS.md L44-66
 *
 * Thread は会話スレッドを表す。1つのセッション内に複数のスレッドが存在できる。
 */

import { ThreadType } from './enums';

/**
 * Thread interface
 * Per spec 05_DATA_MODELS.md L44-57
 */
export interface Thread {
  /** スレッドを一意に識別する文字列。形式: thr_<連番> */
  thread_id: string;
  /** 所属セッションの識別子 */
  session_id: string;
  /** スレッド種別 */
  thread_type: ThreadType;
  /** ISO 8601 形式の作成時刻 */
  created_at: string;
  /** スレッドの人間可読な説明（省略可能） */
  description?: string;
}

/**
 * Thread counter for generating unique IDs
 */
let threadCounter = 0;

/**
 * Generate a unique thread ID
 * Format: thr_<連番>
 */
export function generateThreadId(): string {
  threadCounter++;
  return `thr_${threadCounter}`;
}

/**
 * Reset thread counter (for testing)
 */
export function resetThreadCounter(): void {
  threadCounter = 0;
}

/**
 * Create a new Thread
 */
export function createThread(
  sessionId: string,
  threadType: ThreadType,
  description?: string
): Thread {
  return {
    thread_id: generateThreadId(),
    session_id: sessionId,
    thread_type: threadType,
    created_at: new Date().toISOString(),
    description,
  };
}

/**
 * Validate a Thread object
 */
export function validateThread(thread: unknown): thread is Thread {
  if (typeof thread !== 'object' || thread === null) {
    return false;
  }

  const t = thread as Record<string, unknown>;

  // Required fields
  if (typeof t.thread_id !== 'string' || !t.thread_id.startsWith('thr_')) {
    return false;
  }
  if (typeof t.session_id !== 'string' || t.session_id.length === 0) {
    return false;
  }
  if (!Object.values(ThreadType).includes(t.thread_type as ThreadType)) {
    return false;
  }
  if (typeof t.created_at !== 'string') {
    return false;
  }

  // Optional fields
  if (t.description !== undefined && typeof t.description !== 'string') {
    return false;
  }

  return true;
}

/**
 * Check if a thread is the main conversation thread
 */
export function isMainThread(thread: Thread): boolean {
  return thread.thread_type === ThreadType.MAIN;
}

/**
 * Check if a thread is a background thread
 */
export function isBackgroundThread(thread: Thread): boolean {
  return thread.thread_type === ThreadType.BACKGROUND;
}

/**
 * Check if a thread is a system thread
 */
export function isSystemThread(thread: Thread): boolean {
  return thread.thread_type === ThreadType.SYSTEM;
}
