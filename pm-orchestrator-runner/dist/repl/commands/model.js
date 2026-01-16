"use strict";
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
exports.ModelCommand = exports.AVAILABLE_MODELS = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const uuid_1 = require("uuid");
/**
 * Available models
 */
exports.AVAILABLE_MODELS = [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
];
/**
 * Model command handler
 */
class ModelCommand {
    /**
     * Get current model configuration from repl.json
     * Per spec 10_REPL_UX.md L133: If unset, display "UNSET"
     * Per spec 10_REPL_UX.md L137: .claude/ missing → E101 ERROR
     * Per spec 10_REPL_UX.md L138: JSON parse error → E105 ERROR
     */
    async getModel(projectPath) {
        const claudeDir = path.join(path.resolve(projectPath), '.claude');
        const replPath = path.join(claudeDir, 'repl.json');
        // Per spec 10_REPL_UX.md L137: .claude/ missing → E101
        if (!fs.existsSync(claudeDir)) {
            return {
                success: false,
                error: {
                    code: 'E101',
                    message: '.claude/ directory not found. Run /init first.',
                },
            };
        }
        // Per spec 10_REPL_UX.md L133: If unset, return "UNSET"
        if (!fs.existsSync(replPath)) {
            return {
                success: true,
                model: 'UNSET',
                configPath: undefined,
            };
        }
        try {
            const content = fs.readFileSync(replPath, 'utf-8');
            const config = JSON.parse(content);
            return {
                success: true,
                model: config.selected_model,
                configPath: replPath,
            };
        }
        catch (err) {
            // Per spec 10_REPL_UX.md L138: JSON parse error is E105
            if (err instanceof SyntaxError) {
                return {
                    success: false,
                    error: {
                        code: 'E105',
                        message: 'repl.json is corrupted (JSON parse error). Cannot recover.',
                    },
                };
            }
            return {
                success: false,
                message: `Failed to read REPL config: ${err.message}`,
            };
        }
    }
    /**
     * Set model configuration in repl.json
     * Per spec 10_REPL_UX.md L123-128: Schema: { "selected_model": string, "updated_at": string }
     * Per spec 10_REPL_UX.md L129: Any non-empty string allowed (no validation)
     * Per spec 10_REPL_UX.md L137: .claude/ missing → E101 ERROR
     * Per spec 10_REPL_UX.md L142: Model changes must generate Evidence
     */
    async setModel(projectPath, modelName) {
        const claudeDir = path.join(path.resolve(projectPath), '.claude');
        const replPath = path.join(claudeDir, 'repl.json');
        const evidenceDir = path.join(claudeDir, 'evidence', 'repl');
        // Per spec 10_REPL_UX.md L137: .claude/ missing → E101
        if (!fs.existsSync(claudeDir)) {
            return {
                success: false,
                error: {
                    code: 'E101',
                    message: '.claude/ directory not found. Run /init first.',
                },
            };
        }
        // Validate model name (allow any non-empty string per spec L129)
        if (!modelName || modelName.trim().length === 0) {
            return {
                success: false,
                message: 'Model name cannot be empty',
            };
        }
        try {
            // Get previous model for Evidence (null if unset)
            let previousModel = null;
            if (fs.existsSync(replPath)) {
                try {
                    const existingContent = fs.readFileSync(replPath, 'utf-8');
                    const existingConfig = JSON.parse(existingContent);
                    previousModel = existingConfig.selected_model;
                }
                catch {
                    // Ignore parse errors when reading previous value
                }
            }
            // Create spec-compliant config
            const config = {
                selected_model: modelName,
                updated_at: new Date().toISOString(),
            };
            // Write to repl.json
            fs.writeFileSync(replPath, JSON.stringify(config, null, 2), 'utf-8');
            // Per spec 10_REPL_UX.md L142: Generate Evidence for model change
            const evidencePath = await this.generateEvidence(evidenceDir, previousModel, modelName, replPath);
            return {
                success: true,
                model: modelName,
                configPath: replPath,
                evidencePath,
            };
        }
        catch (err) {
            return {
                success: false,
                message: `Failed to save REPL config: ${err.message}`,
            };
        }
    }
    /**
     * Generate Evidence for REPL model change
     * Per spec 10_REPL_UX.md L142: Model changes are recorded as evidence
     */
    async generateEvidence(evidenceDir, previousModel, newModel, configPath) {
        // Ensure evidence directory exists
        if (!fs.existsSync(evidenceDir)) {
            fs.mkdirSync(evidenceDir, { recursive: true });
        }
        const timestamp = new Date().toISOString();
        const evidenceId = `repl-model-${(0, uuid_1.v4)()}`;
        // Create hash from change details
        const hashContent = JSON.stringify({
            previous_model: previousModel,
            new_model: newModel,
            config_path: configPath,
            timestamp,
        });
        const hash = `sha256:${crypto.createHash('sha256').update(hashContent).digest('hex')}`;
        const evidence = {
            evidence_id: evidenceId,
            timestamp,
            operation_type: 'REPL_MODEL_CHANGE',
            previous_model: previousModel,
            new_model: newModel,
            config_path: configPath,
            hash,
        };
        // Write evidence file
        const evidencePath = path.join(evidenceDir, `${evidenceId}.json`);
        fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf-8');
        return evidencePath;
    }
    /**
     * List available models
     */
    listModels() {
        return [...exports.AVAILABLE_MODELS];
    }
}
exports.ModelCommand = ModelCommand;
//# sourceMappingURL=model.js.map