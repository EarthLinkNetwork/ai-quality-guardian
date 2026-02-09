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
 * - cwd: Use current working directory (DEFAULT per spec)
 * - temp: Use temporary directory (cleaned up on exit)
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
const trace_1 = require("./commands/trace");
const template_1 = require("./commands/template");
const config_1 = require("./commands/config");
const inspect_1 = require("./commands/inspect");
const diagnostics_1 = require("../diagnostics");
const interactive_picker_1 = require("./interactive-picker");
const two_pane_renderer_1 = require("./two-pane-renderer");
const template_2 = require("../template");
const settings_1 = require("../settings");
const global_config_1 = require("../config/global-config");
const claude_code_executor_1 = require("../executor/claude-code-executor");
const keys_2 = require("../keys");
const queue_store_1 = require("../queue/queue-store");
const logging_1 = require("../logging");
/**
 * Known REPL commands (without slash) for typo rescue and tab completion
 * When user types "exit" instead of "/exit", suggest the correct form
 * Per spec 10_REPL_UX.md: includes all valid slash commands
 */
const KNOWN_COMMANDS = [
    'exit',
    'help',
    'start',
    'continue',
    'status',
    'tasks',
    'logs',
    'trace',
    'respond',
    'approve',
    'init',
    'provider',
    'model',
    'models',
    'keys',
    'clear',
    'version',
    // Template and Config commands per spec 32 and 33
    'templates',
    'template',
    'inputmode', // Toggle single-line/multi-line input mode
    'config',
    'send', // Multi-line buffer submit command
    'verbose', // Toggle verbose executor logs
    'inspect', // Unified event inspection and diagnostics
];
/**
 * Commands with slash prefix for tab completion
 * Per spec 10_REPL_UX.md: Tab completion for slash commands
 */
const SLASH_COMMANDS = KNOWN_COMMANDS.map(cmd => '/' + cmd);
/**
 * Check if input looks like a command typo (missing slash)
 * Returns suggested command or null if not a typo
 */
function detectCommandTypo(input) {
    const trimmed = input.trim();
    if (!trimmed || trimmed.startsWith('/')) {
        return null;
    }
    // Split into command and args
    const parts = trimmed.split(/\s+/);
    const firstWord = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    // Check if first word matches a known command
    if (KNOWN_COMMANDS.includes(firstWord)) {
        return { command: firstWord, args };
    }
    return null;
}
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
 * Commands allowed in key-setup mode
 * When no API key is configured, only these commands are available
 * This enforces fail-closed + interactive onboarding behavior
 */
const KEY_SETUP_ALLOWED_COMMANDS = ['help', 'keys', 'provider', 'exit', 'templates', 'template', 'config'];
/**
 * Detect task type from user input.
 * READ_INFO tasks are information requests that don't require file changes.
 * IMPLEMENTATION tasks involve creating/modifying files.
 */
function detectTaskType(input) {
    const lowerInput = input.toLowerCase();
    // READ_INFO patterns - questions and information requests
    const readInfoPatterns = [
        /^(what|how|why|when|where|who|which|can you explain|tell me|show me|describe|list|find)/i,
        /\?$/, // Ends with question mark
        /(explain|analyze|check|verify|review|look at|examine|inspect|investigate)/i,
        /(status|info|information|details|summary)/i,
        /^read /i,
        /^(show|display|print|output)/i,
    ];
    // IMPLEMENTATION patterns - file creation/modification
    const implementationPatterns = [
        /(create|add|write|implement|build|make|generate|update|modify|change|fix|refactor|delete|remove)/i,
        /\.(ts|js|tsx|jsx|py|go|rs|java|md|json|yaml|yml|toml|css|scss|html)$/i,
        /(file|code|function|class|component|module|test)/i,
    ];
    // Check for READ_INFO patterns
    for (const pattern of readInfoPatterns) {
        if (pattern.test(lowerInput)) {
            // But check if it also matches implementation patterns
            let hasImplementation = false;
            for (const implPattern of implementationPatterns) {
                if (implPattern.test(lowerInput)) {
                    hasImplementation = true;
                    break;
                }
            }
            if (!hasImplementation) {
                return 'READ_INFO';
            }
        }
    }
    // Default to IMPLEMENTATION for ambiguous cases
    return 'IMPLEMENTATION';
}
/**
 * REPL Interface class
 */
class REPLInterface extends events_1.EventEmitter {
    config;
    rl = null;
    session;
    running = false;
    initOnlyMode = false;
    keySetupMode = false;
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
    // Close handler tracking (prevents double execution of close handler)
    // The close event can fire multiple times: once when stdin ends, once when rl.close() is called
    closeHandlerExecuted = false;
    // Non-blocking task queue (allows input while tasks are running)
    taskQueue = [];
    isTaskWorkerRunning = false;
    // QueueStore for persistence (per spec 21_STABLE_DEV.md)
    // When namespace is provided, tasks are persisted to DynamoDB Local
    // and can be restored on restart
    queueStore = null;
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
    traceCommand;
    // Template and Config command handlers per spec 32 and 33
    templateCommand;
    configCommand;
    templateStore;
    settingsStore;
    // Unified event inspection command
    inspectCommand = null;
    // Two-pane renderer per spec 18_CLI_TWO_PANE.md
    renderer;
    // Pending user response tracking for auto-resolve executor
    // When LLM can't auto-resolve a case-by-case question, it calls userResponseHandler
    // which stores the pending response here and waits for /respond command
    pendingUserResponse = null;
    // Pending command suggestion (typo rescue)
    // When user types "exit" instead of "/exit", we suggest the correct form
    // and wait for confirmation (Enter/y) or cancellation (n/Esc)
    pendingCommandSuggestion = null;
    // Task number mapping for /logs <number> support
    // Maps display numbers (1, 2, 3...) to task IDs
    taskNumberMap = new Map();
    // Interactive selection mode for /logs ui, /tasks ui, and /inspect ui
    // When active, numeric input selects an item from the displayed list
    // NOTE: This is the NON-TTY fallback. TTY mode uses InteractivePicker.
    pendingSelectionMode = null;
    // Flag to suppress REPL keypress handling while InteractivePicker is active
    pickerActive = false;
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
        // Determine project mode - per spec 10_REPL_UX.md: cwd is default
        this.projectMode = config.projectMode || 'cwd';
        // Set verification root based on mode
        if (this.projectMode === 'fixed') {
            this.verificationRoot = config.projectRoot;
        }
        else if (this.projectMode === 'cwd') {
            // CWD mode: use current working directory (DEFAULT per spec 10_REPL_UX.md)
            // Per spec lines 74-83: カレントディレクトリをそのまま使用
            // But respect explicitly provided projectPath from --project flag
            this.verificationRoot = config.projectPath || process.cwd();
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
        // CRITICAL: Resolve projectPath based on mode
        // - cwd mode: use process.cwd() (already set in verificationRoot)
        // - temp mode: use verificationRoot (temp directory)
        // - fixed mode: use projectRoot (from --project-root)
        const resolvedProjectPath = this.projectMode === 'temp'
            ? this.verificationRoot
            : this.projectMode === 'cwd'
                ? this.verificationRoot // verificationRoot is process.cwd() in cwd mode
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
        // Per spec 13_LOGGING_AND_OBSERVABILITY.md Section 11.2:
        // Set non-interactive mode for logging (enables fsync guarantee)
        (0, logging_1.setNonInteractiveMode)(this.executionMode === 'non_interactive');
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
        this.traceCommand = new trace_1.TraceCommand();
        // Initialize Template and Config command handlers per spec 32 and 33
        this.templateStore = new template_2.TemplateStore();
        this.settingsStore = new settings_1.ProjectSettingsStore();
        this.templateCommand = new template_1.TemplateCommand();
        this.configCommand = new config_1.ConfigCommand();
        // Wire up stores to command handlers
        this.templateCommand.setTemplateStore(this.templateStore);
        this.templateCommand.setSettingsStore(this.settingsStore);
        this.configCommand.setSettingsStore(this.settingsStore);
        this.configCommand.setTemplateStore(this.templateStore);
        // Initialize two-pane renderer per spec 18_CLI_TWO_PANE.md
        this.renderer = new two_pane_renderer_1.TwoPaneRenderer({
            prompt: this.config.prompt,
        });
        // Initialize QueueStore for persistence when namespace is provided
        // Per spec 21_STABLE_DEV.md: namespace enables task persistence and restart recovery
        if (config.namespace || config.namespaceConfig) {
            const ns = config.namespaceConfig?.namespace || config.namespace;
            this.queueStore = new queue_store_1.QueueStore({
                namespace: ns,
                endpoint: 'http://localhost:8000',
            });
        }
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
     * Restore tasks from QueueStore on startup
     * Per spec 21_STABLE_DEV.md: Resume previous tasks on restart
     * Only restores non-terminal tasks (QUEUED, RUNNING, AWAITING_RESPONSE)
     */
    async restoreTasksFromQueueStore() {
        if (!this.queueStore) {
            return 0;
        }
        try {
            const items = await this.queueStore.getAllItems();
            let restoredCount = 0;
            for (const item of items) {
                // Only restore non-terminal tasks
                if (['QUEUED', 'RUNNING', 'AWAITING_RESPONSE'].includes(item.status)) {
                    const task = {
                        id: item.task_id,
                        description: item.prompt,
                        state: item.status === 'RUNNING' ? 'QUEUED' : item.status, // Reset RUNNING to QUEUED
                        queuedAt: new Date(item.created_at).getTime(),
                        startedAt: null,
                        completedAt: null,
                    };
                    // Restore AWAITING_RESPONSE with clarification info
                    if (item.status === 'AWAITING_RESPONSE' && item.clarification) {
                        task.clarificationQuestion = item.clarification.question;
                        task.clarificationReason = item.clarification.context;
                    }
                    this.taskQueue.push(task);
                    restoredCount++;
                }
            }
            if (restoredCount > 0) {
                this.print('Restored ' + restoredCount + ' task(s) from previous session.');
                // Check for tasks needing response
                const awaitingTasks = this.taskQueue.filter(t => t.state === 'AWAITING_RESPONSE');
                if (awaitingTasks.length > 0) {
                    this.print('Tasks awaiting response:');
                    for (const t of awaitingTasks) {
                        this.print('  [?] ' + t.id + ': ' + (t.clarificationQuestion || 'Unknown question'));
                    }
                    this.print('Use /respond <answer> to continue.');
                }
            }
            return restoredCount;
        }
        catch (err) {
            // Fail-closed: if QueueStore is unavailable, continue without restoration
            console.error('[QueueStore] Failed to restore tasks:', err.message);
            return 0;
        }
    }
    /**
     * Sync a task state change to QueueStore
     * Called after any task state change for persistence
     */
    async syncTaskToQueueStore(task) {
        if (!this.queueStore) {
            return;
        }
        try {
            // Map TaskQueueState to QueueItemStatus
            const statusMap = {
                'QUEUED': 'QUEUED',
                'RUNNING': 'RUNNING',
                'AWAITING_RESPONSE': 'AWAITING_RESPONSE',
                'COMPLETE': 'COMPLETE',
                'INCOMPLETE': 'COMPLETE', // Map INCOMPLETE to COMPLETE in QueueStore
                'ERROR': 'ERROR',
            };
            const status = statusMap[task.state];
            // For new tasks, enqueue them
            if (task.state === 'QUEUED' && !task.startedAt) {
                await this.queueStore.enqueue(task.description, 'repl-session', // task_group_id
                this.session.sessionId || 'no-session' // session_id
                );
                return;
            }
            // For state changes, update existing item
            const item = await this.queueStore.getItem(task.id);
            if (item) {
                if (task.state === 'AWAITING_RESPONSE') {
                    await this.queueStore.setAwaitingResponse(task.id, {
                        type: 'case_by_case', // User response required
                        question: task.clarificationQuestion || '',
                        context: task.clarificationReason,
                    });
                }
                else if (status === 'COMPLETE' || status === 'ERROR') {
                    await this.queueStore.updateStatus(task.id, status, task.errorMessage);
                }
                else if (status === 'RUNNING') {
                    await this.queueStore.updateStatus(task.id, status);
                }
            }
        }
        catch (err) {
            // Fail-soft: log error but don't interrupt task execution
            console.error('[QueueStore] Failed to sync task:', err.message);
        }
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
     * Check Claude Code CLI auth status
     * Per spec/15_API_KEY_ENV_SANITIZE.md: Check at startup, exit on failure
     *
     * @returns AuthCheckResult with availability and login status
     */
    async checkClaudeCodeAuth() {
        const executor = new claude_code_executor_1.ClaudeCodeExecutor({
            projectPath: this.session.projectPath,
            timeout: 30000,
            verbose: (0, global_config_1.getVerboseExecutor)(),
        });
        return executor.checkAuthStatus();
    }
    /**
     * Check API key status and enter key-setup mode if not configured
     * API keys are stored in global config file (~/.pm-orchestrator-runner/config.json)
     *
     * Key Setup Mode (fail-closed + interactive onboarding):
     * - No API key = enter key-setup mode
     * - Only /help, /keys, /provider, /exit are available
     * - User must set a valid API key to proceed
     */
    async checkApiKeyStatus() {
        // Check global config for API keys
        const hasKey = (0, global_config_1.hasAnyApiKey)();
        if (!hasKey) {
            // Non-interactive mode: fail-closed immediately
            // User cannot input a key without TTY, so we must exit with error
            if (this.executionMode === 'non_interactive') {
                console.error('');
                console.error('ERROR: No API key configured (fail-closed)');
                console.error('');
                console.error('In non-interactive mode, an API key must be pre-configured.');
                console.error('');
                console.error('To configure an API key, run interactively:');
                console.error('  pm repl');
                console.error('  /keys set openai');
                console.error('');
                console.error('Or set environment variables:');
                console.error('  export OPENAI_API_KEY=sk-...');
                console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
                console.error('');
                process.exit(1);
            }
            // Interactive mode: Enter key-setup mode (fail-closed behavior)
            this.keySetupMode = true;
            // Show prominent warning and instructions
            console.log('');
            console.log('============================================================');
            console.log('  KEY SETUP MODE');
            console.log('============================================================');
            console.log('');
            console.log('No API key configured. An API key is required to use pm.');
            console.log('');
            console.log('Available commands in key-setup mode:');
            console.log('  /keys set openai     - Set OpenAI API key (interactive)');
            console.log('  /keys set anthropic  - Set Anthropic API key (interactive)');
            console.log('  /keys                - Show current key status');
            console.log('  /provider            - List or set default provider');
            console.log('  /help                - Show help');
            console.log('  /exit                - Exit pm');
            console.log('');
            console.log('API keys are stored securely (0600 permissions) in:');
            console.log('  ' + (0, global_config_1.getConfigFilePath)());
            console.log('');
            console.log('Once a valid API key is set, all commands will be available.');
            console.log('============================================================');
            console.log('');
        }
        else {
            // Not in key-setup mode
            this.keySetupMode = false;
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
     * Exit key-setup mode after a valid API key is configured
     * This re-enables all commands
     */
    exitKeySetupMode() {
        if (this.keySetupMode) {
            this.keySetupMode = false;
            console.log('');
            console.log('============================================================');
            console.log('  API key configured successfully!');
            console.log('  Exiting key-setup mode. All commands are now available.');
            console.log('============================================================');
            console.log('');
            console.log('Type /help to see all available commands.');
            console.log('');
        }
    }
    /**
     * Check if in key-setup mode
     */
    isInKeySetupMode() {
        return this.keySetupMode;
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
        // Per spec/15_API_KEY_ENV_SANITIZE.md lines 91-97: Startup checks
        // Check Claude Code CLI availability and login status
        if (this.config.authMode === 'claude-code') {
            const authStatus = await this.checkClaudeCodeAuth();
            if (!authStatus.available) {
                console.error('');
                console.error('ERROR: Claude Code CLI not available');
                console.error('  ' + (authStatus.error || 'CLI not found'));
                console.error('');
                console.error('Please install Claude Code CLI and try again.');
                console.error('');
                process.exit(1);
            }
            if (!authStatus.loggedIn) {
                console.error('');
                console.error('ERROR: Claude Code CLI not logged in');
                console.error('  ' + (authStatus.error || 'Login required'));
                console.error('');
                console.error('Please run: claude setup-token');
                console.error('');
                process.exit(1);
            }
        }
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
        // CRITICAL: Set up 'line' handler IMMEDIATELY after creating readline
        // In non-interactive (piped) mode, stdin may already have data buffered
        // and may close immediately after readline is created.
        // If we delay setting up this handler, buffered lines will be lost.
        this.rl.on('line', (line) => {
            // Queue-based sequential processing to prevent race conditions
            // This ensures /start completes before subsequent commands are processed
            this.enqueueInput(line);
        });
        // CRITICAL: Create the close Promise IMMEDIATELY, before any async operations.
        // In piped mode, stdin may close during async init (restoreTasksFromQueueStore).
        // If we delay setting up the close handler, the close event will be lost and
        // the returned Promise will never resolve.
        //
        // Pattern: Create promise and store resolver, set up handler that calls resolver
        // when fully complete (after queue drains, cleanup, etc.)
        let closePromiseResolve = null;
        const closePromise = new Promise((resolve) => {
            closePromiseResolve = resolve;
        });
        this.rl.on('close', async () => {
            // Prevent double execution of close handler
            // The close event can fire multiple times: once when stdin ends, once when rl.close() is called
            if (this.closeHandlerExecuted) {
                return;
            }
            this.closeHandlerExecuted = true;
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
            // Per spec 18_CLI_TWO_PANE.md: Flush renderer pending logs
            this.renderer.flush();
            await this.flushStdout();
            await this.cleanup();
            // In non-interactive mode, set process exit code
            if (this.executionMode === 'non_interactive') {
                this.updateExitCode();
                process.exitCode = this.exitCode;
            }
            // Resolve the promise AFTER all work is complete
            closePromiseResolve();
        });
        // Set up keypress events for TTY (multi-line mode Esc handling)
        if (process.stdin.isTTY) {
            readline.emitKeypressEvents(process.stdin, this.rl);
            if (process.stdin.setRawMode) {
                process.stdin.setRawMode(true);
            }
            process.stdin.on('keypress', (_str, key) => {
                // Skip REPL keypress handling while InteractivePicker is active
                if (this.pickerActive)
                    return;
                // Per spec: Esc cancels current multi-line input
                if (key && key.name === 'escape' && this.multiLineBuffer.length > 0) {
                    this.multiLineBuffer = [];
                    this.print('\nMulti-line input cancelled.');
                    this.rl?.prompt();
                }
            });
        }
        // Restore tasks from QueueStore (DynamoDB Local persistence)
        await this.restoreTasksFromQueueStore();
        // Print welcome message
        this.printWelcome();
        // Show initial prompt (only in interactive mode)
        // In non-interactive mode (piped input), readline may already be closed
        // by the time we get here, and calling prompt() would throw an error.
        // Also, in piped mode, there's no user waiting for a prompt.
        if (this.executionMode === 'interactive') {
            this.rl.prompt();
        }
        // Return the close promise - it resolves when the close handler completes
        return closePromise;
    }
    /**
     * Process input line
     * Includes typo rescue for common commands (exit -> /exit suggestion)
     */
    async processInput(input) {
        const trimmed = input.trim();
        // Handle pending command suggestion confirmation
        if (this.pendingCommandSuggestion) {
            const suggestion = this.pendingCommandSuggestion;
            this.pendingCommandSuggestion = null;
            const lowerInput = trimmed.toLowerCase();
            // Empty input (Enter) or 'y' confirms the suggestion
            if (trimmed === '' || lowerInput === 'y' || lowerInput === 'yes') {
                const fullCommand = suggestion.args
                    ? `/${suggestion.suggestedCommand} ${suggestion.args}`
                    : `/${suggestion.suggestedCommand}`;
                this.print('Executing: ' + fullCommand);
                await this.processCommand(fullCommand);
                return;
            }
            // 'n', 'no', or Esc cancels
            if (lowerInput === 'n' || lowerInput === 'no') {
                this.print('Cancelled.');
                return;
            }
            // Any other input is treated as new input
            // Fall through to normal processing
        }
        // Handle interactive selection mode (for /logs ui and /tasks ui)
        if (this.pendingSelectionMode) {
            const selection = this.pendingSelectionMode;
            // 'q' or 'cancel' exits selection mode
            const lowerInput = trimmed.toLowerCase();
            if (lowerInput === 'q' || lowerInput === 'cancel' || lowerInput === 'exit') {
                this.pendingSelectionMode = null;
                this.print('Selection cancelled.');
                return;
            }
            // Numeric input selects an item
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && selection.items.has(num)) {
                const taskId = selection.items.get(num);
                this.pendingSelectionMode = null;
                if (selection.type === 'logs') {
                    // Show log details for selected task
                    await this.handleLogs([taskId, '--full']);
                }
                else if (selection.type === 'inspect') {
                    // Show event details for selected event
                    await this.handleInspect([taskId]);
                }
                else if (selection.type === 'diagnostic') {
                    // Run selected diagnostic
                    await this.runDiagnosticById(taskId);
                }
                else {
                    // Show task details for selected task
                    await this.handleLogs([taskId]);
                }
                return;
            }
            // Invalid input - show help
            if (trimmed) {
                this.print('Invalid selection. Enter a number (1-' + selection.items.size + ') or q to cancel.');
            }
            return;
        }
        // Check for pending AWAITING_RESPONSE - allow numeric shortcuts
        if (this.hasPendingResponse() && /^\d+$/.test(trimmed)) {
            // Numeric input while pending response - treat as /respond <number>
            await this.handleRespond(['respond', trimmed]);
            return;
        }
        if (trimmed.startsWith('/')) {
            await this.processCommand(trimmed);
            return;
        }
        // Check for command typo (exit -> /exit)
        const typo = detectCommandTypo(trimmed);
        if (typo) {
            const suggestion = typo.args
                ? `/${typo.command} ${typo.args}`
                : `/${typo.command}`;
            this.print('');
            this.print('Did you mean: ' + suggestion + ' ?');
            this.print('Press Enter or y to confirm, n to cancel.');
            this.print('');
            this.pendingCommandSuggestion = {
                suggestedCommand: typo.command,
                args: typo.args,
            };
            return;
        }
        // Normal natural language processing
        await this.processNaturalLanguage(trimmed);
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
        // Per spec 18_CLI_TWO_PANE.md: Clear input state after line is committed
        this.renderer.clearInput();
        const trimmed = line.trim();
        if (!trimmed) {
            // Empty line - submit accumulated multi-line buffer
            if (this.multiLineBuffer.length > 0) {
                // Show visual feedback that we're submitting
                this.print('Sending...');
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
        const isFirstLine = this.multiLineBuffer.length === 0;
        this.multiLineBuffer.push(trimmed);
        // In non-interactive mode, no empty line expected - process immediately
        if (this.executionMode === 'non_interactive') {
            const fullInput = this.multiLineBuffer.join('\n');
            this.multiLineBuffer = [];
            this.inputQueue.push(fullInput);
            this.processQueue();
            return;
        }
        // In single-line mode (default), process immediately on first Enter
        if ((0, global_config_1.getSingleLineMode)() && isFirstLine) {
            const fullInput = this.multiLineBuffer.join('\n');
            this.multiLineBuffer = [];
            this.inputQueue.push(fullInput);
            this.processQueue();
            return;
        }
        // In multi-line mode, show continuation indicator and hint
        if (this.running && !this.isProcessingInput) {
            // Show multi-line mode hint on first line
            if (isFirstLine) {
                this.print('(multi-line: Enter=newline, Enter x2=send, Esc=cancel)');
            }
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
                    this.renderer.flush();
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
        // Check if in key-setup mode (fail-closed behavior)
        // Block commands that require API key until a valid key is configured
        if (this.keySetupMode && !KEY_SETUP_ALLOWED_COMMANDS.includes(command)) {
            this.print('ERROR: Cannot run /' + command + ' - no API key configured.');
            this.print('');
            this.print('Set an API key first:');
            this.print('  /keys set openai     - Set OpenAI API key');
            this.print('  /keys set anthropic  - Set Anthropic API key');
            this.print('');
            this.print('Or type /help for available commands in key-setup mode.');
            return {
                success: false,
                error: {
                    code: 'E302',
                    message: 'Cannot run /' + command + ' in key-setup mode. Set an API key first using /keys set.',
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
                await this.handleTasks(args);
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
            case 'trace':
                return await this.handleTrace(args);
            case 'respond':
                return await this.handleRespond(args);
            // Template and Config commands per spec 32 and 33
            case 'templates':
                return await this.handleTemplates(args);
            case 'template':
                return await this.handleTemplate(args);
            case 'send':
                return this.handleSend();
            case 'config':
                return await this.handleConfig(args);
            case 'verbose':
                return this.handleVerbose(args);
            case 'inputmode':
                return this.handleInputMode(args);
            case 'inspect':
                return await this.handleInspect(args);
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
        // Check if in key-setup mode (fail-closed behavior)
        // Block all natural language input until a valid API key is configured
        if (this.keySetupMode) {
            this.print('ERROR: Cannot process tasks - no API key configured.');
            this.print('');
            this.print('Set an API key first:');
            this.print('  /keys set openai     - Set OpenAI API key');
            this.print('  /keys set anthropic  - Set Anthropic API key');
            this.print('');
            this.print('Or use /help to see available commands.');
            this.hasError = true;
            this.updateExitCode();
            return;
        }
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
        // Detect task type from input
        const detectedTaskType = detectTaskType(input);
        // Create queued task
        const queuedTask = {
            id: taskId,
            description: input,
            state: 'QUEUED',
            queuedAt: Date.now(),
            startedAt: null,
            completedAt: null,
            taskType: detectedTaskType,
        };
        // Add to task queue
        this.taskQueue.push(queuedTask);
        // Sync new task to QueueStore for persistence
        this.syncTaskToQueueStore(queuedTask).catch(err => {
            console.error('[QueueStore] Failed to sync new task:', err.message);
        });
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
        // Sync to QueueStore for persistence
        await this.syncTaskToQueueStore(task);
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
                        taskType: task.taskType,
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
                const needsClarification = await this.handleClarificationNeeded(task, task.description, result.incomplete_task_reasons);
                if (needsClarification) {
                    task.state = 'AWAITING_RESPONSE';
                }
            }
            this.printExecutionResult(result);
            // Sync final state to QueueStore
            await this.syncTaskToQueueStore(task);
        }
        catch (err) {
            console.log(`[DEBUG executeQueuedTask] error: ${err.message}`);
            task.state = 'ERROR';
            task.completedAt = Date.now();
            task.errorMessage = err.message;
            this.printError(err);
            // Sync error state to QueueStore
            await this.syncTaskToQueueStore(task);
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
    async handleClarificationNeeded(task, originalInput, reasons) {
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
                this.print('Use /respond to provide your answer.');
                task.clarificationQuestion = 'Where should the file be saved?';
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
                this.print('Use /respond to provide your answer.');
                task.clarificationQuestion = reason;
                return true;
            }
        }
        return false;
    }
    /**
     * Print welcome message with clear auth status
     * Per spec/15_API_KEY_ENV_SANITIZE.md: Show required startup display
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
        // Per spec/15_API_KEY_ENV_SANITIZE.md lines 100-108: Required startup display
        if (this.config.authMode === 'claude-code') {
            // Spec-mandated display format - MUST be shown exactly as specified
            this.print('Executor: Claude Code CLI');
            this.print('Auth: Uses Claude subscription (no API key required)');
            this.print('Env: ALLOWLIST mode (only PATH, HOME, etc. passed to subprocess)');
        }
        else {
            // Check for API keys when using API mode - use centralized getApiKey() for DI compliance
            const anthropicKey = (0, global_config_1.getApiKey)('anthropic');
            const openaiKey = (0, global_config_1.getApiKey)('openai');
            this.print('Executor: API Mode');
            this.print('  ANTHROPIC_API_KEY: ' + (anthropicKey ? 'SET' : 'NOT SET'));
            this.print('  OPENAI_API_KEY: ' + (openaiKey ? 'SET' : 'NOT SET'));
            if (!anthropicKey && !openaiKey) {
                this.print('');
                this.print('  WARNING: No API keys configured!');
                this.print('  Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run /config to set in config file.');
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
        this.print('  /tasks ui            Interactive task selection');
        this.print('  /approve             Approve continuation for INCOMPLETE session');
        this.print('  /respond <text>     Respond to a task awaiting clarification');
        this.print('');
        this.print('Logging:');
        this.print('  /logs                List task logs for current session');
        this.print('  /logs ui             Interactive log selection');
        this.print('  /logs <id|#>         Show task details (use task-id or number from /tasks)');
        this.print('  /logs <id|#> --full  Show task details with executor logs');
        this.print('');
        this.print('Conversation Trace:');
        this.print('  /trace <id|#>          Show conversation trace for a task');
        this.print('  /trace <id|#> --latest Show only latest iteration');
        this.print('  /trace <id|#> --raw    Show raw JSONL data');
        this.print('');
        this.print('Template Injection (per spec 32):');
        this.print('  /templates             List all templates');
        this.print('  /templates new <name>  Create a new template');
        this.print('  /templates edit <name> Edit a template');
        this.print('  /templates delete <n>  Delete a template');
        this.print('  /templates copy <s> <n> Copy a template');
        this.print('  /template              Show current template settings');
        this.print('  /template use <name>   Select and enable a template');
        this.print('  /template on           Enable template injection');
        this.print('  /template off          Disable template injection');
        this.print('');
        this.print('Project Configuration (per spec 33):');
        this.print('  /config                Show project settings');
        this.print('  /config set <k> <v>    Set a configuration value');
        this.print('  /config reset          Reset settings to defaults');
        this.print('  /config keys           Show available config keys');
        this.print('');
        this.print('Other:');
        this.print('  /exit                Exit REPL (saves state)');
        this.print('  /send                Submit multi-line input buffer');
        this.print('  /verbose [on|off]    Toggle verbose executor logs');
        this.print('  /inputmode [single|multi]  Toggle input mode (default: single-line)');
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
        // /keys set <provider> [key] - set API key (interactive if key not provided)
        if (args.length >= 2 && args[0] === 'set') {
            const provider = args[1].toLowerCase();
            // Validate provider
            if (provider !== 'openai' && provider !== 'anthropic') {
                this.print('Error: Invalid provider "' + provider + '"');
                this.print('Supported providers: openai, anthropic');
                return {
                    success: false,
                    error: {
                        code: 'E106',
                        message: 'Invalid provider. Use "openai" or "anthropic".',
                    },
                };
            }
            let key;
            if (args.length >= 3) {
                // Key provided inline: /keys set <provider> <key>
                key = args[2];
            }
            else {
                // Interactive mode: /keys set <provider>
                // Prompt for key with hidden input and double-entry confirmation
                const inputResult = await (0, keys_2.promptForApiKey)(provider);
                if (!inputResult.success) {
                    this.print(inputResult.error || 'API key input failed.');
                    return {
                        success: false,
                        error: {
                            code: inputResult.cancelled ? 'E109' : 'E108',
                            message: inputResult.error || 'API key input failed.',
                        },
                    };
                }
                key = inputResult.key;
            }
            // Validate key format
            if (!(0, keys_2.isKeyFormatValid)(provider, key)) {
                this.print('');
                this.print('Warning: API key format does not match expected pattern for ' + provider);
                this.print('  OpenAI keys typically start with "sk-"');
                this.print('  Anthropic keys typically start with "sk-ant-"');
                this.print('');
                this.print('Continuing with validation...');
            }
            // Validate key with API
            this.print('Validating API key with ' + provider + '...');
            const validationResult = await (0, keys_2.validateApiKey)(provider, key);
            if (!validationResult.valid) {
                this.print('');
                this.print('Error: API key validation failed.');
                this.print('  ' + (validationResult.error || 'Invalid API key'));
                this.print('');
                this.print('Please check your API key and try again.');
                return {
                    success: false,
                    error: {
                        code: 'E110',
                        message: 'API key validation failed: ' + (validationResult.error || 'Invalid key'),
                    },
                };
            }
            // Key is valid - save it
            (0, global_config_1.setApiKey)(provider, key);
            this.print('');
            this.print('API key validated and saved successfully!');
            this.print('Provider: ' + provider);
            this.print('Config file: ' + (0, global_config_1.getConfigFilePath)());
            // Exit key-setup mode if we were in it
            this.exitKeySetupMode();
            return { success: true };
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
            // /keys set without provider
            this.print('Usage:');
            this.print('  /keys set openai     - Set OpenAI API key (interactive)');
            this.print('  /keys set anthropic  - Set Anthropic API key (interactive)');
            this.print('  /keys                - Show current key status');
            return {
                success: false,
                error: {
                    code: 'E107',
                    message: 'Invalid arguments. Usage: /keys set <provider>',
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
        // /logs ui - interactive selection mode
        if (args.length > 0 && args[0].toLowerCase() === 'ui') {
            return await this.handleLogsInteractive();
        }
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
            // /logs <task-id | number> [--full]
            // Support task number (1, 2, 3...) or full task ID
            let taskId = args[0];
            const full = args.includes('--full');
            // Check if first arg is a number (task number reference)
            const taskNum = parseInt(taskId, 10);
            if (!isNaN(taskNum) && taskNum > 0 && this.taskNumberMap.has(taskNum)) {
                taskId = this.taskNumberMap.get(taskNum);
            }
            else if (!isNaN(taskNum) && taskNum > 0) {
                // Number provided but not in map - might need to run /tasks first
                this.print('Task number ' + taskNum + ' not found. Run /tasks to see available tasks.');
                return {
                    success: false,
                    error: { code: 'E105', message: 'Task number not found' },
                };
            }
            // First check if task is in queue (for AWAITING_RESPONSE status)
            const queuedTask = this.taskQueue.find(t => t.id === taskId);
            // Per redesign: Pass sessionId for visibility fields
            const result = await this.logsCommand.getTaskDetail(this.session.projectPath, taskId, full, this.session.sessionId ?? undefined);
            if (result.success) {
                this.print(result.output || 'No log detail found.');
                // Add pending question/reason info if task is AWAITING_RESPONSE
                if (queuedTask && queuedTask.state === 'AWAITING_RESPONSE') {
                    this.print('');
                    this.print('Pending Response Required:');
                    if (queuedTask.clarificationQuestion) {
                        this.print('  Question: ' + queuedTask.clarificationQuestion);
                    }
                    if (queuedTask.clarificationReason) {
                        this.print('  Reason: ' + queuedTask.clarificationReason);
                    }
                    this.print('  How to respond: /respond <your answer>');
                }
                return { success: true };
            }
            else {
                // If not found in logs, check if it's a queued task
                if (queuedTask) {
                    this.print('');
                    this.print('Task: ' + queuedTask.id);
                    this.print('State: ' + queuedTask.state);
                    this.print('Description: ' + queuedTask.description);
                    if (queuedTask.queuedAt) {
                        this.print('Queued at: ' + new Date(queuedTask.queuedAt).toISOString());
                    }
                    if (queuedTask.startedAt) {
                        this.print('Started at: ' + new Date(queuedTask.startedAt).toISOString());
                    }
                    // Show pending question/reason info if AWAITING_RESPONSE
                    if (queuedTask.state === 'AWAITING_RESPONSE') {
                        this.print('');
                        this.print('Pending Response Required:');
                        if (queuedTask.clarificationQuestion) {
                            this.print('  Question: ' + queuedTask.clarificationQuestion);
                        }
                        if (queuedTask.clarificationReason) {
                            this.print('  Reason: ' + queuedTask.clarificationReason);
                        }
                        this.print('  How to respond: /respond <your answer>');
                    }
                    return { success: true };
                }
                this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
                return { success: false, error: result.error };
            }
        }
    }
    /**
     * Handle /logs ui - interactive log selection
     * TTY: keyboard-navigable picker (Tier-0 Rule E)
     * Non-TTY: numbered list with pendingSelectionMode fallback
     */
    async handleLogsInteractive() {
        if (!this.session.sessionId) {
            this.print('No active session. Use /start to begin a session.');
            return {
                success: false,
                error: { code: 'E104', message: 'No active session' },
            };
        }
        if (this.taskQueue.length === 0) {
            this.print('No tasks in queue. Submit a task first.');
            return { success: true };
        }
        // Build PickerItem array from task queue
        const pickerItems = this.taskQueue.map(task => {
            let stateMarker = '';
            switch (task.state) {
                case 'RUNNING':
                    stateMarker = '*';
                    break;
                case 'QUEUED':
                    stateMarker = ' ';
                    break;
                case 'COMPLETE':
                    stateMarker = 'v';
                    break;
                case 'INCOMPLETE':
                    stateMarker = '!';
                    break;
                case 'ERROR':
                    stateMarker = 'X';
                    break;
                case 'AWAITING_RESPONSE':
                    stateMarker = '?';
                    break;
            }
            const desc = task.description.length > 40
                ? task.description.substring(0, 40) + '...'
                : task.description;
            return {
                id: task.id,
                label: desc,
                data: task.id,
                prefix: stateMarker,
            };
        });
        // TTY: use InteractivePicker (keyboard-navigable, Tier-0 Rule E)
        if (process.stdin.isTTY) {
            const picker = new interactive_picker_1.InteractivePicker(pickerItems, {
                title: 'Select a task to view logs:',
            });
            this.pickerActive = true;
            this.rl?.pause();
            try {
                const result = await picker.prompt();
                if (result.type === 'selected' && result.item) {
                    await this.handleLogs([result.item.data, '--full']);
                }
            }
            finally {
                this.pickerActive = false;
                this.rl?.resume();
                this.rl?.prompt();
            }
            return { success: true };
        }
        // Non-TTY fallback: numbered list + pendingSelectionMode
        this.print('');
        this.print('Select a task to view logs:');
        this.print('');
        const items = new Map();
        pickerItems.forEach((item, i) => {
            const num = i + 1;
            items.set(num, item.data);
            this.print('  ' + num + '. [' + item.prefix + '] ' + item.label);
        });
        this.print('');
        this.print('Enter number (1-' + pickerItems.length + ') to view details, or q to cancel:');
        this.pendingSelectionMode = { type: 'logs', items };
        return { success: true };
    }
    /**
     * Handle /tasks ui - interactive task selection
     * TTY: keyboard-navigable picker (Tier-0 Rule E)
     * Non-TTY: numbered list with pendingSelectionMode fallback
     */
    async handleTasksInteractive() {
        if (this.taskQueue.length === 0) {
            this.print('No tasks in queue. Submit a task first.');
            return { success: true };
        }
        // Build PickerItem array
        const pickerItems = this.taskQueue.map(task => {
            let stateMarker = '';
            switch (task.state) {
                case 'RUNNING':
                    stateMarker = '*';
                    break;
                case 'QUEUED':
                    stateMarker = ' ';
                    break;
                case 'COMPLETE':
                    stateMarker = 'v';
                    break;
                case 'INCOMPLETE':
                    stateMarker = '!';
                    break;
                case 'ERROR':
                    stateMarker = 'X';
                    break;
                case 'AWAITING_RESPONSE':
                    stateMarker = '?';
                    break;
            }
            const desc = task.description.length > 40
                ? task.description.substring(0, 40) + '...'
                : task.description;
            return {
                id: task.id,
                label: desc,
                data: task.id,
                prefix: stateMarker,
            };
        });
        // TTY: use InteractivePicker (keyboard-navigable, Tier-0 Rule E)
        if (process.stdin.isTTY) {
            const picker = new interactive_picker_1.InteractivePicker(pickerItems, {
                title: 'Select a task to view details:',
            });
            this.pickerActive = true;
            this.rl?.pause();
            try {
                const result = await picker.prompt();
                if (result.type === 'selected' && result.item) {
                    await this.handleLogs([result.item.data]);
                }
            }
            finally {
                this.pickerActive = false;
                this.rl?.resume();
                this.rl?.prompt();
            }
            return { success: true };
        }
        // Non-TTY fallback
        this.print('');
        this.print('Select a task to view details:');
        this.print('');
        const items = new Map();
        pickerItems.forEach((item, i) => {
            const num = i + 1;
            items.set(num, item.data);
            this.print('  ' + num + '. [' + item.prefix + '] ' + item.label);
        });
        this.print('');
        this.print('Enter number (1-' + pickerItems.length + ') to view details, or q to cancel:');
        this.pendingSelectionMode = { type: 'tasks', items };
        return { success: true };
    }
    /**
     * Handle /trace command
     * Per spec 28_CONVERSATION_TRACE.md Section 5.1
     */
    async handleTrace(args) {
        if (args.length === 0) {
            this.print('Usage: /trace <task-id|#> [--latest] [--raw]');
            this.print('');
            this.print('Options:');
            this.print('  --latest  Show only the latest iteration');
            this.print('  --raw     Show raw JSONL data');
            return {
                success: false,
                error: { code: 'E123', message: 'Task ID required' },
            };
        }
        // Parse task ID (support number reference from /tasks)
        let taskId = args[0];
        const taskNum = parseInt(taskId, 10);
        if (!isNaN(taskNum) && this.taskNumberMap.has(taskNum)) {
            taskId = this.taskNumberMap.get(taskNum);
        }
        // Parse options
        const latest = args.includes('--latest');
        const raw = args.includes('--raw');
        // Get state directory from runner
        if (!this.session.runner) {
            this.print('No active session. Use /start to begin a session.');
            return {
                success: false,
                error: { code: 'E104', message: 'No active session' },
            };
        }
        const stateDir = this.session.runner.getSessionDirectory();
        if (!stateDir) {
            this.print('Session directory not available.');
            return {
                success: false,
                error: { code: 'E124', message: 'Session directory not available' },
            };
        }
        const result = this.traceCommand.getTrace(stateDir, taskId, {
            latest,
            raw,
        });
        if (result.success) {
            this.print('--- Conversation Trace for ' + taskId + ' ---');
            this.print(result.output || 'No trace data found.');
            this.print('---');
            return { success: true };
        }
        else {
            this.print('Error [' + result.error?.code + ']: ' + (result.error?.message || result.message));
            return { success: false, error: result.error };
        }
    }
    /**
     * Handle /tasks command
     * Shows task queue with RUNNING/QUEUED/COMPLETE/ERROR/INCOMPLETE states
     * Per redesign: proves non-blocking by showing multiple tasks simultaneously
     * Per spec 21_STABLE_DEV.md: Task numbers (1, 2, 3...) for easier reference
     * Per v1.0.26: /tasks ui for interactive selection
     */
    async handleTasks(args = []) {
        // /tasks ui - interactive selection mode
        if (args.length > 0 && args[0].toLowerCase() === 'ui') {
            await this.handleTasksInteractive();
            return;
        }
        this.print('');
        this.print('Task Queue');
        this.print('');
        // Clear and rebuild task number map on each display
        this.taskNumberMap.clear();
        if (this.taskQueue.length === 0) {
            this.print('No tasks in queue.');
            this.print('');
            // Also show legacy tasks from statusCommands if available
            const legacyResult = await this.statusCommands.getTasks();
            if (legacyResult && legacyResult.trim()) {
                this.print('Session Tasks:');
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
        const awaiting = this.taskQueue.filter(t => t.state === 'AWAITING_RESPONSE').length;
        // Build summary string with awaiting count
        let summary = running + ' RUNNING, ' + queued + ' QUEUED, ' + complete + ' COMPLETE';
        if (awaiting > 0) {
            summary += ', ' + awaiting + ' AWAITING_RESPONSE';
        }
        if (incomplete > 0) {
            summary += ', ' + incomplete + ' INCOMPLETE';
        }
        if (error > 0) {
            summary += ', ' + error + ' ERROR';
        }
        this.print('Summary: ' + summary);
        this.print('');
        // List all tasks with state and task number
        let taskNum = 1;
        for (const task of this.taskQueue) {
            // Build task number map for /logs <number> support
            this.taskNumberMap.set(taskNum, task.id);
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
                case 'AWAITING_RESPONSE':
                    stateMarker = '[?]';
                    break;
            }
            // Show task number prefix for easier reference (e.g., "1. [*] task-123...")
            this.print(taskNum + '. ' + stateMarker + ' ' + task.id + ' | ' + task.state + durationStr);
            this.print('      ' + promptSummary);
            taskNum++;
            // Show error message if error
            if (task.state === 'ERROR' && task.errorMessage) {
                this.print('      Error: ' + task.errorMessage);
            }
            // Show clarification question if awaiting response
            if (task.state === 'AWAITING_RESPONSE') {
                if (task.clarificationQuestion) {
                    this.print('      Question: ' + task.clarificationQuestion);
                }
                if (task.clarificationReason) {
                    this.print('      Reason: ' + task.clarificationReason);
                }
                this.print('      How to respond: /respond <your answer>');
            }
            // Show files modified if complete
            if (task.state === 'COMPLETE' && task.filesModified && task.filesModified.length > 0) {
                this.print('      Files: ' + task.filesModified.slice(0, 3).join(', ') +
                    (task.filesModified.length > 3 ? ' (+' + (task.filesModified.length - 3) + ' more)' : ''));
            }
        }
        this.print('');
        this.print('Use /logs <task-id> or /logs <number> for details.');
        this.print('');
    }
    /**
     * Handle /status command
     */
    async handleStatus() {
        const result = await this.statusCommands.getStatus();
        this.print(result);
        // Add awaiting_user_response status from task queue
        const awaitingTask = this.taskQueue.find(t => t.state === 'AWAITING_RESPONSE');
        const hasPending = this.hasPendingResponse();
        this.print('');
        this.print('User Response Status:');
        this.print('  awaiting_user_response: ' + (hasPending || awaitingTask !== undefined));
        this.print('  pending_task_id: ' + (awaitingTask?.id || this.pendingUserResponse?.taskId || 'null'));
        if (awaitingTask?.clarificationQuestion) {
            this.print('  pending_question: ' + awaitingTask.clarificationQuestion);
        }
    }
    /**
     * Handle /start command
     * Per spec Property 32, 33: Use verification_root for file operations
     * - cwd mode: use process.cwd() (verificationRoot)
     * - temp mode: use temp directory (verificationRoot)
     * - fixed mode: use projectRoot
     */
    async handleStart(args) {
        // In cwd/temp mode, use verificationRoot for file operations
        // In fixed mode or with explicit args, use the provided/session path
        const projectPath = args[0] ||
            (this.projectMode === 'cwd' || this.projectMode === 'temp'
                ? this.verificationRoot
                : this.session.projectPath);
        try {
            // Create userResponseHandler if auto-resolve is enabled
            const sessionOptions = this.config.enableAutoResolve
                ? { userResponseHandler: this.createUserResponseHandler() }
                : undefined;
            const result = await this.sessionCommands.start(projectPath, sessionOptions);
            if (result.success) {
                this.session.sessionId = result.sessionId;
                this.session.runner = result.runner;
                this.session.status = 'running';
                // Keep session.projectPath as verificationRoot in temp mode
                this.session.projectPath = projectPath;
                // Wire up template provider per spec 32_TEMPLATE_INJECTION.md
                // This allows RunnerCore to get the active template during prompt assembly
                this.session.runner.setTemplateProvider(() => this.templateCommand.getActive());
                // Initialize supervisor
                const supervisorConfig = {
                    checkIntervalMs: 5000,
                    maxRetries: 3,
                    timeoutMs: this.config.evidenceDir ? 300000 : 300000,
                };
                this.session.supervisor = new executor_supervisor_1.ExecutorSupervisor(this.session.runner, supervisorConfig);
                this.print('Session started: ' + result.sessionId);
                this.print('Project: ' + projectPath);
                if (this.config.enableAutoResolve) {
                    this.print('LLM Auto-Resolve: Enabled');
                }
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
            // Pass userResponseHandler if auto-resolve is enabled
            const sessionOptions = this.config.enableAutoResolve
                ? { userResponseHandler: this.createUserResponseHandler() }
                : undefined;
            const result = await this.sessionCommands.continueSession(sessionId, sessionOptions);
            if (result.success) {
                this.session.sessionId = sessionId;
                this.session.runner = result.runner;
                this.session.status = 'running';
                // Wire up template provider per spec 32_TEMPLATE_INJECTION.md
                this.session.runner.setTemplateProvider(() => this.templateCommand.getActive());
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
     * Handle /respond command
     * Allows user to respond to a task awaiting clarification
     * Usage: /respond <text> or /respond <task-id> <text>
     */
    async handleRespond(args) {
        // Find task awaiting response
        const awaitingTasks = this.taskQueue.filter(t => t.state === 'AWAITING_RESPONSE');
        // Fail-closed: no tasks awaiting response
        if (awaitingTasks.length === 0) {
            this.print('');
            this.print('[FAIL-CLOSED] No tasks awaiting response.');
            this.print('');
            if (this.taskQueue.length === 0) {
                this.print('Task queue is empty. Use a prompt to create a task first.');
            }
            else {
                this.print('Current task states:');
                for (const task of this.taskQueue) {
                    this.print('  ' + task.id + ': ' + task.state);
                }
                this.print('');
                this.print('Tip: Only AWAITING_RESPONSE tasks can receive /respond.');
                this.print('     Use /tasks to see the full task queue.');
            }
            return {
                success: false,
                error: { code: 'E107', message: 'No tasks awaiting response - nothing to respond to' },
            };
        }
        if (args.length === 0) {
            // Show awaiting tasks and their questions
            this.print('');
            this.print('Tasks awaiting response:');
            this.print('');
            for (const task of awaitingTasks) {
                this.print('Task: ' + task.id);
                this.print('Description: ' + task.description);
                if (task.clarificationQuestion) {
                    this.print('Question: ' + task.clarificationQuestion);
                }
                if (task.clarificationReason) {
                    this.print('Reason: ' + task.clarificationReason);
                }
                this.print('');
            }
            this.print('Usage: /respond <your response>');
            this.print('       /respond <task-id> <your response>');
            return { success: true };
        }
        // Determine which task to respond to and what the response is
        let targetTask;
        let responseText;
        // Check if first arg is a task ID
        const possibleTaskId = args[0];
        const matchingTask = awaitingTasks.find(t => t.id === possibleTaskId);
        if (matchingTask) {
            // First arg is task ID, rest is response
            targetTask = matchingTask;
            responseText = args.slice(1).join(' ');
        }
        else if (awaitingTasks.length === 1) {
            // Only one task awaiting, respond to it
            targetTask = awaitingTasks[0];
            responseText = args.join(' ');
        }
        else {
            // Multiple tasks awaiting, need task ID
            this.print('Multiple tasks awaiting response. Please specify task ID:');
            for (const task of awaitingTasks) {
                this.print('  ' + task.id + ': ' + (task.clarificationQuestion || task.description));
            }
            return {
                success: false,
                error: { code: 'E108', message: 'Multiple tasks awaiting response - specify task ID' },
            };
        }
        if (!responseText.trim()) {
            this.print('Error: Response text is required.');
            this.print('Usage: /respond <your response>');
            return {
                success: false,
                error: { code: 'E109', message: 'Response text is required' },
            };
        }
        // Update task state and resolve pending response
        this.print('');
        this.print('Resuming task ' + targetTask.id + ' with response...');
        // Store the response in the task for the executor to use
        targetTask.userResponse = responseText;
        // Check if there's a pending auto-resolve response to resolve
        // This handles the case where AutoResolvingExecutor is waiting for user input
        if (this.hasPendingResponse() && this.pendingUserResponse?.taskId === targetTask.id) {
            // Resolve the pending Promise - executor will continue automatically
            this.resolvePendingResponse(responseText);
            this.print('Response delivered to executor.');
        }
        else {
            // Legacy behavior: re-queue the task for execution
            targetTask.state = 'QUEUED';
            // Sync re-queued state to QueueStore
            this.syncTaskToQueueStore(targetTask).catch(err => {
                console.error('[QueueStore] Failed to sync re-queued task:', err.message);
            });
            // Restart task worker if not running
            if (!this.isTaskWorkerRunning) {
                this.startTaskWorker();
            }
            this.print('Task ' + targetTask.id + ' re-queued with response.');
        }
        return { success: true };
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
        this.renderer.flush();
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
     * Per spec 18_CLI_TWO_PANE.md: Use TwoPaneRenderer for TTY output
     *
     * Syncs readline input state to renderer before output,
     * ensuring input line is preserved during log output.
     */
    print(message) {
        // Sync input state from readline to renderer
        // Per spec 18_CLI_TWO_PANE.md: Input line must never be disrupted
        if (this.rl && this.renderer.isEnabled()) {
            const rlAny = this.rl;
            const line = rlAny.line || '';
            const cursor = rlAny.cursor ?? line.length;
            this.renderer.updateInput(line, cursor);
        }
        this.renderer.writeLog(message);
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
    /**
     * Create a userResponseHandler for AutoResolvingExecutor
     * This handler is called when LLM cannot auto-resolve a case-by-case question
     * It displays the question to the user and waits for /respond command
     *
     * @returns UserResponseHandler callback function
     */
    createUserResponseHandler() {
        return async (question, options, context) => {
            // Get current task ID
            const currentTask = this.taskQueue.find(t => t.state === 'RUNNING');
            const taskId = currentTask?.id || this.session.current_task_id || 'unknown';
            // Determine clarification reason from context
            const clarificationReason = context || 'Case-by-case decision required (cannot be auto-resolved)';
            // Mark task as awaiting response
            if (currentTask) {
                currentTask.state = 'AWAITING_RESPONSE';
                currentTask.clarificationQuestion = question;
                currentTask.clarificationReason = clarificationReason;
                // Sync to QueueStore for persistence (AWAITING_RESPONSE survives restart)
                await this.syncTaskToQueueStore(currentTask);
            }
            // Display the question to the user (no decorative characters per spec)
            this.print('');
            this.print('[AWAITING_RESPONSE] Task ' + taskId + ' needs your input');
            this.print('');
            this.print('Question: ' + question);
            this.print('Reason: ' + clarificationReason);
            if (options && options.length > 0) {
                this.print('');
                this.print('Options:');
                options.forEach((opt, i) => {
                    this.print('  ' + (i + 1) + '. ' + opt);
                });
            }
            this.print('');
            this.print('How to respond: /respond <your answer>');
            this.print('');
            // Create a Promise that will be resolved when user provides /respond
            return new Promise((resolve, reject) => {
                this.pendingUserResponse = {
                    taskId,
                    question,
                    context: clarificationReason,
                    resolve,
                    reject,
                };
            });
        };
    }
    /**
     * Resolve a pending user response (called by /respond command)
     * @param response - User's response text
     * @returns true if response was delivered, false if no pending response
     */
    resolvePendingResponse(response) {
        if (!this.pendingUserResponse) {
            return false;
        }
        const pending = this.pendingUserResponse;
        this.pendingUserResponse = null;
        // Resolve the Promise with user's response
        pending.resolve(response);
        // Mark task back to RUNNING (executor will continue)
        const task = this.taskQueue.find(t => t.id === pending.taskId);
        if (task && task.state === 'AWAITING_RESPONSE') {
            task.state = 'RUNNING';
            // Sync to QueueStore (resuming from AWAITING_RESPONSE)
            this.syncTaskToQueueStore(task).catch(err => {
                console.error('[QueueStore] Failed to sync resumed task:', err.message);
            });
        }
        return true;
    }
    /**
     * Check if there's a pending user response
     */
    hasPendingResponse() {
        return this.pendingUserResponse !== null;
    }
    /**
     * Get the pending response question (for display)
     */
    getPendingResponseQuestion() {
        return this.pendingUserResponse?.question || null;
    }
    /**
     * Get REPL configuration for passing to SessionCommands
     */
    getConfig() {
        return { ...this.config };
    }
    // ============================================================================
    // Template and Config command handlers per spec 32 and 33
    // ============================================================================
    /**
     * Initialize stores for a project
     * Called when session starts to load project-specific settings
     */
    async initializeStoresForProject(projectPath) {
        try {
            await this.templateStore.initialize();
            await this.settingsStore.initialize(projectPath);
        }
        catch (error) {
            console.error('[Stores] Failed to initialize:', error);
        }
    }
    /**
     * Handle /templates command
     * Per spec 32_TEMPLATE_INJECTION.md: list, new, edit, delete, copy
     */
    async handleTemplates(args) {
        const subCommand = args[0]?.toLowerCase();
        // Ensure stores are initialized
        if (!this.session.projectPath) {
            this.print('No project path set. Use /start first.');
            return {
                success: false,
                error: { code: 'E420', message: 'No project path set' },
            };
        }
        await this.initializeStoresForProject(this.session.projectPath);
        switch (subCommand) {
            case undefined:
            case 'list': {
                const result = await this.templateCommand.list();
                if (result.success && result.templates) {
                    const settings = this.settingsStore.get();
                    this.print(this.templateCommand.formatList(result.templates, settings.template.selectedId));
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'new': {
                const name = args[1];
                if (!name) {
                    this.print('Usage: /templates new <name>');
                    this.print('Then provide rules and output format interactively.');
                    return {
                        success: false,
                        error: { code: 'E421', message: 'Template name required' },
                    };
                }
                // For now, create with empty content - user can edit later
                const result = await this.templateCommand.create(name, '', '');
                if (result.success) {
                    this.print(result.message || 'Template created.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'edit': {
                const nameOrId = args[1];
                if (!nameOrId) {
                    this.print('Usage: /templates edit <name|id>');
                    return {
                        success: false,
                        error: { code: 'E422', message: 'Template name or ID required' },
                    };
                }
                // Find the template first
                const listResult = await this.templateCommand.list();
                const template = listResult.templates?.find(t => t.id === nameOrId || t.name === nameOrId);
                if (!template) {
                    this.print('Template not found: ' + nameOrId);
                    return {
                        success: false,
                        error: { code: 'E405', message: 'Template not found' },
                    };
                }
                // Show current content
                this.print(this.templateCommand.formatDetail(template));
                this.print('To update, use: /templates edit <name|id> rules "<new rules>"');
                this.print('           or: /templates edit <name|id> format "<new format>"');
                return { success: true };
            }
            case 'delete': {
                const nameOrId = args[1];
                if (!nameOrId) {
                    this.print('Usage: /templates delete <name|id>');
                    return {
                        success: false,
                        error: { code: 'E423', message: 'Template name or ID required' },
                    };
                }
                const result = await this.templateCommand.delete(nameOrId);
                if (result.success) {
                    this.print(result.message || 'Template deleted.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'copy': {
                const sourceNameOrId = args[1];
                const newName = args[2];
                if (!sourceNameOrId || !newName) {
                    this.print('Usage: /templates copy <source-name|id> <new-name>');
                    return {
                        success: false,
                        error: { code: 'E424', message: 'Source and new name required' },
                    };
                }
                const result = await this.templateCommand.copy(sourceNameOrId, newName);
                if (result.success) {
                    this.print(result.message || 'Template copied.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            default:
                this.print('Unknown subcommand: ' + subCommand);
                this.print('Usage: /templates [list|new|edit|delete|copy]');
                return {
                    success: false,
                    error: { code: 'E425', message: 'Unknown subcommand: ' + subCommand },
                };
        }
    }
    /**
     * Handle /template command
     * Per spec 32_TEMPLATE_INJECTION.md: use, on, off, show
     */
    async handleTemplate(args) {
        const subCommand = args[0]?.toLowerCase();
        // Ensure stores are initialized
        if (!this.session.projectPath) {
            this.print('No project path set. Use /start first.');
            return {
                success: false,
                error: { code: 'E420', message: 'No project path set' },
            };
        }
        await this.initializeStoresForProject(this.session.projectPath);
        switch (subCommand) {
            case undefined:
            case 'show': {
                const result = await this.templateCommand.show();
                if (result.success) {
                    this.print(result.message || 'No template information available.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'use': {
                const nameOrId = args[1];
                if (!nameOrId) {
                    this.print('Usage: /template use <name|id>');
                    return {
                        success: false,
                        error: { code: 'E426', message: 'Template name or ID required' },
                    };
                }
                const result = await this.templateCommand.use(nameOrId);
                if (result.success) {
                    this.print(result.message || 'Template selected.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'on': {
                const result = await this.templateCommand.enable();
                if (result.success) {
                    this.print(result.message || 'Template injection enabled.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'off': {
                const result = await this.templateCommand.disable();
                if (result.success) {
                    this.print(result.message || 'Template injection disabled.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            default:
                this.print('Unknown subcommand: ' + subCommand);
                this.print('Usage: /template [show|use|on|off]');
                return {
                    success: false,
                    error: { code: 'E427', message: 'Unknown subcommand: ' + subCommand },
                };
        }
    }
    /**
     * Handle /send command
     * Flushes multi-line buffer and submits as a single task
     * Per spec: Alternative to empty line for submitting buffered input
     */
    handleSend() {
        if (this.multiLineBuffer.length === 0) {
            this.print('No buffered input to send.');
            return {
                success: false,
                error: {
                    code: 'E501',
                    message: 'No buffered input. Type your message first, then /send.',
                },
            };
        }
        // Join accumulated lines and submit as single input
        const fullInput = this.multiLineBuffer.join('\n');
        this.multiLineBuffer = [];
        this.inputQueue.push(fullInput);
        this.print('Task Queued');
        this.processQueue();
        return { success: true };
    }
    /**
     * Handle /config command
     * Per spec 33_PROJECT_SETTINGS_PERSISTENCE.md: show, set, reset
     */
    async handleConfig(args) {
        const subCommand = args[0]?.toLowerCase();
        // Ensure stores are initialized
        if (!this.session.projectPath) {
            this.print('No project path set. Use /start first.');
            return {
                success: false,
                error: { code: 'E420', message: 'No project path set' },
            };
        }
        await this.initializeStoresForProject(this.session.projectPath);
        switch (subCommand) {
            case undefined:
            case 'show': {
                const result = await this.configCommand.show();
                if (result.success) {
                    this.print(result.message || 'No configuration information available.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'set': {
                const key = args[1];
                const value = args[2];
                if (!key || !value) {
                    this.print('Usage: /config set <key> <value>');
                    this.print(this.configCommand.formatAvailableKeys());
                    return {
                        success: false,
                        error: { code: 'E502', message: 'Key and value required' },
                    };
                }
                const result = await this.configCommand.set(key, value);
                if (result.success) {
                    this.print(result.message || 'Configuration updated.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'reset': {
                const result = await this.configCommand.reset();
                if (result.success) {
                    this.print(result.message || 'Configuration reset to defaults.');
                }
                else if (result.error) {
                    this.print('Error: ' + result.error.message);
                }
                return { success: result.success, error: result.error };
            }
            case 'keys': {
                this.print(this.configCommand.formatAvailableKeys());
                return { success: true };
            }
            default:
                this.print('Unknown subcommand: ' + subCommand);
                this.print('Usage: /config [show|set|reset|keys]');
                return {
                    success: false,
                    error: { code: 'E505', message: 'Unknown subcommand: ' + subCommand },
                };
        }
    }
    /**
     * Get the active template for prompt injection
     * Used by RunnerCore to inject template content
     */
    getActiveTemplate() {
        const template = this.templateCommand.getActive();
        if (!template) {
            return null;
        }
        return {
            rulesText: template.rulesText,
            outputFormatText: template.outputFormatText,
        };
    }
    /**
     * Handle /verbose command
     * Toggle or set verbose executor logging mode
     * Usage: /verbose [on|off]
     */
    handleVerbose(args) {
        const subCommand = args[0]?.toLowerCase();
        const currentValue = (0, global_config_1.getVerboseExecutor)();
        if (!subCommand) {
            // Toggle current value
            const newValue = !currentValue;
            (0, global_config_1.setVerboseExecutor)(newValue);
            this.print(`Verbose executor logs: ${newValue ? "ON" : "OFF"}`);
            return { success: true };
        }
        switch (subCommand) {
            case "on":
                (0, global_config_1.setVerboseExecutor)(true);
                this.print("Verbose executor logs: ON");
                return { success: true };
            case "off":
                (0, global_config_1.setVerboseExecutor)(false);
                this.print("Verbose executor logs: OFF");
                return { success: true };
            case "status":
                this.print(`Verbose executor logs: ${currentValue ? "ON" : "OFF"}`);
                return { success: true };
            default:
                this.print("Usage: /verbose [on|off|status]");
                this.print("  /verbose       - Toggle verbose mode");
                this.print("  /verbose on    - Enable verbose executor logs");
                this.print("  /verbose off   - Disable verbose executor logs");
                this.print("  /verbose status - Show current status");
                return {
                    success: false,
                    error: { code: "E410", message: "Invalid verbose option: " + subCommand },
                };
        }
    }
    /**
     * Handle /inputmode command
     * Toggle or set input mode (single-line vs multi-line)
     * Usage: /inputmode [single|multi]
     */
    handleInputMode(args) {
        const subCommand = args[0]?.toLowerCase();
        const currentMode = (0, global_config_1.getSingleLineMode)();
        if (!subCommand) {
            // Toggle current mode
            const newMode = !currentMode;
            (0, global_config_1.setSingleLineMode)(newMode);
            this.print(`Input mode: ${newMode ? "single-line (Enter to send)" : "multi-line (Enter x2 to send)"}`);
            return { success: true };
        }
        switch (subCommand) {
            case "single":
                (0, global_config_1.setSingleLineMode)(true);
                this.print("Input mode: single-line (Enter to send)");
                return { success: true };
            case "multi":
                (0, global_config_1.setSingleLineMode)(false);
                this.print("Input mode: multi-line (Enter x2 to send)");
                return { success: true };
            case "status":
                this.print(`Input mode: ${currentMode ? "single-line (Enter to send)" : "multi-line (Enter x2 to send)"}`);
                return { success: true };
            default:
                this.print("Usage: /inputmode [single|multi|status]");
                this.print("  /inputmode        - Toggle input mode");
                this.print("  /inputmode single - Single-line mode (Enter to send)");
                this.print("  /inputmode multi  - Multi-line mode (Enter x2 to send)");
                this.print("  /inputmode status - Show current mode");
                return {
                    success: false,
                    error: { code: "E411", message: "Invalid inputmode option: " + subCommand },
                };
        }
    }
    /**
     * Handle /inspect command - unified event inspection
     * Usage: /inspect [ui|<event-id>]
     */
    async handleInspect(args) {
        // Ensure project path is set
        const projectPath = this.session.projectPath || process.cwd();
        // Lazy initialize inspectCommand with current project path
        if (!this.inspectCommand) {
            this.inspectCommand = new inspect_1.InspectCommand(projectPath);
        }
        const subCommand = args[0]?.toLowerCase();
        // /inspect or /inspect ui - show picker UI
        if (!subCommand || subCommand === 'ui') {
            return await this.handleInspectInteractive();
        }
        // /inspect diagnostic [ui|<id>] - run diagnostics
        if (subCommand === 'diagnostic' || subCommand === 'diag') {
            const diagArg = args[1]?.toLowerCase();
            if (!diagArg || diagArg === 'ui') {
                return await this.handleDiagnosticInteractive();
            }
            return await this.runDiagnosticById(diagArg);
        }
        // /inspect <event-id> - show specific event details
        const result = await this.inspectCommand.execute(args.join(' '));
        if (result.output) {
            this.print(result.output);
        }
        return { success: result.success, error: result.error };
    }
    /**
     * Handle /inspect ui - interactive event browser
     * TTY: keyboard-navigable picker (Tier-0 Rule E)
     * Non-TTY: numbered list with pendingSelectionMode fallback
     */
    async handleInspectInteractive() {
        const projectPath = this.session.projectPath || process.cwd();
        // Lazy initialize inspectCommand
        if (!this.inspectCommand) {
            this.inspectCommand = new inspect_1.InspectCommand(projectPath);
        }
        const events = await this.inspectCommand.getEventsForPicker();
        if (events.length === 0) {
            this.print('');
            this.print('No events recorded yet.');
            this.print('');
            this.print('Events are automatically recorded when:');
            this.print('- Files change (src/, dist/, docs/, etc.)');
            this.print('- Executors run (Claude Code, etc.)');
            this.print('- Tasks change status');
            this.print('- Sessions start/end');
            this.print('- Commands execute');
            this.print('');
            this.print('Start using the REPL to generate events!');
            return { success: true };
        }
        // Build PickerItem array
        const pickerItems = events.map(event => ({
            id: event.id,
            label: event.display,
            data: event.id,
            description: event.id,
        }));
        // TTY: use InteractivePicker (keyboard-navigable, Tier-0 Rule E)
        if (process.stdin.isTTY) {
            const picker = new interactive_picker_1.InteractivePicker(pickerItems, {
                title: 'Select an event to inspect:',
                showDescriptions: true,
            });
            this.pickerActive = true;
            this.rl?.pause();
            try {
                const result = await picker.prompt();
                if (result.type === 'selected' && result.item) {
                    await this.handleInspect([result.item.data]);
                }
            }
            finally {
                this.pickerActive = false;
                this.rl?.resume();
                this.rl?.prompt();
            }
            return { success: true };
        }
        // Non-TTY fallback
        this.print('');
        this.print('Select an event to inspect:');
        this.print('');
        const items = new Map();
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            this.print(event.display);
            this.print(`   ${event.id}`);
            items.set(i + 1, event.id);
        }
        this.print('');
        this.print('Enter number (1-' + events.length + ') to view details, or q to cancel:');
        this.pendingSelectionMode = { type: 'inspect', items };
        return { success: true };
    }
    /**
     * Handle /inspect diagnostic ui - interactive diagnostic picker
     * TTY: keyboard-navigable picker (Tier-0 Rule E)
     * Non-TTY: numbered list with pendingSelectionMode fallback
     */
    async handleDiagnosticInteractive() {
        const registry = this.getDiagnosticRegistry();
        const definitions = registry.getAll();
        if (definitions.length === 0) {
            this.print('');
            this.print('No diagnostic definitions registered.');
            return { success: true };
        }
        // Build PickerItem array
        const pickerItems = definitions.map(def => {
            const category = def.category ? `[${def.category}]` : '';
            return {
                id: def.id,
                label: `${category} ${def.title}`,
                data: def.id,
                description: def.description,
            };
        });
        // TTY: use InteractivePicker (keyboard-navigable, Tier-0 Rule E)
        if (process.stdin.isTTY) {
            const picker = new interactive_picker_1.InteractivePicker(pickerItems, {
                title: 'Select a diagnostic to run:',
                showDescriptions: true,
            });
            this.pickerActive = true;
            this.rl?.pause();
            try {
                const result = await picker.prompt();
                if (result.type === 'selected' && result.item) {
                    await this.runDiagnosticById(result.item.data);
                }
            }
            finally {
                this.pickerActive = false;
                this.rl?.resume();
                this.rl?.prompt();
            }
            return { success: true };
        }
        // Non-TTY fallback
        this.print('');
        this.print('Select a diagnostic to run:');
        this.print('');
        const items = new Map();
        for (let i = 0; i < definitions.length; i++) {
            const def = definitions[i];
            this.print(`${i + 1}. ${pickerItems[i].label}`);
            this.print(`   ${def.description}`);
            items.set(i + 1, def.id);
        }
        this.print('');
        this.print('Enter number (1-' + definitions.length + ') to run, or q to cancel:');
        this.pendingSelectionMode = { type: 'diagnostic', items };
        return { success: true };
    }
    /**
     * Run a diagnostic by its ID.
     */
    async runDiagnosticById(id) {
        const registry = this.getDiagnosticRegistry();
        const definition = registry.get(id);
        if (!definition) {
            this.print('Unknown diagnostic: ' + id);
            this.print('');
            this.print('Available diagnostics:');
            for (const def of registry.getAll()) {
                this.print('  ' + def.id + ' - ' + def.title);
            }
            return {
                success: false,
                error: { code: 'E601', message: 'Unknown diagnostic: ' + id },
            };
        }
        const projectPath = this.session.projectPath || process.cwd();
        const runner = new diagnostics_1.DiagnosticRunner(projectPath);
        this.print('Running diagnostic: ' + definition.title + '...');
        this.print('');
        const result = await runner.run(definition);
        this.printDiagnosticResult(result);
        return { success: result.passed };
    }
    /**
     * Get or create the diagnostic registry with builtin definitions.
     */
    getDiagnosticRegistry() {
        const registry = new diagnostics_1.DiagnosticRegistry();
        for (const def of diagnostics_1.builtinDiagnostics) {
            registry.register(def);
        }
        return registry;
    }
    /**
     * Format and print a diagnostic result.
     */
    printDiagnosticResult(result) {
        const statusIcon = result.passed ? 'PASS' : 'FAIL';
        this.print('='.repeat(60));
        this.print(`[${statusIcon}] ${result.title}`);
        this.print('='.repeat(60));
        this.print('');
        if (!result.preconditionsMet) {
            this.print('Preconditions not met:');
            for (const err of result.preconditionErrors) {
                this.print('  - ' + err);
            }
            this.print('');
            return;
        }
        // Step results
        this.print('Steps:');
        for (const step of result.stepResults) {
            const icon = step.success ? 'ok' : 'ERR';
            this.print(`  [${icon}] ${step.stepId} (${step.durationMs}ms)`);
            if (step.error) {
                this.print(`       ${step.error}`);
            }
        }
        this.print('');
        // Assertion results
        this.print('Assertions:');
        for (const assertion of result.assertionResults) {
            const icon = assertion.passed ? 'ok' : (assertion.assertion.severity === 'error' ? 'FAIL' : 'WARN');
            this.print(`  [${icon}] ${assertion.message}`);
            if (!assertion.passed && assertion.actual !== undefined) {
                this.print(`       actual: ${assertion.actual}`);
            }
        }
        this.print('');
        // Summary
        this.print(`Summary: ${result.summary}`);
        this.print(`Duration: ${result.durationMs}ms`);
        this.print('='.repeat(60));
    }
}
exports.REPLInterface = REPLInterface;
//# sourceMappingURL=repl-interface.js.map