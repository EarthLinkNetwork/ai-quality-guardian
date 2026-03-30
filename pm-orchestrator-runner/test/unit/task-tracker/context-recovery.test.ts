/**
 * Unit tests for context-recovery module
 *
 * Tests:
 * - Recovery prompt generation from TaskTracker + TaskSnapshot
 * - Edge cases: no plan, no tasks, no snapshot, partial data
 *
 * TDD: Red phase — tests written before implementation.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 6.3
 */

import { describe, it } from "mocha";
import { strict as assert } from "assert";
import { generateRecoveryPrompt } from "../../../src/task-tracker/context-recovery";
import type {
  TaskTracker,
  TaskSnapshot,
  TaskPlan,
  TrackedTask,
} from "../../../src/web/dal/task-tracker-types";

describe("context-recovery", () => {
  describe("generateRecoveryPrompt", () => {
    it("returns empty string when tracker has no data and no snapshot", () => {
      const tracker = createEmptyTracker();
      const result = generateRecoveryPrompt(tracker, null);
      assert.equal(result, "");
    });

    it("includes context summary from snapshot when available", () => {
      const tracker = createEmptyTracker();
      const snapshot = createSnapshot({
        contextSummary: "Working on user authentication feature",
      });

      const result = generateRecoveryPrompt(tracker, snapshot);
      assert.ok(result.includes("Previous Context"));
      assert.ok(result.includes("Working on user authentication feature"));
    });

    it("falls back to tracker lastContextSummary when no snapshot", () => {
      const tracker = createEmptyTracker();
      tracker.lastContextSummary = "Implementing login API";

      const result = generateRecoveryPrompt(tracker, null);
      assert.ok(result.includes("Previous Context"));
      assert.ok(result.includes("Implementing login API"));
    });

    it("prefers snapshot contextSummary over tracker lastContextSummary", () => {
      const tracker = createEmptyTracker();
      tracker.lastContextSummary = "Old context from tracker";
      const snapshot = createSnapshot({
        contextSummary: "Fresh context from snapshot",
      });

      const result = generateRecoveryPrompt(tracker, snapshot);
      assert.ok(result.includes("Fresh context from snapshot"));
      assert.ok(!result.includes("Old context from tracker"));
    });

    it("includes plan progress when plan exists", () => {
      const tracker = createEmptyTracker();
      tracker.currentPlan = createPlan({
        title: "Add user authentication",
        subtasks: [
          { subtaskId: "st_1", description: "Create user model", status: "DONE", order: 0, dependencies: [] },
          { subtaskId: "st_2", description: "Implement login API", status: "DONE", order: 1, dependencies: [] },
          { subtaskId: "st_3", description: "Add JWT middleware", status: "IN_PROGRESS", order: 2, dependencies: [] },
          { subtaskId: "st_4", description: "Create login UI", status: "PENDING", order: 3, dependencies: [] },
          { subtaskId: "st_5", description: "Write E2E tests", status: "PENDING", order: 4, dependencies: [] },
        ],
      });

      const result = generateRecoveryPrompt(tracker, null);
      assert.ok(result.includes("Add user authentication"));
      assert.ok(result.includes("2/5 completed"));
      assert.ok(result.includes("Remaining Subtasks"));
      assert.ok(result.includes("Add JWT middleware"));
      assert.ok(result.includes("Create login UI"));
      assert.ok(result.includes("Write E2E tests"));
      // Completed subtasks should NOT be in remaining
      assert.ok(!result.includes("Create user model"));
      assert.ok(!result.includes("Implement login API"));
    });

    it("excludes SKIPPED subtasks from remaining count", () => {
      const tracker = createEmptyTracker();
      tracker.currentPlan = createPlan({
        title: "Test Plan",
        subtasks: [
          { subtaskId: "st_1", description: "Task A", status: "DONE", order: 0, dependencies: [] },
          { subtaskId: "st_2", description: "Task B", status: "SKIPPED", order: 1, dependencies: [] },
          { subtaskId: "st_3", description: "Task C", status: "PENDING", order: 2, dependencies: [] },
        ],
      });

      const result = generateRecoveryPrompt(tracker, null);
      assert.ok(result.includes("1/3 completed"));
      // SKIPPED should not be in remaining
      assert.ok(!result.includes("Task B"));
    });

    it("includes active tasks with context snippets", () => {
      const tracker = createEmptyTracker();
      tracker.activeTasks = [
        createTask({
          title: "Create login form component",
          status: "RUNNING",
          contextSnippet: "Added validation with zod schema",
        }),
        createTask({
          title: "Update user model",
          status: "QUEUED",
        }),
      ];

      const result = generateRecoveryPrompt(tracker, null);
      assert.ok(result.includes("Active Tasks"));
      assert.ok(result.includes("Create login form component"));
      assert.ok(result.includes("RUNNING"));
      assert.ok(result.includes("Added validation with zod schema"));
      assert.ok(result.includes("Update user model"));
      assert.ok(result.includes("QUEUED"));
    });

    it("does not include DONE/FAILED/CANCELLED tasks in active section", () => {
      const tracker = createEmptyTracker();
      tracker.activeTasks = [
        createTask({ title: "Active task", status: "RUNNING" }),
        createTask({ title: "Done task", status: "DONE" }),
        createTask({ title: "Failed task", status: "FAILED" }),
        createTask({ title: "Cancelled task", status: "CANCELLED" }),
      ];

      const result = generateRecoveryPrompt(tracker, null);
      assert.ok(result.includes("Active task"));
      assert.ok(!result.includes("Done task"));
      assert.ok(!result.includes("Failed task"));
      assert.ok(!result.includes("Cancelled task"));
    });

    it("includes recovery hint when present", () => {
      const tracker = createEmptyTracker();
      tracker.recoveryHint = "Next: implement the login form validation";

      const result = generateRecoveryPrompt(tracker, null);
      assert.ok(result.includes("Next Action"));
      assert.ok(result.includes("Next: implement the login form validation"));
    });

    it("includes git state from snapshot when available", () => {
      const tracker = createEmptyTracker();
      const snapshot = createSnapshot({
        contextSummary: "Some context",
        gitState: {
          branch: "feature/auth",
          commitHash: "abc123def",
          uncommittedChanges: 3,
        },
      });

      const result = generateRecoveryPrompt(tracker, snapshot);
      assert.ok(result.includes("Git State"));
      assert.ok(result.includes("feature/auth"));
      assert.ok(result.includes("abc123def"));
      assert.ok(result.includes("3"));
    });

    it("generates a complete prompt with all sections", () => {
      const tracker = createEmptyTracker();
      tracker.currentPlan = createPlan({
        title: "Full feature",
        subtasks: [
          { subtaskId: "st_1", description: "Done task", status: "DONE", order: 0, dependencies: [] },
          { subtaskId: "st_2", description: "Current task", status: "IN_PROGRESS", order: 1, dependencies: [] },
        ],
      });
      tracker.activeTasks = [
        createTask({ title: "Working on it", status: "RUNNING", contextSnippet: "Half done" }),
      ];
      tracker.recoveryHint = "Continue with current task";

      const snapshot = createSnapshot({
        contextSummary: "Building a full feature with multiple steps",
        gitState: { branch: "feature/full", commitHash: "xyz789", uncommittedChanges: 1 },
      });

      const result = generateRecoveryPrompt(tracker, snapshot);

      // All sections present
      assert.ok(result.includes("Previous Context"));
      assert.ok(result.includes("Plan:"));
      assert.ok(result.includes("Remaining Subtasks"));
      assert.ok(result.includes("Active Tasks"));
      assert.ok(result.includes("Next Action"));
      assert.ok(result.includes("Git State"));
    });
  });
});

// ==================== Helpers ====================

function createEmptyTracker(): TaskTracker {
  const now = new Date().toISOString();
  return {
    PK: "ORG#test-org",
    SK: "TRACKER#proj_test",
    projectId: "proj_test",
    orgId: "test-org",
    currentPlan: null,
    activeTasks: [],
    completedTaskIds: [],
    lastContextSummary: null,
    lastCheckpointAt: null,
    recoveryHint: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function createPlan(overrides: Partial<TaskPlan> & { title: string; subtasks: TaskPlan["subtasks"] }): TaskPlan {
  const now = new Date().toISOString();
  return {
    planId: "plan_test",
    originalPrompt: "Test prompt",
    status: "EXECUTING",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTask(overrides: Partial<TrackedTask> & { title: string; status: TrackedTask["status"] }): TrackedTask {
  return {
    taskId: `task_${Math.random().toString(36).slice(2, 8)}`,
    priority: 50,
    lastUpdate: new Date().toISOString(),
    ...overrides,
  };
}

function createSnapshot(overrides: Partial<TaskSnapshot> & { contextSummary: string }): TaskSnapshot {
  const tracker = createEmptyTracker();
  const now = new Date().toISOString();
  return {
    PK: "ORG#test-org",
    SK: `TSNAP#proj_test#snap_${Date.now()}`,
    snapshotId: `snap_${Date.now()}`,
    projectId: "proj_test",
    orgId: "test-org",
    trigger: "PERIODIC",
    trackerState: tracker,
    filesModified: [],
    createdAt: now,
    ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    ...overrides,
  };
}
