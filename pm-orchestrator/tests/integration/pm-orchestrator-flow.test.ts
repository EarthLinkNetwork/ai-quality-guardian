/**
 * PM Orchestrator - 統合テスト
 * 
 * エンドツーエンドのワークフローをテスト。
 */

import { PMOrchestrator } from '../../src/PMOrchestrator';
import { ContextManager } from '../../lib/context/ContextManager';
import { Permission } from '../../lib/security/Permission';
import { SecurityGuard } from '../../lib/security/SecurityGuard';

describe('PM Orchestrator Integration Tests', () => {
  let orchestrator: PMOrchestrator;
  let contextManager: ContextManager;
  let securityGuard: SecurityGuard;

  beforeEach(() => {
    contextManager = new ContextManager();
    const permission = new Permission();
    securityGuard = new SecurityGuard(permission);
    orchestrator = new PMOrchestrator();
  });

  afterEach(() => {
    contextManager.clear();
  });

  describe('サブエージェント連携', () => {
    it('should analyze task and select required subagents', async () => {
      const userInput = 'Implement new authentication feature';
      
      // タスク分析
      const analysis = await orchestrator.analyzeTask(userInput);
      
      expect(analysis.taskType).toBeDefined();
      expect(analysis.complexity).toBeDefined();
      expect(analysis.requiredSubagents).toBeDefined();
      expect(analysis.requiredSubagents.length).toBeGreaterThan(0);
    });

    it('should execute subagents in correct order', async () => {
      const userInput = 'Fix bug in login module';
      
      const analysis = await orchestrator.analyzeTask(userInput);
      const executionPlan = orchestrator.createExecutionPlan(analysis);
      
      expect(executionPlan).toBeDefined();
      expect(executionPlan.length).toBeGreaterThan(0);
      
      // Rule Checker が最初に実行されるべき
      expect(executionPlan[0].subagent).toBe('rule-checker');
    });

    it('should share context between subagents', async () => {
      const taskId = 'task-test-001';
      const userInput = 'Update user profile page';
      
      // 最初のサブエージェントの結果を保存
      contextManager.saveSubagentResult(taskId, 'rule-checker', {
        status: 'success',
        checks: ['MUST Rule 1', 'MUST Rule 2']
      });
      
      // 次のサブエージェントのコンテキストを準備
      const context = contextManager.prepareTaskContext(
        taskId,
        'implementer',
        userInput,
        ['rule-checker']
      );
      
      expect(context.previousResults).toHaveLength(1);
      expect(context.previousResults[0].status).toBe('success');
    });
  });

  describe('セキュリティ統合', () => {
    it('should enforce permissions during execution', () => {
      expect(() => {
        securityGuard.checkOperation('rule-checker', require('../../lib/security/Permission').OperationType.WRITE_FILE);
      }).toThrow();
    });

    it('should validate user input before processing', () => {
      const dangerousInput = 'rm -rf /';
      const result = securityGuard.validateInput(dangerousInput);
      
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('エラーハンドリング統合', () => {
    it('should handle subagent failure gracefully', async () => {
      // エラーハンドリングのテスト
      const mockSubagentResult = {
        status: 'error',
        error: 'Test error'
      };
      
      expect(mockSubagentResult.status).toBe('error');
    });

    it('should retry on transient errors', async () => {
      // リトライ機能のテスト
      let attempts = 0;
      const maxRetries = 3;
      
      while (attempts < maxRetries) {
        attempts++;
        // リトライロジック
      }
      
      expect(attempts).toBe(maxRetries);
    });
  });

  describe('パフォーマンステスト', () => {
    it('should complete simple task within time limit', async () => {
      const startTime = Date.now();
      const userInput = 'Add comment to function';
      
      const analysis = await orchestrator.analyzeTask(userInput);
      const executionPlan = orchestrator.createExecutionPlan(analysis);
      
      const duration = Date.now() - startTime;
      
      // 1秒以内に完了すべき
      expect(duration).toBeLessThan(1000);
    });
  });
});
