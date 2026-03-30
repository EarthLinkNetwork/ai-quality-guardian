/**
 * LLM Summarizer — Generates context and task summaries via LLM
 *
 * Uses a low-cost model (e.g. claude-3-haiku) to generate:
 * - Context summaries for snapshots and recovery
 * - Task summaries for completed tasks
 *
 * Design:
 * - LLM client is injected as an interface for testability
 * - Graceful degradation: returns fallback summaries on LLM failure
 * - Input truncation: limits prompt size for cost control
 * - Max output tokens: 500 for context, 500 for task summaries
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 7
 */

import type {
  TaskTracker,
  TrackedTask,
} from "../web/dal/task-tracker-types";

// ==================== Types ====================

/**
 * Minimal LLM client interface for dependency injection.
 * Allows mocking in tests without coupling to LLMClient class.
 */
export interface LLMSummarizerClient {
  generate(opts: {
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
  }): Promise<{ content: string; model: string }>;
}

/**
 * Result of context summary generation.
 * Matches the JSON schema expected from the LLM.
 */
export interface ContextSummaryResult {
  contextSummary: string;
  recoveryHint: string | null;
  keyDecisions: string[];
}

/**
 * Result of task summary generation.
 * Matches the JSON schema expected from the LLM.
 */
export interface TaskSummaryResult {
  summary: string;
  keyDecisions: string[];
  filesChanged: string[];
}

// ==================== Constants ====================

const MAX_PROMPT_CHARS = 8000;
const MAX_CONTEXT_TOKENS = 500;
const MAX_TASK_TOKENS = 500;

const CONTEXT_SUMMARY_SYSTEM_PROMPT = `You are a task context summarizer.
Given the current task state and recent actions, generate a concise summary
that would allow another AI session to continue the work seamlessly.

Output JSON:
{
  "contextSummary": "string (500 chars max) - What was being done and current state",
  "recoveryHint": "string (200 chars max) or null - The very next action to take",
  "keyDecisions": ["string[] - Important decisions made during this session"]
}

Respond ONLY with valid JSON. No markdown, no explanation.`;

const TASK_SUMMARY_SYSTEM_PROMPT = `You are a task completion summarizer.
Given a completed task and its context, generate a concise summary.

Output JSON:
{
  "summary": "string (500 chars max) - What was accomplished",
  "keyDecisions": ["string[] - Important decisions made"],
  "filesChanged": ["string[] - Files that were modified"]
}

Respond ONLY with valid JSON. No markdown, no explanation.`;

// ==================== Implementation ====================

export class LLMSummarizer {
  private client: LLMSummarizerClient;
  private lastModelName: string = "unknown";

  constructor(client: LLMSummarizerClient) {
    this.client = client;
  }

  /**
   * Generate a context summary from the current tracker state.
   * Used for periodic snapshots and context-limit warnings.
   *
   * On LLM failure, returns a fallback summary derived from tracker state.
   */
  async generateContextSummary(tracker: TaskTracker): Promise<ContextSummaryResult> {
    const userPrompt = this.buildContextPrompt(tracker);

    try {
      const response = await this.client.generate({
        systemPrompt: CONTEXT_SUMMARY_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: MAX_CONTEXT_TOKENS,
      });
      this.lastModelName = response.model;
      return this.parseContextSummary(response.content);
    } catch {
      return this.buildFallbackContextSummary(tracker);
    }
  }

  /**
   * Generate a task summary for a completed task.
   * Used to create TaskSummary entities in the DAL.
   *
   * On LLM failure, returns a fallback summary derived from task data.
   */
  async generateTaskSummary(
    tracker: TaskTracker,
    task: TrackedTask
  ): Promise<TaskSummaryResult> {
    const userPrompt = this.buildTaskPrompt(tracker, task);

    try {
      const response = await this.client.generate({
        systemPrompt: TASK_SUMMARY_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: MAX_TASK_TOKENS,
      });
      this.lastModelName = response.model;
      return this.parseTaskSummary(response.content);
    } catch {
      return this.buildFallbackTaskSummary(task);
    }
  }

  /**
   * Get the model name used in the last generation.
   * Used for TaskSummary.generatedBy field.
   */
  getModelName(): string {
    return this.lastModelName;
  }

  // ==================== Prompt Building ====================

  private buildContextPrompt(tracker: TaskTracker): string {
    const parts: string[] = [];

    if (tracker.currentPlan) {
      const plan = tracker.currentPlan;
      const done = plan.subtasks.filter((s) => s.status === "DONE").length;
      const total = plan.subtasks.length;
      parts.push(`Current plan: "${plan.title}" (${done}/${total} subtasks done)`);
      parts.push(`Plan ID: ${plan.planId}`);
      parts.push(`Plan status: ${plan.status}`);

      const remaining = plan.subtasks
        .filter((s) => s.status !== "DONE" && s.status !== "SKIPPED")
        .map((s) => `  - [${s.status}] ${s.description}`)
        .join("\n");
      if (remaining) {
        parts.push(`Remaining subtasks:\n${remaining}`);
      }
    }

    if (tracker.activeTasks.length > 0) {
      const taskLines = tracker.activeTasks
        .slice(0, 20) // Limit to 20 tasks for prompt
        .map((t) => {
          let line = `  - ${t.title} (${t.status})`;
          if (t.contextSnippet) {
            line += ` — ${t.contextSnippet.slice(0, 100)}`;
          }
          return line;
        })
        .join("\n");
      parts.push(`Active tasks:\n${taskLines}`);
    }

    if (tracker.lastContextSummary) {
      parts.push(`Previous context: ${tracker.lastContextSummary}`);
    }

    const prompt = parts.join("\n\n");
    return this.truncate(prompt);
  }

  private buildTaskPrompt(tracker: TaskTracker, task: TrackedTask): string {
    const parts: string[] = [];

    parts.push(`Task ID: ${task.taskId}`);
    parts.push(`Task title: ${task.title}`);
    parts.push(`Task status: ${task.status}`);

    if (task.contextSnippet) {
      parts.push(`Context: ${task.contextSnippet}`);
    }

    if (tracker.currentPlan) {
      parts.push(`Plan: "${tracker.currentPlan.title}"`);

      if (task.subtaskId) {
        const subtask = tracker.currentPlan.subtasks.find(
          (s) => s.subtaskId === task.subtaskId
        );
        if (subtask) {
          parts.push(`Subtask: ${subtask.description} (${subtask.status})`);
          if (subtask.result) {
            parts.push(`Subtask result: ${subtask.result}`);
          }
        }
      }
    }

    const prompt = parts.join("\n");
    return this.truncate(prompt);
  }

  // ==================== Parsing ====================

  private parseContextSummary(content: string): ContextSummaryResult {
    try {
      const parsed = JSON.parse(content);
      return {
        contextSummary: String(parsed.contextSummary ?? ""),
        recoveryHint: parsed.recoveryHint != null ? String(parsed.recoveryHint) : null,
        keyDecisions: Array.isArray(parsed.keyDecisions)
          ? parsed.keyDecisions.map(String)
          : [],
      };
    } catch {
      // Malformed JSON — build fallback from content string
      return {
        contextSummary: content.slice(0, 500),
        recoveryHint: null,
        keyDecisions: [],
      };
    }
  }

  private parseTaskSummary(content: string): TaskSummaryResult {
    try {
      const parsed = JSON.parse(content);
      return {
        summary: String(parsed.summary ?? ""),
        keyDecisions: Array.isArray(parsed.keyDecisions)
          ? parsed.keyDecisions.map(String)
          : [],
        filesChanged: Array.isArray(parsed.filesChanged)
          ? parsed.filesChanged.map(String)
          : [],
      };
    } catch {
      return {
        summary: content.slice(0, 500),
        keyDecisions: [],
        filesChanged: [],
      };
    }
  }

  // ==================== Fallbacks ====================

  private buildFallbackContextSummary(tracker: TaskTracker): ContextSummaryResult {
    const parts: string[] = [];

    if (tracker.currentPlan) {
      const plan = tracker.currentPlan;
      const done = plan.subtasks.filter((s) => s.status === "DONE").length;
      const total = plan.subtasks.length;
      parts.push(`Plan: "${plan.title}" (${done}/${total} done, status: ${plan.status})`);
    }

    if (tracker.activeTasks.length > 0) {
      const running = tracker.activeTasks.filter((t) => t.status === "RUNNING");
      if (running.length > 0) {
        parts.push(`Running: ${running.map((t) => t.title).join(", ")}`);
      }
    }

    const contextSummary = parts.length > 0
      ? parts.join(". ")
      : "No active work in progress.";

    return {
      contextSummary,
      recoveryHint: tracker.recoveryHint,
      keyDecisions: [],
    };
  }

  private buildFallbackTaskSummary(task: TrackedTask): TaskSummaryResult {
    return {
      summary: `Task "${task.title}" (${task.status}).`,
      keyDecisions: [],
      filesChanged: [],
    };
  }

  // ==================== Utilities ====================

  private truncate(text: string): string {
    if (text.length <= MAX_PROMPT_CHARS) {
      return text;
    }
    return text.slice(0, MAX_PROMPT_CHARS - 3) + "...";
  }
}
