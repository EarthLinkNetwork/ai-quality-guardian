/**
 * Supervisor Logs Routes
 *
 * AC A.1: Supervisor Log: TaskType判定、write許可、ガード判定、再試行/再開理由、採用したテンプレ
 *
 * Provides API endpoints for:
 * - Retrieving supervisor decision logs
 * - Real-time streaming via SSE
 * - Filtering by task, category, or time range
 */
import { Router } from 'express';
/**
 * Creates router for supervisor log endpoints
 *
 * @returns Express router
 */
export declare function createSupervisorLogsRoutes(): Router;
//# sourceMappingURL=supervisor-logs.d.ts.map