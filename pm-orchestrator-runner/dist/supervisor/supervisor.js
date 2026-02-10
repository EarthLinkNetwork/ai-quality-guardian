"use strict";
/**
 * Supervisor Core
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-1
 *
 * All tasks MUST pass through Supervisor.
 * Direct LLM execution is prohibited.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Supervisor = void 0;
exports.detectRestartState = detectRestartState;
exports.getSupervisor = getSupervisor;
exports.resetSupervisor = resetSupervisor;
const config_loader_1 = require("./config-loader");
const template_engine_1 = require("./template-engine");
const supervisor_logger_1 = require("./supervisor-logger");
// =============================================================================
// Supervisor Implementation
// =============================================================================
class Supervisor {
    configManager;
    executor = null;
    logger;
    constructor(projectRoot) {
        this.configManager = new config_loader_1.SupervisorConfigManager(projectRoot);
        this.logger = (0, supervisor_logger_1.getSupervisorLogger)();
    }
    /**
     * Get the logger instance for external access
     */
    getLogger() {
        return this.logger;
    }
    /**
     * Set the executor (dependency injection)
     */
    setExecutor(executor) {
        this.executor = executor;
    }
    /**
     * SUP-2: Compose prompt with templates
     *
     * Order: global → project → user (immutable)
     */
    compose(userPrompt, projectId) {
        const config = this.configManager.getMergedConfig(projectId);
        return (0, template_engine_1.mergePrompt)(config.globalInputTemplate, config.projectInputTemplate, userPrompt);
    }
    /**
     * SUP-1: Execute through supervisor (never direct)
     */
    async execute(composed, projectId = 'default', taskId) {
        const startTime = Date.now();
        const config = this.configManager.getMergedConfig(projectId);
        // Log execution start
        this.logger.logExecutionStart(taskId || 'unknown', {
            projectId,
            prompt: composed.userPrompt,
        });
        // Ensure supervisor is enabled
        if (!config.supervisorEnabled) {
            const error = new Error('Supervisor is disabled but execute() was called. This is a violation.');
            this.logger.logError('Supervisor disabled violation', error, { taskId, projectId });
            throw error;
        }
        // Ensure executor is set
        if (!this.executor) {
            const error = new Error('No executor set. Call setExecutor() before execute().');
            this.logger.logError('No executor configured', error, { taskId, projectId });
            throw error;
        }
        // Log template selection
        const outputTemplate = config.projectOutputTemplate || config.globalOutputTemplate;
        if (outputTemplate) {
            this.logger.logTemplateSelection(outputTemplate.substring(0, 50), {
                taskId,
                projectId,
                templateType: 'output',
                source: config.projectOutputTemplate ? 'project' : 'global',
            });
        }
        let retryCount = 0;
        let lastError;
        while (retryCount <= config.maxRetries) {
            try {
                // Log retry attempt if not first try
                if (retryCount > 0) {
                    this.logger.logRetryResume('retry', `Attempt ${retryCount + 1} of ${config.maxRetries + 1}: ${lastError}`, {
                        taskId,
                        projectId,
                        attempt: retryCount + 1,
                        maxAttempts: config.maxRetries + 1,
                    });
                }
                // Execute through LLM
                const result = await this.executor.execute(composed.composed, {
                    timeoutMs: config.timeoutMs,
                    maxRetries: 0, // We handle retries here
                });
                if (!result.success) {
                    lastError = result.error;
                    this.logger.log('warn', 'EXECUTION_END', `Execution attempt failed: ${result.error}`, {
                        taskId,
                        projectId,
                        details: { attempt: retryCount + 1, error: result.error },
                    });
                    retryCount++;
                    continue;
                }
                // SUP-3: Apply output template
                const formatted = this.format(result.output, projectId);
                // SUP-7: Validate output
                const validation = this.validate(formatted.formatted);
                // Log validation result
                this.logger.logValidation(validation.valid, validation.violations, { taskId, projectId });
                // Handle violations
                if (!validation.valid && config.failOnViolation) {
                    const majorViolations = validation.violations.filter(v => v.severity === 'major');
                    if (majorViolations.length > 0) {
                        this.logger.logExecutionEnd(taskId || 'unknown', false, {
                            projectId,
                            durationMs: Date.now() - startTime,
                            error: `Validation failed with ${majorViolations.length} major violations`,
                        });
                        return {
                            success: false,
                            output: formatted,
                            validation,
                            executionTimeMs: Date.now() - startTime,
                            retryCount,
                        };
                    }
                }
                // Log successful execution
                this.logger.logExecutionEnd(taskId || 'unknown', true, {
                    projectId,
                    durationMs: Date.now() - startTime,
                });
                return {
                    success: true,
                    output: formatted,
                    validation,
                    executionTimeMs: Date.now() - startTime,
                    retryCount,
                };
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                this.logger.logError(`Execution attempt ${retryCount + 1} threw error`, error, { taskId, projectId });
                retryCount++;
            }
        }
        // All retries exhausted
        this.logger.logExecutionEnd(taskId || 'unknown', false, {
            projectId,
            durationMs: Date.now() - startTime,
            error: `All ${retryCount} retries exhausted: ${lastError}`,
        });
        return {
            success: false,
            output: {
                raw: '',
                formatted: '',
                templateApplied: false,
            },
            validation: {
                valid: false,
                violations: [{
                        type: 'direct_execution_attempt',
                        message: `Execution failed after ${retryCount} retries: ${lastError}`,
                        canAutoCorrect: false,
                        severity: 'major',
                    }],
            },
            executionTimeMs: Date.now() - startTime,
            retryCount,
        };
    }
    /**
     * SUP-7: Validate output against rules
     */
    validate(output) {
        const violations = [];
        // Check for empty output
        if (!output || !output.trim()) {
            violations.push({
                type: 'missing_required_section',
                message: 'Output is empty',
                canAutoCorrect: false,
                severity: 'major',
            });
        }
        // Check for common violation patterns
        const violationPatterns = [
            {
                pattern: /SKIP_VALIDATION|NO_TEMPLATE/i,
                type: 'skipped_validation',
                message: 'Output contains validation skip marker',
                severity: 'major',
            },
            {
                pattern: /DIRECT_EXECUTE|BYPASS_SUPERVISOR/i,
                type: 'direct_execution_attempt',
                message: 'Output contains direct execution marker',
                severity: 'major',
            },
        ];
        for (const { pattern, type, message, severity } of violationPatterns) {
            if (pattern.test(output)) {
                violations.push({
                    type,
                    message,
                    canAutoCorrect: false,
                    severity,
                });
            }
        }
        return {
            valid: violations.length === 0,
            violations,
        };
    }
    /**
     * SUP-3: Format output with template
     */
    format(output, projectId) {
        const config = this.configManager.getMergedConfig(projectId);
        // Determine which output template to use
        const outputTemplate = config.projectOutputTemplate || config.globalOutputTemplate;
        // Allow raw output if configured
        if (config.allowRawOutput && !outputTemplate) {
            return {
                raw: output,
                formatted: output,
                templateApplied: false,
            };
        }
        return (0, template_engine_1.applyOutputTemplate)(output, outputTemplate);
    }
    /**
     * Get merged config for a project
     */
    getConfig(projectId) {
        return this.configManager.getMergedConfig(projectId);
    }
    /**
     * Update global config
     */
    updateGlobalConfig(config) {
        this.configManager.updateGlobalConfig(config);
    }
    /**
     * Update project config
     */
    updateProjectConfig(config) {
        this.configManager.updateProjectConfig(config);
    }
    /**
     * Clear config cache (for testing or config reload)
     */
    clearCache() {
        this.configManager.clearCache();
    }
}
exports.Supervisor = Supervisor;
/**
 * SUP-6: Detect restart state and determine action
 */
function detectRestartState(task, staleThresholdMs = 30000) {
    const logger = (0, supervisor_logger_1.getSupervisorLogger)();
    // AWAITING_RESPONSE: continue without change
    if (task.status === 'AWAITING_RESPONSE') {
        const result = {
            action: 'continue',
            reason: 'Task is awaiting response, can continue',
            taskId: task.taskId,
        };
        logger.logRetryResume('resume', result.reason, { taskId: task.taskId });
        return result;
    }
    // RUNNING: check for stale state
    if (task.status === 'RUNNING') {
        const lastProgress = task.lastProgressTimestamp
            ? new Date(task.lastProgressTimestamp).getTime()
            : 0;
        const elapsed = Date.now() - lastProgress;
        if (elapsed > staleThresholdMs) {
            // Stale - decide based on artifacts
            if (task.hasCompleteArtifacts) {
                const result = {
                    action: 'resume',
                    reason: `Stale (${elapsed}ms since last progress) but has complete artifacts`,
                    taskId: task.taskId,
                };
                logger.logRetryResume('resume', result.reason, { taskId: task.taskId });
                return result;
            }
            else {
                const result = {
                    action: 'rollback_replay',
                    reason: `Stale (${elapsed}ms since last progress) without complete artifacts`,
                    taskId: task.taskId,
                };
                logger.logRetryResume('rollback', result.reason, { taskId: task.taskId });
                return result;
            }
        }
    }
    // No action needed
    return {
        action: 'none',
        reason: 'No restart action needed',
        taskId: task.taskId,
    };
}
// =============================================================================
// Singleton Factory
// =============================================================================
let supervisorInstance = null;
function getSupervisor(projectRoot) {
    if (!supervisorInstance) {
        supervisorInstance = new Supervisor(projectRoot);
    }
    return supervisorInstance;
}
function resetSupervisor() {
    supervisorInstance = null;
}
// Supervisor class is exported inline above
//# sourceMappingURL=supervisor.js.map