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

import { Router, Request, Response } from 'express';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { ProcessSupervisor, BuildMeta } from '../../supervisor/index';
import {
  runPreflightChecks,
  PreflightReport,
  ExecutorType,
} from '../../diagnostics/executor-preflight';

const execAsync = promisify(exec);

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
}

const DEFAULT_CONFIG: Required<Omit<RunnerControlsConfig, 'projectRoot' | 'processSupervisor'>> = {
  buildScript: 'build',
  startScript: 'start',
  buildTimeoutMs: 300_000,
  stopTimeoutMs: 30_000,
};

/**
 * Active runner process (for selfhost mode)
 */
let runnerProcess: ChildProcess | null = null;
let runnerStartTime: Date | null = null;

/**
 * Creates router for runner control endpoints
 *
 * @param config - Runner controls configuration
 * @returns Express router
 */
export function createRunnerControlsRoutes(config: RunnerControlsConfig): Router {
  const router = Router();
  const settings = { ...DEFAULT_CONFIG, ...config };
  const { processSupervisor } = config;

  // ===================
  // GET /api/runner/status
  // ===================
  router.get('/status', (_req: Request, res: Response) => {
    // Use ProcessSupervisor if available (AC-OPS-2, AC-OPS-3)
    if (processSupervisor) {
      const state = processSupervisor.getState();
      const buildMeta = processSupervisor.getBuildMeta();
      const status: RunnerStatus = {
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
    const status: RunnerStatus = {
      isRunning: runnerProcess !== null && !runnerProcess.killed,
      pid: runnerProcess?.pid,
      uptime_ms: runnerStartTime ? Date.now() - runnerStartTime.getTime() : undefined,
    };

    res.json(status);
  });

  // ===================
  // GET /api/runner/preflight
  // Per spec: Web UI must display executor configuration status
  // Fail-fast: All auth/config issues shown clearly, not as timeout
  // ===================
  router.get('/preflight', (_req: Request, res: Response) => {
    // Run preflight checks for auto-detection mode
    const executorType: ExecutorType = 'auto';
    const report: PreflightReport = runPreflightChecks(executorType);

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
  router.post('/stop', async (_req: Request, res: Response) => {
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
          } as RunnerControlResult);
        } else {
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
        } as RunnerControlResult);
        return;
      }

      // Send SIGTERM for graceful shutdown
      const stopPromise = new Promise<void>((resolve, reject) => {
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
        } else {
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
      } as RunnerControlResult);
    } catch (error) {
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
      } as RunnerControlResult);
    }
  });

  // ===================
  // POST /api/runner/build
  // Per AC-OPS-3: Generates build_sha after successful build
  // ===================
  router.post('/build', async (_req: Request, res: Response) => {
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
          } as RunnerControlResult & { build_sha?: string; build_timestamp?: string });
        } else {
          throw new Error(result.error || 'Build failed');
        }
        return;
      }

      // Fallback to direct exec
      const { stdout, stderr } = await execAsync(
        `npm run ${settings.buildScript}`,
        {
          cwd: settings.projectRoot,
          timeout: settings.buildTimeoutMs,
        }
      );

      res.json({
        success: true,
        operation: 'build',
        message: 'Build completed successfully',
        duration_ms: Date.now() - startTime,
        output: stdout + (stderr ? '\n' + stderr : ''),
      } as RunnerControlResult);
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
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
      } as RunnerControlResult);
    }
  });

  // ===================
  // POST /api/runner/restart
  // Per AC-OPS-2: Restart(REAL) = PID must change
  // Per AC-SUP-2: Build fail → no restart, preserve old process
  // ===================
  router.post('/restart', async (_req: Request, res: Response) => {
    const startTime = Date.now();
    const steps: Array<{ step: string; success: boolean; duration_ms: number; error?: string }> = [];

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
          } as RunnerControlResult & { old_pid?: number; new_pid?: number; build_sha?: string });
        } else {
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
          } as RunnerControlResult);
        }
        return;
      }

      // Fallback to module-level process management
      // Step 1: Stop existing runner
      const stopStart = Date.now();
      if (runnerProcess && !runnerProcess.killed) {
        await new Promise<void>((resolve, reject) => {
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
          } else {
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
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        steps.push({ step: 'build', success: false, duration_ms: Date.now() - buildStart, error: err.message });
        throw new Error(`Build failed: ${err.message}`);
      }

      // Step 3: Start
      const startStep = Date.now();
      runnerProcess = spawn('npm', ['run', settings.startScript], {
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
      } as RunnerControlResult);
    } catch (error) {
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
      } as RunnerControlResult);
    }
  });

  return router;
}

/**
 * Gets current runner process (for testing)
 */
export function getRunnerProcess(): ChildProcess | null {
  return runnerProcess;
}

/**
 * Sets runner process (for testing)
 */
export function setRunnerProcess(process: ChildProcess | null, startTime?: Date): void {
  runnerProcess = process;
  runnerStartTime = startTime || (process ? new Date() : null);
}
