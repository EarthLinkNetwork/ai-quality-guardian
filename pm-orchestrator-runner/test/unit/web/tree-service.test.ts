/**
 * Unit tests for tree-service pure functions
 *
 * Tests AC-5: Logs tree hierarchy (project→session→thread→run)
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  buildProjectNode,
  buildSessionNode,
  buildLogEventNodes,
} from "../../../src/web/services/tree-service";
import {
  ProjectIndex,
  Session,
  TaskEvent,
  SessionThread,
  SessionRun,
  TaskState,
} from "../../../src/web/dal/types";

describe("buildProjectNode - AC-5: Project tree node", () => {
  const createProjectIndex = (overrides?: Partial<ProjectIndex>): ProjectIndex => ({
    PK: "ORG#org_1",
    SK: "PIDX#proj_1",
    projectId: "proj_1",
    orgId: "org_1",
    projectPath: "/test/project",
    alias: "Test Project",
    tags: ["tag1", "tag2"],
    favorite: true,
    archived: false,
    status: "running",
    lastActivityAt: "2025-01-01T00:00:00.000Z",
    sessionCount: 5,
    taskStats: { total: 10, completed: 8, failed: 1, running: 1, awaiting: 0 },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  });

  it("creates tree node with correct properties", () => {
    const project = createProjectIndex();
    const node = buildProjectNode(project);

    assert.equal(node.projectId, "proj_1");
    assert.equal(node.projectPath, "/test/project");
    assert.equal(node.alias, "Test Project");
    assert.equal(node.status, "running");
  });

  it("initializes sessions as empty array (lazy loading)", () => {
    const project = createProjectIndex();
    const node = buildProjectNode(project);

    assert.deepEqual(node.sessions, []);
  });

  it("handles project without alias", () => {
    const project = createProjectIndex({ alias: undefined });
    const node = buildProjectNode(project);

    assert.equal(node.alias, undefined);
  });

  it("preserves all status values correctly", () => {
    const statuses: Array<"needs_response" | "error" | "running" | "idle"> = [
      "needs_response",
      "error",
      "running",
      "idle",
    ];

    for (const status of statuses) {
      const project = createProjectIndex({ status });
      const node = buildProjectNode(project);
      assert.equal(node.status, status);
    }
  });
});

describe("buildSessionNode - AC-5: Session tree node", () => {
  const createRun = (runId: string, status: TaskState = "COMPLETE"): SessionRun => ({
    runId,
    taskRunId: `taskrun_${runId}`,
    status,
    startedAt: "2025-01-01T00:00:00.000Z",
    endedAt: "2025-01-01T01:00:00.000Z",
    taskCount: 5,
  });

  const createThread = (threadId: string, runs: SessionRun[] = []): SessionThread => ({
    threadId,
    runs,
  });

  const createSession = (overrides?: Partial<Session>): Session => ({
    PK: "ORG#org_1",
    SK: "SESS#session_1",
    sessionId: "session_1",
    orgId: "org_1",
    projectPath: "/test/project",
    status: "active",
    startedAt: "2025-01-01T00:00:00.000Z",
    threads: [],
    totalRuns: 0,
    totalTasks: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ttl: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days TTL
    ...overrides,
  });

  it("creates session node with correct properties", () => {
    const session = createSession({
      sessionId: "session_123",
      status: "active",
      endedAt: "2025-01-01T02:00:00.000Z",
    });
    const node = buildSessionNode(session);

    assert.equal(node.sessionId, "session_123");
    assert.equal(node.status, "active");
    assert.equal(node.startedAt, "2025-01-01T00:00:00.000Z");
    assert.equal(node.endedAt, "2025-01-01T02:00:00.000Z");
  });

  it("initializes session as collapsed", () => {
    const session = createSession();
    const node = buildSessionNode(session);

    assert.equal(node.expanded, false);
  });

  describe("Thread hierarchy", () => {
    it("builds threads from session threads", () => {
      const session = createSession({
        threads: [
          createThread("thread_1", [createRun("run_1"), createRun("run_2")]),
          createThread("thread_2", [createRun("run_3")]),
        ],
      });
      const node = buildSessionNode(session);

      assert.equal(node.threads.length, 2);
      assert.equal(node.threads[0].threadId, "thread_1");
      assert.equal(node.threads[1].threadId, "thread_2");
    });

    it("initializes threads as collapsed", () => {
      const session = createSession({
        threads: [createThread("thread_1")],
      });
      const node = buildSessionNode(session);

      assert.equal(node.threads[0].expanded, false);
    });
  });

  describe("Run hierarchy within threads", () => {
    it("builds runs from thread runs", () => {
      const session = createSession({
        threads: [
          createThread("thread_1", [
            createRun("run_1", "COMPLETE"),
            createRun("run_2", "RUNNING"),
          ]),
        ],
      });
      const node = buildSessionNode(session);

      assert.equal(node.threads[0].runs.length, 2);
      assert.equal(node.threads[0].runs[0].runId, "run_1");
      assert.equal(node.threads[0].runs[0].status, "COMPLETE");
      assert.equal(node.threads[0].runs[1].runId, "run_2");
      assert.equal(node.threads[0].runs[1].status, "RUNNING");
    });

    it("sets run properties correctly", () => {
      const session = createSession({
        threads: [
          createThread("thread_1", [
            {
              runId: "run_1",
              taskRunId: "taskrun_1",
              status: "COMPLETE",
              startedAt: "2025-01-01T00:00:00.000Z",
              endedAt: "2025-01-01T01:00:00.000Z",
              taskCount: 10,
            },
          ]),
        ],
      });
      const node = buildSessionNode(session);
      const run = node.threads[0].runs[0];

      assert.equal(run.runId, "run_1");
      assert.equal(run.taskRunId, "taskrun_1");
      assert.equal(run.status, "COMPLETE");
      assert.equal(run.startedAt, "2025-01-01T00:00:00.000Z");
      assert.equal(run.endedAt, "2025-01-01T01:00:00.000Z");
      assert.equal(run.eventCount, 10);
    });

    it("initializes runs as collapsed with no events", () => {
      const session = createSession({
        threads: [createThread("thread_1", [createRun("run_1")])],
      });
      const node = buildSessionNode(session);
      const run = node.threads[0].runs[0];

      assert.equal(run.expanded, false);
      assert.equal(run.events, undefined);
    });

    it("generates summary from runId", () => {
      const session = createSession({
        threads: [createThread("thread_1", [createRun("run_12345678_extra")])],
      });
      const node = buildSessionNode(session);
      const run = node.threads[0].runs[0];

      assert.equal(run.summary, "Run run_1234");
    });
  });

  describe("Full hierarchy: session → thread → run", () => {
    it("maintains complete hierarchy structure", () => {
      const session = createSession({
        sessionId: "session_main",
        threads: [
          createThread("thread_1", [
            createRun("run_1"),
            createRun("run_2"),
          ]),
          createThread("thread_2", [
            createRun("run_3"),
          ]),
        ],
      });
      const node = buildSessionNode(session);

      // Session level
      assert.equal(node.sessionId, "session_main");
      assert.equal(node.threads.length, 2);

      // Thread 1 level
      assert.equal(node.threads[0].threadId, "thread_1");
      assert.equal(node.threads[0].runs.length, 2);

      // Thread 2 level
      assert.equal(node.threads[1].threadId, "thread_2");
      assert.equal(node.threads[1].runs.length, 1);

      // Run level
      assert.equal(node.threads[0].runs[0].runId, "run_1");
      assert.equal(node.threads[0].runs[1].runId, "run_2");
      assert.equal(node.threads[1].runs[0].runId, "run_3");
    });
  });
});

describe("buildLogEventNodes - AC-5: Event tree nodes", () => {
  const createTaskEvent = (overrides?: Partial<TaskEvent>): TaskEvent => ({
    PK: "ORG#org_1",
    SK: "TASKEVT#task_1#2025-01-01T00:00:00.000Z#evt_1",
    type: "PROGRESS",
    message: "Processing...",
    level: "info",
    actor: "system",
    correlationId: "task_1",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  });

  it("converts task events to log event nodes", () => {
    const events: TaskEvent[] = [
      createTaskEvent({ type: "CREATED", message: "Task created" }),
      createTaskEvent({ type: "PROGRESS", message: "Working..." }),
      createTaskEvent({ type: "COMPLETED", message: "Done" }),
    ];
    const nodes = buildLogEventNodes(events);

    assert.equal(nodes.length, 3);
    assert.equal(nodes[0].type, "CREATED");
    assert.equal(nodes[1].type, "PROGRESS");
    assert.equal(nodes[2].type, "COMPLETED");
  });

  it("sets correct properties on event nodes", () => {
    const event = createTaskEvent({
      PK: "ORG#test",
      SK: "TASKEVT#task_123#2025-01-01T12:30:00.000Z#evt_456",
      type: "ERROR",
      message: "Something went wrong",
      level: "error",
      createdAt: "2025-01-01T12:30:00.000Z",
    });
    const [node] = buildLogEventNodes([event]);

    assert.equal(node.eventId, "ORG#test-TASKEVT#task_123#2025-01-01T12:30:00.000Z#evt_456");
    assert.equal(node.type, "ERROR");
    assert.equal(node.timestamp, "2025-01-01T12:30:00.000Z");
    assert.equal(node.message, "Something went wrong");
    assert.equal(node.level, "error");
  });

  it("preserves all event types", () => {
    const eventTypes = [
      "CREATED",
      "QUEUED",
      "STARTED",
      "PROGRESS",
      "AWAITING_RESPONSE",
      "RESPONSE_RECEIVED",
      "COMPLETED",
      "ERROR",
      "CANCELLED",
      "RETRIED",
    ] as const;

    const events = eventTypes.map((type) => createTaskEvent({ type }));
    const nodes = buildLogEventNodes(events);

    assert.deepEqual(nodes.map((n) => n.type), [...eventTypes]);
  });

  it("preserves all log levels", () => {
    const levels = ["debug", "info", "warn", "error"] as const;

    const events = levels.map((level) => createTaskEvent({ level }));
    const nodes = buildLogEventNodes(events);

    assert.deepEqual(nodes.map((n) => n.level), [...levels]);
  });

  it("handles empty events array", () => {
    const nodes = buildLogEventNodes([]);
    assert.deepEqual(nodes, []);
  });
});

describe("AC-5: Full tree hierarchy verification", () => {
  it("verifies project → session → thread → run → event hierarchy exists", () => {
    // This test documents the expected hierarchy structure
    // Project (buildProjectNode)
    //   └── Session[] (buildSessionNode) - lazy loaded
    //         └── Thread[]
    //               └── Run[]
    //                     └── Event[] (buildLogEventNodes) - lazy loaded

    const project: ProjectIndex = {
      PK: "ORG#org_1",
      SK: "PIDX#proj_1",
      projectId: "proj_1",
      orgId: "org_1",
      projectPath: "/test",
      tags: [],
      favorite: false,
      archived: false,
      status: "idle",
      lastActivityAt: "2025-01-01T00:00:00.000Z",
      sessionCount: 1,
      taskStats: { total: 0, completed: 0, failed: 0, running: 0, awaiting: 0 },
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    const session: Session = {
      PK: "ORG#org_1",
      SK: "SESS#session_1",
      sessionId: "session_1",
      orgId: "org_1",
      projectPath: "/test",
      status: "active",
      startedAt: "2025-01-01T00:00:00.000Z",
      threads: [
        {
          threadId: "thread_1",
          runs: [
            {
              runId: "run_1",
              taskRunId: "taskrun_1",
              status: "COMPLETE",
              startedAt: "2025-01-01T00:00:00.000Z",
              taskCount: 3,
            },
          ],
        },
      ],
      totalRuns: 1,
      totalTasks: 3,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      ttl: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days TTL
    };

    const events: TaskEvent[] = [
      {
        PK: "ORG#org_1",
        SK: "TASKEVT#taskrun_1#2025-01-01T00:00:00.000Z#evt_1",
        type: "CREATED",
        message: "Created",
        level: "info",
        actor: "system",
        correlationId: "taskrun_1",
        createdAt: "2025-01-01T00:00:00.000Z",
      },
      {
        PK: "ORG#org_1",
        SK: "TASKEVT#taskrun_1#2025-01-01T00:01:00.000Z#evt_2",
        type: "PROGRESS",
        message: "Progress",
        level: "info",
        actor: "system",
        correlationId: "taskrun_1",
        createdAt: "2025-01-01T00:01:00.000Z",
      },
      {
        PK: "ORG#org_1",
        SK: "TASKEVT#taskrun_1#2025-01-01T00:02:00.000Z#evt_3",
        type: "COMPLETED",
        message: "Completed",
        level: "info",
        actor: "system",
        correlationId: "taskrun_1",
        createdAt: "2025-01-01T00:02:00.000Z",
      },
    ];

    // Build hierarchy
    const projectNode = buildProjectNode(project);
    const sessionNode = buildSessionNode(session);
    const eventNodes = buildLogEventNodes(events);

    // Verify hierarchy structure
    assert.equal(projectNode.projectId, "proj_1");
    assert.deepEqual(projectNode.sessions, []); // Not loaded yet

    assert.equal(sessionNode.sessionId, "session_1");
    assert.equal(sessionNode.threads.length, 1);
    assert.equal(sessionNode.threads[0].threadId, "thread_1");
    assert.equal(sessionNode.threads[0].runs.length, 1);
    assert.equal(sessionNode.threads[0].runs[0].runId, "run_1");
    assert.equal(sessionNode.threads[0].runs[0].events, undefined); // Not loaded yet

    assert.equal(eventNodes.length, 3);
    assert.deepEqual(eventNodes.map(e => e.type), ["CREATED", "PROGRESS", "COMPLETED"]);
  });
});
