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
import { QueueItem } from '../queue/index';
/**
 * Build TaskContext block from QueueItem metadata.
 * This gives the LLM access to "what the UI screen shows" so users can
 * ask it to transcribe IDs, timestamps, etc.
 *
 * SECURITY: Never include raw API key strings. Only boolean flags.
 */
/** @internal Exported for testing only */
export declare function buildTaskContext(item: QueueItem): string;
/**
 * Inject TaskContext and output-format rules into the prompt
 * before passing to executor.
 *
 * The TaskContext block is prepended as reference data.
 * Output rules ensure the executor never inserts meta-blocks
 * (e.g. "PM Orchestrator 起動ルール") into its response.
 */
/** @internal Exported for testing only */
export declare function injectTaskContext(originalPrompt: string, item: QueueItem): string;
/**
 * Strip PM Orchestrator meta-blocks from executor output.
 * These blocks are injected by CLAUDE.md rules but must not appear
 * in Web Chat results (AC1).
 *
 * Strips everything between "━━━" fence lines that contain
 * "PM Orchestrator" or "起動ルール".
 */
/** @internal Exported for testing only */
export declare function stripPmOrchestratorBlocks(output: string): string;
//# sourceMappingURL=index.d.ts.map