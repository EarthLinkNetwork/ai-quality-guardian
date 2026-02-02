/**
 * Tree Service
 *
 * Service for building hierarchical tree structures for the log viewer UI.
 * Provides Project→Session→Thread→Run hierarchy with expand/collapse support.
 */

import {
  ProjectTreeNode,
  SessionTreeNode,
  ThreadTreeNode,
  RunTreeNode,
  LogEventTreeNode,
  ProjectIndex,
  Session,
  TaskEvent,
} from "../dal/types";
import * as projectIndexDAL from "../dal/project-index-dal";
import * as sessionsDAL from "../dal/sessions";
import * as taskEventsDAL from "../dal/task-events";

/**
 * Build a project tree node from a ProjectIndex
 * Initial state: sessions not loaded (lazy loading)
 */
export function buildProjectNode(project: ProjectIndex): ProjectTreeNode {
  return {
    projectId: project.projectId,
    projectPath: project.projectPath,
    alias: project.alias,
    status: project.status,
    sessions: [], // Lazy loaded
  };
}

/**
 * Build a session tree node from a Session
 * Initial state: threads collapsed
 */
export function buildSessionNode(session: Session): SessionTreeNode {
  const threads: ThreadTreeNode[] = session.threads.map((thread) => ({
    threadId: thread.threadId,
    runs: thread.runs.map((run) => ({
      runId: run.runId,
      taskRunId: run.taskRunId,
      status: run.status,
      summary: `Run ${run.runId.substring(0, 8)}`,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      eventCount: run.taskCount,
      events: undefined, // Lazy loaded
      expanded: false,
    })),
    expanded: false,
  }));

  return {
    sessionId: session.sessionId,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    threads,
    expanded: false,
  };
}

/**
 * Build log event tree nodes from TaskEvents
 */
export function buildLogEventNodes(events: TaskEvent[]): LogEventTreeNode[] {
  return events.map((event) => ({
    eventId: `${event.PK}-${event.SK}`,
    type: event.type,
    timestamp: event.createdAt,
    message: event.message,
    level: event.level,
  }));
}

/**
 * Get project tree with sessions (first level expansion)
 */
export async function getProjectTree(
  orgId: string,
  projectId: string,
  options: { sessionLimit?: number } = {}
): Promise<ProjectTreeNode | null> {
  const { sessionLimit = 20 } = options;

  // Get project index
  const project = await projectIndexDAL.getProjectIndex(orgId, projectId);
  if (!project) {
    return null;
  }

  // Get sessions for this project
  const sessionsResult = await sessionsDAL.listSessionsByProject(orgId, project.projectPath, {
    limit: sessionLimit,
  });

  // Build tree
  const projectNode = buildProjectNode(project);
  projectNode.sessions = sessionsResult.items.map((session) => buildSessionNode(session));

  return projectNode;
}

/**
 * Expand a session to load its threads and runs
 */
export async function expandSession(
  orgId: string,
  sessionId: string
): Promise<SessionTreeNode | null> {
  const session = await sessionsDAL.getSession(orgId, sessionId);
  if (!session) {
    return null;
  }

  const sessionNode = buildSessionNode(session);
  sessionNode.expanded = true;

  // Mark all threads as expanded
  sessionNode.threads.forEach((thread) => {
    thread.expanded = true;
  });

  return sessionNode;
}

/**
 * Expand a run to load its events
 */
export async function expandRun(
  orgId: string,
  taskId: string,
  limit: number = 100
): Promise<RunTreeNode | null> {
  // Get task events for this run
  const taskEvents = await taskEventsDAL.getTaskEvents(orgId, taskId, { limit });

  if (taskEvents.length === 0) {
    return null;
  }

  // Build event nodes
  const events = buildLogEventNodes(taskEvents);

  // Return a partial RunTreeNode with events
  return {
    runId: "",
    taskRunId: taskId,
    status: "COMPLETE",
    summary: "",
    startedAt: taskEvents[0]?.createdAt || "",
    endedAt: taskEvents[taskEvents.length - 1]?.createdAt,
    eventCount: events.length,
    events,
    expanded: true,
  };
}

/**
 * Get multiple project trees for dashboard view
 */
export async function getProjectTrees(
  orgId: string,
  options: {
    limit?: number;
    includeArchived?: boolean;
    favoriteOnly?: boolean;
  } = {}
): Promise<ProjectTreeNode[]> {
  const { limit = 50, includeArchived = false, favoriteOnly = false } = options;

  // Get project indexes
  const result = await projectIndexDAL.listProjectIndexes(orgId, {
    limit,
    includeArchived,
    favoriteOnly,
  });

  // Build tree nodes (sessions not loaded yet - lazy loading)
  return result.items.map((project) => buildProjectNode(project));
}

/**
 * Get dashboard summary with project trees and recent activity
 */
export async function getDashboardSummary(
  orgId: string,
  options: {
    projectLimit?: number;
    sessionLimit?: number;
    includeArchived?: boolean;
  } = {}
): Promise<{
  projects: ProjectTreeNode[];
  stats: {
    totalProjects: number;
    activeProjects: number;
    idleProjects: number;
    archivedProjects: number;
    projectsNeedingResponse: number;
    projectsWithErrors: number;
  };
}> {
  const { projectLimit = 50, includeArchived = false } = options;

  // Get all project indexes including archived for stats
  const allProjects = await projectIndexDAL.listProjectIndexes(orgId, {
    limit: 1000,
    includeArchived: true,
  });

  // Calculate stats
  const stats = {
    totalProjects: allProjects.items.length,
    activeProjects: 0,
    idleProjects: 0,
    archivedProjects: 0,
    projectsNeedingResponse: 0,
    projectsWithErrors: 0,
  };

  for (const project of allProjects.items) {
    const lifecycle = projectIndexDAL.deriveLifecycleState(project);

    if (lifecycle === "ARCHIVED") {
      stats.archivedProjects++;
    } else if (lifecycle === "IDLE") {
      stats.idleProjects++;
    } else {
      stats.activeProjects++;
    }

    if (project.status === "needs_response") {
      stats.projectsNeedingResponse++;
    }
    if (project.status === "error") {
      stats.projectsWithErrors++;
    }
  }

  // Get filtered projects for display
  const displayProjects = await projectIndexDAL.listProjectIndexes(orgId, {
    limit: projectLimit,
    includeArchived,
  });

  // Build tree nodes
  const projects = displayProjects.items.map((project) => buildProjectNode(project));

  return {
    projects,
    stats,
  };
}
