"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueuePoller = exports.RUNNERS_TABLE_NAME = exports.QUEUE_TABLE_NAME = exports.isValidStatusTransition = exports.VALID_STATUS_TRANSITIONS = exports.QueueStore = void 0;
var queue_store_1 = require("./queue-store");
Object.defineProperty(exports, "QueueStore", { enumerable: true, get: function () { return queue_store_1.QueueStore; } });
Object.defineProperty(exports, "VALID_STATUS_TRANSITIONS", { enumerable: true, get: function () { return queue_store_1.VALID_STATUS_TRANSITIONS; } });
Object.defineProperty(exports, "isValidStatusTransition", { enumerable: true, get: function () { return queue_store_1.isValidStatusTransition; } });
Object.defineProperty(exports, "QUEUE_TABLE_NAME", { enumerable: true, get: function () { return queue_store_1.QUEUE_TABLE_NAME; } });
Object.defineProperty(exports, "RUNNERS_TABLE_NAME", { enumerable: true, get: function () { return queue_store_1.RUNNERS_TABLE_NAME; } });
var queue_poller_1 = require("./queue-poller");
Object.defineProperty(exports, "QueuePoller", { enumerable: true, get: function () { return queue_poller_1.QueuePoller; } });
//# sourceMappingURL=index.js.map