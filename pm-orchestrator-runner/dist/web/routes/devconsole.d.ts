/**
 * Dev Console Routes - Self-hosted Runner Development Console
 *
 * Provides file system browsing, code search, patch application,
 * command execution with persistent logging, and git operations.
 *
 * SECURITY: Only available for projectType === "runner-dev"
 */
import { Router } from "express";
/**
 * Create Dev Console routes
 */
export declare function createDevconsoleRoutes(stateDir: string): Router;
//# sourceMappingURL=devconsole.d.ts.map