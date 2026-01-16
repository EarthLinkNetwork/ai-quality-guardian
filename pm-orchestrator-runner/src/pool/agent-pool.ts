/**
 * L1/L2 Agent Pool
 * Based on 04_COMPONENTS.md L98-155
 *
 * L1 Subagent Pool: Max 9 parallel read-only subagents
 * L2 Executor Pool: Max 4 parallel executors with write permissions
 */

import { EventEmitter } from 'events';
import { AgentType, TaskStatus } from '../models/enums';
import { ErrorCode, getErrorMessage } from '../errors/error-codes';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const minimatch = require('minimatch');

/**
 * Agent Pool Error
 */
export class AgentPoolError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || getErrorMessage(code));
    this.name = 'AgentPoolError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Agent permissions interface
 */
interface AgentPermissions {
  read: boolean;
  write: boolean;
  execute: boolean;
  allowedPaths?: string[];
  writeScopes?: string[];
  readScopes?: string[];
}

/**
 * L1 Subagent info
 */
interface L1SubagentInfo {
  id: string;
  type: AgentType;
  permissions: AgentPermissions;
  started_at: string;
  current_task?: string;
  duration_seconds: number;
}

/**
 * L2 Executor task info
 */
interface ExecutorTaskInfo {
  task_id: string;
  description?: string;
  files?: string[];
  status?: TaskStatus;
  evidence?: Record<string, unknown>;
}

/**
 * L2 Executor info
 */
interface L2ExecutorInfo {
  id: string;
  permissions: AgentPermissions;
  started_at: string;
  heldLocks: string[];
  current_task: ExecutorTaskInfo;
  canWrite: (path: string) => boolean;
}

/**
 * Pool statistics
 */
interface PoolStatistics {
  total_capacity: number;
  active_count: number;
  available_slots: number;
  utilization_percent: number;
  total_acquisitions: number;
}

/**
 * Queued acquisition info
 */
interface QueuedAcquisition {
  queued: boolean;
  position: number;
}

/**
 * Executor health info
 */
interface ExecutorHealth {
  status: 'healthy' | 'stale' | 'error';
  last_activity: string;
}

/**
 * Task completion info
 */
interface TaskCompletionInfo {
  status: TaskStatus;
  evidence: Record<string, unknown> | null;
}

/**
 * Evidence record
 */
interface EvidenceRecord {
  type: string;
  path: string;
  hash: string;
}

/**
 * Lock info
 */
interface LockInfo {
  locked: boolean;
  holder?: string;
}

/**
 * Global semaphore for coordinating pool access
 */
class GlobalSemaphore {
  private activeCount: number = 0;

  acquire(): void {
    this.activeCount++;
  }

  release(): void {
    if (this.activeCount > 0) {
      this.activeCount--;
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}

/**
 * Acquisition options for L1
 */
interface L1AcquisitionOptions {
  allowedPaths?: string[];
}

/**
 * Acquisition options for L2
 */
interface L2AcquisitionOptions {
  writeScopes?: string[];
  readScopes?: string[];
  lockPaths?: string[];
}

/**
 * Release options
 */
interface ReleaseOptions {
  force?: boolean;
}

/**
 * L1 Subagent Pool
 * Max 9 parallel read-only subagents
 */
export class L1SubagentPool {
  private readonly maxCapacity: number = 9;
  private agents: Map<string, {
    info: L1SubagentInfo;
    startTime: number;
  }> = new Map();
  private queueEnabled: boolean = false;
  private queue: Array<{
    id: string;
    type: AgentType;
    options?: L1AcquisitionOptions;
  }> = [];
  private totalAcquisitions: number = 0;

  /**
   * Get maximum pool capacity
   */
  getMaxCapacity(): number {
    return this.maxCapacity;
  }

  /**
   * Get number of active subagents
   */
  getActiveCount(): number {
    return this.agents.size;
  }

  /**
   * Get available slots
   */
  getAvailableSlots(): number {
    return this.maxCapacity - this.agents.size;
  }

  /**
   * Enable or disable queueing
   */
  enableQueueing(enabled: boolean): void {
    this.queueEnabled = enabled;
  }

  /**
   * Acquire a subagent slot
   */
  acquire(id: string, type: AgentType, options?: L1AcquisitionOptions): L1SubagentInfo {
    // L1 only allows READER type
    if (type !== AgentType.READER) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        'L1 pool only allows READER type agents',
        { type }
      );
    }

    // Check capacity
    if (this.agents.size >= this.maxCapacity) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        'L1 pool is at maximum capacity',
        { maxCapacity: this.maxCapacity, activeCount: this.agents.size }
      );
    }

    const now = Date.now();
    const info: L1SubagentInfo = {
      id,
      type,
      permissions: {
        read: true,
        write: false,
        execute: false,
        allowedPaths: options?.allowedPaths,
      },
      started_at: new Date(now).toISOString(),
      duration_seconds: 0,
    };

    this.agents.set(id, { info, startTime: now });
    this.totalAcquisitions++;

    return info;
  }

  /**
   * Queue an acquisition when pool is full
   */
  queueAcquisition(id: string, type: AgentType, options?: L1AcquisitionOptions): QueuedAcquisition {
    if (!this.queueEnabled) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        'Queueing is not enabled'
      );
    }

    this.queue.push({ id, type, options });

    return {
      queued: true,
      position: this.queue.length - 1,
    };
  }

  /**
   * Release a subagent slot
   */
  release(id: string): void {
    const removed = this.agents.delete(id);

    // Process queue if enabled and agent was removed
    if (removed && this.queueEnabled && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.acquire(next.id, next.type, next.options);
      }
    }
  }

  /**
   * Release all subagents
   */
  releaseAll(): void {
    this.agents.clear();
    this.queue = [];
  }

  /**
   * Check if agent is active
   */
  isActive(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * Assign task to agent
   */
  assignTask(id: string, taskId: string): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.info.current_task = taskId;
    }
  }

  /**
   * Get agent info
   */
  getAgentInfo(id: string): L1SubagentInfo {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Agent not found: ${id}`,
        { id }
      );
    }

    const now = Date.now();
    return {
      ...agent.info,
      duration_seconds: Math.floor((now - agent.startTime) / 1000),
    };
  }

  /**
   * Set start time for testing
   */
  setStartTimeForTesting(id: string, timestamp: number): void {
    const agent = this.agents.get(id);
    if (agent) {
      agent.startTime = timestamp;
    }
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    return {
      total_capacity: this.maxCapacity,
      active_count: this.agents.size,
      available_slots: this.getAvailableSlots(),
      utilization_percent: Math.round((this.agents.size / this.maxCapacity) * 100),
      total_acquisitions: this.totalAcquisitions,
    };
  }
}

/**
 * L2 Executor Pool
 * Max 4 parallel executors with write permissions
 */
export class L2ExecutorPool extends EventEmitter {
  private readonly maxCapacity: number = 4;
  private executors: Map<string, {
    info: L2ExecutorInfo;
    startTime: number;
    lastActivity: number;
    evidence: EvidenceRecord[];
  }> = new Map();
  private locks: Map<string, string> = new Map(); // path -> executor_id
  private globalSemaphore: GlobalSemaphore = new GlobalSemaphore();
  private totalAcquisitions: number = 0;

  /**
   * Get maximum pool capacity
   */
  getMaxCapacity(): number {
    return this.maxCapacity;
  }

  /**
   * Get number of active executors
   */
  getActiveCount(): number {
    return this.executors.size;
  }

  /**
   * Get available slots
   */
  getAvailableSlots(): number {
    return this.maxCapacity - this.executors.size;
  }

  /**
   * Acquire an executor slot
   */
  acquire(id: string, options?: L2AcquisitionOptions): L2ExecutorInfo {
    // Check capacity
    if (this.executors.size >= this.maxCapacity) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        'L2 pool is at maximum capacity',
        { maxCapacity: this.maxCapacity, activeCount: this.executors.size }
      );
    }

    // Check lock availability
    const lockPaths = options?.lockPaths || [];
    for (const path of lockPaths) {
      if (this.locks.has(path)) {
        throw new AgentPoolError(
          ErrorCode.E401_LOCK_ACQUISITION_FAILED,
          `Lock already held: ${path}`,
          { path, holder: this.locks.get(path) }
        );
      }
    }

    // Acquire locks
    for (const path of lockPaths) {
      this.locks.set(path, id);
    }

    const now = Date.now();

    const canWrite = (path: string): boolean => {
      if (!options?.writeScopes || options.writeScopes.length === 0) {
        return true; // Default: can write anywhere
      }
      return options.writeScopes.some(scope => minimatch(path, scope));
    };

    const info: L2ExecutorInfo = {
      id,
      permissions: {
        read: true,
        write: true,
        execute: true,
        writeScopes: options?.writeScopes,
        readScopes: options?.readScopes,
      },
      started_at: new Date(now).toISOString(),
      heldLocks: [...lockPaths],
      current_task: {} as ExecutorTaskInfo,
      canWrite,
    };

    this.executors.set(id, {
      info,
      startTime: now,
      lastActivity: now,
      evidence: [],
    });

    this.globalSemaphore.acquire();
    this.totalAcquisitions++;

    this.emit('executor_acquired', { executor_id: id });

    return info;
  }

  /**
   * Release an executor slot
   */
  release(id: string, options?: ReleaseOptions): void {
    const executor = this.executors.get(id);
    if (!executor) {
      return; // Ignore release for unknown executor
    }

    // Check if task is in progress (unless force)
    if (!options?.force) {
      const taskStatus = executor.info.current_task?.status;
      if (taskStatus === TaskStatus.IN_PROGRESS) {
        throw new AgentPoolError(
          ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
          'Cannot release executor with in-progress task',
          { id, taskStatus }
        );
      }
    }

    // Release all held locks
    for (const path of executor.info.heldLocks) {
      this.locks.delete(path);
    }

    this.executors.delete(id);
    this.globalSemaphore.release();

    this.emit('executor_released', { executor_id: id });
  }

  /**
   * Release all executors
   */
  releaseAll(): void {
    for (const [id] of this.executors) {
      this.release(id, { force: true });
    }
  }

  /**
   * Get lock info
   */
  getLockInfo(path: string): LockInfo {
    const holder = this.locks.get(path);
    return {
      locked: !!holder,
      holder,
    };
  }

  /**
   * Assign task to executor
   */
  assignTask(id: string, task: Partial<ExecutorTaskInfo>): void {
    const executor = this.executors.get(id);
    if (!executor) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor not found: ${id}`,
        { id }
      );
    }

    executor.info.current_task = {
      task_id: task.task_id || '',
      description: task.description,
      files: task.files,
      status: TaskStatus.PENDING,
    };
    executor.lastActivity = Date.now();
  }

  /**
   * Update task status
   */
  updateTaskStatus(id: string, status: TaskStatus): void {
    const executor = this.executors.get(id);
    if (!executor) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor not found: ${id}`,
        { id }
      );
    }

    executor.info.current_task.status = status;
    executor.lastActivity = Date.now();
  }

  /**
   * Complete task with evidence
   */
  completeTask(id: string, completion: TaskCompletionInfo): void {
    const executor = this.executors.get(id);
    if (!executor) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor not found: ${id}`,
        { id }
      );
    }

    // Require evidence for completion
    if (completion.status === TaskStatus.COMPLETED && !completion.evidence) {
      throw new AgentPoolError(
        ErrorCode.E301_EVIDENCE_MISSING,
        'Evidence required for task completion',
        { id }
      );
    }

    executor.info.current_task.status = completion.status;
    executor.info.current_task.evidence = completion.evidence || undefined;
    executor.lastActivity = Date.now();

    this.emit('task_completed', {
      task_id: executor.info.current_task.task_id,
      executor_id: id,
      status: completion.status,
    });
  }

  /**
   * Record evidence
   */
  recordEvidence(id: string, evidence: EvidenceRecord): void {
    const executor = this.executors.get(id);
    if (!executor) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor not found: ${id}`,
        { id }
      );
    }

    executor.evidence.push(evidence);
    executor.lastActivity = Date.now();
  }

  /**
   * Get task evidence
   */
  getTaskEvidence(id: string): EvidenceRecord[] {
    const executor = this.executors.get(id);
    if (!executor) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor not found: ${id}`,
        { id }
      );
    }

    return [...executor.evidence];
  }

  /**
   * Get executor info
   */
  getExecutorInfo(id: string): L2ExecutorInfo {
    const executor = this.executors.get(id);
    if (!executor) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor not found: ${id}`,
        { id }
      );
    }

    return executor.info;
  }

  /**
   * Get executor health
   */
  getExecutorHealth(id: string): ExecutorHealth {
    const executor = this.executors.get(id);
    if (!executor) {
      throw new AgentPoolError(
        ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED,
        `Executor not found: ${id}`,
        { id }
      );
    }

    const now = Date.now();
    const inactiveTime = now - executor.lastActivity;
    const staleThreshold = 300000; // 5 minutes

    return {
      status: inactiveTime > staleThreshold ? 'stale' : 'healthy',
      last_activity: new Date(executor.lastActivity).toISOString(),
    };
  }

  /**
   * Set last activity for testing
   */
  setLastActivityForTesting(id: string, timestamp: number): void {
    const executor = this.executors.get(id);
    if (executor) {
      executor.lastActivity = timestamp;
    }
  }

  /**
   * Cleanup stale executors
   */
  cleanupStaleExecutors(thresholdSeconds: number): void {
    const now = Date.now();
    const thresholdMs = thresholdSeconds * 1000;

    for (const [id, executor] of this.executors) {
      if (now - executor.lastActivity > thresholdMs) {
        this.release(id, { force: true });
      }
    }
  }

  /**
   * Get global semaphore
   */
  getGlobalSemaphore(): GlobalSemaphore {
    return this.globalSemaphore;
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    return {
      total_capacity: this.maxCapacity,
      active_count: this.executors.size,
      available_slots: this.getAvailableSlots(),
      utilization_percent: Math.round((this.executors.size / this.maxCapacity) * 100),
      total_acquisitions: this.totalAcquisitions,
    };
  }
}
