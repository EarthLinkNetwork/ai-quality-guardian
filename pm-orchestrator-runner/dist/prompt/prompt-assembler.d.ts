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
import { ConversationEntry, TaskResult } from '../models/task-group';
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
    };
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
    assemble(userInput: string, taskGroupContext?: TaskGroupPreludeInput): AssemblyResult;
    /**
     * Load global prelude from template file
     *
     * Per spec/17_PROMPT_TEMPLATE.md:
     * - File: .claude/prompt-templates/global-prelude.md
     * - Contains: rules, prohibitions, output format assumptions
     *
     * @returns Global prelude content (empty string if file not found)
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