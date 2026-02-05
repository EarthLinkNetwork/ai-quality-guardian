"use strict";
/**
 * Auto-Resolving Executor with Decision Classification
 *
 * Enhanced executor that:
 * 1. Classifies clarification requests (best_practice vs case_by_case)
 * 2. Auto-resolves best practices using established conventions
 * 3. Routes case-by-case decisions to user input
 * 4. Learns from user preferences to reduce future questions
 *
 * Key insight: Not all clarifications are equal.
 * - Best practices (e.g., docs in docs/) can be auto-resolved
 * - Case-by-case (e.g., which feature first) needs user input
 * - User preferences can be learned over time
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
const decision_classifier_1 = require("./decision-classifier");
const user_preference_store_1 = require("./user-preference-store");
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
    // File path related (Japanese)
    /ファイル(?:名|パス).*(?:指定|教えて)/i,
    /どこに.*(?:保存|作成)/i,
    /保存先.*(?:を|は)/i,
];
/**
 * Auto-Resolving Executor with Decision Classification
 *
 * Enhanced to classify clarifications and learn user preferences
 */
class AutoResolvingExecutor {
    innerExecutor;
    llmClient;
    maxRetries;
    projectPath;
    classifier;
    preferenceStore;
    userResponseHandler;
    constructor(config) {
        this.innerExecutor = new claude_code_executor_1.ClaudeCodeExecutor(config);
        this.projectPath = config.projectPath;
        this.maxRetries = config.maxRetries ?? 2;
        this.userResponseHandler = config.userResponseHandler;
        // Initialize LLM client for auto-resolution
        this.llmClient = llm_client_1.LLMClient.fromEnv(config.llmProvider ?? 'openai', undefined, { temperature: 0.3 } // Lower temperature for more deterministic decisions
        );
        // Initialize decision classifier with custom rules
        this.classifier = new decision_classifier_1.DecisionClassifier(config.customRules, this.llmClient);
        // Initialize user preference store
        this.preferenceStore = new user_preference_store_1.UserPreferenceStore(config.preferenceStoreConfig || {});
        console.log('[AutoResolvingExecutor] Initialized with decision classification and preference learning');
        const stats = this.preferenceStore.getStats();
        console.log(`[AutoResolvingExecutor] Loaded ${stats.totalPreferences} preferences (${stats.highConfidenceCount} high-confidence)`);
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
     * Execute task with smart clarification handling
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
            // READ_INFO/REPORT tasks: output itself is the deliverable, not file evidence
            // If we have output, treat as COMPLETE regardless of file evidence status
            if ((task.taskType === 'READ_INFO' || task.taskType === 'REPORT') &&
                result.output && result.output.trim().length > 0) {
                console.log(`[AutoResolvingExecutor] ${task.taskType} task completed with output (file evidence not required)`);
                return {
                    ...result,
                    status: 'COMPLETE',
                };
            }
            // Check if clarification is needed
            const clarification = this.detectClarification(result.output, result.error);
            if (!clarification || clarification.type === 'unknown') {
                console.log('[AutoResolvingExecutor] No resolvable clarification detected');
                return result;
            }
            console.log(`[AutoResolvingExecutor] Clarification detected: ${clarification.type}`);
            // Smart resolution with classification
            const resolution = await this.smartResolve(clarification, currentTask.prompt);
            if (!resolution.resolved || !resolution.explicitPrompt) {
                console.log('[AutoResolvingExecutor] Could not resolve, returning original result');
                return result;
            }
            console.log(`[AutoResolvingExecutor] Resolved via ${resolution.resolutionMethod}: ${resolution.reasoning}`);
            // Update task with explicit prompt
            currentTask = {
                ...task,
                prompt: resolution.explicitPrompt,
            };
        }
        console.log('[AutoResolvingExecutor] Max retries reached');
        return lastResult;
    }
    /**
     * Smart resolution using classification and preferences
     */
    async smartResolve(clarification, originalPrompt) {
        const question = clarification.question || this.generateQuestionFromType(clarification.type);
        const category = this.mapClarificationTypeToCategory(clarification.type);
        // Step 1: Check user preferences first
        const preferenceMatch = this.preferenceStore.findMatch(category, question, clarification.context);
        if (preferenceMatch && this.preferenceStore.canAutoApply(preferenceMatch)) {
            console.log(`[AutoResolvingExecutor] Found high-confidence preference: ${preferenceMatch.preference.choice}`);
            return this.applyPreference(preferenceMatch, originalPrompt, clarification);
        }
        // Step 2: Classify the clarification
        const classification = await this.classifier.classifyFull(question, clarification.context);
        console.log(`[AutoResolvingExecutor] Classification: ${classification.category} (confidence: ${classification.confidence})`);
        // Step 3: Route based on classification
        switch (classification.category) {
            case 'best_practice':
                return this.resolveBestPractice(classification, originalPrompt, clarification);
            case 'case_by_case':
                return this.handleCaseByCase(classification, originalPrompt, clarification, category);
            default:
                // Unknown - try LLM inference as fallback
                return this.autoResolve(clarification, originalPrompt);
        }
    }
    /**
     * Apply a matched user preference
     */
    applyPreference(match, originalPrompt, clarification) {
        const choice = match.preference.choice;
        const prefContext = match.preference.context || choice;
        // Build explicit prompt with the preferred choice
        const explicitPrompt = this.buildExplicitPrompt(originalPrompt, clarification, choice, `Based on your previous preference: ${prefContext}`);
        return {
            resolved: true,
            resolvedValue: choice,
            explicitPrompt,
            reasoning: `Applied user preference (confidence: ${match.preference.confidence.toFixed(2)}, matched keywords: ${match.matchedKeywords.join(', ')})`,
            resolutionMethod: 'user_preference',
        };
    }
    /**
     * Resolve using best practice rules
     */
    async resolveBestPractice(classification, originalPrompt, clarification) {
        const resolution = classification.suggestedResolution || classification.matchedRule?.resolution;
        if (!resolution) {
            // Fallback to LLM inference
            return this.autoResolve(clarification, originalPrompt);
        }
        const explicitPrompt = this.buildExplicitPrompt(originalPrompt, clarification, resolution, classification.reasoning);
        return {
            resolved: true,
            resolvedValue: resolution,
            explicitPrompt,
            reasoning: `Best practice: ${classification.reasoning}`,
            resolutionMethod: 'best_practice',
        };
    }
    /**
     * Handle case-by-case decisions that need user input
     */
    async handleCaseByCase(classification, originalPrompt, clarification, category) {
        const question = clarification.question || this.generateQuestionFromType(clarification.type);
        // Check if we have a user response handler
        if (!this.userResponseHandler) {
            console.log('[AutoResolvingExecutor] No user response handler, falling back to LLM');
            return this.autoResolve(clarification, originalPrompt);
        }
        // Ask the user
        console.log(`[AutoResolvingExecutor] Asking user: ${question}`);
        try {
            const contextStr = clarification.context || 'No additional context';
            const userChoice = await this.userResponseHandler(question, undefined, // Options could be extracted from context
            `Context: ${contextStr}`);
            // Record the preference for future use
            this.preferenceStore.recordPreference(category, question, userChoice, clarification.context);
            // Build explicit prompt with user's choice
            const explicitPrompt = this.buildExplicitPrompt(originalPrompt, clarification, userChoice, 'User specified');
            return {
                resolved: true,
                resolvedValue: userChoice,
                explicitPrompt,
                reasoning: `User chose: ${userChoice}`,
                resolutionMethod: 'user_input',
            };
        }
        catch (error) {
            console.error('[AutoResolvingExecutor] User response error:', error);
            // Fallback to LLM inference
            return this.autoResolve(clarification, originalPrompt);
        }
    }
    /**
     * Build an explicit prompt with the resolved value
     */
    buildExplicitPrompt(originalPrompt, clarification, resolvedValue, reasoning) {
        switch (clarification.type) {
            case 'target_file_ambiguous':
                return `${originalPrompt}

Important: Save the file to: ${resolvedValue}
Reason: ${reasoning}
Do not ask for clarification. Create the file at the specified path.`;
            case 'scope_unclear':
                return `${originalPrompt}

Scope clarification: ${resolvedValue}
Reason: ${reasoning}
Do not ask for clarification. Proceed with the clarified scope.`;
            case 'action_ambiguous':
                return `${originalPrompt}

Action to take: ${resolvedValue}
Reason: ${reasoning}
Do not ask for clarification. Proceed with the specified action.`;
            default:
                return `${originalPrompt}

Clarification: ${resolvedValue}
Reason: ${reasoning}
Do not ask for further clarification. Proceed with the above.`;
        }
    }
    /**
     * Map clarification type to preference category
     */
    mapClarificationTypeToCategory(type) {
        switch (type) {
            case 'target_file_ambiguous':
                return 'file_location';
            case 'scope_unclear':
                return 'task_scope';
            case 'action_ambiguous':
                return 'action_choice';
            case 'missing_context':
                return 'context_clarification';
            default:
                return 'general';
        }
    }
    /**
     * Generate a question from clarification type
     */
    generateQuestionFromType(type) {
        switch (type) {
            case 'target_file_ambiguous':
                return 'Where should the file be saved?';
            case 'scope_unclear':
                return 'What is the scope of this task?';
            case 'action_ambiguous':
                return 'What action should be taken?';
            case 'missing_context':
                return 'Can you provide more context?';
            default:
                return 'Need clarification';
        }
    }
    /**
     * Detect clarification request from output
     */
    detectClarification(output, error) {
        const errorStr = error || '';
        const combined = `${output}\n${errorStr}`;
        // Check for explicit clarification markers
        for (const pattern of CLARIFICATION_PATTERNS) {
            const match = combined.match(pattern);
            if (match) {
                let type = 'unknown';
                if (match[1]) {
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
                    if (/(?:file|path|save|create|put|保存|作成)/i.test(match[0])) {
                        type = 'target_file_ambiguous';
                    }
                }
                const questionMatch = combined.match(/([^.!?\n]*\?)/);
                return {
                    type,
                    question: questionMatch?.[1],
                    context: combined.substring(0, 500),
                };
            }
        }
        if (combined.includes('INCOMPLETE') || combined.includes('incomplete')) {
            const questionMatch = combined.match(/([^.!?\n]*\?)/);
            if (questionMatch) {
                return {
                    type: 'target_file_ambiguous',
                    question: questionMatch[1],
                    context: combined.substring(0, 500),
                };
            }
        }
        return null;
    }
    /**
     * Auto-resolve clarification using LLM (fallback method)
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
     * Resolve ambiguous file path using LLM
     */
    async resolveFilePath(originalPrompt, clarification) {
        const projectStructure = this.scanProjectStructure();
        const questionStr = clarification.question || 'Where should the file be saved?';
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
Question from system: ${questionStr}

Determine the appropriate file path.`,
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
                resolvedValue: parsed.file_path,
                explicitPrompt: this.buildExplicitPrompt(originalPrompt, clarification, parsed.file_path, parsed.reasoning),
                reasoning: parsed.reasoning,
                resolutionMethod: 'llm_inference',
            };
        }
        catch {
            return { resolved: false };
        }
    }
    /**
     * Resolve unclear scope using LLM
     */
    async resolveScope(originalPrompt, clarification) {
        const questionStr = clarification.question || 'What is the scope?';
        const response = await this.llmClient.chat([
            {
                role: 'system',
                content: `You are an AI assistant that clarifies task scope.
When the scope is unclear, make a reasonable decision based on common development practices.

Respond with ONLY a JSON object:
{"clarified_scope": "<specific scope>", "reasoning": "<brief explanation>"}`,
            },
            {
                role: 'user',
                content: `Original task: ${originalPrompt}
Question: ${questionStr}

Clarify the scope.`,
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
                explicitPrompt: this.buildExplicitPrompt(originalPrompt, clarification, parsed.clarified_scope, parsed.reasoning),
                reasoning: parsed.reasoning,
                resolutionMethod: 'llm_inference',
            };
        }
        catch {
            return { resolved: false };
        }
    }
    /**
     * Resolve ambiguous action using LLM
     */
    async resolveAction(originalPrompt, clarification) {
        const questionStr = clarification.question || 'What action should be taken?';
        const response = await this.llmClient.chat([
            {
                role: 'system',
                content: `You are an AI assistant that clarifies ambiguous actions.
When the action is unclear, make a reasonable decision based on the context.

Respond with ONLY a JSON object:
{"action": "<specific action>", "reasoning": "<brief explanation>"}`,
            },
            {
                role: 'user',
                content: `Original task: ${originalPrompt}
Question: ${questionStr}

Clarify the action.`,
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
                explicitPrompt: this.buildExplicitPrompt(originalPrompt, clarification, parsed.action, parsed.reasoning),
                reasoning: parsed.reasoning,
                resolutionMethod: 'llm_inference',
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
    /**
     * Get preference store statistics
     */
    getPreferenceStats() {
        return this.preferenceStore.getStats();
    }
    /**
     * Clear all learned preferences
     */
    clearPreferences() {
        this.preferenceStore.clear();
        console.log('[AutoResolvingExecutor] All preferences cleared');
    }
}
exports.AutoResolvingExecutor = AutoResolvingExecutor;
//# sourceMappingURL=auto-resolve-executor.js.map