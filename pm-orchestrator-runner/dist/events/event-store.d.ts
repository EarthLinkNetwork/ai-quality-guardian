/**
 * EventStore - Persistent storage for Events
 *
 * Stores events to disk so they survive restarts.
 * Events are stored in JSONL format (one JSON object per line) for:
 * - Append-only efficiency
 * - Easy streaming reads
 * - Partial file recovery
 *
 * Design principles:
 * - Persistence survives restarts
 * - Non-blocking writes (async)
 * - Efficient queries by time range and relations
 */
import { Event, EventSource } from './event';
/**
 * Query options for retrieving events
 */
export interface EventQueryOptions {
    /** Filter by source type */
    source?: EventSource;
    /** Filter by timestamp (ISO 8601) - events after this time */
    after?: string;
    /** Filter by timestamp (ISO 8601) - events before this time */
    before?: string;
    /** Filter by related task ID */
    taskId?: string;
    /** Filter by related session ID */
    sessionId?: string;
    /** Filter by related executor ID */
    executorId?: string;
    /** Maximum number of events to return */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
    /** Sort order (default: descending by timestamp) */
    order?: 'asc' | 'desc';
}
/**
 * EventStore configuration
 */
export interface EventStoreConfig {
    /** Base directory for storing events */
    stateDir: string;
    /** Maximum events per file before rotation */
    maxEventsPerFile?: number;
    /** Whether to sync writes to disk immediately */
    syncWrites?: boolean;
}
/**
 * EventStore - persistent event storage
 */
export declare class EventStore {
    private readonly stateDir;
    private readonly eventsDir;
    private readonly maxEventsPerFile;
    private readonly syncWrites;
    private eventCache;
    private cacheLoaded;
    private readonly MAX_CACHE_SIZE;
    constructor(config: EventStoreConfig);
    /**
     * Ensure required directories exist
     */
    private ensureDirectories;
    /**
     * Get current event file path (based on date)
     */
    private getCurrentFilePath;
    /**
     * Get all event file paths (sorted by date descending)
     */
    private getEventFilePaths;
    /**
     * Record a new event
     */
    record(event: Event): Promise<void>;
    /**
     * Record event synchronously (for critical events)
     */
    recordSync(event: Event): void;
    /**
     * Load events from disk (lazy loading)
     */
    private loadFromDisk;
    /**
     * Query events with filters
     */
    query(options?: EventQueryOptions): Promise<Event[]>;
    /**
     * Get a single event by ID
     */
    get(eventId: string): Promise<Event | null>;
    /**
     * Get events related to a specific event (by shared relations)
     */
    getRelated(eventId: string): Promise<Event[]>;
    /**
     * Get count of events matching query
     */
    count(options?: EventQueryOptions): Promise<number>;
    /**
     * Clear all events (for testing)
     */
    clear(): Promise<void>;
    /**
     * Reload cache from disk
     */
    reload(): Promise<void>;
    /**
     * Get event store stats
     */
    getStats(): Promise<{
        totalEvents: number;
        fileCount: number;
        oldestEvent?: string;
        newestEvent?: string;
        bySource: Record<EventSource, number>;
    }>;
}
/**
 * Initialize global event store
 */
export declare function initEventStore(stateDir: string): EventStore;
/**
 * Get global event store (throws if not initialized)
 */
export declare function getEventStore(): EventStore;
/**
 * Check if event store is initialized
 */
export declare function isEventStoreInitialized(): boolean;
/**
 * Reset global event store (for testing)
 */
export declare function resetEventStore(): void;
//# sourceMappingURL=event-store.d.ts.map