"use strict";
/**
 * Web Background Commands
 * Per spec/19_WEB_UI.md lines 361-432
 *
 * Provides:
 * - PidFileManager: PID file read/write/delete operations
 * - WebServerProcess: Background server spawning
 * - WebStopCommand: Stop running server via PID
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
exports.WebServerProcess = exports.WebStopCommand = exports.PidFileManager = exports.WebStopExitCode = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/**
 * Exit codes for web-stop command
 * Per spec/19_WEB_UI.md lines 420-426
 */
var WebStopExitCode;
(function (WebStopExitCode) {
    /** Normal stop - server stopped successfully */
    WebStopExitCode[WebStopExitCode["SUCCESS"] = 0] = "SUCCESS";
    /** PID file not found - server not running */
    WebStopExitCode[WebStopExitCode["PID_FILE_NOT_FOUND"] = 1] = "PID_FILE_NOT_FOUND";
    /** Force killed - SIGKILL was required after SIGTERM timeout */
    WebStopExitCode[WebStopExitCode["FORCE_KILLED"] = 2] = "FORCE_KILLED";
})(WebStopExitCode || (exports.WebStopExitCode = WebStopExitCode = {}));
/**
 * PidFileManager - Manages PID files for background web servers
 * Per spec/19_WEB_UI.md lines 380-388
 *
 * PID file path: .claude/state/{namespace}/web-server.pid
 * For default namespace: .claude/web-server.pid
 */
class PidFileManager {
    projectRoot;
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
    }
    /**
     * Get PID file path for namespace
     * Per spec/19_WEB_UI.md lines 382-384
     */
    getPidFilePath(namespace) {
        if (namespace === 'default') {
            return path.join(this.projectRoot, '.claude', 'web-server.pid');
        }
        return path.join(this.projectRoot, '.claude', 'state', namespace, 'web-server.pid');
    }
    /**
     * Get log file path for namespace
     * Per spec/19_WEB_UI.md lines 392-394
     */
    getLogFilePath(namespace) {
        if (namespace === 'default') {
            return path.join(this.projectRoot, '.claude', 'web-server.log');
        }
        return path.join(this.projectRoot, '.claude', 'state', namespace, 'web-server.log');
    }
    /**
     * Get state directory for namespace
     */
    getStateDir(namespace) {
        if (namespace === 'default') {
            return path.join(this.projectRoot, '.claude');
        }
        return path.join(this.projectRoot, '.claude', 'state', namespace);
    }
    /**
     * Write PID to file
     * Creates parent directories if needed
     */
    async writePid(namespace, pid) {
        const pidPath = this.getPidFilePath(namespace);
        const dir = path.dirname(pidPath);
        // Create parent directories if needed
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(pidPath, pid.toString(), 'utf-8');
    }
    /**
     * Read PID from file
     * Returns null if file doesn't exist or contains invalid data
     */
    async readPid(namespace) {
        const pidPath = this.getPidFilePath(namespace);
        if (!fs.existsSync(pidPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(pidPath, 'utf-8').trim();
            const pid = parseInt(content, 10);
            if (isNaN(pid) || pid <= 0) {
                return null;
            }
            return pid;
        }
        catch {
            return null;
        }
    }
    /**
     * Delete PID file
     * Does not throw if file doesn't exist
     */
    async deletePid(namespace) {
        const pidPath = this.getPidFilePath(namespace);
        if (fs.existsSync(pidPath)) {
            fs.unlinkSync(pidPath);
        }
    }
    /**
     * Check if a process is running
     * Uses kill(pid, 0) to check without sending signal
     */
    isProcessRunning(pid) {
        try {
            // kill(pid, 0) checks if process exists without sending signal
            process.kill(pid, 0);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Send signal to process
     */
    sendSignal(pid, signal) {
        try {
            process.kill(pid, signal);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.PidFileManager = PidFileManager;
/**
 * WebStopCommand - Stops a background web server
 * Per spec/19_WEB_UI.md lines 400-432
 *
 * Flow:
 * 1. Read PID file
 * 2. Send SIGTERM (graceful shutdown)
 * 3. Wait up to 5 seconds
 * 4. If still running, send SIGKILL (force)
 * 5. Delete PID file
 */
class WebStopCommand {
    pidManager;
    gracefulTimeoutMs;
    constructor(pidManager, options) {
        this.pidManager = pidManager;
        this.gracefulTimeoutMs = options?.gracefulTimeoutMs ?? 5000;
    }
    /**
     * Execute web-stop command
     * Per spec/19_WEB_UI.md lines 412-418
     */
    async execute(namespace) {
        // 1. Read PID file
        const pid = await this.pidManager.readPid(namespace);
        if (pid === null) {
            return {
                exitCode: WebStopExitCode.PID_FILE_NOT_FOUND,
                message: 'PID file not found - server is not running or namespace does not exist',
            };
        }
        // 2. Check if process is actually running
        if (!this.pidManager.isProcessRunning(pid)) {
            // Stale PID file - process already stopped
            await this.pidManager.deletePid(namespace);
            return {
                exitCode: WebStopExitCode.SUCCESS,
                message: 'Server already stopped (stale PID file cleaned up)',
                pid,
            };
        }
        // 3. Send SIGTERM (graceful shutdown)
        this.pidManager.sendSignal(pid, 'SIGTERM');
        // 4. Wait for graceful shutdown
        const stopped = await this.waitForStop(pid, this.gracefulTimeoutMs);
        if (stopped) {
            await this.pidManager.deletePid(namespace);
            return {
                exitCode: WebStopExitCode.SUCCESS,
                message: 'Server stopped gracefully',
                pid,
            };
        }
        // 5. Force kill with SIGKILL
        this.pidManager.sendSignal(pid, 'SIGKILL');
        // Wait a bit for SIGKILL to take effect
        await this.waitForStop(pid, 1000);
        await this.pidManager.deletePid(namespace);
        return {
            exitCode: WebStopExitCode.FORCE_KILLED,
            message: 'Server force killed (did not respond to SIGTERM)',
            pid,
        };
    }
    /**
     * Wait for process to stop
     * Returns true if process stopped, false if timeout
     */
    async waitForStop(pid, timeoutMs) {
        const startTime = Date.now();
        const checkInterval = 100; // Check every 100ms
        while (Date.now() - startTime < timeoutMs) {
            if (!this.pidManager.isProcessRunning(pid)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        return !this.pidManager.isProcessRunning(pid);
    }
}
exports.WebStopCommand = WebStopCommand;
/**
 * WebServerProcess - Manages background web server spawning
 * Per spec/19_WEB_UI.md lines 361-398
 */
class WebServerProcess {
    config;
    pidManager;
    childProcess = null;
    constructor(config) {
        this.config = config;
        this.pidManager = new PidFileManager(config.projectRoot);
    }
    /**
     * Parse --background and related arguments
     */
    static parseBackgroundArgs(args) {
        const result = {
            background: false,
        };
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg === '--background') {
                result.background = true;
            }
            else if (arg === '--port' && args[i + 1]) {
                result.port = parseInt(args[++i], 10);
            }
            else if (arg === '--namespace' && args[i + 1]) {
                result.namespace = args[++i];
            }
        }
        return result;
    }
    /**
     * Validate prerequisites for background mode
     * Creates state directory if needed
     */
    async validateBackgroundPrerequisites() {
        const stateDir = this.pidManager.getStateDir(this.config.namespace);
        // Create state directory if it doesn't exist
        if (!fs.existsSync(stateDir)) {
            try {
                fs.mkdirSync(stateDir, { recursive: true });
            }
            catch (error) {
                return {
                    valid: false,
                    error: `Failed to create state directory: ${error instanceof Error ? error.message : error}`,
                };
            }
        }
        // Check if PID file already exists (another server might be running)
        const existingPid = await this.pidManager.readPid(this.config.namespace);
        if (existingPid !== null && this.pidManager.isProcessRunning(existingPid)) {
            return {
                valid: false,
                error: `Server already running (PID: ${existingPid})`,
            };
        }
        // Clean up stale PID file if exists
        if (existingPid !== null) {
            await this.pidManager.deletePid(this.config.namespace);
        }
        return { valid: true };
    }
    /**
     * Spawn web server in background
     * Per spec/19_WEB_UI.md lines 373-378
     */
    async spawnBackground() {
        const validation = await this.validateBackgroundPrerequisites();
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }
        const logPath = this.pidManager.getLogFilePath(this.config.namespace);
        // Open log file for writing
        const logFd = fs.openSync(logPath, 'a');
        // Build command arguments
        const args = [
            'web',
            '--port', this.config.port.toString(),
            '--namespace', this.config.namespace,
        ];
        // Spawn detached process
        // Use the same node executable that's running this process
        const modulePath = path.resolve(__dirname, '../cli/index.js');
        this.childProcess = (0, child_process_1.spawn)(process.execPath, [modulePath, ...args], {
            detached: true,
            stdio: ['ignore', logFd, logFd],
            cwd: this.config.projectRoot,
            env: {
                ...process.env,
                PM_RUNNER_BACKGROUND: '1',
            },
        });
        const pid = this.childProcess.pid;
        if (!pid) {
            return { success: false, error: 'Failed to spawn background process' };
        }
        // Write PID file
        await this.pidManager.writePid(this.config.namespace, pid);
        // Unref to allow parent process to exit
        this.childProcess.unref();
        // Close log file descriptor in parent
        fs.closeSync(logFd);
        return { success: true, pid };
    }
    /**
     * Get PID manager for external use
     */
    getPidManager() {
        return this.pidManager;
    }
}
exports.WebServerProcess = WebServerProcess;
//# sourceMappingURL=background.js.map