/**
 * Tree Service
 *
 * Service for building hierarchical tree structures for the log viewer UI.
 * Provides Project→Session→Thread→Run hierarchy with expand/collapse support.
 */
import { ProjectTreeNode, SessionTreeNode, RunTreeNode, LogEventTreeNode, ProjectIndex, Session, TaskEvent } from "../dal/types";
/**
 * Build a project tree node from a ProjectIndex
 * Initial state: sessions not loaded (lazy loading)
 */
export declare function buildProjectNode(project: ProjectIndex): ProjectTreeNode;
/**
 * Build a session tree node from a Session
 * Initial state: threads collapsed
 */
export declare function buildSessionNode(session: Session): SessionTreeNode;
/**
 * Build log event tree nodes from TaskEvents
 */
export declare function buildLogEventNodes(events: TaskEvent[]): LogEventTreeNode[];
/**
 * Get project tree with sessions (first level expansion)
 */
export declare function getProjectTree(orgId: string, projectId: string, options?: {
    sessionLimit?: number;
}): Promise<ProjectTreeNode | null>;
/**
 * Expand a session to load its threads and runs
 */
export declare function expandSession(orgId: string, sessionId: string): Promise<SessionTreeNode | null>;
/**
 * Expand a run to load its events
 */
export declare function expandRun(orgId: string, taskId: string, limit?: number): Promise<RunTreeNode | null>;
/**
 * Get multiple project trees for dashboard view
 */
export declare function getProjectTrees(orgId: string, options?: {
    limit?: number;
    includeArchived?: boolean;
    favoriteOnly?: boolean;
}): Promise<ProjectTreeNode[]>;
/**
 * Get dashboard summary with project trees and recent activity
 */
export declare function getDashboardSummary(orgId: string, options?: {
    projectLimit?: number;
    sessionLimit?: number;
    includeArchived?: boolean;
}): Promise<{
    projects: ProjectTreeNode[];
    stats: {
        totalProjects: number;
        activeProjects: number;
        idleProjects: number;
        archivedProjects: number;
        projectsNeedingResponse: number;
        projectsWithErrors: number;
    };
}>;
//# sourceMappingURL=tree-service.d.ts.map