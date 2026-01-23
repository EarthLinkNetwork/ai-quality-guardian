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
export type TemplateStoreEvent = {
    type: 'TEMPLATE_CREATED';
    template: Template;
} | {
    type: 'TEMPLATE_UPDATED';
    template: Template;
} | {
    type: 'TEMPLATE_DELETED';
    templateId: string;
    templateName: string;
} | {
    type: 'STORE_INITIALIZED';
    templateCount: number;
} | {
    type: 'STORE_ERROR';
    error: string;
    operation: string;
} | {
    type: 'BUILTIN_LOADED';
    count: number;
};
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
/**
 * Maximum lengths for template fields
 */
export declare const TEMPLATE_LIMITS: {
    readonly NAME_MAX_LENGTH: 50;
    readonly RULES_TEXT_MAX_LENGTH: 10000;
    readonly OUTPUT_FORMAT_MAX_LENGTH: 5000;
};
/**
 * Name validation pattern
 */
export declare const NAME_PATTERN: RegExp;
/**
 * Default storage directory
 */
export declare function getDefaultStorageDir(): string;
/**
 * Minimal template - light rules
 */
export declare const BUILTIN_MINIMAL: Template;
/**
 * Standard template - balanced rules
 */
export declare const BUILTIN_STANDARD: Template;
/**
 * Strict template - comprehensive rules
 */
export declare const BUILTIN_STRICT: Template;
/**
 * Goal Drift Guard template - prevents goal drift and premature completion
 *
 * Per spec/32_TEMPLATE_INJECTION.md:
 * - Only injected when activeTemplate === "goal_drift_guard"
 * - Project-agnostic (no sample-project specific wording)
 * - Defines failures generically as "task not complete from user's perspective"
 * - Prohibits escape phrases and premature completion language
 */
export declare const BUILTIN_GOAL_DRIFT_GUARD: Template;
/**
 * All built-in templates
 */
export declare const BUILTIN_TEMPLATES: Template[];
/**
 * Validate template name
 */
export declare function validateTemplateName(name: string): TemplateValidationResult;
/**
 * Validate template content
 */
export declare function validateTemplateContent(rulesText: string, outputFormatText: string): TemplateValidationResult;
/**
 * Validate full template
 */
export declare function validateTemplate(template: Partial<Template>): TemplateValidationResult;
/**
 * Generate UUID v4
 */
export declare function generateId(): string;
/**
 * Format rules injection block
 */
export declare function formatRulesInjection(template: Template): string;
/**
 * Format output format injection block
 */
export declare function formatOutputInjection(template: Template): string;
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
export declare const DEFAULT_TEMPLATE_STORE_CONFIG: TemplateStoreConfig;
/**
 * TemplateStore - Manages template persistence and access
 */
export declare class TemplateStore {
    private config;
    private templatesDir;
    private indexPath;
    private eventCallback?;
    private initialized;
    private indexCache;
    private templateCache;
    constructor(config?: Partial<TemplateStoreConfig>, eventCallback?: TemplateStoreEventCallback);
    /**
     * Emit an event
     */
    private emitEvent;
    /**
     * Initialize the store
     */
    initialize(): Promise<void>;
    /**
     * Ensure directory exists with proper permissions
     */
    private ensureDirectory;
    /**
     * Load or create the index file
     */
    private loadOrCreateIndex;
    /**
     * Save the index file
     */
    private saveIndex;
    /**
     * Initialize built-in templates
     */
    private initializeBuiltins;
    /**
     * Write template to file
     */
    private writeTemplateFile;
    /**
     * Read template from file
     */
    private readTemplateFile;
    /**
     * List all templates (returns index entries, lazy loaded)
     */
    list(): TemplateIndexEntry[];
    /**
     * Get template by ID (full content)
     */
    get(id: string): Template | null;
    /**
     * Get template by name
     */
    getByName(name: string): Template | null;
    /**
     * Create a new template
     */
    create(name: string, rulesText: string, outputFormatText: string): Promise<Template>;
    /**
     * Update an existing template
     */
    update(id: string, updates: Partial<Pick<Template, 'name' | 'rulesText' | 'outputFormatText'>>): Promise<Template>;
    /**
     * Delete a template
     */
    delete(id: string): Promise<void>;
    /**
     * Get built-in templates
     */
    getBuiltins(): Template[];
    /**
     * Check if a template exists
     */
    exists(id: string): boolean;
    /**
     * Check if a name is taken
     */
    isNameTaken(name: string, excludeId?: string): boolean;
    /**
     * Copy a template (useful for customizing built-ins)
     */
    copy(id: string, newName: string): Promise<Template>;
    /**
     * Format template for injection
     */
    formatForInjection(template: Template): {
        rules: string;
        outputFormat: string;
    };
    /**
     * Clear cache (for testing)
     */
    clearCache(): void;
    /**
     * Get storage directory
     */
    getStorageDir(): string;
    /**
     * Check if initialized
     */
    isInitialized(): boolean;
}
//# sourceMappingURL=template-store.d.ts.map