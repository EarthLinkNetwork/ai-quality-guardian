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

import { Router, Request, Response } from 'express';
import {
  Supervisor,
  getSupervisor,
  GlobalConfig,
  ProjectConfig,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROJECT_CONFIG,
  TIMEOUT_PROFILES,
} from '../../supervisor/index';

export interface SupervisorConfigRoutesOptions {
  projectRoot: string;
}

export function createSupervisorConfigRoutes(options: SupervisorConfigRoutesOptions): Router {
  const router = Router();
  const { projectRoot } = options;

  // ==========================================================================
  // Global Config (SUP-5)
  // ==========================================================================

  /**
   * GET /api/supervisor/global
   * Get global supervisor config
   */
  router.get('/global', (req: Request, res: Response) => {
    try {
      const supervisor = getSupervisor(projectRoot);
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
    } catch (error) {
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
  router.put('/global', (req: Request, res: Response) => {
    try {
      const supervisor = getSupervisor(projectRoot);
      const body = req.body as Partial<GlobalConfig>;

      // Validate required fields
      const config: GlobalConfig = {
        global_input_template: body.global_input_template ?? DEFAULT_GLOBAL_CONFIG.global_input_template,
        global_output_template: body.global_output_template ?? DEFAULT_GLOBAL_CONFIG.global_output_template,
        supervisor_rules: {
          enabled: body.supervisor_rules?.enabled ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.enabled,
          timeout_default_ms: body.supervisor_rules?.timeout_default_ms ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.timeout_default_ms,
          max_retries: body.supervisor_rules?.max_retries ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.max_retries,
          fail_on_violation: body.supervisor_rules?.fail_on_violation ?? DEFAULT_GLOBAL_CONFIG.supervisor_rules.fail_on_violation,
        },
      };

      supervisor.updateGlobalConfig(config);
      supervisor.clearCache();

      res.json({
        success: true,
        message: 'Global config updated',
        config,
      });
    } catch (error) {
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
  router.get('/projects/:projectId', (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const supervisor = getSupervisor(projectRoot);
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
    } catch (error) {
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
  router.put('/projects/:projectId', (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const supervisor = getSupervisor(projectRoot);
      const body = req.body as Partial<ProjectConfig>;

      const config: ProjectConfig = {
        projectId,
        input_template: body.input_template ?? DEFAULT_PROJECT_CONFIG.input_template,
        output_template: body.output_template ?? DEFAULT_PROJECT_CONFIG.output_template,
        supervisor_rules: {
          timeout_profile: body.supervisor_rules?.timeout_profile ?? DEFAULT_PROJECT_CONFIG.supervisor_rules.timeout_profile,
          allow_raw_output: body.supervisor_rules?.allow_raw_output ?? DEFAULT_PROJECT_CONFIG.supervisor_rules.allow_raw_output,
          require_format_validation: body.supervisor_rules?.require_format_validation ?? DEFAULT_PROJECT_CONFIG.supervisor_rules.require_format_validation,
        },
      };

      supervisor.updateProjectConfig(config);
      supervisor.clearCache();

      res.json({
        success: true,
        message: `Project config updated for ${projectId}`,
        config,
      });
    } catch (error) {
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
  router.get('/timeout-profiles', (req: Request, res: Response) => {
    res.json({
      profiles: Object.entries(TIMEOUT_PROFILES).map(([name, ms]) => ({
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
  router.get('/status', (req: Request, res: Response) => {
    try {
      const supervisor = getSupervisor(projectRoot);
      const config = supervisor.getConfig('default');

      res.json({
        enabled: config.supervisorEnabled,
        projectRoot,
        timeout_ms: config.timeoutMs,
        max_retries: config.maxRetries,
        fail_on_violation: config.failOnViolation,
      });
    } catch (error) {
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
  router.post('/toggle', (req: Request, res: Response) => {
    try {
      const { enabled } = req.body as { enabled?: boolean };
      const supervisor = getSupervisor(projectRoot);
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
    } catch (error) {
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

function getTimeoutProfile(timeoutMs: number): 'standard' | 'long' | 'extended' {
  for (const [name, ms] of Object.entries(TIMEOUT_PROFILES)) {
    if (ms === timeoutMs) {
      return name as 'standard' | 'long' | 'extended';
    }
  }
  return 'standard';
}

function getProfileDescription(name: string): string {
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
