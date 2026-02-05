/**
 * Queue Module (v2)
 * Per spec/20_QUEUE_STORE.md
 *
 * v2 Changes:
 * - Single fixed table: pm-runner-queue
 * - Namespace is a required config field
 * - Runner heartbeat support
 *
 * Exports:
 * - QueueStore: DynamoDB-backed queue storage
 * - QueuePoller: Polling and task execution
 */
export { QueueStore, QueueStoreConfig, QueueItem, QueueItemStatus, ClaimResult, TaskGroupSummary, StatusUpdateResult, NamespaceSummary, RunnerRecord, RunnerStatus, VALID_STATUS_TRANSITIONS, isValidStatusTransition, QUEUE_TABLE_NAME, RUNNERS_TABLE_NAME, IQueueStore, TaskTypeValue, } from './queue-store';
export { QueuePoller, QueuePollerConfig, QueuePollerState, QueuePollerEvents, TaskExecutor, } from './queue-poller';
export { InMemoryQueueStore, InMemoryQueueStoreConfig, } from './in-memory-queue-store';
//# sourceMappingURL=index.d.ts.map