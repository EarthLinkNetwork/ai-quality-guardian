"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunnerControlsRoutes = createRunnerControlsRoutes;
exports.getRunnerProcess = getRunnerProcess;
exports.setRunnerProcess = setRunnerProcess;
const express_1 = require("express");
const child_process_1 = require("child_process");
const util_1 = require("util");
const executor_preflight_1 = require("../../diagnostics/executor-preflight");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const DEFAULT_CONFIG = {
    buildScript: 'build',
    startScript: 'start',
    buildTimeoutMs: 300_000,
    stopTimeoutMs: 30_000,
};
/**
 * Active runner process (for selfhost mode)
 */
let runnerProcess = null;
let runnerStartTime = null;
/**
 * Creates router for runner control endpoints
 *
 * @param config - Runner controls configuration
 * @returns Express router
 */
function createRunnerControlsRoutes(config) {
    const router = (0, express_1.Router)();
    const settings = { ...DEFAULT_CONFIG, ...config };
    const { processSupervisor } = config;
    // ===================
    // GET /api/runner/status
    // ===================
    router.get('/status', (_req, res) => {
        // Use ProcessSupervisor if available (AC-OPS-2, AC-OPS-3)
        if (processSupervisor) {
            const state = processSupervisor.getState();
            const buildMeta = processSupervisor.getBuildMeta();
            const status = {
                isRunning: state.status === 'running',
                pid: state.pid ?? undefined,
                uptime_ms: state.startTime ? Date.now() - state.startTime.getTime() : undefined,
                build_sha: buildMeta?.build_sha,
                build_timestamp: buildMeta?.build_timestamp,
            };
            res.json(status);
            return;
        }
        // Fallback to module-level variables
        // E1-2 Fix: In selfhost mode, if web is responding, it IS running
        // The web server itself is the runner in this mode
        const hasRunnerProcess = runnerProcess !== null && !runnerProcess.killed;
        const status = {
            // If we have a runner process, use it; otherwise web is serving (selfhost mode)
            isRunning: hasRunnerProcess || true, // Web is always running if API responds
            pid: runnerProcess?.pid ?? process.pid, // Use current process.pid as fallback
            uptime_ms: runnerStartTime ? Date.now() - runnerStartTime.getTime() : undefined,
        };
        res.json(status);
    });
    // ===================
    // GET /api/runner/preflight
    // Per spec: Web UI must display executor configuration status
    // Fail-fast: All auth/config issues shown clearly, not as timeout
    // ===================
    router.get('/preflight', (_req, res) => {
        // Run preflight checks for auto-detection mode
        const executorType = 'auto';
        const report = (0, executor_preflight_1.runPreflightChecks)(executorType);
        // Return structured response for Web UI
        res.json({
            status: report.status,
            can_proceed: report.can_proceed,
            executor: report.executor,
            timestamp: report.timestamp,
            checks: report.checks.map(check => ({
                code: check.code,
                ok: check.ok,
                fatal: check.fatal,
                message: check.message,
                fix_hint: check.fix_hint,
            })),
            fatal_errors: report.fatal_errors.map(err => ({
                code: err.code,
                message: err.message,
                fix_hint: err.fix_hint,
            })),
            // Summary for UI display
            summary: report.can_proceed
                ? 'Executor configured and ready'
                : `Executor not configured: ${report.fatal_errors[0]?.message || 'Unknown error'}`,
        });
    });
    // ===================
    // POST /api/runner/stop
    // ===================
    router.post('/stop', async (_req, res) => {
        const startTime = Date.now();
        try {
            // Use ProcessSupervisor if available (AC-SUP-1)
            if (processSupervisor) {
                const result = await processSupervisor.stop();
                if (result.success) {
                    res.json({
                        success: true,
                        operation: 'stop',
                        message: 'Runner stopped successfully',
                        duration_ms: Date.now() - startTime,
                    });
                }
                else {
                    throw new Error(result.error || 'Stop failed');
                }
                return;
            }
            // Fallback to module-level process management
            if (!runnerProcess || runnerProcess.killed) {
                res.json({
                    success: true,
                    operation: 'stop',
                    message: 'Runner is not currently running',
                    duration_ms: Date.now() - startTime,
                });
                return;
            }
            // Send SIGTERM for graceful shutdown
            const stopPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    // Force kill if graceful shutdown fails
                    if (runnerProcess && !runnerProcess.killed) {
                        runnerProcess.kill('SIGKILL');
                    }
                    reject(new Error('Stop timeout - process forcefully killed'));
                }, settings.stopTimeoutMs);
                if (runnerProcess) {
                    runnerProcess.once('exit', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    runnerProcess.kill('SIGTERM');
                }
                else {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            await stopPromise;
            runnerProcess = null;
            runnerStartTime = null;
            res.json({
                success: true,
                operation: 'stop',
                message: 'Runner stopped successfully',
                duration_ms: Date.now() - startTime,
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            res.status(500).json({
                success: false,
                operation: 'stop',
                message: 'Failed to stop runner',
                error: err.message,
                duration_ms: Date.now() - startTime,
                nextActions: [
                    { label: 'Retry', action: 'retry' },
                    { label: 'View Logs', action: 'view_logs' },
                ],
            });
        }
    });
    // ===================
    // POST /api/runner/build
    // Per AC-OPS-3: Generates build_sha after successful build
    // ===================
    router.post('/build', async (_req, res) => {
        const startTime = Date.now();
        try {
            // Use ProcessSupervisor if available (AC-OPS-3)
            if (processSupervisor) {
                const result = await processSupervisor.build();
                if (result.success) {
                    res.json({
                        success: true,
                        operation: 'build',
                        message: 'Build completed successfully',
                        duration_ms: Date.now() - startTime,
                        output: result.output,
                        build_sha: result.buildMeta?.build_sha,
                        build_timestamp: result.buildMeta?.build_timestamp,
                    });
                }
                else {
                    throw new Error(result.error || 'Build failed');
                }
                return;
            }
            // Fallback to direct exec
            const { stdout, stderr } = await execAsync(`npm run ${settings.buildScript}`, {
                cwd: settings.projectRoot,
                timeout: settings.buildTimeoutMs,
            });
            res.json({
                success: true,
                operation: 'build',
                message: 'Build completed successfully',
                duration_ms: Date.now() - startTime,
                output: stdout + (stderr ? '\n' + stderr : ''),
            });
        }
        catch (error) {
            const err = error;
            res.status(500).json({
                success: false,
                operation: 'build',
                message: 'Build failed',
                error: err.message,
                output: (err.stdout || '') + '\n' + (err.stderr || ''),
                duration_ms: Date.now() - startTime,
                nextActions: [
                    { label: 'Retry', action: 'retry' },
                    { label: 'View Logs', action: 'view_logs' },
                    { label: 'Back', action: 'back' },
                ],
            });
        }
    });
    // ===================
    // POST /api/runner/restart
    // Per AC-OPS-2: Restart(REAL) = PID must change
    // Per AC-SUP-2: Build fail → no restart, preserve old process
    // ===================
    router.post('/restart', async (_req, res) => {
        const startTime = Date.now();
        const steps = [];
        try {
            // Use ProcessSupervisor if available (AC-OPS-2, AC-SUP-2)
            if (processSupervisor) {
                const result = await processSupervisor.restart({ build: true });
                if (result.success) {
                    res.json({
                        success: true,
                        operation: 'restart',
                        message: 'Restart completed successfully',
                        duration_ms: Date.now() - startTime,
                        output: JSON.stringify({
                            old_pid: result.oldPid,
                            new_pid: result.newPid,
                            pid_changed: result.oldPid !== result.newPid,
                            build_sha: result.buildMeta?.build_sha,
                            build_timestamp: result.buildMeta?.build_timestamp,
                        }, null, 2),
                        old_pid: result.oldPid,
                        new_pid: result.newPid,
                        build_sha: result.buildMeta?.build_sha,
                    });
                }
                else {
                    // AC-SUP-2: Build fail or restart fail - preserve old process
                    res.status(500).json({
                        success: false,
                        operation: 'restart',
                        message: 'Restart failed - old process preserved',
                        error: result.error,
                        duration_ms: Date.now() - startTime,
                        output: JSON.stringify({
                            old_pid: result.oldPid,
                            error: result.error,
                            old_process_preserved: true,
                        }, null, 2),
                        nextActions: [
                            { label: 'Retry', action: 'retry' },
                            { label: 'View Logs', action: 'view_logs' },
                            { label: 'Back', action: 'back' },
                        ],
                    });
                }
                return;
            }
            // Fallback to module-level process management
            // Step 1: Stop existing runner
            const stopStart = Date.now();
            if (runnerProcess && !runnerProcess.killed) {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        if (runnerProcess && !runnerProcess.killed) {
                            runnerProcess.kill('SIGKILL');
                        }
                        resolve();
                    }, settings.stopTimeoutMs);
                    if (runnerProcess) {
                        runnerProcess.once('exit', () => {
                            clearTimeout(timeout);
                            resolve();
                        });
                        runnerProcess.kill('SIGTERM');
                    }
                    else {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            }
            runnerProcess = null;
            runnerStartTime = null;
            steps.push({ step: 'stop', success: true, duration_ms: Date.now() - stopStart });
            // Step 2: Build
            const buildStart = Date.now();
            try {
                await execAsync(`npm run ${settings.buildScript}`, {
                    cwd: settings.projectRoot,
                    timeout: settings.buildTimeoutMs,
                });
                steps.push({ step: 'build', success: true, duration_ms: Date.now() - buildStart });
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                steps.push({ step: 'build', success: false, duration_ms: Date.now() - buildStart, error: err.message });
                throw new Error(`Build failed: ${err.message}`);
            }
            // Step 3: Start
            const startStep = Date.now();
            runnerProcess = (0, child_process_1.spawn)('npm', ['run', settings.startScript], {
                cwd: settings.projectRoot,
                detached: false,
                stdio: 'pipe',
            });
            runnerStartTime = new Date();
            // Wait a bit to ensure process started
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (runnerProcess.killed || runnerProcess.exitCode !== null) {
                throw new Error('Runner process exited immediately');
            }
            steps.push({ step: 'start', success: true, duration_ms: Date.now() - startStep });
            res.json({
                success: true,
                operation: 'restart',
                message: 'Restart completed successfully',
                duration_ms: Date.now() - startTime,
                output: JSON.stringify(steps, null, 2),
            });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            res.status(500).json({
                success: false,
                operation: 'restart',
                message: 'Restart failed',
                error: err.message,
                output: JSON.stringify(steps, null, 2),
                duration_ms: Date.now() - startTime,
                nextActions: [
                    { label: 'Retry', action: 'retry' },
                    { label: 'View Logs', action: 'view_logs' },
                    { label: 'Back', action: 'back' },
                ],
            });
        }
    });
    return router;
}
/**
 * Gets current runner process (for testing)
 */
function getRunnerProcess() {
    return runnerProcess;
}
/**
 * Sets runner process (for testing)
 */
function setRunnerProcess(process, startTime) {
    runnerProcess = process;
    runnerStartTime = startTime || (process ? new Date() : null);
}
//# sourceMappingURL=runner-controls.js.map