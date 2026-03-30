/**
 * Unit tests for LLM Summarizer
 *
 * Tests:
 * - generateTaskSummary: generates summary from tracker state via LLM
 * - generateContextSummary: generates context summary for snapshots
 * - Token truncation: limits input to prevent excessive costs
 * - Error handling: graceful degradation when LLM fails
 * - Mock LLM client: all tests use mock, no real API calls
 *
 * TDD: Red phase — tests written before implementation.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 7
 */

import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import {
  LLMSummarizer,
  type LLMSummarizerClient,
  type ContextSummaryResult,
  type TaskSummaryResult,
} from "../../../src/task-tracker/llm-summarizer";
import type {
  TaskTracker,
  TaskPlan,
  TrackedTask,
} from "../../../src/web/dal/task-tracker-types";

// ==================== Test Helpers ====================

function createMockTracker(overrides?: Partial<TaskTracker>): TaskTracker {
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
    ...overrides,
  };
}

function createMockPlan(overrides?: Partial<TaskPlan>): TaskPlan {
  const now = new Date().toISOString();
  return {
    planId: "plan_abc123",
    title: "Implement feature X",
    originalPrompt: "Please implement feature X with tests",
    subtasks: [
      {
        subtaskId: "st_1",
        description: "Write unit tests",
        status: "DONE",
        order: 1,
        dependencies: [],
        result: "5 tests passing",
      },
      {
        subtaskId: "st_2",
        description: "Implement core logic",
        status: "IN_PROGRESS",
        order: 2,
        dependencies: ["st_1"],
      },
      {
        subtaskId: "st_3",
        description: "Integration tests",
        status: "PENDING",
        order: 3,
        dependencies: ["st_2"],
      },
    ],
    status: "EXECUTING",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockTask(overrides?: Partial<TrackedTask>): TrackedTask {
  return {
    taskId: "task_xyz789",
    title: "Implement core logic",
    status: "RUNNING",
    priority: 80,
    lastUpdate: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Mock LLM client that returns configurable responses.
 * Tracks call history for assertions.
 */
class MockLLMClient implements LLMSummarizerClient {
  public calls: Array<{ systemPrompt: string; userPrompt: string; maxTokens: number }> = [];
  public response: string = '{}';
  public shouldFail: boolean = false;
  public failError: Error = new Error("LLM API error");
  public modelName: string = "claude-3-haiku-20240307";

  async generate(opts: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<{ content: string; model: string }> {
    this.calls.push(opts);
    if (this.shouldFail) {
      throw this.failError;
    }
    return { content: this.response, model: this.modelName };
  }
}

// ==================== Tests ====================

describe("LLMSummarizer", () => {
  let mockClient: MockLLMClient;
  let summarizer: LLMSummarizer;

  beforeEach(() => {
    mockClient = new MockLLMClient();
    summarizer = new LLMSummarizer(mockClient);
  });

  // ==================== generateContextSummary ====================

  describe("generateContextSummary", () => {
    it("generates a context summary from tracker state", async () => {
      const tracker = createMockTracker({
        currentPlan: createMockPlan(),
        activeTasks: [createMockTask()],
      });

      mockClient.response = JSON.stringify({
        contextSummary: "Working on feature X. Unit tests done, implementing core logic.",
        recoveryHint: "Continue implementing the core logic in src/feature-x.ts",
        keyDecisions: ["Chose strategy pattern for extensibility"],
      } satisfies ContextSummaryResult);

      const result = await summarizer.generateContextSummary(tracker);

      assert.equal(result.contextSummary, "Working on feature X. Unit tests done, implementing core logic.");
      assert.equal(result.recoveryHint, "Continue implementing the core logic in src/feature-x.ts");
      assert.deepEqual(result.keyDecisions, ["Chose strategy pattern for extensibility"]);
    });

    it("passes tracker state to LLM in the user prompt", async () => {
      const tracker = createMockTracker({
        currentPlan: createMockPlan(),
        activeTasks: [createMockTask()],
      });

      mockClient.response = JSON.stringify({
        contextSummary: "summary",
        recoveryHint: "hint",
        keyDecisions: [],
      });

      await summarizer.generateContextSummary(tracker);

      assert.equal(mockClient.calls.length, 1);
      const call = mockClient.calls[0];
      assert.ok(call.systemPrompt.includes("task context summarizer"));
      assert.ok(call.userPrompt.includes("plan_abc123"));
      assert.ok(call.userPrompt.includes("Implement feature X"));
    });

    it("handles tracker with no plan", async () => {
      const tracker = createMockTracker({
        activeTasks: [createMockTask({ title: "Ad hoc task" })],
      });

      mockClient.response = JSON.stringify({
        contextSummary: "Running ad hoc task",
        recoveryHint: "Complete the ad hoc task",
        keyDecisions: [],
      });

      const result = await summarizer.generateContextSummary(tracker);
      assert.equal(result.contextSummary, "Running ad hoc task");
    });

    it("handles empty tracker state", async () => {
      const tracker = createMockTracker();

      mockClient.response = JSON.stringify({
        contextSummary: "No active work",
        recoveryHint: null,
        keyDecisions: [],
      });

      const result = await summarizer.generateContextSummary(tracker);
      assert.equal(result.contextSummary, "No active work");
    });

    it("enforces maxTokens on LLM call", async () => {
      const tracker = createMockTracker();

      mockClient.response = JSON.stringify({
        contextSummary: "summary",
        recoveryHint: null,
        keyDecisions: [],
      });

      await summarizer.generateContextSummary(tracker);

      assert.equal(mockClient.calls.length, 1);
      assert.ok(mockClient.calls[0].maxTokens <= 500, "maxTokens should be <= 500 for cost control");
    });
  });

  // ==================== generateTaskSummary ====================

  describe("generateTaskSummary", () => {
    it("generates a task summary for a completed task", async () => {
      const tracker = createMockTracker({
        currentPlan: createMockPlan(),
      });

      const task = createMockTask({
        status: "DONE",
        title: "Implement core logic",
        completedAt: new Date().toISOString(),
      });

      mockClient.response = JSON.stringify({
        summary: "Implemented core logic using strategy pattern. All 5 tests passing.",
        keyDecisions: ["Used strategy pattern", "Added error handling for edge cases"],
        filesChanged: ["src/feature-x.ts", "src/feature-x.test.ts"],
      } satisfies TaskSummaryResult);

      const result = await summarizer.generateTaskSummary(tracker, task);

      assert.equal(result.summary, "Implemented core logic using strategy pattern. All 5 tests passing.");
      assert.deepEqual(result.keyDecisions, ["Used strategy pattern", "Added error handling for edge cases"]);
      assert.deepEqual(result.filesChanged, ["src/feature-x.ts", "src/feature-x.test.ts"]);
    });

    it("passes task details to LLM in the user prompt", async () => {
      const tracker = createMockTracker({
        currentPlan: createMockPlan(),
      });
      const task = createMockTask({ title: "Write integration tests" });

      mockClient.response = JSON.stringify({
        summary: "summary",
        keyDecisions: [],
        filesChanged: [],
      });

      await summarizer.generateTaskSummary(tracker, task);

      assert.equal(mockClient.calls.length, 1);
      const call = mockClient.calls[0];
      assert.ok(call.userPrompt.includes("Write integration tests"));
      assert.ok(call.userPrompt.includes("task_xyz789"));
    });
  });

  // ==================== Error Handling ====================

  describe("error handling", () => {
    it("returns fallback context summary on LLM failure", async () => {
      const tracker = createMockTracker({
        currentPlan: createMockPlan(),
        activeTasks: [createMockTask()],
      });

      mockClient.shouldFail = true;

      const result = await summarizer.generateContextSummary(tracker);

      // Should return a fallback summary based on tracker state, not throw
      assert.ok(result.contextSummary.length > 0, "Should have a fallback summary");
      assert.ok(result.contextSummary.includes("Implement feature X") || 
                result.contextSummary.includes("plan"), 
                "Fallback should reference the plan");
    });

    it("returns fallback task summary on LLM failure", async () => {
      const tracker = createMockTracker();
      const task = createMockTask({ title: "My important task" });

      mockClient.shouldFail = true;

      const result = await summarizer.generateTaskSummary(tracker, task);

      assert.ok(result.summary.length > 0, "Should have a fallback summary");
      assert.ok(result.summary.includes("My important task"), "Fallback should reference the task");
    });

    it("returns fallback on malformed JSON response", async () => {
      const tracker = createMockTracker({
        currentPlan: createMockPlan(),
      });

      mockClient.response = "This is not valid JSON at all";

      const result = await summarizer.generateContextSummary(tracker);

      // Should not throw, should return fallback
      assert.ok(result.contextSummary.length > 0);
    });
  });

  // ==================== Input Truncation ====================

  describe("input truncation", () => {
    it("truncates large tracker state to limit input tokens", async () => {
      // Create a tracker with lots of tasks to make the prompt very large
      const manyTasks: TrackedTask[] = Array.from({ length: 50 }, (_, i) => 
        createMockTask({
          taskId: `task_${i}`,
          title: `Task number ${i} with a long description that adds tokens`,
          contextSnippet: "A".repeat(200),
        })
      );

      const tracker = createMockTracker({
        activeTasks: manyTasks,
      });

      mockClient.response = JSON.stringify({
        contextSummary: "summary",
        recoveryHint: null,
        keyDecisions: [],
      });

      await summarizer.generateContextSummary(tracker);

      assert.equal(mockClient.calls.length, 1);
      // The user prompt should be truncated to a reasonable size
      const promptLength = mockClient.calls[0].userPrompt.length;
      assert.ok(promptLength <= 8000, `Prompt should be <= 8000 chars, got ${promptLength}`);
    });
  });

  // ==================== Model Information ====================

  describe("model information", () => {
    it("returns the model name used for generation", async () => {
      mockClient.modelName = "claude-3-haiku-20240307";
      const tracker = createMockTracker();

      mockClient.response = JSON.stringify({
        summary: "summary",
        keyDecisions: [],
        filesChanged: [],
      });

      const result = await summarizer.generateTaskSummary(tracker, createMockTask());

      // The model name should be accessible for TaskSummary.generatedBy
      assert.equal(summarizer.getModelName(), "claude-3-haiku-20240307");
    });
  });
});

// ==================== Integration with TaskTrackerService ====================

import { TaskTrackerService } from "../../../src/task-tracker/task-tracker-service";
import { NoDynamoDALWithConversations } from "../../../src/web/dal/no-dynamo";
import type { IDataAccessLayer } from "../../../src/web/dal/dal-interface";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("LLMSummarizer + TaskTrackerService integration", () => {
  let dal: IDataAccessLayer;
  let service: TaskTrackerService;
  let mockClient: MockLLMClient;
  let summarizer: LLMSummarizer;
  let tmpDir: string;
  const ORG_ID = "test-org";
  const PROJECT_ID = "proj_llm_test";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-llm-test-"));
    dal = new NoDynamoDALWithConversations({
      stateDir: tmpDir,
      orgId: ORG_ID,
    });
    mockClient = new MockLLMClient();
    summarizer = new LLMSummarizer(mockClient);
    service = new TaskTrackerService(dal, ORG_ID, PROJECT_ID, summarizer);
  });

  afterEach(() => {
    service.stopPeriodicSnapshots();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates and saves TaskSummary on task completion", async () => {
    await service.initialize();

    const task = await service.addTask({
      title: "Implement feature Y",
      status: "RUNNING",
      priority: 80,
    });

    mockClient.response = JSON.stringify({
      summary: "Feature Y implemented with full test coverage.",
      keyDecisions: ["Used adapter pattern"],
      filesChanged: ["src/feature-y.ts"],
    });
    mockClient.modelName = "claude-3-haiku-20240307";

    const taskSummary = await service.completeTask(task.taskId);

    assert.ok(taskSummary, "Should return a TaskSummary");
    assert.equal(taskSummary!.taskId, task.taskId);
    assert.equal(taskSummary!.title, "Implement feature Y");
    assert.equal(taskSummary!.summary, "Feature Y implemented with full test coverage.");
    assert.deepEqual(taskSummary!.keyDecisions, ["Used adapter pattern"]);
    assert.deepEqual(taskSummary!.filesChanged, ["src/feature-y.ts"]);
    assert.equal(taskSummary!.generatedBy, "claude-3-haiku-20240307");
  });

  it("completes task without summary when no summarizer configured", async () => {
    // Create service without summarizer
    const serviceNoLLM = new TaskTrackerService(dal, ORG_ID, PROJECT_ID);
    await serviceNoLLM.initialize();

    const task = await serviceNoLLM.addTask({
      title: "Simple task",
      status: "RUNNING",
      priority: 50,
    });

    const taskSummary = await serviceNoLLM.completeTask(task.taskId);

    assert.equal(taskSummary, null, "Should return null when no summarizer");
  });

  it("completes task gracefully when LLM fails", async () => {
    await service.initialize();

    const task = await service.addTask({
      title: "Task with LLM failure",
      status: "RUNNING",
      priority: 60,
    });

    mockClient.shouldFail = true;

    // Should not throw even though LLM fails
    const taskSummary = await service.completeTask(task.taskId);

    // The summary result depends on whether the fallback produces parseable
    // output that gets saved. The key assertion is no exception is thrown.
    // Task should still be completed in the tracker.
    const recoveryInfo = await service.checkForRecovery();
    assert.ok(!recoveryInfo || !recoveryInfo.hasUnfinishedWork,
      "Task should be marked complete regardless of LLM failure");
  });

  it("generates LLM context summary during checkpoint", async () => {
    await service.initialize();

    await service.addTask({
      title: "Active task during checkpoint",
      status: "RUNNING",
      priority: 70,
    });

    mockClient.response = JSON.stringify({
      contextSummary: "Working on active task during checkpoint.",
      recoveryHint: "Continue the active task",
      keyDecisions: ["Decision A"],
    });

    const snapshot = await service.saveCheckpoint("USER_REQUESTED");

    assert.ok(snapshot, "Should create a snapshot");
    assert.equal(snapshot.trigger, "USER_REQUESTED");
    // The context summary should be the LLM-generated one
    assert.equal(snapshot.contextSummary, "Working on active task during checkpoint.");
  });

  it("saves TaskSummary to DAL and can be retrieved", async () => {
    await service.initialize();

    const task = await service.addTask({
      title: "Retrievable task",
      status: "RUNNING",
      priority: 90,
    });

    mockClient.response = JSON.stringify({
      summary: "Task completed successfully.",
      keyDecisions: ["Used best practice"],
      filesChanged: ["src/main.ts"],
    });

    await service.completeTask(task.taskId);

    // Verify the summary was saved in DAL
    const saved = await dal.getTaskSummary(PROJECT_ID, task.taskId);
    assert.ok(saved, "Should be retrievable from DAL");
    assert.equal(saved!.summary, "Task completed successfully.");
    assert.equal(saved!.projectId, PROJECT_ID);
  });
});
