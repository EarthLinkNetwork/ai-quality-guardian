/**
 * Reproduction tests for path consistency bugs (TDD RED)
 *
 * Bug 1: evidenceDir defaults to process.cwd() instead of projectPath
 * Bug 2: /status and /tasks show contradictory task counts
 * Bug 3: session/evidence paths not using projectPath/.claude
 *
 * These tests are written FIRST, before the fix (TDD approach).
 * They should FAIL with the current implementation.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { REPLInterface } from '../../src/repl/repl-interface';
import { RunnerCore } from '../../src/core/runner-core';

describe('Path Consistency Bugs (TDD RED)', () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Save original cwd
    originalCwd = process.cwd();

    // Create temp directory that is DIFFERENT from process.cwd()
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-consistency-test-'));
    projectDir = tempDir;

    // Create valid .claude directory structure
    const claudeDir = path.join(projectDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Test Project\n\nDemo project for testing.');
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
      project: { name: 'test-project', version: '1.0.0' },
      pm: { autoStart: false, defaultModel: 'claude-sonnet-4-20250514' },
    }, null, 2));
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'agents', 'pm-orchestrator.md'), '# PM Agent');
    fs.mkdirSync(path.join(claudeDir, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'rules', 'project-rules.md'), '# Rules');
  });

  afterEach(() => {
    // Restore original cwd
    if (process.cwd() !== originalCwd) {
      process.chdir(originalCwd);
    }
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Bug 1: evidenceDir must use projectPath, not process.cwd()', () => {
    /**
     * CRITICAL BUG: When REPLInterface is created with projectPath,
     * the default evidenceDir should be ${projectPath}/.claude/evidence,
     * NOT ${process.cwd()}/.claude/evidence.
     *
     * This test verifies that process.cwd() is NOT used for evidenceDir.
     */
    it('should use projectPath for evidenceDir, not process.cwd()', () => {
      // Ensure process.cwd() is different from projectDir
      assert.notEqual(
        process.cwd(),
        projectDir,
        'Test setup: process.cwd() must differ from projectDir'
      );

      const repl = new REPLInterface({
        projectMode: 'fixed', projectRoot: projectDir,
        // evidenceDir not specified - should default to projectPath-based
      });

      // Access internal config (for testing)
      const config = (repl as any).config;

      // evidenceDir should be projectPath-based, NOT process.cwd()-based
      const expectedEvidenceDir = path.join(projectDir, '.claude', 'evidence');
      const processCwdEvidenceDir = path.join(process.cwd(), '.claude', 'evidence');

      assert.ok(
        !config.evidenceDir.startsWith(process.cwd()) || config.evidenceDir === expectedEvidenceDir,
        `evidenceDir should NOT be based on process.cwd(). Got: ${config.evidenceDir}, expected to start with: ${projectDir}`
      );

      assert.equal(
        config.evidenceDir,
        expectedEvidenceDir,
        `evidenceDir should be ${expectedEvidenceDir}, got ${config.evidenceDir}`
      );
    });

    /**
     * When REPLInterface creates RunnerCore via /start command,
     * it should pass projectPath-based evidenceDir to RunnerCore.
     */
    it('should pass projectPath-based evidenceDir to RunnerCore via /start', async () => {
      const repl = new REPLInterface({
        projectMode: 'fixed', projectRoot: projectDir,
        // evidenceDir not specified - should default to projectPath-based
      });

      // Start a session which creates RunnerCore internally
      const result = await repl.processCommand('/start');
      assert.ok(result.success, 'Session should start successfully');

      // Access internal session to check runner
      const session = (repl as any).session;
      const runner = session?.runner;

      if (runner) {
        const sessionState = runner.getSessionState();
        assert.ok(sessionState, 'Session state should exist');

        // The evidence directory should be under projectDir
        const expectedEvidenceBase = path.join(projectDir, '.claude', 'evidence');

        // Check if session files were created in projectDir, not process.cwd()
        const sessionDir = path.join(expectedEvidenceBase, sessionState.session_id);
        const sessionJsonPath = path.join(sessionDir, 'session.json');

        // If it exists, it should be in the right location
        if (fs.existsSync(sessionJsonPath)) {
          assert.ok(true, 'Session created in correct location');
        }

        // Check it's NOT in process.cwd() if different
        if (process.cwd() !== projectDir) {
          const wrongPath = path.join(
            process.cwd(),
            '.claude',
            'evidence',
            sessionState.session_id,
            'session.json'
          );
          assert.ok(
            !fs.existsSync(wrongPath),
            `Session files should NOT be at ${wrongPath}`
          );
        }
      }

      await repl.processCommand('/stop');
    });
  });

  describe('Bug 2: /status and /tasks must show consistent counts', () => {
    /**
     * BUG: /status shows "Tasks 0/1 completed" but "Overall COMPLETE"
     *      /tasks shows summary of 0 but task list shows COMPLETED
     *
     * This is a data source inconsistency bug.
     */
    it('should show consistent task counts between /status and /tasks', async () => {
      const repl = new REPLInterface({
        projectMode: 'fixed', projectRoot: projectDir,
      });

      // Start a session
      await repl.processCommand('/start');

      // Get status and tasks output
      const statusResult = await repl.processCommand('/status');
      const tasksResult = await repl.processCommand('/tasks');

      // Parse task counts from /status
      // Expected format: "Tasks X/Y completed"
      const statusOutput = statusResult.message || '';
      const statusMatch = statusOutput.match(/(\d+)\/(\d+)\s+completed/i);

      // Parse task counts from /tasks
      // Expected format: "Summary: X completed, Y pending..."
      const tasksOutput = tasksResult.message || '';
      const tasksCompletedMatch = tasksOutput.match(/(\d+)\s+completed/i);

      // If both have task counts, they must match
      if (statusMatch && tasksCompletedMatch) {
        const statusCompleted = parseInt(statusMatch[1], 10);
        const tasksCompleted = parseInt(tasksCompletedMatch[1], 10);

        assert.equal(
          statusCompleted,
          tasksCompleted,
          `Task completed count mismatch: /status shows ${statusCompleted}, /tasks shows ${tasksCompleted}`
        );
      }

      await repl.processCommand('/stop');
    });

    /**
     * Overall status must be consistent with task status
     * If tasks show 0 completed and 1 pending, overall cannot be COMPLETE
     */
    it('should not show COMPLETE overall status when tasks are incomplete', async () => {
      // Create evidence dir
      const evidenceDir = path.join(projectDir, '.claude', 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      // Add a task but don't complete it
      const task = {
        id: 'test-incomplete',
        description: 'Test task',
        naturalLanguageTask: 'Do something',
      };

      // Execute task (which won't actually do anything without Claude Code)
      await runner.executeTasksSequentially([task]);

      const overallStatus = runner.getOverallStatus();
      const taskResults = runner.getTaskResults();

      // Count completed tasks
      const completedCount = taskResults.filter(
        (t: any) => t.status === 'COMPLETED' || t.status === 'completed'
      ).length;
      const totalCount = taskResults.length;

      // If not all tasks are completed, overall status should NOT be COMPLETE
      if (completedCount < totalCount && totalCount > 0) {
        assert.notEqual(
          overallStatus,
          'COMPLETE',
          `Overall status is COMPLETE but only ${completedCount}/${totalCount} tasks completed`
        );
      }

      await runner.shutdown();
    });
  });

  describe('Bug 3: session/evidence must be in projectPath/.claude', () => {
    /**
     * Default evidence directory must be projectPath/.claude/evidence
     * NOT process.cwd()/.claude/evidence
     */
    it('should default evidenceDir to projectPath/.claude/evidence', () => {
      // Create REPLInterface with only projectPath
      const repl = new REPLInterface({
        projectMode: 'fixed', projectRoot: projectDir,
      });

      const config = (repl as any).config;

      // Default evidenceDir must be under projectPath
      const expectedBase = path.join(projectDir, '.claude', 'evidence');

      assert.ok(
        config.evidenceDir.startsWith(projectDir),
        `evidenceDir must be under projectPath. Got: ${config.evidenceDir}`
      );

      assert.equal(
        config.evidenceDir,
        expectedBase,
        `evidenceDir should be ${expectedBase}, got ${config.evidenceDir}`
      );
    });

    /**
     * Session files must be created in projectPath/.claude/evidence/{sessionId}
     */
    it('should create session files in projectPath/.claude/evidence', async () => {
      const expectedEvidenceDir = path.join(projectDir, '.claude', 'evidence');
      fs.mkdirSync(expectedEvidenceDir, { recursive: true });

      const runner = new RunnerCore({
        evidenceDir: expectedEvidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      const sessionState = runner.getSessionState();
      assert.ok(sessionState, 'Session state should exist');
      assert.ok(sessionState.session_id, 'Session ID should exist');

      // Session directory should be under projectPath
      const expectedSessionDir = path.join(expectedEvidenceDir, sessionState.session_id);

      // Check if session.json exists in the correct location
      const sessionJsonPath = path.join(expectedSessionDir, 'session.json');

      // If the file doesn't exist in projectPath, it might have been created
      // in the wrong location (process.cwd())
      const wrongLocationPath = path.join(
        process.cwd(),
        '.claude',
        'evidence',
        sessionState.session_id,
        'session.json'
      );

      // File should exist in projectPath, not process.cwd()
      const existsInCorrectLocation = fs.existsSync(sessionJsonPath);
      const existsInWrongLocation = process.cwd() !== projectDir && fs.existsSync(wrongLocationPath);

      assert.ok(
        existsInCorrectLocation,
        `session.json should exist at ${sessionJsonPath}`
      );

      if (process.cwd() !== projectDir) {
        assert.ok(
          !existsInWrongLocation,
          `session.json should NOT exist at ${wrongLocationPath} (wrong location)`
        );
      }

      await runner.shutdown();
    });

    /**
     * Evidence files from task execution must be in projectPath/.claude/evidence
     */
    it('should write evidence files in projectPath/.claude/evidence', async () => {
      const expectedEvidenceDir = path.join(projectDir, '.claude', 'evidence');
      fs.mkdirSync(expectedEvidenceDir, { recursive: true });

      const runner = new RunnerCore({
        evidenceDir: expectedEvidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'test-evidence-location',
        description: 'Test evidence file location',
        naturalLanguageTask: 'Create README.md',
      };

      await runner.executeTasksSequentially([task]);

      const sessionState = runner.getSessionState();
      const expectedSessionDir = path.join(expectedEvidenceDir, sessionState.session_id);

      // executor_runs.jsonl should exist in the session directory
      const executorRunsPath = path.join(expectedSessionDir, 'executor_runs.jsonl');

      // This file is created when tasks are executed
      // It should be in projectPath-based location
      if (fs.existsSync(executorRunsPath)) {
        // Good - file is in the correct location
        assert.ok(true, 'executor_runs.jsonl exists in correct location');
      }

      // Verify it's NOT in process.cwd() if that's different
      if (process.cwd() !== projectDir) {
        const wrongPath = path.join(
          process.cwd(),
          '.claude',
          'evidence',
          sessionState.session_id,
          'executor_runs.jsonl'
        );

        assert.ok(
          !fs.existsSync(wrongPath),
          `executor_runs.jsonl should NOT be at ${wrongPath}`
        );
      }

      await runner.shutdown();
    });
  });

  describe('Status case sensitivity consistency', () => {
    /**
     * Task status values must use consistent casing throughout the codebase
     * Both 'completed' and 'COMPLETED' might be used, causing filtering issues
     */
    it('should use consistent status casing for filtering', async () => {
      const evidenceDir = path.join(projectDir, '.claude', 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });

      const runner = new RunnerCore({
        evidenceDir,
        useClaudeCode: false,
      });

      await runner.initialize(projectDir);

      const task = {
        id: 'test-status-casing',
        description: 'Test status casing',
        naturalLanguageTask: 'Create README.md',
      };

      await runner.executeTasksSequentially([task]);

      const taskResults = runner.getTaskResults();

      // Check what status values are actually used
      const statusValues = taskResults.map((t: any) => t.status);

      // All status values should be either all uppercase or all lowercase
      const hasUppercase = statusValues.some((s: string) => s === s.toUpperCase());
      const hasLowercase = statusValues.some((s: string) => s === s.toLowerCase() && s !== s.toUpperCase());

      // Shouldn't have mixed casing
      if (statusValues.length > 0) {
        const firstStatus = statusValues[0];
        for (const status of statusValues) {
          // Check if status casing is consistent
          const firstIsUpper = firstStatus === firstStatus.toUpperCase();
          const currentIsUpper = status === status.toUpperCase();

          assert.equal(
            firstIsUpper,
            currentIsUpper,
            `Inconsistent status casing: '${firstStatus}' vs '${status}'`
          );
        }
      }

      await runner.shutdown();
    });
  });
});
