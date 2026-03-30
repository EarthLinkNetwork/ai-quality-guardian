/**
 * Unit tests for SnapshotManager
 *
 * Tests:
 * - createSnapshot: creates snapshots with correct trigger
 * - Snapshot retention: limits number of snapshots per project
 * - getGitState: captures current git state (mocked)
 *
 * TDD: Red phase — tests written before implementation.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 6, 7
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SnapshotManager } from "../../../src/task-tracker/snapshot-manager";
import { NoDynamoDALWithConversations } from "../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../src/web/dal/dal-interface";
import type {
  TaskTracker,
  SnapshotTrigger,
} from "../../../src/web/dal/task-tracker-types";

describe("SnapshotManager", () => {
  let dal: IDataAccessLayer;
  let manager: SnapshotManager;
  let tmpDir: string;
  const ORG_ID = "test-org";
  const PROJECT_ID = "proj_snap_test";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-mgr-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });
    manager = new SnapshotManager(dal, ORG_ID, PROJECT_ID);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("createSnapshot", () => {
    it("creates a snapshot with given trigger and tracker state", async () => {
      const tracker = createTracker();
      const snapshot = await manager.createSnapshot(
        tracker,
        "PERIODIC",
        "Working on feature",
        ["src/index.ts"]
      );

      assert.ok(snapshot.snapshotId.startsWith("snap_"));
      assert.equal(snapshot.trigger, "PERIODIC");
      assert.equal(snapshot.contextSummary, "Working on feature");
      assert.deepEqual(snapshot.filesModified, ["src/index.ts"]);
      assert.equal(snapshot.projectId, PROJECT_ID);
    });

    it("creates snapshot with TASK_COMPLETE trigger", async () => {
      const tracker = createTracker();
      const snapshot = await manager.createSnapshot(
        tracker,
        "TASK_COMPLETE",
        "Completed auth module",
        ["src/auth.ts", "test/auth.test.ts"]
      );

      assert.equal(snapshot.trigger, "TASK_COMPLETE");
      assert.deepEqual(snapshot.filesModified, ["src/auth.ts", "test/auth.test.ts"]);
    });

    it("stores tracker state in snapshot", async () => {
      const tracker = createTracker();
      tracker.lastContextSummary = "Important context";
      tracker.activeTasks = [
        {
          taskId: "task_1",
          title: "Active task",
          status: "RUNNING",
          priority: 50,
          lastUpdate: new Date().toISOString(),
        },
      ];

      const snapshot = await manager.createSnapshot(tracker, "PERIODIC", "Context", []);

      assert.equal(snapshot.trackerState.lastContextSummary, "Important context");
      assert.equal(snapshot.trackerState.activeTasks.length, 1);
    });

    it("includes git state when provided", async () => {
      const tracker = createTracker();
      const gitState = {
        branch: "feature/test",
        commitHash: "abc123",
        uncommittedChanges: 2,
      };

      const snapshot = await manager.createSnapshot(
        tracker,
        "SESSION_END",
        "Ending session",
        [],
        gitState
      );

      assert.deepEqual(snapshot.gitState, gitState);
    });
  });

  describe("getLatestSnapshot", () => {
    it("returns null when no snapshots exist", async () => {
      const result = await manager.getLatestSnapshot();
      assert.equal(result, null);
    });

    it("returns the most recent snapshot", async () => {
      const tracker = createTracker();

      await manager.createSnapshot(tracker, "PERIODIC", "First", []);
      await new Promise((r) => setTimeout(r, 10));
      await manager.createSnapshot(tracker, "PERIODIC", "Second", []);

      const latest = await manager.getLatestSnapshot();
      assert.notEqual(latest, null);
      assert.equal(latest!.contextSummary, "Second");
    });
  });

  describe("listSnapshots", () => {
    it("returns empty array when no snapshots exist", async () => {
      const result = await manager.listSnapshots();
      assert.deepEqual(result, []);
    });

    it("lists snapshots with limit", async () => {
      const tracker = createTracker();

      for (let i = 0; i < 5; i++) {
        await manager.createSnapshot(tracker, "PERIODIC", `Snapshot ${i}`, []);
        await new Promise((r) => setTimeout(r, 5));
      }

      const result = await manager.listSnapshots(3);
      assert.equal(result.length, 3);
    });
  });
});

// ==================== Helpers ====================

function createTracker(): TaskTracker {
  const now = new Date().toISOString();
  return {
    PK: "ORG#test-org",
    SK: "TRACKER#proj_snap_test",
    projectId: "proj_snap_test",
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
