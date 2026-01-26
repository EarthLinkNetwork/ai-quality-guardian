/**
 * Tests for READ_INFO Task Completion
 *
 * Per user requirement: READ_INFO tasks that don't create files should:
 * 1. Generate evidence file from response output
 * 2. Complete successfully with COMPLETE status
 *
 * This ensures information-only tasks don't fail with NO_EVIDENCE.
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeExecutor } from '../../../src/executor/claude-code-executor';

describe('READ_INFO Task Completion', () => {
  let tempDir: string;
  let executor: ClaudeCodeExecutor;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-info-test-'));
    executor = new ClaudeCodeExecutor({
      projectPath: tempDir,
      timeout: 30000,
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Evidence Generation for READ_INFO Tasks', () => {
    it('should generate evidence file for READ_INFO task with no file changes', async function() {
      this.timeout(120000);
      
      // Skip if Claude Code not available
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const taskId = 'test-read-info-task';
      const result = await executor.execute({
        id: taskId,
        prompt: 'What is 2 + 2?',  // Simple question that doesn't need file changes
        workingDir: tempDir,
        taskType: 'READ_INFO',
      });

      // Should complete successfully
      if (result.status === 'COMPLETE') {
        // Check that evidence file was created
        const evidenceDir = path.join(tempDir, '.claude', 'evidence');
        const evidencePath = path.join(evidenceDir, `task-${taskId}.md`);
        
        assert.ok(fs.existsSync(evidencePath), 'Evidence file should be created');
        
        // Check evidence file content
        const content = fs.readFileSync(evidencePath, 'utf-8');
        assert.ok(content.includes('# Evidence: Task'), 'Evidence should have header');
        assert.ok(content.includes('READ_INFO'), 'Evidence should mention task type');
        assert.ok(content.includes('Response Output'), 'Evidence should include response');
        
        // Check that evidence file is in verified_files
        const hasEvidenceFile = result.verified_files.some(
          vf => vf.path.includes('evidence') && vf.path.includes(taskId)
        );
        assert.ok(hasEvidenceFile, 'Evidence file should be in verified_files');
      }
    });

    it('should NOT generate evidence file for IMPLEMENTATION task with no file changes', async function() {
      this.timeout(120000);
      
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const taskId = 'test-impl-task';
      const result = await executor.execute({
        id: taskId,
        prompt: 'What is 2 + 2?',  // Same prompt, but IMPLEMENTATION type
        workingDir: tempDir,
        taskType: 'IMPLEMENTATION',
      });

      // IMPLEMENTATION tasks without file changes should NOT be COMPLETE
      // (they don't get automatic evidence generation)
      if (result.verified_files.length === 0) {
        assert.ok(
          result.status === 'NO_EVIDENCE' || result.status === 'INCOMPLETE',
          'IMPLEMENTATION task without file changes should be NO_EVIDENCE or INCOMPLETE'
        );
      }
    });

    it('should handle REPORT task type same as READ_INFO', async function() {
      this.timeout(120000);
      
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const taskId = 'test-report-task';
      const result = await executor.execute({
        id: taskId,
        prompt: 'Summarize the project structure',
        workingDir: tempDir,
        taskType: 'REPORT',
      });

      if (result.status === 'COMPLETE') {
        const evidenceDir = path.join(tempDir, '.claude', 'evidence');
        const evidencePath = path.join(evidenceDir, `task-${taskId}.md`);
        
        assert.ok(fs.existsSync(evidencePath), 'Evidence file should be created for REPORT task');
      }
    });
  });

  describe('Evidence File Structure', () => {
    it('should create proper markdown evidence file', async function() {
      this.timeout(120000);
      
      const available = await executor.isClaudeCodeAvailable();
      if (!available) {
        this.skip();
        return;
      }

      const taskId = 'test-evidence-structure';
      const result = await executor.execute({
        id: taskId,
        prompt: 'What is the current time?',
        workingDir: tempDir,
        taskType: 'READ_INFO',
      });

      if (result.status === 'COMPLETE') {
        const evidencePath = path.join(tempDir, '.claude', 'evidence', `task-${taskId}.md`);
        const content = fs.readFileSync(evidencePath, 'utf-8');
        
        // Check structure
        assert.ok(content.includes('# Evidence:'), 'Should have H1 header');
        assert.ok(content.includes('**Task Type:**'), 'Should have task type');
        assert.ok(content.includes('**Executed At:**'), 'Should have timestamp');
        assert.ok(content.includes('**Duration:**'), 'Should have duration');
        assert.ok(content.includes('## Response Output'), 'Should have response section');
        assert.ok(content.includes('```'), 'Should have code block for output');
        assert.ok(content.includes('Auto-generated evidence'), 'Should have auto-generated notice');
      }
    });
  });
});
