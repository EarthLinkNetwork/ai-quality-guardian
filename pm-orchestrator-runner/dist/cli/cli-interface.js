"use strict";
/**
 * CLI Interface for PM Orchestrator Runner
 * Based on 05_CLI.md specification
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
exports.CLI = exports.CLIError = void 0;
exports.parseArgs = parseArgs;
exports.validateArgs = validateArgs;
const events_1 = require("events");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("yaml"));
const runner_core_1 = require("../core/runner-core");
const enums_1 = require("../models/enums");
const error_codes_1 = require("../errors/error-codes");
const session_1 = require("../models/session");
/**
 * CLI Error class
 */
class CLIError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message || (0, error_codes_1.getErrorMessage)(code));
        this.name = 'CLIError';
        this.code = code;
        this.details = details;
    }
}
exports.CLIError = CLIError;
/**
 * Parse CLI arguments
 */
function parseArgs(args) {
    const result = {};
    let i = 0;
    // Check for help/version flags first
    if (args.includes('--help') || args.includes('-h')) {
        result.help = true;
        // Continue parsing to get command context
    }
    if (args.includes('--version') || args.includes('-v')) {
        result.version = true;
        return result;
    }
    while (i < args.length) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.help = true;
            i++;
            continue;
        }
        // Options
        if (arg === '--config') {
            result.configPath = args[++i];
        }
        else if (arg === '--output') {
            result.outputPath = args[++i];
        }
        else if (arg === '--verbose') {
            result.verbose = true;
        }
        else if (arg === '--quiet') {
            result.quiet = true;
        }
        else if (arg === '--dry-run') {
            result.dryRun = true;
        }
        else if (arg === '--stream') {
            result.stream = true;
        }
        else if (arg === '--format') {
            result.format = args[++i];
        }
        else if (arg === '--max-files') {
            result.limits = result.limits || {};
            result.limits.max_files = parseInt(args[++i], 10);
        }
        else if (arg === '--max-tests') {
            result.limits = result.limits || {};
            result.limits.max_tests = parseInt(args[++i], 10);
        }
        else if (arg === '--max-seconds') {
            result.limits = result.limits || {};
            result.limits.max_seconds = parseInt(args[++i], 10);
        }
        else if (!arg.startsWith('-')) {
            // Positional arguments
            if (!result.command) {
                result.command = arg;
            }
            else if ((result.command === 'start' || result.command === 'validate') && !result.projectPath) {
                result.projectPath = arg;
            }
            else if ((result.command === 'continue' || result.command === 'status') && !result.sessionId) {
                result.sessionId = arg;
            }
        }
        i++;
    }
    return result;
}
/**
 * Validate parsed arguments
 */
function validateArgs(args) {
    // If version is requested, no validation needed
    if (args.version) {
        return args;
    }
    // If help is requested for the main CLI, no command needed
    if (args.help && !args.command) {
        return args;
    }
    // Command is required unless help/version
    if (!args.command) {
        throw new CLIError(error_codes_1.ErrorCode.E101_CONFIG_FILE_NOT_FOUND, 'No command specified. Use --help for usage information.');
    }
    // Validate command (per spec 05_CLI.md L20-26)
    const validCommands = ['start', 'continue', 'status', 'validate'];
    if (!validCommands.includes(args.command)) {
        throw new CLIError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `Unknown command: ${args.command}`);
    }
    // If help for specific command, that's valid
    if (args.help) {
        return args;
    }
    // Command-specific validation
    if (args.command === 'start' && !args.projectPath) {
        throw new CLIError(error_codes_1.ErrorCode.E102_PROJECT_PATH_INVALID, 'start command requires a project path');
    }
    if (args.command === 'validate' && !args.projectPath) {
        throw new CLIError(error_codes_1.ErrorCode.E102_PROJECT_PATH_INVALID, 'validate command requires a project path');
    }
    if (args.command === 'continue' && !args.sessionId) {
        throw new CLIError(error_codes_1.ErrorCode.E201_SESSION_ID_MISSING, 'continue command requires a session ID');
    }
    if (args.command === 'status' && !args.sessionId) {
        throw new CLIError(error_codes_1.ErrorCode.E201_SESSION_ID_MISSING, 'status command requires a session ID');
    }
    // Validate limits
    if (args.limits) {
        if (args.limits.max_files !== undefined && args.limits.max_files < 1) {
            throw new CLIError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, 'max_files must be at least 1');
        }
        if (args.limits.max_tests !== undefined && args.limits.max_tests < 1) {
            throw new CLIError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, 'max_tests must be at least 1');
        }
        if (args.limits.max_seconds !== undefined && args.limits.max_seconds < 30) {
            throw new CLIError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, 'max_seconds must be at least 30');
        }
    }
    // Check for conflicting flags
    if (args.verbose && args.quiet) {
        throw new CLIError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, 'Cannot use both --verbose and --quiet');
    }
    return args;
}
/**
 * Generate help text (per spec 05_CLI.md L20-26)
 */
function generateHelp(command) {
    if (command === 'start') {
        return `Usage: pm-runner start <project-path> [options]

Options:
  --config <path>     Path to configuration file
  --output <path>     Path to output file
  --max-files <n>     Override max files limit (1-20)
  --max-tests <n>     Override max tests limit (1-50)
  --max-seconds <n>   Override max seconds limit (30-900)
  --verbose           Show detailed output
  --quiet             Minimal output
  --dry-run           Show what would be executed without running
  --stream            Stream output events
  --format <type>     Output format (json, compact)
  --help              Show this help message`;
    }
    if (command === 'validate') {
        return `Usage: pm-runner validate <project-path> [options]

Options:
  --config <path>     Path to configuration file
  --verbose           Show detailed output
  --quiet             Minimal output
  --help              Show this help message`;
    }
    return `PM Orchestrator Runner

Commands:
  start <project>     Start a new session on a project
  continue <session>  Continue a paused session
  status <session>    Show session status
  validate <project>  Validate project configuration

Options:
  --help              Show help message
  --version           Show version

Use "pm-runner <command> --help" for command-specific options.`;
}
/**
 * CLI class
 */
class CLI extends events_1.EventEmitter {
    options;
    runner = null;
    currentSessionId = null;
    exitCode = 0;
    verbose = false;
    quiet = false;
    interrupted = false;
    sessions = new Map();
    constructor(options) {
        super();
        this.options = options;
    }
    /**
     * Main run method
     */
    async run(argv) {
        const args = parseArgs(argv);
        validateArgs(args);
        // Handle help
        if (args.help) {
            const help = generateHelp(args.command);
            return { session_id: '', help };
        }
        // Handle version
        if (args.version) {
            return { session_id: '', version: '0.1.0' };
        }
        // Apply verbose/quiet settings
        if (args.verbose)
            this.verbose = true;
        if (args.quiet)
            this.quiet = true;
        // Handle commands (per spec 05_CLI.md L20-26)
        switch (args.command) {
            case 'start':
                return this.startCommand(args);
            case 'continue':
                return this.continueCommand(args);
            case 'status':
                return this.statusCommand(args);
            case 'validate':
                return this.validateCommand(args);
            default:
                throw new CLIError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `Unknown command: ${args.command}`);
        }
    }
    /**
     * Start command implementation (per spec 05_CLI.md L20-26)
     */
    async startCommand(args) {
        const projectPath = args.projectPath;
        // Validate project path
        if (!fs.existsSync(projectPath)) {
            this.exitCode = this.getExitCodeForStatus(enums_1.OverallStatus.ERROR);
            throw new CLIError(error_codes_1.ErrorCode.E102_PROJECT_PATH_INVALID, `Project path does not exist: ${projectPath}`, { projectPath });
        }
        // Handle dry run
        if (args.dryRun) {
            return {
                session_id: '',
                dry_run: true,
                would_execute: true,
                timestamp: new Date().toISOString(),
            };
        }
        // Load config
        const runnerOptions = {
            evidenceDir: this.options.evidenceDir,
        };
        if (args.configPath) {
            if (!fs.existsSync(args.configPath)) {
                throw new CLIError(error_codes_1.ErrorCode.E101_CONFIG_FILE_NOT_FOUND, `Config file not found: ${args.configPath}`);
            }
            try {
                const configContent = fs.readFileSync(args.configPath, 'utf-8');
                const config = yaml.parse(configContent);
                runnerOptions.resourceLimits = config.limits;
            }
            catch (err) {
                throw new CLIError(error_codes_1.ErrorCode.E104_CONFIGURATION_SCHEMA_VALIDATION_FAILURE, `Invalid config file: ${args.configPath}`);
            }
        }
        // Apply limit overrides
        if (args.limits) {
            runnerOptions.resourceLimits = {
                ...runnerOptions.resourceLimits,
                ...args.limits,
            };
        }
        // Create and run
        this.runner = new runner_core_1.RunnerCore(runnerOptions);
        // Set up event forwarding
        this.runner.on('phase_started', (event) => {
            const progress = {
                current_phase: event.phase,
                progress_percent: this.calculateProgress(event.phase),
            };
            this.emit('progress', progress);
            this.emit('output', { type: 'phase_started', ...event });
            if (this.verbose) {
                this.emit('log', `Phase started: ${event.phase}`);
            }
        });
        // Handle interruption
        if (this.interrupted) {
            const session = await this.runner.initialize(projectPath);
            await this.runner.saveState();
            return {
                session_id: session.session_id,
                interrupted: true,
                timestamp: new Date().toISOString(),
            };
        }
        // Initialize
        const session = await this.runner.initialize(projectPath);
        this.currentSessionId = session.session_id;
        this.sessions.set(session.session_id, { status: 'running' });
        if (this.verbose) {
            this.emit('log', `Session initialized: ${session.session_id}`);
        }
        // Execute
        const result = await this.runner.execute({ tasks: [] });
        // Track session status
        this.sessions.set(session.session_id, { status: 'completed' });
        // Set exit code
        this.exitCode = this.getExitCodeForStatus(result.overall_status);
        // Write output file if specified
        if (args.outputPath) {
            fs.writeFileSync(args.outputPath, JSON.stringify(result, null, 2), 'utf-8');
        }
        return {
            ...result,
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Continue command implementation
     */
    async continueCommand(args) {
        const sessionId = args.sessionId;
        // Check if session exists
        const sessionDir = path.join(this.options.evidenceDir, sessionId);
        const statePath = path.join(sessionDir, 'session.json');
        if (!fs.existsSync(statePath)) {
            this.exitCode = this.getExitCodeForStatus(enums_1.OverallStatus.ERROR);
            throw new CLIError(error_codes_1.ErrorCode.E201_SESSION_ID_MISSING, `Session not found: ${sessionId}`, { sessionId });
        }
        // Read session state
        const stateContent = fs.readFileSync(statePath, 'utf-8');
        const state = JSON.parse(stateContent);
        // Check if session is completed
        if (state.overall_status === enums_1.OverallStatus.COMPLETE ||
            state.status === session_1.SessionStatus.COMPLETED ||
            this.sessions.get(sessionId)?.status === 'completed') {
            this.exitCode = this.getExitCodeForStatus(enums_1.OverallStatus.ERROR);
            throw new CLIError(error_codes_1.ErrorCode.E205_SESSION_RESUME_FAILURE, 'Cannot continue completed session', { sessionId });
        }
        // Create runner and resume
        this.runner = new runner_core_1.RunnerCore({ evidenceDir: this.options.evidenceDir });
        await this.runner.resume(sessionId);
        this.currentSessionId = sessionId;
        this.sessions.set(sessionId, { status: 'running' });
        // Continue execution
        const result = await this.runner.execute({ tasks: [] });
        this.sessions.set(sessionId, { status: 'completed' });
        this.exitCode = this.getExitCodeForStatus(result.overall_status);
        return {
            ...result,
            resumed: true,
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Status command implementation
     */
    async statusCommand(args) {
        const sessionId = args.sessionId;
        // Check if session exists
        const sessionDir = path.join(this.options.evidenceDir, sessionId);
        const statePath = path.join(sessionDir, 'session.json');
        if (!fs.existsSync(statePath)) {
            this.exitCode = this.getExitCodeForStatus(enums_1.OverallStatus.ERROR);
            throw new CLIError(error_codes_1.ErrorCode.E201_SESSION_ID_MISSING, `Session not found: ${sessionId}`, { sessionId });
        }
        // Read session state
        const stateContent = fs.readFileSync(statePath, 'utf-8');
        const state = JSON.parse(stateContent);
        const taskResults = state.task_results || [];
        const completedTasks = taskResults.filter((t) => t.status === 'COMPLETE' || t.status === 'COMPLETED').length;
        return {
            session_id: sessionId,
            status: state.status,
            current_phase: state.current_phase,
            overall_status: state.overall_status,
            tasks_completed: completedTasks,
            tasks_total: taskResults.length,
            evidence: {
                collected: true,
                phase_evidence: state.current_phase,
            },
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Validate command implementation (per spec 05_CLI.md L20-26)
     */
    async validateCommand(args) {
        const projectPath = args.projectPath;
        // Validate project path exists
        if (!fs.existsSync(projectPath)) {
            this.exitCode = this.getExitCodeForStatus(enums_1.OverallStatus.ERROR);
            throw new CLIError(error_codes_1.ErrorCode.E102_PROJECT_PATH_INVALID, `Project path does not exist: ${projectPath}`, { projectPath });
        }
        // Check for pm-orchestrator.yaml config file
        const configPath = path.join(projectPath, 'pm-orchestrator.yaml');
        const hasConfig = fs.existsSync(configPath);
        // If custom config path provided, check it
        if (args.configPath && !fs.existsSync(args.configPath)) {
            throw new CLIError(error_codes_1.ErrorCode.E101_CONFIG_FILE_NOT_FOUND, `Config file not found: ${args.configPath}`);
        }
        // Validate config if it exists
        let configValid = false;
        let configErrors = [];
        if (hasConfig || args.configPath) {
            const actualConfigPath = args.configPath || configPath;
            try {
                const configContent = fs.readFileSync(actualConfigPath, 'utf-8');
                yaml.parse(configContent);
                configValid = true;
            }
            catch (err) {
                configErrors.push(`Invalid YAML: ${err.message}`);
            }
        }
        const validationPassed = hasConfig && configValid && configErrors.length === 0;
        const overallStatus = validationPassed ? enums_1.OverallStatus.COMPLETE : enums_1.OverallStatus.INVALID;
        this.exitCode = this.getExitCodeForStatus(overallStatus);
        return {
            session_id: '',
            overall_status: overallStatus,
            timestamp: new Date().toISOString(),
        };
    }
    /**
     * Run and format output as string
     */
    async runAndFormat(argv) {
        const args = parseArgs(argv);
        const result = await this.run(argv);
        if (args.format === 'compact') {
            return JSON.stringify(result);
        }
        return JSON.stringify(result, null, 2);
    }
    /**
     * Pause a session
     */
    pauseSession(sessionId) {
        this.sessions.set(sessionId, { status: 'paused' });
    }
    /**
     * Complete a session
     */
    completeSession(sessionId) {
        this.sessions.set(sessionId, { status: 'completed' });
        // Also update the session file
        const sessionDir = path.join(this.options.evidenceDir, sessionId);
        const statePath = path.join(sessionDir, 'session.json');
        if (fs.existsSync(statePath)) {
            const stateContent = fs.readFileSync(statePath, 'utf-8');
            const state = JSON.parse(stateContent);
            state.overall_status = enums_1.OverallStatus.COMPLETE;
            state.status = session_1.SessionStatus.COMPLETED;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        }
    }
    /**
     * Get exit code
     */
    getExitCode() {
        return this.exitCode;
    }
    /**
     * Get exit code for a status
     */
    getExitCodeForStatus(status) {
        switch (status) {
            case enums_1.OverallStatus.COMPLETE:
                return 0;
            case enums_1.OverallStatus.INCOMPLETE:
                return 1;
            case enums_1.OverallStatus.NO_EVIDENCE:
                return 2;
            case enums_1.OverallStatus.ERROR:
                return 3;
            case enums_1.OverallStatus.INVALID:
                return 4;
            default:
                return 5;
        }
    }
    /**
     * Set verbose mode
     */
    setVerbose(flag) {
        this.verbose = flag;
    }
    /**
     * Set quiet mode
     */
    setQuiet(flag) {
        this.quiet = flag;
    }
    /**
     * Format error as JSON string
     */
    formatError(err) {
        const output = {
            error: {
                message: err.message,
            },
        };
        if (err instanceof CLIError) {
            output.error.code = err.code;
        }
        if (this.verbose && !this.quiet) {
            output.error.stack = err.stack;
        }
        return JSON.stringify(output, null, 2);
    }
    /**
     * Handle signal
     */
    handleSignal(signal) {
        this.interrupted = true;
        if (this.runner && this.currentSessionId) {
            // Save state immediately
            this.runner.saveState().catch(() => {
                // Ignore save errors during signal handling
            });
        }
    }
    /**
     * Get current session ID
     */
    getCurrentSessionId() {
        return this.currentSessionId;
    }
    /**
     * Calculate progress percentage
     */
    calculateProgress(phase) {
        const phases = [
            enums_1.LifecyclePhase.REQUIREMENT_ANALYSIS,
            enums_1.LifecyclePhase.TASK_DECOMPOSITION,
            enums_1.LifecyclePhase.PLANNING,
            enums_1.LifecyclePhase.EXECUTION,
            enums_1.LifecyclePhase.QA,
            enums_1.LifecyclePhase.COMPLETION_VALIDATION,
            enums_1.LifecyclePhase.REPORT,
        ];
        const index = phases.indexOf(phase);
        return Math.round((index / phases.length) * 100);
    }
}
exports.CLI = CLI;
//# sourceMappingURL=cli-interface.js.map