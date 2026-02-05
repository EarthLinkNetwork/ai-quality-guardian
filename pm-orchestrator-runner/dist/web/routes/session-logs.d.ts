/**
 * Session Logs Routes - Session Log Tree API
 *
 * Provides hierarchical session/log tree view for Web Dev Mode.
 * Sessions group command runs by date, providing tree navigation.
 *
 * Storage structure:
 *   stateDir/{namespace}/devconsole/
 *     sessions/
 *       {sessionId}.json - Session metadata
 *       index.json - Session index
 *     cmd/
 *       {runId}.json - Existing command run info
 *       {runId}.log.jsonl - Existing command logs
 *
 * SECURITY: Only available for projectType === "runner-dev"
 */
import { Router } from "express";
/**
 * Session info for tree display
 */
export interface SessionInfo {
    sessionId: string;
    label: string;
    startedAt: string;
    endedAt?: string;
    runCount: number;
    status: "active" | "completed" | "failed";
    summary?: string;
}
/**
 * Session with runs for detailed view
 */
export interface SessionWithRuns extends SessionInfo {
    runs: SessionRunInfo[];
}
/**
 * Run info for session tree
 */
export interface SessionRunInfo {
    runId: string;
    command: string;
    status: "running" | "completed" | "failed";
    exitCode?: number;
    startedAt: string;
    endedAt?: string;
    duration?: number;
    logLineCount?: number;
}
/**
 * Session tree node for UI rendering
 */
export interface SessionTreeNode {
    id: string;
    type: "date" | "session" | "run";
    label: string;
    status?: "active" | "completed" | "failed" | "running";
    children?: SessionTreeNode[];
    metadata?: Record<string, unknown>;
}
/**
 * Create Session Logs routes
 */
export declare function createSessionLogsRoutes(stateDir: string): Router;
//# sourceMappingURL=session-logs.d.ts.map