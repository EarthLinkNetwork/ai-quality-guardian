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

import * as fs from 'fs';
import * as path from 'path';
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
 * Default configuration
 */
const DEFAULT_CONFIG: Partial<EventStoreConfig> = {
  maxEventsPerFile: 10000,
  syncWrites: false,
};

/**
 * EventStore - persistent event storage
 */
export class EventStore {
  private readonly stateDir: string;
  private readonly eventsDir: string;
  private readonly maxEventsPerFile: number;
  private readonly syncWrites: boolean;

  // In-memory cache for recent events (for fast queries)
  private eventCache: Event[] = [];
  private cacheLoaded = false;
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(config: EventStoreConfig) {
    this.stateDir = config.stateDir;
    this.eventsDir = path.join(this.stateDir, 'events');
    this.maxEventsPerFile = config.maxEventsPerFile ?? DEFAULT_CONFIG.maxEventsPerFile!;
    this.syncWrites = config.syncWrites ?? DEFAULT_CONFIG.syncWrites!;

    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.eventsDir)) {
      fs.mkdirSync(this.eventsDir, { recursive: true });
    }
  }

  /**
   * Get current event file path (based on date)
   */
  private getCurrentFilePath(): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(this.eventsDir, `events-${date}.jsonl`);
  }

  /**
   * Get all event file paths (sorted by date descending)
   */
  private getEventFilePaths(): string[] {
    if (!fs.existsSync(this.eventsDir)) {
      return [];
    }

    return fs
      .readdirSync(this.eventsDir)
      .filter(f => f.startsWith('events-') && f.endsWith('.jsonl'))
      .sort()
      .reverse()
      .map(f => path.join(this.eventsDir, f));
  }

  /**
   * Record a new event
   */
  async record(event: Event): Promise<void> {
    const filePath = this.getCurrentFilePath();
    const line = JSON.stringify(event) + '\n';

    // Append to file
    await fs.promises.appendFile(filePath, line, { flag: 'a' });

    if (this.syncWrites) {
      const fd = await fs.promises.open(filePath, 'r');
      await fd.sync();
      await fd.close();
    }

    // Update cache
    this.eventCache.unshift(event);
    if (this.eventCache.length > this.MAX_CACHE_SIZE) {
      this.eventCache.pop();
    }
  }

  /**
   * Record event synchronously (for critical events)
   */
  recordSync(event: Event): void {
    const filePath = this.getCurrentFilePath();
    const line = JSON.stringify(event) + '\n';

    fs.appendFileSync(filePath, line, { flag: 'a' });

    if (this.syncWrites) {
      const fd = fs.openSync(filePath, 'r');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
    }

    // Update cache
    this.eventCache.unshift(event);
    if (this.eventCache.length > this.MAX_CACHE_SIZE) {
      this.eventCache.pop();
    }
  }

  /**
   * Load events from disk (lazy loading)
   */
  private async loadFromDisk(options?: EventQueryOptions): Promise<Event[]> {
    const events: Event[] = [];
    const files = this.getEventFilePaths();

    for (const filePath of files) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);

        for (const line of lines) {
          try {
            const event = JSON.parse(line) as Event;
            events.push(event);
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by timestamp descending
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return events;
  }

  /**
   * Query events with filters
   */
  async query(options?: EventQueryOptions): Promise<Event[]> {
    // Load from disk if cache not loaded
    if (!this.cacheLoaded) {
      this.eventCache = await this.loadFromDisk();
      this.cacheLoaded = true;
    }

    let events = [...this.eventCache];

    // Apply filters
    if (options?.source) {
      events = events.filter(e => e.source === options.source);
    }

    if (options?.after) {
      events = events.filter(e => e.timestamp > options.after!);
    }

    if (options?.before) {
      events = events.filter(e => e.timestamp < options.before!);
    }

    if (options?.taskId) {
      events = events.filter(e => e.relations.taskId === options.taskId);
    }

    if (options?.sessionId) {
      events = events.filter(e => e.relations.sessionId === options.sessionId);
    }

    if (options?.executorId) {
      events = events.filter(e => e.relations.executorId === options.executorId);
    }

    // Sort
    if (options?.order === 'asc') {
      events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    } else {
      events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? events.length;
    events = events.slice(offset, offset + limit);

    return events;
  }

  /**
   * Get a single event by ID
   */
  async get(eventId: string): Promise<Event | null> {
    const events = await this.query();
    return events.find(e => e.id === eventId) || null;
  }

  /**
   * Get events related to a specific event (by shared relations)
   */
  async getRelated(eventId: string): Promise<Event[]> {
    const event = await this.get(eventId);
    if (!event) {
      return [];
    }

    const related: Event[] = [];
    const allEvents = await this.query();

    for (const e of allEvents) {
      if (e.id === eventId) continue;

      // Check for shared relations
      const shareTask =
        event.relations.taskId &&
        e.relations.taskId === event.relations.taskId;
      const shareSession =
        event.relations.sessionId &&
        e.relations.sessionId === event.relations.sessionId;
      const shareExecutor =
        event.relations.executorId &&
        e.relations.executorId === event.relations.executorId;
      const isParent = e.id === event.relations.parentEventId;
      const isChild = e.relations.parentEventId === event.id;

      if (shareTask || shareSession || shareExecutor || isParent || isChild) {
        related.push(e);
      }
    }

    return related;
  }

  /**
   * Get count of events matching query
   */
  async count(options?: EventQueryOptions): Promise<number> {
    const events = await this.query({ ...options, limit: undefined, offset: undefined });
    return events.length;
  }

  /**
   * Clear all events (for testing)
   */
  async clear(): Promise<void> {
    const files = this.getEventFilePaths();
    for (const filePath of files) {
      await fs.promises.unlink(filePath);
    }
    this.eventCache = [];
  }

  /**
   * Reload cache from disk
   */
  async reload(): Promise<void> {
    this.eventCache = await this.loadFromDisk();
    this.cacheLoaded = true;
  }

  /**
   * Get event store stats
   */
  async getStats(): Promise<{
    totalEvents: number;
    fileCount: number;
    oldestEvent?: string;
    newestEvent?: string;
    bySource: Record<EventSource, number>;
  }> {
    const events = await this.query();
    const bySource: Record<string, number> = {};

    for (const event of events) {
      bySource[event.source] = (bySource[event.source] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      fileCount: this.getEventFilePaths().length,
      oldestEvent: events[events.length - 1]?.timestamp,
      newestEvent: events[0]?.timestamp,
      bySource: bySource as Record<EventSource, number>,
    };
  }
}

/**
 * Global event store instance (lazy initialized)
 */
let globalEventStore: EventStore | null = null;

/**
 * Initialize global event store
 */
export function initEventStore(stateDir: string): EventStore {
  if (!globalEventStore) {
    globalEventStore = new EventStore({ stateDir });
  }
  return globalEventStore;
}

/**
 * Get global event store (throws if not initialized)
 */
export function getEventStore(): EventStore {
  if (!globalEventStore) {
    throw new Error('EventStore not initialized. Call initEventStore() first.');
  }
  return globalEventStore;
}

/**
 * Check if event store is initialized
 */
export function isEventStoreInitialized(): boolean {
  return globalEventStore !== null;
}

/**
 * Reset global event store (for testing)
 */
export function resetEventStore(): void {
  globalEventStore = null;
}
