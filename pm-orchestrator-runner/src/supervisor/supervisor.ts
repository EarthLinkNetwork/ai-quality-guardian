/**
 * Supervisor Core
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-1
 *
 * All tasks MUST pass through Supervisor.
 * Direct LLM execution is prohibited.
 */

import {
  ISupervisor,
  ComposedPrompt,
  SupervisedResult,
  ValidationResult,
  FormattedOutput,
  Violation,
  ViolationType,
  MergedConfig,
  RestartAction,
  RestartState,
} from './types';
import { SupervisorConfigManager } from './config-loader';
import { mergePrompt, applyOutputTemplate } from './template-engine';
import { getSupervisorLogger, SupervisorLogger } from './supervisor-logger';

// =============================================================================
// Executor Interface (to be implemented by actual LLM executors)
// =============================================================================

export interface IExecutor {
  execute(prompt: string, options: ExecutorOptions): Promise<ExecutorResult>;
}

export interface ExecutorOptions {
  timeoutMs: number;
  maxRetries: number;
}

export interface ExecutorResult {
  output: string;
  success: boolean;
  error?: string;
  executionTimeMs: number;
}

// =============================================================================
// Supervisor Implementation
// =============================================================================

export class Supervisor implements ISupervisor {
  private configManager: SupervisorConfigManager;
  private executor: IExecutor | null = null;
  private logger: SupervisorLogger;

  constructor(projectRoot: string) {
    this.configManager = new SupervisorConfigManager(projectRoot);
    this.logger = getSupervisorLogger();
  }

  /**
   * Get the logger instance for external access
   */
  getLogger(): SupervisorLogger {
    return this.logger;
  }

  /**
   * Set the executor (dependency injection)
   */
  setExecutor(executor: IExecutor): void {
    this.executor = executor;
  }

  /**
   * SUP-2: Compose prompt with templates
   *
   * Order: global → project → user (immutable)
   */
  compose(userPrompt: string, projectId: string): ComposedPrompt {
    const config = this.configManager.getMergedConfig(projectId);

    return mergePrompt(
      config.globalInputTemplate,
      config.projectInputTemplate,
      userPrompt
    );
  }

  /**
   * SUP-1: Execute through supervisor (never direct)
   */
  async execute(composed: ComposedPrompt, projectId: string = 'default', taskId?: string): Promise<SupervisedResult> {
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
    let lastError: string | undefined;

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

      } catch (error) {
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
  validate(output: string): ValidationResult {
    const violations: Violation[] = [];

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
    const violationPatterns: { pattern: RegExp; type: ViolationType; message: string; severity: 'minor' | 'major' }[] = [
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
  format(output: string, projectId: string): FormattedOutput {
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

    return applyOutputTemplate(output, outputTemplate);
  }

  /**
   * Get merged config for a project
   */
  getConfig(projectId: string): MergedConfig {
    return this.configManager.getMergedConfig(projectId);
  }

  /**
   * Update global config
   */
  updateGlobalConfig(config: Parameters<SupervisorConfigManager['updateGlobalConfig']>[0]): void {
    this.configManager.updateGlobalConfig(config);
  }

  /**
   * Update project config
   */
  updateProjectConfig(config: Parameters<SupervisorConfigManager['updateProjectConfig']>[0]): void {
    this.configManager.updateProjectConfig(config);
  }

  /**
   * Clear config cache (for testing or config reload)
   */
  clearCache(): void {
    this.configManager.clearCache();
  }
}

// =============================================================================
// Restart State Detection (SUP-6)
// =============================================================================

export interface TaskState {
  taskId: string;
  status: string;
  lastProgressTimestamp: string | null;
  hasCompleteArtifacts: boolean;
}

/**
 * SUP-6: Detect restart state and determine action
 */
export function detectRestartState(task: TaskState, staleThresholdMs: number = 30000): RestartState {
  const logger = getSupervisorLogger();

  // AWAITING_RESPONSE: continue without change
  if (task.status === 'AWAITING_RESPONSE') {
    const result: RestartState = {
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
        const result: RestartState = {
          action: 'resume',
          reason: `Stale (${elapsed}ms since last progress) but has complete artifacts`,
          taskId: task.taskId,
        };
        logger.logRetryResume('resume', result.reason, { taskId: task.taskId });
        return result;
      } else {
        const result: RestartState = {
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

let supervisorInstance: Supervisor | null = null;

export function getSupervisor(projectRoot: string): Supervisor {
  if (!supervisorInstance) {
    supervisorInstance = new Supervisor(projectRoot);
  }
  return supervisorInstance;
}

export function resetSupervisor(): void {
  supervisorInstance = null;
}

// Supervisor class is exported inline above
