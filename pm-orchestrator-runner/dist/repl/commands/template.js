"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateCommand = void 0;
const template_1 = require("../../template");
/**
 * Template command handler
 */
class TemplateCommand {
    templateStore = null;
    settingsStore = null;
    /**
     * Set the template store instance
     */
    setTemplateStore(store) {
        this.templateStore = store;
    }
    /**
     * Set the settings store instance
     */
    setSettingsStore(store) {
        this.settingsStore = store;
    }
    /**
     * Ensure template store is initialized
     */
    ensureStore() {
        if (!this.templateStore) {
            throw new Error('TemplateStore not initialized');
        }
        return this.templateStore;
    }
    /**
     * Ensure settings store is initialized
     */
    ensureSettings() {
        if (!this.settingsStore) {
            throw new Error('ProjectSettingsStore not initialized');
        }
        return this.settingsStore;
    }
    // ============================================================================
    // /templates Commands
    // ============================================================================
    /**
     * List all templates
     */
    async list() {
        try {
            const store = this.ensureStore();
            const entries = store.list();
            // Load full templates from entries
            const templates = [];
            for (const entry of entries) {
                const template = store.get(entry.id);
                if (template) {
                    templates.push(template);
                }
            }
            return {
                success: true,
                templates,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E401',
                    message: error instanceof Error ? error.message : 'Failed to list templates',
                },
            };
        }
    }
    /**
     * Create a new template
     */
    async create(name, rulesText, outputFormatText) {
        try {
            const store = this.ensureStore();
            // Validate name
            const validation = (0, template_1.validateTemplateName)(name);
            if (!validation.valid) {
                return {
                    success: false,
                    error: {
                        code: 'E402',
                        message: validation.errors[0] || 'Invalid template name',
                    },
                };
            }
            // Check if name already exists
            const existing = store.getByName(name);
            if (existing) {
                return {
                    success: false,
                    error: {
                        code: 'E403',
                        message: `Template "${name}" already exists`,
                    },
                };
            }
            const template = await store.create(name, rulesText, outputFormatText);
            return {
                success: true,
                template,
                message: `Template "${name}" created`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E404',
                    message: error instanceof Error ? error.message : 'Failed to create template',
                },
            };
        }
    }
    /**
     * Update an existing template
     */
    async update(id, updates) {
        try {
            const store = this.ensureStore();
            // Get existing template
            const existing = store.get(id);
            if (!existing) {
                return {
                    success: false,
                    error: {
                        code: 'E405',
                        message: `Template "${id}" not found`,
                    },
                };
            }
            // Check if built-in
            if (existing.isBuiltIn) {
                return {
                    success: false,
                    error: {
                        code: 'E406',
                        message: 'Cannot edit built-in template. Use /templates copy to create an editable copy.',
                    },
                };
            }
            // Validate name if changing
            if (updates.name && updates.name !== existing.name) {
                const validation = (0, template_1.validateTemplateName)(updates.name);
                if (!validation.valid) {
                    return {
                        success: false,
                        error: {
                            code: 'E402',
                            message: validation.errors[0] || 'Invalid template name',
                        },
                    };
                }
                // Check if new name already exists
                const other = store.getByName(updates.name);
                if (other && other.id !== id) {
                    return {
                        success: false,
                        error: {
                            code: 'E403',
                            message: `Template "${updates.name}" already exists`,
                        },
                    };
                }
            }
            const template = await store.update(id, updates);
            return {
                success: true,
                template,
                message: `Template "${template.name}" updated`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E407',
                    message: error instanceof Error ? error.message : 'Failed to update template',
                },
            };
        }
    }
    /**
     * Delete a template
     */
    async delete(nameOrId) {
        try {
            const store = this.ensureStore();
            // Find template by name or ID
            let template = store.get(nameOrId);
            if (!template) {
                template = store.getByName(nameOrId);
            }
            if (!template) {
                return {
                    success: false,
                    error: {
                        code: 'E405',
                        message: `Template "${nameOrId}" not found`,
                    },
                };
            }
            // Check if built-in
            if (template.isBuiltIn) {
                return {
                    success: false,
                    error: {
                        code: 'E408',
                        message: 'Cannot delete built-in template',
                    },
                };
            }
            // Check if currently selected
            if (this.settingsStore) {
                const settings = this.settingsStore.get();
                if (settings.template.selectedId === template.id) {
                    // Clear selection
                    await this.settingsStore.setTemplate(null);
                }
            }
            await store.delete(template.id);
            return {
                success: true,
                message: `Template "${template.name}" deleted`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E409',
                    message: error instanceof Error ? error.message : 'Failed to delete template',
                },
            };
        }
    }
    /**
     * Copy a template (creates an editable copy)
     */
    async copy(sourceNameOrId, newName) {
        try {
            const store = this.ensureStore();
            const template = await store.copy(sourceNameOrId, newName);
            return {
                success: true,
                template,
                message: `Template "${sourceNameOrId}" copied to "${newName}"`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E410',
                    message: error instanceof Error ? error.message : 'Failed to copy template',
                },
            };
        }
    }
    // ============================================================================
    // /template Commands
    // ============================================================================
    /**
     * Select and enable a template
     */
    async use(nameOrId) {
        try {
            const store = this.ensureStore();
            const settings = this.ensureSettings();
            // Find template by name or ID
            let template = store.get(nameOrId);
            if (!template) {
                template = store.getByName(nameOrId);
            }
            if (!template) {
                return {
                    success: false,
                    error: {
                        code: 'E405',
                        message: `Template "${nameOrId}" not found`,
                    },
                };
            }
            // Update settings
            await settings.setTemplate(template.id);
            return {
                success: true,
                template,
                message: `Template "${template.name}" selected and enabled`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E411',
                    message: error instanceof Error ? error.message : 'Failed to use template',
                },
            };
        }
    }
    /**
     * Enable template injection
     */
    async enable() {
        try {
            const settings = this.ensureSettings();
            const currentSettings = settings.get();
            if (!currentSettings.template.selectedId) {
                return {
                    success: false,
                    error: {
                        code: 'E412',
                        message: 'No template selected. Use /template use <name> first.',
                    },
                };
            }
            await settings.enableTemplate(true);
            const store = this.ensureStore();
            const template = store.get(currentSettings.template.selectedId);
            return {
                success: true,
                message: `Template injection enabled (using: ${template?.name || currentSettings.template.selectedId})`,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E413',
                    message: error instanceof Error ? error.message : 'Failed to enable template',
                },
            };
        }
    }
    /**
     * Disable template injection
     */
    async disable() {
        try {
            const settings = this.ensureSettings();
            await settings.enableTemplate(false);
            const currentSettings = settings.get();
            const selectedId = currentSettings.template.selectedId;
            let message = 'Template injection disabled';
            if (selectedId) {
                const store = this.ensureStore();
                const template = store.get(selectedId);
                message += ` (selected: ${template?.name || selectedId}, will be used when re-enabled)`;
            }
            return {
                success: true,
                message,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E414',
                    message: error instanceof Error ? error.message : 'Failed to disable template',
                },
            };
        }
    }
    /**
     * Show current template status
     */
    async show() {
        try {
            const settings = this.ensureSettings();
            const store = this.ensureStore();
            const currentSettings = settings.get();
            const { selectedId, enabled } = currentSettings.template;
            let template;
            if (selectedId) {
                template = store.get(selectedId) || undefined;
            }
            return {
                success: true,
                template,
                message: this.formatStatus(selectedId, enabled, template),
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'E415',
                    message: error instanceof Error ? error.message : 'Failed to show template status',
                },
            };
        }
    }
    /**
     * Get the currently active template (if any)
     */
    getActive() {
        try {
            if (!this.settingsStore || !this.templateStore) {
                return null;
            }
            const settings = this.settingsStore.get();
            if (!settings.template.enabled || !settings.template.selectedId) {
                return null;
            }
            return this.templateStore.get(settings.template.selectedId) || null;
        }
        catch {
            return null;
        }
    }
    // ============================================================================
    // Formatting Helpers
    // ============================================================================
    /**
     * Format template list for display
     */
    formatList(templates, selectedId) {
        const lines = [];
        lines.push('');
        lines.push('Templates');
        lines.push('---------');
        if (templates.length === 0) {
            lines.push('  No templates found');
        }
        else {
            for (const t of templates) {
                const isSelected = t.id === selectedId;
                const marker = isSelected ? '*' : ' ';
                const builtInLabel = t.isBuiltIn ? ' (builtin)' : '';
                const activeLabel = isSelected ? ' [ACTIVE]' : '';
                lines.push(`  ${marker} ${t.name}${builtInLabel}${activeLabel}`);
                lines.push(`      ID: ${t.id}`);
            }
        }
        lines.push('');
        return lines.join('\n');
    }
    /**
     * Format template status for display
     */
    formatStatus(selectedId, enabled, template) {
        const lines = [];
        lines.push('');
        lines.push('Template Settings');
        lines.push('-----------------');
        if (!selectedId) {
            lines.push('  Selected: (none)');
            lines.push('  Enabled: No');
        }
        else if (!template) {
            lines.push(`  Selected: ${selectedId} (NOT FOUND)`);
            lines.push('  Enabled: ' + (enabled ? 'Yes' : 'No'));
            lines.push('');
            lines.push('  WARNING: Selected template not found. Use /template use <name> to select another.');
        }
        else {
            lines.push(`  Selected: ${template.name} (${template.id})`);
            lines.push('  Enabled: ' + (enabled ? 'Yes' : 'No'));
            lines.push('  Built-in: ' + (template.isBuiltIn ? 'Yes' : 'No'));
            if (template.rulesText) {
                lines.push('');
                lines.push('  Rules:');
                const rulesPreview = template.rulesText.substring(0, 200);
                lines.push('    ' + rulesPreview.replace(/\n/g, '\n    '));
                if (template.rulesText.length > 200) {
                    lines.push('    ...');
                }
            }
            if (template.outputFormatText) {
                lines.push('');
                lines.push('  Output Format:');
                const formatPreview = template.outputFormatText.substring(0, 200);
                lines.push('    ' + formatPreview.replace(/\n/g, '\n    '));
                if (template.outputFormatText.length > 200) {
                    lines.push('    ...');
                }
            }
        }
        lines.push('');
        return lines.join('\n');
    }
    /**
     * Format template detail for display
     */
    formatDetail(template) {
        const lines = [];
        lines.push('');
        lines.push(`Template: ${template.name}`);
        lines.push('-'.repeat(10 + template.name.length));
        lines.push(`  ID: ${template.id}`);
        lines.push(`  Built-in: ${template.isBuiltIn ? 'Yes' : 'No'}`);
        lines.push(`  Created: ${template.createdAt}`);
        lines.push(`  Updated: ${template.updatedAt}`);
        lines.push('');
        lines.push('Rules:');
        lines.push(template.rulesText || '  (empty)');
        lines.push('');
        lines.push('Output Format:');
        lines.push(template.outputFormatText || '  (empty)');
        lines.push('');
        return lines.join('\n');
    }
}
exports.TemplateCommand = TemplateCommand;
//# sourceMappingURL=template.js.map