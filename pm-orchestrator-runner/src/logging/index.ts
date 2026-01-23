/**
 * Logging Module Index
 *
 * Per spec 13_LOGGING_AND_OBSERVABILITY.md
 */

export {
  maskSensitiveData,
  containsSensitiveData,
  maskSensitiveObject,
  getApiKeyStatus,
  checkApiKeyForProvider,
  MASKING_PATTERNS,
} from './sensitive-data-masker';

export {
  TaskLogManager,
  CompleteTaskOptions,
  LOG_DIR,
  INDEX_FILE,
  TASKS_DIR,
  RAW_DIR,
} from './task-log-manager';

// Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 7.3, 11.2
// Atomic file writing with fsync and retry
export {
  atomicWriteFile,
  atomicWriteFileSync,
  setNonInteractiveMode,
  isNonInteractiveMode,
  flushAllPendingWrites,
  getPendingWriteCount,
  trackPendingWrite,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  RETRY_BACKOFF_MULTIPLIER,
  type AtomicWriteOptions,
  type AtomicWriteResult,
} from './atomic-file-writer';
