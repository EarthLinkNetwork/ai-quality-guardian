"use strict";
/**
 * Tree Service
 *
 * Service for building hierarchical tree structures for the log viewer UI.
 * Provides Project→Session→Thread→Run hierarchy with expand/collapse support.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProjectNode = buildProjectNode;
exports.buildSessionNode = buildSessionNode;
exports.buildLogEventNodes = buildLogEventNodes;
exports.getProjectTree = getProjectTree;
exports.expandSession = expandSession;
exports.expandRun = expandRun;
exports.getProjectTrees = getProjectTrees;
exports.getDashboardSummary = getDashboardSummary;
const projectIndexDAL = __importStar(require("../dal/project-index-dal"));
const sessionsDAL = __importStar(require("../dal/sessions"));
const taskEventsDAL = __importStar(require("../dal/task-events"));
/**
 * Build a project tree node from a ProjectIndex
 * Initial state: sessions not loaded (lazy loading)
 */
function buildProjectNode(project) {
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
function buildSessionNode(session) {
    const threads = session.threads.map((thread) => ({
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
function buildLogEventNodes(events) {
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
async function getProjectTree(orgId, projectId, options = {}) {
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
async function expandSession(orgId, sessionId) {
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
async function expandRun(orgId, taskId, limit = 100) {
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
async function getProjectTrees(orgId, options = {}) {
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
async function getDashboardSummary(orgId, options = {}) {
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
        }
        else if (lifecycle === "IDLE") {
            stats.idleProjects++;
        }
        else {
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
//# sourceMappingURL=tree-service.js.map