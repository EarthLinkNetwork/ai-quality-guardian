/**
 * Runner Controls Routes
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-OPS-1:
 * - Web UI provides Run/Stop/Build/Restart controls
 * - Operations work for selfhost (local pm web) scenario
 * - Success/failure clearly displayed
 * - On failure: show cause and next action (Retry/Back)
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-OPS-2/AC-OPS-3:
 * - Restart(REAL) = PID must change
 * - build_sha tracked and updated
 */
import { Router } from 'express';
import { ChildProcess } from 'child_process';
import { ProcessSupervisor, BuildMeta } from '../../supervisor/index';
/**
 * Runner control operation result
 */
export interface RunnerControlResult {
    success: boolean;
    operation: 'stop' | 'build' | 'restart' | 'status';
    message: string;
    duration_ms?: number;
    output?: string;
    error?: string;
    nextActions?: Array<{
        label: string;
        action: 'retry' | 'back' | 'view_logs';
    }>;
}
/**
 * Runner status response
 * Per AC-OPS-2: includes pid for restart verification
 * Per AC-OPS-3: includes build_sha for build tracking
 */
export interface RunnerStatus {
    isRunning: boolean;
    pid?: number;
    uptime_ms?: number;
    lastHeartbeat?: string;
    queueDepth?: number;
    build_sha?: string;
    build_timestamp?: string;
}
/**
 * Configuration for runner controls
 */
export interface RunnerControlsConfig {
    /** Project root directory */
    projectRoot: string;
    /** NPM script for build (default: 'build') */
    buildScript?: string;
    /** NPM script for start (default: 'start') */
    startScript?: string;
    /** Timeout for build operation in ms (default: 300000 = 5 minutes) */
    buildTimeoutMs?: number;
    /** Timeout for stop operation in ms (default: 30000 = 30 seconds) */
    stopTimeoutMs?: number;
    /** ProcessSupervisor instance for real restart (AC-OPS-2) */
    processSupervisor?: ProcessSupervisor;
    /** Optional self-restart handler (for in-process restart) */
    restartHandler?: () => Promise<RunnerRestartResult>;
}
/**
 * Restart handler result (used for self-restart flows)
 */
export interface RunnerRestartResult {
    success: boolean;
    oldPid?: number;
    newPid?: number;
    buildMeta?: BuildMeta;
    output?: string;
    error?: string;
    message?: string;
    /**
     * Optional callback to execute after HTTP response is sent.
     * Useful for self-restart that would terminate this process.
     */
    postResponse?: () => void;
}
/**
 * Creates router for runner control endpoints
 *
 * @param config - Runner controls configuration
 * @returns Express router
 */
export declare function createRunnerControlsRoutes(config: RunnerControlsConfig): Router;
/**
 * Gets current runner process (for testing)
 */
export declare function getRunnerProcess(): ChildProcess | null;
/**
 * Sets runner process (for testing)
 */
export declare function setRunnerProcess(process: ChildProcess | null, startTime?: Date): void;
//# sourceMappingURL=runner-controls.d.ts.map