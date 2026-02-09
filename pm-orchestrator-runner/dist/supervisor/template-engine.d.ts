/**
 * Supervisor Template Engine
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-2, SUP-3
 *
 * Composition Order (immutable):
 * [GLOBAL_INPUT_TEMPLATE]
 * [PROJECT_INPUT_TEMPLATE]
 * [USER_PROMPT]
 */
import { ComposedPrompt, FormattedOutput } from './types';
declare const TEMPLATE_MARKERS: {
    GLOBAL_START: string;
    GLOBAL_END: string;
    PROJECT_START: string;
    PROJECT_END: string;
    USER_START: string;
    USER_END: string;
    OUTPUT_START: string;
    OUTPUT_END: string;
};
/**
 * Merge prompts in strict order: global → project → user
 *
 * @param globalTemplate - Global input template (always first)
 * @param projectTemplate - Project input template (second)
 * @param userPrompt - User's actual prompt (last)
 * @returns Composed prompt with all parts
 */
export declare function mergePrompt(globalTemplate: string, projectTemplate: string, userPrompt: string): ComposedPrompt;
/**
 * Merge prompts with explicit markers for debugging/inspection
 */
export declare function mergePromptWithMarkers(globalTemplate: string, projectTemplate: string, userPrompt: string): ComposedPrompt;
/**
 * Apply output template to raw LLM output
 *
 * @param rawOutput - Raw output from LLM
 * @param outputTemplate - Template to apply (can contain {{OUTPUT}} placeholder)
 * @returns Formatted output
 */
export declare function applyOutputTemplate(rawOutput: string, outputTemplate: string): FormattedOutput;
/**
 * Apply output template with markers for debugging
 */
export declare function applyOutputTemplateWithMarkers(rawOutput: string, outputTemplate: string): FormattedOutput;
interface TemplateVariables {
    [key: string]: string | number | boolean | undefined;
}
/**
 * Substitute variables in template ({{VAR_NAME}} format)
 */
export declare function substituteVariables(template: string, variables: TemplateVariables): string;
export interface TemplateValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate template syntax
 */
export declare function validateTemplate(template: string): TemplateValidationResult;
export interface ExtractedComponents {
    globalTemplate: string | null;
    projectTemplate: string | null;
    userPrompt: string | null;
}
/**
 * Extract components from a prompt that was composed with markers
 */
export declare function extractComponents(composedPrompt: string): ExtractedComponents;
export { TEMPLATE_MARKERS };
//# sourceMappingURL=template-engine.d.ts.map