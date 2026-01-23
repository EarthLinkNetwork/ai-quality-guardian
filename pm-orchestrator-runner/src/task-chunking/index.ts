/**
 * Task Chunking Module
 *
 * Per spec 26_TASK_CHUNKING.md: Automatic task splitting with parallel/sequential execution
 *
 * Exports:
 * - TaskChunkingExecutorWrapper: Main class for wrapping IExecutor
 * - Task analysis functions
 * - Retry logic functions
 * - Types and interfaces
 * - Default configuration
 */

export {
  // Main class
  TaskChunkingExecutorWrapper,

  // Analysis functions
  analyzeTaskForChunking,

  // Retry functions
  calculateRetryDelay,
  shouldRetry,

  // Utility functions
  generateSubtaskId,
  createSubtaskDefinitions,
  createChunkedTask,
  getReadySubtasks,
  isChunkedTaskComplete,
  hasFailedSubtask,
  aggregateResults,

  // Configuration
  DEFAULT_TASK_CHUNKING_CONFIG,

  // Types
  type ChunkedTaskStatus,
  type SubtaskStatus,
  type RetryCondition,
  type SubtaskResult,
  type SubtaskDefinition,
  type AggregationStrategy,
  type ChunkedTask,
  type RetryConfig,
  type TaskChunkingConfig,
  type TaskAnalysisResult,
  type ChunkingEventCallback,
  type ChunkingResult,
} from './task-chunking';
