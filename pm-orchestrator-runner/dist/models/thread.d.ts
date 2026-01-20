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
 * Generate a unique thread ID
 * Format: thr_<連番>
 */
export declare function generateThreadId(): string;
/**
 * Reset thread counter (for testing)
 */
export declare function resetThreadCounter(): void;
/**
 * Create a new Thread
 */
export declare function createThread(sessionId: string, threadType: ThreadType, description?: string): Thread;
/**
 * Validate a Thread object
 */
export declare function validateThread(thread: unknown): thread is Thread;
/**
 * Check if a thread is the main conversation thread
 */
export declare function isMainThread(thread: Thread): boolean;
/**
 * Check if a thread is a background thread
 */
export declare function isBackgroundThread(thread: Thread): boolean;
/**
 * Check if a thread is a system thread
 */
export declare function isSystemThread(thread: Thread): boolean;
//# sourceMappingURL=thread.d.ts.map