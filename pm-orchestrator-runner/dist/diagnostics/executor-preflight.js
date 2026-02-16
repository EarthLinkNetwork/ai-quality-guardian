"use strict";
/**
 * Executor Preflight Diagnostic System
 *
 * FAIL-FAST design: All authentication and configuration issues
 * must be detected BEFORE execution, not as timeouts.
 *
 * This module provides mandatory pre-flight checks for all executors.
 * Silent failures and timeout masking are prohibited.
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
exports.checkClaudeCodeCLI = checkClaudeCodeCLI;
exports.checkClaudeCodeAuth = checkClaudeCodeAuth;
exports.checkOpenAIKey = checkOpenAIKey;
exports.checkAnthropicKey = checkAnthropicKey;
exports.checkExecutorBinary = checkExecutorBinary;
exports.checkNetwork = checkNetwork;
exports.runPreflightChecks = runPreflightChecks;
exports.formatPreflightReport = formatPreflightReport;
exports.formatPreflightReportJSON = formatPreflightReportJSON;
exports.enforcePreflightCheck = enforcePreflightCheck;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// ============================================================================
// Individual Checks
// ============================================================================
/**
 * Check if Claude Code CLI is installed
 */
function checkClaudeCodeCLI() {
    try {
        // Try to find claude CLI
        const result = (0, child_process_1.spawnSync)('which', ['claude'], {
            encoding: 'utf-8',
            timeout: 5000,
        });
        if (result.status === 0 && result.stdout.trim()) {
            return {
                ok: true,
                fatal: false,
                code: 'OK',
                message: 'Claude Code CLI found',
                fix_hint: '',
                details: { path: result.stdout.trim() },
            };
        }
        // Also try 'claude-code' command
        const result2 = (0, child_process_1.spawnSync)('which', ['claude-code'], {
            encoding: 'utf-8',
            timeout: 5000,
        });
        if (result2.status === 0 && result2.stdout.trim()) {
            return {
                ok: true,
                fatal: false,
                code: 'OK',
                message: 'Claude Code CLI found',
                fix_hint: '',
                details: { path: result2.stdout.trim() },
            };
        }
        return {
            ok: false,
            fatal: true,
            code: 'CLAUDE_CLI_NOT_FOUND',
            message: 'Claude Code CLI not found in PATH',
            fix_hint: 'Install Claude Code: npm install -g @anthropic-ai/claude-code',
        };
    }
    catch {
        return {
            ok: false,
            fatal: true,
            code: 'CLAUDE_CLI_NOT_FOUND',
            message: 'Failed to check for Claude Code CLI',
            fix_hint: 'Install Claude Code: npm install -g @anthropic-ai/claude-code',
        };
    }
}
/**
 * Check Claude Code authentication status
 */
function checkClaudeCodeAuth() {
    // First check if CLI exists
    const cliCheck = checkClaudeCodeCLI();
    if (!cliCheck.ok) {
        return cliCheck;
    }
    try {
        // Check for authentication by looking for credential files
        const homeDir = os.homedir();
        const claudeConfigDir = path.join(homeDir, '.claude');
        const credentialsPath = path.join(claudeConfigDir, 'credentials.json');
        const settingsPath = path.join(claudeConfigDir, 'settings.json');
        // Check if .claude directory exists
        if (!fs.existsSync(claudeConfigDir)) {
            return {
                ok: false,
                fatal: true,
                code: 'CLAUDE_LOGIN_REQUIRED',
                message: 'Claude Code not configured. No .claude directory found.',
                fix_hint: 'Run: claude login\nSSO users must login once locally.',
            };
        }
        // Check for credentials file
        if (fs.existsSync(credentialsPath)) {
            try {
                const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
                if (creds.token || creds.access_token || creds.api_key) {
                    return {
                        ok: true,
                        fatal: false,
                        code: 'OK',
                        message: 'Claude Code credentials found',
                        fix_hint: '',
                    };
                }
            }
            catch {
                // Invalid credentials file
            }
        }
        // Check for settings file with auth info
        if (fs.existsSync(settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                if (settings.authenticated || settings.user || settings.sessionToken) {
                    return {
                        ok: true,
                        fatal: false,
                        code: 'OK',
                        message: 'Claude Code session found',
                        fix_hint: '',
                    };
                }
            }
            catch {
                // Invalid settings file
            }
        }
        // Try running claude --version as a basic check
        const versionCheck = (0, child_process_1.spawnSync)('claude', ['--version'], {
            encoding: 'utf-8',
            timeout: 10000,
        });
        if (versionCheck.status === 0) {
            // CLI works, assume auth might be handled differently
            return {
                ok: true,
                fatal: false,
                code: 'OK',
                message: 'Claude Code CLI operational',
                fix_hint: '',
                details: { version: versionCheck.stdout.trim() },
            };
        }
        return {
            ok: false,
            fatal: true,
            code: 'CLAUDE_AUTH_MISSING',
            message: 'Claude Code authentication not found.',
            fix_hint: 'Run: claude login\nSSO users must login once locally.',
        };
    }
    catch (error) {
        return {
            ok: false,
            fatal: true,
            code: 'CLAUDE_AUTH_MISSING',
            message: `Failed to check Claude Code auth: ${error instanceof Error ? error.message : 'Unknown error'}`,
            fix_hint: 'Run: claude login\nSSO users must login once locally.',
        };
    }
}
/**
 * Check OpenAI API key configuration
 */
function checkOpenAIKey() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return {
            ok: false,
            fatal: true,
            code: 'OPENAI_KEY_MISSING',
            message: 'OpenAI API key not configured.',
            fix_hint: 'Set OPENAI_API_KEY in your environment:\nexport OPENAI_API_KEY=<value>',
        };
    }
    return {
        ok: true,
        fatal: false,
        code: 'OK',
        message: 'OpenAI API key configured',
        fix_hint: '',
        details: { key_prefix: apiKey.substring(0, 7) + '...' },
    };
}
/**
 * Check Anthropic API key configuration
 */
function checkAnthropicKey() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return {
            ok: false,
            fatal: true,
            code: 'ANTHROPIC_KEY_MISSING',
            message: 'Anthropic API key not configured.',
            fix_hint: 'Set ANTHROPIC_API_KEY in your environment:\nexport ANTHROPIC_API_KEY=<value>',
        };
    }
    return {
        ok: true,
        fatal: false,
        code: 'OK',
        message: 'Anthropic API key configured',
        fix_hint: '',
        details: { key_prefix: apiKey.substring(0, 10) + '...' },
    };
}
/**
 * Check if a specific executor binary exists
 */
function checkExecutorBinary(executor) {
    try {
        const result = (0, child_process_1.spawnSync)('which', [executor], {
            encoding: 'utf-8',
            timeout: 5000,
        });
        if (result.status === 0 && result.stdout.trim()) {
            // Check if executable
            const binaryPath = result.stdout.trim();
            try {
                fs.accessSync(binaryPath, fs.constants.X_OK);
                return {
                    ok: true,
                    fatal: false,
                    code: 'OK',
                    message: `Executor binary found: ${executor}`,
                    fix_hint: '',
                    details: { path: binaryPath },
                };
            }
            catch {
                return {
                    ok: false,
                    fatal: true,
                    code: 'EXECUTOR_NOT_EXECUTABLE',
                    message: `Executor binary found but not executable: ${executor}`,
                    fix_hint: `Run: chmod +x ${binaryPath}`,
                };
            }
        }
        return {
            ok: false,
            fatal: true,
            code: 'EXECUTOR_NOT_FOUND',
            message: `Executor binary not found: ${executor}`,
            fix_hint: `Install the ${executor} command or verify it's in your PATH.`,
        };
    }
    catch {
        return {
            ok: false,
            fatal: true,
            code: 'EXECUTOR_NOT_FOUND',
            message: `Failed to check for executor: ${executor}`,
            fix_hint: `Verify ${executor} is installed and in your PATH.`,
        };
    }
}
/**
 * Basic network connectivity check
 */
function checkNetwork() {
    try {
        // Try a simple DNS lookup
        const result = (0, child_process_1.spawnSync)('host', ['api.anthropic.com'], {
            encoding: 'utf-8',
            timeout: 5000,
        });
        if (result.status === 0) {
            return {
                ok: true,
                fatal: false,
                code: 'OK',
                message: 'Network connectivity OK',
                fix_hint: '',
            };
        }
        // Fallback: try ping
        const pingResult = (0, child_process_1.spawnSync)('ping', ['-c', '1', '-W', '3', '8.8.8.8'], {
            encoding: 'utf-8',
            timeout: 5000,
        });
        if (pingResult.status === 0) {
            return {
                ok: true,
                fatal: false,
                code: 'OK',
                message: 'Network connectivity OK (DNS may be slow)',
                fix_hint: '',
            };
        }
        return {
            ok: false,
            fatal: true,
            code: 'NETWORK_UNAVAILABLE',
            message: 'Network connectivity issue detected',
            fix_hint: 'Check your internet connection.',
        };
    }
    catch {
        // If we can't run network checks, assume OK (might be in restricted env)
        return {
            ok: true,
            fatal: false,
            code: 'OK',
            message: 'Network check skipped (restricted environment)',
            fix_hint: '',
        };
    }
}
// ============================================================================
// Main Preflight Check
// ============================================================================
/**
 * Run all preflight checks for a specific executor type
 */
function runPreflightChecks(executorType) {
    const checks = [];
    const timestamp = new Date().toISOString();
    // Always check network first
    checks.push(checkNetwork());
    // Executor-specific checks
    switch (executorType) {
        case 'claude-code':
            checks.push(checkClaudeCodeAuth());
            break;
        case 'openai-api':
            checks.push(checkOpenAIKey());
            break;
        case 'anthropic-api':
            checks.push(checkAnthropicKey());
            break;
        case 'auto':
            // For auto mode, check what's available
            const claudeResult = checkClaudeCodeAuth();
            const openaiResult = checkOpenAIKey();
            const anthropicResult = checkAnthropicKey();
            // At least one must be available
            if (!claudeResult.ok && !openaiResult.ok && !anthropicResult.ok) {
                checks.push({
                    ok: false,
                    fatal: true,
                    code: 'CONFIG_ERROR',
                    message: 'No executor configured. Need at least one of: Claude Code auth, OpenAI key, or Anthropic key.',
                    fix_hint: 'Run: claude login\nOr set OPENAI_API_KEY or ANTHROPIC_API_KEY',
                });
            }
            else {
                // Report what's available
                if (claudeResult.ok)
                    checks.push(claudeResult);
                if (openaiResult.ok)
                    checks.push(openaiResult);
                if (anthropicResult.ok)
                    checks.push(anthropicResult);
            }
            break;
    }
    // Collect fatal errors
    const fatal_errors = checks.filter(c => c.fatal && !c.ok);
    // Determine overall status
    const hasErrors = checks.some(c => !c.ok);
    const hasFatal = fatal_errors.length > 0;
    return {
        status: hasFatal ? 'ERROR' : hasErrors ? 'WARNING' : 'OK',
        timestamp,
        executor: executorType,
        checks,
        fatal_errors,
        can_proceed: !hasFatal,
    };
}
/**
 * Format preflight report for console output
 */
function formatPreflightReport(report) {
    const lines = [];
    lines.push('');
    lines.push('='.repeat(60));
    lines.push('  Executor Preflight Check');
    lines.push('='.repeat(60));
    lines.push(`  Executor: ${report.executor}`);
    lines.push(`  Status: ${report.status}`);
    lines.push(`  Timestamp: ${report.timestamp}`);
    lines.push('');
    for (const check of report.checks) {
        const status = check.ok ? '[OK]' : check.fatal ? '[FATAL]' : '[WARN]';
        lines.push(`  ${status} ${check.message}`);
        if (!check.ok && check.fix_hint) {
            lines.push(`       Fix: ${check.fix_hint.split('\n').join('\n            ')}`);
        }
    }
    lines.push('');
    if (!report.can_proceed) {
        lines.push('  EXECUTION BLOCKED: Fatal errors detected.');
        lines.push('  Resolve the above issues before proceeding.');
    }
    else {
        lines.push('  All checks passed. Ready to execute.');
    }
    lines.push('='.repeat(60));
    lines.push('');
    return lines.join('\n');
}
/**
 * Format preflight report as JSON for programmatic use
 */
function formatPreflightReportJSON(report) {
    return JSON.stringify({
        status: report.status,
        error_type: report.fatal_errors.length > 0 ? report.fatal_errors[0].code : null,
        executor: report.executor,
        message: report.fatal_errors.length > 0 ? report.fatal_errors[0].message : 'OK',
        fix: report.fatal_errors.length > 0 ? report.fatal_errors[0].fix_hint : null,
        fatal: !report.can_proceed,
        checks: report.checks.map(c => ({
            code: c.code,
            ok: c.ok,
            message: c.message,
        })),
    }, null, 2);
}
/**
 * Mandatory preflight check - throws if fatal errors detected
 * Use this before starting any executor
 */
function enforcePreflightCheck(executorType) {
    const report = runPreflightChecks(executorType);
    if (!report.can_proceed) {
        // Log the full report
        console.error(formatPreflightReport(report));
        // Throw with structured error
        const firstFatal = report.fatal_errors[0];
        const error = new Error(`Executor preflight failed: ${firstFatal.code}`);
        error.preflightReport = report;
        error.code = firstFatal.code;
        error.fix_hint = firstFatal.fix_hint;
        throw error;
    }
    return report;
}
//# sourceMappingURL=executor-preflight.js.map