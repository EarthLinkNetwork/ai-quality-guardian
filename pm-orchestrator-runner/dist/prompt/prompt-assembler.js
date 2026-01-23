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
 *
 * Includes:
 * - Mandatory Rules Auto-Injection (spec/17 L59-95)
 * - Modification Prompt Injection on REJECT (spec/17 L105-124)
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
exports.PromptAssembler = exports.PromptAssemblerError = exports.DEFAULT_MODIFICATION_TEMPLATE = exports.DEFAULT_MANDATORY_RULES = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const template_1 = require("../template");
/**
 * Default Mandatory Rules
 * Per spec/17_PROMPT_TEMPLATE.md L69-95
 *
 * These rules are ALWAYS injected into global prelude
 */
exports.DEFAULT_MANDATORY_RULES = `## 絶対厳守ルール（Mandatory Rules）

1. **省略禁止（No Omission）**
   - \`...\` \`// 残り省略\` \`// etc.\` \`// 以下同様\` 等の省略マーカー禁止
   - 全てのコードを完全に出力すること

2. **不完全禁止（No Incomplete）**
   - \`TODO\` \`FIXME\` \`TBD\` を残さない
   - 構文エラー、閉じ括弧の欠落を残さない
   - 部分的な実装で終わらない

3. **証跡必須（Evidence Required）**
   - 完了を主張する前に、ファイルの存在を確認すること
   - 作成・変更したファイルのパスを明示すること

4. **早期終了禁止（No Early Termination）**
   - 「これで完了です」「以上です」等の早期終了宣言禁止
   - Runner が完了を判定する

5. **Fail-Closed 原則**
   - 不明な場合は安全側に倒す
   - 推測で進めない
   - 確認が必要な場合は明示する`;
/**
 * Modification Prompt Template
 * Per spec/17_PROMPT_TEMPLATE.md L109-124
 *
 * Used when Review Loop returns REJECT
 */
exports.DEFAULT_MODIFICATION_TEMPLATE = `## 前回の出力に問題が検出されました

### 検出された問題
{{detected_issues}}

### 修正要求
以下の点を修正して、再度完全な実装を提供してください:
1. 省略せず全てのコードを出力する
2. TODO/FIXME を残さない
3. 全ての期待されるファイルを作成する

### 前回のタスク
{{original_task}}`;
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
     * 2. [template rules injection] - per spec 32_TEMPLATE_INJECTION.md
     * 3. project prelude
     * 4. task group prelude
     * 5. user input
     * 6. [template output format injection] - per spec 32_TEMPLATE_INJECTION.md
     * 7. output format epilogue
     *
     * @param userInput - The user's input (task.naturalLanguageTask)
     * @param taskGroupContext - Optional task group context for prelude generation
     * @param activeTemplate - Optional active template for injection per spec 32
     * @returns AssemblyResult with assembled prompt and sections
     * @throws PromptAssemblerError if user input is empty
     */
    assemble(userInput, taskGroupContext, activeTemplate) {
        // Fail-closed: user input must not be empty
        if (!userInput || userInput.trim().length === 0) {
            throw new PromptAssemblerError('User input is required (fail-closed: empty input not allowed)');
        }
        // Build template injections per spec 32_TEMPLATE_INJECTION.md
        const templateRules = activeTemplate ? (0, template_1.formatRulesInjection)(activeTemplate) : '';
        const templateOutputFormat = activeTemplate ? (0, template_1.formatOutputInjection)(activeTemplate) : '';
        // Load/build each section (no caching per spec)
        const sections = {
            globalPrelude: this.loadGlobalPrelude(),
            projectPrelude: this.loadProjectPrelude(),
            taskGroupPrelude: taskGroupContext ? this.buildTaskGroupPrelude(taskGroupContext) : '',
            userInput: userInput.trim(),
            outputEpilogue: this.loadOutputEpilogue(),
            templateRules: templateRules || undefined,
            templateOutputFormat: templateOutputFormat || undefined,
        };
        // Assemble in fixed order per spec 17 and 32
        const parts = [];
        if (sections.globalPrelude) {
            parts.push(sections.globalPrelude);
        }
        // Template rules injection (after global prelude) per spec 32
        if (templateRules) {
            parts.push(templateRules);
        }
        if (sections.projectPrelude) {
            parts.push(sections.projectPrelude);
        }
        if (sections.taskGroupPrelude) {
            parts.push(sections.taskGroupPrelude);
        }
        // User input is always included (already validated non-empty)
        parts.push(sections.userInput);
        // Template output format injection (before output epilogue) per spec 32
        if (templateOutputFormat) {
            parts.push(templateOutputFormat);
        }
        if (sections.outputEpilogue) {
            parts.push(sections.outputEpilogue);
        }
        return {
            prompt: parts.join('\n\n'),
            sections,
        };
    }
    /**
     * Assemble the prompt with modification instructions
     *
     * Per spec/17_PROMPT_TEMPLATE.md L102-124:
     * - Used when Review Loop returns REJECT
     * - Modification prompt is inserted between task group prelude and user input
     * - Original task is preserved
     *
     * @param userInput - The user's input (task.naturalLanguageTask)
     * @param modification - Modification prompt input (issues and original task)
     * @param taskGroupContext - Optional task group context for prelude generation
     * @param activeTemplate - Optional active template for injection per spec 32
     * @returns AssemblyResult with assembled prompt including modification instructions
     * @throws PromptAssemblerError if user input is empty
     */
    assembleWithModification(userInput, modification, taskGroupContext, activeTemplate) {
        // Fail-closed: user input must not be empty
        if (!userInput || userInput.trim().length === 0) {
            throw new PromptAssemblerError('User input is required (fail-closed: empty input not allowed)');
        }
        // Build modification prompt from template
        const modificationPrompt = this.buildModificationPrompt(modification);
        // Build template injections per spec 32_TEMPLATE_INJECTION.md
        const templateRules = activeTemplate ? (0, template_1.formatRulesInjection)(activeTemplate) : '';
        const templateOutputFormat = activeTemplate ? (0, template_1.formatOutputInjection)(activeTemplate) : '';
        // Load/build each section (no caching per spec)
        const sections = {
            globalPrelude: this.loadGlobalPrelude(),
            projectPrelude: this.loadProjectPrelude(),
            taskGroupPrelude: taskGroupContext ? this.buildTaskGroupPrelude(taskGroupContext) : '',
            userInput: userInput.trim(),
            outputEpilogue: this.loadOutputEpilogue(),
            modificationPrompt,
            templateRules: templateRules || undefined,
            templateOutputFormat: templateOutputFormat || undefined,
        };
        // Assemble in fixed order with modification prompt
        // Per spec/17 L102-103: REJECT 時は user input 直前に Modification Prompt を追加注入
        const parts = [];
        if (sections.globalPrelude) {
            parts.push(sections.globalPrelude);
        }
        // Template rules injection (after global prelude) per spec 32
        if (templateRules) {
            parts.push(templateRules);
        }
        if (sections.projectPrelude) {
            parts.push(sections.projectPrelude);
        }
        if (sections.taskGroupPrelude) {
            parts.push(sections.taskGroupPrelude);
        }
        // Insert modification prompt before user input (per spec L102)
        parts.push(modificationPrompt);
        // User input is always included (already validated non-empty)
        parts.push(sections.userInput);
        // Template output format injection (before output epilogue) per spec 32
        if (templateOutputFormat) {
            parts.push(templateOutputFormat);
        }
        if (sections.outputEpilogue) {
            parts.push(sections.outputEpilogue);
        }
        return {
            prompt: parts.join('\n\n'),
            sections,
        };
    }
    /**
     * Build modification prompt from template
     *
     * Per spec/17_PROMPT_TEMPLATE.md L109-124:
     * - Load template from modification-template.md or use default
     * - Replace {{detected_issues}} and {{original_task}} placeholders
     *
     * @param modification - Modification prompt input
     * @returns Modification prompt string
     */
    buildModificationPrompt(modification) {
        // Try to load custom template, fall back to default
        const customTemplate = this.loadTemplateFile('modification-template.md');
        const template = customTemplate || exports.DEFAULT_MODIFICATION_TEMPLATE;
        // Format detected issues as bullet points
        const issuesList = modification.detectedIssues
            .map(issue => `- ${issue}`)
            .join('\n');
        // Replace placeholders
        return template
            .replace('{{detected_issues}}', issuesList)
            .replace('{{original_task}}', modification.originalTask);
    }
    /**
     * Load global prelude from template file
     *
     * Per spec/17_PROMPT_TEMPLATE.md L69-101:
     * - File: .claude/prompt-templates/global-prelude.md
     * - Contains: rules, prohibitions, output format assumptions
     * - Mandatory Rules are ALWAYS included (auto-injected)
     *
     * @returns Global prelude content with mandatory rules
     */
    loadGlobalPrelude() {
        const customPrelude = this.loadTemplateFile('global-prelude.md');
        // Per spec/17 L69-95, L99-101:
        // Mandatory Rules are ALWAYS injected into global prelude
        const parts = [exports.DEFAULT_MANDATORY_RULES];
        if (customPrelude) {
            parts.push(customPrelude);
        }
        return parts.join('\n\n');
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