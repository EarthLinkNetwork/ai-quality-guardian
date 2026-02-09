/**
 * Process Supervisor
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md:
 * - AC-SUP-1: Supervisor manages Web as child process
 * - AC-SUP-2: Safety mechanisms (build fail → no restart, restart fail → preserve old)
 * - AC-OPS-2: Restart(REAL) = PID must change
 * - AC-OPS-3: build_sha tracked and updated
 */
import { EventEmitter } from 'events';
import { PreflightReport, ExecutorType } from '../diagnostics/executor-preflight';
/**
 * Build metadata written to dist/build-meta.json
 */
export interface BuildMeta {
    build_sha: string;
    build_timestamp: string;
    git_sha?: string;
    git_branch?: string;
}
/**
 * Web process state
 */
export interface WebProcessState {
    pid: number | null;
    startTime: Date | null;
    status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
    lastError?: string;
    buildMeta?: BuildMeta;
    /** Preflight check result (set on start) */
    preflightReport?: PreflightReport;
}
/**
 * Supervisor events
 */
export interface ProcessSupervisorEvents {
    'web:started': (state: WebProcessState) => void;
    'web:stopped': (state: WebProcessState) => void;
    'web:error': (error: Error, state: WebProcessState) => void;
    'build:started': () => void;
    'build:completed': (buildMeta: BuildMeta) => void;
    'build:failed': (error: Error) => void;
}
/**
 * Process Supervisor Options
 */
export interface ProcessSupervisorOptions {
    projectRoot: string;
    webPort: number;
    webHost?: string;
    buildScript?: string;
    startCommand?: string[];
    buildTimeoutMs?: number;
    startupWaitMs?: number;
    healthCheckUrl?: string;
    stateDir?: string;
}
/**
 * Process Supervisor
 *
 * Manages Web server as a child process with:
 * - Real restart (PID change guaranteed)
 * - Build tracking (build_sha)
 * - Safety mechanisms (build fail = no restart)
 */
export declare class ProcessSupervisor extends EventEmitter {
    private options;
    private webProcess;
    private state;
    private buildMetaPath;
    constructor(options: ProcessSupervisorOptions);
    /**
     * Get current process state
     */
    getState(): WebProcessState;
    /**
     * Get web PID
     */
    getWebPid(): number | null;
    /**
     * Get build metadata
     */
    getBuildMeta(): BuildMeta | undefined;
    /**
     * Load build metadata from dist/build-meta.json
     */
    loadBuildMeta(): BuildMeta | undefined;
    /**
     * Generate and save build metadata
     * Called after successful build
     */
    private generateBuildMeta;
    /**
     * Build the project
     * AC-OPS-3: Generates build_sha after build
     */
    build(): Promise<{
        success: boolean;
        buildMeta?: BuildMeta;
        error?: string;
        output?: string;
    }>;
    /**
     * Run preflight checks for executor configuration
     * Returns the preflight report for inspection
     */
    runPreflightCheck(executorType?: ExecutorType): PreflightReport;
    /**
     * Start Web server as child process
     * AC-SUP-1: Web runs as child of Supervisor
     *
     * FAIL-FAST: Runs preflight checks before starting.
     * If no executor is configured, returns error immediately.
     */
    start(): Promise<{
        success: boolean;
        pid?: number;
        error?: string;
        preflightReport?: PreflightReport;
    }>;
    /**
     * Stop Web server
     */
    stop(): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Restart Web server (REAL restart)
     * AC-OPS-2: PID must change after restart
     * AC-SUP-2: Build fail → no restart, preserve old process
     */
    restart(options?: {
        build?: boolean;
    }): Promise<{
        success: boolean;
        oldPid?: number;
        newPid?: number;
        buildMeta?: BuildMeta;
        error?: string;
    }>;
    /**
     * Health check
     * Includes preflight status for visibility in Web UI
     */
    healthCheck(): Promise<{
        healthy: boolean;
        pid?: number;
        buildMeta?: BuildMeta;
        uptime_ms?: number;
        error?: string;
        preflightReport?: PreflightReport;
    }>;
    /**
     * Cleanup on supervisor shutdown
     */
    shutdown(): Promise<void>;
}
/**
 * Create a ProcessSupervisor instance
 */
export declare function createProcessSupervisor(options: ProcessSupervisorOptions): ProcessSupervisor;
//# sourceMappingURL=process-supervisor.d.ts.map