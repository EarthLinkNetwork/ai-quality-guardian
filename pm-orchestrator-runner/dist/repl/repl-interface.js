"use strict";
/**
 * REPL Interface for PM Orchestrator Runner
 * Provides an interactive CLI experience with slash commands
 *
 * Supports two execution modes (per spec 10_REPL_UX.md):
 * - Interactive mode: TTY connected, readline with prompt
 * - Non-interactive mode: stdin script / heredoc / pipe
 *
 * Non-interactive mode guarantees:
 * - Sequential Processing: Each command completes before next starts
 * - Output Flush: All stdout is flushed before exit
 * - Deterministic Exit Code: 0=COMPLETE, 1=ERROR, 2=INCOMPLETE
 *
 * Project Mode (per spec 10_REPL_UX.md, Property 32, 33):
 * - temp: Use temporary directory (default, cleaned up on exit)
 * - fixed: Use specified directory (persists after exit)
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
exports.REPLInterface = exports.EXIT_CODES = void 0;
const readline = __importStar(require("readline"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const events_1 = require("events");
const enums_1 = require("../models/enums");
const executor_supervisor_1 = require("../supervisor/executor-supervisor");
const init_1 = require("./commands/init");
const model_1 = require("./commands/model");
const session_1 = require("./commands/session");
const status_1 = require("./commands/status");
const provider_1 = require("./commands/provider");
const models_1 = require("./commands/models");
const keys_1 = require("./commands/keys");
const logs_1 = require("./commands/logs");
const global_config_1 = require("../config/global-config");
/**
 * Exit codes for non-interactive mode - per spec 10_REPL_UX.md
 * These are deterministic based on session state
 */
exports.EXIT_CODES = {
    COMPLETE: 0, // All tasks completed successfully
    ERROR: 1, // Error occurred during execution
    INCOMPLETE: 2, // Session ended with incomplete tasks
};
/**
 * Commands allowed in init-only mode
 * When .claude is missing, only these commands are available
 */
const INIT_ONLY_ALLOWED_COMMANDS = ['help', 'init', 'exit'];
/**
 * All known commands (for unknown command detection)
 * Updated per spec 10_REPL_UX.md to include new commands
 */
const KNOWN_COMMANDS = [
    'help', 'init', 'model', 'start', 'continue',
    'status', 'tasks', 'approve', 'exit',
    // New commands per spec 10_REPL_UX.md
    'provider', 'models', 'keys', 'logs'
];
/**
 * Commands with slash prefix for tab completion
 * Per spec 10_REPL_UX.md: Tab completion for slash commands
 */
const SLASH_COMMANDS = KNOWN_COMMANDS.map(cmd => '/' + cmd);
/**
 * REPL Interface class
 */
class REPLInterface extends events_1.EventEmitter {
    config;
    rl = null;
    session;
    running = false;
    initOnlyMode = false;
    // Sequential input processing (prevents race conditions with piped input)
    inputQueue = [];
    isProcessingInput = false;
    // Multi-line input buffer (for voice input support - submit on empty line)
    multiLineBuffer = [];
    // Non-interactive mode support (per spec 10_REPL_UX.md)
    executionMode;
    exitCode = exports.EXIT_CODES.COMPLETE;
    hasError = false;
    hasIncompleteTasks = false;
    // Session completion tracking (prevents double completion)
    sessionCompleted = false;
    // Non-blocking task queue (allows input while tasks are running)
    taskQueue = [];
    isTaskWorkerRunning = false;
    // Project mode support (per spec 10_REPL_UX.md, Property 32, 33)
    projectMode;
    verificationRoot;
    tempVerificationRoot = null;
    // Command handlers
    initCommand;
    modelCommand;
    sessionCommands;
    statusCommands;
    // New command handlers per spec 10_REPL_UX.md
    providerCommand;
    modelsCommand;
    keysCommand;
    logsCommand;
    constructor(config = {}) {
        super();
        // Validate fixed mode configuration (Property 32)
        if (config.projectMode === 'fixed') {
            if (!config.projectRoot) {
                throw new Error('project-root is required when project-mode is fixed');
            }
            if (!fs.existsSync(config.projectRoot)) {
                throw new Error('project-root does not exist: ' + config.projectRoot);
            }
        }
        // Determine project mode
        this.projectMode = config.projectMode || 'temp';
        // Set verification root based on mode
        if (this.projectMode === 'fixed') {
            this.verificationRoot = config.projectRoot;
        }
        else {
            // Temp mode: create temporary directory immediately (synchronous)
            // This ensures getVerificationRoot() always returns a valid path
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-'));
            this.tempVerificationRoot = tempDir;
            this.verificationRoot = tempDir;
            // Create minimal .claude structure to avoid init-only mode
            const claudeDir = path.join(tempDir, '.claude');
            fs.mkdirSync(claudeDir, { recursive: true });
            const claudeMdContent = '# Temporary Project\n\nCreated by pm-orchestrator-runner in temp mode.\n';
            fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), claudeMdContent, 'utf-8');
            const settingsContent = JSON.stringify({
                project: { name: 'temp-project', version: '1.0.0' },
                pm: { autoStart: false },
            }, null, 2);
            fs.writeFileSync(path.join(claudeDir, 'settings.json'), settingsContent, 'utf-8');
        }
        // CRITICAL: In temp mode, use verificationRoot for projectPath and evidenceDir
        // This ensures files are created in the temp directory, not process.cwd()
        // In fixed mode, use projectRoot (from --project-root) if provided
        const resolvedProjectPath = this.projectMode === 'temp'
            ? this.verificationRoot
            : (config.projectRoot || config.projectPath || process.cwd());
        this.config = {
            projectPath: resolvedProjectPath,
            evidenceDir: config.evidenceDir || path.join(resolvedProjectPath, '.claude', 'evidence'),
            prompt: config.prompt || 'pm> ',
            // Default to 'api-key' mode - wrapper is the main use case
            // 'claude-code' mode is for advanced users who want to use Claude Code CLI directly
            authMode: config.authMode || 'api-key',
            timeout: config.timeout || 120000,
            forceNonInteractive: config.forceNonInteractive,
            projectMode: config.projectMode,
            projectRoot: config.projectRoot,
            printProjectPath: config.printProjectPath,
        };
        // Detect execution mode (per spec 10_REPL_UX.md)
        // Non-interactive when: stdin is not TTY, or forced via config/env
        this.executionMode = this.detectExecutionMode();
        this.session = {
            sessionId: null,
            projectPath: this.config.projectPath,
            runner: null,
            supervisor: null,
            status: 'idle',
            current_task_id: null,
            last_task_id: null,
        };
        // Initialize command handlers
        this.initCommand = new init_1.InitCommand();
        this.modelCommand = new model_1.ModelCommand();
        this.sessionCommands = new session_1.SessionCommands(this.session, this.config);
        this.statusCommands = new status_1.StatusCommands(this.session);
        // Initialize new command handlers
        this.providerCommand = new provider_1.ProviderCommand();
        this.modelsCommand = new models_1.ModelsCommand();
        this.keysCommand = new keys_1.KeysCommand();
        this.logsCommand = new logs_1.LogsCommand();
    }
    /**
     * Get project mode - per spec 10_REPL_UX.md
     * @returns Current project mode ('temp' or 'fixed')
     */
    getProjectMode() {
        return this.projectMode;
    }
    /**
     * Get verification root - per spec Property 32, 33
     * @returns Absolute path to verification root directory
     */
    getVerificationRoot() {
        return this.verificationRoot;
    }
    /**
     * Initialize for use - called by start() or manually for testing
     * Handles project path setup and PROJECT_PATH output
     */
    async initialize() {
        // Initialize temp project root if in temp mode
        if (this.projectMode === 'temp' && !this.verificationRoot) {
            await this.initializeTempProjectRoot();
        }
        // Output PROJECT_PATH if requested (per spec 10_REPL_UX.md)
        // Emit 'output' event for programmatic access (tests, wrappers)
        // Also print to stdout for shell script parsing
        if (this.config.printProjectPath) {
            const projectPathLine = 'PROJECT_PATH=' + this.verificationRoot;
            this.emit('output', projectPathLine);
            console.log(projectPathLine);
        }
    }
    /**
     * Initialize temporary project root - per spec Property 32
     * Creates a temporary directory for verification_root in temp mode
     * Also creates minimal .claude structure to avoid init-only mode
     */
    async initializeTempProjectRoot() {
        if (this.projectMode !== 'temp') {
            return;
        }
        // Create temp directory
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-runner-'));
        this.tempVerificationRoot = tempDir;
        this.verificationRoot = tempDir;
        // Create minimal .claude structure for temp mode
        // This prevents init-only mode and allows /start to work immediately
        const claudeDir = path.join(tempDir, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        // Create minimal CLAUDE.md
        const claudeMdContent = '# Temporary Project\n\nCreated by pm-orchestrator-runner in temp mode.\n';
        fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), claudeMdContent, 'utf-8');
        // Create minimal settings.json
        const settingsContent = JSON.stringify({
            project: { name: 'temp-project', version: '1.0.0' },
            pm: { autoStart: false },
        }, null, 2);
        fs.writeFileSync(path.join(claudeDir, 'settings.json'), settingsContent, 'utf-8');
        // Update config.projectPath to point to temp directory
        // This ensures validateProjectStructure checks the right path
        this.config.projectPath = tempDir;
        this.session.projectPath = tempDir;
    }
    /**
     * Verify files and return verification records - per spec Property 33
     * @param absolutePaths - Array of absolute file paths to verify
     * @returns Array of VerifiedFile records with relative paths
     */
    verifyFiles(absolutePaths) {
        const now = new Date().toISOString();
        return absolutePaths.map(absolutePath => {
            // Convert to relative path from verification_root
            const relativePath = path.relative(this.verificationRoot, absolutePath);
            return {
                path: relativePath,
                exists: fs.existsSync(absolutePath),
                detected_at: now,
                detection_method: 'diff',
            };
        });
    }
    /**
     * Create a TaskLog with verification info - per spec Property 33
     * @param taskId - Task identifier
     * @param description - Task description
     * @returns TaskLog with verification_root populated
     */
    createTaskLog(taskId, description) {
        return {
            task_id: taskId,
            description,
            verification_root: this.verificationRoot,
            created_at: new Date().toISOString(),
        };
    }
    /**
     * Cleanup resources - handles temp directory cleanup
     * Per spec Property 32: temp mode directories may be cleaned up
     */
    async cleanup() {
        if (this.session.supervisor) {
            this.session.supervisor.stop();
        }
        // Note: In temp mode, we don't forcefully delete the temp directory
        // The OS will clean it up eventually, and leaving it allows for debugging
        // In fixed mode, the directory persists as expected
    }
    /**
     * Check API key status and show warning if not configured
     * API keys are stored in global config file (~/.pm-orchestrator-runner/config.json)
     */
    async checkApiKeyStatus() {
        // Check global config for API keys
        const hasKey = (0, global_config_1.hasAnyApiKey)();
        if (!hasKey) {
            // Show prominent warning
            console.log('');
            console.log('============================================================');
            console.log('  WARNING: No API key configured!');
            console.log('============================================================');
            console.log('');
            console.log('This application requires an API key to function.');
            console.log('');
            console.log('To set up your API key, use one of these commands:');
            console.log('');
            console.log('  /keys set openai <your-openai-api-key>');
            console.log('  /keys set anthropic <your-anthropic-api-key>');
            console.log('');
            console.log('API keys are stored securely in:');
            console.log('  ' + (0, global_config_1.getConfigFilePath)());
            console.log('');
            console.log('You can also check current key status with: /keys');
            console.log('============================================================');
            console.log('');
        }
        else {
            // Check which keys are set and show status
            const openaiKey = (0, global_config_1.getApiKey)('openai');
            const anthropicKey = (0, global_config_1.getApiKey)('anthropic');
            console.log('');
            console.log('API Key Status:');
            console.log('  OpenAI: ' + (openaiKey ? 'Configured' : 'Not set'));
            console.log('  Anthropic: ' + (anthropicKey ? 'Configured' : 'Not set'));
            console.log('');
        }
    }
    /**
     * Start the REPL
     * Per spec 10_REPL_UX.md L45: validate project structure on startup
     *
     * If .claude is missing, enter init-only mode instead of throwing.
     * In init-only mode, only /help, /init, /exit are available.
     *
     * API Key Check:
     * - In api-key mode, check for API keys in global config
     * - Show warning if not configured, with instructions to set up
     */
    async start() {
        // Initialize project root
        await this.initialize();
        // Check API keys for api-key mode
        if (this.config.authMode === 'api-key') {
            await this.checkApiKeyStatus();
        }
        // Validate project structure per spec 10_REPL_UX.md L45
        const validation = await this.validateProjectStructure();
        if (!validation.valid) {
            // Enter init-only mode instead of failing
            this.initOnlyMode = true;
            console.log('');
            console.log('WARNING: Project not initialized');
            for (const error of validation.errors) {
                console.log('  - ' + error);
            }
            console.log('');
            console.log('Entering init-only mode.');
            console.log('Only /help, /init, and /exit are available.');
            console.log('Run /init to initialize the project structure.');
            console.log('');
        }
        else {
            this.initOnlyMode = false;
        }
        this.running = true;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: this.config.prompt,
            completer: this.completer.bind(this),
        });
        // Print welcome message (or init-only mode reminder)
        if (!this.initOnlyMode) {
            this.printWelcome();
        }
        this.rl.prompt();
        this.rl.on('line', (line) => {
            // Queue-based sequential processing to prevent race conditions
            // This ensures /start completes before subsequent commands are processed
            this.enqueueInput(line);
        });
        // Return a promise that resolves when REPL exits
        // CRITICAL: Single 'close' handler to avoid race conditions
        // Previous bug: two handlers - one waiting for queue drain, one resolving immediately
        return new Promise((resolve) => {
            this.rl.on('close', async () => {
                // In non-interactive mode, wait for all queued input to be processed
                // This ensures all commands complete before EOF handling
                if (this.executionMode === 'non_interactive') {
                    // Wait for input queue to drain, OR exit immediately if running is false
                    // running = false means /exit was called, so remaining queue items should be ignored
                    while ((this.inputQueue.length > 0 || this.isProcessingInput) && this.running) {
                        await new Promise(r => setTimeout(r, 10));
                    }
                }
                this.running = false;
                // Ensure all output is flushed before cleanup
                await this.flushStdout();
                await this.cleanup();
                // In non-interactive mode, set process exit code
                if (this.executionMode === 'non_interactive') {
                    this.updateExitCode();
                    process.exitCode = this.exitCode;
                }
                resolve();
            });
        });
    }
    /**
     * Process input line
     */
    async processInput(input) {
        if (input.startsWith('/')) {
            await this.processCommand(input);
        }
        else {
            await this.processNaturalLanguage(input);
        }
    }
    /**
     * Enqueue input for sequential processing
     * This prevents race conditions when piped input arrives faster than processing
     *
     * Multi-line input support (for voice input like SuperWhisper):
     * - Non-empty lines are accumulated in multiLineBuffer
     * - Empty line triggers submission of accumulated content
     * - This allows long messages with newlines to be sent together
     */
    enqueueInput(line) {
        const trimmed = line.trim();
        if (!trimmed) {
            // Empty line - submit accumulated multi-line buffer
            if (this.multiLineBuffer.length > 0) {
                // Join accumulated lines and submit as single input
                const fullInput = this.multiLineBuffer.join('\n');
                this.multiLineBuffer = [];
                this.inputQueue.push(fullInput);
                // Start processing if not already processing
                this.processQueue();
            }
            else {
                // No buffered content - just show prompt if not processing
                if (!this.isProcessingInput && this.running) {
                    this.rl?.prompt();
                }
            }
            return;
        }
        // Slash commands are processed immediately (no multi-line buffering)
        if (trimmed.startsWith('/')) {
            // Flush any pending multi-line buffer first
            if (this.multiLineBuffer.length > 0) {
                const fullInput = this.multiLineBuffer.join('\n');
                this.multiLineBuffer = [];
                this.inputQueue.push(fullInput);
            }
            // Process slash command immediately
            this.inputQueue.push(trimmed);
            this.processQueue();
            return;
        }
        // Non-empty line without slash - accumulate in multi-line buffer
        this.multiLineBuffer.push(trimmed);
        // In non-interactive mode, no empty line expected - process immediately
        if (this.executionMode === 'non_interactive') {
            const fullInput = this.multiLineBuffer.join('\n');
            this.multiLineBuffer = [];
            this.inputQueue.push(fullInput);
            this.processQueue();
            return;
        }
        // In interactive mode, show continuation indicator
        if (this.running && !this.isProcessingInput) {
            // Show continuation prompt to indicate multi-line mode
            process.stdout.write('... ');
        }
    }
    /**
     * Process queued inputs sequentially
     * Ensures each input completes before the next one starts
     * Per spec 10_REPL_UX.md: Sequential Processing Guarantee
     */
    async processQueue() {
        // Already processing - let the current processor handle the queue
        if (this.isProcessingInput) {
            return;
        }
        this.isProcessingInput = true;
        try {
            while (this.inputQueue.length > 0 && this.running) {
                const input = this.inputQueue.shift();
                try {
                    await this.processInput(input);
                }
                catch (err) {
                    this.printError(err);
                }
                // In non-interactive mode, flush output after each command
                // This ensures output is visible before processing next command
                if (this.executionMode === 'non_interactive') {
                    await this.flushStdout();
                }
                // Show prompt after each input if still running (interactive mode only)
                if (this.running && this.inputQueue.length === 0) {
                    if (this.executionMode === 'interactive') {
                        this.rl?.prompt();
                    }
                }
            }
        }
        finally {
            this.isProcessingInput = false;
        }
    }
    /**
     * Process slash command
     * Per spec 10_REPL_UX.md L66: All commands must return a status (fail-closed)
     *
     * In init-only mode, only /help, /init, /exit are allowed.
     * Other commands return ERROR with instruction to run /init first.
     */
    async processCommand(input) {
        const parts = input.slice(1).split(/\s+/);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        // First check if command is known (E201 for unknown takes precedence)
        if (!KNOWN_COMMANDS.includes(command)) {
            // Per spec 10_REPL_UX.md L66: Unknown commands must return ERROR
            this.print('Unknown command: /' + command);
            this.print('Type /help for available commands.');
            return {
                success: false,
                error: {
                    code: 'E201',
                    message: 'Unknown command: /' + command + '. Type /help for available commands.',
                },
            };
        }
        // Check if in init-only mode
        const isInitOnly = await this.isInitOnlyMode();
        // In init-only mode, block commands that require .claude
        if (isInitOnly && !INIT_ONLY_ALLOWED_COMMANDS.includes(command)) {
            this.print('ERROR: Cannot run /' + command + ' - project not initialized.');
            this.print('Run /init first to create .claude directory.');
            return {
                success: false,
                error: {
                    code: 'E301',
                    message: 'Cannot run /' + command + ' in init-only mode. Run /init first to initialize the project.',
                },
            };
        }
        switch (command) {
            case 'help':
                this.printHelp();
                return { success: true };
            case 'init':
                return await this.handleInit(args);
            case 'model':
                return await this.handleModel(args);
            case 'tasks':
                await this.handleTasks();
                return { success: true };
            case 'status':
                await this.handleStatus();
                return { success: true };
            case 'start':
                return await this.handleStart(args);
            case 'continue':
                return await this.handleContinue(args);
            case 'approve':
                return await this.handleApprove();
            case 'exit':
                await this.handleExit();
                return { success: true };
            // New commands per spec 10_REPL_UX.md
            case 'provider':
                return await this.handleProvider(args);
            case 'models':
                return await this.handleModels(args);
            case 'keys':
                return await this.handleKeys(args);
            case 'logs':
                return await this.handleLogs(args);
            default:
                // This should never be reached since unknown commands are handled above
                // If we reach here, KNOWN_COMMANDS list is inconsistent with switch cases
                throw new Error('Internal error: command "' + command + '" is in KNOWN_COMMANDS but not handled in switch');
        }
    }
    /**
     * Check if input is a bare "exit" typo (should use /exit)
     * Per spec 10_REPL_UX.md: Exit Typo Safety
     * Pattern: ^exit\s*$ (case-insensitive, trimmed)
     */
    isExitTypo(input) {
        const trimmed = input.trim().toLowerCase();
        return trimmed === 'exit';
    }
    /**
     * Process natural language input - NON-BLOCKING
     * Per spec 10_REPL_UX.md L117-118: Model selection is REPL-local
     * Model is read from .claude/repl.json and passed to executor via runner
     *
     * Non-blocking design:
     * - Creates task and adds to queue immediately
     * - Returns control to input prompt right away
     * - Background worker processes tasks asynchronously
     *
     * Auto-start: In non-interactive mode, automatically start a session if none exists
     * This improves CLI usability for piped input and scripting
     *
     * Exit Typo Safety (per spec 10_REPL_UX.md):
     * - Detects bare "exit" input (without slash)
     * - Shows error and suggests /exit
     * - Never passes "exit" to Claude Code
     */
    async processNaturalLanguage(input) {
        console.log(`[DEBUG processNaturalLanguage] start, input="${input}"`);
        // Exit Typo Safety: Block bare "exit" input
        // Per spec 10_REPL_UX.md: fail-closed - 2 lines max, return to input
        if (this.isExitTypo(input)) {
            this.print('ERROR: Did you mean /exit?');
            this.print('HINT: /exit');
            return;
        }
        // Auto-start session for any natural language input (no /start required)
        // Per redesign: natural language input = automatic task creation
        if (this.session.status !== 'running') {
            console.log('[DEBUG processNaturalLanguage] auto-starting session');
            this.print('');
            this.print('[Auto-starting session...]');
            const startResult = await this.handleStart([]);
            if (!startResult.success) {
                this.print('Failed to auto-start session: ' + (startResult.error?.message || 'Unknown error'));
                return;
            }
        }
        if (!this.session.runner) {
            this.print('Runner not initialized. Use /start first.');
            return;
        }
        // Generate task ID
        // Per spec 05_DATA_MODELS.md Property 38
        const taskId = 'task-' + Date.now();
        // Create queued task
        const queuedTask = {
            id: taskId,
            description: input,
            state: 'QUEUED',
            queuedAt: Date.now(),
            startedAt: null,
            completedAt: null,
        };
        // Add to task queue
        this.taskQueue.push(queuedTask);
        // Display task queued info (per redesign: visibility)
        // Per user requirement: Provider/Mode/Auth must be shown at task start
        this.print('');
        this.print('--- Task Queued ---');
        this.print('Task ID: ' + taskId);
        this.print('State: QUEUED');
        // Show LLM layer info (Provider/Mode/Auth) - per redesign requirement
        if (this.config.authMode === 'claude-code') {
            this.print('Provider: Claude Code CLI (uses your Claude subscription, no API key required)');
        }
        else if (this.config.authMode === 'api-key') {
            this.print('Provider: Anthropic API (API key configured)');
        }
        else {
            this.print('Provider: ' + this.config.authMode);
        }
        // Show prompt summary (first 100 chars)
        const promptSummary = input.length > 100 ? input.substring(0, 100) + '...' : input;
        this.print('Prompt: ' + promptSummary);
        this.print('-------------------');
        this.print('');
        this.print('(Input is not blocked - you can submit more tasks with /tasks to view status)');
        this.print('');
        // Start background worker if not running
        // The worker runs asynchronously - we don't await it
        if (!this.isTaskWorkerRunning) {
            this.startTaskWorker();
        }
        console.log(`[DEBUG processNaturalLanguage] task queued, returning immediately`);
    }
    /**
     * Background task worker - processes queued tasks asynchronously
     * Runs in background, allowing input to continue while tasks execute
     */
    async startTaskWorker() {
        if (this.isTaskWorkerRunning) {
            return;
        }
        this.isTaskWorkerRunning = true;
        console.log('[DEBUG startTaskWorker] worker started');
        try {
            while (this.running) {
                // Find next QUEUED task
                const nextTask = this.taskQueue.find(t => t.state === 'QUEUED');
                if (!nextTask) {
                    // No more queued tasks - worker exits
                    break;
                }
                // Execute the task
                await this.executeQueuedTask(nextTask);
            }
        }
        finally {
            this.isTaskWorkerRunning = false;
            console.log('[DEBUG startTaskWorker] worker stopped');
        }
    }
    /**
     * Execute a single queued task
     * Updates task state and prints results
     */
    async executeQueuedTask(task) {
        console.log(`[DEBUG executeQueuedTask] starting task ${task.id}`);
        // Update state to RUNNING
        task.state = 'RUNNING';
        task.startedAt = Date.now();
        this.session.current_task_id = task.id;
        // Print status update
        this.print('');
        this.print('--- Task Started ---');
        this.print('Task ID: ' + task.id);
        this.print('State: RUNNING');
        this.print('--------------------');
        try {
            // Per spec 10_REPL_UX.md L117-118: Get selected model from REPL config
            let selectedModel;
            const modelResult = await this.modelCommand.getModel(this.session.projectPath);
            if (modelResult.success && modelResult.model && modelResult.model !== 'UNSET') {
                selectedModel = modelResult.model;
            }
            console.log(`[DEBUG executeQueuedTask] calling runner.execute...`);
            const result = await this.session.runner.execute({
                tasks: [{
                        id: task.id,
                        description: task.description,
                        naturalLanguageTask: task.description,
                    }],
                selectedModel,
            });
            console.log(`[DEBUG executeQueuedTask] runner.execute returned, status=${result.overall_status}`);
            // Update task state based on result
            task.completedAt = Date.now();
            task.resultStatus = result.overall_status;
            task.filesModified = result.files_modified;
            task.responseSummary = result.executor_output_summary;
            switch (result.overall_status) {
                case enums_1.OverallStatus.COMPLETE:
                    task.state = 'COMPLETE';
                    break;
                case enums_1.OverallStatus.INCOMPLETE:
                    task.state = 'INCOMPLETE';
                    break;
                case enums_1.OverallStatus.ERROR:
                    task.state = 'ERROR';
                    task.errorMessage = result.error?.message;
                    break;
                default:
                    task.state = 'COMPLETE';
            }
            // Handle INCOMPLETE with clarification (but don't block)
            if (result.overall_status === enums_1.OverallStatus.INCOMPLETE &&
                result.incomplete_task_reasons &&
                result.incomplete_task_reasons.length > 0) {
                await this.handleClarificationNeeded(task.description, result.incomplete_task_reasons);
            }
            this.printExecutionResult(result);
        }
        catch (err) {
            console.log(`[DEBUG executeQueuedTask] error: ${err.message}`);
            task.state = 'ERROR';
            task.completedAt = Date.now();
            task.errorMessage = err.message;
            this.printError(err);
        }
        finally {
            // Clear current_task_id
            this.session.last_task_id = this.session.current_task_id;
            this.session.current_task_id = null;
        }
        console.log(`[DEBUG executeQueuedTask] task ${task.id} done, state=${task.state}`);
    }
    /**
     * Handle clarification needed - prompt user interactively
     * Returns true if clarification was requested (and will be processed separately)
     */
    async handleClarificationNeeded(originalInput, reasons) {
        // Parse the clarification reason
        for (const item of reasons) {
            const reason = item.reason;
            // Handle target_file_ambiguous - ask where to save
            if (reason.includes('target_file_ambiguous')) {
                this.print('');
                this.print('--- Clarification Needed ---');
                this.print('');
                this.print('Task: ' + originalInput);
                this.print('');
                this.print('Question: Where should the file be saved?');
                this.print('');
                this.print('Suggestions:');
                this.print('  1. docs/spec.md');
                this.print('  2. README.md');
                this.print('  3. Enter a custom path');
                this.print('');
                this.print('Please specify the file path in your next input.');
                this.print('Example: "Save to docs/clipboard-tool-spec.md"');
                this.print('');
                this.print('Or rephrase your request with the file path included:');
                this.print('Example: "Create docs/clipboard-tool-spec.md with the specification for a clipboard tool"');
                this.print('----------------------------');
                this.print('');
                return true;
            }
            // Handle other clarification types
            if (reason.includes('clarification_required')) {
                this.print('');
                this.print('--- Clarification Needed ---');
                this.print('');
                this.print('Task: ' + originalInput);
                this.print('Issue: ' + reason);
                this.print('');
                this.print('Please provide more details in your next input.');
                this.print('----------------------------');
                this.print('');
                return true;
            }
        }
        return false;
    }
    /**
     * Print welcome message with clear auth status
     */
    printWelcome() {
        this.print('');
        this.print('PM Orchestrator Runner - Interactive Mode');
        this.print('=========================================');
        this.print('Project: ' + this.session.projectPath);
        this.print('Project Mode: ' + this.projectMode);
        if (this.projectMode === 'fixed') {
            this.print('Verification Root: ' + this.verificationRoot);
        }
        this.print('');
        // Clear auth status display
        this.print('Authentication Status:');
        if (this.config.authMode === 'claude-code') {
            this.print('  Provider: Claude Code CLI');
            this.print('  API Key: Not required (uses your Claude subscription)');
            this.print('  Status: Ready');
        }
        else {
            // Check for API keys when using API mode
            const anthropicKey = process.env.ANTHROPIC_API_KEY;
            const openaiKey = process.env.OPENAI_API_KEY;
            this.print('  Provider: API Mode');
            this.print('  ANTHROPIC_API_KEY: ' + (anthropicKey ? 'SET' : 'NOT SET'));
            this.print('  OPENAI_API_KEY: ' + (openaiKey ? 'SET' : 'NOT SET'));
            if (!anthropicKey && !openaiKey) {
                this.print('');
                this.print('  WARNING: No API keys configured!');
                this.print('  Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
            }
        }
        this.print('');
        this.print('Type /help for available commands, or just describe your task.');
        this.print('');
    }
    /**
     * Print help
     */
    printHelp() {
        this.print('');
        this.print('PM Orchestrator Runner - Commands');
        this.print('=================================');
        this.print('');
        this.print('  /help                Show this help message');
        this.print('  /init                Initialize .claude/ directory in current project');
        this.print('');
        this.print('Provider/Model Configuration:');
        this.print('  /provider            Show current provider');
        this.print('  /provider show       List all available providers');
        this.print('  /provider <name>     Set provider (claude-code, openai, anthropic)');
        this.print('  /models              List models for current provider');
        this.print('  /models <provider>   List models for specific provider');
        this.print('  /model               Show current model configuration');
        this.print('  /model <name>        Set model (saves to .claude/repl.json)');
        this.print('  /keys                Show API key status (SET/NOT SET)');
        this.print('  /keys set <p> <key>  Set API key (openai or anthropic)');
        this.print('');
        this.print('Session Management:');
        this.print('  /start [path]        Start a new session (optional project path)');
        this.print('  /continue [session]  Continue a paused session');
        this.print('  /status              Show session status and phase');
        this.print('  /tasks               Show tasks in current session');
        this.print('  /approve             Approve continuation for INCOMPLETE session');
        this.print('');
        this.print('Logging:');
        this.print('  /logs                List task logs for current session');
        this.print('  /logs <task-id>      Show task details (summary view)');
        this.print('  /logs <task-id> --full  Show task details with executor logs');
        this.print('');
        this.print('Other:');
        this.print('  /exit                Exit REPL (saves state)');
        this.print('');
        this.print('Natural Language:');
        this.print('  Just type your task description without a slash prefix.');
        this.print('  Example: "Create an HTTP server with /health endpoint"');
        this.print('');
        this.print('Auth Mode: ' + this.config.authMode);
        this.print('  L1 (read-only subagents) use Claude Code CLI - no API key needed.');
        this.print('  L2 (executor) also uses Claude Code CLI integration.');
        this.print('');
    }
    /**
     * Handle /init command
     */
    async handleInit(args) {
        const targetPath = args[0] || this.session.projectPath;
        const result = await this.initCommand.execute(targetPath);
        if (result.success) {
            this.print(result.message);
            this.print('');
            this.print('Next: /start to begin a session');
            return { success: true };
        }
        else {
            this.print('Error: ' + result.message);
            return {
                success: false,
                error: {
                    code: 'E101',
                    message: result.message,
                },
            };
        }
    }
    /**
     * Handle /model command
     * Per spec 10_REPL_UX.md L113-143:
     * - /model displays current model or "UNSET"
     * - /model <name> sets model and generates Evidence
     * - .claude/ missing -> E101 ERROR
     * - JSON parse error -> E105 ERROR
     */
    async handleModel(args) {
        if (args.length === 0) {
            const result = await this.modelCommand.getModel(this.session.projectPath);
            if (result.success) {
                // Per spec 10_REPL_UX.md L133: Display "UNSET" if not configured
                this.print('Current model: ' + result.model);
                if (result.configPath) {
                    this.print('Config file: ' + result.configPath);
                }
                return { success: true };
            }
            else {
                // Per spec 10_REPL_UX.md L137-138: E101 or E105
                this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
                return {
                    success: false,
                    error: result.error || { code: 'E105', message: result.message || 'Unknown error' },
                };
            }
        }
        else {
            const result = await this.modelCommand.setModel(this.session.projectPath, args[0]);
            if (result.success) {
                this.print('Model set to: ' + args[0]);
                this.print('Saved to: ' + result.configPath);
                if (result.evidencePath) {
                    this.print('Evidence: ' + result.evidencePath);
                }
                return { success: true };
            }
            else {
                // Per spec 10_REPL_UX.md L137: E101 if .claude/ missing
                const errorCode = result.error?.code || 'E102';
                const errorMessage = result.error?.message || result.message || 'Failed to set model';
                this.print('Error [' + errorCode + ']: ' + errorMessage);
                return {
                    success: false,
                    error: { code: errorCode, message: errorMessage },
                };
            }
        }
    }
    /**
     * Handle /provider command
     * Per spec 10_REPL_UX.md Section 2.1
     */
    async handleProvider(args) {
        if (args.length === 0) {
            // /provider - show current
            const result = await this.providerCommand.getProvider(this.session.projectPath);
            if (result.success) {
                const output = this.providerCommand.formatCurrentProvider(result.provider || 'UNSET');
                this.print(output);
                return { success: true };
            }
            else {
                this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
                return { success: false, error: result.error };
            }
        }
        else if (args[0] === 'show') {
            // /provider show - list all
            const result = await this.providerCommand.listProviders();
            const currentResult = await this.providerCommand.getProvider(this.session.projectPath);
            const currentProvider = currentResult.success ? currentResult.provider : undefined;
            const output = this.providerCommand.formatProviderList(result.providers || [], currentProvider);
            this.print(output);
            return { success: true };
        }
        else {
            // /provider <name> - set provider
            const result = await this.providerCommand.setProvider(this.session.projectPath, args[0]);
            if (result.success) {
                this.print('Provider set to: ' + args[0]);
                this.print('Saved to: ' + result.configPath);
                this.print('Note: Model selection has been reset. Use /models to see available models.');
                if (result.evidencePath) {
                    this.print('Evidence: ' + result.evidencePath);
                }
                return { success: true };
            }
            else {
                this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
                return { success: false, error: result.error };
            }
        }
    }
    /**
     * Handle /models command
     * Per spec 10_REPL_UX.md Section 2.2
     */
    async handleModels(args) {
        const providerId = args.length > 0 ? args[0] : undefined;
        const result = await this.modelsCommand.listModels(this.session.projectPath, providerId);
        if (result.success) {
            const output = this.modelsCommand.formatModelList(result.models || [], result.currentModel, result.provider);
            this.print(output);
            return { success: true };
        }
        else {
            this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
            return { success: false, error: result.error };
        }
    }
    /**
     * Handle /keys command
     * Per spec 10_REPL_UX.md Section 2.3
     *
     * /keys              - Show status of all API keys
     * /keys set <p> <k>  - Set API key for provider
     * /keys <provider>   - Check specific provider
     */
    async handleKeys(args) {
        let result;
        // /keys set <provider> <key>
        if (args.length >= 3 && args[0] === 'set') {
            const provider = args[1];
            const key = args[2];
            result = await this.keysCommand.setKey(provider, key);
            if (result.success) {
                this.print('API key set successfully for ' + provider);
                this.print('Saved to: ' + (0, global_config_1.getConfigFilePath)());
                return { success: true };
            }
            else {
                this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
                return { success: false, error: result.error };
            }
        }
        // /keys <provider> - check specific provider
        if (args.length > 0 && args[0] !== 'set') {
            result = await this.keysCommand.checkProviderKey(args[0]);
        }
        else if (args.length === 0) {
            // /keys - show all
            result = await this.keysCommand.getKeyStatus();
        }
        else {
            // /keys set without enough args
            this.print('Usage: /keys set <provider> <api-key>');
            this.print('  provider: openai or anthropic');
            return {
                success: false,
                error: {
                    code: 'E107',
                    message: 'Invalid arguments. Usage: /keys set <provider> <api-key>',
                },
            };
        }
        if (result.success) {
            const output = this.keysCommand.formatKeyStatus(result.keys || []);
            this.print(output);
            return { success: true };
        }
        else {
            this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
            return { success: false, error: result.error };
        }
    }
    /**
     * Handle /logs command
     * Per spec 10_REPL_UX.md Section 2.4
     */
    async handleLogs(args) {
        if (args.length === 0) {
            // /logs - list all logs for current session
            if (!this.session.sessionId) {
                this.print('No active session. Use /start to begin a session.');
                return {
                    success: false,
                    error: { code: 'E104', message: 'No active session' },
                };
            }
            const result = await this.logsCommand.listLogs(this.session.projectPath, this.session.sessionId);
            if (result.success) {
                this.print(result.output || 'No logs found.');
                return { success: true };
            }
            else {
                this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
                return { success: false, error: result.error };
            }
        }
        else {
            // /logs <task-id> [--full]
            const taskId = args[0];
            const full = args.includes('--full');
            // Per redesign: Pass sessionId for visibility fields
            const result = await this.logsCommand.getTaskDetail(this.session.projectPath, taskId, full, this.session.sessionId ?? undefined);
            if (result.success) {
                this.print(result.output || 'No log detail found.');
                return { success: true };
            }
            else {
                this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
                return { success: false, error: result.error };
            }
        }
    }
    /**
     * Handle /tasks command
     * Shows task queue with RUNNING/QUEUED/COMPLETE/ERROR/INCOMPLETE states
     * Per redesign: proves non-blocking by showing multiple tasks simultaneously
     */
    async handleTasks() {
        this.print('');
        this.print('=== Task Queue ===');
        this.print('');
        if (this.taskQueue.length === 0) {
            this.print('No tasks in queue.');
            this.print('');
            // Also show legacy tasks from statusCommands if available
            const legacyResult = await this.statusCommands.getTasks();
            if (legacyResult && legacyResult.trim()) {
                this.print('--- Session Tasks ---');
                this.print(legacyResult);
            }
            return;
        }
        // Count by state
        const running = this.taskQueue.filter(t => t.state === 'RUNNING').length;
        const queued = this.taskQueue.filter(t => t.state === 'QUEUED').length;
        const complete = this.taskQueue.filter(t => t.state === 'COMPLETE').length;
        const incomplete = this.taskQueue.filter(t => t.state === 'INCOMPLETE').length;
        const error = this.taskQueue.filter(t => t.state === 'ERROR').length;
        this.print('Summary: ' + running + ' RUNNING, ' + queued + ' QUEUED, ' + complete + ' COMPLETE, ' + incomplete + ' INCOMPLETE, ' + error + ' ERROR');
        this.print('');
        // List all tasks with state
        for (const task of this.taskQueue) {
            const promptSummary = task.description.length > 50
                ? task.description.substring(0, 50) + '...'
                : task.description;
            let durationStr = '';
            if (task.startedAt) {
                const endTime = task.completedAt || Date.now();
                const durationMs = endTime - task.startedAt;
                durationStr = ' (' + (durationMs / 1000).toFixed(1) + 's)';
            }
            // State indicator with visual marker
            let stateMarker = '';
            switch (task.state) {
                case 'RUNNING':
                    stateMarker = '[*]';
                    break;
                case 'QUEUED':
                    stateMarker = '[ ]';
                    break;
                case 'COMPLETE':
                    stateMarker = '[v]';
                    break;
                case 'INCOMPLETE':
                    stateMarker = '[!]';
                    break;
                case 'ERROR':
                    stateMarker = '[X]';
                    break;
            }
            this.print(stateMarker + ' ' + task.id + ' | ' + task.state + durationStr);
            this.print('    ' + promptSummary);
            // Show error message if error
            if (task.state === 'ERROR' && task.errorMessage) {
                this.print('    Error: ' + task.errorMessage);
            }
            // Show files modified if complete
            if (task.state === 'COMPLETE' && task.filesModified && task.filesModified.length > 0) {
                this.print('    Files: ' + task.filesModified.slice(0, 3).join(', ') +
                    (task.filesModified.length > 3 ? ' (+' + (task.filesModified.length - 3) + ' more)' : ''));
            }
        }
        this.print('');
        this.print('Use /logs <task-id> for details.');
        this.print('==================');
        this.print('');
    }
    /**
     * Handle /status command
     */
    async handleStatus() {
        const result = await this.statusCommands.getStatus();
        this.print(result);
    }
    /**
     * Handle /start command
     * Per spec Property 32, 33: Use verification_root for file operations in temp mode
     */
    async handleStart(args) {
        // In temp mode, use verificationRoot for file operations
        // In fixed mode or with explicit args, use the provided/session path
        const projectPath = args[0] ||
            (this.projectMode === 'temp' ? this.verificationRoot : this.session.projectPath);
        try {
            const result = await this.sessionCommands.start(projectPath);
            if (result.success) {
                this.session.sessionId = result.sessionId;
                this.session.runner = result.runner;
                this.session.status = 'running';
                // Keep session.projectPath as verificationRoot in temp mode
                this.session.projectPath = projectPath;
                // Initialize supervisor
                const supervisorConfig = {
                    checkIntervalMs: 5000,
                    maxRetries: 3,
                    timeoutMs: this.config.evidenceDir ? 300000 : 300000,
                };
                this.session.supervisor = new executor_supervisor_1.ExecutorSupervisor(this.session.runner, supervisorConfig);
                this.print('Session started: ' + result.sessionId);
                this.print('Project: ' + projectPath);
                this.print('');
                this.print('You can now describe tasks in natural language.');
                return { success: true };
            }
            else {
                this.print('Error: ' + result.message);
                return {
                    success: false,
                    error: { code: 'E103', message: result.message || 'Failed to start session' },
                };
            }
        }
        catch (err) {
            this.printError(err);
            return {
                success: false,
                error: { code: 'E103', message: err.message },
            };
        }
    }
    /**
     * Handle /continue command
     */
    async handleContinue(args) {
        const sessionId = args[0] || this.session.sessionId;
        if (!sessionId) {
            this.print('No session to continue. Provide a session ID or start a new session.');
            return {
                success: false,
                error: { code: 'E104', message: 'No session to continue' },
            };
        }
        try {
            const result = await this.sessionCommands.continueSession(sessionId);
            if (result.success) {
                this.session.sessionId = sessionId;
                this.session.runner = result.runner;
                this.session.status = 'running';
                this.print('Session resumed: ' + sessionId);
                return { success: true };
            }
            else {
                this.print('Error: ' + result.message);
                return {
                    success: false,
                    error: { code: 'E104', message: result.message || 'Failed to continue session' },
                };
            }
        }
        catch (err) {
            this.printError(err);
            return {
                success: false,
                error: { code: 'E104', message: err.message },
            };
        }
    }
    /**
     * Handle /approve command
     */
    async handleApprove() {
        if (!this.session.sessionId) {
            this.print('No active session to approve.');
            return {
                success: false,
                error: { code: 'E106', message: 'No active session to approve' },
            };
        }
        try {
            const result = await this.sessionCommands.approve(this.session.sessionId);
            if (result.success) {
                this.print('Continuation approved.');
                this.print('Use /continue to resume execution.');
                return { success: true };
            }
            else {
                this.print('Error: ' + result.message);
                return {
                    success: false,
                    error: { code: 'E106', message: result.message || 'Failed to approve' },
                };
            }
        }
        catch (err) {
            this.printError(err);
            return {
                success: false,
                error: { code: 'E106', message: err.message },
            };
        }
    }
    /**
     * Handle /exit command
     * Per spec 10_REPL_UX.md: Ensure clean exit with flushed output
     *
     * Guarantees:
     * - Waits for running tasks to complete (task worker)
     * - Session state is persisted before exit
     * - All output is flushed before readline closes
     * - Double-completion is prevented via sessionCompleted flag
     */
    async handleExit() {
        // Prevent double completion (e.g., if /exit is called multiple times)
        if (this.sessionCompleted) {
            this.print('Session already completed, closing...');
            this.running = false;
            this.rl?.close();
            return;
        }
        this.sessionCompleted = true;
        // Wait for task worker to complete any running tasks
        if (this.isTaskWorkerRunning) {
            const runningTasks = this.taskQueue.filter(t => t.state === 'RUNNING');
            const queuedTasks = this.taskQueue.filter(t => t.state === 'QUEUED');
            if (runningTasks.length > 0 || queuedTasks.length > 0) {
                this.print('Waiting for ' + runningTasks.length + ' running and ' + queuedTasks.length + ' queued tasks to complete...');
            }
            while (this.isTaskWorkerRunning) {
                await new Promise(r => setTimeout(r, 100));
            }
            this.print('All tasks completed.');
        }
        this.print('Saving session state...');
        if (this.session.runner && this.session.sessionId) {
            try {
                // Complete the session first (updates status from RUNNING to COMPLETED/FAILED)
                const failed = this.hasError || this.hasIncompleteTasks;
                await this.session.runner.completeSession(failed);
                await this.session.runner.saveState();
                this.print('Session saved: ' + this.session.sessionId);
            }
            catch (err) {
                // Log error but ensure status is updated for exit code calculation
                const errorMessage = err.message || String(err);
                this.print('Warning: Could not save session state: ' + errorMessage);
                // Mark as error so exit code reflects persistence failure
                this.hasError = true;
                this.updateExitCode();
            }
        }
        if (this.session.supervisor) {
            this.session.supervisor.stop();
        }
        this.print('Goodbye!');
        // Flush output before closing (critical for non-interactive mode)
        await this.flushStdout();
        this.running = false;
        this.rl?.close();
    }
    /**
     * Map OverallStatus to TaskLogStatus
     * Per spec 05_DATA_MODELS.md: Terminal states are complete/incomplete/error
     */
    mapToTaskLogStatus(status) {
        switch (status) {
            case enums_1.OverallStatus.COMPLETE:
                return 'complete';
            case enums_1.OverallStatus.INCOMPLETE:
                return 'incomplete';
            case enums_1.OverallStatus.ERROR:
                return 'error';
            default:
                return 'running';
        }
    }
    /**
     * Check if status is terminal
     * Per spec 05_DATA_MODELS.md: Terminal states are complete/incomplete/error
     */
    isTerminalStatus(status) {
        return status === 'complete' || status === 'incomplete' || status === 'error';
    }
    /**
     * Print immediate summary block
     * Per spec 10_REPL_UX.md: Immediate Summary Output
     *
     * COMPLETE (4 lines fixed):
     *   RESULT: COMPLETE / TASK / NEXT: (none) / HINT
     *
     * INCOMPLETE/ERROR (5 lines fixed, WHY required):
     *   RESULT / TASK / NEXT: /logs <id> / WHY / HINT
     */
    printImmediateSummary(taskId, status, reason) {
        if (!this.isTerminalStatus(status)) {
            return;
        }
        this.print('RESULT: ' + status.toUpperCase());
        this.print('TASK: ' + taskId);
        if (status === 'complete') {
            // COMPLETE: 4 lines fixed, no WHY
            this.print('NEXT: (none)');
        }
        else {
            // INCOMPLETE/ERROR: 5 lines fixed, WHY required
            this.print('NEXT: /logs ' + taskId);
            this.print('WHY: ' + (reason && reason.trim() ? reason : '(unknown)'));
        }
        this.print('HINT: /logs ' + taskId);
    }
    /**
     * Print execution result
     * Per spec 10_REPL_UX.md: Error details must be visible for fail-closed debugging
     * Also prints Immediate Summary for terminal states (per Property 39)
     */
    printExecutionResult(result) {
        // Get task ID from session tracking
        const taskId = this.session.current_task_id || this.session.last_task_id || 'unknown';
        // Map to TaskLogStatus
        const taskLogStatus = this.mapToTaskLogStatus(result.overall_status);
        // Update current_task_id / last_task_id on terminal state
        // Per spec 05_DATA_MODELS.md Property 38
        if (this.isTerminalStatus(taskLogStatus)) {
            this.session.last_task_id = this.session.current_task_id;
            this.session.current_task_id = null;
        }
        // Generate reason from result
        let reason;
        if (result.error) {
            reason = result.error.message;
        }
        else if (result.incomplete_task_reasons && result.incomplete_task_reasons.length > 0) {
            reason = result.incomplete_task_reasons[0].reason;
        }
        else if (result.overall_status === enums_1.OverallStatus.COMPLETE) {
            reason = 'タスクが正常に完了しました';
        }
        else {
            reason = '状態: ' + result.overall_status;
        }
        // Print Immediate Summary for terminal states (per Property 39)
        if (this.isTerminalStatus(taskLogStatus)) {
            this.printImmediateSummary(taskId, taskLogStatus, reason);
        }
        this.print('');
        this.print('--- Execution Result ---');
        this.print('Status: ' + result.overall_status);
        // Display executor mode (per redesign: visibility)
        if (result.executor_mode) {
            this.print('Executor: ' + result.executor_mode);
        }
        // Display duration (per redesign: visibility)
        if (result.duration_ms !== undefined && result.duration_ms > 0) {
            const seconds = (result.duration_ms / 1000).toFixed(1);
            this.print('Duration: ' + seconds + 's');
        }
        if (result.tasks_completed !== undefined) {
            this.print('Tasks: ' + result.tasks_completed + '/' + result.tasks_total + ' completed');
            // Track incomplete tasks for exit code (non-interactive mode)
            if (result.tasks_completed < (result.tasks_total || 0)) {
                this.hasIncompleteTasks = true;
                this.updateExitCode();
            }
        }
        // Display files modified (per redesign: visibility)
        if (result.files_modified && result.files_modified.length > 0) {
            this.print('');
            this.print('Files Modified:');
            for (const file of result.files_modified) {
                this.print('  - ' + file);
            }
        }
        // Display executor output summary (per redesign: visibility)
        if (result.executor_output_summary) {
            this.print('');
            this.print('Response Summary:');
            this.print('  ' + result.executor_output_summary);
        }
        // Display error details when status is ERROR (critical for debugging fail-closed behavior)
        if (result.error) {
            this.print('');
            this.print('Error: ' + result.error.message);
            if (result.error.code) {
                this.print('Error Code: ' + result.error.code);
            }
            // Track error for exit code
            this.hasError = true;
            this.updateExitCode();
        }
        // Display incomplete task reasons (helps identify why tasks failed)
        if (result.incomplete_task_reasons && result.incomplete_task_reasons.length > 0) {
            this.print('');
            this.print('Incomplete Tasks:');
            for (const reason of result.incomplete_task_reasons) {
                this.print('  - ' + reason.task_id + ': ' + reason.reason);
            }
            this.hasIncompleteTasks = true;
            this.updateExitCode();
        }
        // Track ERROR status
        if (result.overall_status === enums_1.OverallStatus.ERROR) {
            this.hasError = true;
            this.updateExitCode();
        }
        // Track INCOMPLETE status
        if (result.overall_status === enums_1.OverallStatus.INCOMPLETE) {
            this.hasIncompleteTasks = true;
            this.updateExitCode();
        }
        // NO_EVIDENCE handling: show next action hint (per redesign requirement)
        // Per user requirement: NO_EVIDENCE should not complete silently
        if (result.overall_status === enums_1.OverallStatus.NO_EVIDENCE) {
            this.print('');
            this.print('HINT: No file changes were verified for this task.');
            this.print('  Possible next actions:');
            this.print('    - Check /logs for execution details');
            this.print('    - Retry with more specific instructions');
            this.print('    - Use /status to see current session state');
        }
        if (result.next_action !== undefined) {
            this.print('Next Action: ' + (result.next_action ? 'Yes' : 'No'));
            if (result.next_action_reason) {
                this.print('Reason: ' + result.next_action_reason);
            }
        }
        this.print('------------------------');
        this.print('');
    }
    /**
     * Print message with flush guarantee for non-interactive mode
     * Per spec 10_REPL_UX.md: Output Flush Guarantee
     */
    print(message) {
        console.log(message);
    }
    /**
     * Flush stdout - ensures all output is written before continuing
     * Critical for non-interactive mode where process may exit immediately after
     */
    async flushStdout() {
        return new Promise((resolve) => {
            // If stdout is already drained, resolve immediately
            if (process.stdout.write('')) {
                resolve();
            }
            else {
                // Wait for drain event
                process.stdout.once('drain', () => {
                    resolve();
                });
            }
        });
    }
    /**
     * Print error
     */
    printError(err) {
        console.error('Error: ' + err.message);
        this.hasError = true;
        this.updateExitCode();
    }
    /**
     * Validate project structure - per spec 10_REPL_UX.md L45
     * "REPL の起動時点で validate 相当の検証を行い、必須構造がなければ即 ERROR とする。"
     *
     * @returns Validation result with valid flag and errors array
     */
    async validateProjectStructure() {
        const errors = [];
        const projectPath = this.config.projectPath;
        // Check .claude directory exists
        const claudeDir = path.join(projectPath, '.claude');
        if (!fs.existsSync(claudeDir)) {
            errors.push('.claude directory not found at ' + claudeDir);
        }
        else {
            // Check for required files/directories within .claude
            const requiredItems = [
                { path: path.join(claudeDir, 'CLAUDE.md'), type: 'file', name: 'CLAUDE.md' },
                { path: path.join(claudeDir, 'settings.json'), type: 'file', name: 'settings.json' },
            ];
            for (const item of requiredItems) {
                if (!fs.existsSync(item.path)) {
                    errors.push('Required ' + item.type + ' not found: ' + item.name);
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
    /**
     * Check if REPL is in init-only mode
     * Init-only mode is active when .claude directory is missing
     * In this mode, only /help, /init, /exit are allowed
     *
     * @returns true if in init-only mode (rechecks file system)
     */
    async isInitOnlyMode() {
        const validation = await this.validateProjectStructure();
        this.initOnlyMode = !validation.valid;
        return this.initOnlyMode;
    }
    /**
     * Tab completion for slash commands
     * Per spec 10_REPL_UX.md: Tab completion support
     *
     * @param line - Current input line
     * @returns Tuple of [completions, original line]
     */
    completer(line) {
        // Only complete if line starts with /
        if (!line.startsWith('/')) {
            return [[], line];
        }
        // Find matching commands (prefix match)
        const hits = SLASH_COMMANDS.filter(cmd => cmd.startsWith(line));
        // Return only matching commands (empty if no match)
        return [hits, line];
    }
    /**
     * Detect execution mode based on TTY, environment, or config
     * Per spec 10_REPL_UX.md: Non-interactive mode detection
     */
    detectExecutionMode() {
        // Check config override first
        if (this.config.forceNonInteractive) {
            return 'non_interactive';
        }
        // Check environment variable (for testing)
        if (process.env.PM_RUNNER_NON_INTERACTIVE === '1') {
            return 'non_interactive';
        }
        // Primary detection: stdin TTY check
        // stdin.isTTY is undefined when piped or from heredoc
        if (!process.stdin.isTTY) {
            return 'non_interactive';
        }
        return 'interactive';
    }
    /**
     * Check if running in non-interactive mode
     */
    isNonInteractiveMode() {
        return this.executionMode === 'non_interactive';
    }
    /**
     * Get the current execution mode
     */
    getExecutionMode() {
        return this.executionMode;
    }
    /**
     * Set exit code based on current state
     * Per spec 10_REPL_UX.md: Deterministic exit codes
     */
    updateExitCode() {
        if (this.hasError) {
            this.exitCode = exports.EXIT_CODES.ERROR;
        }
        else if (this.hasIncompleteTasks) {
            this.exitCode = exports.EXIT_CODES.INCOMPLETE;
        }
        else {
            this.exitCode = exports.EXIT_CODES.COMPLETE;
        }
    }
    /**
     * Get the exit code (for non-interactive mode)
     */
    getExitCode() {
        return this.exitCode;
    }
    /**
     * Get session state (for testing)
     */
    getSessionState() {
        return { ...this.session };
    }
    /**
     * Check if running (for testing)
     */
    isRunning() {
        return this.running;
    }
}
exports.REPLInterface = REPLInterface;
//# sourceMappingURL=repl-interface.js.map