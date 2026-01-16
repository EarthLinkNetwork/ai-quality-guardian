/**
 * CLI Interface for PM Orchestrator Runner
 * Based on 05_CLI.md specification
 */
import { EventEmitter } from 'events';
import { OverallStatus, LifecyclePhase } from '../models/enums';
import { ErrorCode } from '../errors/error-codes';
import { SessionStatus } from '../models/session';
/**
 * CLI Error class
 */
export declare class CLIError extends Error {
    readonly code: ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}
/**
 * Parsed CLI arguments
 */
export interface ParsedArgs {
    command?: string;
    projectPath?: string;
    sessionId?: string;
    configPath?: string;
    outputPath?: string;
    verbose?: boolean;
    quiet?: boolean;
    dryRun?: boolean;
    stream?: boolean;
    format?: 'json' | 'compact';
    help?: boolean;
    version?: boolean;
    limits?: {
        max_files?: number;
        max_tests?: number;
        max_seconds?: number;
    };
}
/**
 * CLI run result
 */
export interface CLIResult {
    session_id: string;
    overall_status?: OverallStatus;
    status?: SessionStatus;
    current_phase?: LifecyclePhase;
    tasks_completed?: number;
    tasks_total?: number;
    evidence?: Record<string, unknown>;
    timestamp?: string;
    resumed?: boolean;
    interrupted?: boolean;
    dry_run?: boolean;
    would_execute?: boolean;
    help?: string;
    version?: string;
}
/**
 * CLI options
 */
export interface CLIOptions {
    evidenceDir: string;
}
/**
 * Parse CLI arguments
 */
export declare function parseArgs(args: string[]): ParsedArgs;
/**
 * Validate parsed arguments
 */
export declare function validateArgs(args: ParsedArgs): ParsedArgs;
/**
 * CLI class
 */
export declare class CLI extends EventEmitter {
    private readonly options;
    private runner;
    private currentSessionId;
    private exitCode;
    private verbose;
    private quiet;
    private interrupted;
    private sessions;
    constructor(options: CLIOptions);
    /**
     * Main run method
     */
    run(argv: string[]): Promise<CLIResult>;
    /**
     * Start command implementation (per spec 05_CLI.md L20-26)
     */
    private startCommand;
    /**
     * Continue command implementation
     */
    private continueCommand;
    /**
     * Status command implementation
     */
    private statusCommand;
    /**
     * Validate command implementation (per spec 05_CLI.md L20-26)
     */
    private validateCommand;
    /**
     * Run and format output as string
     */
    runAndFormat(argv: string[]): Promise<string>;
    /**
     * Pause a session
     */
    pauseSession(sessionId: string): void;
    /**
     * Complete a session
     */
    completeSession(sessionId: string): void;
    /**
     * Get exit code
     */
    getExitCode(): number;
    /**
     * Get exit code for a status
     */
    getExitCodeForStatus(status: OverallStatus): number;
    /**
     * Set verbose mode
     */
    setVerbose(flag: boolean): void;
    /**
     * Set quiet mode
     */
    setQuiet(flag: boolean): void;
    /**
     * Format error as JSON string
     */
    formatError(err: Error): string;
    /**
     * Handle signal
     */
    handleSignal(signal: string): void;
    /**
     * Get current session ID
     */
    getCurrentSessionId(): string | null;
    /**
     * Calculate progress percentage
     */
    private calculateProgress;
}
//# sourceMappingURL=cli-interface.d.ts.map