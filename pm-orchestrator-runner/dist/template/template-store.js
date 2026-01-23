"use strict";
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
exports.TemplateStore = exports.DEFAULT_TEMPLATE_STORE_CONFIG = exports.BUILTIN_TEMPLATES = exports.BUILTIN_STRICT = exports.BUILTIN_STANDARD = exports.BUILTIN_MINIMAL = exports.NAME_PATTERN = exports.TEMPLATE_LIMITS = void 0;
exports.getDefaultStorageDir = getDefaultStorageDir;
exports.validateTemplateName = validateTemplateName;
exports.validateTemplateContent = validateTemplateContent;
exports.validateTemplate = validateTemplate;
exports.generateId = generateId;
exports.formatRulesInjection = formatRulesInjection;
exports.formatOutputInjection = formatOutputInjection;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const crypto = __importStar(require("crypto"));
// ============================================================
// Constants
// ============================================================
/**
 * Maximum lengths for template fields
 */
exports.TEMPLATE_LIMITS = {
    NAME_MAX_LENGTH: 50,
    RULES_TEXT_MAX_LENGTH: 10000,
    OUTPUT_FORMAT_MAX_LENGTH: 5000,
};
/**
 * Name validation pattern
 */
exports.NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
/**
 * Default storage directory
 */
function getDefaultStorageDir() {
    return path.join(os.homedir(), '.pm-orchestrator');
}
// ============================================================
// Built-in Templates
// ============================================================
/**
 * Minimal template - light rules
 */
exports.BUILTIN_MINIMAL = {
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
exports.BUILTIN_STANDARD = {
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
exports.BUILTIN_STRICT = {
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
exports.BUILTIN_TEMPLATES = [
    exports.BUILTIN_MINIMAL,
    exports.BUILTIN_STANDARD,
    exports.BUILTIN_STRICT,
];
// ============================================================
// Validation Functions
// ============================================================
/**
 * Validate template name
 */
function validateTemplateName(name) {
    const errors = [];
    if (!name || name.trim().length === 0) {
        errors.push('Name is required');
    }
    else if (name.length > exports.TEMPLATE_LIMITS.NAME_MAX_LENGTH) {
        errors.push(`Name must be ${exports.TEMPLATE_LIMITS.NAME_MAX_LENGTH} characters or less`);
    }
    else if (!exports.NAME_PATTERN.test(name)) {
        errors.push('Name can only contain letters, numbers, hyphens, and underscores');
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validate template content
 */
function validateTemplateContent(rulesText, outputFormatText) {
    const errors = [];
    if (rulesText.length > exports.TEMPLATE_LIMITS.RULES_TEXT_MAX_LENGTH) {
        errors.push(`Rules text must be ${exports.TEMPLATE_LIMITS.RULES_TEXT_MAX_LENGTH} characters or less`);
    }
    if (outputFormatText.length > exports.TEMPLATE_LIMITS.OUTPUT_FORMAT_MAX_LENGTH) {
        errors.push(`Output format must be ${exports.TEMPLATE_LIMITS.OUTPUT_FORMAT_MAX_LENGTH} characters or less`);
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Validate full template
 */
function validateTemplate(template) {
    const errors = [];
    const nameResult = validateTemplateName(template.name || '');
    errors.push(...nameResult.errors);
    const contentResult = validateTemplateContent(template.rulesText || '', template.outputFormatText || '');
    errors.push(...contentResult.errors);
    return { valid: errors.length === 0, errors };
}
// ============================================================
// Utility Functions
// ============================================================
/**
 * Generate UUID v4
 */
function generateId() {
    return crypto.randomUUID();
}
/**
 * Format rules injection block
 */
function formatRulesInjection(template) {
    return `---
## Injected Rules (Template: ${template.name})
${template.rulesText}
---`;
}
/**
 * Format output format injection block
 */
function formatOutputInjection(template) {
    return `---
## Required Output Format (Template: ${template.name})
${template.outputFormatText}
---`;
}
/**
 * Default configuration
 */
exports.DEFAULT_TEMPLATE_STORE_CONFIG = {
    storageDir: getDefaultStorageDir(),
    initBuiltins: true,
};
/**
 * TemplateStore - Manages template persistence and access
 */
class TemplateStore {
    config;
    templatesDir;
    indexPath;
    eventCallback;
    initialized = false;
    indexCache = null;
    templateCache = new Map();
    constructor(config = {}, eventCallback) {
        this.config = {
            ...exports.DEFAULT_TEMPLATE_STORE_CONFIG,
            ...config,
        };
        this.templatesDir = path.join(this.config.storageDir, 'templates');
        this.indexPath = path.join(this.templatesDir, 'index.json');
        this.eventCallback = eventCallback;
    }
    /**
     * Emit an event
     */
    emitEvent(event) {
        if (this.eventCallback) {
            try {
                this.eventCallback(event);
            }
            catch {
                // Ignore callback errors
            }
        }
    }
    /**
     * Initialize the store
     */
    async initialize() {
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
        }
        catch (error) {
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
    async ensureDirectory(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        }
    }
    /**
     * Load or create the index file
     */
    async loadOrCreateIndex() {
        if (fs.existsSync(this.indexPath)) {
            try {
                const content = fs.readFileSync(this.indexPath, 'utf-8');
                this.indexCache = JSON.parse(content);
            }
            catch {
                // Corrupted file - start fresh (fail-closed)
                console.warn('[TemplateStore] Index corrupted, creating new index');
                this.indexCache = { version: 1, templates: [] };
                await this.saveIndex();
            }
        }
        else {
            this.indexCache = { version: 1, templates: [] };
            await this.saveIndex();
        }
    }
    /**
     * Save the index file
     */
    async saveIndex() {
        if (!this.indexCache) {
            return;
        }
        const content = JSON.stringify(this.indexCache, null, 2);
        fs.writeFileSync(this.indexPath, content, { mode: 0o600 });
    }
    /**
     * Initialize built-in templates
     */
    async initializeBuiltins() {
        let loadedCount = 0;
        for (const template of exports.BUILTIN_TEMPLATES) {
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
    async writeTemplateFile(template) {
        const filePath = path.join(this.templatesDir, `${template.id}.json`);
        const content = JSON.stringify(template, null, 2);
        fs.writeFileSync(filePath, content, { mode: 0o600 });
        this.templateCache.set(template.id, template);
    }
    /**
     * Read template from file
     */
    readTemplateFile(id) {
        // Check cache first
        if (this.templateCache.has(id)) {
            return this.templateCache.get(id);
        }
        const filePath = path.join(this.templatesDir, `${id}.json`);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const template = JSON.parse(content);
            this.templateCache.set(id, template);
            return template;
        }
        catch {
            console.warn(`[TemplateStore] Failed to read template ${id}`);
            return null;
        }
    }
    /**
     * List all templates (returns index entries, lazy loaded)
     */
    list() {
        return this.indexCache?.templates || [];
    }
    /**
     * Get template by ID (full content)
     */
    get(id) {
        return this.readTemplateFile(id);
    }
    /**
     * Get template by name
     */
    getByName(name) {
        const entry = this.indexCache?.templates.find((t) => t.name === name);
        if (!entry) {
            return null;
        }
        return this.get(entry.id);
    }
    /**
     * Create a new template
     */
    async create(name, rulesText, outputFormatText) {
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
        const template = {
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
    async update(id, updates) {
        const existing = this.get(id);
        if (!existing) {
            throw new Error(`Template with ID '${id}' not found`);
        }
        if (existing.isBuiltIn) {
            throw new Error('Cannot modify built-in templates');
        }
        // Merge and validate
        const updated = {
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
            const duplicate = this.indexCache?.templates.find((t) => t.name === updates.name && t.id !== id);
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
    async delete(id) {
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
    getBuiltins() {
        return exports.BUILTIN_TEMPLATES.map((t) => this.get(t.id) || t);
    }
    /**
     * Check if a template exists
     */
    exists(id) {
        return this.indexCache?.templates.some((t) => t.id === id) || false;
    }
    /**
     * Check if a name is taken
     */
    isNameTaken(name, excludeId) {
        return this.indexCache?.templates.some((t) => t.name === name && t.id !== excludeId) || false;
    }
    /**
     * Copy a template (useful for customizing built-ins)
     */
    async copy(id, newName) {
        const source = this.get(id);
        if (!source) {
            throw new Error(`Template with ID '${id}' not found`);
        }
        return this.create(newName, source.rulesText, source.outputFormatText);
    }
    /**
     * Format template for injection
     */
    formatForInjection(template) {
        return {
            rules: formatRulesInjection(template),
            outputFormat: formatOutputInjection(template),
        };
    }
    /**
     * Clear cache (for testing)
     */
    clearCache() {
        this.templateCache.clear();
        this.indexCache = null;
        this.initialized = false;
    }
    /**
     * Get storage directory
     */
    getStorageDir() {
        return this.config.storageDir;
    }
    /**
     * Check if initialized
     */
    isInitialized() {
        return this.initialized;
    }
}
exports.TemplateStore = TemplateStore;
//# sourceMappingURL=template-store.js.map