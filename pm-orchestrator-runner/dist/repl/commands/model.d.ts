/**
 * /model Command Handler
 *
 * Per spec 10_REPL_UX.md L113-143:
 * - /model is REPL-local feature
 * - Model preference is stored in .claude/repl.json (NOT settings.json)
 * - Runner Core and Configuration Manager ignore this file
 * - .claude/ missing → E101 ERROR
 * - repl.json corrupted → E105 ERROR
 * - Model changes must generate Evidence
 */
/**
 * Model command result
 */
export interface ModelResult {
    success: boolean;
    message?: string;
    model?: string;
    configPath?: string;
    evidencePath?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Available models
 */
export declare const AVAILABLE_MODELS: readonly ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"];
export type ModelName = typeof AVAILABLE_MODELS[number] | string;
/**
 * REPL configuration stored in .claude/repl.json
 * Per spec 10_REPL_UX.md L123-128:
 * {
 *   "selected_model": string,
 *   "updated_at": string
 * }
 */
export interface REPLConfig {
    selected_model: string;
    updated_at: string;
}
/**
 * REPL Evidence record for model changes
 * Per spec 10_REPL_UX.md L142: Model changes generate Evidence
 */
export interface REPLEvidence {
    evidence_id: string;
    timestamp: string;
    operation_type: 'REPL_MODEL_CHANGE';
    previous_model: string | null;
    new_model: string;
    config_path: string;
    hash: string;
}
/**
 * Model command handler
 */
export declare class ModelCommand {
    /**
     * Get current model configuration from repl.json
     * Per spec 10_REPL_UX.md L133: If unset, display "UNSET"
     * Per spec 10_REPL_UX.md L137: .claude/ missing → E101 ERROR
     * Per spec 10_REPL_UX.md L138: JSON parse error → E105 ERROR
     */
    getModel(projectPath: string): Promise<ModelResult>;
    /**
     * Set model configuration in repl.json
     * Per spec 10_REPL_UX.md L123-128: Schema: { "selected_model": string, "updated_at": string }
     * Per spec 10_REPL_UX.md L129: Any non-empty string allowed (no validation)
     * Per spec 10_REPL_UX.md L137: .claude/ missing → E101 ERROR
     * Per spec 10_REPL_UX.md L142: Model changes must generate Evidence
     */
    setModel(projectPath: string, modelName: string): Promise<ModelResult>;
    /**
     * Generate Evidence for REPL model change
     * Per spec 10_REPL_UX.md L142: Model changes are recorded as evidence
     */
    private generateEvidence;
    /**
     * List available models
     */
    listModels(): string[];
}
//# sourceMappingURL=model.d.ts.map