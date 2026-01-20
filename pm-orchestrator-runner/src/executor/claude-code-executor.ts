/**
 * Claude Code Executor
 *
 * Executes tasks via Claude Code CLI subprocess.
 * Per spec 04_COMPONENTS.md: L2 Executor must use Claude Code CLI for task execution.
 * Per spec 10_REPL_UX.md Section 10: Non-interactive mode guarantees (Property 34-36).
 *
 * This is NOT a simulation - it actually spawns the `claude` CLI process.
 *
 * Timeout Design (v2 - Production Ready):
 * - SOFT_TIMEOUT: Warning only, continue execution
 * - HARD_TIMEOUT: No output for extended period, terminate
 * - OVERALL_TIMEOUT: Total execution time limit
 * - Process state monitoring: Check if process is still alive
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { BlockedReason, TerminatedBy } from '../models/enums';

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  projectPath: string;
  timeout: number;  // Overall timeout in ms
  cliPath?: string;  // Path to claude CLI, defaults to 'claude'
  // New timeout configuration options
  softTimeoutMs?: number;   // Warning threshold (default: 60000)
  hardTimeoutMs?: number;   // No-output terminate threshold (default: 120000)
}

/**
 * Task to execute
 *
 * Per spec 10_REPL_UX.md L117-118: Model selection is REPL-local.
 * The selectedModel is passed to Claude Code CLI via --model flag.
 * This is a "thin wrapper" - no prompt modification, no result interpretation.
 */
export interface ExecutorTask {
  id: string;
  prompt: string;
  workingDir: string;
  /** Model to use (from .claude/repl.json). Undefined means use CLI default. */
  selectedModel?: string;
}

/**
 * Verified file information
 */
export interface VerifiedFile {
  path: string;
  exists: boolean;
  size?: number;
  content_preview?: string;
}

/**
 * Execution result
 * Per spec 10_REPL_UX.md Section 10: Includes blocking detection info (Property 34-36)
 */
export interface ExecutorResult {
  executed: boolean;
  output: string;
  error?: string;
  files_modified: string[];
  duration_ms: number;
  status: 'COMPLETE' | 'INCOMPLETE' | 'NO_EVIDENCE' | 'ERROR' | 'BLOCKED';
  /** cwd used for execution - must be projectPath */
  cwd: string;
  /** Files that were verified to exist after execution */
  verified_files: VerifiedFile[];
  /** Files that were claimed but don't exist (fail-closed detection) */
  unverified_files: string[];
  /** Executor blocked in non-interactive mode (Property 34-36) */
  executor_blocked?: boolean;
  /** Blocking reason when executor_blocked is true */
  blocked_reason?: BlockedReason;
  /** Time until blocking was detected (ms) */
  timeout_ms?: number;
  /** How the executor was terminated */
  terminated_by?: TerminatedBy;
}

/**
 * Auth check result
 * Per spec/15_API_KEY_ENV_SANITIZE.md: Check login status at startup
 */
export interface AuthCheckResult {
  available: boolean;      // CLI exists
  loggedIn: boolean;       // CLI is logged in (has valid session)
  error?: string;          // Error message if check failed
}

/**
 * Executor interface for dependency injection
 *
 * Allows substituting the real ClaudeCodeExecutor with mocks for testing.
 */
export interface IExecutor {
  execute(task: ExecutorTask): Promise<ExecutorResult>;
  isClaudeCodeAvailable(): Promise<boolean>;
  checkAuthStatus(): Promise<AuthCheckResult>;
}

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
  /\?\s*$/m,                    // "? " at end of line
  /\[Y\/n\]/i,                  // [Y/n] confirmation
  /\(yes\/no\)/i,               // (yes/no) confirmation
  /\[y\/N\]/i,                  // [y/N] confirmation
  /continue\?\s*$/mi,           // "continue?" prompt
  /press enter/i,               // Press enter prompt
  /waiting for input/i,         // Waiting for input
  /\(y\/n\)/i,                  // (y/n) confirmation
  /\[yes\/no\]/i,               // [yes/no] confirmation
  /enter your/i,                // Enter your... prompt
  /provide.*key/i,              // API key prompts
  /paste.*key/i,                // Paste key prompts
  /permission.*required/i,      // Permission prompts
  /authorize/i,                 // Authorization prompts
  /approve\?/i,                 // Approval prompts
  /confirm\?/i,                 // Confirmation prompts
  /select.*option/i,            // Selection prompts
  /choose.*:/i,                 // Choice prompts
  /which.*\?/i,                 // Which... prompts
  /would you like/i,            // "Would you like..." prompts
  /do you want/i,               // "Do you want..." prompts
];

/**
 * Timeout configuration (v2 - Production Ready)
 *
 * SOFT_TIMEOUT: Log warning but continue (Claude might be thinking)
 * HARD_TIMEOUT: No output for extended period - likely stuck
 * OVERALL_TIMEOUT: Total execution time limit
 *
 * Design principle: "Production first, safety second"
 * - Small tasks (README) should complete within soft timeout
 * - Complex tasks may exceed soft timeout but should show progress
 * - Only terminate if truly stuck (no output for hard timeout period)
 */
const DEFAULT_SOFT_TIMEOUT_MS = 60000;   // 60s - warning only
const DEFAULT_HARD_TIMEOUT_MS = 120000;  // 120s no output - terminate
const DEFAULT_OVERALL_TIMEOUT_MS = 300000; // 5 min total

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
  'PATH',           // Required for execution
  'HOME',           // Home directory
  'USER',           // Username
  'SHELL',          // Shell
  'LANG',           // Language setting
  'LC_ALL',         // Locale
  'LC_CTYPE',       // Character type
  'TERM',           // Terminal type
  'TMPDIR',         // Temp directory
  'XDG_CONFIG_HOME', // XDG config directory
  'XDG_DATA_HOME',   // XDG data directory
  'XDG_CACHE_HOME',  // XDG cache directory
  'NODE_ENV',       // Node.js environment
  'DEBUG',          // Debug flag (optional)
];

/**
 * Build sanitized environment from ALLOWLIST
 * Per spec/15_API_KEY_ENV_SANITIZE.md: Never pass process.env directly.
 *
 * @returns Record containing only ALLOWLIST variables
 */
export function buildSanitizedEnv(): Record<string, string> {
  const sanitizedEnv: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      sanitizedEnv[key] = process.env[key] as string;
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
function containsInteractivePrompt(output: string): boolean {
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
export class ClaudeCodeExecutor implements IExecutor {
  private readonly config: ExecutorConfig;
  private readonly cliPath: string;
  private readonly softTimeoutMs: number;
  private readonly hardTimeoutMs: number;

  constructor(config: ExecutorConfig) {
    this.config = config;
    this.cliPath = config.cliPath || 'claude';
    // Allow environment variable override for testing
    const envSoft = parseInt(process.env.SOFT_TIMEOUT_MS || '', 10);
    const envHard = parseInt(process.env.HARD_TIMEOUT_MS || '', 10);
    this.softTimeoutMs = envSoft || config.softTimeoutMs || DEFAULT_SOFT_TIMEOUT_MS;
    this.hardTimeoutMs = envHard || config.hardTimeoutMs || DEFAULT_HARD_TIMEOUT_MS;
  }

  /**
   * Check if Claude Code CLI is available
   *
   * @returns true if CLI is available, false otherwise
   */
  async isClaudeCodeAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Per spec/15_API_KEY_ENV_SANITIZE.md: Use ALLOWLIST approach even for version check
        const childProcess = spawn(this.cliPath, ['--version'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
          env: buildSanitizedEnv(),
        });

        childProcess.on('close', (code: number | null) => {
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
      } catch {
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
  async checkAuthStatus(): Promise<AuthCheckResult> {
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
        const childProcess = spawn(this.cliPath, [
          '--print',
          '--dangerously-skip-permissions',
          '--no-session-persistence',
          'echo test',  // Minimal prompt
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 15000,  // 15 second timeout for auth check
          env: {
            ...buildSanitizedEnv(),
            CI: 'true',
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
        });

        let stderr = '';
        let stdout = '';

        childProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        childProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        // Close stdin immediately
        childProcess.stdin?.end();

        childProcess.on('close', (code: number | null) => {
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

          const hasAuthError = authErrorPatterns.some(pattern =>
            combinedOutput.includes(pattern)
          );

          if (hasAuthError) {
            resolve({
              available: true,
              loggedIn: false,
              error: 'Claude Code CLI not logged in. Please run: claude setup-token',
            });
          } else if (code === 0) {
            // Successful execution means logged in
            resolve({
              available: true,
              loggedIn: true,
            });
          } else if (code === 137) {
            // Exit code 137 = 128 + 9 (SIGKILL)
            // Per spec/15: Fail-closed for process termination during auth check
            // This typically means the process was killed externally (e.g., previous session cleanup)
            resolve({
              available: true,
              loggedIn: false,
              error: `Auth check process killed (exit 137 / SIGKILL). Please retry.`,
            });
          } else {
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

        childProcess.on('error', (err: Error) => {
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
      } catch (err) {
        const error = err as Error;
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
  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    const startTime = Date.now();

    // Enforce cwd = projectPath (never use process.cwd())
    const cwd = task.workingDir;

    // Check CLI availability first (fail-closed)
    const available = await this.isClaudeCodeAvailable();
    if (!available) {
      return {
        executed: false,
        output: '',
        error: `Claude Code CLI not available or not found at: ${this.cliPath}`,
        files_modified: [],
        duration_ms: Date.now() - startTime,
        status: 'ERROR',
        cwd,
        verified_files: [],
        unverified_files: [],
      };
    }

    // Get list of files before execution (for diff)
    const filesBefore = await this.listFiles(task.workingDir);

    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';
      let timedOut = false;
      let blocked = false;
      let blockedReason: BlockedReason | undefined;
      let terminatedBy: TerminatedBy | undefined;
      let lastOutputTime = Date.now();
      let softTimeoutWarned = false;
      let resolved = false;

      // Placeholder for child process (assigned after spawn)
      let childProcess: ChildProcess;

      // Timer handles
      let hardTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let overallTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let processCheckHandle: ReturnType<typeof setInterval> | null = null;

      // Progress log slot tracking (slot 0 = 5-15s, slot 1 = 15-25s, etc.)
      let lastProgressSlot = -1;

      // Helper to safely resolve (prevent double resolution)
      const safeResolve = (result: ExecutorResult) => {
        if (resolved) return;
        resolved = true;
        clearAllTimers();
        resolve(result);
      };

      // Helper to clear all timers
      const clearAllTimers = () => {
        if (hardTimeoutHandle) {
          clearTimeout(hardTimeoutHandle);
          hardTimeoutHandle = null;
        }
        if (overallTimeoutHandle) {
          clearTimeout(overallTimeoutHandle);
          overallTimeoutHandle = null;
        }
        if (processCheckHandle) {
          clearInterval(processCheckHandle);
          processCheckHandle = null;
        }
      };

      // Helper to terminate process with blocking status
      const terminateWithBlocking = (reason: BlockedReason, terminator: TerminatedBy) => {
        if (blocked || resolved) return; // Already blocked or resolved
        blocked = true;
        blockedReason = reason;
        terminatedBy = terminator;
        console.log(`[ClaudeCodeExecutor] Terminating: reason=${reason}, by=${terminator}`);
        if (childProcess && !childProcess.killed) {
          childProcess.kill('SIGTERM');
          // Force kill after grace period
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              console.log('[ClaudeCodeExecutor] Force killing with SIGKILL');
              childProcess.kill('SIGKILL');
            }
          }, SIGTERM_GRACE_MS);
        }
      };

      // Reset hard timeout on output (v2: only reset hard timeout, not soft)
      const resetHardTimeout = () => {
        lastOutputTime = Date.now();

        // Clear existing hard timeout
        if (hardTimeoutHandle) {
          clearTimeout(hardTimeoutHandle);
        }

        // Set new hard timeout
        hardTimeoutHandle = setTimeout(() => {
          if (!blocked && !timedOut && !resolved) {
            const elapsed = Date.now() - startTime;
            console.log(`[ClaudeCodeExecutor] Hard timeout - no output for ${this.hardTimeoutMs}ms (total elapsed: ${elapsed}ms)`);
            terminateWithBlocking('TIMEOUT', 'REPL_FAIL_CLOSED');
          }
        }, this.hardTimeoutMs);

        // Check for soft timeout warning (only once)
        if (!softTimeoutWarned) {
          const timeSinceStart = Date.now() - startTime;
          if (timeSinceStart > this.softTimeoutMs) {
            softTimeoutWarned = true;
            console.log(`[ClaudeCodeExecutor] Soft timeout warning - execution taking longer than ${this.softTimeoutMs}ms`);
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
      console.log('[ClaudeCodeExecutor] prompt:', task.prompt);
      if (task.selectedModel) {
        console.log('[ClaudeCodeExecutor] model:', task.selectedModel);
      }
      console.log(`[ClaudeCodeExecutor] Timeout config: soft=${this.softTimeoutMs}ms, hard=${this.hardTimeoutMs}ms, overall=${this.config.timeout}ms`);

      try {
        // Per spec/15_API_KEY_ENV_SANITIZE.md: Use ALLOWLIST approach
        // NEVER pass process.env directly (DELETELIST approach is PROHIBITED)
        const sanitizedEnv = buildSanitizedEnv();
        childProcess = spawn(this.cliPath, cliArgs, {
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
      } catch (spawnError) {
        const err = spawnError as Error;
        console.log(`[ClaudeCodeExecutor] Spawn failed: ${err.message}`);
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

      // Start hard timeout monitoring
      resetHardTimeout();

      // Start overall timeout
      overallTimeoutHandle = setTimeout(() => {
        if (!blocked && !timedOut && !resolved) {
          console.log(`[ClaudeCodeExecutor] Overall timeout - execution exceeded ${this.config.timeout}ms`);
          timedOut = true;
          terminateWithBlocking('TIMEOUT', 'TIMEOUT');
        }
      }, this.config.timeout);

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
            process.stderr.write(`[executor] silent=${Math.round(silentTime/1000)}s total=${Math.round(totalTime/1000)}s\n`);
          }
        }
      }, PROCESS_CHECK_INTERVAL_MS);

      // CRITICAL: Close stdin immediately to signal no more input
      // Without this, Claude Code CLI may wait indefinitely for input
      if (childProcess.stdin) {
        childProcess.stdin.end();
      }

      // Collect stdout and check for interactive prompts (Property 34)
      childProcess.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        output += chunk;

        // Reset hard timeout on any output
        resetHardTimeout();

        // Check for interactive prompt patterns (Property 34)
        if (!blocked && containsInteractivePrompt(chunk)) {
          console.log('[ClaudeCodeExecutor] Interactive prompt detected in chunk - terminating');
          console.log('[ClaudeCodeExecutor] Detected chunk:', chunk.substring(0, 200));
          terminateWithBlocking('INTERACTIVE_PROMPT', 'REPL_FAIL_CLOSED');
        }
      });

      // Collect stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        // Also reset hard timeout on stderr output (CLI is still producing output)
        resetHardTimeout();

        // Also check stderr for interactive prompts
        if (!blocked && containsInteractivePrompt(chunk)) {
          console.log('[ClaudeCodeExecutor] Interactive prompt detected in stderr - terminating');
          terminateWithBlocking('INTERACTIVE_PROMPT', 'REPL_FAIL_CLOSED');
        }
      });

      // Handle completion
      childProcess.on('close', async (code: number | null) => {
        const duration_ms = Date.now() - startTime;

        console.log(`[ClaudeCodeExecutor] Process closed: code=${code}, duration=${duration_ms}ms, blocked=${blocked}, timedOut=${timedOut}`);

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
        const verified_files: VerifiedFile[] = [];
        const unverified_files: string[] = [];

        // Helper function to add a file to verified_files
        const addVerifiedFile = (relPath: string, fullPath: string): boolean => {
          // Skip if already in verified_files
          if (verified_files.some(vf => vf.path === relPath)) {
            return false;
          }
          try {
            if (fs.existsSync(fullPath)) {
              const stat = fs.statSync(fullPath);
              let content_preview: string | undefined;
              // Get preview for text files (first 100 chars)
              if (stat.size < 10000) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  content_preview = content.substring(0, 100);
                } catch {
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
          } catch {
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
        let status: ExecutorResult['status'];
        if (code !== 0) {
          // Non-zero exit code indicates error
          status = 'ERROR';
        } else if (unverified_files.length > 0) {
          // Fail-closed: Some files claimed but don't exist
          status = 'NO_EVIDENCE';
        } else if (verified_files.some(vf => vf.exists)) {
          // Property 8: Runner's disk verification (verified_files) is the final authority
          // If any verified file exists on disk, task is COMPLETE
          status = 'COMPLETE';
        } else {
          // Fail-closed: No verified files with exists=true
          // But if exit code is 0 and we have output, it might have done something
          // Check output for success indicators
          if (output.includes('Created') || output.includes('Updated') || output.includes('Modified')) {
            status = 'INCOMPLETE'; // Claimed success but no file evidence
          } else {
            status = 'NO_EVIDENCE';
          }
        }

        console.log(`[ClaudeCodeExecutor] Result: status=${status}, verified=${verified_files.length}, unverified=${unverified_files.length}`);

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
      childProcess.on('error', (err: Error) => {
        console.log(`[ClaudeCodeExecutor] Process error: ${err.message}`);
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
  private async listFiles(dir: string): Promise<Map<string, { mtime: number; size: number }>> {
    const files = new Map<string, { mtime: number; size: number }>();

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
          } catch {
            // File may have been deleted during scan
          }
        } else if (entry.isDirectory()) {
          const subFiles = await this.listFiles(fullPath);
          for (const [key, value] of subFiles) {
            files.set(key, value);
          }
        }
      }
    } catch {
      // Directory may not exist or be inaccessible
    }

    return files;
  }

  /**
   * Detect files that were modified or created
   */
  private detectModifiedFiles(
    before: Map<string, { mtime: number; size: number }>,
    after: Map<string, { mtime: number; size: number }>,
    baseDir: string
  ): string[] {
    const modified: string[] = [];

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
