/**
 * Executor Supervisor
 * Monitors task execution and handles retries/timeouts
 */

import { EventEmitter } from 'events';
import { RunnerCore } from '../core/runner-core';
import { OverallStatus } from '../models/enums';

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
export class ExecutorSupervisor extends EventEmitter {
  private runner: RunnerCore;
  private config: SupervisorConfig;
  private state: SupervisorState;
  private checkInterval: NodeJS.Timeout | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;

  constructor(runner: RunnerCore, config: SupervisorConfig) {
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
  start(): void {
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
  stop(): void {
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
  private async check(): Promise<void> {
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
        tasksCompleted: taskResults?.filter((t: any) => t.status === 'completed').length || 0,
        tasksTotal: taskResults?.length || 0,
      });

      // Handle different statuses
      switch (overallStatus) {
        case OverallStatus.COMPLETE:
          this.handleComplete();
          break;
        case OverallStatus.ERROR:
          await this.handleError();
          break;
        case OverallStatus.INCOMPLETE:
          // Still running, continue monitoring
          break;
        case OverallStatus.NO_EVIDENCE:
          await this.handleNoEvidence();
          break;
        case OverallStatus.INVALID:
          await this.handleInvalid();
          break;
      }
    } catch (err) {
      this.emit('error', { error: (err as Error).message });
    }
  }

  /**
   * Handle complete status
   */
  private handleComplete(): void {
    this.emit('complete', {
      duration: this.state.startTime ? Date.now() - this.state.startTime : 0,
      retryCount: this.state.retryCount,
    });
    this.stop();
  }

  /**
   * Handle error status
   */
  private async handleError(): Promise<void> {
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
    } catch (err) {
      this.emit('retry_failed', { error: (err as Error).message });
    }
  }

  /**
   * Handle no evidence status
   */
  private async handleNoEvidence(): Promise<void> {
    this.emit('no_evidence', {
      message: 'Task completed without evidence',
    });
    // Don't stop - wait for evidence to be collected
  }

  /**
   * Handle invalid status
   */
  private async handleInvalid(): Promise<void> {
    this.emit('invalid', {
      message: 'Task state is invalid',
    });
    this.stop();
  }

  /**
   * Handle timeout
   */
  private handleTimeout(): void {
    this.emit('timeout', {
      duration: this.state.startTime ? Date.now() - this.state.startTime : 0,
      retryCount: this.state.retryCount,
      status: OverallStatus.INCOMPLETE,
    });
    this.stop();
  }

  /**
   * Get current state
   */
  getState(): SupervisorState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  getConfig(): SupervisorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SupervisorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }
}
