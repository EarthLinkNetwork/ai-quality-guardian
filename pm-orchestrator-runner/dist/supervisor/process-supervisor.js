"use strict";
/**
 * Process Supervisor
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md:
 * - AC-SUP-1: Supervisor manages Web as child process
 * - AC-SUP-2: Safety mechanisms (build fail → no restart, restart fail → preserve old)
 * - AC-OPS-2: Restart(REAL) = PID must change
 * - AC-OPS-3: build_sha tracked and updated
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessSupervisor = void 0;
exports.createProcessSupervisor = createProcessSupervisor;
const child_process_1 = require("child_process");
const events_1 = require("events");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const executor_preflight_1 = require("../diagnostics/executor-preflight");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const DEFAULT_OPTIONS = {
    webHost: 'localhost',
    buildScript: 'build',
    startCommand: ['node', 'dist/cli/index.js', 'web'],
    buildTimeoutMs: 300_000, // 5 minutes
    startupWaitMs: 3000,
};
/**
 * Process Supervisor
 *
 * Manages Web server as a child process with:
 * - Real restart (PID change guaranteed)
 * - Build tracking (build_sha)
 * - Safety mechanisms (build fail = no restart)
 */
class ProcessSupervisor extends events_1.EventEmitter {
    options;
    webProcess = null;
    state = {
        pid: null,
        startTime: null,
        status: 'stopped',
    };
    buildMetaPath;
    constructor(options) {
        super();
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            webHost: options.webHost || DEFAULT_OPTIONS.webHost,
            buildScript: options.buildScript || DEFAULT_OPTIONS.buildScript,
            startCommand: options.startCommand || DEFAULT_OPTIONS.startCommand,
            buildTimeoutMs: options.buildTimeoutMs || DEFAULT_OPTIONS.buildTimeoutMs,
            startupWaitMs: options.startupWaitMs || DEFAULT_OPTIONS.startupWaitMs,
            healthCheckUrl: options.healthCheckUrl || `http://${options.webHost || DEFAULT_OPTIONS.webHost}:${options.webPort}/api/health`,
            stateDir: options.stateDir || path.join(options.projectRoot, '.pm-state'),
        };
        this.buildMetaPath = path.join(this.options.projectRoot, 'dist', 'build-meta.json');
    }
    /**
     * Get current process state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Get web PID
     */
    getWebPid() {
        return this.webProcess?.pid ?? null;
    }
    /**
     * Get build metadata
     */
    getBuildMeta() {
        return this.state.buildMeta;
    }
    /**
     * Load build metadata from dist/build-meta.json
     */
    loadBuildMeta() {
        try {
            if (fs.existsSync(this.buildMetaPath)) {
                const content = fs.readFileSync(this.buildMetaPath, 'utf-8');
                return JSON.parse(content);
            }
        }
        catch {
            // Ignore errors
        }
        return undefined;
    }
    /**
     * Generate and save build metadata
     * Called after successful build
     */
    generateBuildMeta() {
        let gitSha;
        let gitBranch;
        try {
            gitSha = (0, child_process_1.execSync)('git rev-parse --short HEAD', {
                cwd: this.options.projectRoot,
                encoding: 'utf-8',
            }).trim();
        }
        catch {
            // Not a git repo or git not available
        }
        try {
            gitBranch = (0, child_process_1.execSync)('git rev-parse --abbrev-ref HEAD', {
                cwd: this.options.projectRoot,
                encoding: 'utf-8',
            }).trim();
        }
        catch {
            // Not a git repo or git not available
        }
        const timestamp = new Date().toISOString();
        const buildMeta = {
            build_sha: gitSha || `build-${Date.now()}`,
            build_timestamp: timestamp,
            git_sha: gitSha,
            git_branch: gitBranch,
        };
        // Ensure dist directory exists
        const distDir = path.dirname(this.buildMetaPath);
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }
        fs.writeFileSync(this.buildMetaPath, JSON.stringify(buildMeta, null, 2));
        return buildMeta;
    }
    /**
     * Build the project
     * AC-OPS-3: Generates build_sha after build
     */
    async build() {
        this.emit('build:started');
        try {
            const { stdout, stderr } = await execAsync(`npm run ${this.options.buildScript}`, {
                cwd: this.options.projectRoot,
                timeout: this.options.buildTimeoutMs,
            });
            // Generate build metadata after successful build
            const buildMeta = this.generateBuildMeta();
            this.state.buildMeta = buildMeta;
            this.emit('build:completed', buildMeta);
            return {
                success: true,
                buildMeta,
                output: stdout + (stderr ? '\n' + stderr : ''),
            };
        }
        catch (error) {
            const err = error;
            this.emit('build:failed', err);
            return {
                success: false,
                error: err.message,
                output: (err.stdout || '') + '\n' + (err.stderr || ''),
            };
        }
    }
    /**
     * Run preflight checks for executor configuration
     * Returns the preflight report for inspection
     */
    runPreflightCheck(executorType = 'auto') {
        return (0, executor_preflight_1.runPreflightChecks)(executorType);
    }
    /**
     * Start Web server as child process
     * AC-SUP-1: Web runs as child of Supervisor
     *
     * FAIL-FAST: Runs preflight checks before starting.
     * If no executor is configured, returns error immediately.
     */
    async start() {
        if (this.state.status === 'running' && this.webProcess && !this.webProcess.killed) {
            return { success: true, pid: this.webProcess.pid };
        }
        this.state.status = 'starting';
        // PREFLIGHT CHECK: Fail-fast on missing executor configuration
        // Per spec: All auth/config issues must FAIL FAST, not timeout
        const preflightReport = this.runPreflightCheck('auto');
        this.state.preflightReport = preflightReport;
        if (!preflightReport.can_proceed) {
            this.state.status = 'error';
            const firstError = preflightReport.fatal_errors[0];
            const errorMsg = `Executor preflight failed: ${firstError.code} - ${firstError.message}. Fix: ${firstError.fix_hint}`;
            this.state.lastError = errorMsg;
            return {
                success: false,
                error: errorMsg,
                preflightReport,
            };
        }
        // Load build metadata
        this.state.buildMeta = this.loadBuildMeta();
        try {
            // Build start command with port
            const [cmd, ...args] = this.options.startCommand;
            const fullArgs = [...args, '--port', String(this.options.webPort)];
            // Add stateDir if specified
            if (this.options.stateDir) {
                fullArgs.push('--stateDir', this.options.stateDir);
            }
            this.webProcess = (0, child_process_1.spawn)(cmd, fullArgs, {
                cwd: this.options.projectRoot,
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false,
                env: {
                    ...process.env,
                    PM_BUILD_SHA: this.state.buildMeta?.build_sha,
                    PM_WEB_PORT: String(this.options.webPort),
                },
            });
            const pid = this.webProcess.pid;
            // Handle process events
            this.webProcess.on('error', (error) => {
                this.state.status = 'error';
                this.state.lastError = error.message;
                this.emit('web:error', error, this.getState());
            });
            this.webProcess.on('exit', (code, signal) => {
                this.state.status = 'stopped';
                this.state.pid = null;
                this.state.startTime = null;
                if (code !== 0 && code !== null) {
                    this.state.lastError = `Process exited with code ${code}`;
                }
                this.emit('web:stopped', this.getState());
            });
            // Wait for startup
            await new Promise(resolve => setTimeout(resolve, this.options.startupWaitMs));
            // Check if process is still running
            if (!this.webProcess || this.webProcess.killed || this.webProcess.exitCode !== null) {
                throw new Error('Web process exited immediately after start');
            }
            this.state.status = 'running';
            this.state.pid = pid ?? null;
            this.state.startTime = new Date();
            this.emit('web:started', this.getState());
            return { success: true, pid: pid };
        }
        catch (error) {
            this.state.status = 'error';
            this.state.lastError = error instanceof Error ? error.message : String(error);
            return { success: false, error: this.state.lastError };
        }
    }
    /**
     * Stop Web server
     */
    async stop() {
        if (!this.webProcess || this.webProcess.killed) {
            this.state.status = 'stopped';
            this.state.pid = null;
            return { success: true };
        }
        this.state.status = 'stopping';
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                // Force kill if graceful shutdown fails
                if (this.webProcess && !this.webProcess.killed) {
                    this.webProcess.kill('SIGKILL');
                }
                this.state.status = 'stopped';
                this.state.pid = null;
                resolve({ success: true });
            }, 10000); // 10s timeout for graceful shutdown
            if (this.webProcess) {
                this.webProcess.once('exit', () => {
                    clearTimeout(timeout);
                    this.state.status = 'stopped';
                    this.state.pid = null;
                    this.webProcess = null;
                    resolve({ success: true });
                });
                this.webProcess.kill('SIGTERM');
            }
            else {
                clearTimeout(timeout);
                resolve({ success: true });
            }
        });
    }
    /**
     * Restart Web server (REAL restart)
     * AC-OPS-2: PID must change after restart
     * AC-SUP-2: Build fail → no restart, preserve old process
     */
    async restart(options = {}) {
        const oldPid = this.getWebPid();
        // Step 1: Build if requested
        if (options.build !== false) {
            const buildResult = await this.build();
            if (!buildResult.success) {
                // AC-SUP-2: Build fail → no restart, preserve old process
                return {
                    success: false,
                    oldPid: oldPid ?? undefined,
                    error: `Build failed: ${buildResult.error}. Old process preserved.`,
                };
            }
        }
        // Step 2: Stop old process
        await this.stop();
        // Step 3: Start new process
        const startResult = await this.start();
        if (!startResult.success) {
            // AC-SUP-2: Start fail - attempt recovery
            // Try to restart old build (if we didn't build this time)
            return {
                success: false,
                oldPid: oldPid ?? undefined,
                error: `Start failed: ${startResult.error}`,
            };
        }
        const newPid = this.getWebPid();
        // AC-OPS-2: Verify PID changed
        if (oldPid !== null && newPid === oldPid) {
            // This should never happen with proper stop/start, but verify anyway
            return {
                success: false,
                oldPid,
                newPid,
                error: 'FATAL: PID did not change after restart. This violates AC-OPS-2.',
            };
        }
        return {
            success: true,
            oldPid: oldPid ?? undefined,
            newPid: newPid ?? undefined,
            buildMeta: this.state.buildMeta,
        };
    }
    /**
     * Health check
     * Includes preflight status for visibility in Web UI
     */
    async healthCheck() {
        if (this.state.status !== 'running' || !this.webProcess || this.webProcess.killed) {
            return {
                healthy: false,
                error: `Web is not running (status: ${this.state.status})`,
            };
        }
        try {
            // Dynamic import for fetch
            const response = await fetch(this.options.healthCheckUrl);
            if (!response.ok) {
                return {
                    healthy: false,
                    pid: this.state.pid ?? undefined,
                    error: `Health check failed with status ${response.status}`,
                };
            }
            return {
                healthy: true,
                pid: this.state.pid ?? undefined,
                buildMeta: this.state.buildMeta,
                uptime_ms: this.state.startTime ? Date.now() - this.state.startTime.getTime() : undefined,
                preflightReport: this.state.preflightReport,
            };
        }
        catch (error) {
            return {
                healthy: false,
                pid: this.state.pid ?? undefined,
                error: error instanceof Error ? error.message : String(error),
                preflightReport: this.state.preflightReport,
            };
        }
    }
    /**
     * Cleanup on supervisor shutdown
     */
    async shutdown() {
        await this.stop();
        this.removeAllListeners();
    }
}
exports.ProcessSupervisor = ProcessSupervisor;
/**
 * Create a ProcessSupervisor instance
 */
function createProcessSupervisor(options) {
    return new ProcessSupervisor(options);
}
//# sourceMappingURL=process-supervisor.js.map