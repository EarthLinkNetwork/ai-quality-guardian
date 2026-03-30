#!/usr/bin/env node
/**
 * PM Orchestrator Runner - CLI Entry Point
 *
 * Usage:
 *   pm [options]                              - Start interactive REPL (default)
 *   pm repl [--project <path>]               - Start interactive REPL
 *   pm web [--port <number>] [--background]  - Start Web UI server
 *   pm web-stop [--namespace <name>]         - Stop background Web UI server
 *   pm start <path> [options]                - Start a new session (per spec 05_CLI.md L20)
 *   pm continue <session-id>                 - Continue a session
 *   pm status <session-id>                   - Get session status
 *   pm validate <path>                       - Validate project structure (per spec 05_CLI.md L23)
 */

import * as path from 'path';
import * as fs from 'fs';
import { CLI, CLIError } from './cli-interface';
import { REPLInterface, ProjectMode } from '../repl/repl-interface';
import { WebServer } from '../web/server';
import { QueueStore, QueuePoller, QueueItem, TaskExecutor, IQueueStore, ProgressEvent } from '../queue/index';
import { InMemoryQueueStore } from '../queue/in-memory-queue-store';
import { FileQueueStore } from '../queue/file-queue-store';
import { AutoResolvingExecutor } from '../executor/auto-resolve-executor';
import { getTestExecutorMode, TestIncompleteExecutor } from '../executor/test-incomplete-executor';
import { DeterministicExecutor } from '../executor/deterministic-executor';
import {
  validateNamespace,
  buildNamespaceConfig,
} from '../config/namespace';
import { getApiKey } from '../config/global-config';
import { getAwsProfile } from '../config/aws-config';
import { initDAL } from '../web/dal/dal-factory';
import { getNoDynamoExtended, isNoDynamoExtendedInitialized } from '../web/dal/no-dynamo';
import { ApiKeyManager, initApiKeyManager } from '../auth/api-key-manager';
import type { AuthConfig } from '../web/middleware/auth';
import {
  installDaemon,
  uninstallDaemon,
  getDaemonStatus,
  getRecentLogs,
  getPlistPath,
  getLogPath,
} from '../daemon/launchd';
import { startAutoUpdateLoop } from '../daemon/auto-updater';
import { runApiKeyOnboarding, isOnboardingRequired } from '../keys/api-key-onboarding';
import {
  PidFileManager,
  WebServerProcess,
  WebStopCommand,
  WebStopExitCode,
} from '../web/background';
import { ensureDistFresh, checkPublicFilesCopied } from '../utils/dist-freshness';
import { runSelftest, SELFTEST_CASES, runSelftestWithAIJudge } from '../selftest/selftest-runner';
import { hasUnansweredQuestions, extractQuestionSummary, detectQuestionsWithLlm, tryAutoAnswerQuestion, generateMetaPrompt, evaluateOutputQuality, getPendingUsage, detectRedOperation } from '../utils/question-detector';
import { calculateTokenCost } from '../web/services/ai-cost-service';
import { estimateTaskSize } from '../utils/task-size-estimator';
import { analyzeTaskForChunking } from '../task-chunking';
import { createCheckpoint, rollback, cleanupCheckpoint, Checkpoint } from '../checkpoint';
import {
  runPreflightChecks,
  enforcePreflightCheck,
  formatPreflightReport,
  PreflightReport,
  ExecutorType,
} from '../diagnostics/executor-preflight';
import { getExecutorOutputStream } from '../executor/executor-output-stream';
import type { ExecutorOutputStream, ExecutorOutputChunk } from '../executor/executor-output-stream';
import { getDAL } from '../web/dal/dal-factory';
import { initializeTaskTracker, shutdownTaskTracker } from './task-tracker-integration';

/**
 * Help text
 */
const HELP_TEXT = `
PM Orchestrator Runner - CLI

Usage:
  pm [options]                    Start interactive REPL (default)
  pm <command> [options]          Run a specific command

Commands:
  repl                   Start interactive REPL mode (default if no command)
  web                    Start Web UI server for task queue management
  web-stop               Stop background Web UI server
  agent                  Start agent-only mode (QueuePoller + executor, no Web UI)
  daemon                 Daemon management (install, uninstall, status, logs)
  key                    API key management (generate, list, revoke)
  selftest               Run selftest mode with AI judge
  start <path>           Start a new session on a project
  continue <session-id>  Continue a paused session
  status <session-id>    Get session status
  validate <path>        Validate project structure

REPL Options:
  --project <path>       Project path (default: current directory)
  --evidence <path>      Evidence directory
  --provider <provider>  API provider (default: requires API key setup)
                         - openai: Use OpenAI API (requires API key)
                         - anthropic: Use Anthropic API (requires API key)
                         - claude-code: Use Claude Code CLI (requires login)
  --no-auth              Skip API key requirement (use Claude Code CLI only)
                         WARNING: This bypasses the API key onboarding flow.
                         Requires Claude Code CLI to be installed and logged in.
  --non-interactive      Force non-interactive mode (no TTY prompts)
  --exit-on-eof          Exit when EOF is received (for piped input)
  --project-mode <mode>  Project mode: 'temp' (default) or 'fixed'
  --project-root <path>  Verification root directory (required if --project-mode=fixed)
  --print-project-path   Print PROJECT_PATH=<path> on startup
  --namespace <name>     Namespace for state separation (default: 'default')
                         Examples: 'stable', 'dev', 'test-1'
  --port <number>        Web UI port (default: 5678 for 'default'/'stable', 5679 for 'dev')

Web Options:
  --port <number>        Web UI port (default: 5678)
  --namespace <name>     Namespace for state separation
  --background           Start server in background (detached) mode
  --local-dynamodb       Use DynamoDB Local (localhost:8000) instead of AWS
  --file                 Use file-based persistent store instead of DynamoDB
  --api-key <key>        API key for authenticated mode (multi-user)

Agent Options:
  --namespace <name>     Namespace for state separation
  --local-dynamodb       Use DynamoDB Local instead of AWS
  --api-key <key>        API key for authenticated mode

Key Options:
  pm key generate --user <userId> --device <name>  Generate API key
  pm key list --user <userId>                      List API keys
  pm key revoke <pmr_xxxxx>                        Revoke API key

Web-Stop Options:
  --namespace <name>     Namespace of server to stop

General Options:
  --help, -h             Show this help message
  --version, -v          Show version

Examples:
  pm                                    # Start REPL in current directory
  pm --project ./my-project             # Start REPL with specific project
  pm repl --namespace stable            # Start REPL with stable namespace
  pm web --port 5678                    # Start Web UI on port 5678
  pm web --port 5678 --background       # Start Web UI in background
  pm web-stop --namespace stable        # Stop background Web UI server
  pm start ./my-project --dry-run       # Start session with dry-run
  pm continue session-2025-01-15-abc123 # Continue a session

Web UI Verification:
  1. Start Web UI:    pm web --port 5678
  2. Health check:    curl http://localhost:5678/api/health
  3. Submit task:     curl -X POST http://localhost:5678/api/tasks \\
                        -H "Content-Type: application/json" \\
                        -d '{"task_group_id":"test","prompt":"hello"}'
  4. View tasks:      curl http://localhost:5678/api/task-groups
`;

/**
 * Version - read from package.json
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VERSION: string = require('../../package.json').version;

/**
 * REPL arguments interface
 */
interface ReplArguments {
  projectPath?: string;
  evidenceDir?: string;
  nonInteractive?: boolean;
  exitOnEof?: boolean;
  projectMode?: ProjectMode;
  projectRoot?: string;
  printProjectPath?: boolean;
  namespace?: string;
  port?: number;
  authMode?: 'api-key' | 'claude-code';
  noAuth?: boolean;
}

/**
 * Parse REPL-specific arguments
 */
function parseReplArgs(args: string[]): ReplArguments {
  const result: ReplArguments = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Project path
    if ((arg === '--project' || arg === '-p') && args[i + 1]) {
      result.projectPath = args[++i];
    }
    // Evidence directory
    else if ((arg === '--evidence' || arg === '-e') && args[i + 1]) {
      result.evidenceDir = args[++i];
    }
    // Non-interactive mode
    else if (arg === '--non-interactive') {
      result.nonInteractive = true;
    }
    // Exit on EOF
    else if (arg === '--exit-on-eof') {
      result.exitOnEof = true;
    }
    // Project mode
    else if (arg === '--project-mode' && args[i + 1]) {
      const mode = args[++i];
      if (mode === 'temp' || mode === 'fixed') {
        result.projectMode = mode;
      } else {
        console.error(`Invalid project mode: ${mode}. Use 'temp' or 'fixed'.`);
        process.exit(1);
      }
    }
    // Project root
    else if (arg === '--project-root' && args[i + 1]) {
      result.projectRoot = args[++i];
    }
    // Print project path
    else if (arg === '--print-project-path') {
      result.printProjectPath = true;
    }
    // Namespace (per spec/21_STABLE_DEV.md)
    else if (arg === '--namespace' && args[i + 1]) {
      const ns = args[++i];
      // Fail-closed: validate namespace immediately
      const error = validateNamespace(ns);
      if (error) {
        console.error(`Invalid namespace: ${error}`);
        process.exit(1);
      }
      result.namespace = ns;
    }
    // Port
    else if (arg === '--port' && args[i + 1]) {
      const portStr = args[++i];
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${portStr}. Must be a number between 1 and 65535.`);
        process.exit(1);
      }
      result.port = port;
    }
    // Provider / auth mode
    else if (arg === '--provider' && args[i + 1]) {
      const provider = args[++i];
      if (provider === 'claude-code') {
        result.authMode = 'claude-code';
      } else if (provider === 'api-key' || provider === 'openai' || provider === 'anthropic') {
        // openai and anthropic both use api-key mode
        result.authMode = 'api-key';
      } else {
        console.error(`Invalid provider: ${provider}. Use 'openai', 'anthropic', or 'claude-code'.`);
        process.exit(1);
      }
    }
    // No-auth mode (skip API key requirement)
    else if (arg === '--no-auth') {
      result.noAuth = true;
      // --no-auth implies claude-code auth mode
      result.authMode = 'claude-code';
    }
  }

  return result;
}

/**
 * Start REPL with given arguments
 */
async function startRepl(replArgs: ReplArguments): Promise<void> {
  // CRITICAL: evidenceDir must use projectPath, not process.cwd()
  // This ensures files are created in the project directory, not where the CLI was invoked
  const projectPath = replArgs.projectPath || process.cwd();

  // API Key Onboarding Flow (unless --no-auth is specified)
  // This runs BEFORE .claude initialization check
  if (!replArgs.noAuth && !replArgs.nonInteractive) {
    if (isOnboardingRequired(replArgs.noAuth)) {
      // Interactive mode: run onboarding flow
      const onboardingResult = await runApiKeyOnboarding(true);

      if (!onboardingResult.success && !onboardingResult.skipped) {
        // Onboarding failed (user cancelled or error)
        console.error('API key setup cancelled or failed.');
        console.error('Use --no-auth option to bypass API key requirement.');
        process.exit(1);
      }

      if (onboardingResult.skipped && !onboardingResult.success) {
        // User explicitly chose to skip
        console.error('');
        console.error('No API key configured. Cannot start REPL.');
        console.error('Options:');
        console.error('  1. Set environment variable: OPENAI_API_KEY or ANTHROPIC_API_KEY');
        console.error('  2. Run again and enter an API key');
        console.error('  3. Use --no-auth option (requires Claude Code CLI)');
        console.error('');
        process.exit(1);
      }
    }
  } else if (!replArgs.noAuth && replArgs.nonInteractive) {
    // Non-interactive mode: fail-closed if no API key
    if (isOnboardingRequired(replArgs.noAuth)) {
      console.error('ERROR: No API key configured.');
      console.error('In non-interactive mode, API key must be pre-configured.');
      console.error('Set environment variable: OPENAI_API_KEY or ANTHROPIC_API_KEY');
      console.error('Or use --no-auth option to bypass API key requirement.');
      process.exit(1);
    }
  }

  // Build namespace configuration (per spec/21_STABLE_DEV.md)
  // Fail-closed: buildNamespaceConfig throws on invalid namespace
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: replArgs.namespace,
    projectRoot: projectPath,
    port: replArgs.port,
  });

  const repl = new REPLInterface({
    projectPath,
    evidenceDir: replArgs.evidenceDir || path.join(namespaceConfig.stateDir, 'evidence'),
    // Default to 'api-key' mode (requires OpenAI/Anthropic API key)
    // Use --provider claude-code to use Claude Code CLI directly
    authMode: replArgs.authMode || 'api-key',
    forceNonInteractive: replArgs.nonInteractive,
    projectMode: replArgs.projectMode,
    projectRoot: replArgs.projectRoot,
    printProjectPath: replArgs.printProjectPath,
    namespace: namespaceConfig.namespace,
    namespaceConfig,
  });

  // Start REPL and wait for it to complete
  // CRITICAL: Don't use setTimeout to force exit - let REPL handle EOF properly
  // The REPL's start() returns a Promise that resolves after queue drain
  await repl.start();

  // After REPL completes, exit with appropriate code
  if (replArgs.exitOnEof || replArgs.nonInteractive) {
    process.exit(repl.getExitCode());
  }
}

/**
 * Queue store mode for Web server
 */
type QueueStoreMode = 'file' | 'dynamodb' | 'memory';

/**
 * Web server arguments interface
 */
interface WebArguments {
  port?: number;
  namespace?: string;
  background?: boolean;
  noDynamodb?: boolean;
  /** Queue store mode: dynamodb (default), file, or memory */
  storeMode?: QueueStoreMode;
  /** Use DynamoDB Local (localhost:8000) instead of AWS */
  localDynamodb?: boolean;
  /** API key for authenticated mode */
  apiKey?: string;
}

/**
 * Parse Web-specific arguments
 */
function parseWebArgs(args: string[]): WebArguments {
  const result: WebArguments = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Port
    if (arg === '--port' && args[i + 1]) {
      const portStr = args[++i];
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${portStr}. Must be a number between 1 and 65535.`);
        process.exit(1);
      }
      result.port = port;
    }
    // Namespace
    else if (arg === '--namespace' && args[i + 1]) {
      const ns = args[++i];
      const error = validateNamespace(ns);
      if (error) {
        console.error(`Invalid namespace: ${error}`);
        process.exit(1);
      }
      result.namespace = ns;
    }
    // Background mode (per spec/19_WEB_UI.md lines 361-398)
    else if (arg === '--background') {
      result.background = true;
    }
    // No DynamoDB mode - use in-memory queue store (legacy flag)
    else if (arg === '--no-dynamodb') {
      result.noDynamodb = true;
      result.storeMode = 'memory';
    }
    // DynamoDB mode - use DynamoDB queue store (default)
    else if (arg === '--dynamodb') {
      result.storeMode = 'dynamodb';
    }
    // File mode - use file-based persistent store
    else if (arg === '--file') {
      result.storeMode = 'file';
    }
    // In-memory mode - use non-persistent in-memory store
    else if (arg === '--in-memory') {
      result.storeMode = 'memory';
    }
    // Local DynamoDB mode - use localhost:8000
    else if (arg === '--local-dynamodb') {
      result.localDynamodb = true;
      result.storeMode = 'dynamodb';
    }
    // API key for authenticated mode
    else if (arg === '--api-key' && args[i + 1]) {
      result.apiKey = args[++i];
    }
  }

  return result;
}

/**
 * Generate a simple session ID for web server
 */
function generateWebSessionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const random = Math.random().toString(36).substring(2, 8);
  return `web-${dateStr}-${random}`;
}

/**
 * Build TaskContext block from QueueItem metadata.
 * This gives the LLM access to "what the UI screen shows" so users can
 * ask it to transcribe IDs, timestamps, etc.
 *
 * SECURITY: Never include raw API key strings. Only boolean flags.
 */
/** @internal Exported for testing only */
export function buildTaskContext(item: QueueItem): string {
  // Use centralized getApiKey() for DI compliance - no direct process.env access
  const openaiKey = getApiKey('openai');
  const hasOpenAIKey = !!(openaiKey && openaiKey.length > 0);
  const hasRunnerDevDir = require('fs').existsSync(path.join(process.cwd(), '.claude'));

  const lines = [
    '[TaskContext]',
    `status: ${item.status}`,
    `taskId: ${item.task_id}`,
    `taskGroupId: ${item.task_group_id}`,
    `sessionId: ${item.session_id}`,
    `createdAt: ${item.created_at}`,
    `updatedAt: ${item.updated_at}`,
    `taskType: ${item.task_type || 'READ_INFO'}`,
    `hasOpenAIKey: ${hasOpenAIKey}`,
    `hasRunnerDevDir: ${hasRunnerDevDir}`,
    '[/TaskContext]',
  ];
  return lines.join('\n');
}

/**
 * Inject TaskContext and output-format rules into the prompt
 * before passing to executor.
 *
 * The TaskContext block is prepended as reference data.
 * Output rules ensure the executor never inserts meta-blocks
 * (e.g. "PM Orchestrator 起動ルール") into its response.
 */
/** @internal Exported for testing only */
export function injectTaskContext(originalPrompt: string, item: QueueItem): string {
  const taskContext = buildTaskContext(item);

  const outputRules = [
    '[OutputRules]',
    'You are running inside a Web Chat executor.',
    'CRITICAL: Your response will be shown directly to the user in a Task Detail panel.',
    '- Do NOT prepend any meta-blocks such as "PM Orchestrator 起動ルール" or status bars.',
    '- Do NOT add decorative separators (━━━) or rule-display blocks.',
    '- If the user specifies an output format, follow it EXACTLY. The first line of your output must match the first line the user requested.',
    '- You may reference values from [TaskContext] above when the user asks about IDs, status, timestamps, etc.',
    '- Never output raw API keys or secrets. Only use the boolean flags (hasOpenAIKey, hasRunnerDevDir).',
    '- Do NOT fabricate evidence (e.g. "I read .env" or "I queried DynamoDB"). Only cite TaskContext or execution logs as evidence.',
    '[/OutputRules]',
  ];

  return taskContext + '\n\n' + outputRules.join('\n') + '\n\n' + originalPrompt;
}

/**
 * Strip PM Orchestrator meta-blocks from executor output.
 * These blocks are injected by CLAUDE.md rules but must not appear
 * in Web Chat results (AC1).
 *
 * Strips everything between "━━━" fence lines that contain
 * "PM Orchestrator" or "起動ルール".
 */
/** @internal Exported for testing only */
export function stripPmOrchestratorBlocks(output: string): string {
  if (!output) return output;

  // Pattern: block starting with ━━━ line, containing PM Orchestrator text, ending with ━━━ line
  // This handles the every_chat block that CLAUDE.md forces
  const fenceBlockPattern = /━━+[\s\S]*?━━+\n*/g;
  let cleaned = output.replace(fenceBlockPattern, '');

  // Also strip any leftover lines that are clearly PM Orchestrator artifacts
  const pmLines = /^【(表示ルール|PM Orchestrator|禁止事項|Task Tool|重要).*\n?/gm;
  cleaned = cleaned.replace(pmLines, '');

  // Remove leading whitespace/newlines left after stripping
  cleaned = cleaned.replace(/^\s*\n+/, '');

  return cleaned;
}

function truncateForLog(input: string | undefined, maxLen: number): string {
  if (!input) return '';
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + '...';
}

/**
 * Create a TaskExecutor that uses AutoResolvingExecutor
 *
 * AutoResolvingExecutor automatically resolves clarification requests using LLM
 * instead of asking the user. This is critical for headless execution (Web UI, queue).
 *
 * Per user insight: "LLM Layer should answer clarification questions"
 */
/**
 * Record accumulated LLM usage from the current task execution as an activity event.
 * Collects pending usage from question-detector module, calculates cost, and writes
 * an llm_cost activity event to the DAL.
 */
async function recordTaskLlmCost(item: QueueItem): Promise<void> {
  const taskUsage = getPendingUsage();
  if (taskUsage.length === 0) return;

  let totalCostUsd = 0;
  for (const u of taskUsage) {
    const cost = calculateTokenCost(u.model, u.prompt_tokens, u.completion_tokens);
    if (cost) totalCostUsd += cost.totalCost;
  }

  if (totalCostUsd > 0 || taskUsage.length > 0) {
    console.log(`[Runner] LLM usage: ${taskUsage.length} calls, $${totalCostUsd.toFixed(4)}`);
  }

  if (isNoDynamoExtendedInitialized()) {
    try {
      const dal = getNoDynamoExtended();
      await dal.createActivityEvent({
        orgId: 'default',
        type: 'llm_cost',
        summary: `LLM cost: $${totalCostUsd.toFixed(4)} (${taskUsage.length} calls)`,
        importance: 'low',
        details: {
          llm_usage: taskUsage,
          total_cost_usd: totalCostUsd,
          calls: taskUsage.length,
        },
        taskId: item.task_id,
        taskGroupId: item.task_group_id,
      });
    } catch {
      // Silently ignore activity event write failures
    }
  }
}

function createTaskExecutor(projectPath: string, queueStore: IQueueStore): TaskExecutor {
  return async (item: QueueItem): Promise<{ status: 'COMPLETE' | 'ERROR'; errorMessage?: string; output?: string }> => {
    // Clear any stale pending usage from a previous task
    getPendingUsage();

    try {
    console.log(`[Runner] Executing task: ${item.task_id}`);
    console.log(`[Runner] Prompt: ${item.prompt.substring(0, 100)}${item.prompt.length > 100 ? '...' : ''}`);

    // AC A.2: Get output stream for state transition logging
    const stateStream = getExecutorOutputStream();

    // Build prompt including conversation history for re-execution after reply
    let effectivePrompt = item.prompt;
    if (item.conversation_history && item.conversation_history.length > 0) {
      // Build a structured context block so Claude Code understands the full conversation flow
      const contextParts: string[] = [];
      contextParts.push('=== Previous Conversation Context ===');
      contextParts.push('');
      contextParts.push(`Original task: ${item.prompt}`);

      // Include previous output summary if available
      if (item.output) {
        const outputSummary = item.output.length > 1500
          ? item.output.substring(0, 1500) + '\n... (truncated)'
          : item.output;
        contextParts.push('');
        contextParts.push(`Previous assistant output:\n${outputSummary}`);
      }

      // Include the clarification question if available
      if (item.clarification?.question) {
        contextParts.push('');
        contextParts.push(`Question asked to user: ${item.clarification.question}`);
      }

      // Include conversation history entries (user replies)
      contextParts.push('');
      for (const entry of item.conversation_history) {
        contextParts.push(`${entry.role === 'user' ? 'User reply' : entry.role}: ${entry.content}`);
      }

      contextParts.push('');
      contextParts.push('=== End of Previous Context ===');
      contextParts.push('');
      contextParts.push('Continue from where you left off. The user has responded to your question above. Use the previous context to understand what was done before and what the user wants next.');

      effectivePrompt = contextParts.join('\n');
      console.log(`[Runner] Re-executing with ${item.conversation_history.length} conversation history entries, output=${!!item.output}, clarification=${!!item.clarification?.question}`);
      stateStream.emit(item.task_id, 'recovery', `[resume] re-executing with ${item.conversation_history.length} history entries`);

      // Write conversation_history entries to trace file for Conversation Thread display
      try {
        const tracesDir = path.join(projectPath, '.claude', 'state', 'traces');
        const traceFilePath = path.join(tracesDir, `stream-${item.task_id}.jsonl`);
        fs.mkdirSync(tracesDir, { recursive: true });
        for (const entry of item.conversation_history) {
          if (entry.role === 'user') {
            const userEvent = JSON.stringify({
              type: 'user_message',
              content: entry.content.substring(0, 2000),
              timestamp: entry.timestamp || new Date().toISOString(),
            });
            fs.appendFileSync(traceFilePath, userEvent + '\n');
          }
        }
      } catch (traceErr) {
        console.log(`[Runner] Failed to write conversation history to trace: ${(traceErr as Error).message}`);
      }
    }

    // Helper: write LLM layer events to trace file for Conversation Thread display
    const writeLlmTraceEvent = (event: Record<string, unknown>) => {
      try {
        const tracesDir = path.join(item.project_path || projectPath, '.claude', 'state', 'traces');
        const traceFilePath = path.join(tracesDir, `stream-${item.task_id}.jsonl`);
        fs.mkdirSync(tracesDir, { recursive: true });
        fs.appendFileSync(traceFilePath, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n');
        // Also emit for live SSE streaming
        stateStream.emit(item.task_id, 'claude_message', JSON.stringify({ ...event, timestamp: new Date().toISOString() }));
      } catch { /* ignore trace write errors */ }
    };

    // ── LLM Relay Step 1: Meta Prompt Generation ──
    // Transform the user's raw prompt into structured instructions for Claude Code.
    // This is the PRE-PROCESSING step of the LLM relay loop.
    let metaPromptUsed = false;
    let promptForClaude = effectivePrompt;
    if (!item.conversation_history || item.conversation_history.length === 0) {
      // Only generate meta prompt for initial execution (not re-runs after reply)
      try {
        stateStream.emit(item.task_id, 'system', `[llm-relay] Generating meta prompt from user input...`);
        writeLlmTraceEvent({ type: 'llm_processing', action: 'meta_prompt_start', content: 'Generating meta prompt from user input...' });
        const metaResult = await generateMetaPrompt(effectivePrompt, undefined, undefined, undefined);
        if (metaResult.usedProvider && metaResult.metaPrompt !== effectivePrompt) {
          promptForClaude = metaResult.metaPrompt;
          metaPromptUsed = true;
          console.log(`[Runner] Meta prompt generated by ${metaResult.usedProvider}: ${metaResult.enhancements}`);
          stateStream.emit(item.task_id, 'system', `[llm-relay] Meta prompt generated (${metaResult.usedProvider}): ${metaResult.enhancements}`);
          writeLlmTraceEvent({ type: 'llm_processing', action: 'meta_prompt_done', provider: metaResult.usedProvider, enhancements: metaResult.enhancements });
        } else {
          writeLlmTraceEvent({ type: 'llm_processing', action: 'meta_prompt_skipped', content: 'No enhancement needed, using raw prompt' });
        }
      } catch (metaErr) {
        console.warn('[Runner] Meta prompt generation failed, using raw prompt:', metaErr);
        writeLlmTraceEvent({ type: 'llm_processing', action: 'meta_prompt_failed', content: 'Meta prompt generation failed, using raw prompt' });
      }
    }

    // Inject TaskContext and OutputRules into the prompt for all Web Chat tasks
    const enrichedPrompt = injectTaskContext(promptForClaude, item);
    const promptPreview = truncateForLog(promptForClaude, 300);
    // Resolve effective working directory: prefer project_path from queue item, fallback to runner's projectPath
    const effectiveWorkingDir = item.project_path || projectPath;
    stateStream.emit(
      item.task_id,
      'system',
      `[llm] prompt->claude_code len=${enrichedPrompt.length} history=${item.conversation_history?.length ?? 0} cwd=${effectiveWorkingDir} metaPrompt=${metaPromptUsed} preview="${promptPreview}"`
    );

      // ── Task Decomposition Check ──
      // Only for initial execution (not re-runs after reply) and not for subtasks
      if (!item.conversation_history?.length && !item.parent_task_id) {
        try {
          // Use raw prompt (item.prompt) instead of enrichedPrompt to prevent
          // template-injected text from triggering false decomposition
          const analysis = analyzeTaskForChunking(item.prompt);
          if (analysis.is_decomposable && analysis.suggested_subtasks && analysis.suggested_subtasks.length >= 2) {
            console.log(`[Runner] Task ${item.task_id} decomposed into ${analysis.suggested_subtasks.length} subtasks`);
            stateStream.emit(item.task_id, 'system', `[decomposition] Splitting into ${analysis.suggested_subtasks.length} subtasks`);

            // Enqueue each subtask in the same task_group_id
            const subtaskIds: string[] = [];
            for (let i = 0; i < analysis.suggested_subtasks.length; i++) {
              const subtask = analysis.suggested_subtasks[i];
              const subtaskPrompt = `[Subtask ${i + 1}/${analysis.suggested_subtasks.length} of parent task ${item.task_id}]\n\n${subtask.prompt}`;
              const subtaskId = `${item.task_id}-sub-${i + 1}`;
              await queueStore.enqueue(
                item.session_id,
                item.task_group_id,
                subtaskPrompt,
                subtaskId,
                item.task_type,
                item.project_path,
                item.task_id,
              );
              subtaskIds.push(subtaskId);
            }

            const summary = `Task decomposed into ${subtaskIds.length} subtasks:\n${subtaskIds.map((id, i) => `  ${i + 1}. ${id}: ${analysis.suggested_subtasks![i].prompt.substring(0, 100)}`).join('\n')}`;
            return { status: 'COMPLETE' as const, output: summary };
          }
        } catch (decompErr) {
          console.warn('[Runner] Task decomposition check failed, proceeding with single execution:', decompErr);
        }
      }

    // ── Checkpoint (Rollback Safety Net) ──
    // Create checkpoint before Claude Code execution for rollback on failure
    let checkpoint: Checkpoint | undefined;
    try {
      const checkpointResult = await createCheckpoint(effectiveWorkingDir, item.task_id);
      checkpoint = checkpointResult.checkpoint;
      if (checkpoint && checkpoint.type !== 'none') {
        console.log(`[Runner] Checkpoint created: ${checkpoint.type} for task ${item.task_id}`);
        stateStream.emit(item.task_id, 'system', `[checkpoint] ${checkpoint.type} checkpoint created`);
      }
    } catch (cpErr) {
      console.warn('[Runner] Checkpoint creation failed, proceeding without rollback safety:', cpErr);
    }

    try {
      // Check for test executor mode (for E2E testing of INCOMPLETE handling)
      const testMode = getTestExecutorMode();
      if (testMode !== 'passthrough') {
        console.log(`[Runner] Test executor mode: ${testMode}`);

        // Create a test executor that returns controlled status
        const stubExecutor = new DeterministicExecutor();
        const testExecutor = new TestIncompleteExecutor(stubExecutor, testMode);

        const result = await testExecutor.execute({
          id: item.task_id,
          prompt: enrichedPrompt,
          workingDir: effectiveWorkingDir,
          taskType: item.task_type || 'READ_INFO', // Default to READ_INFO for chat messages
        });

        console.log(`[Runner] Test executor returned status: ${result.status}`);

        // Post-process: prefer human-readable assistantOutput over raw output
        const rawOutput = result.assistantOutput || result.output || '';
        const cleanOutput = stripPmOrchestratorBlocks(rawOutput);

        // Handle test executor results
        // For READ_INFO/REPORT tasks with INCOMPLETE + output, treat as COMPLETE
        const taskType = item.task_type || 'READ_INFO';
        const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';

        const hasOutput = cleanOutput && cleanOutput.trim().length > 0;

        // Use LLM-based question detection for higher accuracy
        let llmResult: { hasQuestions: boolean; questionSummary: string } | undefined;
        if (hasOutput) {
          try {
            llmResult = await detectQuestionsWithLlm(cleanOutput, item.prompt, undefined, undefined);
            console.log(`[Runner] LLM question detection: hasQuestions=${llmResult.hasQuestions}, summary="${llmResult.questionSummary}"`);
          } catch (e) {
            console.warn('[Runner] LLM detection failed, using regex fallback');
          }
        }
        const hasQuestions = llmResult ? llmResult.hasQuestions : (hasOutput && hasUnansweredQuestions(cleanOutput));
        const questionSummary = llmResult?.questionSummary || (hasQuestions ? extractQuestionSummary(cleanOutput) : '');

        if (result.status === 'COMPLETE') {
          // Per COMPLETION_JUDGMENT.md: Questions in output -> AWAITING_RESPONSE (not COMPLETE)
          if (hasQuestions) {
            console.log(`[Runner] COMPLETE but has questions -> AWAITING_RESPONSE`);
            return {
              status: 'ERROR',
              errorMessage: 'AWAITING_CLARIFICATION:' + questionSummary,
              output: cleanOutput,
            };
          }
          // Return output for visibility in UI (AC-CHAT-001, AC-CHAT-002)
          return { status: 'COMPLETE', output: cleanOutput || undefined };
        } else if (result.status === 'ERROR') {
          return { status: 'ERROR', errorMessage: result.error || 'Task failed' };
        } else if (isReadInfoOrReport) {
          // READ_INFO/REPORT: INCOMPLETE / NO_EVIDENCE / BLOCKED -> unified handling
          if (hasOutput) {
            if (hasQuestions) {
              console.log(`[Runner] READ_INFO/REPORT ${result.status} with questions -> AWAITING_RESPONSE`);
              return {
                status: 'ERROR',
                errorMessage: 'AWAITING_CLARIFICATION:' + questionSummary,
                output: cleanOutput,
              };
            }
            console.log(`[Runner] READ_INFO/REPORT ${result.status} with output -> COMPLETE`);
            return { status: 'COMPLETE', output: cleanOutput };
          } else {
            console.log(`[Runner] READ_INFO/REPORT ${result.status} without output -> needs clarification`);
            return {
              status: 'ERROR',
              errorMessage: 'AWAITING_CLARIFICATION:' + generateClarificationMessage(item.prompt),
            };
          }
        } else {
          // IMPLEMENTATION / other: if output contains questions, request clarification
          if (hasQuestions) {
            console.log(`[Runner] ${taskType} ${result.status} with questions -> AWAITING_RESPONSE`);
            return {
              status: 'ERROR',
              errorMessage: 'AWAITING_CLARIFICATION:' + questionSummary,
              output: cleanOutput,
            };
          }
          // Otherwise, non-COMPLETE -> ERROR
          return { status: 'ERROR', errorMessage: `Task ended with status: ${result.status}` };
        }
      }

      // Use AutoResolvingExecutor to automatically resolve clarification requests
      // When Claude Code asks "where should I save the file?", LLM decides automatically
      // Progress-aware timeout: extend timeout window when output is flowing
      const sizeEstimate = estimateTaskSize(item.prompt, item.task_type);
      const timeoutProfile = sizeEstimate.recommendedProfile;
      const disableOverallTimeout = false; // keep safety net; progress-aware resets on output

      console.log(`[Runner] Timeout profile: ${timeoutProfile.name} (idle=${timeoutProfile.idle_timeout_ms}ms, hard=${timeoutProfile.hard_timeout_ms}ms, progressAware=true, disableOverall=${disableOverallTimeout})`);
      stateStream.emit(
        item.task_id,
        'timeout',
        `[timeout] profile=${timeoutProfile.name} idle=${timeoutProfile.idle_timeout_ms}ms hard=${timeoutProfile.hard_timeout_ms}ms progressAware=true disableOverall=${disableOverallTimeout}`
      );

      const executor = new AutoResolvingExecutor({
        projectPath: effectiveWorkingDir,
        timeout: timeoutProfile.hard_timeout_ms, // overall safety net (progress-aware if enabled)
        softTimeoutMs: timeoutProfile.idle_timeout_ms, // warning only (for logging)
        silenceLogIntervalMs: Math.min(timeoutProfile.idle_timeout_ms / 2, 30 * 1000), // silence logging interval (NOT termination)
        progressAwareTimeout: true,
        disableOverallTimeout,
        maxRetries: 2, // Allow 2 retry attempts for auto-resolution
      });

      const result = await executor.execute({
        id: item.task_id,
        prompt: enrichedPrompt,
        workingDir: effectiveWorkingDir,
        taskType: item.task_type, // Propagate task type for READ_INFO/REPORT handling
      });

      console.log(`[Runner] Task ${item.task_id} completed with status: ${result.status}`);

      // Post-process: prefer human-readable assistantOutput over raw output
      let rawOutput = result.assistantOutput || result.output || '';
      let cleanOutput = stripPmOrchestratorBlocks(rawOutput);

      // ── LLM Relay Step 2: Output QA Evaluation + Rework Loop ──
      // Evaluate if Claude Code's output satisfactorily completes the user's request.
      // If QA fails, generate rework instructions and re-execute (max 1 rework).
      if (cleanOutput && cleanOutput.trim().length > 0 && result.status !== 'ERROR') {
        try {
          stateStream.emit(item.task_id, 'system', `[llm-relay] Evaluating output quality...`);
          writeLlmTraceEvent({ type: 'llm_processing', action: 'qa_start', content: 'Evaluating output quality...' });
          let qaResult = await evaluateOutputQuality(cleanOutput, item.prompt, undefined, undefined);


          if (!qaResult.passed && qaResult.reworkInstructions) {
            console.log(`[Runner] QA failed (${qaResult.issues.join(', ')}), re-executing with rework instructions`);
            stateStream.emit(item.task_id, 'system', `[llm-relay] QA FAILED: ${qaResult.issues.join('; ')}. Sending rework instructions...`);
            writeLlmTraceEvent({ type: 'llm_processing', action: 'qa_failed', issues: qaResult.issues, content: 'QA failed. Sending rework instructions to Claude Code...' });

            // Build rework prompt
            const reworkPrompt = `${promptForClaude}\n\n[QA Review - Rework Required]\nThe previous attempt had the following issues:\n${qaResult.issues.map(i => `- ${i}`).join('\n')}\n\nRework instructions:\n${qaResult.reworkInstructions}\n\nPrevious output summary:\n${cleanOutput.substring(0, 1500)}\n\nPlease fix the issues above and complete the task properly.`;
            const reworkEnriched = injectTaskContext(reworkPrompt, item);

            const reworkExecutor = new AutoResolvingExecutor({
              projectPath: effectiveWorkingDir,
              timeout: timeoutProfile.hard_timeout_ms,
              softTimeoutMs: timeoutProfile.idle_timeout_ms,
              silenceLogIntervalMs: Math.min(timeoutProfile.idle_timeout_ms / 2, 30 * 1000),
              progressAwareTimeout: true,
              disableOverallTimeout: false,
              maxRetries: 1,
            });

            const reworkResult = await reworkExecutor.execute({
              id: item.task_id,
              prompt: reworkEnriched,
              workingDir: effectiveWorkingDir,
              taskType: item.task_type,
            });

            const reworkRaw = reworkResult.assistantOutput || reworkResult.output || '';
            const reworkClean = stripPmOrchestratorBlocks(reworkRaw);

            if (reworkClean && reworkClean.trim().length > 0) {
              console.log(`[Runner] Rework produced output (${reworkClean.length} chars)`);
              stateStream.emit(item.task_id, 'system', `[llm-relay] Rework completed (${reworkClean.length} chars)`);
              // Use rework output as the final output
              rawOutput = reworkRaw;
              cleanOutput = reworkClean;
            } else {
              console.log(`[Runner] Rework produced no output, keeping original`);
              stateStream.emit(item.task_id, 'system', `[llm-relay] Rework produced no output, keeping original`);
            }
          } else if (qaResult.passed) {
            console.log(`[Runner] QA passed`);
            stateStream.emit(item.task_id, 'system', `[llm-relay] QA PASSED`);
            writeLlmTraceEvent({ type: 'llm_processing', action: 'qa_passed', content: 'Output quality check passed' });
          }
        } catch (qaErr) {
          console.warn('[Runner] QA evaluation failed, skipping:', qaErr instanceof Error ? qaErr.message : String(qaErr));
        }
      }

      // Unified READ_INFO/REPORT handling for non-COMPLETE/non-ERROR statuses
      // (INCOMPLETE, NO_EVIDENCE, BLOCKED all follow the same logic)
      const taskType = item.task_type || 'READ_INFO';
      const isReadInfoOrReport = taskType === 'READ_INFO' || taskType === 'REPORT';
      const hasOutput = cleanOutput && cleanOutput.trim().length > 0;

      // Use LLM-based question detection for higher accuracy
      let llmResult: { hasQuestions: boolean; questionSummary: string } | undefined;
      if (hasOutput) {
        try {
          writeLlmTraceEvent({ type: 'llm_processing', action: 'question_detection_start', content: 'Detecting questions in output...' });
          llmResult = await detectQuestionsWithLlm(cleanOutput, item.prompt, undefined, undefined);
          console.log(`[Runner] LLM question detection: hasQuestions=${llmResult.hasQuestions}, summary="${llmResult.questionSummary}"`);
          writeLlmTraceEvent({ type: 'llm_processing', action: 'question_detection_done', hasQuestions: llmResult.hasQuestions, summary: llmResult.questionSummary || '' });
        } catch (e) {
          console.warn('[Runner] LLM detection failed, using regex fallback');
        }
      }
      const hasQuestions = llmResult ? llmResult.hasQuestions : (hasOutput && hasUnansweredQuestions(cleanOutput));
      const questionSummary = llmResult?.questionSummary || (hasQuestions ? extractQuestionSummary(cleanOutput) : '');

      // ── Auto-answer: resolve questions via LLM before escalating to user ──
      // If questions detected, try to answer them automatically using the LLM mediator.
      // On success, re-execute with the clarification injected. Max 1 attempt.
      if (hasQuestions && questionSummary) {
        try {
          console.log(`[Runner] Questions detected, attempting auto-answer...`);
          stateStream.emit(item.task_id, 'system', `[auto-answer] Attempting to resolve: "${questionSummary.substring(0, 120)}"`);

          const autoAnswer = await tryAutoAnswerQuestion(questionSummary, item.prompt, cleanOutput);

          if (autoAnswer.canAnswer && autoAnswer.answer) {
            console.log(`[Runner] Auto-answer succeeded: "${autoAnswer.answer.substring(0, 100)}..."`);
            stateStream.emit(item.task_id, 'system', `[auto-answer] Resolved: "${autoAnswer.answer.substring(0, 150)}"`);

            // Build enhanced prompt with clarification
            const rePrompt = `${effectivePrompt}\n\n[Clarification provided by AI mediator]\nQuestion: ${questionSummary}\nAnswer: ${autoAnswer.answer}\n\nProceed with the task using this clarification. Do not ask further questions about the above topic.`;
            const reEnriched = injectTaskContext(rePrompt, item);

            const reExecutor = new AutoResolvingExecutor({
              projectPath: effectiveWorkingDir,
              timeout: timeoutProfile.hard_timeout_ms,
              softTimeoutMs: timeoutProfile.idle_timeout_ms,
              silenceLogIntervalMs: Math.min(timeoutProfile.idle_timeout_ms / 2, 30 * 1000),
              progressAwareTimeout: true,
              disableOverallTimeout: false,
              maxRetries: 1,
            });

            const reResult = await reExecutor.execute({
              id: item.task_id,
              prompt: reEnriched,
              workingDir: effectiveWorkingDir,
              taskType: item.task_type,
            });

            const reRaw = reResult.assistantOutput || reResult.output || '';
            const reClean = stripPmOrchestratorBlocks(reRaw);

            if (reClean && reClean.trim().length > 0) {
              // Check if retry output also has questions (escalate to user if so)
              let retryHasQuestions = false;
              let retryQuestionSummary = '';
              try {
                const reLlm = await detectQuestionsWithLlm(reClean, item.prompt, undefined, undefined);
                retryHasQuestions = reLlm.hasQuestions;
                retryQuestionSummary = reLlm.questionSummary || extractQuestionSummary(reClean);
              } catch {
                retryHasQuestions = hasUnansweredQuestions(reClean);
                retryQuestionSummary = retryHasQuestions ? extractQuestionSummary(reClean) : '';
              }

              if (retryHasQuestions) {
                console.log(`[Runner] Auto-answer retry still has questions -> AWAITING_RESPONSE`);
                stateStream.emit(item.task_id, 'state', `[state] AWAITING_RESPONSE (questions persist after auto-answer)`);
                return {
                  status: 'ERROR',
                  errorMessage: 'AWAITING_CLARIFICATION:' + retryQuestionSummary,
                  output: reClean,
                };
              }

              console.log(`[Runner] Auto-answer retry succeeded -> COMPLETE`);
              stateStream.emit(item.task_id, 'state', `[state] COMPLETE (auto-answer resolved)`);
              if (checkpoint) { await cleanupCheckpoint(checkpoint); }
              return { status: 'COMPLETE', output: reClean };
            } else {
              // Retry produced no output — fall through to normal status handling
              console.log(`[Runner] Auto-answer retry produced no output, falling through`);
            }
          } else {
            console.log(`[Runner] Auto-answer cannot resolve (${autoAnswer.reasoning}), escalating to user`);
          }
        } catch (autoErr) {
          console.warn('[Runner] Auto-answer attempt failed:', autoErr instanceof Error ? autoErr.message : String(autoErr));
        }
      }

      if (result.status === 'COMPLETE') {
        // Check for RED blast radius operations in output (takes priority over question detection)
        if (cleanOutput) {
          const redCheck = detectRedOperation(cleanOutput);
          if (redCheck.detected) {
            console.log(`[Runner] RED operations detected: ${redCheck.operations.join(', ')}`);
            stateStream.emit(item.task_id, 'system', `[safety] RED operations detected: ${redCheck.operations.join('; ')}`);
            return {
              status: 'ERROR',
              errorMessage: 'AWAITING_CLARIFICATION:[SAFETY] Destructive operations detected. Please review: ' + redCheck.operations.join('; '),
              output: cleanOutput,
            };
          }
        }
        // Per COMPLETION_JUDGMENT.md: Questions in output -> AWAITING_RESPONSE (not COMPLETE)
        if (hasQuestions) {
          console.log(`[Runner] COMPLETE but has questions -> AWAITING_RESPONSE`);
          stateStream.emit(item.task_id, 'state', `[state] AWAITING_RESPONSE (questions detected in COMPLETE output)`);
          return {
            status: 'ERROR',
            errorMessage: 'AWAITING_CLARIFICATION:' + questionSummary,
            output: cleanOutput,
          };
        }
        // Return output for visibility in UI (AC-CHAT-001, AC-CHAT-002)
        stateStream.emit(item.task_id, 'state', `[state] COMPLETE`);
        // Clean up checkpoint on success
        if (checkpoint) { await cleanupCheckpoint(checkpoint); }
        return { status: 'COMPLETE', output: cleanOutput || undefined };
      } else if (result.status === 'ERROR') {
        stateStream.emit(item.task_id, 'state', `[state] ERROR`);
        // Rollback on failure
        if (checkpoint && checkpoint.type !== 'none') {
          console.log(`[Runner] Rolling back checkpoint for failed task ${item.task_id}`);
          stateStream.emit(item.task_id, 'system', `[checkpoint] Rolling back changes...`);
          const rbResult = await rollback(checkpoint);
          if (rbResult.success) {
            stateStream.emit(item.task_id, 'system', `[checkpoint] Rollback successful`);
          } else {
            console.warn(`[Runner] Rollback failed: ${rbResult.error}`);
          }
        }
        return { status: 'ERROR', errorMessage: result.error || 'Task failed', output: cleanOutput || undefined };
      } else if (isReadInfoOrReport) {
        // READ_INFO/REPORT: output is the deliverable, not file evidence
        // INCOMPLETE / NO_EVIDENCE / BLOCKED all route here
        if (hasOutput) {
          if (hasQuestions) {
            console.log(`[Runner] READ_INFO/REPORT ${result.status} with questions -> AWAITING_RESPONSE`);
            stateStream.emit(item.task_id, 'state', `[state] AWAITING_RESPONSE (questions in ${result.status} output)`);
            return {
              status: 'ERROR',
              errorMessage: 'AWAITING_CLARIFICATION:' + questionSummary,
              output: cleanOutput,
            };
          }
          // Output exists, no questions -> task succeeded (COMPLETE)
          console.log(`[Runner] READ_INFO/REPORT ${result.status} with output -> COMPLETE`);
          stateStream.emit(item.task_id, 'state', `[state] COMPLETE (${result.status} with output)`);
          if (checkpoint) { await cleanupCheckpoint(checkpoint); }
          return { status: 'COMPLETE', output: cleanOutput };
        } else {
          // No output -> needs clarification (AWAITING_RESPONSE, never ERROR)
          const clarificationMsg = generateClarificationMessage(item.prompt);
          const fallbackOutput = `INCOMPLETE: Task could not produce results.\n${clarificationMsg}`;
          console.log(`[Runner] READ_INFO/REPORT ${result.status} without output -> AWAITING_RESPONSE`);
          stateStream.emit(item.task_id, 'state', `[state] AWAITING_RESPONSE (no output)`);
          return {
            status: 'ERROR',
            errorMessage: 'AWAITING_CLARIFICATION:' + clarificationMsg,
            output: fallbackOutput,
          };
        }
      } else {
        // IMPLEMENTATION / other task types
        if (hasQuestions) {
          console.log(`[Runner] ${taskType} ${result.status} with questions -> AWAITING_RESPONSE`);
          stateStream.emit(item.task_id, 'state', `[state] AWAITING_RESPONSE (questions in ${taskType} ${result.status})`);
          return {
            status: 'ERROR',
            errorMessage: 'AWAITING_CLARIFICATION:' + questionSummary,
            output: cleanOutput,
          };
        }
        // Exit code 0 + has output → treat as COMPLETE (file verification false-negative)
        // The executor's disk scan may miss files when cwd differs from actual work directory
        if (result.executed && hasOutput) {
          console.log(`[Runner] ${taskType} ${result.status} but exit=0 + output -> COMPLETE (file verification override)`);
          stateStream.emit(item.task_id, 'state', `[state] COMPLETE (${taskType} ${result.status}, exit=0 override)`);
          if (checkpoint) { await cleanupCheckpoint(checkpoint); }
          return { status: 'COMPLETE', output: cleanOutput };
        }
        // Non-COMPLETE with no output or non-zero exit -> ERROR
        const outputPreview = cleanOutput ? cleanOutput.substring(0, 150) : '(no output)';
        console.log(`[Runner] ${taskType} ${result.status} -> ERROR (output preserved: ${hasOutput}, outputLen=${cleanOutput?.length ?? 0}, preview="${outputPreview}")`);
        stateStream.emit(item.task_id, 'state', `[state] ERROR (${taskType} ${result.status}, outputLen=${cleanOutput?.length ?? 0})`);
        // Rollback on failure
        if (checkpoint && checkpoint.type !== 'none') {
          console.log(`[Runner] Rolling back checkpoint for failed task ${item.task_id}`);
          stateStream.emit(item.task_id, 'system', `[checkpoint] Rolling back changes...`);
          const rbResult = await rollback(checkpoint);
          if (rbResult.success) {
            stateStream.emit(item.task_id, 'system', `[checkpoint] Rollback successful`);
          } else {
            console.warn(`[Runner] Rollback failed: ${rbResult.error}`);
          }
        }
        return {
          status: 'ERROR',
          errorMessage: `Task ended with status: ${result.status}. Executor exit code: ${result.executed ? '0' : 'non-zero'}. Output length: ${cleanOutput?.length ?? 0}`,
          output: cleanOutput || undefined,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Runner] Task ${item.task_id} failed:`, errorMessage);
      stateStream.emit(item.task_id, 'state', `[state] ERROR (catch: ${errorMessage.substring(0, 100)})`);
      // Rollback on failure
      if (checkpoint && checkpoint.type !== 'none') {
        console.log(`[Runner] Rolling back checkpoint for failed task ${item.task_id}`);
        stateStream.emit(item.task_id, 'system', `[checkpoint] Rolling back changes...`);
        try {
          const rbResult = await rollback(checkpoint);
          if (rbResult.success) {
            stateStream.emit(item.task_id, 'system', `[checkpoint] Rollback successful`);
          } else {
            console.warn(`[Runner] Rollback failed: ${rbResult.error}`);
          }
        } catch (rbErr) {
          console.warn(`[Runner] Rollback failed with exception:`, rbErr);
        }
      }
      return { status: 'ERROR', errorMessage };
    }
    } finally {
      // Record accumulated LLM usage regardless of success/failure
      await recordTaskLlmCost(item).catch(() => {});
    }
  };
}

/**
 * Generate clarification message for INCOMPLETE READ_INFO tasks
 */
function generateClarificationMessage(prompt: string): string {
  const isSummaryRequest = /(?:要約|まとめ|サマリ|summary|summarize|overview)/i.test(prompt);
  const isStatusRequest = /(?:状態|状況|ステータス|status|state|current)/i.test(prompt);
  const isAnalysisRequest = /(?:分析|解析|analyze|analysis|check|調べ|確認)/i.test(prompt);

  if (isSummaryRequest) {
    return '要約する対象を具体的に教えてください。例: 「このプロジェクトのREADMEを要約してください」';
  } else if (isStatusRequest) {
    return '確認したい状態の対象を教えてください。例: 「gitの状態を確認してください」「テストの状態を確認してください」';
  } else if (isAnalysisRequest) {
    return '分析対象を具体的に指定してください。例: 「src/index.tsのコードを分析してください」';
  }
  return 'リクエストをより具体的にしてください。何を確認または分析すべきか教えてください。';
}

/**
 * Persist executor output as progress events in the queue store
 * This keeps task.updated_at fresh when Cloud Code emits output.
 */
function attachQueueProgressPersistence(
  queueStore: IQueueStore,
  outputStream: ExecutorOutputStream
): () => void {
  const lastEventAt = new Map<string, number>();
  const warnedTasks = new Set<string>();

  const throttleMs = 2000;
  const maxTextLength = 200;
  const maxImportantTextLength = 1000;
  const importantStreams = new Set<ExecutorOutputChunk['stream']>(['error', 'state', 'timeout']);

  const truncate = (text: string, limit: number): string => {
    if (!text) return text;
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '…';
  };

  const warnOnce = (taskId: string, message: string, error?: unknown) => {
    if (warnedTasks.has(taskId)) return;
    warnedTasks.add(taskId);
    if (error) {
      console.warn(message, error);
    } else {
      console.warn(message);
    }
  };

  const appendEventSafe = (taskId: string, event: ProgressEvent) => {
    queueStore.appendEvent(taskId, event)
      .then((ok) => {
        if (!ok) {
          warnOnce(taskId, `[Progress] Failed to append event (task not found): ${taskId}`);
        }
      })
      .catch((error) => {
        warnOnce(taskId, `[Progress] Failed to append event for task: ${taskId}`, error);
      });
  };

  const unsubscribe = outputStream.subscribe({
    onOutput: (chunk) => {
      const now = Date.now();
      const last = lastEventAt.get(chunk.taskId) ?? 0;
      const isImportant = importantStreams.has(chunk.stream);

      if (!isImportant && now - last < throttleMs) {
        return;
      }

      lastEventAt.set(chunk.taskId, now);

      const textLimit = isImportant ? maxImportantTextLength : maxTextLength;
      const trimmedText = truncate(chunk.text, textLimit);
      const data: Record<string, unknown> = {
        stream: chunk.stream,
        sequence: chunk.sequence,
        projectId: chunk.projectId,
        sessionId: chunk.sessionId,
      };
      if (trimmedText) {
        data.text = trimmedText;
      }

      const event: ProgressEvent = {
        type: 'log_chunk',
        timestamp: chunk.timestamp,
        data,
      };

      appendEventSafe(chunk.taskId, event);
    },
  });

  return () => {
    unsubscribe();
  };
}

/**
 * Start Web UI server in background mode
 * Per spec/19_WEB_UI.md lines 361-398
 */
async function startWebServerBackground(webArgs: WebArguments): Promise<void> {
  const projectPath = process.cwd();

  // Build namespace configuration
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: webArgs.namespace,
    projectRoot: projectPath,
    port: webArgs.port,
  });

  const port = webArgs.port || namespaceConfig.port;

  const serverProcess = new WebServerProcess({
    projectRoot: projectPath,
    namespace: namespaceConfig.namespace,
    port,
  });

  const result = await serverProcess.spawnBackground();

  if (!result.success) {
    console.error(`Failed to start background server: ${result.error}`);
    process.exit(1);
  }

  console.log(`Web UI server started in background (PID: ${result.pid})`);
  console.log(`Namespace: ${namespaceConfig.namespace}`);
  console.log(`Port: ${port}`);
  console.log(`PID file: ${serverProcess.getPidManager().getPidFilePath(namespaceConfig.namespace)}`);
  console.log(`Log file: ${serverProcess.getPidManager().getLogFilePath(namespaceConfig.namespace)}`);
  console.log('');
  console.log(`To stop: pm web-stop --namespace ${namespaceConfig.namespace}`);
  console.log(`Health check: curl http://localhost:${port}/api/health`);

  process.exit(0);
}

/**
 * Start Web UI server (foreground)
 */
async function startWebServer(webArgs: WebArguments): Promise<void> {
  // Handle background mode
  if (webArgs.background) {
    return startWebServerBackground(webArgs);
  }

  const projectPath = process.cwd();

  // Ensure dist is fresh before starting server (auto-rebuild if needed)
  // This guarantees src changes are reflected without manual user intervention
  const packageJsonPath = path.join(projectPath, 'package.json');
  const isRunningFromPackage = require.main?.filename?.includes('dist/cli/index.js');

  if (isRunningFromPackage) {
    // We're running from dist, check freshness
    const projectRoot = path.resolve(projectPath);
    const freshnessResult = ensureDistFresh(projectRoot, { silent: false, copyPublic: true });

    if (!freshnessResult.fresh && freshnessResult.error) {
      console.error('[Web] Failed to ensure dist freshness:', freshnessResult.error);
      process.exit(1);
    }

    if (freshnessResult.rebuilt) {
      console.log('[Web] dist rebuilt successfully, continuing with fresh build');
    }

    // Ensure public files are copied
    if (!checkPublicFilesCopied(projectRoot)) {
      console.log('[Web] Public files not found, copying...');
      const { execSync } = require('child_process');
      try {
        execSync('cp -r src/web/public dist/web/', { cwd: projectRoot, stdio: 'pipe' });
      } catch (e) {
        console.warn('[Web] Warning: Could not copy public files:', e);
      }
    }
  }

  // Build namespace configuration
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: webArgs.namespace,
    projectRoot: projectPath,
    port: webArgs.port,
  });

  const port = webArgs.port || namespaceConfig.port;

  // E2E isolation: override stateDir if PM_E2E_STATE_DIR is set
  // This prevents E2E tests from polluting real user state
  // Must be defined BEFORE queue store creation since FileQueueStore uses it
  const effectiveStateDir = process.env.PM_E2E_STATE_DIR || namespaceConfig.stateDir;
  const isE2eMode = !!process.env.PM_E2E_STATE_DIR;

  // Determine queue store mode (priority: CLI flag > env var > default 'dynamodb')
  let storeMode: QueueStoreMode = 'dynamodb'; // Default to AWS DynamoDB (Berry profile)

  if (webArgs.storeMode) {
    storeMode = webArgs.storeMode;
  } else if (process.env.PM_WEB_STORE_MODE) {
    const envMode = process.env.PM_WEB_STORE_MODE.toLowerCase();
    if (envMode === 'dynamodb' || envMode === 'file' || envMode === 'memory') {
      storeMode = envMode as QueueStoreMode;
    }
  } else if (webArgs.noDynamodb || process.env.PM_WEB_NO_DYNAMODB === '1') {
    // Legacy support for --no-dynamodb flag
    storeMode = 'memory';
  } else if (process.env.PM_WEB_DYNAMODB === '1') {
    // Legacy support for PM_WEB_DYNAMODB env var
    storeMode = 'dynamodb';
  }

  // Create appropriate queue store based on mode
  let queueStore: IQueueStore;
  let queueStoreType: 'file' | 'dynamodb' | 'memory';

  if (storeMode === 'memory') {
    console.log('[QueueStore] Using in-memory store (non-persistent)');
    queueStore = new InMemoryQueueStore({
      namespace: namespaceConfig.namespace,
    });
    queueStoreType = 'memory';
  } else if (storeMode === 'dynamodb') {
    // Try to create DynamoDB-based store with fallback to file on connection error
    const useLocalDynamodb = webArgs.localDynamodb || process.env.PM_LOCAL_DYNAMODB === '1';
    try {
      const dynamoStore = new QueueStore({
        namespace: namespaceConfig.namespace,
        localDynamodb: useLocalDynamodb,
      });
      await dynamoStore.ensureTable();
      queueStore = dynamoStore;
      queueStoreType = 'dynamodb';
      if (useLocalDynamodb) {
        console.log(`[QueueStore] Using DynamoDB Local: ${dynamoStore.getEndpoint()}`);
      } else {
        console.log(`[QueueStore] Using AWS DynamoDB (profile: ${getAwsProfile()}): ${dynamoStore.getEndpoint()}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connect') || errorMessage.includes('credential') || errorMessage.includes('Could not load')) {
        console.warn(`[QueueStore] DynamoDB connection failed: ${errorMessage.substring(0, 120)}`);
        console.warn('[QueueStore] Falling back to file store');
        const fileStore = new FileQueueStore({
          namespace: namespaceConfig.namespace,
          stateDir: effectiveStateDir,
        });
        await fileStore.ensureTable();
        queueStore = fileStore;
        queueStoreType = 'file';
        console.log(`[QueueStore] Using file store: ${fileStore.getEndpoint()}`);
      } else {
        throw error;
      }
    }
  } else {
    // Default: file-based persistent store
    const fileStore = new FileQueueStore({
      namespace: namespaceConfig.namespace,
      stateDir: effectiveStateDir,
    });
    await fileStore.ensureTable();
    queueStore = fileStore;
    queueStoreType = 'file';
    console.log(`[QueueStore] Using file store: ${fileStore.getEndpoint()}`);
  }

  // =========================================================================
  // Initialize DAL (Data Access Layer) - unified abstraction over NoDynamo/DynamoDB
  // =========================================================================
  const useLocalDynamodbForDAL = webArgs.localDynamodb || process.env.PM_LOCAL_DYNAMODB === '1';
  initDAL({
    useDynamoDB: queueStoreType === 'dynamodb',
    stateDir: effectiveStateDir,
    localDynamodb: useLocalDynamodbForDAL,
  });


  // =========================================================================
  // PREFLIGHT CHECK: Fail-fast executor configuration validation
  // Per spec: All auth/config issues must fail fast, not timeout
  // =========================================================================
  console.log('[Preflight] Running executor preflight checks...');

  // Default to 'auto' mode: check what executors are available
  const preflightReport = runPreflightChecks('auto');
  const allowPreflightFailure =
    process.env.PM_WEB_ALLOW_PREFLIGHT_FAIL === '1' ||
    process.env.PM_WEB_ALLOW_PREFLIGHT_FAIL === 'true';

  if (!preflightReport.can_proceed) {
    if (allowPreflightFailure) {
      console.warn('[Preflight] Executor preflight failed, continuing because PM_WEB_ALLOW_PREFLIGHT_FAIL is set.');
      for (const err of preflightReport.fatal_errors) {
        console.warn(`  [${err.code}] ${err.message}`);
        if (err.fix_hint) {
          console.warn(`    Fix: ${err.fix_hint}`);
        }
      }
      console.warn('');
    } else {
    // FATAL: No executor configured
    console.error('');
    console.error('='.repeat(60));
    console.error('  EXECUTOR PREFLIGHT FAILED');
    console.error('='.repeat(60));
    console.error('');
    console.error('  No executor is configured. At least one of the following is required:');
    console.error('');
    console.error('  Option 1: Claude Code CLI');
    console.error('    $ npm install -g @anthropic-ai/claude-code');
    console.error('    $ claude login');
    console.error('');
    console.error('  Option 2: OpenAI API Key');
    console.error('    $ export OPENAI_API_KEY=<value>');
    console.error('');
    console.error('  Option 3: Anthropic API Key');
    console.error('    $ export ANTHROPIC_API_KEY=<value>');
    console.error('');
    for (const err of preflightReport.fatal_errors) {
      console.error(`  [${err.code}] ${err.message}`);
      if (err.fix_hint) {
        console.error(`    Fix: ${err.fix_hint}`);
      }
    }
    console.error('');
    console.error('='.repeat(60));
    console.error('');
    process.exit(1);
    }
  }

  // Log successful checks only when preflight passes
  if (preflightReport.can_proceed) {
    for (const check of preflightReport.checks) {
      if (check.ok) {
        console.log(`[Preflight] [OK] ${check.message}`);
      }
    }
    console.log('[Preflight] Executor preflight checks passed');
    console.log('');
  } else if (allowPreflightFailure) {
    console.warn('[Preflight] Executor preflight failed; Web UI running in limited mode.');
    console.warn('');
  }

  // Create TaskExecutor and QueuePoller
  const taskExecutor = createTaskExecutor(projectPath, queueStore);
  const poller = new QueuePoller(queueStore, taskExecutor, {
    pollIntervalMs: 1000,
    recoverOnStartup: true,
    projectRoot: projectPath,
  });

  // Self-restart handler for Web UI (Build & Restart)
  let serverRef: WebServer | null = null;
  let pollerRef: QueuePoller | null = poller;
  let detachProgressPersistenceRef: (() => void) | null = null;
  let taskTrackerServiceRef: import("../task-tracker/task-tracker-service").TaskTrackerService | null = null;
  const runnerRestartHandler = async () => {
    const oldPid = process.pid;

    const { exec, spawn } = require('child_process');
    const { promisify } = require('util');
    const fs = require('fs');
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: projectPath,
        timeout: 300_000,
      });

      // Ensure public assets are present after build
      try {
        const { execSync } = require('child_process');
        execSync('cp -r src/web/public dist/web/', { cwd: projectPath, stdio: 'pipe' });
      } catch (e) {
        // Best-effort copy; log and continue
        console.warn('[Runner] Warning: could not copy public assets after build:', e);
      }

      let buildMeta: { build_sha: string; build_timestamp: string; git_sha?: string; git_branch?: string } | undefined;
      try {
        const buildMetaPath = path.join(projectPath, 'dist', 'build-meta.json');
        if (fs.existsSync(buildMetaPath)) {
          const parsed = JSON.parse(fs.readFileSync(buildMetaPath, 'utf-8'));
          if (parsed?.build_sha && parsed?.build_timestamp) {
            buildMeta = parsed;
          }
        }
      } catch (e) {
        console.warn('[Runner] Warning: could not read build-meta.json:', e);
      }

      const output = (stdout || '') + (stderr ? '\n' + stderr : '');

      const postResponse = async () => {
        try {
          detachProgressPersistenceRef?.();
        } catch {
          // ignore
        }

        try {
          await pollerRef?.stop();
        } catch (error) {
          console.warn('[Runner] Warning: failed to stop poller during restart:', error);
        }

        try {
          await serverRef?.stop();
        } catch (error) {
          console.warn('[Runner] Warning: failed to stop server during restart:', error);
        }

        const modulePath = path.join(projectPath, 'dist', 'cli', 'index.js');
        const args = ['web', '--port', String(port), '--namespace', namespaceConfig.namespace];
        if (storeMode === 'dynamodb') {
          args.push('--dynamodb');
        } else if (storeMode === 'memory') {
          args.push('--in-memory');
        }
        if (webArgs.localDynamodb) {
          args.push('--local-dynamodb');
        }
        if (webArgs.apiKey) {
          args.push('--api-key', webArgs.apiKey);
        }

        const child = spawn(process.execPath, [modulePath, ...args], {
          cwd: projectPath,
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            PM_BUILD_SHA: buildMeta?.build_sha,
            PM_BUILD_TIMESTAMP: buildMeta?.build_timestamp,
            PM_WEB_PORT: String(port),
          },
        });
        child.unref();
        if (process.env.PM_RUNNER_BACKGROUND === '1' && child.pid) {
          try {
            const pidManager = new PidFileManager(projectPath);
            await pidManager.writePid(namespaceConfig.namespace, child.pid);
          } catch (error) {
            console.warn('[Runner] Warning: failed to update PID file after restart:', error);
          }
        }
      };

      return {
        success: true,
        oldPid,
        buildMeta,
        output,
        message: 'Restart scheduled',
        postResponse: () => {
          setTimeout(() => {
            postResponse()
              .catch((error: unknown) => {
                console.error('[Runner] Self-restart failed:', error);
              })
              .finally(() => {
                process.exit(0);
              });
          }, 0);
        },
      };
    } catch (error: unknown) {
      const err = error as { message?: string; stdout?: string; stderr?: string };
      return {
        success: false,
        oldPid,
        error: err?.message || 'Build failed',
        output: (err.stdout || '') + (err.stderr ? '\n' + err.stderr : ''),
      };
    }
  };

  // DAL is already initialized above via initDAL()


  // =========================================================================
  // Initialize Task Tracker (per spec/34_TASK_TRACKER_PERSISTENCE.md Section 10)
  // =========================================================================
  try {
    const trackerResult = await initializeTaskTracker(getDAL(), namespaceConfig.namespace, namespaceConfig.namespace);
    taskTrackerServiceRef = trackerResult.service;
  } catch (error) {
    console.warn("[TaskTracker] Initialization failed (non-fatal):", error instanceof Error ? error.message : String(error));
  }
  /**
   * Update conversation message after task completion/error.
   * Links queue task_id → run (by taskRunId) → conversation message (by runId).
   */
  const updateConversationFromTask = async (item: QueueItem, status: 'complete' | 'error', errorMessage?: string) => {
    try {
      const dal = getDAL();
      // Extract raw taskRunId from namespaced task_id (e.g. "ns:task_abc" → "task_abc")
      const rawTaskRunId = item.task_id.includes(':')
        ? item.task_id.split(':').slice(1).join(':')
        : item.task_id;

      // Find the run that links taskRunId to runId and projectId
      const run = await dal.findRunByTaskRunId(rawTaskRunId);
      if (!run) {
        console.warn(`[Runner] No run found for taskRunId=${rawTaskRunId}, skipping conversation update`);
        return;
      }

      // Find the assistant message for this run
      const messages = await dal.listConversationMessages(run.projectId);
      const assistantMsg = messages.find(
        (m) => m.runId === run.runId && m.role === 'assistant'
      );
      if (!assistantMsg) {
        console.warn(`[Runner] No assistant message found for runId=${run.runId}, skipping conversation update`);
        return;
      }

      // Get task output from queue store
      const taskItem = await queueStore.getItem(item.task_id);
      const output = taskItem?.output || (status === 'error' ? (errorMessage || 'Task failed') : 'Task completed');

      await dal.updateConversationMessage(run.projectId, assistantMsg.messageId, {
        content: output,
        status,
      });

      // Also update the run status
      await dal.updateRun(run.runId, {
        status: status === 'complete' ? 'COMPLETE' : 'ERROR',
      });

      console.log(`[Runner] Updated conversation message for runId=${run.runId} → ${status}`);
    } catch (err) {
      console.error('[Runner] Failed to update conversation message:', err);
    }
  };

  // Set up poller event listeners
  poller.on('started', () => {
    console.log('[Runner] Queue poller started');
  });
  poller.on('claimed', (item: QueueItem) => {
    console.log(`[Runner] Claimed task: ${item.task_id}`);
  });
  poller.on('completed', (item: QueueItem) => {
    console.log(`[Runner] Completed task: ${item.task_id}`);
    updateConversationFromTask(item, 'complete').catch(() => {});
  });
  poller.on('error', (item: QueueItem, error: Error) => {
    console.error(`[Runner] Task ${item.task_id} error:`, error.message);
    updateConversationFromTask(item, 'error', error.message).catch(() => {});
  });
  poller.on('stale-recovered', (count: number) => {
    console.log(`[Runner] Recovered ${count} stale tasks`);
  });

  const webSessionId = generateWebSessionId();

  // Tag ExecutorOutputStream with current session for stale filtering
  const outputStream = getExecutorOutputStream();
  outputStream.setSessionId(webSessionId);
  const detachProgressPersistence = attachQueueProgressPersistence(queueStore, outputStream);
  detachProgressPersistenceRef = detachProgressPersistence;

  // Set up API key authentication if --api-key is provided
  let authConfig: AuthConfig | undefined;
  if (webArgs.apiKey) {
    const useLocalDynamodb = webArgs.localDynamodb || process.env.PM_LOCAL_DYNAMODB === '1';
    const apiKeyManager = initApiKeyManager({ localDynamodb: useLocalDynamodb });
    try {
      await apiKeyManager.ensureTable();
      const keyData = await apiKeyManager.validateApiKey(webArgs.apiKey);
      if (!keyData) {
        console.error(`[Auth] Invalid API key: ${webArgs.apiKey.substring(0, 8)}...`);
        process.exit(1);
      }
      console.log(`[Auth] Authenticated as userId="${keyData.userId}", device="${keyData.deviceName}"`);
      authConfig = { enabled: true, apiKeyManager };
    } catch (error) {
      console.warn(`[Auth] API key validation failed: ${error instanceof Error ? error.message : String(error)}`);
      console.warn('[Auth] Running without authentication (local dev mode)');
      authConfig = { enabled: false };
    }
  }

  const server = new WebServer({
    port,
    queueStore,
    sessionId: webSessionId,
    namespace: namespaceConfig.namespace,
    projectRoot: projectPath,
    stateDir: effectiveStateDir,
    queueStoreType,
    runnerRestartHandler,
    authConfig,
  });
  serverRef = server;

  console.log(`Starting Web UI server on port ${port}...`);
  console.log(`Namespace: ${namespaceConfig.namespace}`);
  if (isE2eMode) {
    console.log(`[E2E MODE] State directory: ${effectiveStateDir}`);
  } else {
    console.log(`State directory: ${effectiveStateDir}`);
  }
  console.log('');
  console.log('Verification steps:');
  console.log(`  1. Health check:  curl http://localhost:${port}/api/health`);
  console.log(`  2. Submit task:   curl -X POST http://localhost:${port}/api/tasks \\`);
  console.log('                      -H "Content-Type: application/json" \\');
  console.log('                      -d \'{"task_group_id":"test","prompt":"hello"}\'');
  console.log(`  3. View tasks:    curl http://localhost:${port}/api/task-groups`);
  console.log('');

  // Start both web server and poller
  await server.start();
  if (!preflightReport.can_proceed && allowPreflightFailure) {
    console.warn('[Runner] Queue poller not started because preflight failed.');
    console.warn('[Runner] Configure an executor in Settings, then restart to enable task processing.');
  } else {
    await poller.start();
  }

  // Self-test mode: PM_AUTO_SELFTEST=true
  if (process.env.PM_AUTO_SELFTEST === 'true') {
    console.log('[selftest] PM_AUTO_SELFTEST=true detected. Running self-test mode...');
    const sessionId = `selftest-${Date.now()}`;
    const { report, exitCode } = await runSelftest(
      queueStore,
      sessionId,
      projectPath,
    );

    // Graceful shutdown after selftest
    detachProgressPersistence();
    await poller.stop();
    await server.stop();

    console.log(`[selftest] Self-test complete. Exiting with code ${exitCode}.`);
    process.exit(exitCode);
    return; // unreachable but satisfies type checker
  }

  console.log('[Runner] Web server and queue poller are running');
  console.log('[Runner] Press Ctrl+C to stop');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[Runner] Shutting down...');
    detachProgressPersistence();
    await poller.stop();
    await server.stop();
    await shutdownTaskTracker(taskTrackerServiceRef);
    console.log('[Runner] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Web-stop arguments interface
 */
interface WebStopArguments {
  namespace?: string;
}

/**
 * Parse web-stop arguments
 */
function parseWebStopArgs(args: string[]): WebStopArguments {
  const result: WebStopArguments = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--namespace' && args[i + 1]) {
      const ns = args[++i];
      const error = validateNamespace(ns);
      if (error) {
        console.error(`Invalid namespace: ${error}`);
        process.exit(1);
      }
      result.namespace = ns;
    }
  }

  return result;
}

/**
 * Stop background Web UI server
 * Per spec/19_WEB_UI.md lines 400-432
 */
async function stopWebServer(args: WebStopArguments): Promise<void> {
  const projectPath = process.cwd();

  // Build namespace configuration
  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: args.namespace,
    projectRoot: projectPath,
  });

  const pidManager = new PidFileManager(projectPath);
  const stopCmd = new WebStopCommand(pidManager);

  console.log(`Stopping Web UI server (namespace: ${namespaceConfig.namespace})...`);

  const result = await stopCmd.execute(namespaceConfig.namespace);

  switch (result.exitCode) {
    case WebStopExitCode.SUCCESS:
      console.log(result.message);
      if (result.pid) {
        console.log(`PID: ${result.pid}`);
      }
      process.exit(0);
      break;

    case WebStopExitCode.PID_FILE_NOT_FOUND:
      console.error(result.message);
      console.error(`PID file location: ${pidManager.getPidFilePath(namespaceConfig.namespace)}`);
      process.exit(1);
      break;

    case WebStopExitCode.FORCE_KILLED:
      console.warn(result.message);
      if (result.pid) {
        console.warn(`PID: ${result.pid}`);
      }
      process.exit(2);
      break;
  }
}

/**
 * Check if argument looks like an option (starts with -)
 */
function isOption(arg: string): boolean {
  return arg.startsWith('-');
}

/**
 * Handle `pm daemon` sub-commands
 * pm daemon install [--namespace <name>] [--local-dynamodb] [--api-key <key>]
 * pm daemon uninstall
 * pm daemon status
 * pm daemon logs [--lines <n>]
 */
function handleDaemonCommand(args: string[]): void {
  const subCommand = args[0];

  if (!subCommand || subCommand === '--help') {
    console.log(`
Daemon Management (macOS launchd)

Commands:
  pm daemon install    Install and start daemon (launchd agent)
  pm daemon uninstall  Stop and uninstall daemon
  pm daemon status     Show daemon status
  pm daemon logs       Show recent daemon logs

Install Options:
  --namespace <name>   Namespace for state separation
  --local-dynamodb     Use DynamoDB Local instead of AWS
  --api-key <key>      API key for authenticated mode

Logs Options:
  --lines <n>          Number of log lines to show (default: 50)
`);
    process.exit(0);
  }

  switch (subCommand) {
    case 'install': {
      let namespace: string | undefined;
      let localDynamodb = false;
      let apiKeyVal: string | undefined;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--namespace' && args[i + 1]) namespace = args[++i];
        else if (args[i] === '--local-dynamodb') localDynamodb = true;
        else if (args[i] === '--api-key' && args[i + 1]) apiKeyVal = args[++i];
      }
      const result = installDaemon({
        projectPath: process.cwd(),
        namespace,
        localDynamodb,
        apiKey: apiKeyVal,
      });
      if (result.success) {
        console.log(result.message);
        console.log('');
        console.log('Verify: pm daemon status');
        console.log('Logs:   pm daemon logs');
      } else {
        console.error(result.message);
        process.exit(1);
      }
      break;
    }

    case 'uninstall': {
      const result = uninstallDaemon();
      console.log(result.message);
      if (!result.success) process.exit(1);
      break;
    }

    case 'status': {
      const status = getDaemonStatus();
      console.log(`Label:     ${status.label}`);
      console.log(`Installed: ${status.installed ? 'yes' : 'no'}`);
      console.log(`Running:   ${status.running ? 'yes' : 'no'}`);
      if (status.pid) console.log(`PID:       ${status.pid}`);
      console.log(`Plist:     ${getPlistPath()}`);
      console.log(`Log:       ${getLogPath()}`);
      break;
    }

    case 'logs': {
      let lines = 50;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--lines' && args[i + 1]) {
          lines = parseInt(args[++i], 10) || 50;
        }
      }
      console.log(getRecentLogs(lines));
      break;
    }

    default:
      console.error(`Unknown daemon sub-command: ${subCommand}`);
      console.error('Use: pm daemon install | uninstall | status | logs');
      process.exit(1);
  }

  process.exit(0);
}

/**
 * Agent-only arguments
 */
interface AgentArguments {
  namespace?: string;
  localDynamodb?: boolean;
  apiKey?: string;
  autoUpdate?: boolean;
}

/**
 * Parse agent-specific arguments
 */
function parseAgentArgs(args: string[]): AgentArguments {
  const result: AgentArguments = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--namespace' && args[i + 1]) {
      const ns = args[++i];
      const error = validateNamespace(ns);
      if (error) { console.error(`Invalid namespace: ${error}`); process.exit(1); }
      result.namespace = ns;
    } else if (arg === '--local-dynamodb') {
      result.localDynamodb = true;
    } else if (arg === '--api-key' && args[i + 1]) {
      result.apiKey = args[++i];
    } else if (arg === '--auto-update') {
      result.autoUpdate = true;
    }
  }
  return result;
}

/**
 * Start agent-only mode: QueuePoller + TaskExecutor, no Web server
 */
async function startAgentOnly(agentArgs: AgentArguments): Promise<void> {
  const projectPath = process.cwd();

  const namespaceConfig = buildNamespaceConfig({
    autoDerive: true,
    namespace: agentArgs.namespace,
    projectRoot: projectPath,
  });

  const useLocalDynamodb = agentArgs.localDynamodb || process.env.PM_LOCAL_DYNAMODB === '1';

  // Create DynamoDB queue store (agent mode always uses DynamoDB)
  let queueStore: IQueueStore;
  try {
    const dynamoStore = new QueueStore({
      namespace: namespaceConfig.namespace,
      localDynamodb: useLocalDynamodb,
    });
    await dynamoStore.ensureTable();
    queueStore = dynamoStore;
    if (useLocalDynamodb) {
      console.log(`[Agent] Using DynamoDB Local: ${dynamoStore.getEndpoint()}`);
    } else {
      console.log(`[Agent] Using AWS DynamoDB (profile: ${getAwsProfile()}): ${dynamoStore.getEndpoint()}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Agent] Failed to connect to DynamoDB: ${errorMessage}`);
    console.error('[Agent] Agent mode requires DynamoDB. Use --local-dynamodb for local development.');
    process.exit(1);
  }

  // Validate API key if provided
  if (agentArgs.apiKey) {
    const apiKeyManager = initApiKeyManager({ localDynamodb: useLocalDynamodb });
    try {
      await apiKeyManager.ensureTable();
      const keyData = await apiKeyManager.validateApiKey(agentArgs.apiKey);
      if (!keyData) {
        console.error(`[Agent] Invalid API key: ${agentArgs.apiKey.substring(0, 8)}...`);
        process.exit(1);
      }
      console.log(`[Agent] Authenticated as userId="${keyData.userId}", device="${keyData.deviceName}"`);
    } catch (error) {
      console.warn(`[Agent] API key validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Preflight checks
  const preflightReport = runPreflightChecks('auto');
  if (!preflightReport.can_proceed) {
    console.error('[Agent] Executor preflight failed. No executor available.');
    for (const err of preflightReport.fatal_errors) {
      console.error(`  [${err.code}] ${err.message}`);
    }
    process.exit(1);
  }

  // Create TaskExecutor and QueuePoller
  const taskExecutor = createTaskExecutor(projectPath, queueStore);
  const outputStream = getExecutorOutputStream();
  const detachPersistence = attachQueueProgressPersistence(queueStore, outputStream);

  const poller = new QueuePoller(queueStore, taskExecutor, {
    pollIntervalMs: 1000,
    recoverOnStartup: true,
    projectRoot: projectPath,
  });

  poller.on('started', () => console.log('[Agent] Queue poller started'));
  poller.on('claimed', (item: QueueItem) => console.log(`[Agent] Claimed task: ${item.task_id}`));
  poller.on('completed', (item: QueueItem) => console.log(`[Agent] Completed task: ${item.task_id}`));
  poller.on('error', (item: QueueItem, error: Error) => console.error(`[Agent] Task ${item.task_id} error:`, error.message));

  console.log(`[Agent] Starting agent-only mode`);
  console.log(`[Agent] Namespace: ${namespaceConfig.namespace}`);
  console.log(`[Agent] Project: ${projectPath}`);
  console.log(`[Agent] Auto-update: ${agentArgs.autoUpdate ? 'enabled' : 'disabled'}`);
  console.log('[Agent] Press Ctrl+C to stop');
  console.log('');

  await poller.start();

  // Start auto-update if enabled
  let stopAutoUpdate: (() => void) | undefined;
  if (agentArgs.autoUpdate) {
    stopAutoUpdate = startAutoUpdateLoop(projectPath);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Agent] Shutting down...');
    stopAutoUpdate?.();
    detachPersistence();
    await poller.stop();
    console.log('[Agent] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Handle `pm key` sub-commands
 * pm key generate --user <userId> --device <deviceName> [--local-dynamodb]
 * pm key list --user <userId> [--local-dynamodb]
 * pm key revoke <key> [--local-dynamodb]
 */
async function handleKeyCommand(args: string[]): Promise<void> {
  const subCommand = args[0];
  const useLocalDynamodb = args.includes('--local-dynamodb');

  if (!subCommand || subCommand === '--help') {
    console.log(`
API Key Management

Commands:
  pm key generate --user <userId> --device <deviceName>  Generate a new API key
  pm key list --user <userId>                            List API keys for a user
  pm key revoke <key>                                    Revoke an API key

Options:
  --local-dynamodb  Use DynamoDB Local (localhost:8000) instead of AWS
`);
    process.exit(0);
  }

  const manager = new ApiKeyManager({ localDynamodb: useLocalDynamodb });

  try {
    await manager.ensureTable();

    switch (subCommand) {
      case 'generate': {
        let userId = '';
        let deviceName = '';
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--user' && args[i + 1]) userId = args[++i];
          else if (args[i] === '--device' && args[i + 1]) deviceName = args[++i];
        }
        if (!userId || !deviceName) {
          console.error('Usage: pm key generate --user <userId> --device <deviceName>');
          process.exit(1);
        }
        const apiKey = await manager.generateApiKey(userId, deviceName);
        console.log('API Key generated:');
        console.log(`  Key:    ${apiKey.key}`);
        console.log(`  User:   ${apiKey.userId}`);
        console.log(`  Device: ${apiKey.deviceName}`);
        console.log('');
        console.log('Save this key - it cannot be retrieved later.');
        console.log(`Usage: pm web --api-key ${apiKey.key}`);
        break;
      }

      case 'list': {
        let userId = '';
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--user' && args[i + 1]) userId = args[++i];
        }
        if (!userId) {
          console.error('Usage: pm key list --user <userId>');
          process.exit(1);
        }
        const keys = await manager.listApiKeys(userId);
        if (keys.length === 0) {
          console.log(`No API keys found for user "${userId}"`);
        } else {
          console.log(`API Keys for user "${userId}":`);
          for (const key of keys) {
            const status = key.isActive ? 'active' : 'revoked';
            const keyPreview = key.key.substring(0, 12) + '...';
            console.log(`  ${keyPreview}  device=${key.deviceName}  status=${status}  lastUsed=${key.lastUsedAt}`);
          }
        }
        break;
      }

      case 'revoke': {
        const keyToRevoke = args.find(a => a.startsWith('pmr_'));
        if (!keyToRevoke) {
          console.error('Usage: pm key revoke <pmr_xxxxx>');
          process.exit(1);
        }
        await manager.revokeApiKey(keyToRevoke);
        console.log(`API key revoked: ${keyToRevoke.substring(0, 12)}...`);
        break;
      }

      default:
        console.error(`Unknown key sub-command: ${subCommand}`);
        console.error('Use: pm key generate | list | revoke');
        process.exit(1);
    }
  } finally {
    manager.destroy();
  }

  process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check for help (explicit request only)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Check for version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  // Determine command and arguments
  // If no args or first arg is an option, default to REPL
  let command: string;
  let restArgs: string[];

  if (args.length === 0 || isOption(args[0])) {
    // No command specified or first arg is an option -> default to REPL
    command = 'repl';
    restArgs = args;
  } else {
    command = args[0];
    restArgs = args.slice(1);
  }

  try {
    switch (command) {
      case 'repl': {
        const replArgs = parseReplArgs(restArgs);
        await startRepl(replArgs);
        break;
      }

      case 'web': {
        const webArgs = parseWebArgs(restArgs);
        await startWebServer(webArgs);
        break;
      }

      case 'web-stop': {
        // Per spec/19_WEB_UI.md lines 400-432
        const webStopArgs = parseWebStopArgs(restArgs);
        await stopWebServer(webStopArgs);
        break;
      }

      case 'start':  // Per spec 05_CLI.md L20
      case 'continue':
      case 'status':
      case 'validate': {  // Per spec 05_CLI.md L23
        // Use existing CLI interface for these commands
        const cli = new CLI({
          evidenceDir: path.join(process.cwd(), '.claude', 'evidence'),
        });

        const result = await cli.run(args);

        // Output result
        if (result.help) {
          console.log(result.help);
        } else if (result.version) {
          console.log(result.version);
        } else {
          console.log(JSON.stringify(result, null, 2));
        }

        // Set exit code based on status
        if (result.overall_status) {
          process.exit(cli.getExitCodeForStatus(result.overall_status));
        }
        break;
      }

      case 'selftest': {
        // Run selftest mode per SELFTEST_AI_JUDGE.md specification
        const ciMode = restArgs.includes('--ci');
        const baseDir = process.cwd();

        console.log(`\n[selftest] Starting selftest mode (${ciMode ? 'CI' : 'Full'})...\n`);

        // Use InMemoryQueueStore for selftest isolation
        const queueStore = new InMemoryQueueStore({
          namespace: `selftest-${Date.now()}`,
        });

        try {
          const { report, exitCode, jsonPath, mdPath } = await runSelftestWithAIJudge(
            queueStore,
            { ci: ciMode, baseDir },
          );
          console.log(`\n[selftest] JSON report: ${jsonPath}`);
          console.log(`[selftest] Markdown report: ${mdPath}`);
          process.exit(exitCode);
        } catch (error) {
          console.error(`[selftest] Error: ${(error as Error).message}`);
          process.exit(1);
        }
        break;
      }

      case 'agent': {
        // Agent-only mode: QueuePoller + TaskExecutor, no Web server
        const agentArgs = parseAgentArgs(restArgs);
        await startAgentOnly(agentArgs);
        break;
      }

      case 'daemon': {
        // Daemon management (macOS launchd)
        handleDaemonCommand(restArgs);
        break;
      }

      case 'key': {
        // API Key management commands
        await handleKeyCommand(restArgs);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP_TEXT);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof CLIError) {
      console.error(JSON.stringify({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      }, null, 2));
      process.exit(1);
    } else {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}

// Run main
main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
