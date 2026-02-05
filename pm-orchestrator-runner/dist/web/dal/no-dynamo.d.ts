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
import { ProjectIndex, CreateProjectIndexInput, UpdateProjectIndexInput, ListProjectIndexOptions, PaginatedResult, Session, CreateSessionInput, ActivityEvent, CreateActivityEventInput, ListActivityEventsOptions, TaskState, LogLevel, TaskEventType, ConversationMessage, CreateConversationMessageInput, UpdateConversationMessageInput, Plan, CreatePlanInput, UpdatePlanInput } from "./types";
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
 * NoDynamo DAL class
 */
export declare class NoDynamoDAL {
    private readonly stateDir;
    private readonly projectsDir;
    private readonly sessionsDir;
    private readonly runsDir;
    private readonly eventsDir;
    private readonly packetsDir;
    private readonly plansDir;
    private readonly orgId;
    constructor(config: NoDynamoConfig);
    /**
     * Ensure all required directories exist
     */
    private ensureDirectories;
    /**
     * Create a new project index
     */
    createProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex>;
    /**
     * Get project index by ID
     */
    getProjectIndex(projectId: string): Promise<ProjectIndex | null>;
    /**
     * Get project index by path
     */
    getProjectIndexByPath(projectPath: string): Promise<ProjectIndex | null>;
    /**
     * List all project indexes
     */
    listProjectIndexes(options?: ListProjectIndexOptions): Promise<PaginatedResult<ProjectIndex>>;
    /**
     * Update project index
     */
    updateProjectIndex(projectId: string, updates: UpdateProjectIndexInput): Promise<ProjectIndex | null>;
    /**
     * Archive project
     */
    archiveProject(projectId: string): Promise<ProjectIndex | null>;
    /**
     * Unarchive project
     */
    unarchiveProject(projectId: string): Promise<ProjectIndex | null>;
    /**
     * Get or create project index
     */
    getOrCreateProjectIndex(input: CreateProjectIndexInput): Promise<ProjectIndex>;
    /**
     * Create a new session
     */
    createSession(input: CreateSessionInput): Promise<Session>;
    /**
     * Get session by ID
     */
    getSession(sessionId: string): Promise<Session | null>;
    /**
     * List sessions for a project
     */
    listSessions(projectId?: string): Promise<Session[]>;
    /**
     * Update session
     */
    updateSession(sessionId: string, updates: Partial<Session>): Promise<Session | null>;
    /**
     * End session
     */
    endSession(sessionId: string): Promise<Session | null>;
    /**
     * Create a new run
     */
    createRun(input: {
        sessionId: string;
        projectId?: string;
        threadId?: string;
        taskRunId: string;
        prompt?: string;
    }): Promise<NoDynamoRun>;
    /**
     * Get run by ID
     */
    getRun(runId: string): Promise<NoDynamoRun | null>;
    /**
     * List runs for a session
     */
    listRuns(sessionId?: string): Promise<NoDynamoRun[]>;
    /**
     * Update run
     */
    updateRun(runId: string, updates: Partial<NoDynamoRun>): Promise<NoDynamoRun | null>;
    /**
     * Record an event
     */
    recordEvent(input: {
        runId: string;
        sessionId?: string;
        projectId?: string;
        type: TaskEventType;
        message: string;
        level?: LogLevel;
        payload?: Record<string, unknown>;
        actor?: string;
        correlationId?: string;
    }): Promise<NoDynamoEvent>;
    /**
     * List events for a run
     */
    listEvents(runId?: string): Promise<NoDynamoEvent[]>;
    /**
     * Create activity event
     */
    createActivityEvent(input: CreateActivityEventInput): Promise<ActivityEvent>;
    /**
     * List activity events
     */
    listActivityEvents(options?: ListActivityEventsOptions): Promise<PaginatedResult<ActivityEvent>>;
    /**
     * Generate inspection packet for a run
     */
    generateInspectionPacket(input: {
        runId: string;
        generatedBy: string;
        includeAllLogs?: boolean;
    }): Promise<InspectionPacket>;
    /**
     * Get inspection packet by ID
     */
    getInspectionPacket(packetId: string): Promise<InspectionPacket | null>;
    /**
     * List inspection packets
     */
    listInspectionPackets(runId?: string): Promise<InspectionPacket[]>;
    /**
     * Format inspection packet as markdown
     */
    formatPacketAsMarkdown(packet: InspectionPacket): string;
    /**
     * Format inspection packet for clipboard (ChatGPT-ready)
     */
    formatPacketForClipboard(packet: InspectionPacket): string;
    /**
     * Create a new plan
     */
    createPlan(input: CreatePlanInput): Promise<Plan>;
    /**
     * Get plan by ID
     */
    getPlan(planId: string): Promise<Plan | null>;
    /**
     * Update plan
     */
    updatePlan(planId: string, updates: UpdatePlanInput): Promise<Plan | null>;
    /**
     * List plans, optionally filtered by project
     */
    listPlans(projectId?: string): Promise<Plan[]>;
    /**
     * Get the latest plan for a project
     */
    getLatestPlanForProject(projectId: string): Promise<Plan | null>;
    /**
     * Clear all data (for testing)
     */
    clearAll(): Promise<void>;
    /**
     * Get stats
     */
    getStats(): Promise<{
        projects: number;
        sessions: number;
        runs: number;
        events: number;
        packets: number;
        plans: number;
    }>;
}
/**
 * Initialize global NoDynamo DAL
 */
export declare function initNoDynamo(stateDir: string, orgId?: string): NoDynamoDAL;
/**
 * Get global NoDynamo DAL
 */
export declare function getNoDynamo(): NoDynamoDAL;
/**
 * Check if NoDynamo is initialized
 */
export declare function isNoDynamoInitialized(): boolean;
/**
 * Reset global NoDynamo (for testing)
 */
export declare function resetNoDynamo(): void;
/**
 * Extended NoDynamo DAL with conversation support
 */
export declare class NoDynamoDALWithConversations extends NoDynamoDAL {
    private readonly conversationsDir;
    constructor(config: NoDynamoConfig);
    /**
     * Create a new conversation message
     */
    createConversationMessage(input: CreateConversationMessageInput): Promise<ConversationMessage>;
    /**
     * List conversation messages for a project
     */
    listConversationMessages(projectId: string, limit?: number): Promise<ConversationMessage[]>;
    /**
     * Get conversation message by ID
     */
    getConversationMessage(projectId: string, messageId: string): Promise<ConversationMessage | null>;
    /**
     * Update conversation message
     * Note: This rewrites the entire file (not efficient for large files)
     */
    updateConversationMessage(projectId: string, messageId: string, updates: UpdateConversationMessageInput): Promise<ConversationMessage | null>;
    /**
     * Get latest AWAITING_RESPONSE message for a project
     */
    getAwaitingResponseMessage(projectId: string): Promise<ConversationMessage | null>;
    /**
     * Clear conversation history for a project
     */
    clearConversationHistory(projectId: string): Promise<void>;
}
/**
 * Initialize global extended NoDynamo DAL
 */
export declare function initNoDynamoExtended(stateDir: string, orgId?: string): NoDynamoDALWithConversations;
/**
 * Get global extended NoDynamo DAL
 */
export declare function getNoDynamoExtended(): NoDynamoDALWithConversations;
/**
 * Check if extended NoDynamo is initialized
 */
export declare function isNoDynamoExtendedInitialized(): boolean;
/**
 * Reset global extended NoDynamo (for testing)
 */
export declare function resetNoDynamoExtended(): void;
//# sourceMappingURL=no-dynamo.d.ts.map