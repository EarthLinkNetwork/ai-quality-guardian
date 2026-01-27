"use strict";
/**
 * Events Module
 *
 * Generic event system for unified incident observation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetEventStore = exports.isEventStoreInitialized = exports.getEventStore = exports.initEventStore = exports.EventStore = exports.isCommandEventData = exports.isSessionEventData = exports.isTaskEventData = exports.isExecutorEventData = exports.isFileChangeData = exports.createCommandEvent = exports.createSessionEvent = exports.createTaskEvent = exports.createExecutorEvent = exports.createFileChangeEvent = exports.createEvent = void 0;
var event_1 = require("./event");
Object.defineProperty(exports, "createEvent", { enumerable: true, get: function () { return event_1.createEvent; } });
Object.defineProperty(exports, "createFileChangeEvent", { enumerable: true, get: function () { return event_1.createFileChangeEvent; } });
Object.defineProperty(exports, "createExecutorEvent", { enumerable: true, get: function () { return event_1.createExecutorEvent; } });
Object.defineProperty(exports, "createTaskEvent", { enumerable: true, get: function () { return event_1.createTaskEvent; } });
Object.defineProperty(exports, "createSessionEvent", { enumerable: true, get: function () { return event_1.createSessionEvent; } });
Object.defineProperty(exports, "createCommandEvent", { enumerable: true, get: function () { return event_1.createCommandEvent; } });
Object.defineProperty(exports, "isFileChangeData", { enumerable: true, get: function () { return event_1.isFileChangeData; } });
Object.defineProperty(exports, "isExecutorEventData", { enumerable: true, get: function () { return event_1.isExecutorEventData; } });
Object.defineProperty(exports, "isTaskEventData", { enumerable: true, get: function () { return event_1.isTaskEventData; } });
Object.defineProperty(exports, "isSessionEventData", { enumerable: true, get: function () { return event_1.isSessionEventData; } });
Object.defineProperty(exports, "isCommandEventData", { enumerable: true, get: function () { return event_1.isCommandEventData; } });
var event_store_1 = require("./event-store");
Object.defineProperty(exports, "EventStore", { enumerable: true, get: function () { return event_store_1.EventStore; } });
Object.defineProperty(exports, "initEventStore", { enumerable: true, get: function () { return event_store_1.initEventStore; } });
Object.defineProperty(exports, "getEventStore", { enumerable: true, get: function () { return event_store_1.getEventStore; } });
Object.defineProperty(exports, "isEventStoreInitialized", { enumerable: true, get: function () { return event_store_1.isEventStoreInitialized; } });
Object.defineProperty(exports, "resetEventStore", { enumerable: true, get: function () { return event_store_1.resetEventStore; } });
//# sourceMappingURL=index.js.map