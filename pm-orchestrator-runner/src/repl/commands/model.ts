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

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

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
export const AVAILABLE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
] as const;

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
export class ModelCommand {
  /**
   * Get current model configuration from repl.json
   * Per spec 10_REPL_UX.md L133: If unset, display "UNSET"
   * Per spec 10_REPL_UX.md L137: .claude/ missing → E101 ERROR
   * Per spec 10_REPL_UX.md L138: JSON parse error → E105 ERROR
   */
  async getModel(projectPath: string): Promise<ModelResult> {
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
      const config: REPLConfig = JSON.parse(content);

      return {
        success: true,
        model: config.selected_model,
        configPath: replPath,
      };
    } catch (err) {
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
        message: `Failed to read REPL config: ${(err as Error).message}`,
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
  async setModel(projectPath: string, modelName: string): Promise<ModelResult> {
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
      let previousModel: string | null = null;
      if (fs.existsSync(replPath)) {
        try {
          const existingContent = fs.readFileSync(replPath, 'utf-8');
          const existingConfig: REPLConfig = JSON.parse(existingContent);
          previousModel = existingConfig.selected_model;
        } catch {
          // Ignore parse errors when reading previous value
        }
      }

      // Create spec-compliant config
      const config: REPLConfig = {
        selected_model: modelName,
        updated_at: new Date().toISOString(),
      };

      // Write to repl.json
      fs.writeFileSync(replPath, JSON.stringify(config, null, 2), 'utf-8');

      // Per spec 10_REPL_UX.md L142: Generate Evidence for model change
      const evidencePath = await this.generateEvidence(
        evidenceDir,
        previousModel,
        modelName,
        replPath
      );

      return {
        success: true,
        model: modelName,
        configPath: replPath,
        evidencePath,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to save REPL config: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Generate Evidence for REPL model change
   * Per spec 10_REPL_UX.md L142: Model changes are recorded as evidence
   */
  private async generateEvidence(
    evidenceDir: string,
    previousModel: string | null,
    newModel: string,
    configPath: string
  ): Promise<string> {
    // Ensure evidence directory exists
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const evidenceId = `repl-model-${uuidv4()}`;

    // Create hash from change details
    const hashContent = JSON.stringify({
      previous_model: previousModel,
      new_model: newModel,
      config_path: configPath,
      timestamp,
    });
    const hash = `sha256:${crypto.createHash('sha256').update(hashContent).digest('hex')}`;

    const evidence: REPLEvidence = {
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
  listModels(): string[] {
    return [...AVAILABLE_MODELS];
  }
}
