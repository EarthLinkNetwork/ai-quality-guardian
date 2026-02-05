/**
 * Project Index Data Access Layer
 *
 * Manages project index entities for dashboard functionality.
 * Provides status derivation logic with priority: needs_response > error > running > idle
 */
import { ProjectIndex, ProjectIndexStatus, ProjectLifecycleState, CreateProjectIndexInput, UpdateProjectIndexInput, ListProjectIndexOptions, PaginatedResult, Task } from "./types";
/**
 * Determine lifecycle state from project index
 * Uses lastActivityAt (meaningful work), NOT lastSeenAt (UI interaction)
 */
export declare function deriveLifecycleState(project: ProjectIndex, idleThresholdDays?: number): ProjectLifecycleState;
/**
 * Derive project status from tasks
 * Priority: needs_response > error > running > idle
 */
export declare function deriveProjectStatus(tasks: Task[]): ProjectIndexStatus;
/**
 * Create a new project index
 */
export declare function createProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex>;
/**
 * Get project index by ID
 */
export declare function getProjectIndex(orgId: string, projectId: string): Promise<ProjectIndex | null>;
/**
 * Get project index by path using GSI
 */
export declare function getProjectIndexByPath(orgId: string, projectPath: string): Promise<ProjectIndex | null>;
/**
 * List project indexes with filtering and sorting
 */
export declare function listProjectIndexes(orgId: string, options?: ListProjectIndexOptions): Promise<PaginatedResult<ProjectIndex>>;
/**
 * Update project index
 */
export declare function updateProjectIndex(orgId: string, projectId: string, updates: UpdateProjectIndexInput): Promise<ProjectIndex>;
/**
 * Toggle favorite status
 */
export declare function toggleFavorite(orgId: string, projectId: string): Promise<ProjectIndex>;
/**
 * Archive project
 */
export declare function archiveProject(orgId: string, projectId: string): Promise<ProjectIndex>;
/**
 * Unarchive project
 */
export declare function unarchiveProject(orgId: string, projectId: string): Promise<ProjectIndex>;
/**
 * Delete project index
 */
export declare function deleteProjectIndex(orgId: string, projectId: string): Promise<void>;
/**
 * Get or create project index for a path
 */
export declare function getOrCreateProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex>;
/**
 * Increment session count for a project
 */
export declare function incrementSessionCount(orgId: string, projectId: string): Promise<ProjectIndex>;
/**
 * Update lastSeenAt when user views project in UI
 * Note: This does NOT affect lifecycle state (which uses lastActivityAt)
 */
export declare function updateProjectLastSeen(orgId: string, projectId: string): Promise<ProjectIndex>;
/**
 * Update task stats for a project
 */
export declare function updateProjectTaskStats(orgId: string, projectId: string, taskStats: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    awaiting: number;
}, status: ProjectIndexStatus): Promise<ProjectIndex>;
//# sourceMappingURL=project-index-dal.d.ts.map