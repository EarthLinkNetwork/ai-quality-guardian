/**
 * Models Command
 *
 * Per spec 10_REPL_UX.md Section 2.2:
 * - /models: list models for current provider
 * - /models <provider>: list models for specific provider
 *
 * Per spec 12_LLM_PROVIDER_AND_MODELS.md:
 * - OpenAI models with pricing
 * - Anthropic models with pricing
 * - claude-code delegates model selection
 */
import { ModelInfo } from '../../models/repl/model-registry';
/**
 * Models command result
 */
export interface ModelsResult {
    success: boolean;
    message: string;
    provider?: string;
    models?: ModelInfo[];
    currentModel?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Models Command class
 */
export declare class ModelsCommand {
    /**
     * List models for current or specified provider
     *
     * @param projectPath - Project path
     * @param providerId - Optional provider ID (uses current if not specified)
     * @returns Models result
     */
    listModels(projectPath: string, providerId?: string): Promise<ModelsResult>;
    /**
     * Format model list for display
     *
     * @param models - Model list
     * @param currentModel - Current selected model (optional)
     * @param provider - Provider name
     * @returns Formatted string
     */
    formatModelList(models: ModelInfo[], currentModel?: string, provider?: string): string;
}
//# sourceMappingURL=models.d.ts.map