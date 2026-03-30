/**
 * Unit tests for Task Tracker CLI integration
 *
 * Tests the integration points between cli/index.ts and TaskTrackerService:
 * - initializeTaskTracker: creates service and initializes
 * - checkForRecovery: detects unfinished work and logs recovery info
 * - shutdownTaskTracker: saves snapshot on shutdown
 *
 * TDD: Red phase — tests written before integration functions exist.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 10
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { TaskTrackerService } from "../../../src/task-tracker/task-tracker-service";
import { NoDynamoDALWithConversations } from "../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../src/web/dal/dal-interface";
import {
  initializeTaskTracker,
  shutdownTaskTracker,
} from "../../../src/cli/task-tracker-integration";

describe("Task Tracker CLI Integration", () => {
  let dal: IDataAccessLayer;
  let tmpDir: string;
  const ORG_ID = "test-org";
  const PROJECT_ID = "proj_cli_test";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-cli-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("initializeTaskTracker", () => {
    it("should create and initialize TaskTrackerService", async () => {
      const result = await initializeTaskTracker(dal, ORG_ID, PROJECT_ID);

      assert.ok(result.service, "service should be created");
      assert.ok(result.tracker, "tracker should be returned");
      assert.equal(result.tracker.projectId, PROJECT_ID);
    });

    it("should detect recovery info when unfinished work exists", async () => {
      // First, create a service with an active plan
      const service = new TaskTrackerService(dal, ORG_ID, PROJECT_ID);
      await service.initialize();
      await service.createPlan("Test plan", [
        { subtaskId: "sub_1", description: "Step 1", status: "PENDING", order: 1, dependencies: [] },
        { subtaskId: "sub_2", description: "Step 2", status: "PENDING", order: 2, dependencies: [] },
      ]);
      await service.shutdown();

      // Now reinitialize — should detect recovery
      const result = await initializeTaskTracker(dal, ORG_ID, PROJECT_ID);
      assert.ok(result.recoveryInfo, "recoveryInfo should be present");
      assert.equal(result.recoveryInfo!.hasUnfinishedWork, true);
    });

    it("should return null recoveryInfo when no previous work", async () => {
      const result = await initializeTaskTracker(dal, ORG_ID, PROJECT_ID);
      // Fresh tracker, no unfinished work
      assert.ok(result.recoveryInfo !== null, "recoveryInfo should not be null for fresh tracker");
      assert.equal(result.recoveryInfo!.hasUnfinishedWork, false);
    });
  });

  describe("shutdownTaskTracker", () => {
    it("should save snapshot on shutdown", async () => {
      const result = await initializeTaskTracker(dal, ORG_ID, PROJECT_ID);

      // Should not throw
      await shutdownTaskTracker(result.service);

      // Verify snapshot was saved by checking snapshots
      const snapshots = await dal.listTaskSnapshots(PROJECT_ID, 10);
      assert.ok(snapshots.length >= 1, "should have at least one snapshot after shutdown");
      assert.equal(snapshots[0].trigger, "SESSION_END");
    });

    it("should handle null service gracefully", async () => {
      // Should not throw with null
      await shutdownTaskTracker(null);
    });
  });
});
