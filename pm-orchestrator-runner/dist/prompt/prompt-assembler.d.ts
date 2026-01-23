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
import { ConversationEntry, TaskResult } from '../models/task-group';
import { Template } from '../template';
/**
 * Default Mandatory Rules
 * Per spec/17_PROMPT_TEMPLATE.md L69-95
 *
 * These rules are ALWAYS injected into global prelude
 */
export declare const DEFAULT_MANDATORY_RULES = "## \u7D76\u5BFE\u53B3\u5B88\u30EB\u30FC\u30EB\uFF08Mandatory Rules\uFF09\n\n1. **\u7701\u7565\u7981\u6B62\uFF08No Omission\uFF09**\n   - `...` `// \u6B8B\u308A\u7701\u7565` `// etc.` `// \u4EE5\u4E0B\u540C\u69D8` \u7B49\u306E\u7701\u7565\u30DE\u30FC\u30AB\u30FC\u7981\u6B62\n   - \u5168\u3066\u306E\u30B3\u30FC\u30C9\u3092\u5B8C\u5168\u306B\u51FA\u529B\u3059\u308B\u3053\u3068\n\n2. **\u4E0D\u5B8C\u5168\u7981\u6B62\uFF08No Incomplete\uFF09**\n   - `TODO` `FIXME` `TBD` \u3092\u6B8B\u3055\u306A\u3044\n   - \u69CB\u6587\u30A8\u30E9\u30FC\u3001\u9589\u3058\u62EC\u5F27\u306E\u6B20\u843D\u3092\u6B8B\u3055\u306A\u3044\n   - \u90E8\u5206\u7684\u306A\u5B9F\u88C5\u3067\u7D42\u308F\u3089\u306A\u3044\n\n3. **\u8A3C\u8DE1\u5FC5\u9808\uFF08Evidence Required\uFF09**\n   - \u5B8C\u4E86\u3092\u4E3B\u5F35\u3059\u308B\u524D\u306B\u3001\u30D5\u30A1\u30A4\u30EB\u306E\u5B58\u5728\u3092\u78BA\u8A8D\u3059\u308B\u3053\u3068\n   - \u4F5C\u6210\u30FB\u5909\u66F4\u3057\u305F\u30D5\u30A1\u30A4\u30EB\u306E\u30D1\u30B9\u3092\u660E\u793A\u3059\u308B\u3053\u3068\n\n4. **\u65E9\u671F\u7D42\u4E86\u7981\u6B62\uFF08No Early Termination\uFF09**\n   - \u300C\u3053\u308C\u3067\u5B8C\u4E86\u3067\u3059\u300D\u300C\u4EE5\u4E0A\u3067\u3059\u300D\u7B49\u306E\u65E9\u671F\u7D42\u4E86\u5BA3\u8A00\u7981\u6B62\n   - Runner \u304C\u5B8C\u4E86\u3092\u5224\u5B9A\u3059\u308B\n\n5. **Fail-Closed \u539F\u5247**\n   - \u4E0D\u660E\u306A\u5834\u5408\u306F\u5B89\u5168\u5074\u306B\u5012\u3059\n   - \u63A8\u6E2C\u3067\u9032\u3081\u306A\u3044\n   - \u78BA\u8A8D\u304C\u5FC5\u8981\u306A\u5834\u5408\u306F\u660E\u793A\u3059\u308B";
/**
 * Modification Prompt Template
 * Per spec/17_PROMPT_TEMPLATE.md L109-124
 *
 * Used when Review Loop returns REJECT
 */
export declare const DEFAULT_MODIFICATION_TEMPLATE = "## \u524D\u56DE\u306E\u51FA\u529B\u306B\u554F\u984C\u304C\u691C\u51FA\u3055\u308C\u307E\u3057\u305F\n\n### \u691C\u51FA\u3055\u308C\u305F\u554F\u984C\n{{detected_issues}}\n\n### \u4FEE\u6B63\u8981\u6C42\n\u4EE5\u4E0B\u306E\u70B9\u3092\u4FEE\u6B63\u3057\u3066\u3001\u518D\u5EA6\u5B8C\u5168\u306A\u5B9F\u88C5\u3092\u63D0\u4F9B\u3057\u3066\u304F\u3060\u3055\u3044:\n1. \u7701\u7565\u305B\u305A\u5168\u3066\u306E\u30B3\u30FC\u30C9\u3092\u51FA\u529B\u3059\u308B\n2. TODO/FIXME \u3092\u6B8B\u3055\u306A\u3044\n3. \u5168\u3066\u306E\u671F\u5F85\u3055\u308C\u308B\u30D5\u30A1\u30A4\u30EB\u3092\u4F5C\u6210\u3059\u308B\n\n### \u524D\u56DE\u306E\u30BF\u30B9\u30AF\n{{original_task}}";
/**
 * Configuration for PromptAssembler
 */
export interface PromptAssemblerConfig {
    /** Project path (contains .claude/prompt-templates/) */
    projectPath: string;
    /** Template directory (default: .claude/prompt-templates/) */
    templateDir?: string;
}
/**
 * Input for building task group prelude
 * Per spec/17_PROMPT_TEMPLATE.md: task group prelude is dynamically generated
 */
export interface TaskGroupPreludeInput {
    /** Task Group ID */
    task_group_id: string;
    /** Conversation history within this task group */
    conversation_history: ConversationEntry[];
    /** Files currently being worked on */
    working_files: string[];
    /** Result of the last completed task */
    last_task_result: TaskResult | null;
}
/**
 * Result of prompt assembly
 */
export interface AssemblyResult {
    /** Assembled prompt */
    prompt: string;
    /** Sections included (for debugging/logging) */
    sections: {
        globalPrelude: string;
        projectPrelude: string;
        taskGroupPrelude: string;
        userInput: string;
        outputEpilogue: string;
        /** Modification prompt (only present when assembleWithModification is used) */
        modificationPrompt?: string;
        /** Injected rules (only present when template is active) per spec 32 */
        templateRules?: string;
        /** Injected output format (only present when template is active) per spec 32 */
        templateOutputFormat?: string;
    };
}
/**
 * Input for assembleWithModification
 * Per spec/17_PROMPT_TEMPLATE.md L105-124
 *
 * Used when Review Loop returns REJECT
 */
export interface ModificationPromptInput {
    /** List of detected issues (for {{detected_issues}} placeholder) */
    detectedIssues: string[];
    /** Original task content (for {{original_task}} placeholder) */
    originalTask: string;
}
/**
 * PromptAssembler Error
 */
export declare class PromptAssemblerError extends Error {
    constructor(message: string);
}
/**
 * Prompt Assembler
 *
 * Per spec/17_PROMPT_TEMPLATE.md:
 * - Always assemble in fixed order
 * - No caching (rebuild every time)
 * - No omission
 */
export declare class PromptAssembler {
    private readonly projectPath;
    private readonly templateDir;
    constructor(config: PromptAssemblerConfig);
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
    assemble(userInput: string, taskGroupContext?: TaskGroupPreludeInput, activeTemplate?: Template | null): AssemblyResult;
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
    assembleWithModification(userInput: string, modification: ModificationPromptInput, taskGroupContext?: TaskGroupPreludeInput, activeTemplate?: Template | null): AssemblyResult;
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
    buildModificationPrompt(modification: ModificationPromptInput): string;
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
    loadGlobalPrelude(): string;
    /**
     * Load project prelude from template file
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - File: .claude/prompt-templates/project-prelude.md
     * - Contains: project-specific constraints, file structure, tech constraints
     *
     * @returns Project prelude content (empty string if file not found)
     */
    loadProjectPrelude(): string;
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
    buildTaskGroupPrelude(context: TaskGroupPreludeInput): string;
    /**
     * Load output format epilogue from template file
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - File: .claude/prompt-templates/output-epilogue.md
     * - Contains: required report format, evidence output format, completion conditions
     *
     * @returns Output epilogue content (empty string if file not found)
     */
    loadOutputEpilogue(): string;
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
    private loadTemplateFile;
}
//# sourceMappingURL=prompt-assembler.d.ts.map