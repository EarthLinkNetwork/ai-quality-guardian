/**
 * Web Server - Express HTTP server
 * Per spec/19_WEB_UI.md
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
import { QueueStore } from '../queue';
/**
 * Web Server configuration
 */
export interface WebServerConfig {
    /** Port number (default: 3000) */
    port?: number;
    /** Host (default: localhost) */
    host?: string;
    /** QueueStore instance */
    queueStore: QueueStore;
    /** Session ID for new tasks */
    sessionId: string;
}
/**
 * Web Server state
 */
export interface WebServerState {
    isRunning: boolean;
    port: number;
    host: string;
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