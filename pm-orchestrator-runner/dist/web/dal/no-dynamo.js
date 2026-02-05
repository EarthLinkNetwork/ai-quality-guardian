"use strict";
/**
 * NoDynamo DAL - File-based data storage
 *
 * Provides a DynamoDB-compatible interface using local JSON files.
 * Supports all entity types from the DAL types.
 *
 * Storage structure:
 *   stateDir/
 *     projects/
 *       {projectId}.json
 *     sessions/
 *       {sessionId}.json
 *     runs/
 *       {runId}.json
 *     events/
 *       events-YYYY-MM-DD.jsonl
 *     inspection-packets/
 *       {packetId}.json
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
exports.NoDynamoDALWithConversations = exports.NoDynamoDAL = void 0;
exports.initNoDynamo = initNoDynamo;
exports.getNoDynamo = getNoDynamo;
exports.isNoDynamoInitialized = isNoDynamoInitialized;
exports.resetNoDynamo = resetNoDynamo;
exports.initNoDynamoExtended = initNoDynamoExtended;
exports.getNoDynamoExtended = getNoDynamoExtended;
exports.isNoDynamoExtendedInitialized = isNoDynamoExtendedInitialized;
exports.resetNoDynamoExtended = resetNoDynamoExtended;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const uuid_1 = require("uuid");
/**
 * Generate projectId from projectPath
 */
function generateProjectId(projectPath) {
    const hash = (0, crypto_1.createHash)("sha256")
        .update(projectPath)
        .digest("hex")
        .substring(0, 12);
    return "pidx_" + hash;
}
/**
 * Get current timestamp in ISO format
 */
function nowISO() {
    return new Date().toISOString();
}
/**
 * NoDynamo DAL class
 */
class NoDynamoDAL {
    stateDir;
    projectsDir;
    sessionsDir;
    runsDir;
    eventsDir;
    packetsDir;
    plansDir;
    orgId;
    constructor(config) {
        this.stateDir = config.stateDir;
        this.orgId = config.orgId || "default";
        this.projectsDir = path.join(this.stateDir, "projects");
        this.sessionsDir = path.join(this.stateDir, "sessions");
        this.runsDir = path.join(this.stateDir, "runs");
        this.eventsDir = path.join(this.stateDir, "events");
        this.packetsDir = path.join(this.stateDir, "inspection-packets");
        this.plansDir = path.join(this.stateDir, "plans");
        this.ensureDirectories();
    }
    /**
     * Ensure all required directories exist
     */
    ensureDirectories() {
        const dirs = [
            this.projectsDir,
            this.sessionsDir,
            this.runsDir,
            this.eventsDir,
            this.packetsDir,
            this.plansDir,
        ];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }
    // ==================== Project Index ====================
    /**
     * Create a new project index
     */
    async createProjectIndex(input) {
        const projectId = generateProjectId(input.projectPath);
        const now = nowISO();
        const project = {
            PK: "ORG#" + input.orgId,
            SK: "PIDX#" + projectId,
            projectId,
            orgId: input.orgId,
            projectPath: input.projectPath,
            alias: input.alias,
            tags: input.tags || [],
            favorite: false,
            archived: false,
            status: "idle",
            lastActivityAt: now,
            sessionCount: 0,
            taskStats: {
                total: 0,
                completed: 0,
                failed: 0,
                running: 0,
                awaiting: 0,
            },
            createdAt: now,
            updatedAt: now,
        };
        // Add projectType if provided
        if (input.projectType) {
            project.projectType = input.projectType;
        }
        const filePath = path.join(this.projectsDir, projectId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    }
    /**
     * Get project index by ID
     */
    async getProjectIndex(projectId) {
        const filePath = path.join(this.projectsDir, projectId + ".json");
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        return JSON.parse(content);
    }
    /**
     * Get project index by path
     */
    async getProjectIndexByPath(projectPath) {
        const projectId = generateProjectId(projectPath);
        return this.getProjectIndex(projectId);
    }
    /**
     * List all project indexes
     */
    async listProjectIndexes(options = {}) {
        const files = fs.readdirSync(this.projectsDir).filter((f) => f.endsWith(".json"));
        let projects = [];
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(this.projectsDir, file), "utf-8");
            projects.push(JSON.parse(content));
        }
        // Apply filters
        if (!options.includeArchived) {
            projects = projects.filter((p) => !p.archived);
        }
        if (options.status) {
            projects = projects.filter((p) => p.status === options.status);
        }
        if (options.favoriteOnly) {
            projects = projects.filter((p) => p.favorite);
        }
        if (options.tags && options.tags.length > 0) {
            projects = projects.filter((p) => options.tags.some((tag) => p.tags.includes(tag)));
        }
        // Sort: favorites first, then by updatedAt
        projects.sort((a, b) => {
            if (a.favorite && !b.favorite)
                return -1;
            if (!a.favorite && b.favorite)
                return 1;
            return b.updatedAt.localeCompare(a.updatedAt);
        });
        // Pagination
        const limit = options.limit || 50;
        const items = projects.slice(0, limit);
        return {
            items,
            nextCursor: projects.length > limit ? String(limit) : undefined,
        };
    }
    /**
     * Update project index
     */
    async updateProjectIndex(projectId, updates) {
        const project = await this.getProjectIndex(projectId);
        if (!project) {
            return null;
        }
        const updated = {
            ...project,
            ...updates,
            updatedAt: nowISO(),
        };
        const filePath = path.join(this.projectsDir, projectId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
        return updated;
    }
    /**
     * Archive project
     */
    async archiveProject(projectId) {
        const project = await this.getProjectIndex(projectId);
        if (!project)
            return null;
        project.archived = true;
        project.archivedAt = nowISO();
        project.updatedAt = nowISO();
        const filePath = path.join(this.projectsDir, projectId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    }
    /**
     * Unarchive project
     */
    async unarchiveProject(projectId) {
        const project = await this.getProjectIndex(projectId);
        if (!project)
            return null;
        project.archived = false;
        project.archivedAt = undefined;
        project.updatedAt = nowISO();
        const filePath = path.join(this.projectsDir, projectId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(project, null, 2));
        return project;
    }
    /**
     * Get or create project index
     */
    async getOrCreateProjectIndex(input) {
        const existing = await this.getProjectIndexByPath(input.projectPath);
        if (existing) {
            return existing;
        }
        return this.createProjectIndex(input);
    }
    // ==================== Sessions ====================
    /**
     * Create a new session
     */
    async createSession(input) {
        const sessionId = input.sessionId || "sess_" + (0, uuid_1.v4)();
        const now = nowISO();
        const session = {
            PK: "ORG#" + input.orgId,
            SK: "SESSION#" + sessionId,
            sessionId,
            orgId: input.orgId,
            projectPath: input.projectPath,
            projectId: input.projectId,
            startedAt: now,
            threads: [],
            totalRuns: 0,
            totalTasks: 0,
            status: "active",
            createdAt: now,
            updatedAt: now,
            ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days
        };
        const filePath = path.join(this.sessionsDir, sessionId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(session, null, 2));
        return session;
    }
    /**
     * Get session by ID
     */
    async getSession(sessionId) {
        const filePath = path.join(this.sessionsDir, sessionId + ".json");
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        return JSON.parse(content);
    }
    /**
     * List sessions for a project
     */
    async listSessions(projectId) {
        const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json"));
        const sessions = [];
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(this.sessionsDir, file), "utf-8");
            const session = JSON.parse(content);
            if (!projectId || session.projectId === projectId) {
                sessions.push(session);
            }
        }
        // Sort by startedAt descending
        sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        return sessions;
    }
    /**
     * Update session
     */
    async updateSession(sessionId, updates) {
        const session = await this.getSession(sessionId);
        if (!session) {
            return null;
        }
        const updated = {
            ...session,
            ...updates,
            updatedAt: nowISO(),
        };
        const filePath = path.join(this.sessionsDir, sessionId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
        return updated;
    }
    /**
     * End session
     */
    async endSession(sessionId) {
        return this.updateSession(sessionId, {
            status: "ended",
            endedAt: nowISO(),
        });
    }
    // ==================== Runs ====================
    /**
     * Create a new run
     */
    async createRun(input) {
        const runId = "run_" + (0, uuid_1.v4)();
        const now = nowISO();
        const run = {
            runId,
            sessionId: input.sessionId,
            projectId: input.projectId || "",
            threadId: input.threadId,
            taskRunId: input.taskRunId,
            status: "CREATED",
            prompt: input.prompt,
            startedAt: now,
            eventCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        const filePath = path.join(this.runsDir, runId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(run, null, 2));
        return run;
    }
    /**
     * Get run by ID
     */
    async getRun(runId) {
        const filePath = path.join(this.runsDir, runId + ".json");
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        return JSON.parse(content);
    }
    /**
     * List runs for a session
     */
    async listRuns(sessionId) {
        const files = fs.readdirSync(this.runsDir).filter((f) => f.endsWith(".json"));
        const runs = [];
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(this.runsDir, file), "utf-8");
            const run = JSON.parse(content);
            if (!sessionId || run.sessionId === sessionId) {
                runs.push(run);
            }
        }
        // Sort by startedAt descending
        runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        return runs;
    }
    /**
     * Update run
     */
    async updateRun(runId, updates) {
        const run = await this.getRun(runId);
        if (!run) {
            return null;
        }
        const updated = {
            ...run,
            ...updates,
            updatedAt: nowISO(),
        };
        const filePath = path.join(this.runsDir, runId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
        return updated;
    }
    // ==================== Events ====================
    /**
     * Record an event
     */
    async recordEvent(input) {
        const eventId = "evt_" + (0, uuid_1.v4)();
        const now = nowISO();
        const event = {
            eventId,
            runId: input.runId,
            sessionId: input.sessionId,
            projectId: input.projectId,
            type: input.type,
            timestamp: now,
            message: input.message,
            level: input.level || "info",
            payload: input.payload,
            actor: input.actor || "system",
            correlationId: input.correlationId,
        };
        // Append to daily events file
        const date = now.slice(0, 10);
        const filePath = path.join(this.eventsDir, "events-" + date + ".jsonl");
        await fs.promises.appendFile(filePath, JSON.stringify(event) + "\n");
        return event;
    }
    /**
     * List events for a run
     */
    async listEvents(runId) {
        const files = fs
            .readdirSync(this.eventsDir)
            .filter((f) => f.startsWith("events-") && f.endsWith(".jsonl"))
            .sort()
            .reverse();
        const events = [];
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(this.eventsDir, file), "utf-8");
            const lines = content.trim().split("\n").filter((l) => l.length > 0);
            for (const line of lines) {
                try {
                    const event = JSON.parse(line);
                    if (!runId || event.runId === runId) {
                        events.push(event);
                    }
                }
                catch {
                    // Skip malformed lines
                }
            }
        }
        // Sort by timestamp descending
        events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return events;
    }
    // ==================== Activity Events ====================
    /**
     * Create activity event
     */
    async createActivityEvent(input) {
        const id = "act_" + (0, uuid_1.v4)();
        const now = nowISO();
        const event = {
            PK: "ORG#" + input.orgId,
            SK: "ACT#" + now + "#" + id,
            id,
            orgId: input.orgId,
            type: input.type,
            timestamp: now,
            projectId: input.projectId,
            projectPath: input.projectPath,
            projectAlias: input.projectAlias,
            sessionId: input.sessionId,
            taskId: input.taskId,
            summary: input.summary,
            importance: input.importance || "normal",
            details: input.details || {},
            ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
        };
        // Store in events file
        const date = now.slice(0, 10);
        const filePath = path.join(this.eventsDir, "activity-" + date + ".jsonl");
        await fs.promises.appendFile(filePath, JSON.stringify(event) + "\n");
        return event;
    }
    /**
     * List activity events
     */
    async listActivityEvents(options = {}) {
        const files = fs
            .readdirSync(this.eventsDir)
            .filter((f) => f.startsWith("activity-") && f.endsWith(".jsonl"))
            .sort()
            .reverse();
        let events = [];
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(this.eventsDir, file), "utf-8");
            const lines = content.trim().split("\n").filter((l) => l.length > 0);
            for (const line of lines) {
                try {
                    events.push(JSON.parse(line));
                }
                catch {
                    // Skip malformed
                }
            }
        }
        // Apply filters
        if (options.projectId) {
            events = events.filter((e) => e.projectId === options.projectId);
        }
        if (options.types && options.types.length > 0) {
            events = events.filter((e) => options.types.includes(e.type));
        }
        if (options.importance) {
            events = events.filter((e) => e.importance === options.importance);
        }
        if (options.since) {
            events = events.filter((e) => e.timestamp >= options.since);
        }
        // Sort by timestamp descending
        events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        // Pagination
        const limit = options.limit || 50;
        const items = events.slice(0, limit);
        return {
            items,
            nextCursor: events.length > limit ? String(limit) : undefined,
        };
    }
    // ==================== Inspection Packets ====================
    /**
     * Generate inspection packet for a run
     */
    async generateInspectionPacket(input) {
        const run = await this.getRun(input.runId);
        if (!run) {
            throw new Error("Run not found: " + input.runId);
        }
        const events = await this.listEvents(input.runId);
        const project = run.projectId
            ? await this.getProjectIndex(run.projectId)
            : null;
        const packetId = "pkt_" + (0, uuid_1.v4)();
        const now = nowISO();
        const packet = {
            packetId,
            version: "1.0",
            type: "task",
            generatedAt: now,
            runId: run.runId,
            sessionId: run.sessionId,
            projectId: run.projectId,
            task: {
                taskId: run.taskRunId,
                title: run.summary || "Untitled Task",
                prompt: run.prompt || "",
                state: run.status,
                createdAt: run.createdAt,
                startedAt: run.startedAt,
                endedAt: run.endedAt,
            },
            project: project
                ? {
                    projectId: project.projectId,
                    name: project.alias || path.basename(project.projectPath),
                    projectPath: project.projectPath,
                }
                : undefined,
            events: events.map((e) => ({
                timestamp: e.timestamp,
                type: e.type,
                message: e.message,
                actor: e.actor || "system",
                payload: e.payload,
            })),
            logs: events
                .filter((e) => e.type === "LOG_BATCH" || e.type === "PROGRESS")
                .map((e) => ({
                timestamp: e.timestamp,
                stream: "stdout",
                line: e.message,
            })),
            meta: {
                orgId: this.orgId,
                generatedBy: input.generatedBy,
                correlationId: events[0]?.correlationId,
            },
        };
        // Save packet
        const filePath = path.join(this.packetsDir, packetId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(packet, null, 2));
        return packet;
    }
    /**
     * Get inspection packet by ID
     */
    async getInspectionPacket(packetId) {
        const filePath = path.join(this.packetsDir, packetId + ".json");
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        return JSON.parse(content);
    }
    /**
     * List inspection packets
     */
    async listInspectionPackets(runId) {
        const files = fs
            .readdirSync(this.packetsDir)
            .filter((f) => f.endsWith(".json"));
        const packets = [];
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(this.packetsDir, file), "utf-8");
            const packet = JSON.parse(content);
            if (!runId || packet.runId === runId) {
                packets.push(packet);
            }
        }
        // Sort by generatedAt descending
        packets.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
        return packets;
    }
    /**
     * Format inspection packet as markdown
     */
    formatPacketAsMarkdown(packet) {
        const lines = [];
        lines.push("# Task Inspection: " + (packet.task?.title || "Unknown"));
        lines.push("");
        lines.push("**Status:** " + (packet.task?.state || "Unknown"));
        lines.push("**Created:** " + (packet.task?.createdAt ? new Date(packet.task.createdAt).toLocaleString() : "Unknown"));
        if (packet.task?.startedAt && packet.task?.endedAt) {
            const durationMs = new Date(packet.task.endedAt).getTime() -
                new Date(packet.task.startedAt).getTime();
            lines.push("**Duration:** " + Math.round(durationMs / 1000) + " seconds");
        }
        lines.push("");
        if (packet.task?.prompt) {
            lines.push("## Prompt");
            lines.push("");
            lines.push(packet.task.prompt);
            lines.push("");
        }
        if (packet.events.length > 0) {
            lines.push("## Timeline");
            lines.push("");
            lines.push("| Time | Event | Details |");
            lines.push("|------|-------|---------|");
            for (const event of packet.events.slice(0, 50)) {
                const time = new Date(event.timestamp).toLocaleTimeString();
                lines.push("| " + time + " | " + event.type + " | " + event.message.slice(0, 50) + " |");
            }
            lines.push("");
        }
        if (packet.logs.length > 0) {
            lines.push("## Logs (Last 50 lines)");
            lines.push("");
            lines.push("```");
            for (const log of packet.logs.slice(-50)) {
                const time = new Date(log.timestamp).toLocaleTimeString();
                lines.push("[" + time + "] " + log.line);
            }
            lines.push("```");
        }
        return lines.join("\n");
    }
    /**
     * Format inspection packet for clipboard (ChatGPT-ready)
     */
    formatPacketForClipboard(packet) {
        const lines = [];
        lines.push('<inspection type="' + packet.type + '" id="' + packet.packetId + '">');
        lines.push("<context>");
        if (packet.project) {
            lines.push("Project: " + packet.project.name);
        }
        lines.push("Task: " + (packet.task?.title || "Unknown"));
        lines.push("Status: " + (packet.task?.state || "Unknown"));
        if (packet.task?.error) {
            lines.push("Error: " + packet.task.error);
        }
        lines.push("</context>");
        lines.push("");
        if (packet.logs.length > 0) {
            lines.push('<logs last="' + Math.min(packet.logs.length, 50) + '">');
            for (const log of packet.logs.slice(-50)) {
                const time = new Date(log.timestamp).toLocaleTimeString();
                lines.push("[" + time + "] " + log.line);
            }
            lines.push("</logs>");
            lines.push("");
        }
        lines.push("<question>");
        lines.push("Analyze this task execution and provide insights.");
        lines.push("</question>");
        lines.push("</inspection>");
        return lines.join("\n");
    }
    // ==================== Plans ====================
    /**
     * Create a new plan
     */
    async createPlan(input) {
        const planId = "plan_" + (0, uuid_1.v4)();
        const now = nowISO();
        const tasks = input.tasks.map((t, index) => ({
            taskId: "task_" + (0, uuid_1.v4)(),
            description: t.description,
            priority: t.priority ?? index,
            dependencies: t.dependencies ?? [],
            status: "CREATED",
        }));
        const plan = {
            PK: "ORG#" + input.orgId,
            SK: "PLAN#" + planId,
            planId,
            projectId: input.projectId,
            orgId: input.orgId,
            runId: input.runId,
            packetId: input.packetId,
            status: "DRAFT",
            tasks,
            createdAt: now,
            updatedAt: now,
        };
        const filePath = path.join(this.plansDir, planId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(plan, null, 2));
        return plan;
    }
    /**
     * Get plan by ID
     */
    async getPlan(planId) {
        const filePath = path.join(this.plansDir, planId + ".json");
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        return JSON.parse(content);
    }
    /**
     * Update plan
     */
    async updatePlan(planId, updates) {
        const plan = await this.getPlan(planId);
        if (!plan) {
            return null;
        }
        const updated = {
            ...plan,
            ...updates,
            updatedAt: nowISO(),
        };
        const filePath = path.join(this.plansDir, planId + ".json");
        await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
        return updated;
    }
    /**
     * List plans, optionally filtered by project
     */
    async listPlans(projectId) {
        if (!fs.existsSync(this.plansDir)) {
            return [];
        }
        const files = fs.readdirSync(this.plansDir).filter((f) => f.endsWith(".json"));
        const plans = [];
        for (const file of files) {
            const content = await fs.promises.readFile(path.join(this.plansDir, file), "utf-8");
            const plan = JSON.parse(content);
            if (!projectId || plan.projectId === projectId) {
                plans.push(plan);
            }
        }
        // Sort by createdAt descending
        plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return plans;
    }
    /**
     * Get the latest plan for a project
     */
    async getLatestPlanForProject(projectId) {
        const plans = await this.listPlans(projectId);
        return plans.length > 0 ? plans[0] : null;
    }
    // ==================== Utility ====================
    /**
     * Clear all data (for testing)
     */
    async clearAll() {
        const dirs = [
            this.projectsDir,
            this.sessionsDir,
            this.runsDir,
            this.eventsDir,
            this.packetsDir,
            this.plansDir,
        ];
        for (const dir of dirs) {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    await fs.promises.unlink(path.join(dir, file));
                }
            }
        }
    }
    /**
     * Get stats
     */
    async getStats() {
        const projectCount = fs.existsSync(this.projectsDir)
            ? fs.readdirSync(this.projectsDir).filter((f) => f.endsWith(".json")).length
            : 0;
        const sessionCount = fs.existsSync(this.sessionsDir)
            ? fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json")).length
            : 0;
        const runCount = fs.existsSync(this.runsDir)
            ? fs.readdirSync(this.runsDir).filter((f) => f.endsWith(".json")).length
            : 0;
        const eventFiles = fs.existsSync(this.eventsDir)
            ? fs.readdirSync(this.eventsDir).filter((f) => f.endsWith(".jsonl"))
            : [];
        let eventCount = 0;
        for (const file of eventFiles) {
            const content = fs.readFileSync(path.join(this.eventsDir, file), "utf-8");
            eventCount += content.trim().split("\n").filter((l) => l.length > 0).length;
        }
        const packetCount = fs.existsSync(this.packetsDir)
            ? fs.readdirSync(this.packetsDir).filter((f) => f.endsWith(".json")).length
            : 0;
        const planCount = fs.existsSync(this.plansDir)
            ? fs.readdirSync(this.plansDir).filter((f) => f.endsWith(".json")).length
            : 0;
        return {
            projects: projectCount,
            sessions: sessionCount,
            runs: runCount,
            events: eventCount,
            packets: packetCount,
            plans: planCount,
        };
    }
}
exports.NoDynamoDAL = NoDynamoDAL;
/**
 * Global NoDynamo DAL instance
 */
let globalNoDynamo = null;
/**
 * Initialize global NoDynamo DAL
 */
function initNoDynamo(stateDir, orgId) {
    if (!globalNoDynamo) {
        globalNoDynamo = new NoDynamoDAL({ stateDir, orgId });
    }
    return globalNoDynamo;
}
/**
 * Get global NoDynamo DAL
 */
function getNoDynamo() {
    if (!globalNoDynamo) {
        throw new Error("NoDynamo not initialized. Call initNoDynamo() first.");
    }
    return globalNoDynamo;
}
/**
 * Check if NoDynamo is initialized
 */
function isNoDynamoInitialized() {
    return globalNoDynamo !== null;
}
/**
 * Reset global NoDynamo (for testing)
 */
function resetNoDynamo() {
    globalNoDynamo = null;
}
// ==================== Conversation Messages ====================
// Added as extension to NoDynamoDAL for MVP Chat Feature
/**
 * Extended NoDynamo DAL with conversation support
 */
class NoDynamoDALWithConversations extends NoDynamoDAL {
    conversationsDir;
    constructor(config) {
        super(config);
        this.conversationsDir = path.join(config.stateDir, "conversations");
        if (!fs.existsSync(this.conversationsDir)) {
            fs.mkdirSync(this.conversationsDir, { recursive: true });
        }
    }
    /**
     * Create a new conversation message
     */
    async createConversationMessage(input) {
        const messageId = "msg_" + (0, uuid_1.v4)();
        const now = nowISO();
        const message = {
            messageId,
            projectId: input.projectId,
            runId: input.runId,
            role: input.role,
            content: input.content,
            status: input.status || "pending",
            timestamp: now,
            metadata: input.metadata,
        };
        // Append to project conversation file (JSONL format)
        const filePath = path.join(this.conversationsDir, input.projectId + ".jsonl");
        await fs.promises.appendFile(filePath, JSON.stringify(message) + "\n");
        return message;
    }
    /**
     * List conversation messages for a project
     */
    async listConversationMessages(projectId, limit) {
        const filePath = path.join(this.conversationsDir, projectId + ".jsonl");
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        const lines = content.trim().split("\n").filter((l) => l.length > 0);
        let messages = [];
        for (const line of lines) {
            try {
                messages.push(JSON.parse(line));
            }
            catch {
                // Skip malformed lines
            }
        }
        // Sort by timestamp ascending (oldest first)
        messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        // Apply limit if specified
        if (limit && limit > 0) {
            messages = messages.slice(-limit);
        }
        return messages;
    }
    /**
     * Get conversation message by ID
     */
    async getConversationMessage(projectId, messageId) {
        const messages = await this.listConversationMessages(projectId);
        return messages.find((m) => m.messageId === messageId) || null;
    }
    /**
     * Update conversation message
     * Note: This rewrites the entire file (not efficient for large files)
     */
    async updateConversationMessage(projectId, messageId, updates) {
        const filePath = path.join(this.conversationsDir, projectId + ".jsonl");
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        const lines = content.trim().split("\n").filter((l) => l.length > 0);
        let found = false;
        let updatedMessage = null;
        const newLines = [];
        for (const line of lines) {
            try {
                const msg = JSON.parse(line);
                if (msg.messageId === messageId) {
                    found = true;
                    updatedMessage = {
                        ...msg,
                        ...updates,
                        metadata: updates.metadata
                            ? { ...msg.metadata, ...updates.metadata }
                            : msg.metadata,
                    };
                    newLines.push(JSON.stringify(updatedMessage));
                }
                else {
                    newLines.push(line);
                }
            }
            catch {
                newLines.push(line);
            }
        }
        if (!found) {
            return null;
        }
        await fs.promises.writeFile(filePath, newLines.join("\n") + "\n");
        return updatedMessage;
    }
    /**
     * Get latest AWAITING_RESPONSE message for a project
     */
    async getAwaitingResponseMessage(projectId) {
        const messages = await this.listConversationMessages(projectId);
        // Find the latest awaiting_response message
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].status === "awaiting_response") {
                return messages[i];
            }
        }
        return null;
    }
    /**
     * Clear conversation history for a project
     */
    async clearConversationHistory(projectId) {
        const filePath = path.join(this.conversationsDir, projectId + ".jsonl");
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    }
}
exports.NoDynamoDALWithConversations = NoDynamoDALWithConversations;
/**
 * Global extended NoDynamo DAL instance
 */
let globalNoDynamoExtended = null;
/**
 * Initialize global extended NoDynamo DAL
 */
function initNoDynamoExtended(stateDir, orgId) {
    if (!globalNoDynamoExtended) {
        globalNoDynamoExtended = new NoDynamoDALWithConversations({
            stateDir,
            orgId,
        });
    }
    return globalNoDynamoExtended;
}
/**
 * Get global extended NoDynamo DAL
 */
function getNoDynamoExtended() {
    if (!globalNoDynamoExtended) {
        throw new Error("NoDynamoExtended not initialized. Call initNoDynamoExtended() first.");
    }
    return globalNoDynamoExtended;
}
/**
 * Check if extended NoDynamo is initialized
 */
function isNoDynamoExtendedInitialized() {
    return globalNoDynamoExtended !== null;
}
/**
 * Reset global extended NoDynamo (for testing)
 */
function resetNoDynamoExtended() {
    globalNoDynamoExtended = null;
}
//# sourceMappingURL=no-dynamo.js.map