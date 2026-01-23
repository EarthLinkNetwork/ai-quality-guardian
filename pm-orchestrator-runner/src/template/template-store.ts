/**
 * Template Store Module
 *
 * Per spec 32_TEMPLATE_INJECTION.md
 *
 * Provides:
 * - Template management (CRUD operations)
 * - Built-in template handling
 * - Lazy loading of template content
 * - Template injection formatting
 *
 * Fail-Closed Principle: When files are corrupted, use defaults and warn.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Template data model (per spec/32)
 */
export interface Template {
  /** UUID v4 identifier */
  id: string;

  /** User-friendly name (1-50 chars, alphanumeric/hyphen/underscore) */
  name: string;

  /** Rules text to inject after system prompt (max 10,000 chars) */
  rulesText: string;

  /** Output format text to inject after user task (max 5,000 chars) */
  outputFormatText: string;

  /** Whether this template is enabled */
  enabled: boolean;

  /** Whether this is a built-in template (readonly) */
  isBuiltIn: boolean;

  /** ISO 8601 creation timestamp */
  createdAt: string;

  /** ISO 8601 last update timestamp */
  updatedAt: string;
}

/**
 * Template index entry (lightweight, for lazy loading)
 */
export interface TemplateIndexEntry {
  id: string;
  name: string;
  isBuiltIn: boolean;
  updatedAt: string;
}

/**
 * Template index file structure
 */
export interface TemplateIndex {
  version: number;
  templates: TemplateIndexEntry[];
}

/**
 * Template store event types
 */
export type TemplateStoreEvent =
  | { type: 'TEMPLATE_CREATED'; template: Template }
  | { type: 'TEMPLATE_UPDATED'; template: Template }
  | { type: 'TEMPLATE_DELETED'; templateId: string; templateName: string }
  | { type: 'STORE_INITIALIZED'; templateCount: number }
  | { type: 'STORE_ERROR'; error: string; operation: string }
  | { type: 'BUILTIN_LOADED'; count: number };

/**
 * Event callback type
 */
export type TemplateStoreEventCallback = (event: TemplateStoreEvent) => void;

/**
 * Template validation result
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================
// Constants
// ============================================================

/**
 * Maximum lengths for template fields
 */
export const TEMPLATE_LIMITS = {
  NAME_MAX_LENGTH: 50,
  RULES_TEXT_MAX_LENGTH: 10000,
  OUTPUT_FORMAT_MAX_LENGTH: 5000,
} as const;

/**
 * Name validation pattern
 */
export const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Default storage directory
 */
export function getDefaultStorageDir(): string {
  return path.join(os.homedir(), '.pm-orchestrator');
}

// ============================================================
// Built-in Templates
// ============================================================

/**
 * Minimal template - light rules
 */
export const BUILTIN_MINIMAL: Template = {
  id: 'builtin-minimal',
  name: 'Minimal',
  rulesText: `## 最小限ルール

- 品質チェックのみ実施
- lint/typecheck エラーは完了条件未達`,
  outputFormatText: `## 出力形式

- 変更ファイル一覧`,
  enabled: false,
  isBuiltIn: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/**
 * Standard template - balanced rules
 */
export const BUILTIN_STANDARD: Template = {
  id: 'builtin-standard',
  name: 'Standard',
  rulesText: `## 完了条件

- UI/UX破綻（白画面、クラッシュ、操作不能）は完了条件未達とする
- テスト失敗は完了条件未達とする
- lint/typecheck エラーは完了条件未達とする

## 品質基準

- TODO/FIXME を残さない
- 省略マーカー（...、// etc.）を残さない`,
  outputFormatText: `## 出力形式

- 変更ファイル一覧（パス）
- 実行したテスト結果
- 残課題（あれば）`,
  enabled: false,
  isBuiltIn: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/**
 * Strict template - comprehensive rules
 */
export const BUILTIN_STRICT: Template = {
  id: 'builtin-strict',
  name: 'Strict',
  rulesText: `## 完了条件（厳格）

- UI/UX破綻（白画面、クラッシュ、操作不能）は完了条件未達とする
- テスト失敗は完了条件未達とする
- lint/typecheck エラーは完了条件未達とする
- コードカバレッジ80%未満は完了条件未達とする

## 品質基準（厳格）

- TODO/FIXME を残さない
- 省略マーカー（...、// etc.）を残さない
- any 型の使用は禁止
- console.log の残存は禁止
- コメントなしの複雑なロジックは禁止

## セキュリティ基準

- ハードコードされた認証情報は禁止
- 未検証の外部入力は禁止
- SQLインジェクション対策必須`,
  outputFormatText: `## 出力形式（詳細）

- 変更ファイル一覧（パス）
- 実行したテスト結果（詳細）
- コードカバレッジレポート
- セキュリティチェック結果
- 残課題（あれば）
- 技術的負債（あれば）`,
  enabled: false,
  isBuiltIn: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/**
 * All built-in templates
 */
export const BUILTIN_TEMPLATES: Template[] = [
  BUILTIN_MINIMAL,
  BUILTIN_STANDARD,
  BUILTIN_STRICT,
];

// ============================================================
// Validation Functions
// ============================================================

/**
 * Validate template name
 */
export function validateTemplateName(name: string): TemplateValidationResult {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('Name is required');
  } else if (name.length > TEMPLATE_LIMITS.NAME_MAX_LENGTH) {
    errors.push(`Name must be ${TEMPLATE_LIMITS.NAME_MAX_LENGTH} characters or less`);
  } else if (!NAME_PATTERN.test(name)) {
    errors.push('Name can only contain letters, numbers, hyphens, and underscores');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate template content
 */
export function validateTemplateContent(
  rulesText: string,
  outputFormatText: string
): TemplateValidationResult {
  const errors: string[] = [];

  if (rulesText.length > TEMPLATE_LIMITS.RULES_TEXT_MAX_LENGTH) {
    errors.push(
      `Rules text must be ${TEMPLATE_LIMITS.RULES_TEXT_MAX_LENGTH} characters or less`
    );
  }

  if (outputFormatText.length > TEMPLATE_LIMITS.OUTPUT_FORMAT_MAX_LENGTH) {
    errors.push(
      `Output format must be ${TEMPLATE_LIMITS.OUTPUT_FORMAT_MAX_LENGTH} characters or less`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate full template
 */
export function validateTemplate(
  template: Partial<Template>
): TemplateValidationResult {
  const errors: string[] = [];

  const nameResult = validateTemplateName(template.name || '');
  errors.push(...nameResult.errors);

  const contentResult = validateTemplateContent(
    template.rulesText || '',
    template.outputFormatText || ''
  );
  errors.push(...contentResult.errors);

  return { valid: errors.length === 0, errors };
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Generate UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Format rules injection block
 */
export function formatRulesInjection(template: Template): string {
  return `---
## Injected Rules (Template: ${template.name})
${template.rulesText}
---`;
}

/**
 * Format output format injection block
 */
export function formatOutputInjection(template: Template): string {
  return `---
## Required Output Format (Template: ${template.name})
${template.outputFormatText}
---`;
}

// ============================================================
// TemplateStore Class
// ============================================================

/**
 * Configuration for TemplateStore
 */
export interface TemplateStoreConfig {
  /** Storage directory (default: ~/.pm-orchestrator) */
  storageDir: string;

  /** Whether to auto-initialize built-in templates */
  initBuiltins: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_TEMPLATE_STORE_CONFIG: TemplateStoreConfig = {
  storageDir: getDefaultStorageDir(),
  initBuiltins: true,
};

/**
 * TemplateStore - Manages template persistence and access
 */
export class TemplateStore {
  private config: TemplateStoreConfig;
  private templatesDir: string;
  private indexPath: string;
  private eventCallback?: TemplateStoreEventCallback;
  private initialized: boolean = false;
  private indexCache: TemplateIndex | null = null;
  private templateCache: Map<string, Template> = new Map();

  constructor(
    config: Partial<TemplateStoreConfig> = {},
    eventCallback?: TemplateStoreEventCallback
  ) {
    this.config = {
      ...DEFAULT_TEMPLATE_STORE_CONFIG,
      ...config,
    };

    this.templatesDir = path.join(this.config.storageDir, 'templates');
    this.indexPath = path.join(this.templatesDir, 'index.json');
    this.eventCallback = eventCallback;
  }

  /**
   * Emit an event
   */
  private emitEvent(event: TemplateStoreEvent): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Initialize the store
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure directory exists with proper permissions
      await this.ensureDirectory(this.templatesDir);

      // Load or create index
      await this.loadOrCreateIndex();

      // Initialize built-in templates if configured
      if (this.config.initBuiltins) {
        await this.initializeBuiltins();
      }

      this.initialized = true;

      const count = this.indexCache?.templates.length || 0;
      this.emitEvent({
        type: 'STORE_INITIALIZED',
        templateCount: count,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitEvent({
        type: 'STORE_ERROR',
        error: message,
        operation: 'initialize',
      });
      throw error;
    }
  }

  /**
   * Ensure directory exists with proper permissions
   */
  private async ensureDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load or create the index file
   */
  private async loadOrCreateIndex(): Promise<void> {
    if (fs.existsSync(this.indexPath)) {
      try {
        const content = fs.readFileSync(this.indexPath, 'utf-8');
        this.indexCache = JSON.parse(content);
      } catch {
        // Corrupted file - start fresh (fail-closed)
        console.warn('[TemplateStore] Index corrupted, creating new index');
        this.indexCache = { version: 1, templates: [] };
        await this.saveIndex();
      }
    } else {
      this.indexCache = { version: 1, templates: [] };
      await this.saveIndex();
    }
  }

  /**
   * Save the index file
   */
  private async saveIndex(): Promise<void> {
    if (!this.indexCache) {
      return;
    }

    const content = JSON.stringify(this.indexCache, null, 2);
    fs.writeFileSync(this.indexPath, content, { mode: 0o600 });
  }

  /**
   * Initialize built-in templates
   */
  private async initializeBuiltins(): Promise<void> {
    let loadedCount = 0;

    for (const template of BUILTIN_TEMPLATES) {
      // Check if already exists in index
      const exists = this.indexCache?.templates.some((t) => t.id === template.id);

      if (!exists) {
        // Write template file
        await this.writeTemplateFile(template);

        // Add to index
        this.indexCache?.templates.push({
          id: template.id,
          name: template.name,
          isBuiltIn: template.isBuiltIn,
          updatedAt: template.updatedAt,
        });

        loadedCount++;
      }
    }

    if (loadedCount > 0) {
      await this.saveIndex();
      this.emitEvent({
        type: 'BUILTIN_LOADED',
        count: loadedCount,
      });
    }
  }

  /**
   * Write template to file
   */
  private async writeTemplateFile(template: Template): Promise<void> {
    const filePath = path.join(this.templatesDir, `${template.id}.json`);
    const content = JSON.stringify(template, null, 2);
    fs.writeFileSync(filePath, content, { mode: 0o600 });
    this.templateCache.set(template.id, template);
  }

  /**
   * Read template from file
   */
  private readTemplateFile(id: string): Template | null {
    // Check cache first
    if (this.templateCache.has(id)) {
      return this.templateCache.get(id)!;
    }

    const filePath = path.join(this.templatesDir, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const template = JSON.parse(content) as Template;
      this.templateCache.set(id, template);
      return template;
    } catch {
      console.warn(`[TemplateStore] Failed to read template ${id}`);
      return null;
    }
  }

  /**
   * List all templates (returns index entries, lazy loaded)
   */
  list(): TemplateIndexEntry[] {
    return this.indexCache?.templates || [];
  }

  /**
   * Get template by ID (full content)
   */
  get(id: string): Template | null {
    return this.readTemplateFile(id);
  }

  /**
   * Get template by name
   */
  getByName(name: string): Template | null {
    const entry = this.indexCache?.templates.find((t) => t.name === name);
    if (!entry) {
      return null;
    }
    return this.get(entry.id);
  }

  /**
   * Create a new template
   */
  async create(
    name: string,
    rulesText: string,
    outputFormatText: string
  ): Promise<Template> {
    // Validate
    const validation = validateTemplate({ name, rulesText, outputFormatText });
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for duplicate name
    const existing = this.indexCache?.templates.find((t) => t.name === name);
    if (existing) {
      throw new Error(`Template with name '${name}' already exists`);
    }

    const now = new Date().toISOString();
    const template: Template = {
      id: generateId(),
      name,
      rulesText,
      outputFormatText,
      enabled: false,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };

    // Write file
    await this.writeTemplateFile(template);

    // Update index
    this.indexCache?.templates.push({
      id: template.id,
      name: template.name,
      isBuiltIn: template.isBuiltIn,
      updatedAt: template.updatedAt,
    });
    await this.saveIndex();

    this.emitEvent({
      type: 'TEMPLATE_CREATED',
      template,
    });

    return template;
  }

  /**
   * Update an existing template
   */
  async update(
    id: string,
    updates: Partial<Pick<Template, 'name' | 'rulesText' | 'outputFormatText'>>
  ): Promise<Template> {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Template with ID '${id}' not found`);
    }

    if (existing.isBuiltIn) {
      throw new Error('Cannot modify built-in templates');
    }

    // Merge and validate
    const updated: Template = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const validation = validateTemplate(updated);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for duplicate name (if name changed)
    if (updates.name && updates.name !== existing.name) {
      const duplicate = this.indexCache?.templates.find(
        (t) => t.name === updates.name && t.id !== id
      );
      if (duplicate) {
        throw new Error(`Template with name '${updates.name}' already exists`);
      }
    }

    // Write file
    await this.writeTemplateFile(updated);

    // Update index
    const indexEntry = this.indexCache?.templates.find((t) => t.id === id);
    if (indexEntry) {
      indexEntry.name = updated.name;
      indexEntry.updatedAt = updated.updatedAt;
    }
    await this.saveIndex();

    this.emitEvent({
      type: 'TEMPLATE_UPDATED',
      template: updated,
    });

    return updated;
  }

  /**
   * Delete a template
   */
  async delete(id: string): Promise<void> {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Template with ID '${id}' not found`);
    }

    if (existing.isBuiltIn) {
      throw new Error('Cannot delete built-in templates');
    }

    // Delete file
    const filePath = path.join(this.templatesDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from cache
    this.templateCache.delete(id);

    // Update index
    if (this.indexCache) {
      this.indexCache.templates = this.indexCache.templates.filter((t) => t.id !== id);
    }
    await this.saveIndex();

    this.emitEvent({
      type: 'TEMPLATE_DELETED',
      templateId: id,
      templateName: existing.name,
    });
  }

  /**
   * Get built-in templates
   */
  getBuiltins(): Template[] {
    return BUILTIN_TEMPLATES.map((t) => this.get(t.id) || t);
  }

  /**
   * Check if a template exists
   */
  exists(id: string): boolean {
    return this.indexCache?.templates.some((t) => t.id === id) || false;
  }

  /**
   * Check if a name is taken
   */
  isNameTaken(name: string, excludeId?: string): boolean {
    return this.indexCache?.templates.some(
      (t) => t.name === name && t.id !== excludeId
    ) || false;
  }

  /**
   * Copy a template (useful for customizing built-ins)
   */
  async copy(id: string, newName: string): Promise<Template> {
    const source = this.get(id);
    if (!source) {
      throw new Error(`Template with ID '${id}' not found`);
    }

    return this.create(newName, source.rulesText, source.outputFormatText);
  }

  /**
   * Format template for injection
   */
  formatForInjection(
    template: Template
  ): { rules: string; outputFormat: string } {
    return {
      rules: formatRulesInjection(template),
      outputFormat: formatOutputInjection(template),
    };
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.templateCache.clear();
    this.indexCache = null;
    this.initialized = false;
  }

  /**
   * Get storage directory
   */
  getStorageDir(): string {
    return this.config.storageDir;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
