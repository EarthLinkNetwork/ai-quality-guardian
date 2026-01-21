"use strict";
/**
 * Queue Module
 * Per spec/20_QUEUE_STORE.md
 *
 * Exports:
 * - QueueStore: DynamoDB-backed queue storage
 * - QueuePoller: Polling and task execution
 * - createNamespacedQueueStore: Factory for namespace-separated QueueStore
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueuePoller = exports.isValidStatusTransition = exports.VALID_STATUS_TRANSITIONS = exports.QueueStore = void 0;
exports.createNamespacedQueueStore = createNamespacedQueueStore;
var queue_store_1 = require("./queue-store");
Object.defineProperty(exports, "QueueStore", { enumerable: true, get: function () { return queue_store_1.QueueStore; } });
Object.defineProperty(exports, "VALID_STATUS_TRANSITIONS", { enumerable: true, get: function () { return queue_store_1.VALID_STATUS_TRANSITIONS; } });
Object.defineProperty(exports, "isValidStatusTransition", { enumerable: true, get: function () { return queue_store_1.isValidStatusTransition; } });
var queue_poller_1 = require("./queue-poller");
Object.defineProperty(exports, "QueuePoller", { enumerable: true, get: function () { return queue_poller_1.QueuePoller; } });
const queue_store_2 = require("./queue-store");
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
function createNamespacedQueueStore(namespaceConfig, storeConfig) {
    return new queue_store_2.QueueStore({
        ...storeConfig,
        tableName: namespaceConfig.tableName,
    });
}
//# sourceMappingURL=index.js.map