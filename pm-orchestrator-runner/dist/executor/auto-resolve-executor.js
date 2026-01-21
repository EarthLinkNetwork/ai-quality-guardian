"use strict";
/**
 * Auto-Resolving Executor
 *
 * Wraps ClaudeCodeExecutor and automatically resolves clarification requests
 * using LLM instead of asking the user.
 *
 * When Claude Code needs clarification (e.g., file path), this executor:
 * 1. Analyzes the output to understand what clarification is needed
 * 2. Uses LLM to make a reasonable decision based on project context
 * 3. Re-runs the task with explicit instructions
 *
 * This is per the user's insight: "LLM Layer should answer clarification questions"
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
exports.AutoResolvingExecutor = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const claude_code_executor_1 = require("./claude-code-executor");
const llm_client_1 = require("../mediation/llm-client");
/**
 * Patterns to detect clarification requests in output
 */
const CLARIFICATION_PATTERNS = [
    // Explicit clarification markers
    /clarification_required:(\w+)/i,
    /clarification_needed:(\w+)/i,
    // Question patterns
    /where.*(?:should|save|create|put).*\?/i,
    /which.*(?:file|path|directory).*\?/i,
    /what.*(?:file|name|path).*\?/i,
    /specify.*(?:file|path|location)/i,
    // File path related
    /ファイル(?:名|パス).*(?:指定|教えて)/i,
    /どこに.*(?:保存|作成)/i,
    /保存先.*(?:を|は)/i,
];
/**
 * Auto-Resolving Executor
 *
 * Automatically resolves clarification requests using LLM
 */
class AutoResolvingExecutor {
    innerExecutor;
    llmClient;
    maxRetries;
    projectPath;
    constructor(config) {
        this.innerExecutor = new claude_code_executor_1.ClaudeCodeExecutor(config);
        this.projectPath = config.projectPath;
        this.maxRetries = config.maxRetries ?? 2;
        // Initialize LLM client for auto-resolution
        this.llmClient = llm_client_1.LLMClient.fromEnv(config.llmProvider ?? 'openai', undefined, { temperature: 0.3 } // Lower temperature for more deterministic decisions
        );
    }
    /**
     * Check if Claude Code CLI is available
     */
    async isClaudeCodeAvailable() {
        return this.innerExecutor.isClaudeCodeAvailable();
    }
    /**
     * Check Claude Code CLI auth status
     */
    async checkAuthStatus() {
        return this.innerExecutor.checkAuthStatus();
    }
    /**
     * Execute task with auto-resolution for clarification requests
     */
    async execute(task) {
        let attempts = 0;
        let currentTask = task;
        let lastResult;
        while (attempts < this.maxRetries) {
            attempts++;
            console.log(`[AutoResolvingExecutor] Attempt ${attempts}/${this.maxRetries}`);
            // Execute with inner executor
            const result = await this.innerExecutor.execute(currentTask);
            lastResult = result;
            // If successful, return
            if (result.status === 'COMPLETE') {
                console.log('[AutoResolvingExecutor] Task completed successfully');
                return result;
            }
            // Check if clarification is needed
            const clarification = this.detectClarification(result.output, result.error);
            if (!clarification || clarification.type === 'unknown') {
                // No clarification detected or unknown type - return as-is
                console.log('[AutoResolvingExecutor] No resolvable clarification detected');
                return result;
            }
            console.log(`[AutoResolvingExecutor] Clarification detected: ${clarification.type}`);
            // Try to auto-resolve
            const resolution = await this.autoResolve(clarification, currentTask.prompt);
            if (!resolution.resolved || !resolution.explicitPrompt) {
                console.log('[AutoResolvingExecutor] Could not auto-resolve, returning original result');
                return result;
            }
            console.log(`[AutoResolvingExecutor] Auto-resolved: ${resolution.reasoning}`);
            console.log(`[AutoResolvingExecutor] New prompt: ${resolution.explicitPrompt}`);
            // Update task with explicit prompt
            currentTask = {
                ...task,
                prompt: resolution.explicitPrompt,
            };
        }
        // Max retries reached
        console.log('[AutoResolvingExecutor] Max retries reached');
        return lastResult;
    }
    /**
     * Detect clarification request from output
     */
    detectClarification(output, error) {
        const combined = `${output}\n${error || ''}`;
        // Check for explicit clarification markers
        for (const pattern of CLARIFICATION_PATTERNS) {
            const match = combined.match(pattern);
            if (match) {
                // Extract clarification type
                let type = 'unknown';
                if (match[1]) {
                    // Explicit type from marker
                    const typeStr = match[1].toLowerCase();
                    if (typeStr.includes('file') || typeStr.includes('path')) {
                        type = 'target_file_ambiguous';
                    }
                    else if (typeStr.includes('scope')) {
                        type = 'scope_unclear';
                    }
                    else if (typeStr.includes('action')) {
                        type = 'action_ambiguous';
                    }
                    else if (typeStr.includes('context') || typeStr.includes('missing')) {
                        type = 'missing_context';
                    }
                }
                else {
                    // Infer type from pattern
                    if (/(?:file|path|save|create|put|保存|作成)/i.test(match[0])) {
                        type = 'target_file_ambiguous';
                    }
                }
                // Extract question if present
                const questionMatch = combined.match(/([^.!?\n]*\?)/);
                return {
                    type,
                    question: questionMatch?.[1],
                    context: combined.substring(0, 500),
                };
            }
        }
        // Check for INCOMPLETE status with question-like output
        if (combined.includes('INCOMPLETE') || combined.includes('incomplete')) {
            const questionMatch = combined.match(/([^.!?\n]*\?)/);
            if (questionMatch) {
                return {
                    type: 'target_file_ambiguous', // Default assumption
                    question: questionMatch[1],
                    context: combined.substring(0, 500),
                };
            }
        }
        return null;
    }
    /**
     * Auto-resolve clarification using LLM and project context
     */
    async autoResolve(clarification, originalPrompt) {
        try {
            switch (clarification.type) {
                case 'target_file_ambiguous':
                    return this.resolveFilePath(originalPrompt, clarification);
                case 'scope_unclear':
                    return this.resolveScope(originalPrompt, clarification);
                case 'action_ambiguous':
                    return this.resolveAction(originalPrompt, clarification);
                default:
                    return { resolved: false };
            }
        }
        catch (error) {
            console.error('[AutoResolvingExecutor] Auto-resolve error:', error);
            return { resolved: false };
        }
    }
    /**
     * Resolve ambiguous file path
     */
    async resolveFilePath(originalPrompt, clarification) {
        // Get project structure for context
        const projectStructure = this.scanProjectStructure();
        const response = await this.llmClient.chat([
            {
                role: 'system',
                content: `You are an AI assistant that decides file paths for development tasks.
Based on the project structure and task description, determine the most appropriate file path.

Rules:
1. Documentation should go in docs/ directory (create if doesn't exist)
2. Spec/specification files should be named *-spec.md or spec-*.md
3. Use kebab-case for file names
4. Use .md extension for documentation
5. Be specific and include full relative path

Respond with ONLY a JSON object:
{"file_path": "<path>", "reasoning": "<brief explanation>"}`,
            },
            {
                role: 'user',
                content: `Project structure:
${projectStructure}

Task: ${originalPrompt}
Question from system: ${clarification.question || 'Where should the file be saved?'}

Determine the appropriate file path.`,
            },
        ]);
        try {
            const jsonMatch = response.content.match(/\{[^}]+\}/);
            if (!jsonMatch) {
                return { resolved: false };
            }
            const parsed = JSON.parse(jsonMatch[0]);
            const filePath = parsed.file_path;
            // Create explicit prompt with resolved file path
            const explicitPrompt = `${originalPrompt}

Important: Save the file to: ${filePath}
Do not ask for clarification. Create the file at the specified path.`;
            return {
                resolved: true,
                resolvedValue: filePath,
                explicitPrompt,
                reasoning: parsed.reasoning,
            };
        }
        catch {
            return { resolved: false };
        }
    }
    /**
     * Resolve unclear scope
     */
    async resolveScope(originalPrompt, clarification) {
        const response = await this.llmClient.chat([
            {
                role: 'system',
                content: `You are an AI assistant that clarifies task scope.
When the scope is unclear, make a reasonable decision based on common development practices.

Respond with ONLY a JSON object:
{"clarified_scope": "<specific scope>", "explicit_prompt": "<full prompt with scope clarified>", "reasoning": "<brief explanation>"}`,
            },
            {
                role: 'user',
                content: `Original task: ${originalPrompt}
Question: ${clarification.question || 'What is the scope?'}

Clarify the scope and provide an explicit prompt.`,
            },
        ]);
        try {
            const jsonMatch = response.content.match(/\{[^}]+\}/);
            if (!jsonMatch) {
                return { resolved: false };
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                resolved: true,
                resolvedValue: parsed.clarified_scope,
                explicitPrompt: parsed.explicit_prompt,
                reasoning: parsed.reasoning,
            };
        }
        catch {
            return { resolved: false };
        }
    }
    /**
     * Resolve ambiguous action
     */
    async resolveAction(originalPrompt, clarification) {
        const response = await this.llmClient.chat([
            {
                role: 'system',
                content: `You are an AI assistant that clarifies ambiguous actions.
When the action is unclear, make a reasonable decision based on the context.

Respond with ONLY a JSON object:
{"action": "<specific action>", "explicit_prompt": "<full prompt with action clarified>", "reasoning": "<brief explanation>"}`,
            },
            {
                role: 'user',
                content: `Original task: ${originalPrompt}
Question: ${clarification.question || 'What action should be taken?'}

Clarify the action and provide an explicit prompt.`,
            },
        ]);
        try {
            const jsonMatch = response.content.match(/\{[^}]+\}/);
            if (!jsonMatch) {
                return { resolved: false };
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                resolved: true,
                resolvedValue: parsed.action,
                explicitPrompt: parsed.explicit_prompt,
                reasoning: parsed.reasoning,
            };
        }
        catch {
            return { resolved: false };
        }
    }
    /**
     * Scan project structure for context
     */
    scanProjectStructure() {
        const structure = [];
        const maxDepth = 3;
        const maxEntries = 50;
        let entryCount = 0;
        const scan = (dir, depth, prefix) => {
            if (depth > maxDepth || entryCount >= maxEntries)
                return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                // Sort: directories first, then files
                const sorted = entries.sort((a, b) => {
                    if (a.isDirectory() && !b.isDirectory())
                        return -1;
                    if (!a.isDirectory() && b.isDirectory())
                        return 1;
                    return a.name.localeCompare(b.name);
                });
                for (const entry of sorted) {
                    if (entryCount >= maxEntries)
                        break;
                    // Skip hidden files, node_modules, dist, etc.
                    if (entry.name.startsWith('.') ||
                        entry.name === 'node_modules' ||
                        entry.name === 'dist' ||
                        entry.name === 'build' ||
                        entry.name === 'coverage') {
                        continue;
                    }
                    entryCount++;
                    const isDir = entry.isDirectory();
                    structure.push(`${prefix}${isDir ? '/' : ''}${entry.name}`);
                    if (isDir) {
                        scan(path.join(dir, entry.name), depth + 1, prefix + '  ');
                    }
                }
            }
            catch {
                // Directory not accessible
            }
        };
        scan(this.projectPath, 0, '');
        return structure.join('\n') || '(empty project)';
    }
}
exports.AutoResolvingExecutor = AutoResolvingExecutor;
//# sourceMappingURL=auto-resolve-executor.js.map