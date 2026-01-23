/**
 * /templates and /template Command Handlers
 *
 * Per spec 32_TEMPLATE_INJECTION.md:
 * - /templates: list, new, edit, delete templates
 * - /template: use, on, off, show current template
 *
 * Per spec 33_PROJECT_SETTINGS_PERSISTENCE.md:
 * - Template selection is persisted per project
 */
import { TemplateStore, Template } from '../../template';
import { ProjectSettingsStore } from '../../settings';
/**
 * Template command result
 */
export interface TemplateResult {
    success: boolean;
    message?: string;
    templates?: Template[];
    template?: Template;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Template command handler
 */
export declare class TemplateCommand {
    private templateStore;
    private settingsStore;
    /**
     * Set the template store instance
     */
    setTemplateStore(store: TemplateStore): void;
    /**
     * Set the settings store instance
     */
    setSettingsStore(store: ProjectSettingsStore): void;
    /**
     * Ensure template store is initialized
     */
    private ensureStore;
    /**
     * Ensure settings store is initialized
     */
    private ensureSettings;
    /**
     * List all templates
     */
    list(): Promise<TemplateResult>;
    /**
     * Create a new template
     */
    create(name: string, rulesText: string, outputFormatText: string): Promise<TemplateResult>;
    /**
     * Update an existing template
     */
    update(id: string, updates: {
        name?: string;
        rulesText?: string;
        outputFormatText?: string;
    }): Promise<TemplateResult>;
    /**
     * Delete a template
     */
    delete(nameOrId: string): Promise<TemplateResult>;
    /**
     * Copy a template (creates an editable copy)
     */
    copy(sourceNameOrId: string, newName: string): Promise<TemplateResult>;
    /**
     * Select and enable a template
     */
    use(nameOrId: string): Promise<TemplateResult>;
    /**
     * Enable template injection
     */
    enable(): Promise<TemplateResult>;
    /**
     * Disable template injection
     */
    disable(): Promise<TemplateResult>;
    /**
     * Show current template status
     */
    show(): Promise<TemplateResult>;
    /**
     * Get the currently active template (if any)
     */
    getActive(): Template | null;
    /**
     * Format template list for display
     */
    formatList(templates: Template[], selectedId: string | null): string;
    /**
     * Format template status for display
     */
    private formatStatus;
    /**
     * Format template detail for display
     */
    formatDetail(template: Template): string;
}
//# sourceMappingURL=template.d.ts.map