/**
 * Executor Preflight Diagnostic System
 *
 * FAIL-FAST design: All authentication and configuration issues
 * must be detected BEFORE execution, not as timeouts.
 *
 * This module provides mandatory pre-flight checks for all executors.
 * Silent failures and timeout masking are prohibited.
 */
export type PreflightErrorCode = 'CLAUDE_AUTH_MISSING' | 'CLAUDE_CLI_NOT_FOUND' | 'CLAUDE_LOGIN_REQUIRED' | 'CLAUDE_SESSION_EXPIRED' | 'OPENAI_KEY_MISSING' | 'ANTHROPIC_KEY_MISSING' | 'EXECUTOR_NOT_FOUND' | 'EXECUTOR_NOT_EXECUTABLE' | 'NETWORK_UNAVAILABLE' | 'CONFIG_ERROR' | 'UNKNOWN_ERROR';
export interface PreflightResult {
    /** Whether all checks passed */
    ok: boolean;
    /** Whether this is a fatal error that blocks execution */
    fatal: boolean;
    /** Error code for programmatic handling */
    code: PreflightErrorCode | 'OK';
    /** Human-readable error message */
    message: string;
    /** Actionable fix hint for the user */
    fix_hint: string;
    /** Additional diagnostic details */
    details?: Record<string, unknown>;
}
export interface PreflightReport {
    /** Overall status */
    status: 'OK' | 'ERROR' | 'WARNING';
    /** Timestamp of check */
    timestamp: string;
    /** Executor being checked */
    executor: string;
    /** Individual check results */
    checks: PreflightResult[];
    /** Summary of fatal errors */
    fatal_errors: PreflightResult[];
    /** Whether execution should proceed */
    can_proceed: boolean;
}
export type ExecutorType = 'claude-code' | 'openai-api' | 'anthropic-api' | 'auto';
/**
 * Check if Claude Code CLI is installed
 */
export declare function checkClaudeCodeCLI(): PreflightResult;
/**
 * Check Claude Code authentication status
 */
export declare function checkClaudeCodeAuth(): PreflightResult;
/**
 * Check OpenAI API key configuration
 */
export declare function checkOpenAIKey(): PreflightResult;
/**
 * Check Anthropic API key configuration
 */
export declare function checkAnthropicKey(): PreflightResult;
/**
 * Check if a specific executor binary exists
 */
export declare function checkExecutorBinary(executor: string): PreflightResult;
/**
 * Basic network connectivity check
 */
export declare function checkNetwork(): PreflightResult;
/**
 * Run all preflight checks for a specific executor type
 */
export declare function runPreflightChecks(executorType: ExecutorType): PreflightReport;
/**
 * Format preflight report for console output
 */
export declare function formatPreflightReport(report: PreflightReport): string;
/**
 * Format preflight report as JSON for programmatic use
 */
export declare function formatPreflightReportJSON(report: PreflightReport): string;
/**
 * Mandatory preflight check - throws if fatal errors detected
 * Use this before starting any executor
 */
export declare function enforcePreflightCheck(executorType: ExecutorType): PreflightReport;
//# sourceMappingURL=executor-preflight.d.ts.map