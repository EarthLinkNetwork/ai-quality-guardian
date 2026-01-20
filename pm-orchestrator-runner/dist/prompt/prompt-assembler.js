"use strict";
/**
 * Prompt Assembler
 * Per spec/17_PROMPT_TEMPLATE.md
 *
 * Assembles prompts in fixed order (no caching, no omission):
 * 1. global prelude
 * 2. project prelude
 * 3. task group prelude (dynamic)
 * 4. user input
 * 5. output format epilogue
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
exports.PromptAssembler = exports.PromptAssemblerError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * PromptAssembler Error
 */
class PromptAssemblerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PromptAssemblerError';
    }
}
exports.PromptAssemblerError = PromptAssemblerError;
/**
 * Prompt Assembler
 *
 * Per spec/17_PROMPT_TEMPLATE.md:
 * - Always assemble in fixed order
 * - No caching (rebuild every time)
 * - No omission
 */
class PromptAssembler {
    projectPath;
    templateDir;
    constructor(config) {
        this.projectPath = config.projectPath;
        this.templateDir = config.templateDir || '.claude/prompt-templates';
    }
    /**
     * Assemble the prompt from all sections
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * Order is fixed and non-negotiable:
     * 1. global prelude
     * 2. project prelude
     * 3. task group prelude
     * 4. user input
     * 5. output format epilogue
     *
     * @param userInput - The user's input (task.naturalLanguageTask)
     * @param taskGroupContext - Optional task group context for prelude generation
     * @returns AssemblyResult with assembled prompt and sections
     * @throws PromptAssemblerError if user input is empty
     */
    assemble(userInput, taskGroupContext) {
        // Fail-closed: user input must not be empty
        if (!userInput || userInput.trim().length === 0) {
            throw new PromptAssemblerError('User input is required (fail-closed: empty input not allowed)');
        }
        // Load/build each section (no caching per spec)
        const sections = {
            globalPrelude: this.loadGlobalPrelude(),
            projectPrelude: this.loadProjectPrelude(),
            taskGroupPrelude: taskGroupContext ? this.buildTaskGroupPrelude(taskGroupContext) : '',
            userInput: userInput.trim(),
            outputEpilogue: this.loadOutputEpilogue(),
        };
        // Assemble in fixed order
        const parts = [];
        if (sections.globalPrelude) {
            parts.push(sections.globalPrelude);
        }
        if (sections.projectPrelude) {
            parts.push(sections.projectPrelude);
        }
        if (sections.taskGroupPrelude) {
            parts.push(sections.taskGroupPrelude);
        }
        // User input is always included (already validated non-empty)
        parts.push(sections.userInput);
        if (sections.outputEpilogue) {
            parts.push(sections.outputEpilogue);
        }
        return {
            prompt: parts.join('\n\n'),
            sections,
        };
    }
    /**
     * Load global prelude from template file
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - File: .claude/prompt-templates/global-prelude.md
     * - Contains: rules, prohibitions, output format assumptions
     *
     * @returns Global prelude content (empty string if file not found)
     */
    loadGlobalPrelude() {
        return this.loadTemplateFile('global-prelude.md');
    }
    /**
     * Load project prelude from template file
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - File: .claude/prompt-templates/project-prelude.md
     * - Contains: project-specific constraints, file structure, tech constraints
     *
     * @returns Project prelude content (empty string if file not found)
     */
    loadProjectPrelude() {
        return this.loadTemplateFile('project-prelude.md');
    }
    /**
     * Build task group prelude dynamically
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - Dynamically generated from TaskGroupContext
     * - Contains: conversation thread purpose, prerequisites, context summary
     *
     * Per spec/16_TASK_GROUP.md L100-106:
     * - task_group_id: for context isolation
     * - conversation_history: for context continuity
     * - working_files: current working set
     * - last_task_result: for building on previous work
     *
     * @param context - Task group context
     * @returns Task group prelude content
     */
    buildTaskGroupPrelude(context) {
        const lines = [];
        lines.push(`## Task Group Context`);
        lines.push(`Task Group ID: ${context.task_group_id}`);
        lines.push('');
        // Working files
        if (context.working_files.length > 0) {
            lines.push('### Working Files');
            for (const file of context.working_files) {
                lines.push(`- ${file}`);
            }
            lines.push('');
        }
        // Last task result
        if (context.last_task_result) {
            lines.push('### Previous Task Result');
            lines.push(`- Task: ${context.last_task_result.task_id}`);
            lines.push(`- Status: ${context.last_task_result.status}`);
            lines.push(`- Summary: ${context.last_task_result.summary}`);
            if (context.last_task_result.files_modified.length > 0) {
                lines.push(`- Files Modified: ${context.last_task_result.files_modified.join(', ')}`);
            }
            if (context.last_task_result.error) {
                lines.push(`- Error: ${context.last_task_result.error}`);
            }
            lines.push('');
        }
        // Conversation history summary (last 5 entries to keep prelude manageable)
        if (context.conversation_history.length > 0) {
            lines.push('### Recent Conversation');
            const recentEntries = context.conversation_history.slice(-5);
            for (const entry of recentEntries) {
                const preview = entry.content.length > 100
                    ? entry.content.substring(0, 100) + '...'
                    : entry.content;
                lines.push(`- [${entry.role}] ${preview}`);
            }
            lines.push('');
        }
        return lines.join('\n');
    }
    /**
     * Load output format epilogue from template file
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - File: .claude/prompt-templates/output-epilogue.md
     * - Contains: required report format, evidence output format, completion conditions
     *
     * @returns Output epilogue content (empty string if file not found)
     */
    loadOutputEpilogue() {
        return this.loadTemplateFile('output-epilogue.md');
    }
    /**
     * Load template file content
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - Template files are in .claude/prompt-templates/
     * - If file doesn't exist, return empty string (not an error)
     *
     * @param filename - Template filename
     * @returns File content or empty string
     */
    loadTemplateFile(filename) {
        const templatePath = path.join(this.projectPath, this.templateDir, filename);
        try {
            if (fs.existsSync(templatePath)) {
                return fs.readFileSync(templatePath, 'utf-8').trim();
            }
        }
        catch {
            // File read error - treat as non-existent
        }
        return '';
    }
}
exports.PromptAssembler = PromptAssembler;
//# sourceMappingURL=prompt-assembler.js.map