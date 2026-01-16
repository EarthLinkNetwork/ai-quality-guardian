/**
 * Executor Supervisor
 * Monitors task execution and handles retries/timeouts
 */
import { EventEmitter } from 'events';
import { RunnerCore } from '../core/runner-core';
/**
 * Supervisor configuration
 */
export interface SupervisorConfig {
    /** Check interval in milliseconds */
    checkIntervalMs: number;
    /** Maximum retry attempts */
    maxRetries: number;
    /** Overall timeout in milliseconds */
    timeoutMs: number;
    /** Auto-retry on failure */
    autoRetry?: boolean;
}
/**
 * Supervisor state
 */
export interface SupervisorState {
    isRunning: boolean;
    retryCount: number;
    startTime: number | null;
    lastCheckTime: number | null;
    currentTaskId: string | null;
}
/**
 * Executor Supervisor class
 * Monitors L2 executor and handles automatic retries
 */
export declare class ExecutorSupervisor extends EventEmitter {
    private runner;
    private config;
    private state;
    private checkInterval;
    private timeoutTimer;
    constructor(runner: RunnerCore, config: SupervisorConfig);
    /**
     * Start monitoring
     */
    start(): void;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Periodic check
     */
    private check;
    /**
     * Handle complete status
     */
    private handleComplete;
    /**
     * Handle error status
     */
    private handleError;
    /**
     * Handle no evidence status
     */
    private handleNoEvidence;
    /**
     * Handle invalid status
     */
    private handleInvalid;
    /**
     * Handle timeout
     */
    private handleTimeout;
    /**
     * Get current state
     */
    getState(): SupervisorState;
    /**
     * Get configuration
     */
    getConfig(): SupervisorConfig;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<SupervisorConfig>): void;
    /**
     * Check if running
     */
    isRunning(): boolean;
}
//# sourceMappingURL=executor-supervisor.d.ts.map