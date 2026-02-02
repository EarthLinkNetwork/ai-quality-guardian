/**
 * Unit tests for project status derivation pure functions
 *
 * Tests AC-4: Status auto-calculation
 *   - Priority: needs_response > error > running > idle
 *
 * Tests AC-2: Lifecycle determination (meaningful vs seen)
 *   - Uses lastActivityAt (meaningful work), NOT lastSeenAt
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  deriveProjectStatus,
  deriveLifecycleState,
} from "../../../src/web/dal/project-index-dal";
import { Task, ProjectIndex, TaskState } from "../../../src/web/dal/types";

describe("deriveProjectStatus - AC-4: Status auto-calculation", () => {
  // Helper to create task with specific state
  const createTask = (state: TaskState, id = "task_1"): Task => ({
    PK: "ORG#org_1",
    SK: `TASK#${id}`,
    taskId: id,
    orgId: "org_1",
    projectId: "proj_1",
    state,
    priority: 50,
    title: "Test task",
    prompt: "Test prompt",
    correlationId: `corr_${id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  describe("Priority 1: needs_response (highest)", () => {
    it("returns needs_response when any task is AWAITING_RESPONSE", () => {
      const tasks: Task[] = [
        createTask("AWAITING_RESPONSE", "task_1"),
        createTask("COMPLETE", "task_2"),
        createTask("RUNNING", "task_3"),
      ];
      assert.equal(deriveProjectStatus(tasks), "needs_response");
    });

    it("returns needs_response even with ERROR and RUNNING tasks", () => {
      const tasks: Task[] = [
        createTask("ERROR", "task_1"),
        createTask("AWAITING_RESPONSE", "task_2"),
        createTask("RUNNING", "task_3"),
      ];
      assert.equal(deriveProjectStatus(tasks), "needs_response");
    });

    it("returns needs_response with single AWAITING_RESPONSE task", () => {
      const tasks: Task[] = [createTask("AWAITING_RESPONSE")];
      assert.equal(deriveProjectStatus(tasks), "needs_response");
    });
  });

  describe("Priority 2: error", () => {
    it("returns error when any task is ERROR and no AWAITING_RESPONSE", () => {
      const tasks: Task[] = [
        createTask("ERROR", "task_1"),
        createTask("COMPLETE", "task_2"),
        createTask("RUNNING", "task_3"),
      ];
      assert.equal(deriveProjectStatus(tasks), "error");
    });

    it("returns error with multiple ERROR tasks", () => {
      const tasks: Task[] = [
        createTask("ERROR", "task_1"),
        createTask("ERROR", "task_2"),
      ];
      assert.equal(deriveProjectStatus(tasks), "error");
    });
  });

  describe("Priority 3: running", () => {
    it("returns running when any task is RUNNING and no higher priority", () => {
      const tasks: Task[] = [
        createTask("RUNNING", "task_1"),
        createTask("COMPLETE", "task_2"),
      ];
      assert.equal(deriveProjectStatus(tasks), "running");
    });

    it("returns running when any task is QUEUED", () => {
      const tasks: Task[] = [
        createTask("QUEUED", "task_1"),
        createTask("COMPLETE", "task_2"),
      ];
      assert.equal(deriveProjectStatus(tasks), "running");
    });

    it("returns running with mixed RUNNING and QUEUED", () => {
      const tasks: Task[] = [
        createTask("RUNNING", "task_1"),
        createTask("QUEUED", "task_2"),
      ];
      assert.equal(deriveProjectStatus(tasks), "running");
    });
  });

  describe("Priority 4: idle (lowest)", () => {
    it("returns idle when all tasks are COMPLETE", () => {
      const tasks: Task[] = [
        createTask("COMPLETE", "task_1"),
        createTask("COMPLETE", "task_2"),
      ];
      assert.equal(deriveProjectStatus(tasks), "idle");
    });

    it("returns idle when all tasks are CANCELLED", () => {
      const tasks: Task[] = [
        createTask("CANCELLED", "task_1"),
        createTask("CANCELLED", "task_2"),
      ];
      assert.equal(deriveProjectStatus(tasks), "idle");
    });

    it("returns idle with mixed COMPLETE and CANCELLED", () => {
      const tasks: Task[] = [
        createTask("COMPLETE", "task_1"),
        createTask("CANCELLED", "task_2"),
      ];
      assert.equal(deriveProjectStatus(tasks), "idle");
    });

    it("returns idle when no tasks", () => {
      const tasks: Task[] = [];
      assert.equal(deriveProjectStatus(tasks), "idle");
    });
  });

  describe("Full priority order verification", () => {
    it("correctly prioritizes: needs_response > error > running > idle", () => {
      // All states present - should return needs_response
      const allStates: Task[] = [
        createTask("COMPLETE", "task_1"),
        createTask("CANCELLED", "task_2"),
        createTask("QUEUED", "task_3"),
        createTask("RUNNING", "task_4"),
        createTask("ERROR", "task_5"),
        createTask("AWAITING_RESPONSE", "task_6"),
      ];
      assert.equal(deriveProjectStatus(allStates), "needs_response");

      // Remove AWAITING_RESPONSE - should return error
      const withoutAwaiting = allStates.filter(t => t.state !== "AWAITING_RESPONSE");
      assert.equal(deriveProjectStatus(withoutAwaiting), "error");

      // Remove ERROR - should return running
      const withoutError = withoutAwaiting.filter(t => t.state !== "ERROR");
      assert.equal(deriveProjectStatus(withoutError), "running");

      // Remove RUNNING and QUEUED - should return idle
      const onlyComplete = withoutError.filter(t => t.state !== "RUNNING" && t.state !== "QUEUED");
      assert.equal(deriveProjectStatus(onlyComplete), "idle");
    });
  });
});

describe("deriveLifecycleState - AC-2: Lifecycle determination", () => {
  const now = new Date();

  // Helper to create project with specific timestamps
  const createProject = (
    lastActivityDaysAgo: number,
    lastSeenDaysAgo: number | null = null,
    archived = false
  ): ProjectIndex => {
    const lastActivity = new Date(now);
    lastActivity.setDate(lastActivity.getDate() - lastActivityDaysAgo);

    const project: ProjectIndex = {
      PK: "ORG#org_1",
      SK: "PIDX#proj_1",
      projectId: "proj_1",
      orgId: "org_1",
      projectPath: "/test/project",
      tags: [],
      favorite: false,
      archived,
      status: "idle",
      lastActivityAt: lastActivity.toISOString(),
      sessionCount: 0,
      taskStats: { total: 0, completed: 0, failed: 0, running: 0, awaiting: 0 },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    if (lastSeenDaysAgo !== null) {
      const lastSeen = new Date(now);
      lastSeen.setDate(lastSeen.getDate() - lastSeenDaysAgo);
      project.lastSeenAt = lastSeen.toISOString();
    }

    return project;
  };

  describe("Archived state (highest priority)", () => {
    it("returns ARCHIVED for archived project regardless of activity", () => {
      const project = createProject(0, 0, true); // Recent activity but archived
      assert.equal(deriveLifecycleState(project), "ARCHIVED");
    });

    it("returns ARCHIVED even with old activity when archived", () => {
      const project = createProject(100, null, true);
      assert.equal(deriveLifecycleState(project), "ARCHIVED");
    });
  });

  describe("ACTIVE state (recent meaningful work)", () => {
    it("returns ACTIVE for project with recent activity (< 7 days)", () => {
      const project = createProject(0); // Today
      assert.equal(deriveLifecycleState(project), "ACTIVE");
    });

    it("returns ACTIVE for project with activity 6 days ago", () => {
      const project = createProject(6);
      assert.equal(deriveLifecycleState(project), "ACTIVE");
    });

    it("returns ACTIVE at 6 days (within 7-day threshold)", () => {
      // Use 6 days to avoid timing flakiness at exact boundary
      // The implementation uses `daysSinceWork > 7` so exactly 7 could pass or fail
      // depending on milliseconds elapsed during test execution
      const project = createProject(6);
      assert.equal(deriveLifecycleState(project), "ACTIVE");
    });
  });

  describe("IDLE state (no recent meaningful work)", () => {
    it("returns IDLE for project with activity > 7 days ago", () => {
      const project = createProject(8);
      assert.equal(deriveLifecycleState(project), "IDLE");
    });

    it("returns IDLE for project with activity 30 days ago", () => {
      const project = createProject(30);
      assert.equal(deriveLifecycleState(project), "IDLE");
    });
  });

  describe("AC-2: lastSeenAt does NOT affect lifecycle", () => {
    it("uses lastActivityAt, NOT lastSeenAt for lifecycle determination", () => {
      // Old meaningful work (10 days ago), but recently seen (today)
      // Should still be IDLE because meaningful work is old
      const project = createProject(10, 0); // lastActivity: 10 days ago, lastSeen: today
      assert.equal(deriveLifecycleState(project), "IDLE");
    });

    it("returns ACTIVE based on lastActivityAt even if never seen", () => {
      // Recent meaningful work (today), never seen
      const project = createProject(0, null);
      assert.equal(deriveLifecycleState(project), "ACTIVE");
    });

    it("returns IDLE based on lastActivityAt despite recent lastSeenAt", () => {
      // Old meaningful work (14 days), recent view (1 day)
      const project = createProject(14, 1);
      assert.equal(deriveLifecycleState(project), "IDLE");
    });
  });

  describe("Custom idle threshold", () => {
    it("respects custom idle threshold of 3 days", () => {
      const project = createProject(4); // 4 days ago
      assert.equal(deriveLifecycleState(project, 3), "IDLE");
    });

    it("respects custom idle threshold of 30 days", () => {
      const project = createProject(10); // 10 days ago
      assert.equal(deriveLifecycleState(project, 30), "ACTIVE");
    });
  });
});
