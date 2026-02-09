"use strict";
/**
 * Supervisor Config API Routes
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-4, SUP-5
 *
 * Provides Web UI settings for:
 * - Global Template Editor
 * - Project Template Editor
 * - Supervisor ON/OFF
 * - Timeout profile
 * - Restart mode
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupervisorConfigRoutes = createSupervisorConfigRoutes;
const express_1 = require("express");
const index_1 = require("../../supervisor/index");
function createSupervisorConfigRoutes(options) {
    const router = (0, express_1.Router)();
    const { projectRoot } = options;
    // ==========================================================================
    // Global Config (SUP-5)
    // ==========================================================================
    /**
     * GET /api/supervisor/global
     * Get global supervisor config
     */
    router.get('/global', (req, res) => {
        try {
            const supervisor = (0, index_1.getSupervisor)(projectRoot);
            const config = supervisor.getConfig('default');
            res.json({
                global_input_template: config.globalInputTemplate,
                global_output_template: config.globalOutputTemplate,
                supervisor_rules: {
                    enabled: config.supervisorEnabled,
                    timeout_default_ms: config.timeoutMs,
                    max_retries: config.maxRetries,
                    fail_on_violation: config.failOnViolation,
                },
            });
        }
        catch (error) {
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * PUT /api/supervisor/global
     * Update global supervisor config
     */
    router.put('/global', (req, res) => {
        try {
            const supervisor = (0, index_1.getSupervisor)(projectRoot);
            const body = req.body;
            // Validate required fields
            const config = {
                global_input_template: body.global_input_template ?? index_1.DEFAULT_GLOBAL_CONFIG.global_input_template,
                global_output_template: body.global_output_template ?? index_1.DEFAULT_GLOBAL_CONFIG.global_output_template,
                supervisor_rules: {
                    enabled: body.supervisor_rules?.enabled ?? index_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.enabled,
                    timeout_default_ms: body.supervisor_rules?.timeout_default_ms ?? index_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.timeout_default_ms,
                    max_retries: body.supervisor_rules?.max_retries ?? index_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.max_retries,
                    fail_on_violation: body.supervisor_rules?.fail_on_violation ?? index_1.DEFAULT_GLOBAL_CONFIG.supervisor_rules.fail_on_violation,
                },
            };
            supervisor.updateGlobalConfig(config);
            supervisor.clearCache();
            res.json({
                success: true,
                message: 'Global config updated',
                config,
            });
        }
        catch (error) {
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    // ==========================================================================
    // Project Config (SUP-4)
    // ==========================================================================
    /**
     * GET /api/supervisor/projects/:projectId
     * Get project-specific config
     */
    router.get('/projects/:projectId', (req, res) => {
        try {
            const projectId = req.params.projectId;
            const supervisor = (0, index_1.getSupervisor)(projectRoot);
            const config = supervisor.getConfig(projectId);
            res.json({
                projectId,
                input_template: config.projectInputTemplate,
                output_template: config.projectOutputTemplate,
                supervisor_rules: {
                    timeout_profile: getTimeoutProfile(config.timeoutMs),
                    allow_raw_output: config.allowRawOutput,
                    require_format_validation: config.requireFormatValidation,
                },
            });
        }
        catch (error) {
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * PUT /api/supervisor/projects/:projectId
     * Update project-specific config
     */
    router.put('/projects/:projectId', (req, res) => {
        try {
            const projectId = req.params.projectId;
            const supervisor = (0, index_1.getSupervisor)(projectRoot);
            const body = req.body;
            const config = {
                projectId,
                input_template: body.input_template ?? index_1.DEFAULT_PROJECT_CONFIG.input_template,
                output_template: body.output_template ?? index_1.DEFAULT_PROJECT_CONFIG.output_template,
                supervisor_rules: {
                    timeout_profile: body.supervisor_rules?.timeout_profile ?? index_1.DEFAULT_PROJECT_CONFIG.supervisor_rules.timeout_profile,
                    allow_raw_output: body.supervisor_rules?.allow_raw_output ?? index_1.DEFAULT_PROJECT_CONFIG.supervisor_rules.allow_raw_output,
                    require_format_validation: body.supervisor_rules?.require_format_validation ?? index_1.DEFAULT_PROJECT_CONFIG.supervisor_rules.require_format_validation,
                },
            };
            supervisor.updateProjectConfig(config);
            supervisor.clearCache();
            res.json({
                success: true,
                message: `Project config updated for ${projectId}`,
                config,
            });
        }
        catch (error) {
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    // ==========================================================================
    // Timeout Profiles
    // ==========================================================================
    /**
     * GET /api/supervisor/timeout-profiles
     * List available timeout profiles
     */
    router.get('/timeout-profiles', (req, res) => {
        res.json({
            profiles: Object.entries(index_1.TIMEOUT_PROFILES).map(([name, ms]) => ({
                name,
                timeout_ms: ms,
                description: getProfileDescription(name),
            })),
        });
    });
    // ==========================================================================
    // Supervisor Status
    // ==========================================================================
    /**
     * GET /api/supervisor/status
     * Get supervisor status
     */
    router.get('/status', (req, res) => {
        try {
            const supervisor = (0, index_1.getSupervisor)(projectRoot);
            const config = supervisor.getConfig('default');
            res.json({
                enabled: config.supervisorEnabled,
                projectRoot,
                timeout_ms: config.timeoutMs,
                max_retries: config.maxRetries,
                fail_on_violation: config.failOnViolation,
            });
        }
        catch (error) {
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    /**
     * POST /api/supervisor/toggle
     * Toggle supervisor on/off
     */
    router.post('/toggle', (req, res) => {
        try {
            const { enabled } = req.body;
            const supervisor = (0, index_1.getSupervisor)(projectRoot);
            const currentConfig = supervisor.getConfig('default');
            const newEnabled = enabled ?? !currentConfig.supervisorEnabled;
            supervisor.updateGlobalConfig({
                global_input_template: currentConfig.globalInputTemplate,
                global_output_template: currentConfig.globalOutputTemplate,
                supervisor_rules: {
                    enabled: newEnabled,
                    timeout_default_ms: currentConfig.timeoutMs,
                    max_retries: currentConfig.maxRetries,
                    fail_on_violation: currentConfig.failOnViolation,
                },
            });
            supervisor.clearCache();
            res.json({
                success: true,
                enabled: newEnabled,
                message: `Supervisor ${newEnabled ? 'enabled' : 'disabled'}`,
            });
        }
        catch (error) {
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    return router;
}
// =============================================================================
// Helper Functions
// =============================================================================
function getTimeoutProfile(timeoutMs) {
    for (const [name, ms] of Object.entries(index_1.TIMEOUT_PROFILES)) {
        if (ms === timeoutMs) {
            return name;
        }
    }
    return 'standard';
}
function getProfileDescription(name) {
    switch (name) {
        case 'standard':
            return 'Standard timeout (60s idle, 10m hard)';
        case 'long':
            return 'Long timeout (120s idle, 30m hard)';
        case 'extended':
            return 'Extended timeout (300s idle, 60m hard)';
        default:
            return 'Unknown profile';
    }
}
//# sourceMappingURL=supervisor-config.js.map