/**
 * DynamoDB Entity Types
 *
 * Type definitions for all DynamoDB entities.
 */

// User roles
export type UserRole = "owner" | "admin" | "member" | "viewer";
export type UserStatus = "active" | "suspended";

// Org plans
export type OrgPlan = "free" | "pro" | "enterprise";

// Agent status
export type AgentStatus = "online" | "stale" | "offline";

// Task states
export type TaskState =
  | "CREATED"
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_RESPONSE"
  | "COMPLETE"
  | "ERROR"
  | "CANCELLED";

// Log streams
export type LogStream = "stdout" | "stderr" | "system";
export type LogLevel = "debug" | "info" | "warn" | "error";

// Event types
export type TaskEventType =
  | "CREATED"
  | "QUEUED"
  | "LEASED"
  | "STARTED"
  | "PROGRESS"
  | "LOG_BATCH"
  | "AWAITING_RESPONSE"
  | "RESPONSE_RECEIVED"
  | "COMPLETED"
  | "ERROR"
  | "CANCELLED"
  | "RETRIED"
  | "REQUEUED";

// Notification types
export type NotificationType =
  | "TASK_AWAITING_RESPONSE"
  | "TASK_ERROR"
  | "TASK_COMPLETED"
  | "AGENT_OFFLINE"
  | "QUEUE_STUCK";

export type NotificationSeverity = "info" | "warning" | "error";

// Settings scope
export type SettingsScope = "global" | "user" | "project";

// Secret types
export type SecretType = "openai_key" | "anthropic_key";

// Entity interfaces
export interface User {
  PK: string; // USER#<userId>
  userId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  orgId: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Org {
  PK: string; // ORG#<orgId>
  orgId: string;
  name: string;
  plan: OrgPlan;
  createdAt: string;
}

export interface Project {
  PK: string; // ORG#<orgId>
  SK: string; // PROJ#<projectId>
  projectId: string;
  orgId: string;
  name: string;
  localPathHint?: string;
  defaultModel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  PK: string; // ORG#<orgId>
  SK: string; // AGENT#<agentId>
  agentId: string;
  orgId: string;
  host: string;
  pid: number;
  cwd: string;
  status: AgentStatus;
  lastHeartbeatAt: string;
  currentProjectId?: string;
  currentTaskId?: string;
  version: string;
  capabilities: string[];
  canInteractive: boolean;
  ttl: number;
}

export interface Task {
  PK: string; // ORG#<orgId>
  SK: string; // TASK#<taskId>
  taskId: string;
  orgId: string;
  projectId: string;
  agentId?: string;
  state: TaskState;
  title: string;
  prompt: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  result?: string;
  error?: string;
  clarificationQuestion?: string;
  responseText?: string;
  correlationId: string;
}

export interface QueueItem {
  PK: string; // ORG#<orgId>
  SK: string; // QUEUE#<createdAt>#<taskId>
  taskId: string;
  projectId: string;
  desiredAgentId?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  attempts: number;
  nextVisibleAt?: string;
}

export interface TaskEvent {
  PK: string; // TASK#<taskId>
  SK: string; // EVT#<timestamp>#<seq>
  type: TaskEventType;
  message: string;
  level: LogLevel;
  payload?: Record<string, unknown>;
  actor: string;
  correlationId: string;
  createdAt: string;
}

export interface LogEntry {
  PK: string; // ORG#<orgId>
  SK: string; // LOG#<taskId>#<timestamp>#<logId>
  logId: string;
  taskId: string;
  stream: LogStream;
  level: LogLevel;
  message: string;
  timestamp: string;
  correlationId?: string;
  ttl?: number;
}

export interface Settings {
  PK: string; // ORG#<orgId>
  SK: string; // SET#GLOBAL | SET#USER#<userId> | SET#PROJ#<projectId>
  scope: SettingsScope;
  defaultModel?: string;
  modelAllowList?: string[];
  openaiKeyRef?: string;
  anthropicKeyRef?: string;
  uiPrefs?: Record<string, unknown>;
  notifyPrefs?: Record<string, unknown>;
  updatedAt: string;
}

export interface Secret {
  PK: string; // ORG#<orgId>
  SK: string; // SEC#<secretId>
  secretId: string;
  type: SecretType;
  cipherText: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  PK: string; // ORG#<orgId>
  SK: string; // NOTIF#<timestamp>#<notificationId>
  notificationId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  taskId?: string;
  projectId?: string;
  agentId?: string;
  read: boolean;
  createdAt: string;
  ttl: number;
}

// Input types (for creating entities)
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  orgId: string;
}

export interface CreateOrgInput {
  name: string;
  plan?: OrgPlan;
}

export interface CreateProjectInput {
  orgId: string;
  name: string;
  localPathHint?: string;
  defaultModel?: string;
}

export interface CreateTaskInput {
  orgId: string;
  projectId: string;
  prompt: string;
  priority?: number;
}

export interface CreateAgentInput {
  orgId: string;
  host: string;
  pid: number;
  cwd: string;
  version: string;
  capabilities?: string[];
  canInteractive?: boolean;
}

export interface CreateNotificationInput {
  orgId: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  taskId?: string;
  projectId?: string;
  agentId?: string;
}

// Query result types
export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
}

// Session types for log hierarchy
export type SessionStatus = "active" | "ended";

export interface SessionRun {
  runId: string;
  taskRunId: string;
  status: TaskState;
  startedAt: string;
  endedAt?: string;
  taskCount: number;
}

export interface SessionThread {
  threadId: string;
  runs: SessionRun[];
}

export interface Session {
  PK: string;                // ORG#<orgId>
  SK: string;                // SESSION#<sessionId>
  sessionId: string;
  orgId: string;
  projectPath: string;
  projectId?: string;
  startedAt: string;
  endedAt?: string;
  threads: SessionThread[];
  totalRuns: number;
  totalTasks: number;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

export interface CreateSessionInput {
  orgId: string;
  projectPath: string;
  projectId?: string;
  sessionId?: string;
}

// Project lifecycle types
export type ProjectLifecycleState = "ACTIVE" | "IDLE" | "ARCHIVED";

export interface ProjectLifecycle {
  projectId: string;
  state: ProjectLifecycleState;
  lastActivityAt: string;
  archivedAt?: string;
  idleThresholdDays: number;
}

// Retention policy types
export interface RetentionPolicy {
  taskLogs: number;          // Days
  taskEvents: number;        // Days
  auditLogs: number;         // Days
  sessionMetadata: number;   // Days
}

// Folder scan types
export type ScanResultType = "claude-project" | "node-project" | "git-repo";
export type ScanRecommendation = "add" | "skip" | "review";
export type ScanJobStatus = "pending" | "running" | "completed" | "failed";

export interface ScanResult {
  path: string;
  type: ScanResultType;
  hasClaudeConfig: boolean;
  lastModified: string;
  size?: number;
  recommendation: ScanRecommendation;
}

export interface ScanJob {
  id: string;
  rootPath: string;
  status: ScanJobStatus;
  progress: {
    scannedDirs: number;
    foundProjects: number;
  };
  results: ScanResult[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// Activity event types
export type ActivityEventType =
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "task_awaiting"
  | "session_started"
  | "chat_received"
  | "chat_error"
  | "session_ended"
  | "error";

// Activity event importance
export type ActivityEventImportance = "high" | "normal" | "low";

export interface ActivityEvent {
  PK: string;                   // ORG#<orgId>
  SK: string;                   // ACT#<timestamp>#<eventId>
  id: string;
  orgId: string;
  type: ActivityEventType;
  timestamp: string;
  projectId?: string;
  projectPath?: string;
  projectAlias?: string;
  sessionId?: string;
  taskId?: string;
  summary: string;
  importance: ActivityEventImportance;
  details: Record<string, unknown>;
  ttl?: number;
}

export interface CreateActivityEventInput {
  orgId: string;
  type: ActivityEventType;
  projectId?: string;
  projectPath?: string;
  projectAlias?: string;
  sessionId?: string;
  taskId?: string;
  summary: string;
  importance?: ActivityEventImportance;
  details?: Record<string, unknown>;
}

export interface ListActivityEventsOptions {
  projectId?: string;
  types?: ActivityEventType[];
  importance?: ActivityEventImportance;
  since?: string;
  limit?: number;
  cursor?: string;
}

// Tree UI types
export interface ProjectTreeNode {
  projectId: string;
  projectPath: string;
  alias?: string;
  status: ProjectIndexStatus;
  sessions: SessionTreeNode[];
}

export interface SessionTreeNode {
  sessionId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  threads: ThreadTreeNode[];
  expanded?: boolean;
}

export interface ThreadTreeNode {
  threadId: string;
  runs: RunTreeNode[];
  expanded?: boolean;
}

export interface RunTreeNode {
  runId: string;
  taskRunId: string;
  status: TaskState;
  summary: string;
  startedAt: string;
  endedAt?: string;
  eventCount: number;
  events?: LogEventTreeNode[];
  expanded?: boolean;
}

export interface LogEventTreeNode {
  eventId: string;
  type: TaskEventType;
  timestamp: string;
  message: string;
  level: LogLevel;
}

// Log statistics
export interface LogStats {
  total: number;
  byLevel: {
    debug: number;
    info: number;
    warn: number;
    error: number;
  };
  byStream: {
    stdout: number;
    stderr: number;
    system: number;
  };
}

// Project log aggregate
export interface ProjectLogSummary {
  projectPath: string;
  projectId?: string;
  totalSessions: number;
  totalTasks: number;
  lastActivityAt: string;
  stats: {
    completed: number;
    failed: number;
    cancelled: number;
    running: number;
  };
}

// Project Index types for dashboard
export type ProjectIndexStatus = "needs_response" | "error" | "running" | "idle";

export interface ProjectIndex {
  PK: string;                   // ORG#<orgId>
  SK: string;                   // PIDX#<projectId>
  projectId: string;            // pidx_<hash of projectPath>
  orgId: string;
  projectPath: string;
  alias?: string;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  archivedAt?: string;
  status: ProjectIndexStatus;
  lastActivityAt: string;       // Alias for lastMeaningfulWorkAt - used for lifecycle
  lastSeenAt?: string;          // When user last viewed in UI (NOT used for lifecycle)
  sessionCount: number;
  taskStats: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    awaiting: number;
  };
  createdAt: string;
  updatedAt: string;
  ttl?: number;
}

export interface CreateProjectIndexInput {
  orgId: string;
  projectPath: string;
  alias?: string;
  tags?: string[];
  projectType?: 'normal' | 'runner-dev';
}

export interface UpdateProjectIndexInput {
  alias?: string;
  tags?: string[];
  favorite?: boolean;
  status?: ProjectIndexStatus;
  lastActivityAt?: string;
  lastSeenAt?: string;
  sessionCount?: number;
  taskStats?: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    awaiting: number;
  };
  bootstrapPrompt?: string;
  projectType?: ProjectType;
}

export interface ListProjectIndexOptions {
  status?: ProjectIndexStatus;
  lifecycle?: ProjectLifecycleState;
  tags?: string[];
  favoriteOnly?: boolean;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
}

// ==========================================
// Chat / Conversation Types (MVP Chat Feature)
// ==========================================

/**
 * Conversation message role
 */
export type ConversationRole = 'user' | 'assistant' | 'system';

/**
 * Conversation message status
 */
export type ConversationMessageStatus = 
  | 'pending'           // User message queued
  | 'processing'        // Run is executing
  | 'complete'          // Run completed successfully
  | 'error'             // Run failed
  | 'awaiting_response' // Run needs user input
  | 'responded';        // User responded to awaiting

/**
 * Conversation message entity
 */
export interface ConversationMessage {
  messageId: string;            // msg_<uuid>
  projectId: string;
  runId?: string;               // Associated run (for assistant messages)
  role: ConversationRole;
  content: string;
  status: ConversationMessageStatus;
  timestamp: string;            // ISO string
  metadata?: {
    planId?: string;
    taskCount?: number;
    gateResult?: boolean;
    error?: string;
    clarificationQuestion?: string;  // Question that needs response
  };
}

/**
 * Create conversation message input
 */
export interface CreateConversationMessageInput {
  projectId: string;
  role: ConversationRole;
  content: string;
  runId?: string;
  status?: ConversationMessageStatus;
  metadata?: ConversationMessage['metadata'];
}

/**
 * Update conversation message input
 */
export interface UpdateConversationMessageInput {
  status?: ConversationMessageStatus;
  content?: string;
  runId?: string;
  metadata?: Partial<ConversationMessage['metadata']>;
}

/**
 * Project type for dev/prod separation
 */
export type ProjectType = 'normal' | 'runner-dev';

/**
 * Extended ProjectIndex with bootstrapPrompt and projectType
 */
export interface ProjectIndexExtended extends ProjectIndex {
  bootstrapPrompt?: string;
  projectType?: ProjectType;
}

// ==========================================
// Plan Types (Self-Running Loop)
// ==========================================

/**
 * Plan status
 */
export type PlanStatus =
  | "DRAFT"           // Plan created, not dispatched
  | "DISPATCHING"     // Runs being created
  | "RUNNING"         // Runs executing
  | "VERIFYING"       // Running gate:all
  | "VERIFIED"        // gate:all passed
  | "FAILED"          // gate:all failed or runs failed
  | "CANCELLED";      // User cancelled

/**
 * Plan task
 */
export interface PlanTask {
  taskId: string;
  description: string;
  priority: number;
  dependencies: string[];      // taskIds this depends on
  runId?: string;              // Associated Run when dispatched
  status: TaskState;
}

/**
 * Plan entity
 */
export interface Plan {
  PK: string;                  // ORG#<orgId>
  SK: string;                  // PLAN#<planId>
  planId: string;              // plan_<uuid>
  projectId: string;
  orgId: string;
  runId?: string;              // Source run for inspection
  packetId?: string;           // Inspection packet used
  status: PlanStatus;
  tasks: PlanTask[];
  verifyRunId?: string;        // Run executing gate:all
  gateResult?: {
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
}

/**
 * Create plan input
 */
export interface CreatePlanInput {
  orgId: string;
  projectId: string;
  runId?: string;
  packetId?: string;
  tasks: Array<{
    description: string;
    priority?: number;
    dependencies?: string[];
  }>;
}

/**
 * Update plan input
 */
export interface UpdatePlanInput {
  status?: PlanStatus;
  tasks?: PlanTask[];
  verifyRunId?: string;
  gateResult?: Plan["gateResult"];
  executedAt?: string;
  completedAt?: string;
  verifiedAt?: string;
}

