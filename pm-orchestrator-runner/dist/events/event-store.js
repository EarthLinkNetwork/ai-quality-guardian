"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventStore = void 0;
exports.initEventStore = initEventStore;
exports.getEventStore = getEventStore;
exports.isEventStoreInitialized = isEventStoreInitialized;
exports.resetEventStore = resetEventStore;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    maxEventsPerFile: 10000,
    syncWrites: false,
};
/**
 * EventStore - persistent event storage
 */
class EventStore {
    stateDir;
    eventsDir;
    maxEventsPerFile;
    syncWrites;
    // In-memory cache for recent events (for fast queries)
    eventCache = [];
    cacheLoaded = false;
    MAX_CACHE_SIZE = 1000;
    constructor(config) {
        this.stateDir = config.stateDir;
        this.eventsDir = path.join(this.stateDir, 'events');
        this.maxEventsPerFile = config.maxEventsPerFile ?? DEFAULT_CONFIG.maxEventsPerFile;
        this.syncWrites = config.syncWrites ?? DEFAULT_CONFIG.syncWrites;
        this.ensureDirectories();
    }
    /**
     * Ensure required directories exist
     */
    ensureDirectories() {
        if (!fs.existsSync(this.eventsDir)) {
            fs.mkdirSync(this.eventsDir, { recursive: true });
        }
    }
    /**
     * Get current event file path (based on date)
     */
    getCurrentFilePath() {
        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        return path.join(this.eventsDir, `events-${date}.jsonl`);
    }
    /**
     * Get all event file paths (sorted by date descending)
     */
    getEventFilePaths() {
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
    async record(event) {
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
    recordSync(event) {
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
    async loadFromDisk(options) {
        const events = [];
        const files = this.getEventFilePaths();
        for (const filePath of files) {
            try {
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const lines = content.trim().split('\n').filter(line => line.length > 0);
                for (const line of lines) {
                    try {
                        const event = JSON.parse(line);
                        events.push(event);
                    }
                    catch {
                        // Skip malformed lines
                    }
                }
            }
            catch {
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
    async query(options) {
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
            events = events.filter(e => e.timestamp > options.after);
        }
        if (options?.before) {
            events = events.filter(e => e.timestamp < options.before);
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
        }
        else {
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
    async get(eventId) {
        const events = await this.query();
        return events.find(e => e.id === eventId) || null;
    }
    /**
     * Get events related to a specific event (by shared relations)
     */
    async getRelated(eventId) {
        const event = await this.get(eventId);
        if (!event) {
            return [];
        }
        const related = [];
        const allEvents = await this.query();
        for (const e of allEvents) {
            if (e.id === eventId)
                continue;
            // Check for shared relations
            const shareTask = event.relations.taskId &&
                e.relations.taskId === event.relations.taskId;
            const shareSession = event.relations.sessionId &&
                e.relations.sessionId === event.relations.sessionId;
            const shareExecutor = event.relations.executorId &&
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
    async count(options) {
        const events = await this.query({ ...options, limit: undefined, offset: undefined });
        return events.length;
    }
    /**
     * Clear all events (for testing)
     */
    async clear() {
        const files = this.getEventFilePaths();
        for (const filePath of files) {
            await fs.promises.unlink(filePath);
        }
        this.eventCache = [];
    }
    /**
     * Reload cache from disk
     */
    async reload() {
        this.eventCache = await this.loadFromDisk();
        this.cacheLoaded = true;
    }
    /**
     * Get event store stats
     */
    async getStats() {
        const events = await this.query();
        const bySource = {};
        for (const event of events) {
            bySource[event.source] = (bySource[event.source] || 0) + 1;
        }
        return {
            totalEvents: events.length,
            fileCount: this.getEventFilePaths().length,
            oldestEvent: events[events.length - 1]?.timestamp,
            newestEvent: events[0]?.timestamp,
            bySource: bySource,
        };
    }
}
exports.EventStore = EventStore;
/**
 * Global event store instance (lazy initialized)
 */
let globalEventStore = null;
/**
 * Initialize global event store
 */
function initEventStore(stateDir) {
    if (!globalEventStore) {
        globalEventStore = new EventStore({ stateDir });
    }
    return globalEventStore;
}
/**
 * Get global event store (throws if not initialized)
 */
function getEventStore() {
    if (!globalEventStore) {
        throw new Error('EventStore not initialized. Call initEventStore() first.');
    }
    return globalEventStore;
}
/**
 * Check if event store is initialized
 */
function isEventStoreInitialized() {
    return globalEventStore !== null;
}
/**
 * Reset global event store (for testing)
 */
function resetEventStore() {
    globalEventStore = null;
}
//# sourceMappingURL=event-store.js.map