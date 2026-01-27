/**
 * Events Module
 *
 * Generic event system for unified incident observation.
 */
export { Event, EventSource, FileChangeData, ExecutorEventData, TaskEventData, SessionEventData, CommandEventData, createEvent, createFileChangeEvent, createExecutorEvent, createTaskEvent, createSessionEvent, createCommandEvent, isFileChangeData, isExecutorEventData, isTaskEventData, isSessionEventData, isCommandEventData, } from './event';
export { EventStore, EventStoreConfig, EventQueryOptions, initEventStore, getEventStore, isEventStoreInitialized, resetEventStore, } from './event-store';
//# sourceMappingURL=index.d.ts.map