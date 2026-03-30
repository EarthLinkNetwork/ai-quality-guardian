/**
 * Task Tracker Routes Unit Tests
 *
 * Tests for /api/tracker/:projectId/* endpoints (Phase 4).
 * Uses NoDynamo DAL for testing (same pattern as claude-settings.test.ts).
 *
 * TDD: Red phase — write tests first, then implement routes.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 11
 */

import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import request from "supertest";
import express from "express";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NoDynamoDALWithConversations } from "../../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../../src/web/dal/dal-interface";
import type {
  TaskTracker,
  TaskPlan,
} from "../../../../src/web/dal/task-tracker-types";
import { createTaskTrackerRoutes } from "../../../../src/web/routes/task-tracker";

describe("Task Tracker Routes", () => {
  let app: express.Express;
  let dal: IDataAccessLayer;
  let tmpDir: string;
  const ORG_ID = "test-org";
  const PROJECT_ID = "proj_routes_test";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-routes-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });

    app = express();
    app.use(express.json());
    app.use("/api/tracker", createTaskTrackerRoutes({ dal }));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper: seed a tracker
  async function seedTracker(overrides?: Partial<TaskTracker>): Promise<TaskTracker> {
    const now = new Date().toISOString();
    const tracker: TaskTracker = {
      PK: `ORG#${ORG_ID}`,
      SK: `TRACKER#${PROJECT_ID}`,
      projectId: PROJECT_ID,
      orgId: ORG_ID,
      currentPlan: null,
      activeTasks: [],
      completedTaskIds: [],
      lastContextSummary: null,
      lastCheckpointAt: null,
      recoveryHint: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    return dal.upsertTaskTracker(tracker);
  }

  // Helper: seed a plan
  function createTestPlan(): TaskPlan {
    const now = new Date().toISOString();
    return {
      planId: "plan_test1",
      title: "Test Plan",
      originalPrompt: "Implement feature X",
      subtasks: [
        {
          subtaskId: "st_1",
          description: "Design component",
          status: "DONE",
          order: 0,
          dependencies: [],
        },
        {
          subtaskId: "st_2",
          description: "Implement component",
          status: "IN_PROGRESS",
          order: 1,
          dependencies: ["st_1"],
        },
      ],
      status: "EXECUTING",
      createdAt: now,
      updatedAt: now,
    };
  }

  // ==================== GET /api/tracker/:projectId ====================

  describe("GET /api/tracker/:projectId", () => {
    it("returns 404 when tracker does not exist", async () => {
      const res = await request(app).get(`/api/tracker/${PROJECT_ID}`);
      assert.equal(res.status, 404);
      assert.equal(res.body.error, "NOT_FOUND");
    });

    it("returns tracker when it exists", async () => {
      await seedTracker();
      const res = await request(app).get(`/api/tracker/${PROJECT_ID}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.projectId, PROJECT_ID);
      assert.equal(res.body.version, 1);
    });

    it("returns tracker with plan and tasks", async () => {
      await seedTracker({
        currentPlan: createTestPlan(),
        activeTasks: [
          {
            taskId: "task_1",
            title: "Active task",
            status: "RUNNING",
            priority: 50,
            lastUpdate: new Date().toISOString(),
          },
        ],
      });
      const res = await request(app).get(`/api/tracker/${PROJECT_ID}`);
      assert.equal(res.status, 200);
      assert.notEqual(res.body.currentPlan, null);
      assert.equal(res.body.currentPlan.planId, "plan_test1");
      assert.equal(res.body.activeTasks.length, 1);
    });
  });

  // ==================== PUT /api/tracker/:projectId ====================

  describe("PUT /api/tracker/:projectId", () => {
    it("creates a new tracker when none exists", async () => {
      const res = await request(app)
        .put(`/api/tracker/${PROJECT_ID}`)
        .send({
          orgId: ORG_ID,
          currentPlan: null,
          activeTasks: [],
          lastContextSummary: "Initial context",
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.projectId, PROJECT_ID);
      assert.equal(res.body.lastContextSummary, "Initial context");
    });

    it("updates an existing tracker", async () => {
      await seedTracker();
      const res = await request(app)
        .put(`/api/tracker/${PROJECT_ID}`)
        .send({
          orgId: ORG_ID,
          lastContextSummary: "Updated context",
          recoveryHint: "Continue from step 3",
        });
      assert.equal(res.status, 200);
      assert.equal(res.body.lastContextSummary, "Updated context");
      assert.equal(res.body.recoveryHint, "Continue from step 3");
    });

    it("returns 400 when orgId is missing", async () => {
      const res = await request(app)
        .put(`/api/tracker/${PROJECT_ID}`)
        .send({});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, "VALIDATION_ERROR");
    });
  });

  // ==================== GET /api/tracker/:projectId/snapshots ====================

  describe("GET /api/tracker/:projectId/snapshots", () => {
    it("returns empty array when no snapshots exist", async () => {
      const res = await request(app).get(`/api/tracker/${PROJECT_ID}/snapshots`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.snapshots, []);
    });

    it("returns snapshots after creation", async () => {
      const tracker = await seedTracker();
      await dal.createTaskSnapshot({
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        trigger: "USER_REQUESTED",
        trackerState: tracker,
        contextSummary: "Test snapshot context",
        filesModified: ["file1.ts"],
      });

      const res = await request(app).get(`/api/tracker/${PROJECT_ID}/snapshots`);
      assert.equal(res.status, 200);
      assert.equal(res.body.snapshots.length, 1);
      assert.equal(res.body.snapshots[0].trigger, "USER_REQUESTED");
      assert.equal(res.body.snapshots[0].contextSummary, "Test snapshot context");
    });

    it("respects limit query parameter", async () => {
      const tracker = await seedTracker();
      // Create 3 snapshots
      for (let i = 0; i < 3; i++) {
        await dal.createTaskSnapshot({
          projectId: PROJECT_ID,
          orgId: ORG_ID,
          trigger: "PERIODIC",
          trackerState: tracker,
          contextSummary: `Snapshot ${i}`,
          filesModified: [],
        });
      }

      const res = await request(app).get(`/api/tracker/${PROJECT_ID}/snapshots?limit=2`);
      assert.equal(res.status, 200);
      assert.equal(res.body.snapshots.length, 2);
    });
  });

  // ==================== POST /api/tracker/:projectId/snapshots ====================

  describe("POST /api/tracker/:projectId/snapshots", () => {
    it("creates a manual snapshot", async () => {
      await seedTracker();

      const res = await request(app)
        .post(`/api/tracker/${PROJECT_ID}/snapshots`)
        .send({
          contextSummary: "Manual snapshot context",
          filesModified: ["src/main.ts", "src/utils.ts"],
        });
      assert.equal(res.status, 201);
      assert.equal(res.body.trigger, "USER_REQUESTED");
      assert.equal(res.body.contextSummary, "Manual snapshot context");
      assert.deepEqual(res.body.filesModified, ["src/main.ts", "src/utils.ts"]);
    });

    it("returns 404 when tracker does not exist for snapshot", async () => {
      const res = await request(app)
        .post(`/api/tracker/${PROJECT_ID}/snapshots`)
        .send({
          contextSummary: "No tracker exists",
          filesModified: [],
        });
      assert.equal(res.status, 404);
      assert.equal(res.body.error, "NOT_FOUND");
    });
  });

  // ==================== GET /api/tracker/:projectId/summaries ====================

  describe("GET /api/tracker/:projectId/summaries", () => {
    it("returns empty array when no summaries exist", async () => {
      const res = await request(app).get(`/api/tracker/${PROJECT_ID}/summaries`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.summaries, []);
    });

    it("returns summaries after creation", async () => {
      await dal.createTaskSummary({
        taskId: "task_sum1",
        projectId: PROJECT_ID,
        orgId: ORG_ID,
        title: "Completed task",
        summary: "Implemented the feature successfully",
        keyDecisions: ["Used React", "Chose REST over GraphQL"],
        filesChanged: ["src/feature.ts"],
        generatedBy: "test-model",
      });

      const res = await request(app).get(`/api/tracker/${PROJECT_ID}/summaries`);
      assert.equal(res.status, 200);
      assert.equal(res.body.summaries.length, 1);
      assert.equal(res.body.summaries[0].title, "Completed task");
      assert.equal(res.body.summaries[0].summary, "Implemented the feature successfully");
    });
  });

  // ==================== POST /api/tracker/:projectId/recover ====================

  describe("POST /api/tracker/:projectId/recover", () => {
    it("returns recovered=false when no tracker exists", async () => {
      const res = await request(app)
        .post(`/api/tracker/${PROJECT_ID}/recover`);
      assert.equal(res.status, 200);
      assert.equal(res.body.recovered, false);
      assert.equal(res.body.recoveryPrompt, "");
    });

    it("returns recovery info when tracker has active tasks", async () => {
      await seedTracker({
        currentPlan: createTestPlan(),
        activeTasks: [
          {
            taskId: "task_r1",
            title: "Running task",
            status: "RUNNING",
            priority: 80,
            lastUpdate: new Date().toISOString(),
            contextSnippet: "Working on component X",
          },
        ],
        lastContextSummary: "Was implementing feature X",
        recoveryHint: "Continue with component X",
      });

      const res = await request(app)
        .post(`/api/tracker/${PROJECT_ID}/recover`);
      assert.equal(res.status, 200);
      assert.equal(res.body.recovered, true);
      assert.notEqual(res.body.plan, null);
      assert.equal(res.body.activeTasks.length, 1);
      assert.ok(res.body.recoveryPrompt.length > 0);
    });
  });

  // ==================== GET /api/tracker/:projectId/recovery ====================

  describe("GET /api/tracker/:projectId/recovery", () => {
    it("returns hasUnfinishedWork=false when no tracker exists", async () => {
      const res = await request(app).get(`/api/tracker/${PROJECT_ID}/recovery`);
      assert.equal(res.status, 200);
      assert.equal(res.body.hasUnfinishedWork, false);
    });

    it("returns recovery info with active work", async () => {
      await seedTracker({
        currentPlan: createTestPlan(),
        activeTasks: [
          {
            taskId: "task_ri1",
            title: "Active task",
            status: "RUNNING",
            priority: 50,
            lastUpdate: new Date().toISOString(),
          },
        ],
        lastContextSummary: "Previous context",
        recoveryHint: "Next step hint",
      });

      const res = await request(app).get(`/api/tracker/${PROJECT_ID}/recovery`);
      assert.equal(res.status, 200);
      assert.equal(res.body.hasUnfinishedWork, true);
      assert.equal(res.body.activeTaskCount, 1);
      assert.equal(res.body.contextSummary, "Previous context");
      assert.equal(res.body.recoveryHint, "Next step hint");
    });
  });

  // ==================== DELETE /api/tracker/:projectId ====================

  describe("DELETE /api/tracker/:projectId", () => {
    it("returns 204 when tracker is deleted", async () => {
      await seedTracker();
      const res = await request(app).delete(`/api/tracker/${PROJECT_ID}`);
      assert.equal(res.status, 204);

      // Verify deleted
      const getRes = await request(app).get(`/api/tracker/${PROJECT_ID}`);
      assert.equal(getRes.status, 404);
    });

    it("returns 204 even when tracker does not exist (idempotent)", async () => {
      const res = await request(app).delete(`/api/tracker/${PROJECT_ID}`);
      assert.equal(res.status, 204);
    });
  });
});
