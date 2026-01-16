/**
 * Provider Command
 *
 * Per spec 10_REPL_UX.md Section 2.1:
 * - /provider: show current selected_provider or "UNSET"
 * - /provider show: list all providers
 * - /provider select: interactive selection UI
 * - /provider <name>: set provider directly
 *
 * Per spec 06_CORRECTNESS_PROPERTIES.md Property 23:
 * - Provider/Model configuration under user control
 */
import { ProviderInfo } from '../../models/repl/model-registry';
/**
 * Provider command result
 */
export interface ProviderResult {
    success: boolean;
    message: string;
    provider?: string;
    providers?: ProviderInfo[];
    configPath?: string;
    evidencePath?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * REPL state file path
 */
declare const REPL_STATE_FILE = "repl.json";
/**
 * Provider Command class
 */
export declare class ProviderCommand {
    /**
     * Get current provider
     * Per spec 10_REPL_UX.md: Display "UNSET" if not configured
     *
     * @param projectPath - Project path
     * @returns Provider result
     */
    getProvider(projectPath: string): Promise<ProviderResult>;
    /**
     * Set provider
     * Per spec 10_REPL_UX.md: Save to .claude/repl.json and generate Evidence
     * Per spec 12_LLM_PROVIDER_AND_MODELS.md: Provider change resets model selection
     *
     * @param projectPath - Project path
     * @param providerName - Provider name to set
     * @returns Provider result
     */
    setProvider(projectPath: string, providerName: string): Promise<ProviderResult>;
    /**
     * List all available providers
     * Per spec 10_REPL_UX.md: /provider show lists all providers
     *
     * @returns Provider result with providers list
     */
    listProviders(): Promise<ProviderResult>;
    /**
     * Format providers for display
     *
     * @param providers - Provider list
     * @param currentProvider - Current selected provider (optional)
     * @returns Formatted string
     */
    formatProviderList(providers: ProviderInfo[], currentProvider?: string): string;
    /**
     * Format current provider for display
     *
     * @param provider - Provider ID or "UNSET"
     * @returns Formatted string
     */
    formatCurrentProvider(provider: string): string;
}
export { REPL_STATE_FILE };
//# sourceMappingURL=provider.d.ts.map