/**
 * Unit tests for TaskTrackerService
 *
 * Tests:
 * - initialize: loads or creates tracker
 * - checkForRecovery: detects unfinished work
 * - Plan management: create, update subtask, complete, cancel
 * - Task management: add, update status, complete
 * - Context management: save checkpoint
 * - Recovery: recover from previous state
 * - Lifecycle: shutdown
 *
 * TDD: Red phase — tests written before implementation.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 9
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TaskTrackerService } from "../../../src/task-tracker/task-tracker-service";
import { NoDynamoDALWithConversations } from "../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../src/web/dal/dal-interface";
import type {
  TrackedTaskStatus,
  SubtaskStatus,
} from "../../../src/web/dal/task-tracker-types";

describe("TaskTrackerService", () => {
  let dal: IDataAccessLayer;
  let service: TaskTrackerService;
  let tmpDir: string;
  const ORG_ID = "test-org";
  const PROJECT_ID = "proj_svc_test";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-svc-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });
    service = new TaskTrackerService(dal, ORG_ID, PROJECT_ID);
  });

  afterEach(() => {
    service.stopPeriodicSnapshots();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==================== Initialization ====================

  describe("initialize", () => {
    it("creates a new tracker when none exists", async () => {
      const tracker = await service.initialize();
      assert.equal(tracker.projectId, PROJECT_ID);
      assert.equal(tracker.orgId, ORG_ID);
      assert.equal(tracker.version, 1);
      assert.equal(tracker.currentPlan, null);
      assert.deepEqual(tracker.activeTasks, []);
    });

    it("loads existing tracker", async () => {
      // Pre-create a tracker via DAL
      const now = new Date().toISOString();
      await dal.upsertTaskTracker({
        PK: `ORG#${ORG_ID}`,
        SK: `TRACKER#${PROJECT_ID}`,
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        currentPlan: null,
        activeTasks: [],
        completedTaskIds: [],
        lastContextSummary: "Previous work",
        lastCheckpointAt: null,
        recoveryHint: "Do X next",
        version: 5,
        createdAt: now,
        updatedAt: now,
      });

      const tracker = await service.initialize();
      assert.equal(tracker.version, 5);
      assert.equal(tracker.lastContextSummary, "Previous work");
      assert.equal(tracker.recoveryHint, "Do X next");
    });
  });

  // ==================== Recovery Detection ====================

  describe("checkForRecovery", () => {
    it("returns null when no tracker exists", async () => {
      const info = await service.checkForRecovery();
      assert.equal(info, null);
    });

    it("returns null when tracker has no unfinished work", async () => {
      await service.initialize();
      const info = await service.checkForRecovery();
      assert.notEqual(info, null);
      assert.equal(info!.hasUnfinishedWork, false);
    });

    it("detects unfinished work when active tasks exist", async () => {
      await service.initialize();
      await service.addTask({ title: "Unfinished task", status: "RUNNING", priority: 50 });

      const info = await service.checkForRecovery();
      assert.notEqual(info, null);
      assert.equal(info!.hasUnfinishedWork, true);
      assert.equal(info!.activeTaskCount, 1);
    });

    it("detects unfinished work when plan has pending subtasks", async () => {
      await service.initialize();
      await service.createPlan("Do something", [
        { subtaskId: "st_1", description: "Step 1", status: "DONE", order: 0, dependencies: [] },
        { subtaskId: "st_2", description: "Step 2", status: "PENDING", order: 1, dependencies: [] },
      ]);

      const info = await service.checkForRecovery();
      assert.notEqual(info, null);
      assert.equal(info!.hasUnfinishedWork, true);
      assert.notEqual(info!.activePlan, null);
    });

    it("returns context summary and recovery hint", async () => {
      await service.initialize();
      await service.updateContext("Working on feature X", "Next: test Y");

      const info = await service.checkForRecovery();
      assert.notEqual(info, null);
      assert.equal(info!.contextSummary, "Working on feature X");
      assert.equal(info!.recoveryHint, "Next: test Y");
    });
  });

  // ==================== Plan Management ====================

  describe("createPlan", () => {
    it("creates a plan with subtasks", async () => {
      await service.initialize();
      const plan = await service.createPlan("Add auth feature", [
        { subtaskId: "st_1", description: "Create model", status: "PENDING", order: 0, dependencies: [] },
        { subtaskId: "st_2", description: "Add API", status: "PENDING", order: 1, dependencies: [] },
      ]);

      assert.ok(plan.planId.startsWith("plan_"));
      assert.equal(plan.title, "Add auth feature");
      assert.equal(plan.status, "EXECUTING");
      assert.equal(plan.subtasks.length, 2);
    });

    it("stores plan in tracker", async () => {
      await service.initialize();
      await service.createPlan("Test plan", [
        { subtaskId: "st_1", description: "Step 1", status: "PENDING", order: 0, dependencies: [] },
      ]);

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.notEqual(tracker, null);
      assert.notEqual(tracker!.currentPlan, null);
      assert.equal(tracker!.currentPlan!.title, "Test plan");
    });
  });

  describe("updateSubtaskStatus", () => {
    it("updates a subtask status", async () => {
      await service.initialize();
      await service.createPlan("Test", [
        { subtaskId: "st_1", description: "Step 1", status: "PENDING", order: 0, dependencies: [] },
      ]);

      await service.updateSubtaskStatus("st_1", "IN_PROGRESS");

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(tracker!.currentPlan!.subtasks[0].status, "IN_PROGRESS");
    });

    it("updates subtask with result on completion", async () => {
      await service.initialize();
      await service.createPlan("Test", [
        { subtaskId: "st_1", description: "Step 1", status: "IN_PROGRESS", order: 0, dependencies: [] },
      ]);

      await service.updateSubtaskStatus("st_1", "DONE", "Successfully created model");

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(tracker!.currentPlan!.subtasks[0].status, "DONE");
      assert.equal(tracker!.currentPlan!.subtasks[0].result, "Successfully created model");
    });

    it("throws when no plan exists", async () => {
      await service.initialize();
      await assert.rejects(
        () => service.updateSubtaskStatus("st_1", "DONE"),
        /no active plan/i
      );
    });

    it("throws when subtask not found", async () => {
      await service.initialize();
      await service.createPlan("Test", [
        { subtaskId: "st_1", description: "Step 1", status: "PENDING", order: 0, dependencies: [] },
      ]);

      await assert.rejects(
        () => service.updateSubtaskStatus("st_nonexistent", "DONE"),
        /subtask.*not found/i
      );
    });
  });

  describe("completePlan", () => {
    it("marks plan as COMPLETED", async () => {
      await service.initialize();
      await service.createPlan("Test", [
        { subtaskId: "st_1", description: "Step 1", status: "DONE", order: 0, dependencies: [] },
      ]);

      await service.completePlan();

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(tracker!.currentPlan!.status, "COMPLETED");
    });

    it("creates a snapshot on plan completion", async () => {
      await service.initialize();
      await service.createPlan("Test", [
        { subtaskId: "st_1", description: "Step 1", status: "DONE", order: 0, dependencies: [] },
      ]);

      await service.completePlan();

      const snapshot = await dal.getLatestTaskSnapshot(PROJECT_ID);
      assert.notEqual(snapshot, null);
      assert.equal(snapshot!.trigger, "PLAN_PHASE_CHANGE");
    });
  });

  describe("cancelPlan", () => {
    it("marks plan as CANCELLED", async () => {
      await service.initialize();
      await service.createPlan("Test", [
        { subtaskId: "st_1", description: "Step 1", status: "PENDING", order: 0, dependencies: [] },
      ]);

      await service.cancelPlan();

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(tracker!.currentPlan!.status, "CANCELLED");
    });
  });

  // ==================== Task Management ====================

  describe("addTask", () => {
    it("adds a task to active tasks", async () => {
      await service.initialize();
      const task = await service.addTask({
        title: "New task",
        status: "QUEUED",
        priority: 75,
      });

      assert.ok(task.taskId.startsWith("task_"));
      assert.equal(task.title, "New task");
      assert.equal(task.status, "QUEUED");
      assert.equal(task.priority, 75);

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(tracker!.activeTasks.length, 1);
    });
  });

  describe("updateTaskStatus", () => {
    it("updates a task status", async () => {
      await service.initialize();
      const task = await service.addTask({ title: "My task", status: "QUEUED", priority: 50 });

      await service.updateTaskStatus(task.taskId, "RUNNING");

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      const found = tracker!.activeTasks.find((t) => t.taskId === task.taskId);
      assert.equal(found!.status, "RUNNING");
    });

    it("throws when task not found", async () => {
      await service.initialize();
      await assert.rejects(
        () => service.updateTaskStatus("task_nonexistent", "RUNNING"),
        /task.*not found/i
      );
    });
  });

  describe("completeTask", () => {
    it("marks task as DONE and moves to completedTaskIds", async () => {
      await service.initialize();
      const task = await service.addTask({ title: "My task", status: "RUNNING", priority: 50 });

      await service.completeTask(task.taskId);

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      // Task should be removed from activeTasks
      assert.equal(tracker!.activeTasks.find((t) => t.taskId === task.taskId), undefined);
      // Task ID should be in completedTaskIds
      assert.ok(tracker!.completedTaskIds.includes(task.taskId));
    });

    it("creates a snapshot on task completion", async () => {
      await service.initialize();
      const task = await service.addTask({ title: "My task", status: "RUNNING", priority: 50 });

      await service.completeTask(task.taskId);

      const snapshot = await dal.getLatestTaskSnapshot(PROJECT_ID);
      assert.notEqual(snapshot, null);
      assert.equal(snapshot!.trigger, "TASK_COMPLETE");
    });
  });

  // ==================== Context Management ====================

  describe("updateContext", () => {
    it("updates context summary and recovery hint", async () => {
      await service.initialize();
      await service.updateContext("Working on X", "Next: do Y");

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(tracker!.lastContextSummary, "Working on X");
      assert.equal(tracker!.recoveryHint, "Next: do Y");
    });
  });

  describe("saveCheckpoint", () => {
    it("creates a snapshot with current tracker state", async () => {
      await service.initialize();
      await service.addTask({ title: "Active task", status: "RUNNING", priority: 50 });

      const snapshot = await service.saveCheckpoint("USER_REQUESTED");

      assert.equal(snapshot.trigger, "USER_REQUESTED");
      assert.equal(snapshot.projectId, PROJECT_ID);
      assert.ok(snapshot.trackerState.activeTasks.length > 0);
    });

    it("updates lastCheckpointAt on tracker", async () => {
      await service.initialize();
      await service.saveCheckpoint("PERIODIC");

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.notEqual(tracker!.lastCheckpointAt, null);
    });
  });

  // ==================== Recovery ====================

  describe("recover", () => {
    it("returns recovered=false when no tracker exists", async () => {
      const result = await service.recover();
      assert.equal(result.recovered, false);
      assert.equal(result.plan, null);
      assert.deepEqual(result.activeTasks, []);
      assert.equal(result.recoveryPrompt, "");
    });

    it("recovers plan and active tasks", async () => {
      // Set up state
      await service.initialize();
      await service.createPlan("Auth feature", [
        { subtaskId: "st_1", description: "Step 1", status: "DONE", order: 0, dependencies: [] },
        { subtaskId: "st_2", description: "Step 2", status: "IN_PROGRESS", order: 1, dependencies: [] },
      ]);
      await service.addTask({ title: "Current work", status: "RUNNING", priority: 50 });
      await service.updateContext("Working on step 2", "Continue step 2");
      await service.saveCheckpoint("SESSION_END");

      // Create a new service instance (simulating new session)
      const newService = new TaskTrackerService(dal, ORG_ID, PROJECT_ID);
      const result = await newService.recover();

      assert.equal(result.recovered, true);
      assert.notEqual(result.plan, null);
      assert.equal(result.plan!.title, "Auth feature");
      assert.ok(result.activeTasks.length > 0);
      assert.ok(result.recoveryPrompt.length > 0);
      assert.ok(result.recoveryPrompt.includes("Working on step 2"));
    });
  });

  // ==================== Lifecycle ====================

  describe("resetTracker", () => {
    it("deletes the tracker", async () => {
      await service.initialize();
      await service.addTask({ title: "Task", status: "RUNNING", priority: 50 });

      await service.resetTracker();

      const tracker = await dal.getTaskTracker(PROJECT_ID);
      assert.equal(tracker, null);
    });
  });

  describe("shutdown", () => {
    it("saves a SESSION_END snapshot", async () => {
      await service.initialize();
      await service.addTask({ title: "Active", status: "RUNNING", priority: 50 });

      await service.shutdown();

      const snapshot = await dal.getLatestTaskSnapshot(PROJECT_ID);
      assert.notEqual(snapshot, null);
      assert.equal(snapshot!.trigger, "SESSION_END");
    });

    it("stops periodic snapshots", async () => {
      await service.initialize();
      service.startPeriodicSnapshots(100); // 100ms for test

      await service.shutdown();

      // Verify no more snapshots are created after shutdown
      const countBefore = (await dal.listTaskSnapshots(PROJECT_ID)).length;
      await new Promise((r) => setTimeout(r, 250));
      const countAfter = (await dal.listTaskSnapshots(PROJECT_ID)).length;
      assert.equal(countAfter, countBefore);
    });
  });

  // ==================== Periodic Snapshots ====================

  describe("startPeriodicSnapshots / stopPeriodicSnapshots", () => {
    it("creates snapshots at intervals", async () => {
      await service.initialize();
      service.startPeriodicSnapshots(50); // 50ms for test

      await new Promise((r) => setTimeout(r, 180));
      service.stopPeriodicSnapshots();

      const snapshots = await dal.listTaskSnapshots(PROJECT_ID);
      // Should have at least 2 snapshots in ~180ms at 50ms intervals
      assert.ok(snapshots.length >= 2, `Expected >= 2 snapshots, got ${snapshots.length}`);
      assert.equal(snapshots[0].trigger, "PERIODIC");
    });

    it("stop prevents further snapshots", async () => {
      await service.initialize();
      service.startPeriodicSnapshots(50);

      await new Promise((r) => setTimeout(r, 80));
      service.stopPeriodicSnapshots();

      const countAtStop = (await dal.listTaskSnapshots(PROJECT_ID)).length;
      await new Promise((r) => setTimeout(r, 150));
      const countLater = (await dal.listTaskSnapshots(PROJECT_ID)).length;

      assert.equal(countLater, countAtStop);
    });
  });
});
