"use strict";
/**
 * Thread Model
 * Per spec 05_DATA_MODELS.md L44-66
 *
 * Thread は会話スレッドを表す。1つのセッション内に複数のスレッドが存在できる。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateThreadId = generateThreadId;
exports.resetThreadCounter = resetThreadCounter;
exports.createThread = createThread;
exports.validateThread = validateThread;
exports.isMainThread = isMainThread;
exports.isBackgroundThread = isBackgroundThread;
exports.isSystemThread = isSystemThread;
const enums_1 = require("./enums");
/**
 * Thread counter for generating unique IDs
 */
let threadCounter = 0;
/**
 * Generate a unique thread ID
 * Format: thr_<連番>
 */
function generateThreadId() {
    threadCounter++;
    return `thr_${threadCounter}`;
}
/**
 * Reset thread counter (for testing)
 */
function resetThreadCounter() {
    threadCounter = 0;
}
/**
 * Create a new Thread
 */
function createThread(sessionId, threadType, description) {
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
function validateThread(thread) {
    if (typeof thread !== 'object' || thread === null) {
        return false;
    }
    const t = thread;
    // Required fields
    if (typeof t.thread_id !== 'string' || !t.thread_id.startsWith('thr_')) {
        return false;
    }
    if (typeof t.session_id !== 'string' || t.session_id.length === 0) {
        return false;
    }
    if (!Object.values(enums_1.ThreadType).includes(t.thread_type)) {
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
function isMainThread(thread) {
    return thread.thread_type === enums_1.ThreadType.MAIN;
}
/**
 * Check if a thread is a background thread
 */
function isBackgroundThread(thread) {
    return thread.thread_type === enums_1.ThreadType.BACKGROUND;
}
/**
 * Check if a thread is a system thread
 */
function isSystemThread(thread) {
    return thread.thread_type === enums_1.ThreadType.SYSTEM;
}
//# sourceMappingURL=thread.js.map