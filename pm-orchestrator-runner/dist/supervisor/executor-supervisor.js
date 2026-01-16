"use strict";
/**
 * Executor Supervisor
 * Monitors task execution and handles retries/timeouts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutorSupervisor = void 0;
const events_1 = require("events");
const enums_1 = require("../models/enums");
/**
 * Executor Supervisor class
 * Monitors L2 executor and handles automatic retries
 */
class ExecutorSupervisor extends events_1.EventEmitter {
    runner;
    config;
    state;
    checkInterval = null;
    timeoutTimer = null;
    constructor(runner, config) {
        super();
        this.runner = runner;
        this.config = {
            checkIntervalMs: config.checkIntervalMs || 5000,
            maxRetries: config.maxRetries || 3,
            timeoutMs: config.timeoutMs || 300000, // 5 minutes default
            autoRetry: config.autoRetry ?? true,
        };
        this.state = {
            isRunning: false,
            retryCount: 0,
            startTime: null,
            lastCheckTime: null,
            currentTaskId: null,
        };
    }
    /**
     * Start monitoring
     */
    start() {
        if (this.state.isRunning) {
            return;
        }
        this.state.isRunning = true;
        this.state.startTime = Date.now();
        this.state.retryCount = 0;
        // Start periodic check
        this.checkInterval = setInterval(() => {
            this.check();
        }, this.config.checkIntervalMs);
        // Start timeout timer
        this.timeoutTimer = setTimeout(() => {
            this.handleTimeout();
        }, this.config.timeoutMs);
        this.emit('started', { startTime: this.state.startTime });
    }
    /**
     * Stop monitoring
     */
    stop() {
        if (!this.state.isRunning) {
            return;
        }
        this.state.isRunning = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this.timeoutTimer) {
            clearTimeout(this.timeoutTimer);
            this.timeoutTimer = null;
        }
        this.emit('stopped', {
            duration: this.state.startTime ? Date.now() - this.state.startTime : 0,
            retryCount: this.state.retryCount,
        });
    }
    /**
     * Periodic check
     */
    async check() {
        if (!this.state.isRunning) {
            return;
        }
        this.state.lastCheckTime = Date.now();
        try {
            const sessionState = this.runner.getSessionState();
            const overallStatus = this.runner.getOverallStatus();
            const taskResults = this.runner.getTaskResults();
            if (!sessionState || !sessionState.session_id) {
                this.emit('check', { status: 'no_state' });
                return;
            }
            this.emit('check', {
                status: overallStatus,
                phase: sessionState.current_phase,
                tasksCompleted: taskResults?.filter((t) => t.status === 'completed').length || 0,
                tasksTotal: taskResults?.length || 0,
            });
            // Handle different statuses
            switch (overallStatus) {
                case enums_1.OverallStatus.COMPLETE:
                    this.handleComplete();
                    break;
                case enums_1.OverallStatus.ERROR:
                    await this.handleError();
                    break;
                case enums_1.OverallStatus.INCOMPLETE:
                    // Still running, continue monitoring
                    break;
                case enums_1.OverallStatus.NO_EVIDENCE:
                    await this.handleNoEvidence();
                    break;
                case enums_1.OverallStatus.INVALID:
                    await this.handleInvalid();
                    break;
            }
        }
        catch (err) {
            this.emit('error', { error: err.message });
        }
    }
    /**
     * Handle complete status
     */
    handleComplete() {
        this.emit('complete', {
            duration: this.state.startTime ? Date.now() - this.state.startTime : 0,
            retryCount: this.state.retryCount,
        });
        this.stop();
    }
    /**
     * Handle error status
     */
    async handleError() {
        if (!this.config.autoRetry) {
            this.emit('error', { reason: 'Task failed, auto-retry disabled' });
            this.stop();
            return;
        }
        if (this.state.retryCount >= this.config.maxRetries) {
            this.emit('max_retries', {
                retryCount: this.state.retryCount,
                maxRetries: this.config.maxRetries,
            });
            this.stop();
            return;
        }
        // Attempt retry
        this.state.retryCount++;
        this.emit('retry', {
            attempt: this.state.retryCount,
            maxRetries: this.config.maxRetries,
        });
        try {
            // Retry by resuming execution
            // The runner should handle retry logic internally
            const sessionState = this.runner.getSessionState();
            if (sessionState && sessionState.session_id) {
                await this.runner.resume(sessionState.session_id);
            }
        }
        catch (err) {
            this.emit('retry_failed', { error: err.message });
        }
    }
    /**
     * Handle no evidence status
     */
    async handleNoEvidence() {
        this.emit('no_evidence', {
            message: 'Task completed without evidence',
        });
        // Don't stop - wait for evidence to be collected
    }
    /**
     * Handle invalid status
     */
    async handleInvalid() {
        this.emit('invalid', {
            message: 'Task state is invalid',
        });
        this.stop();
    }
    /**
     * Handle timeout
     */
    handleTimeout() {
        this.emit('timeout', {
            duration: this.state.startTime ? Date.now() - this.state.startTime : 0,
            retryCount: this.state.retryCount,
            status: enums_1.OverallStatus.INCOMPLETE,
        });
        this.stop();
    }
    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Get configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Check if running
     */
    isRunning() {
        return this.state.isRunning;
    }
}
exports.ExecutorSupervisor = ExecutorSupervisor;
//# sourceMappingURL=executor-supervisor.js.map