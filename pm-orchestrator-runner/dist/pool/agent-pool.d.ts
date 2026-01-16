/**
 * L1/L2 Agent Pool
 * Based on 04_COMPONENTS.md L98-155
 *
 * L1 Subagent Pool: Max 9 parallel read-only subagents
 * L2 Executor Pool: Max 4 parallel executors with write permissions
 */
import { EventEmitter } from 'events';
import { AgentType, TaskStatus } from '../models/enums';
import { ErrorCode } from '../errors/error-codes';
/**
 * Agent Pool Error
 */
export declare class AgentPoolError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
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
declare class GlobalSemaphore {
    private activeCount;
    acquire(): void;
    release(): void;
    getActiveCount(): number;
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
export declare class L1SubagentPool {
    private readonly maxCapacity;
    private agents;
    private queueEnabled;
    private queue;
    private totalAcquisitions;
    /**
     * Get maximum pool capacity
     */
    getMaxCapacity(): number;
    /**
     * Get number of active subagents
     */
    getActiveCount(): number;
    /**
     * Get available slots
     */
    getAvailableSlots(): number;
    /**
     * Enable or disable queueing
     */
    enableQueueing(enabled: boolean): void;
    /**
     * Acquire a subagent slot
     */
    acquire(id: string, type: AgentType, options?: L1AcquisitionOptions): L1SubagentInfo;
    /**
     * Queue an acquisition when pool is full
     */
    queueAcquisition(id: string, type: AgentType, options?: L1AcquisitionOptions): QueuedAcquisition;
    /**
     * Release a subagent slot
     */
    release(id: string): void;
    /**
     * Release all subagents
     */
    releaseAll(): void;
    /**
     * Check if agent is active
     */
    isActive(id: string): boolean;
    /**
     * Assign task to agent
     */
    assignTask(id: string, taskId: string): void;
    /**
     * Get agent info
     */
    getAgentInfo(id: string): L1SubagentInfo;
    /**
     * Set start time for testing
     */
    setStartTimeForTesting(id: string, timestamp: number): void;
    /**
     * Get pool statistics
     */
    getStatistics(): PoolStatistics;
}
/**
 * L2 Executor Pool
 * Max 4 parallel executors with write permissions
 */
export declare class L2ExecutorPool extends EventEmitter {
    private readonly maxCapacity;
    private executors;
    private locks;
    private globalSemaphore;
    private totalAcquisitions;
    /**
     * Get maximum pool capacity
     */
    getMaxCapacity(): number;
    /**
     * Get number of active executors
     */
    getActiveCount(): number;
    /**
     * Get available slots
     */
    getAvailableSlots(): number;
    /**
     * Acquire an executor slot
     */
    acquire(id: string, options?: L2AcquisitionOptions): L2ExecutorInfo;
    /**
     * Release an executor slot
     */
    release(id: string, options?: ReleaseOptions): void;
    /**
     * Release all executors
     */
    releaseAll(): void;
    /**
     * Get lock info
     */
    getLockInfo(path: string): LockInfo;
    /**
     * Assign task to executor
     */
    assignTask(id: string, task: Partial<ExecutorTaskInfo>): void;
    /**
     * Update task status
     */
    updateTaskStatus(id: string, status: TaskStatus): void;
    /**
     * Complete task with evidence
     */
    completeTask(id: string, completion: TaskCompletionInfo): void;
    /**
     * Record evidence
     */
    recordEvidence(id: string, evidence: EvidenceRecord): void;
    /**
     * Get task evidence
     */
    getTaskEvidence(id: string): EvidenceRecord[];
    /**
     * Get executor info
     */
    getExecutorInfo(id: string): L2ExecutorInfo;
    /**
     * Get executor health
     */
    getExecutorHealth(id: string): ExecutorHealth;
    /**
     * Set last activity for testing
     */
    setLastActivityForTesting(id: string, timestamp: number): void;
    /**
     * Cleanup stale executors
     */
    cleanupStaleExecutors(thresholdSeconds: number): void;
    /**
     * Get global semaphore
     */
    getGlobalSemaphore(): GlobalSemaphore;
    /**
     * Get pool statistics
     */
    getStatistics(): PoolStatistics;
}
export {};
//# sourceMappingURL=agent-pool.d.ts.map