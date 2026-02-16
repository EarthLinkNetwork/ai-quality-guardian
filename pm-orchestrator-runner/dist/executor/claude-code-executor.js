"use strict";
/**
 * Claude Code Executor
 *
 * Executes tasks via Claude Code CLI subprocess.
 * Per spec 04_COMPONENTS.md: L2 Executor must use Claude Code CLI for task execution.
 * Per spec 10_REPL_UX.md Section 10: Non-interactive mode guarantees (Property 34-36).
 *
 * This is NOT a simulation - it actually spawns the `claude` CLI process.
 *
 * Timeout Design (v3 - AC B: Abolish silence=timeout):
 * - SOFT_TIMEOUT: Warning only, continue execution
 * - HARD_TIMEOUT: ABOLISHED - silence alone does NOT terminate
 * - OVERALL_TIMEOUT: Total execution time limit (safety net, optional)
 * - Process state monitoring: Check if process is still alive
 *
 * Key principle: "silence=timeout" is ABOLISHED.
 * Process is only terminated when:
 * 1. Interactive prompt detected (Property 34-36)
 * 2. Overall timeout exceeded (safety net)
 * 3. Process dies naturally
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
exports.ClaudeCodeExecutor = void 0;
exports.buildSanitizedEnv = buildSanitizedEnv;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const executor_output_stream_1 = require("./executor-output-stream");
/**
 * Interactive prompt patterns for blocking detection
 * Per spec 10_REPL_UX.md Section 10.1.1: Property 34 detection patterns
 *
 * Extended patterns for Claude Code CLI (v2):
 * - Question marks at end of line
 * - Yes/No confirmations
 * - Press enter prompts
 * - Waiting for input indicators
 * - Permission prompts
 * - API key prompts
 */
const INTERACTIVE_PROMPT_PATTERNS = [
    /\?\s*$/m, // "? " at end of line
    /\[Y\/n\]/i, // [Y/n] confirmation
    /\(yes\/no\)/i, // (yes/no) confirmation
    /\[y\/N\]/i, // [y/N] confirmation
    /continue\?\s*$/mi, // "continue?" prompt
    /press enter/i, // Press enter prompt
    /waiting for input/i, // Waiting for input
    /\(y\/n\)/i, // (y/n) confirmation
    /\[yes\/no\]/i, // [yes/no] confirmation
    /enter your/i, // Enter your... prompt
    /provide.*key/i, // API key prompts
    /paste.*key/i, // Paste key prompts
    /permission.*required/i, // Permission prompts
    /authorize/i, // Authorization prompts
    /approve\?/i, // Approval prompts
    /confirm\?/i, // Confirmation prompts
    /select.*option/i, // Selection prompts
    /choose.*:/i, // Choice prompts
    /which.*\?/i, // Which... prompts
    /would you like/i, // "Would you like..." prompts
    /do you want/i, // "Do you want..." prompts
];
/**
 * Timeout configuration (v3 - AC B: Abolish silence=timeout)
 *
 * SOFT_TIMEOUT: Log warning but continue (Claude might be thinking)
 * HARD_TIMEOUT: ABOLISHED - silence does NOT terminate process
 * OVERALL_TIMEOUT: Total execution time limit (safety net)
 *
 * Design principle: "Let the LLM work, don't preemptively kill"
 * - Silence is NOT a reason to terminate
 * - LLM may be processing complex tasks internally
 * - Only overall timeout provides a safety net (default: very long)
 * - Interactive prompt detection still works (Property 34-36)
 */
const DEFAULT_SOFT_TIMEOUT_MS = 60000; // 60s - warning only (for logging)
const DEFAULT_SILENCE_LOG_INTERVAL_MS = 30000; // 30s - log silence (not terminate)
const DEFAULT_OVERALL_TIMEOUT_MS = 600000; // 10 min total (increased safety net)
/**
 * Grace period before force kill after SIGTERM
 */
const SIGTERM_GRACE_MS = 5000;
/**
 * ALLOWLIST of environment variables to pass to child process
 * Per spec/15_API_KEY_ENV_SANITIZE.md: Only these variables are permitted.
 * This ensures API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) are never
 * passed to the subprocess, implementing Property 24 (API Key Secrecy).
 *
 * DELETELIST approach is PROHIBITED - new API keys would slip through.
 */
const ENV_ALLOWLIST = [
    'PATH', // Required for execution
    'HOME', // Home directory
    'USER', // Username
    'SHELL', // Shell
    'LANG', // Language setting
    'LC_ALL', // Locale
    'LC_CTYPE', // Character type
    'TERM', // Terminal type
    'TMPDIR', // Temp directory
    'XDG_CONFIG_HOME', // XDG config directory
    'XDG_DATA_HOME', // XDG data directory
    'XDG_CACHE_HOME', // XDG cache directory
    'NODE_ENV', // Node.js environment
    'DEBUG', // Debug flag (optional)
];
/**
 * Build sanitized environment from ALLOWLIST
 * Per spec/15_API_KEY_ENV_SANITIZE.md: Never pass process.env directly.
 *
 * @returns Record containing only ALLOWLIST variables
 */
function buildSanitizedEnv() {
    const sanitizedEnv = {};
    for (const key of ENV_ALLOWLIST) {
        if (process.env[key] !== undefined) {
            sanitizedEnv[key] = process.env[key];
        }
    }
    return sanitizedEnv;
}
/**
 * Process state check interval
 */
const PROCESS_CHECK_INTERVAL_MS = 1000;
/**
 * Check if output contains interactive prompt patterns
 */
function containsInteractivePrompt(output) {
    return INTERACTIVE_PROMPT_PATTERNS.some(pattern => pattern.test(output));
}
/**
 * Claude Code Executor class
 *
 * Spawns Claude Code CLI to execute natural language tasks.
 * Fail-closed: If CLI is not available, returns error status.
 * Property 34-36: Detects blocking in non-interactive mode and terminates.
 *
 * v2 Improvements:
 * - Two-stage timeout (soft/hard)
 * - Process state monitoring
 * - Extended interactive prompt detection
 * - Better error recovery
 */
class ClaudeCodeExecutor {
    config;
    cliPath;
    softTimeoutMs;
    silenceLogIntervalMs;
    verbose;
    disableOverallTimeout;
    progressAwareTimeout;
    constructor(config) {
        this.config = config;
        this.cliPath = config.cliPath || 'claude';
        // Allow environment variable override for testing
        const envSoft = parseInt(process.env.SOFT_TIMEOUT_MS || '', 10);
        const envSilenceLog = parseInt(process.env.SILENCE_LOG_INTERVAL_MS || '', 10);
        this.softTimeoutMs = envSoft || config.softTimeoutMs || DEFAULT_SOFT_TIMEOUT_MS;
        this.silenceLogIntervalMs = envSilenceLog || config.silenceLogIntervalMs || DEFAULT_SILENCE_LOG_INTERVAL_MS;
        this.verbose = config.verbose ?? false;
        this.disableOverallTimeout = config.disableOverallTimeout ?? false;
        this.progressAwareTimeout = config.progressAwareTimeout ?? false;
    }
    /**
     * Log message if verbose mode is enabled
     */
    log(message) {
        if (this.verbose) {
            console.log(message);
        }
    }
    /**
     * Check if Claude Code CLI is available
     *
     * @returns true if CLI is available, false otherwise
     */
    async isClaudeCodeAvailable() {
        return new Promise((resolve) => {
            try {
                // Per spec/15_API_KEY_ENV_SANITIZE.md: Use ALLOWLIST approach even for version check
                const childProcess = (0, child_process_1.spawn)(this.cliPath, ['--version'], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    timeout: 5000,
                    env: buildSanitizedEnv(),
                });
                childProcess.on('close', (code) => {
                    resolve(code === 0);
                });
                childProcess.on('error', () => {
                    resolve(false);
                });
                // Handle timeout
                setTimeout(() => {
                    childProcess.kill();
                    resolve(false);
                }, 5000);
            }
            catch {
                resolve(false);
            }
        });
    }
    /**
     * Check Claude Code CLI auth status
     * Per spec/15_API_KEY_ENV_SANITIZE.md: Runner must check login status at startup
     *
     * This method checks:
     * 1. CLI exists (version check)
     * 2. CLI is logged in (can run minimal prompt without auth error)
     *
     * @returns AuthCheckResult with availability and login status
     */
    async checkAuthStatus() {
        // First check if CLI is available
        const available = await this.isClaudeCodeAvailable();
        if (!available) {
            return {
                available: false,
                loggedIn: false,
                error: `Claude Code CLI not found at: ${this.cliPath}`,
            };
        }
        // CLI is available, now check if logged in
        // We'll run a minimal test by trying to run with --print and detect auth errors
        // Using a very short timeout and echo-like prompt to minimize API usage
        return new Promise((resolve) => {
            try {
                // Use --print with a simple prompt that should be very fast
                // If not logged in, we should get an auth error quickly
                const childProcess = (0, child_process_1.spawn)(this.cliPath, [
                    '--print',
                    '--dangerously-skip-permissions',
                    '--no-session-persistence',
                    'echo test', // Minimal prompt
                ], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    timeout: 15000, // 15 second timeout for auth check
                    env: {
                        ...buildSanitizedEnv(),
                        CI: 'true',
                        NO_COLOR: '1',
                        FORCE_COLOR: '0',
                    },
                });
                let stderr = '';
                let stdout = '';
                childProcess.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });
                childProcess.stderr?.on('data', (data) => {
                    stderr += data.toString();
                });
                // Close stdin immediately
                childProcess.stdin?.end();
                childProcess.on('close', (code) => {
                    // Check for authentication-related errors in stderr or stdout
                    const combinedOutput = (stderr + stdout).toLowerCase();
                    // Common auth error patterns
                    const authErrorPatterns = [
                        'not logged in',
                        'login required',
                        'authentication required',
                        'authentication failed',
                        'unauthorized',
                        'invalid token',
                        'expired token',
                        'please log in',
                        'need to log in',
                        'sign in',
                        'authenticate',
                        'api key',
                        'subscription required',
                        'no subscription',
                    ];
                    const hasAuthError = authErrorPatterns.some(pattern => combinedOutput.includes(pattern));
                    if (hasAuthError) {
                        resolve({
                            available: true,
                            loggedIn: false,
                            error: 'Claude Code CLI not logged in. Please run: claude setup-token',
                        });
                    }
                    else if (code === 0) {
                        // Successful execution means logged in
                        resolve({
                            available: true,
                            loggedIn: true,
                        });
                    }
                    else if (code === 137) {
                        // Exit code 137 = 128 + 9 (SIGKILL)
                        // Per spec/15: Fail-closed for process termination during auth check
                        // This typically means the process was killed externally (e.g., previous session cleanup)
                        resolve({
                            available: true,
                            loggedIn: false,
                            error: `Auth check process killed (exit 137 / SIGKILL). Please retry.`,
                        });
                    }
                    else {
                        // Non-zero exit but no auth error - might be other issue
                        // For now, assume logged in but with other problems
                        // (fail-open for non-auth errors to allow execution)
                        resolve({
                            available: true,
                            loggedIn: true,
                            error: `CLI exited with code ${code}: ${stderr}`,
                        });
                    }
                });
                childProcess.on('error', (err) => {
                    resolve({
                        available: true,
                        loggedIn: false,
                        error: `Error checking auth status: ${err.message}`,
                    });
                });
                // Timeout handling
                setTimeout(() => {
                    if (!childProcess.killed) {
                        childProcess.kill();
                        // Timeout could mean many things, assume logged in (fail-open for timeout)
                        resolve({
                            available: true,
                            loggedIn: true,
                            error: 'Auth check timed out (assuming logged in)',
                        });
                    }
                }, 15000);
            }
            catch (err) {
                const error = err;
                resolve({
                    available: true,
                    loggedIn: false,
                    error: `Error checking auth: ${error.message}`,
                });
            }
        });
    }
    /**
     * Execute a task via Claude Code CLI
     *
     * Fail-closed behavior:
     * - If CLI not available → error status
     * - If no files modified → INCOMPLETE status
     * - If timeout → error status
     *
     * v2 Timeout behavior:
     * - Soft timeout: Warning only, continue execution
     * - Hard timeout: No output for extended period, terminate
     * - Overall timeout: Total execution time limit
     *
     * @param task - Task to execute
     * @returns Execution result
     */
    async execute(task) {
        const startTime = Date.now();
        // Enforce cwd = projectPath (never use process.cwd())
        const cwd = task.workingDir;
        // AC A.2: Real-time output streaming - emit preflight logs
        const preflightStream = (0, executor_output_stream_1.getExecutorOutputStream)();
        preflightStream.emit(task.id, 'preflight', '[preflight] start');
        // P0-2: Preflight check - fail-closed BEFORE execution starts
        // Per AC P0-2: Auth errors must NEVER result in TIMEOUT - must be ERROR with recovery steps
        const authResult = await this.checkAuthStatus();
        if (!authResult.available) {
            // CLI not available - return ERROR (not TIMEOUT/BLOCKED)
            preflightStream.emit(task.id, 'preflight', `[preflight] CLI NOT FOUND at ${this.cliPath}`);
            preflightStream.emit(task.id, 'recovery', `[recovery] Install Claude Code CLI`);
            return {
                executed: false,
                output: '',
                error: `Preflight check failed: CLI not available. ${authResult.error || ''}`,
                files_modified: [],
                duration_ms: Date.now() - startTime,
                status: 'ERROR',
                cwd,
                verified_files: [],
                unverified_files: [],
                // P0-2: Include preflight failure info for Web UI
                executor_blocked: false,
                blocked_reason: 'PREFLIGHT_CLI_NOT_AVAILABLE',
                terminated_by: 'PREFLIGHT_FAIL_CLOSED',
            };
        }
        preflightStream.emit(task.id, 'preflight', '[preflight] cli found');
        if (!authResult.loggedIn) {
            // CLI available but not logged in - return ERROR (not TIMEOUT/BLOCKED)
            preflightStream.emit(task.id, 'preflight', '[preflight] NOT LOGGED IN → ERROR');
            preflightStream.emit(task.id, 'recovery', '[recovery] claude login / claude setup-token / set ANTHROPIC_API_KEY');
            const recoverySteps = [
                'Run: claude login',
                'Or run: claude setup-token',
                'Or set ANTHROPIC_API_KEY environment variable',
            ].join('\n  - ');
            return {
                executed: false,
                output: '',
                error: `Preflight check failed: CLI not logged in. ${authResult.error || ''}\n\nRecovery steps:\n  - ${recoverySteps}`,
                files_modified: [],
                duration_ms: Date.now() - startTime,
                status: 'ERROR',
                cwd,
                verified_files: [],
                unverified_files: [],
                // P0-2: Include preflight failure info for Web UI
                executor_blocked: false,
                blocked_reason: 'PREFLIGHT_AUTH_FAILED',
                terminated_by: 'PREFLIGHT_FAIL_CLOSED',
            };
        }
        preflightStream.emit(task.id, 'preflight', '[preflight] login OK');
        // Get list of files before execution (for diff)
        const filesBefore = await this.listFiles(task.workingDir);
        return new Promise((resolve) => {
            let output = '';
            let errorOutput = '';
            let timedOut = false;
            let blocked = false;
            let blockedReason;
            let terminatedBy;
            let lastOutputTime = Date.now();
            let softTimeoutWarned = false;
            let resolved = false;
            // Placeholder for child process (assigned after spawn)
            let childProcess;
            // Timer handles (v3 - AC B: no hard timeout, only overall safety net)
            let overallTimeoutHandle = null;
            let processCheckHandle = null;
            let silenceLogHandle = null;
            // Progress log slot tracking (slot 0 = 5-15s, slot 1 = 15-25s, etc.)
            let lastProgressSlot = -1;
            // AC A.2: Real-time output streaming
            const outputStream = (0, executor_output_stream_1.getExecutorOutputStream)();
            outputStream.startTask(task.id);
            // Helper to safely resolve (prevent double resolution)
            const safeResolve = (result) => {
                if (resolved)
                    return;
                resolved = true;
                clearAllTimers();
                // AC A.2: Mark task as ended in output stream with status-aware message
                const success = result.status === 'COMPLETE';
                outputStream.endTask(task.id, success, undefined, result.status);
                resolve(result);
            };
            // Helper to clear all timers (v3 - AC B: no hard timeout)
            const clearAllTimers = () => {
                if (overallTimeoutHandle) {
                    clearTimeout(overallTimeoutHandle);
                    overallTimeoutHandle = null;
                }
                if (processCheckHandle) {
                    clearInterval(processCheckHandle);
                    processCheckHandle = null;
                }
                if (silenceLogHandle) {
                    clearInterval(silenceLogHandle);
                    silenceLogHandle = null;
                }
            };
            // Helper to terminate process with blocking status
            const terminateWithBlocking = (reason, terminator) => {
                if (blocked || resolved)
                    return; // Already blocked or resolved
                blocked = true;
                blockedReason = reason;
                terminatedBy = terminator;
                this.log(`[ClaudeCodeExecutor] Terminating: reason=${reason}, by=${terminator}`);
                if (childProcess && !childProcess.killed) {
                    childProcess.kill('SIGTERM');
                    // Force kill after grace period
                    setTimeout(() => {
                        if (childProcess && !childProcess.killed) {
                            this.log('[ClaudeCodeExecutor] Force killing with SIGKILL');
                            childProcess.kill('SIGKILL');
                        }
                    }, SIGTERM_GRACE_MS);
                }
            };
            // Overall timeout scheduler (supports progress-aware reset)
            const scheduleOverallTimeout = () => {
                if (this.disableOverallTimeout)
                    return;
                if (overallTimeoutHandle) {
                    clearTimeout(overallTimeoutHandle);
                }
                overallTimeoutHandle = setTimeout(() => {
                    if (!blocked && !timedOut && !resolved) {
                        const modeLabel = this.progressAwareTimeout ? 'NO PROGRESS' : 'OVERALL';
                        this.log(`[ClaudeCodeExecutor] Overall timeout (${modeLabel}) - execution exceeded ${this.config.timeout}ms`);
                        outputStream.emit(task.id, 'timeout', `[timeout] ${modeLabel} TIMEOUT exceeded ${this.config.timeout}ms - terminating`);
                        timedOut = true;
                        terminateWithBlocking('TIMEOUT', 'TIMEOUT');
                    }
                }, this.config.timeout);
            };
            // Update last output time on any output (v3 - AC B: no hard timeout, just track)
            const updateLastOutputTime = () => {
                lastOutputTime = Date.now();
                // Progress-aware timeout: reset overall timeout window on any output activity
                if (this.progressAwareTimeout && !this.disableOverallTimeout) {
                    scheduleOverallTimeout();
                }
                // Check for soft timeout warning (only once, for logging purposes)
                if (!softTimeoutWarned) {
                    const timeSinceStart = Date.now() - startTime;
                    if (timeSinceStart > this.softTimeoutMs) {
                        softTimeoutWarned = true;
                        this.log(`[ClaudeCodeExecutor] Soft timeout warning - execution taking longer than ${this.softTimeoutMs}ms`);
                    }
                }
            };
            // Spawn Claude Code CLI with the task prompt
            // Using --print flag for non-interactive output
            // --tools enables Write/Edit/Read/Bash for file operations
            // --no-session-persistence avoids session issues in non-interactive mode
            //
            // IMPORTANT: User prompt is passed as-is. Runner performs fail-closed
            // verification AFTER execution (Property 8: Runner is sole completion authority).
            // Claude Code output is untrusted until Runner verifies files exist on disk.
            const cliArgs = [
                '--print',
                '--dangerously-skip-permissions',
                '--tools', 'Write,Edit,Read,Bash',
                '--no-session-persistence',
            ];
            // Per spec 10_REPL_UX.md L117-118: Model selection is REPL-local
            // Pass model to Claude Code CLI if specified (thin wrapper: no validation)
            if (task.selectedModel) {
                cliArgs.push('--model', task.selectedModel);
            }
            // Add prompt last (positional argument)
            cliArgs.push(task.prompt);
            // DEBUG: Log prompt and model sent to Claude Code
            this.log(`[ClaudeCodeExecutor] prompt: ${task.prompt}`);
            if (task.selectedModel) {
                this.log(`[ClaudeCodeExecutor] model: ${task.selectedModel}`);
            }
            this.log(`[ClaudeCodeExecutor] Timeout config: soft=${this.softTimeoutMs}ms, silenceLog=${this.silenceLogIntervalMs}ms, overall=${this.disableOverallTimeout ? 'DISABLED' : this.config.timeout + 'ms'}, progressAware=${this.progressAwareTimeout} (v3: silence=timeout ABOLISHED)`);
            // AC A.2: Emit spawn trace before process creation
            outputStream.emit(task.id, 'spawn', `[spawn] start`);
            outputStream.emit(task.id, 'spawn', `[spawn] command: ${this.cliPath} ${cliArgs.slice(0, -1).join(' ')} <prompt>`);
            outputStream.emit(task.id, 'spawn', `[spawn] cwd: ${cwd}`);
            outputStream.emit(task.id, 'spawn', `[spawn] timeout: soft=${this.softTimeoutMs}ms overall=${this.disableOverallTimeout ? 'DISABLED' : this.config.timeout + 'ms'}`);
            try {
                // Per spec/15_API_KEY_ENV_SANITIZE.md: Use ALLOWLIST approach
                // NEVER pass process.env directly (DELETELIST approach is PROHIBITED)
                const sanitizedEnv = buildSanitizedEnv();
                childProcess = (0, child_process_1.spawn)(this.cliPath, cliArgs, {
                    cwd: task.workingDir,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: {
                        ...sanitizedEnv,
                        // Ensure non-interactive mode
                        CI: 'true',
                        // Disable color output for cleaner parsing
                        NO_COLOR: '1',
                        FORCE_COLOR: '0',
                    },
                });
            }
            catch (spawnError) {
                const err = spawnError;
                outputStream.emit(task.id, 'spawn', `[spawn] FAILED: ${err.message}`);
                this.log(`[ClaudeCodeExecutor] Spawn failed: ${err.message}`);
                safeResolve({
                    executed: false,
                    output: '',
                    error: `Failed to spawn Claude Code CLI: ${err.message}`,
                    files_modified: [],
                    duration_ms: Date.now() - startTime,
                    status: 'ERROR',
                    cwd,
                    verified_files: [],
                    unverified_files: [],
                });
                return;
            }
            // Log PID after successful spawn
            outputStream.emit(task.id, 'spawn', `[spawn] pid: ${childProcess.pid ?? 'unknown'}`);
            // Initialize last output time
            updateLastOutputTime();
            // Start overall timeout (safety net, can be disabled)
            // v3 - AC B: This is the ONLY timeout that can terminate the process
            // Silence alone does NOT terminate unless progress-aware timeout is enabled
            if (!this.disableOverallTimeout) {
                scheduleOverallTimeout();
            }
            // Start silence logging (v3 - AC B: log only, do NOT terminate)
            silenceLogHandle = setInterval(() => {
                if (resolved || blocked || timedOut) {
                    return;
                }
                const silentTime = Date.now() - lastOutputTime;
                if (silentTime >= this.silenceLogIntervalMs) {
                    const totalTime = Date.now() - startTime;
                    this.log(`[ClaudeCodeExecutor] Silent for ${Math.round(silentTime / 1000)}s (total: ${Math.round(totalTime / 1000)}s) - continuing execution`);
                    outputStream.emit(task.id, 'timeout', `[timeout] silent=${Math.round(silentTime / 1000)}s total=${Math.round(totalTime / 1000)}s (continuing)`);
                }
            }, this.silenceLogIntervalMs);
            // Start process state monitoring
            processCheckHandle = setInterval(() => {
                if (resolved || blocked || timedOut) {
                    if (processCheckHandle) {
                        clearInterval(processCheckHandle);
                        processCheckHandle = null;
                    }
                    return;
                }
                // Check if process is still alive
                if (childProcess.killed || childProcess.exitCode !== null) {
                    // Process has exited, stop monitoring
                    if (processCheckHandle) {
                        clearInterval(processCheckHandle);
                        processCheckHandle = null;
                    }
                    return;
                }
                // Check time since last output
                const silentTime = Date.now() - lastOutputTime;
                const totalTime = Date.now() - startTime;
                // Slot-based progress log to stderr (5s, 15s, 25s, ...)
                // slot 0 = 5-15s, slot 1 = 15-25s, etc.
                const FIRST_WARN_MS = 5000;
                const SLOT_INTERVAL_MS = 10000;
                if (silentTime >= FIRST_WARN_MS) {
                    const currentSlot = Math.floor((silentTime - FIRST_WARN_MS) / SLOT_INTERVAL_MS);
                    if (currentSlot > lastProgressSlot) {
                        lastProgressSlot = currentSlot;
                        process.stderr.write(`[executor] silent=${Math.round(silentTime / 1000)}s total=${Math.round(totalTime / 1000)}s\n`);
                        outputStream.emit(task.id, 'timeout', `[timeout] silent=${Math.round(silentTime / 1000)}s total=${Math.round(totalTime / 1000)}s`);
                    }
                }
            }, PROCESS_CHECK_INTERVAL_MS);
            // CRITICAL: Close stdin immediately to signal no more input
            // Without this, Claude Code CLI may wait indefinitely for input
            if (childProcess.stdin) {
                childProcess.stdin.end();
            }
            // Collect stdout and check for interactive prompts (Property 34)
            childProcess.stdout?.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                // AC A.2: Stream to subscribers
                outputStream.emit(task.id, 'stdout', chunk);
                // Reset hard timeout on any output
                updateLastOutputTime();
                // Check for interactive prompt patterns (Property 34)
                if (!blocked && containsInteractivePrompt(chunk)) {
                    this.log('[ClaudeCodeExecutor] Interactive prompt detected in chunk - terminating');
                    this.log(`[ClaudeCodeExecutor] Detected chunk: ${chunk.substring(0, 200)}`);
                    terminateWithBlocking('INTERACTIVE_PROMPT', 'REPL_FAIL_CLOSED');
                }
            });
            // Collect stderr
            childProcess.stderr?.on('data', (data) => {
                const chunk = data.toString();
                errorOutput += chunk;
                // AC A.2: Stream to subscribers
                outputStream.emit(task.id, 'stderr', chunk);
                // Also reset hard timeout on stderr output (CLI is still producing output)
                updateLastOutputTime();
                // Also check stderr for interactive prompts
                if (!blocked && containsInteractivePrompt(chunk)) {
                    this.log('[ClaudeCodeExecutor] Interactive prompt detected in stderr - terminating');
                    terminateWithBlocking('INTERACTIVE_PROMPT', 'REPL_FAIL_CLOSED');
                }
            });
            // Handle completion
            childProcess.on('close', async (code) => {
                const duration_ms = Date.now() - startTime;
                this.log(`[ClaudeCodeExecutor] Process closed: code=${code}, duration=${duration_ms}ms, blocked=${blocked}, timedOut=${timedOut}`);
                // Handle blocked case (Property 34-36)
                if (blocked) {
                    safeResolve({
                        executed: false,
                        output,
                        error: `Executor blocked: ${blockedReason}`,
                        files_modified: [],
                        duration_ms,
                        status: 'BLOCKED',
                        cwd,
                        verified_files: [],
                        unverified_files: [],
                        executor_blocked: true,
                        blocked_reason: blockedReason,
                        timeout_ms: duration_ms,
                        terminated_by: terminatedBy,
                    });
                    return;
                }
                if (timedOut) {
                    safeResolve({
                        executed: false,
                        output,
                        error: `Execution timed out after ${this.config.timeout}ms`,
                        files_modified: [],
                        duration_ms,
                        status: 'BLOCKED',
                        cwd,
                        verified_files: [],
                        unverified_files: [],
                        executor_blocked: true,
                        blocked_reason: 'TIMEOUT',
                        timeout_ms: duration_ms,
                        terminated_by: 'TIMEOUT',
                    });
                    return;
                }
                // Get files after execution
                const filesAfter = await this.listFiles(task.workingDir);
                // Detect modified/created files
                const files_modified = this.detectModifiedFiles(filesBefore, filesAfter, task.workingDir);
                // Verify files actually exist (fail-closed verification)
                // Per Property 8: verified_files is sole completion authority
                const verified_files = [];
                const unverified_files = [];
                // Helper function to add a file to verified_files
                const addVerifiedFile = (relPath, fullPath) => {
                    // Skip if already in verified_files
                    if (verified_files.some(vf => vf.path === relPath)) {
                        return false;
                    }
                    try {
                        if (fs.existsSync(fullPath)) {
                            const stat = fs.statSync(fullPath);
                            let content_preview;
                            // Get preview for text files (first 100 chars)
                            if (stat.size < 10000) {
                                try {
                                    const content = fs.readFileSync(fullPath, 'utf-8');
                                    content_preview = content.substring(0, 100);
                                }
                                catch {
                                    // Binary file or encoding issue
                                }
                            }
                            verified_files.push({
                                path: relPath,
                                exists: true,
                                size: stat.size,
                                content_preview,
                            });
                            return true;
                        }
                        return false;
                    }
                    catch {
                        return false;
                    }
                };
                // Step 1: Verify files from diff detection (files_modified)
                for (const relPath of files_modified) {
                    const fullPath = path.join(cwd, relPath);
                    if (!addVerifiedFile(relPath, fullPath)) {
                        // File was detected as modified but doesn't exist (fail-closed)
                        unverified_files.push(relPath);
                    }
                }
                // Step 2: Independent disk verification (Property 8)
                // Scan for NEW files that weren't in filesBefore
                // This handles timing issues where diff detection misses files
                for (const [filePath] of filesAfter) {
                    // Only check files that are NEW (not in filesBefore)
                    if (!filesBefore.has(filePath)) {
                        const relPath = path.relative(cwd, filePath);
                        addVerifiedFile(relPath, filePath);
                    }
                }
                // Determine status based on outcome (fail-closed)
                // Per Property 8: verified_files is the sole completion authority
                let status;
                if (code !== 0) {
                    // Non-zero exit code indicates error
                    status = 'ERROR';
                }
                else if (unverified_files.length > 0) {
                    // Fail-closed: Some files claimed but don't exist
                    status = 'NO_EVIDENCE';
                }
                else if (verified_files.some(vf => vf.exists)) {
                    // Property 8: Runner's disk verification (verified_files) is the final authority
                    // If any verified file exists on disk, task is COMPLETE
                    status = 'COMPLETE';
                }
                else {
                    // Fail-closed: No verified files with exists=true
                    // READ_INFO/REPORT tasks: Generate evidence file from response output
                    if (task.taskType === 'READ_INFO' || task.taskType === 'REPORT') {
                        // Create evidence directory and file
                        const evidenceDir = path.join(cwd, '.claude', 'evidence');
                        const evidenceFileName = `task-${task.id}.md`;
                        const evidencePath = path.join(evidenceDir, evidenceFileName);
                        try {
                            // Ensure evidence directory exists
                            fs.mkdirSync(evidenceDir, { recursive: true });
                            // Generate evidence content from response
                            const evidenceContent = [
                                `# Evidence: Task ${task.id}`,
                                ``,
                                `**Task Type:** ${task.taskType}`,
                                `**Executed At:** ${new Date().toISOString()}`,
                                `**Duration:** ${duration_ms}ms`,
                                ``,
                                `## Response Output`,
                                ``,
                                '```',
                                output.substring(0, 10000), // Limit to 10KB
                                '```',
                                ``,
                                `---`,
                                `*Auto-generated evidence for ${task.taskType} task completion*`,
                            ].join('\n');
                            // Write evidence file
                            fs.writeFileSync(evidencePath, evidenceContent, 'utf-8');
                            // Add evidence file to verified_files
                            const relPath = path.relative(cwd, evidencePath);
                            const stat = fs.statSync(evidencePath);
                            verified_files.push({
                                path: relPath,
                                exists: true,
                                size: stat.size,
                                content_preview: evidenceContent.substring(0, 100),
                            });
                            this.log(`[ClaudeCodeExecutor] READ_INFO/REPORT: Generated evidence file ${relPath}`);
                            status = 'COMPLETE';
                        }
                        catch (evidenceError) {
                            this.log(`[ClaudeCodeExecutor] Failed to generate evidence file: ${evidenceError.message}`);
                            status = 'NO_EVIDENCE';
                        }
                    }
                    else if (output.includes('Created') || output.includes('Updated') || output.includes('Modified')) {
                        status = 'INCOMPLETE'; // Claimed success but no file evidence
                    }
                    else {
                        status = 'NO_EVIDENCE';
                    }
                }
                this.log(`[ClaudeCodeExecutor] Result: status=${status}, verified=${verified_files.length}, unverified=${unverified_files.length}`);
                safeResolve({
                    executed: code === 0,
                    output,
                    error: errorOutput || undefined,
                    files_modified,
                    duration_ms,
                    status,
                    cwd,
                    verified_files,
                    unverified_files,
                });
            });
            // Handle spawn errors
            childProcess.on('error', (err) => {
                this.log(`[ClaudeCodeExecutor] Process error: ${err.message}`);
                safeResolve({
                    executed: false,
                    output: output || '',
                    error: err.message,
                    files_modified: [],
                    duration_ms: Date.now() - startTime,
                    status: 'ERROR',
                    cwd,
                    verified_files: [],
                    unverified_files: [],
                });
            });
        });
    }
    /**
     * List all files in a directory (recursively)
     */
    async listFiles(dir) {
        const files = new Map();
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                // Skip hidden files and node_modules
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    continue;
                }
                if (entry.isFile()) {
                    try {
                        const stat = fs.statSync(fullPath);
                        files.set(fullPath, {
                            mtime: stat.mtimeMs,
                            size: stat.size,
                        });
                    }
                    catch {
                        // File may have been deleted during scan
                    }
                }
                else if (entry.isDirectory()) {
                    const subFiles = await this.listFiles(fullPath);
                    for (const [key, value] of subFiles) {
                        files.set(key, value);
                    }
                }
            }
        }
        catch {
            // Directory may not exist or be inaccessible
        }
        return files;
    }
    /**
     * Detect files that were modified or created
     */
    detectModifiedFiles(before, after, baseDir) {
        const modified = [];
        for (const [filePath, afterStat] of after) {
            const beforeStat = before.get(filePath);
            // New file
            if (!beforeStat) {
                modified.push(path.relative(baseDir, filePath));
                continue;
            }
            // Modified file (mtime or size changed)
            if (beforeStat.mtime !== afterStat.mtime || beforeStat.size !== afterStat.size) {
                modified.push(path.relative(baseDir, filePath));
            }
        }
        return modified;
    }
}
exports.ClaudeCodeExecutor = ClaudeCodeExecutor;
//# sourceMappingURL=claude-code-executor.js.map