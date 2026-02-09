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
import { Router } from 'express';
export interface SupervisorConfigRoutesOptions {
    projectRoot: string;
}
export declare function createSupervisorConfigRoutes(options: SupervisorConfigRoutesOptions): Router;
//# sourceMappingURL=supervisor-config.d.ts.map