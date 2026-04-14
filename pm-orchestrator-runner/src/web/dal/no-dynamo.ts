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

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  ProjectIndex,
  ProjectIndexStatus,
  CreateProjectIndexInput,
  UpdateProjectIndexInput,
  ListProjectIndexOptions,
  PaginatedResult,
  Session,
  SessionStatus,
  CreateSessionInput,
  ActivityEvent,
  CreateActivityEventInput,
  ListActivityEventsOptions,
  TaskState,
  LogLevel,
  TaskEventType,
  ConversationMessage,
  CreateConversationMessageInput,
  UpdateConversationMessageInput,
  ConversationMessageStatus,
  ProjectType,
  Plan,
  PlanStatus,
  PlanTask,
  CreatePlanInput,
  UpdatePlanInput,
  PluginDefinition,
} from "./types";
import type { IDataAccessLayer } from "./dal-interface";
import { OptimisticLockError } from "./utils";
import type {
  PRReviewState,
  PRReviewComment,
  PRReviewCycle,
  PRReviewStatus,
  CommentJudgment,
  CreatePRReviewStateInput,
  UpdatePRReviewStateInput,
} from "./pr-review-types";

/**
 * Run entity for NoDynamo storage
 */
export interface NoDynamoRun {
  runId: string;
  sessionId: string;
  projectId: string;
  threadId?: string;
  taskRunId: string;
  status: TaskState;
  prompt?: string;
  summary?: string;
  startedAt: string;
  endedAt?: string;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Event entity for NoDynamo storage
 */
export interface NoDynamoEvent {
  eventId: string;
  runId: string;
  sessionId?: string;
  projectId?: string;
  type: TaskEventType;
  timestamp: string;
  message: string;
  level: LogLevel;
  payload?: Record<string, unknown>;
  actor?: string;
  correlationId?: string;
}

/**
 * Inspection Packet entity
 */
export interface InspectionPacket {
  packetId: string;
  version: "1.0";
  type: "task" | "session" | "audit";
  generatedAt: string;
  runId?: string;
  sessionId?: string;
  projectId?: string;
  task?: {
    taskId: string;
    title: string;
    prompt: string;
    state: TaskState;
    createdAt: string;
    startedAt?: string;
    endedAt?: string;
    result?: string;
    error?: string;
  };
  project?: {
    projectId: string;
    name: string;
    projectPath?: string;
  };
  events: Array<{
    timestamp: string;
    type: string;
    message: string;
    actor: string;
    payload?: Record<string, unknown>;
  }>;
  logs: Array<{
    timestamp: string;
    stream: "stdout" | "stderr" | "system";
    line: string;
  }>;
  settings?: {
    model?: string;
    provider?: string;
    maxTokens?: number;
    temperature?: number;
  };
  clarifications?: Array<{
    question: string;
    response: string;
    askedAt: string;
    respondedAt: string;
  }>;
  meta: {
    correlationId?: string;
    orgId: string;
    generatedBy: string;
  };
}

/**
 * NoDynamo configuration
 */
export interface NoDynamoConfig {
  stateDir: string;
  orgId?: string;
}

/**
 * Generate projectId from projectPath
 */
function generateProjectId(projectPath: string): string {
  const hash = createHash("sha256")
    .update(projectPath)
    .digest("hex")
    .substring(0, 12);
  return "pidx_" + hash;
}

/**
 * Get current timestamp in ISO format
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * NoDynamo DAL class
 */
export class NoDynamoDAL {
  private readonly stateDir: string;
  private readonly projectsDir: string;
  private readonly sessionsDir: string;
  private readonly runsDir: string;
  private readonly eventsDir: string;
  private readonly packetsDir: string;
  private readonly plansDir: string;
  private readonly orgId: string;

  constructor(config: NoDynamoConfig) {
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
  private ensureDirectories(): void {
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
  async createProjectIndex(
    input: CreateProjectIndexInput
  ): Promise<ProjectIndex> {
    const projectId = generateProjectId(input.projectPath);
    const now = nowISO();

    const project: ProjectIndex = {
      PK: "ORG#" + input.orgId,
      SK: "PIDX#" + projectId,
      projectId,
      orgId: input.orgId,
      projectPath: input.projectPath,
      alias: input.alias,
      description: input.description,
      notes: input.notes,
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
    } as ProjectIndex;

    // Add projectType if provided
    if (input.projectType) {
      project.projectType = input.projectType;
    }

    // Add AI model/provider if provided
    if (input.aiModel) {
      project.aiModel = input.aiModel;
    }
    if (input.aiProvider) {
      project.aiProvider = input.aiProvider;
    }

    const filePath = path.join(this.projectsDir, projectId + ".json");
    await fs.promises.writeFile(filePath, JSON.stringify(project, null, 2));

    return project;
  }

  /**
   * Get project index by ID
   */
  async getProjectIndex(projectId: string): Promise<ProjectIndex | null> {
    const filePath = path.join(this.projectsDir, projectId + ".json");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    const project = JSON.parse(content) as ProjectIndex;

    // Note: getProjectIndex does NOT filter by orgId.
    // Tenant isolation is enforced at list level (listProjectIndexes uses options.orgId).
    // Individual access by projectId is safe because projectId is globally unique (SHA256 hash).
    return project;
  }

  /**
   * Get project index by path
   */
  async getProjectIndexByPath(projectPath: string): Promise<ProjectIndex | null> {
    const projectId = generateProjectId(projectPath);
    return this.getProjectIndex(projectId);
  }

  /**
   * List all project indexes
   */
  async listProjectIndexes(
    options: ListProjectIndexOptions = {}
  ): Promise<PaginatedResult<ProjectIndex>> {
    const files = fs.readdirSync(this.projectsDir).filter((f) => f.endsWith(".json"));
    let projects: ProjectIndex[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.projectsDir, file),
        "utf-8"
      );
      projects.push(JSON.parse(content) as ProjectIndex);
    }

    // Apply org isolation: use options.orgId if provided, otherwise fall back to this.orgId
    const effectiveOrgId = options.orgId || this.orgId;
    if (effectiveOrgId) {
      projects = projects.filter((p) => !p.orgId || p.orgId === effectiveOrgId);
    }

    // Apply filters
    if (!options.includeArchived) {
      projects = projects.filter((p) => !p.archived);
    }
    if (options.status) {
      projects = projects.filter((p) => p.status === options.status);
    }
    if (options.projectStatus) {
      projects = projects.filter((p) => (p.projectStatus || 'active') === options.projectStatus);
    }
    if (options.favoriteOnly) {
      projects = projects.filter((p) => p.favorite);
    }
    if (options.tags && options.tags.length > 0) {
      projects = projects.filter((p) =>
        options.tags!.some((tag) => p.tags.includes(tag))
      );
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      projects = projects.filter((p) => {
        const name = (p.alias || p.projectPath || '').toLowerCase();
        const pathStr = (p.projectPath || '').toLowerCase();
        const tagStr = (p.tags || []).join(' ').toLowerCase();
        const descStr = (p.description || '').toLowerCase();
        const notesStr = (p.notes || '').toLowerCase();
        return name.includes(q) || pathStr.includes(q) || tagStr.includes(q) || descStr.includes(q) || notesStr.includes(q);
      });
    }

    // Sort
    const sortField = options.sortBy || 'updatedAt';
    const sortDir = options.sortDirection || 'desc';
    projects.sort((a, b) => {
      // Favorites always first regardless of sort
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;

      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = (a.alias || a.projectPath).localeCompare(b.alias || b.projectPath);
          break;
        case 'createdAt':
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case 'lastActivityAt':
          cmp = a.lastActivityAt.localeCompare(b.lastActivityAt);
          break;
        case 'updatedAt':
        default:
          cmp = a.updatedAt.localeCompare(b.updatedAt);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
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
  async updateProjectIndex(
    projectId: string,
    updates: UpdateProjectIndexInput
  ): Promise<ProjectIndex | null> {
    const project = await this.getProjectIndex(projectId);
    if (!project) {
      return null;
    }

    const updated: ProjectIndex = {
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
  async archiveProject(projectId: string): Promise<ProjectIndex | null> {
    const project = await this.getProjectIndex(projectId);
    if (!project) return null;
    
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
  async unarchiveProject(projectId: string): Promise<ProjectIndex | null> {
    const project = await this.getProjectIndex(projectId);
    if (!project) return null;
    
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
  async getOrCreateProjectIndex(
    input: CreateProjectIndexInput
  ): Promise<ProjectIndex> {
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
  async createSession(input: CreateSessionInput): Promise<Session> {
    const sessionId = input.sessionId || "sess_" + uuidv4();
    const now = nowISO();

    const session: Session = {
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
  async getSession(sessionId: string): Promise<Session | null> {
    const filePath = path.join(this.sessionsDir, sessionId + ".json");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as Session;
  }

  /**
   * List sessions for a project
   */
  async listSessions(projectId?: string): Promise<Session[]> {
    const files = fs.readdirSync(this.sessionsDir).filter((f) => f.endsWith(".json"));
    const sessions: Session[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.sessionsDir, file),
        "utf-8"
      );
      const session = JSON.parse(content) as Session;
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
  async updateSession(
    sessionId: string,
    updates: Partial<Session>
  ): Promise<Session | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const updated: Session = {
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
  async endSession(sessionId: string): Promise<Session | null> {
    return this.updateSession(sessionId, {
      status: "ended",
      endedAt: nowISO(),
    });
  }

  // ==================== Runs ====================

  /**
   * Create a new run
   */
  async createRun(input: {
    sessionId: string;
    projectId?: string;
    threadId?: string;
    taskRunId: string;
    prompt?: string;
  }): Promise<NoDynamoRun> {
    const runId = "run_" + uuidv4();
    const now = nowISO();

    const run: NoDynamoRun = {
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
  async getRun(runId: string): Promise<NoDynamoRun | null> {
    const filePath = path.join(this.runsDir, runId + ".json");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as NoDynamoRun;
  }

  /**
   * List runs for a session
   */
  async listRuns(sessionId?: string): Promise<NoDynamoRun[]> {
    const files = fs.readdirSync(this.runsDir).filter((f) => f.endsWith(".json"));
    const runs: NoDynamoRun[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.runsDir, file),
        "utf-8"
      );
      const run = JSON.parse(content) as NoDynamoRun;
      if (!sessionId || run.sessionId === sessionId) {
        runs.push(run);
      }
    }

    // Sort by startedAt descending
    runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    return runs;
  }

  /**
   * Find run by taskRunId
   */
  async findRunByTaskRunId(taskRunId: string): Promise<NoDynamoRun | null> {
    const runs = await this.listRuns();
    return runs.find((r) => r.taskRunId === taskRunId) || null;
  }

  /**
   * Update run
   */
  async updateRun(
    runId: string,
    updates: Partial<NoDynamoRun>
  ): Promise<NoDynamoRun | null> {
    const run = await this.getRun(runId);
    if (!run) {
      return null;
    }

    const updated: NoDynamoRun = {
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
  async recordEvent(input: {
    runId: string;
    sessionId?: string;
    projectId?: string;
    type: TaskEventType;
    message: string;
    level?: LogLevel;
    payload?: Record<string, unknown>;
    actor?: string;
    correlationId?: string;
  }): Promise<NoDynamoEvent> {
    const eventId = "evt_" + uuidv4();
    const now = nowISO();

    const event: NoDynamoEvent = {
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
  async listEvents(runId?: string): Promise<NoDynamoEvent[]> {
    const files = fs
      .readdirSync(this.eventsDir)
      .filter((f) => f.startsWith("events-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();

    const events: NoDynamoEvent[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.eventsDir, file),
        "utf-8"
      );
      const lines = content.trim().split("\n").filter((l) => l.length > 0);

      for (const line of lines) {
        try {
          const event = JSON.parse(line) as NoDynamoEvent;
          if (!runId || event.runId === runId) {
            events.push(event);
          }
        } catch {
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
  async createActivityEvent(
    input: CreateActivityEventInput
  ): Promise<ActivityEvent> {
    const id = "act_" + uuidv4();
    const now = nowISO();

    const event: ActivityEvent = {
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
      taskGroupId: input.taskGroupId,
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
  async listActivityEvents(
    options: ListActivityEventsOptions = {}
  ): Promise<PaginatedResult<ActivityEvent>> {
    const files = fs
      .readdirSync(this.eventsDir)
      .filter((f) => f.startsWith("activity-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();

    let events: ActivityEvent[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.eventsDir, file),
        "utf-8"
      );
      const lines = content.trim().split("\n").filter((l) => l.length > 0);

      for (const line of lines) {
        try {
          events.push(JSON.parse(line) as ActivityEvent);
        } catch {
          // Skip malformed
        }
      }
    }

    // Apply org isolation for activity events
    const activityOrgId = options.orgId || this.orgId;
    if (activityOrgId) {
      events = events.filter((e) => !e.orgId || e.orgId === activityOrgId);
    }

    // Apply filters
    if (options.projectId) {
      events = events.filter((e) => e.projectId === options.projectId);
    }
    if (options.types && options.types.length > 0) {
      events = events.filter((e) => options.types!.includes(e.type));
    }
    if (options.importance) {
      events = events.filter((e) => e.importance === options.importance);
    }
    if (options.since) {
      events = events.filter((e) => e.timestamp >= options.since!);
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
  async generateInspectionPacket(input: {
    runId: string;
    generatedBy: string;
    includeAllLogs?: boolean;
  }): Promise<InspectionPacket> {
    const run = await this.getRun(input.runId);
    if (!run) {
      throw new Error("Run not found: " + input.runId);
    }

    const events = await this.listEvents(input.runId);
    const project = run.projectId
      ? await this.getProjectIndex(run.projectId)
      : null;

    const packetId = "pkt_" + uuidv4();
    const now = nowISO();

    const packet: InspectionPacket = {
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
          stream: "stdout" as const,
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
  async getInspectionPacket(packetId: string): Promise<InspectionPacket | null> {
    const filePath = path.join(this.packetsDir, packetId + ".json");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as InspectionPacket;
  }

  /**
   * List inspection packets
   */
  async listInspectionPackets(runId?: string): Promise<InspectionPacket[]> {
    const files = fs
      .readdirSync(this.packetsDir)
      .filter((f) => f.endsWith(".json"));
    const packets: InspectionPacket[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.packetsDir, file),
        "utf-8"
      );
      const packet = JSON.parse(content) as InspectionPacket;
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
  formatPacketAsMarkdown(packet: InspectionPacket): string {
    const lines: string[] = [];

    lines.push("# Task Inspection: " + (packet.task?.title || "Unknown"));
    lines.push("");
    lines.push("**Status:** " + (packet.task?.state || "Unknown"));
    lines.push(
      "**Created:** " + (packet.task?.createdAt ? new Date(packet.task.createdAt).toLocaleString() : "Unknown")
    );
    if (packet.task?.startedAt && packet.task?.endedAt) {
      const durationMs =
        new Date(packet.task.endedAt).getTime() -
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
  formatPacketForClipboard(packet: InspectionPacket): string {
    const lines: string[] = [];

    lines.push(
      '<inspection type="' + packet.type + '" id="' + packet.packetId + '">'
    );
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
  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const planId = "plan_" + uuidv4();
    const now = nowISO();

    const tasks: PlanTask[] = input.tasks.map((t, index) => ({
      taskId: "task_" + uuidv4(),
      description: t.description,
      priority: t.priority ?? index,
      dependencies: t.dependencies ?? [],
      status: "CREATED" as TaskState,
    }));

    const plan: Plan = {
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
  async getPlan(planId: string): Promise<Plan | null> {
    const filePath = path.join(this.plansDir, planId + ".json");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as Plan;
  }

  /**
   * Update plan
   */
  async updatePlan(
    planId: string,
    updates: UpdatePlanInput
  ): Promise<Plan | null> {
    const plan = await this.getPlan(planId);
    if (!plan) {
      return null;
    }

    const updated: Plan = {
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
  async listPlans(projectId?: string): Promise<Plan[]> {
    if (!fs.existsSync(this.plansDir)) {
      return [];
    }

    const files = fs.readdirSync(this.plansDir).filter((f) => f.endsWith(".json"));
    const plans: Plan[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.plansDir, file),
        "utf-8"
      );
      const plan = JSON.parse(content) as Plan;
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
  async getLatestPlanForProject(projectId: string): Promise<Plan | null> {
    const plans = await this.listPlans(projectId);
    return plans.length > 0 ? plans[0] : null;
  }

  // ==================== Utility ====================

  /**
   * Clear all data (for testing)
   */
  async clearAll(): Promise<void> {
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
  async getStats(orgId?: string): Promise<{
    projects: number;
    sessions: number;
    runs: number;
    events: number;
    packets: number;
    plans: number;
  }> {
    // Use orgId filter for accurate tenant-scoped stats
    const effectiveOrgId = orgId || this.orgId;

    // Count projects with orgId filter
    let projectCount = 0;
    if (fs.existsSync(this.projectsDir)) {
      const files = fs.readdirSync(this.projectsDir).filter((f) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.projectsDir, file), "utf-8");
          const project = JSON.parse(content);
          if (!effectiveOrgId || !project.orgId || project.orgId === effectiveOrgId) {
            projectCount++;
          }
        } catch { /* skip malformed */ }
      }
    }

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
      const lines = content.trim().split("\n").filter((l) => l.length > 0);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (!effectiveOrgId || !evt.orgId || evt.orgId === effectiveOrgId) {
            eventCount++;
          }
        } catch { /* skip malformed */ }
      }
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

/**
 * Global NoDynamo DAL instance
 */
let globalNoDynamo: NoDynamoDAL | null = null;

/**
 * Initialize global NoDynamo DAL
 */
export function initNoDynamo(stateDir: string, orgId?: string): NoDynamoDAL {
  if (!globalNoDynamo) {
    globalNoDynamo = new NoDynamoDAL({ stateDir, orgId });
  }
  return globalNoDynamo;
}

/**
 * Get global NoDynamo DAL
 */
export function getNoDynamo(): NoDynamoDAL {
  if (!globalNoDynamo) {
    throw new Error("NoDynamo not initialized. Call initNoDynamo() first.");
  }
  return globalNoDynamo;
}

/**
 * Check if NoDynamo is initialized
 */
export function isNoDynamoInitialized(): boolean {
  return globalNoDynamo !== null;
}

/**
 * Reset global NoDynamo (for testing)
 */
export function resetNoDynamo(): void {
  globalNoDynamo = null;
}

// ==================== Conversation Messages ====================
// Added as extension to NoDynamoDAL for MVP Chat Feature

/**
 * Extended NoDynamo DAL with conversation support
 */
export class NoDynamoDALWithConversations extends NoDynamoDAL implements IDataAccessLayer {
  private readonly conversationsDir: string;
  private readonly extStateDir: string;

  constructor(config: NoDynamoConfig) {
    super(config);
    this.extStateDir = config.stateDir;
    this.conversationsDir = path.join(config.stateDir, "conversations");
    if (!fs.existsSync(this.conversationsDir)) {
      fs.mkdirSync(this.conversationsDir, { recursive: true });
    }
  }

  /**
   * Create a new conversation message
   */
  async createConversationMessage(
    input: CreateConversationMessageInput
  ): Promise<ConversationMessage> {
    const messageId = "msg_" + uuidv4();
    const now = nowISO();

    const message: ConversationMessage = {
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
    const filePath = path.join(
      this.conversationsDir,
      input.projectId + ".jsonl"
    );
    await fs.promises.appendFile(filePath, JSON.stringify(message) + "\n");

    return message;
  }

  /**
   * List conversation messages for a project
   */
  async listConversationMessages(
    projectId: string,
    limit?: number
  ): Promise<ConversationMessage[]> {
    const filePath = path.join(this.conversationsDir, projectId + ".jsonl");

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.length > 0);

    let messages: ConversationMessage[] = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line) as ConversationMessage);
      } catch {
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
  async getConversationMessage(
    projectId: string,
    messageId: string
  ): Promise<ConversationMessage | null> {
    const messages = await this.listConversationMessages(projectId);
    return messages.find((m) => m.messageId === messageId) || null;
  }

  /**
   * Update conversation message
   * Note: This rewrites the entire file (not efficient for large files)
   */
  async updateConversationMessage(
    projectId: string,
    messageId: string,
    updates: UpdateConversationMessageInput
  ): Promise<ConversationMessage | null> {
    const filePath = path.join(this.conversationsDir, projectId + ".jsonl");

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l.length > 0);

    let found = false;
    let updatedMessage: ConversationMessage | null = null;

    const newLines: string[] = [];
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as ConversationMessage;
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
        } else {
          newLines.push(line);
        }
      } catch {
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
  async getAwaitingResponseMessage(
    projectId: string
  ): Promise<ConversationMessage | null> {
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
  async clearConversationHistory(projectId: string): Promise<void> {
    const filePath = path.join(this.conversationsDir, projectId + ".jsonl");
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  // ==================== Plugin CRUD ====================

  private get pluginsDir(): string {
    return path.join(this.extStateDir, "plugins");
  }

  /**
   * Create a new plugin
   */
  async createPlugin(plugin: PluginDefinition): Promise<PluginDefinition> {
    const pluginsDir = this.pluginsDir;
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
    }
    const filePath = path.join(pluginsDir, `${plugin.pluginId}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(plugin, null, 2));
    return plugin;
  }

  /**
   * Get a plugin by ID
   */
  async getPlugin(pluginId: string): Promise<PluginDefinition | null> {
    const filePath = path.join(this.pluginsDir, `${pluginId}.json`);
    try {
      const data = await fs.promises.readFile(filePath, "utf-8");
      return JSON.parse(data) as PluginDefinition;
    } catch {
      return null;
    }
  }

  /**
   * List all plugins
   */
  async listPlugins(): Promise<PluginDefinition[]> {
    const pluginsDir = this.pluginsDir;
    try {
      if (!fs.existsSync(pluginsDir)) {
        return [];
      }
      const files = fs.readdirSync(pluginsDir);
      const plugins: PluginDefinition[] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          const data = await fs.promises.readFile(path.join(pluginsDir, file), "utf-8");
          plugins.push(JSON.parse(data));
        }
      }
      return plugins.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  /**
   * Update a plugin
   */
  async updatePlugin(pluginId: string, updates: Partial<PluginDefinition>): Promise<PluginDefinition | null> {
    const existing = await this.getPlugin(pluginId);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    const filePath = path.join(this.pluginsDir, `${pluginId}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  }

  /**
   * Delete a plugin
   */
  async deletePlugin(pluginId: string): Promise<boolean> {
    const filePath = path.join(this.pluginsDir, `${pluginId}.json`);
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ==================== PR Review State CRUD ====================

  private get prReviewStatesDir(): string {
    return path.join(this.extStateDir, "pr-review-states");
  }

  private get prReviewCommentsDir(): string {
    return path.join(this.extStateDir, "pr-review-comments");
  }

  private get prReviewCyclesDir(): string {
    return path.join(this.extStateDir, "pr-review-cycles");
  }

  private ensurePRReviewDirs(): void {
    for (const dir of [this.prReviewStatesDir, this.prReviewCommentsDir, this.prReviewCyclesDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private prReviewStateFileName(projectId: string, prNumber: number): string {
    return `${projectId}_${prNumber}.json`;
  }

  async createPRReviewState(input: CreatePRReviewStateInput): Promise<PRReviewState> {
    this.ensurePRReviewDirs();
    const now = nowISO();
    const TTL_90_DAYS = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

    const state: PRReviewState = {
      PK: "ORG#" + input.orgId,
      SK: `PR#${input.projectId}#${input.prNumber}`,
      projectId: input.projectId,
      orgId: input.orgId,
      prNumber: input.prNumber,
      prTitle: input.prTitle,
      prUrl: input.prUrl,
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      repository: input.repository,
      status: "REVIEW_PENDING",
      currentCycle: 0,
      maxCycles: input.maxCycles ?? 5,
      totalComments: 0,
      pendingComments: 0,
      acceptedComments: 0,
      rejectedComments: 0,
      escalatedComments: 0,
      lastReviewArrivedAt: null,
      lastFixPushedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      ttl: TTL_90_DAYS,
    };

    const filePath = path.join(
      this.prReviewStatesDir,
      this.prReviewStateFileName(input.projectId, input.prNumber)
    );
    await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2));
    return state;
  }

  async getPRReviewState(projectId: string, prNumber: number): Promise<PRReviewState | null> {
    this.ensurePRReviewDirs();
    const filePath = path.join(
      this.prReviewStatesDir,
      this.prReviewStateFileName(projectId, prNumber)
    );
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as PRReviewState;
  }

  async updatePRReviewState(
    projectId: string,
    prNumber: number,
    updates: UpdatePRReviewStateInput & { version: number }
  ): Promise<PRReviewState> {
    const state = await this.getPRReviewState(projectId, prNumber);
    if (!state) {
      throw new Error(`PRReviewState not found for project: ${projectId}, PR: ${prNumber}`);
    }
    if (state.version !== updates.version) {
      throw new OptimisticLockError(updates.version, state.version);
    }

    const { version: _v, ...updateFields } = updates;
    const updated: PRReviewState = {
      ...state,
      ...updateFields,
      version: state.version + 1,
      updatedAt: nowISO(),
    };

    const filePath = path.join(
      this.prReviewStatesDir,
      this.prReviewStateFileName(projectId, prNumber)
    );
    await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  }

  async listPRReviewStates(
    projectId: string,
    options?: { status?: PRReviewStatus; limit?: number }
  ): Promise<PRReviewState[]> {
    this.ensurePRReviewDirs();
    if (!fs.existsSync(this.prReviewStatesDir)) {
      return [];
    }

    const prefix = projectId + "_";
    const files = fs.readdirSync(this.prReviewStatesDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
    let states: PRReviewState[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.prReviewStatesDir, file),
        "utf-8"
      );
      const state = JSON.parse(content) as PRReviewState;
      if (state.projectId === projectId) {
        states.push(state);
      }
    }

    if (options?.status) {
      states = states.filter((s) => s.status === options.status);
    }

    // Sort by createdAt descending
    states.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (options?.limit !== undefined && options.limit > 0) {
      return states.slice(0, options.limit);
    }
    return states;
  }

  async deletePRReviewState(projectId: string, prNumber: number): Promise<void> {
    this.ensurePRReviewDirs();
    const filePath = path.join(
      this.prReviewStatesDir,
      this.prReviewStateFileName(projectId, prNumber)
    );
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore if file does not exist
    }
  }

  // ==================== PR Review Comment CRUD ====================

  private prCommentFileName(projectId: string, prNumber: number, commentId: string): string {
    return `${projectId}_${prNumber}_${commentId}.json`;
  }

  async batchCreatePRReviewComments(comments: PRReviewComment[]): Promise<void> {
    this.ensurePRReviewDirs();
    for (const comment of comments) {
      const filePath = path.join(
        this.prReviewCommentsDir,
        this.prCommentFileName(comment.projectId, comment.prNumber, comment.commentId)
      );
      await fs.promises.writeFile(filePath, JSON.stringify(comment, null, 2));
    }
  }

  async getPRReviewComment(
    projectId: string,
    prNumber: number,
    commentId: string
  ): Promise<PRReviewComment | null> {
    this.ensurePRReviewDirs();
    const filePath = path.join(
      this.prReviewCommentsDir,
      this.prCommentFileName(projectId, prNumber, commentId)
    );
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as PRReviewComment;
  }

  async listPRReviewComments(
    projectId: string,
    prNumber: number,
    filter?: { judgment?: CommentJudgment; fixApplied?: boolean; cycle?: number }
  ): Promise<PRReviewComment[]> {
    this.ensurePRReviewDirs();
    if (!fs.existsSync(this.prReviewCommentsDir)) {
      return [];
    }

    const prefix = `${projectId}_${prNumber}_`;
    const files = fs.readdirSync(this.prReviewCommentsDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
    let comments: PRReviewComment[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.prReviewCommentsDir, file),
        "utf-8"
      );
      const comment = JSON.parse(content) as PRReviewComment;
      if (comment.projectId === projectId && comment.prNumber === prNumber) {
        comments.push(comment);
      }
    }

    if (filter?.judgment) {
      comments = comments.filter((c) => c.judgment === filter.judgment);
    }
    if (filter?.fixApplied !== undefined) {
      comments = comments.filter((c) => c.fixApplied === filter.fixApplied);
    }
    if (filter?.cycle !== undefined) {
      comments = comments.filter((c) => c.detectedInCycle === filter.cycle);
    }

    // Sort by createdAt ascending
    comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return comments;
  }

  async updatePRReviewComment(
    projectId: string,
    prNumber: number,
    commentId: string,
    updates: Partial<Pick<PRReviewComment,
      "judgment" | "judgmentReason" | "fixApplied" | "fixCommitHash" | "fixDescription" | "userOverride"
    >>
  ): Promise<PRReviewComment> {
    const comment = await this.getPRReviewComment(projectId, prNumber, commentId);
    if (!comment) {
      throw new Error(`PRReviewComment not found: ${projectId}/${prNumber}/${commentId}`);
    }

    const updated: PRReviewComment = {
      ...comment,
      ...updates,
      updatedAt: nowISO(),
    };

    const filePath = path.join(
      this.prReviewCommentsDir,
      this.prCommentFileName(projectId, prNumber, commentId)
    );
    await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  }

  // ==================== PR Review Cycle CRUD ====================

  private prCycleFileName(projectId: string, prNumber: number, cycleNumber: number): string {
    return `${projectId}_${prNumber}_${cycleNumber}.json`;
  }

  async createPRReviewCycle(input: PRReviewCycle): Promise<PRReviewCycle> {
    this.ensurePRReviewDirs();
    const cycle: PRReviewCycle = {
      ...input,
      createdAt: input.createdAt || nowISO(),
    };

    const filePath = path.join(
      this.prReviewCyclesDir,
      this.prCycleFileName(input.projectId, input.prNumber, input.cycleNumber)
    );
    await fs.promises.writeFile(filePath, JSON.stringify(cycle, null, 2));
    return cycle;
  }

  async getPRReviewCycle(
    projectId: string,
    prNumber: number,
    cycleNumber: number
  ): Promise<PRReviewCycle | null> {
    this.ensurePRReviewDirs();
    const filePath = path.join(
      this.prReviewCyclesDir,
      this.prCycleFileName(projectId, prNumber, cycleNumber)
    );
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as PRReviewCycle;
  }

  async listPRReviewCycles(projectId: string, prNumber: number): Promise<PRReviewCycle[]> {
    this.ensurePRReviewDirs();
    if (!fs.existsSync(this.prReviewCyclesDir)) {
      return [];
    }

    const prefix = `${projectId}_${prNumber}_`;
    const files = fs.readdirSync(this.prReviewCyclesDir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
    const cycles: PRReviewCycle[] = [];

    for (const file of files) {
      const content = await fs.promises.readFile(
        path.join(this.prReviewCyclesDir, file),
        "utf-8"
      );
      const cycle = JSON.parse(content) as PRReviewCycle;
      if (cycle.projectId === projectId && cycle.prNumber === prNumber) {
        cycles.push(cycle);
      }
    }

    // Sort by cycleNumber ascending
    cycles.sort((a, b) => a.cycleNumber - b.cycleNumber);

    return cycles;
  }

  async updatePRReviewCycle(
    projectId: string,
    prNumber: number,
    cycleNumber: number,
    updates: Partial<PRReviewCycle>
  ): Promise<PRReviewCycle> {
    const cycle = await this.getPRReviewCycle(projectId, prNumber, cycleNumber);
    if (!cycle) {
      throw new Error(`PRReviewCycle not found: ${projectId}/${prNumber}/${cycleNumber}`);
    }

    const updated: PRReviewCycle = {
      ...cycle,
      ...updates,
    };

    const filePath = path.join(
      this.prReviewCyclesDir,
      this.prCycleFileName(projectId, prNumber, cycleNumber)
    );
    await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2));
    return updated;
  }
}


/**
 * Global extended NoDynamo DAL instance
 */
let globalNoDynamoExtended: NoDynamoDALWithConversations | null = null;

/**
 * Initialize global extended NoDynamo DAL
 */
export function initNoDynamoExtended(
  stateDir: string,
  orgId?: string
): NoDynamoDALWithConversations {
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
export function getNoDynamoExtended(): NoDynamoDALWithConversations {
  if (!globalNoDynamoExtended) {
    throw new Error(
      "NoDynamoExtended not initialized. Call initNoDynamoExtended() first."
    );
  }
  return globalNoDynamoExtended;
}

/**
 * Check if extended NoDynamo is initialized
 */
export function isNoDynamoExtendedInitialized(): boolean {
  return globalNoDynamoExtended !== null;
}

/**
 * Reset global extended NoDynamo (for testing)
 */
export function resetNoDynamoExtended(): void {
  globalNoDynamoExtended = null;
}
