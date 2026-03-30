/**
 * Context Recovery Module
 *
 * Generates recovery prompts from TaskTracker and TaskSnapshot data,
 * allowing seamless continuation after context loss.
 *
 * @see spec/34_TASK_TRACKER_PERSISTENCE.md Section 6.3
 */

import type {
  TaskTracker,
  TaskSnapshot,
} from "../web/dal/task-tracker-types";

/**
 * Generate a recovery prompt from TaskTracker state and optional snapshot.
 *
 * The prompt includes:
 * 1. Context summary (from snapshot or tracker)
 * 2. Current plan and progress
 * 3. Active tasks with context snippets
 * 4. Recovery hint (next action)
 * 5. Git state (from snapshot)
 *
 * @param tracker - Current TaskTracker state
 * @param snapshot - Most recent TaskSnapshot, or null
 * @returns Recovery prompt string, empty if no data to recover
 */
export function generateRecoveryPrompt(
  tracker: TaskTracker,
  snapshot: TaskSnapshot | null
): string {
  const parts: string[] = [];

  // 1. Context summary — prefer snapshot over tracker
  const summary = snapshot?.contextSummary ?? tracker.lastContextSummary;
  if (summary) {
    parts.push(`## Previous Context\n${summary}`);
  }

  // 2. Current plan and progress
  if (tracker.currentPlan) {
    const plan = tracker.currentPlan;
    const done = plan.subtasks.filter((s) => s.status === "DONE").length;
    const total = plan.subtasks.length;
    parts.push(`## Plan: ${plan.title} (${done}/${total} completed)`);

    const pending = plan.subtasks.filter(
      (s) => s.status !== "DONE" && s.status !== "SKIPPED"
    );
    if (pending.length > 0) {
      parts.push("### Remaining Subtasks");
      pending.forEach((s) => parts.push(`- [${s.status}] ${s.description}`));
    }
  }

  // 3. Active tasks (only RUNNING, QUEUED, BLOCKED)
  const active = tracker.activeTasks.filter(
    (t) => t.status === "RUNNING" || t.status === "QUEUED" || t.status === "BLOCKED"
  );
  if (active.length > 0) {
    parts.push("## Active Tasks");
    active.forEach((t) => {
      parts.push(`- ${t.title} (${t.status})`);
      if (t.contextSnippet) {
        parts.push(`  Context: ${t.contextSnippet}`);
      }
    });
  }

  // 4. Recovery hint
  if (tracker.recoveryHint) {
    parts.push(`## Next Action\n${tracker.recoveryHint}`);
  }

  // 5. Git state from snapshot
  if (snapshot?.gitState) {
    const git = snapshot.gitState;
    parts.push(
      `## Git State\nBranch: ${git.branch}\nCommit: ${git.commitHash}\nUncommitted: ${git.uncommittedChanges} files`
    );
  }

  return parts.join("\n\n");
}
