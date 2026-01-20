/**
 * Queue Module
 * Per spec/20_QUEUE_STORE.md
 *
 * Exports:
 * - QueueStore: DynamoDB-backed queue storage
 * - QueuePoller: Polling and task execution
 * - createNamespacedQueueStore: Factory for namespace-separated QueueStore
 */

export {
  QueueStore,
  QueueStoreConfig,
  QueueItem,
  QueueItemStatus,
  ClaimResult,
  TaskGroupSummary,
} from './queue-store';

export {
  QueuePoller,
  QueuePollerConfig,
  QueuePollerState,
  QueuePollerEvents,
  TaskExecutor,
} from './queue-poller';

import { QueueStore, QueueStoreConfig } from './queue-store';

/**
 * Namespace configuration for QueueStore
 * Per spec/21_STABLE_DEV.md
 */
export interface NamespaceQueueConfig {
  /** Namespace name (e.g., 'stable', 'dev') */
  namespace: string;
  /** Table name derived from namespace */
  tableName: string;
}

/**
 * Create a QueueStore instance with namespace separation
 * Per spec/21_STABLE_DEV.md
 *
 * @param namespaceConfig - Namespace configuration with tableName
 * @param storeConfig - Optional additional QueueStore configuration
 * @returns Configured QueueStore instance
 *
 * @example
 * ```typescript
 * const namespaceConfig = buildNamespaceConfig({ namespace: 'dev', projectRoot: '/path' });
 * const store = createNamespacedQueueStore({
 *   namespace: namespaceConfig.namespace,
 *   tableName: namespaceConfig.tableName,
 * });
 * ```
 */
export function createNamespacedQueueStore(
  namespaceConfig: NamespaceQueueConfig,
  storeConfig?: Omit<QueueStoreConfig, 'tableName'>
): QueueStore {
  return new QueueStore({
    ...storeConfig,
    tableName: namespaceConfig.tableName,
  });
}
