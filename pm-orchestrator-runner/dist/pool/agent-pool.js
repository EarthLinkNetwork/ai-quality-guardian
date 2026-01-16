"use strict";
/**
 * L1/L2 Agent Pool
 * Based on 04_COMPONENTS.md L98-155
 *
 * L1 Subagent Pool: Max 9 parallel read-only subagents
 * L2 Executor Pool: Max 4 parallel executors with write permissions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.L2ExecutorPool = exports.L1SubagentPool = exports.AgentPoolError = void 0;
const events_1 = require("events");
const enums_1 = require("../models/enums");
const error_codes_1 = require("../errors/error-codes");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const minimatch = require('minimatch');
/**
 * Agent Pool Error
 */
class AgentPoolError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'AgentPoolError';
        this.code = code;
        this.details = details;
    }
}
exports.AgentPoolError = AgentPoolError;
/**
 * Global semaphore for coordinating pool access
 */
class GlobalSemaphore {
    activeCount = 0;
    acquire() {
        this.activeCount++;
    }
    release() {
        if (this.activeCount > 0) {
            this.activeCount--;
        }
    }
    getActiveCount() {
        return this.activeCount;
    }
}
/**
 * L1 Subagent Pool
 * Max 9 parallel read-only subagents
 */
class L1SubagentPool {
    maxCapacity = 9;
    agents = new Map();
    queueEnabled = false;
    queue = [];
    totalAcquisitions = 0;
    /**
     * Get maximum pool capacity
     */
    getMaxCapacity() {
        return this.maxCapacity;
    }
    /**
     * Get number of active subagents
     */
    getActiveCount() {
        return this.agents.size;
    }
    /**
     * Get available slots
     */
    getAvailableSlots() {
        return this.maxCapacity - this.agents.size;
    }
    /**
     * Enable or disable queueing
     */
    enableQueueing(enabled) {
        this.queueEnabled = enabled;
    }
    /**
     * Acquire a subagent slot
     */
    acquire(id, type, options) {
        // L1 only allows READER type
        if (type !== enums_1.AgentType.READER) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, 'L1 pool only allows READER type agents', { type });
        }
        // Check capacity
        if (this.agents.size >= this.maxCapacity) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, 'L1 pool is at maximum capacity', { maxCapacity: this.maxCapacity, activeCount: this.agents.size });
        }
        const now = Date.now();
        const info = {
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
    queueAcquisition(id, type, options) {
        if (!this.queueEnabled) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, 'Queueing is not enabled');
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
    release(id) {
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
    releaseAll() {
        this.agents.clear();
        this.queue = [];
    }
    /**
     * Check if agent is active
     */
    isActive(id) {
        return this.agents.has(id);
    }
    /**
     * Assign task to agent
     */
    assignTask(id, taskId) {
        const agent = this.agents.get(id);
        if (agent) {
            agent.info.current_task = taskId;
        }
    }
    /**
     * Get agent info
     */
    getAgentInfo(id) {
        const agent = this.agents.get(id);
        if (!agent) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Agent not found: ${id}`, { id });
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
    setStartTimeForTesting(id, timestamp) {
        const agent = this.agents.get(id);
        if (agent) {
            agent.startTime = timestamp;
        }
    }
    /**
     * Get pool statistics
     */
    getStatistics() {
        return {
            total_capacity: this.maxCapacity,
            active_count: this.agents.size,
            available_slots: this.getAvailableSlots(),
            utilization_percent: Math.round((this.agents.size / this.maxCapacity) * 100),
            total_acquisitions: this.totalAcquisitions,
        };
    }
}
exports.L1SubagentPool = L1SubagentPool;
/**
 * L2 Executor Pool
 * Max 4 parallel executors with write permissions
 */
class L2ExecutorPool extends events_1.EventEmitter {
    maxCapacity = 4;
    executors = new Map();
    locks = new Map(); // path -> executor_id
    globalSemaphore = new GlobalSemaphore();
    totalAcquisitions = 0;
    /**
     * Get maximum pool capacity
     */
    getMaxCapacity() {
        return this.maxCapacity;
    }
    /**
     * Get number of active executors
     */
    getActiveCount() {
        return this.executors.size;
    }
    /**
     * Get available slots
     */
    getAvailableSlots() {
        return this.maxCapacity - this.executors.size;
    }
    /**
     * Acquire an executor slot
     */
    acquire(id, options) {
        // Check capacity
        if (this.executors.size >= this.maxCapacity) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, 'L2 pool is at maximum capacity', { maxCapacity: this.maxCapacity, activeCount: this.executors.size });
        }
        // Check lock availability
        const lockPaths = options?.lockPaths || [];
        for (const path of lockPaths) {
            if (this.locks.has(path)) {
                throw new AgentPoolError(error_codes_1.ErrorCode.E401_LOCK_ACQUISITION_FAILED, `Lock already held: ${path}`, { path, holder: this.locks.get(path) });
            }
        }
        // Acquire locks
        for (const path of lockPaths) {
            this.locks.set(path, id);
        }
        const now = Date.now();
        const canWrite = (path) => {
            if (!options?.writeScopes || options.writeScopes.length === 0) {
                return true; // Default: can write anywhere
            }
            return options.writeScopes.some(scope => minimatch(path, scope));
        };
        const info = {
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
            current_task: {},
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
    release(id, options) {
        const executor = this.executors.get(id);
        if (!executor) {
            return; // Ignore release for unknown executor
        }
        // Check if task is in progress (unless force)
        if (!options?.force) {
            const taskStatus = executor.info.current_task?.status;
            if (taskStatus === enums_1.TaskStatus.IN_PROGRESS) {
                throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, 'Cannot release executor with in-progress task', { id, taskStatus });
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
    releaseAll() {
        for (const [id] of this.executors) {
            this.release(id, { force: true });
        }
    }
    /**
     * Get lock info
     */
    getLockInfo(path) {
        const holder = this.locks.get(path);
        return {
            locked: !!holder,
            holder,
        };
    }
    /**
     * Assign task to executor
     */
    assignTask(id, task) {
        const executor = this.executors.get(id);
        if (!executor) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor not found: ${id}`, { id });
        }
        executor.info.current_task = {
            task_id: task.task_id || '',
            description: task.description,
            files: task.files,
            status: enums_1.TaskStatus.PENDING,
        };
        executor.lastActivity = Date.now();
    }
    /**
     * Update task status
     */
    updateTaskStatus(id, status) {
        const executor = this.executors.get(id);
        if (!executor) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor not found: ${id}`, { id });
        }
        executor.info.current_task.status = status;
        executor.lastActivity = Date.now();
    }
    /**
     * Complete task with evidence
     */
    completeTask(id, completion) {
        const executor = this.executors.get(id);
        if (!executor) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor not found: ${id}`, { id });
        }
        // Require evidence for completion
        if (completion.status === enums_1.TaskStatus.COMPLETED && !completion.evidence) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E301_EVIDENCE_MISSING, 'Evidence required for task completion', { id });
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
    recordEvidence(id, evidence) {
        const executor = this.executors.get(id);
        if (!executor) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor not found: ${id}`, { id });
        }
        executor.evidence.push(evidence);
        executor.lastActivity = Date.now();
    }
    /**
     * Get task evidence
     */
    getTaskEvidence(id) {
        const executor = this.executors.get(id);
        if (!executor) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor not found: ${id}`, { id });
        }
        return [...executor.evidence];
    }
    /**
     * Get executor info
     */
    getExecutorInfo(id) {
        const executor = this.executors.get(id);
        if (!executor) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor not found: ${id}`, { id });
        }
        return executor.info;
    }
    /**
     * Get executor health
     */
    getExecutorHealth(id) {
        const executor = this.executors.get(id);
        if (!executor) {
            throw new AgentPoolError(error_codes_1.ErrorCode.E206_RESOURCE_LIMIT_EXCEEDED, `Executor not found: ${id}`, { id });
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
    setLastActivityForTesting(id, timestamp) {
        const executor = this.executors.get(id);
        if (executor) {
            executor.lastActivity = timestamp;
        }
    }
    /**
     * Cleanup stale executors
     */
    cleanupStaleExecutors(thresholdSeconds) {
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
    getGlobalSemaphore() {
        return this.globalSemaphore;
    }
    /**
     * Get pool statistics
     */
    getStatistics() {
        return {
            total_capacity: this.maxCapacity,
            active_count: this.executors.size,
            available_slots: this.getAvailableSlots(),
            utilization_percent: Math.round((this.executors.size / this.maxCapacity) * 100),
            total_acquisitions: this.totalAcquisitions,
        };
    }
}
exports.L2ExecutorPool = L2ExecutorPool;
//# sourceMappingURL=agent-pool.js.map