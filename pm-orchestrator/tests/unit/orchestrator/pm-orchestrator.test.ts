/**
 * PM Orchestrator Enhancement - PMOrchestrator Unit Tests
 */

import { promises as fs } from 'fs';
import path from 'path';
import { PMOrchestrator } from '../../../src/orchestrator/pm-orchestrator';

describe('PMOrchestrator', () => {
  let orchestrator: PMOrchestrator;
  let testBaseDir: string;

  beforeEach(async () => {
    // テストごとにユニークなディレクトリを使用
    testBaseDir = path.join(process.cwd(), `.pm-orchestrator-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

    orchestrator = new PMOrchestrator(testBaseDir);

    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  afterEach(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('executeTask', () => {
    it('should execute task and return result', async () => {
      const input = {
        userInput: 'Implement user authentication feature',
        detectedPattern: 'feature_implementation'
      };

      const output = await orchestrator.executeTask(input);

      expect(output.taskId).toBeTruthy();
      expect(output.status).toBe('success');
      expect(output.subagentResults).toBeInstanceOf(Array);
      expect(output.executionLog).toBeDefined();
      expect(output.summary).toBeTruthy();
      expect(output.nextSteps).toBeInstanceOf(Array);
    });

    it('should analyze task type correctly - PR review', async () => {
      const input = {
        userInput: 'Review this PR and check for issues'
      };

      const output = await orchestrator.executeTask(input);

      // PR reviewタスクの場合、適切なサブエージェントが選択される
      const subagentNames = output.subagentResults.map(r => r.name);
      expect(subagentNames).toContain('rule-checker');
      expect(subagentNames).toContain('code-analyzer');
      expect(subagentNames).toContain('qa');
      expect(subagentNames).toContain('reporter');
    });

    it('should analyze task type correctly - Implementation', async () => {
      const input = {
        userInput: 'Implement a new feature for user management'
      };

      const output = await orchestrator.executeTask(input);

      // Implementationタスクの場合、適切なサブエージェントが選択される
      const subagentNames = output.subagentResults.map(r => r.name);
      expect(subagentNames).toContain('rule-checker');
      expect(subagentNames).toContain('implementer');
      expect(subagentNames).toContain('tester');
      expect(subagentNames).toContain('qa');
      expect(subagentNames).toContain('reporter');
    });

    it('should analyze task type correctly - Testing', async () => {
      const input = {
        userInput: 'Create tests for the authentication module'
      };

      const output = await orchestrator.executeTask(input);

      // Testingタスクの場合、適切なサブエージェントが選択される
      const subagentNames = output.subagentResults.map(r => r.name);
      expect(subagentNames).toContain('rule-checker');
      expect(subagentNames).toContain('tester');
      expect(subagentNames).toContain('qa');
      expect(subagentNames).toContain('reporter');
    });

    it('should analyze task type correctly - Bugfix', async () => {
      const input = {
        userInput: 'Fix the authentication bug'
      };

      const output = await orchestrator.executeTask(input);

      // Bugfixタスクの場合、適切なサブエージェントが選択される
      const subagentNames = output.subagentResults.map(r => r.name);
      expect(subagentNames).toContain('rule-checker');
      expect(subagentNames).toContain('code-analyzer');
      expect(subagentNames).toContain('implementer');
      expect(subagentNames).toContain('qa');
      expect(subagentNames).toContain('reporter');
    });

    it('should detect complexity correctly - Complex', async () => {
      const input = {
        userInput: 'Implement a complex authentication system with OAuth'
      };

      const output = await orchestrator.executeTask(input);

      // Complexタスクの場合、designerサブエージェントが含まれる
      const subagentNames = output.subagentResults.map(r => r.name);
      expect(subagentNames).toContain('designer');
    });

    it('should calculate quality score correctly', async () => {
      const input = {
        userInput: 'Implement a simple feature'
      };

      const output = await orchestrator.executeTask(input);

      // 全サブエージェントが成功した場合、品質スコアは100
      expect(output.executionLog.qualityScore).toBe(100);
    });

    it('should generate summary correctly', async () => {
      const input = {
        userInput: 'Test task'
      };

      const output = await orchestrator.executeTask(input);

      expect(output.summary).toContain('サブエージェント');
      expect(output.summary).toContain('成功');
    });

    it('should generate next steps correctly', async () => {
      const input = {
        userInput: 'Test task'
      };

      const output = await orchestrator.executeTask(input);

      expect(output.nextSteps).toBeInstanceOf(Array);
      expect(output.nextSteps.length).toBeGreaterThan(0);
    });
  });
});
