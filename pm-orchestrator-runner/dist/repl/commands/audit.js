"use strict";
/**
 * Audit Command
 *
 * FZF-style task selection UI for dist audit and evidence capture.
 * Implements "監査失格" prevention by blocking dangerous commands during audit.
 *
 * Commands:
 * - /audit ui       - Interactive FZF-style task picker
 * - /audit run <id> - Execute audit task directly
 * - /audit list     - List all audit tasks
 *
 * Audit Tasks:
 * - T001: docs-only dist change audit (full automation)
 * - T002: Current dist diff detection
 * - T003: Change trigger tracking (hooks, package.json scripts)
 * - T004: File monitoring for dist generation process
 * - T005: "不正検知" reproduction helper
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
exports.AuditCommand = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Commands that are ALWAYS blocked during any audit task
 */
const ALWAYS_BLOCKED_COMMANDS = [
    'npm test',
    'npm run test',
    'pnpm test',
    'pnpm run test',
    'yarn test',
    'npm run build',
    'pnpm run build',
    'pnpm build',
    'npm run typecheck',
    'pnpm run typecheck',
    'pnpm typecheck',
    'tsc',
    'eslint',
    'npm run lint',
    'pnpm run lint',
    'pnpm lint',
];
/**
 * Category display names
 */
const CATEGORY_NAMES = {
    dist_audit: 'Dist Audit',
    repo_hygiene: 'Repo Hygiene',
    evidence_capture: 'Evidence Capture',
    ci_hook_investigation: 'CI/Hook Investigation',
    safe_commands: 'Safe Commands',
};
/**
 * Execute a shell command and return evidence
 */
function execCommand(command, cwd, log, blockedCommands) {
    // Check if command is blocked
    const cmdLower = command.toLowerCase().trim();
    const isBlocked = [...ALWAYS_BLOCKED_COMMANDS, ...blockedCommands].some(blocked => cmdLower.startsWith(blocked.toLowerCase()));
    if (isBlocked) {
        log({
            type: 'blocked',
            command,
            observation: 'BLOCKED: Command is forbidden during audit mode',
        });
        return { stdout: '', stderr: 'BLOCKED: Command forbidden during audit', exitCode: -1 };
    }
    try {
        const options = {
            cwd,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 10 * 1024 * 1024, // 10MB
        };
        const stdout = (0, child_process_1.execSync)(command, options);
        log({
            type: 'command',
            command,
            stdout,
            stderr: '',
            exitCode: 0,
        });
        return { stdout, stderr: '', exitCode: 0 };
    }
    catch (err) {
        const execErr = err;
        const stdout = (execErr.stdout || '');
        const stderr = (execErr.stderr || '');
        const exitCode = execErr.status || 1;
        log({
            type: 'command',
            command,
            stdout,
            stderr,
            exitCode,
        });
        return { stdout, stderr, exitCode };
    }
}
/**
 * T001: docs-only dist change audit
 * Full automation of the manual audit procedure
 */
async function executeT001(projectPath, log) {
    const evidence = [];
    const addEvidence = (ev) => {
        const timestamped = { ...ev, timestamp: new Date().toISOString() };
        evidence.push(timestamped);
        log(ev);
    };
    // STEP 0: Verify environment
    addEvidence({ type: 'observation', observation: '=== STEP 0: Environment verification ===' });
    const pwd = execCommand('pwd', projectPath, addEvidence, []);
    const gitRoot = execCommand('git rev-parse --show-toplevel', projectPath, addEvidence, []);
    const branch = execCommand('git branch --show-current', projectPath, addEvidence, []);
    const head = execCommand('git rev-parse HEAD', projectPath, addEvidence, []);
    // STEP 1: Clean state
    addEvidence({ type: 'observation', observation: '=== STEP 1: Reset to clean state ===' });
    execCommand('git reset --hard HEAD', projectPath, addEvidence, []);
    execCommand('git clean -fd', projectPath, addEvidence, []);
    // Verify clean state
    const statusAfterClean = execCommand('git status --porcelain', projectPath, addEvidence, []);
    if (statusAfterClean.stdout.trim() !== '') {
        addEvidence({
            type: 'observation',
            observation: 'WARNING: Repository not clean after reset',
        });
    }
    // Record dist state before change
    const distLsBefore = execCommand('ls -la dist/ 2>/dev/null || echo "dist/ not found"', projectPath, addEvidence, []);
    // STEP 2: Apply docs-only change
    addEvidence({ type: 'observation', observation: '=== STEP 2: Apply docs-only change ===' });
    const auditMarker = `AUDIT_DOCS_ONLY_${Date.now()}`;
    const docsFile = path.join(projectPath, 'docs/EVIDENCE_SELF_HOSTING.md');
    // Check if docs file exists
    if (!fs.existsSync(docsFile)) {
        addEvidence({
            type: 'observation',
            observation: 'ERROR: docs/EVIDENCE_SELF_HOSTING.md not found',
        });
        return {
            taskId: 'T001',
            result: 'ERROR',
            evidence,
            summary: 'Target docs file not found',
        };
    }
    // Append audit marker
    const originalContent = fs.readFileSync(docsFile, 'utf-8');
    fs.writeFileSync(docsFile, originalContent + '\n' + auditMarker + '\n');
    addEvidence({
        type: 'observation',
        observation: `Appended marker "${auditMarker}" to docs/EVIDENCE_SELF_HOSTING.md`,
    });
    // Verify only docs changed
    const diffNameOnly = execCommand('git diff --name-only', projectPath, addEvidence, []);
    const changedFiles = diffNameOnly.stdout.trim().split('\n').filter(f => f);
    if (changedFiles.length !== 1 || changedFiles[0] !== 'docs/EVIDENCE_SELF_HOSTING.md') {
        addEvidence({
            type: 'observation',
            observation: `WARNING: Unexpected files changed: ${changedFiles.join(', ')}`,
        });
    }
    // STEP 3: Observe dist
    addEvidence({ type: 'observation', observation: '=== STEP 3: Observe dist changes ===' });
    // Check dist status
    const distStatus = execCommand('git status --porcelain dist/', projectPath, addEvidence, []);
    const distLsAfter = execCommand('ls -la dist/ 2>/dev/null || echo "dist/ not found"', projectPath, addEvidence, []);
    // STEP 4: Determine result
    addEvidence({ type: 'observation', observation: '=== STEP 4: Result determination ===' });
    const distChanges = distStatus.stdout.trim();
    // Restore original file
    fs.writeFileSync(docsFile, originalContent);
    execCommand('git checkout -- docs/EVIDENCE_SELF_HOSTING.md', projectPath, addEvidence, []);
    if (distChanges === '') {
        addEvidence({
            type: 'observation',
            observation: 'RESULT=PASS: No dist changes detected from docs-only modification',
        });
        return {
            taskId: 'T001',
            result: 'PASS',
            evidence,
            summary: 'docs-only change did NOT trigger dist changes',
        };
    }
    else {
        addEvidence({
            type: 'observation',
            observation: `RESULT=FAIL: dist changes detected: ${distChanges}`,
        });
        return {
            taskId: 'T001',
            result: 'FAIL',
            evidence,
            summary: `docs-only change triggered dist changes: ${distChanges}`,
        };
    }
}
/**
 * T002: Current dist diff detection
 */
async function executeT002(projectPath, log) {
    const evidence = [];
    const addEvidence = (ev) => {
        const timestamped = { ...ev, timestamp: new Date().toISOString() };
        evidence.push(timestamped);
        log(ev);
    };
    addEvidence({ type: 'observation', observation: '=== T002: Current dist diff detection ===' });
    // Check current dist status
    const distStatus = execCommand('git status --porcelain dist/', projectPath, addEvidence, []);
    const distDiff = execCommand('git diff --stat dist/', projectPath, addEvidence, []);
    // List dist files with modification times
    execCommand('ls -la dist/', projectPath, addEvidence, []);
    // Check if dist is in .gitignore
    const gitignoreCheck = execCommand('grep -n "dist" .gitignore 2>/dev/null || echo "dist not in .gitignore"', projectPath, addEvidence, []);
    const hasChanges = distStatus.stdout.trim() !== '';
    if (hasChanges) {
        addEvidence({
            type: 'observation',
            observation: `OBSERVATION: dist/ has uncommitted changes`,
        });
        return {
            taskId: 'T002',
            result: 'FAIL',
            evidence,
            summary: `dist/ has uncommitted changes: ${distStatus.stdout.trim()}`,
        };
    }
    else {
        addEvidence({
            type: 'observation',
            observation: 'OBSERVATION: dist/ is clean (no uncommitted changes)',
        });
        return {
            taskId: 'T002',
            result: 'PASS',
            evidence,
            summary: 'dist/ is clean',
        };
    }
}
/**
 * T003: Change trigger tracking
 */
async function executeT003(projectPath, log) {
    const evidence = [];
    const addEvidence = (ev) => {
        const timestamped = { ...ev, timestamp: new Date().toISOString() };
        evidence.push(timestamped);
        log(ev);
    };
    addEvidence({ type: 'observation', observation: '=== T003: Change trigger tracking ===' });
    // Check git hooks
    addEvidence({ type: 'observation', observation: '--- Git hooks ---' });
    execCommand('ls -la .git/hooks/ 2>/dev/null || echo "No .git/hooks/"', projectPath, addEvidence, []);
    // Check for active hooks (not .sample)
    execCommand('find .git/hooks -type f ! -name "*.sample" 2>/dev/null || echo "No active hooks"', projectPath, addEvidence, []);
    // Check package.json scripts
    addEvidence({ type: 'observation', observation: '--- package.json scripts ---' });
    execCommand('cat package.json | grep -A 50 \'"scripts"\' | head -60', projectPath, addEvidence, []);
    // Check for husky
    addEvidence({ type: 'observation', observation: '--- Husky config ---' });
    execCommand('ls -la .husky/ 2>/dev/null || echo "No .husky/"', projectPath, addEvidence, []);
    execCommand('cat .husky/pre-commit 2>/dev/null || echo "No .husky/pre-commit"', projectPath, addEvidence, []);
    execCommand('cat .husky/pre-push 2>/dev/null || echo "No .husky/pre-push"', projectPath, addEvidence, []);
    // Check for lefthook
    addEvidence({ type: 'observation', observation: '--- Lefthook config ---' });
    execCommand('cat lefthook.yml 2>/dev/null || cat .lefthook.yml 2>/dev/null || echo "No lefthook config"', projectPath, addEvidence, []);
    // Check for lint-staged
    addEvidence({ type: 'observation', observation: '--- lint-staged config ---' });
    execCommand('cat .lintstagedrc 2>/dev/null || cat .lintstagedrc.json 2>/dev/null || echo "No lint-staged config"', projectPath, addEvidence, []);
    execCommand('cat package.json | grep -A 20 \'"lint-staged"\' 2>/dev/null || echo "No lint-staged in package.json"', projectPath, addEvidence, []);
    return {
        taskId: 'T003',
        result: 'PASS',
        evidence,
        summary: 'Change trigger information collected',
    };
}
/**
 * T004: File monitoring preparation
 */
async function executeT004(projectPath, log) {
    const evidence = [];
    const addEvidence = (ev) => {
        const timestamped = { ...ev, timestamp: new Date().toISOString() };
        evidence.push(timestamped);
        log(ev);
    };
    addEvidence({ type: 'observation', observation: '=== T004: File monitoring preparation ===' });
    // Check if fs_usage is available (macOS)
    const fsUsageCheck = execCommand('which fs_usage 2>/dev/null || echo "fs_usage not found"', projectPath, addEvidence, []);
    // Check if inotifywait is available (Linux)
    const inotifyCheck = execCommand('which inotifywait 2>/dev/null || echo "inotifywait not found"', projectPath, addEvidence, []);
    // Record current dist state for comparison
    addEvidence({ type: 'observation', observation: '--- Current dist state (for later comparison) ---' });
    execCommand('find dist -type f -exec ls -la {} \\; 2>/dev/null | head -50 || echo "dist/ not found or empty"', projectPath, addEvidence, []);
    // Get file hashes for dist
    execCommand('find dist -type f -exec md5sum {} \\; 2>/dev/null | head -50 || find dist -type f -exec md5 {} \\; 2>/dev/null | head -50 || echo "Cannot hash dist files"', projectPath, addEvidence, []);
    addEvidence({
        type: 'observation',
        observation: 'NOTE: To monitor file changes in real-time, run: sudo fs_usage -w -f filesys | grep dist/',
    });
    return {
        taskId: 'T004',
        result: 'PASS',
        evidence,
        summary: 'File monitoring preparation complete',
    };
}
/**
 * T005: 不正検知 reproduction helper
 */
async function executeT005(projectPath, log) {
    const evidence = [];
    const addEvidence = (ev) => {
        const timestamped = { ...ev, timestamp: new Date().toISOString() };
        evidence.push(timestamped);
        log(ev);
    };
    addEvidence({ type: 'observation', observation: '=== T005: 不正検知 reproduction helper ===' });
    // Step 1: Record initial state
    addEvidence({ type: 'observation', observation: '--- Initial state ---' });
    const initialHead = execCommand('git rev-parse HEAD', projectPath, addEvidence, []);
    const initialStatus = execCommand('git status --porcelain', projectPath, addEvidence, []);
    execCommand('ls -la dist/ 2>/dev/null | head -20 || echo "dist/ not found"', projectPath, addEvidence, []);
    // Step 2: Check what would trigger a build
    addEvidence({ type: 'observation', observation: '--- Build trigger analysis ---' });
    // Check tsconfig
    execCommand('cat tsconfig.json 2>/dev/null | head -30 || echo "No tsconfig.json"', projectPath, addEvidence, []);
    // Check if there's a watch mode or incremental build
    execCommand('grep -r "watch\\|incremental" tsconfig*.json 2>/dev/null || echo "No watch/incremental config found"', projectPath, addEvidence, []);
    // Check for build-related npm scripts
    execCommand('cat package.json | grep -E "(prebuild|postbuild|prepack|postpack|prepare)" || echo "No pre/post build hooks"', projectPath, addEvidence, []);
    // Step 3: Check recent git activity
    addEvidence({ type: 'observation', observation: '--- Recent git activity ---' });
    execCommand('git log --oneline -10', projectPath, addEvidence, []);
    execCommand('git log --oneline --all -- dist/ | head -10', projectPath, addEvidence, []);
    // Step 4: Check for any automated processes
    addEvidence({ type: 'observation', observation: '--- Automated process check ---' });
    execCommand('ps aux | grep -E "(tsc|esbuild|webpack|rollup|vite)" | grep -v grep || echo "No build processes running"', projectPath, addEvidence, []);
    return {
        taskId: 'T005',
        result: 'PASS',
        evidence,
        summary: '不正検知 reproduction data collected',
    };
}
/**
 * All audit tasks
 */
const AUDIT_TASKS = [
    {
        id: 'T001',
        name: 'docs-only dist change audit',
        description: 'Verify that docs-only changes do NOT trigger dist generation',
        category: 'dist_audit',
        blockedCommands: [],
        execute: executeT001,
    },
    {
        id: 'T002',
        name: 'Current dist diff detection',
        description: 'Check if dist/ has any uncommitted changes',
        category: 'dist_audit',
        blockedCommands: [],
        execute: executeT002,
    },
    {
        id: 'T003',
        name: 'Change trigger tracking',
        description: 'Investigate git hooks, package.json scripts, husky, lefthook',
        category: 'ci_hook_investigation',
        blockedCommands: [],
        execute: executeT003,
    },
    {
        id: 'T004',
        name: 'File monitoring preparation',
        description: 'Prepare for monitoring dist generation process',
        category: 'evidence_capture',
        blockedCommands: [],
        execute: executeT004,
    },
    {
        id: 'T005',
        name: '不正検知 reproduction helper',
        description: 'Collect data to help reproduce dist anomaly',
        category: 'evidence_capture',
        blockedCommands: [],
        execute: executeT005,
    },
];
/**
 * Audit Command class
 */
class AuditCommand {
    projectPath = '';
    currentTaskId = null;
    auditLog = [];
    /**
     * Get all audit tasks
     */
    getTasks() {
        return AUDIT_TASKS;
    }
    /**
     * Get task by ID
     */
    getTask(taskId) {
        return AUDIT_TASKS.find(t => t.id.toLowerCase() === taskId.toLowerCase());
    }
    /**
     * Check if a command is blocked during current audit
     */
    isCommandBlocked(command) {
        if (!this.currentTaskId) {
            return false;
        }
        const task = this.getTask(this.currentTaskId);
        if (!task) {
            return false;
        }
        const cmdLower = command.toLowerCase().trim();
        return [...ALWAYS_BLOCKED_COMMANDS, ...task.blockedCommands].some(blocked => cmdLower.startsWith(blocked.toLowerCase()));
    }
    /**
     * Get current audit task ID
     */
    getCurrentTaskId() {
        return this.currentTaskId;
    }
    /**
     * List all audit tasks
     */
    listTasks() {
        const lines = [];
        lines.push('Audit Tasks:');
        lines.push('');
        // Group by category
        const byCategory = new Map();
        for (const task of AUDIT_TASKS) {
            const list = byCategory.get(task.category) || [];
            list.push(task);
            byCategory.set(task.category, list);
        }
        for (const [category, tasks] of byCategory) {
            lines.push(`[${CATEGORY_NAMES[category]}]`);
            for (const task of tasks) {
                lines.push(`  ${task.id}: ${task.name}`);
                lines.push(`      ${task.description}`);
            }
            lines.push('');
        }
        lines.push('Commands:');
        lines.push('  /audit ui       - Interactive task picker');
        lines.push('  /audit run <id> - Run task directly');
        lines.push('  /audit list     - Show this list');
        return {
            success: true,
            message: 'Audit tasks listed',
            output: lines.join('\n'),
        };
    }
    /**
     * Run an audit task
     */
    async runTask(taskId, projectPath) {
        const task = this.getTask(taskId);
        if (!task) {
            return {
                success: false,
                message: 'Task not found',
                error: {
                    code: 'E401',
                    message: `Unknown audit task: ${taskId}`,
                },
            };
        }
        this.projectPath = projectPath;
        this.currentTaskId = task.id;
        this.auditLog = [];
        const logFn = (ev) => {
            this.auditLog.push({ ...ev, timestamp: new Date().toISOString() });
        };
        try {
            const result = await task.execute(projectPath, logFn);
            this.currentTaskId = null;
            // Format output
            const lines = [];
            lines.push(`=== Audit Task ${result.taskId} ===`);
            lines.push(`Result: ${result.result}`);
            lines.push(`Summary: ${result.summary}`);
            lines.push('');
            lines.push('Evidence Log:');
            lines.push('');
            for (const ev of result.evidence) {
                lines.push(`[${ev.timestamp}] ${ev.type.toUpperCase()}`);
                if (ev.command) {
                    lines.push(`  $ ${ev.command}`);
                    if (ev.exitCode !== undefined) {
                        lines.push(`  exit: ${ev.exitCode}`);
                    }
                    if (ev.stdout && ev.stdout.trim()) {
                        const stdoutLines = ev.stdout.trim().split('\n');
                        for (const line of stdoutLines.slice(0, 20)) {
                            lines.push(`  | ${line}`);
                        }
                        if (stdoutLines.length > 20) {
                            lines.push(`  | ... (${stdoutLines.length - 20} more lines)`);
                        }
                    }
                    if (ev.stderr && ev.stderr.trim()) {
                        lines.push(`  stderr: ${ev.stderr.trim()}`);
                    }
                }
                if (ev.observation) {
                    lines.push(`  ${ev.observation}`);
                }
                lines.push('');
            }
            return {
                success: result.result === 'PASS',
                message: result.summary,
                output: lines.join('\n'),
            };
        }
        catch (err) {
            this.currentTaskId = null;
            return {
                success: false,
                message: 'Task execution failed',
                error: {
                    code: 'E402',
                    message: `Task execution error: ${err.message}`,
                },
            };
        }
    }
    /**
     * Get audit log for integration with /logs
     */
    getAuditLog() {
        return this.auditLog;
    }
    /**
     * Format tasks for FZF-style picker
     */
    formatForPicker() {
        const items = new Map();
        const display = [];
        let num = 1;
        for (const task of AUDIT_TASKS) {
            items.set(num, task.id);
            display.push(`${num}. [${task.id}] ${task.name}`);
            display.push(`   ${task.description}`);
            display.push(`   Category: ${CATEGORY_NAMES[task.category]}`);
            num++;
        }
        return { items, display };
    }
}
exports.AuditCommand = AuditCommand;
//# sourceMappingURL=audit.js.map