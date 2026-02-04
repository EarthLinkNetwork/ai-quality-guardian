/**
 * Web Server - Express HTTP server (v2)
 * Per spec/19_WEB_UI.md
 *
 * v2 Changes:
 * - Namespace selector support
 * - Runner status API
 * - All namespaces listing API
 *
 * Provides:
 * - REST API for queue operations (read/write to QueueStore)
 * - Static file serving for frontend
 * - Same process as Runner (integrated)
 *
 * IMPORTANT: Web UI does NOT directly command Runner.
 * Submit = queue insert only.
 */
import { Express } from 'express';
import { IQueueStore } from '../queue';
/**
 * Web Server configuration
 */
export interface WebServerConfig {
    /** Port number (default: 5678) */
    port?: number;
    /** Host (default: localhost) */
    host?: string;
    /** QueueStore instance (can be DynamoDB or InMemory) */
    queueStore: IQueueStore;
    /** Session ID for new tasks */
    sessionId: string;
    /** Current namespace (from queueStore) */
    namespace: string;
    /** Project root for display */
    projectRoot?: string;
    /** State directory for trace files (per spec/28_CONVERSATION_TRACE.md Section 5.2) */
    stateDir?: string;
}
/**
 * Web Server state
 */
export interface WebServerState {
    isRunning: boolean;
    port: number;
    host: string;
    namespace: string;
}
/**
 * Create configured Express app
 */
export declare function createApp(config: WebServerConfig): Express;
/**
 * Web Server
 * Manages Express server lifecycle
 */
export declare class WebServer {
    private readonly app;
    private readonly port;
    private readonly host;
    private readonly namespace;
    private server;
    constructor(config: WebServerConfig);
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Stop the server
     */
    stop(): Promise<void>;
    /**
     * Get server state
     */
    getState(): WebServerState;
    /**
     * Get Express app (for testing)
     */
    getApp(): Express;
    /**
     * Get server URL
     */
    getUrl(): string;
}
//# sourceMappingURL=server.d.ts.map