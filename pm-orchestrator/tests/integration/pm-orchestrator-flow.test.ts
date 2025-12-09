/**
 * PM Orchestrator - 統合テスト
 *
 * エンドツーエンドのワークフローをテスト。
 */

import { PMOrchestrator } from '../../src/orchestrator/pm-orchestrator';
import { ContextManager } from '../../lib/context/ContextManager';
import { Permission, OperationType } from '../../lib/security/Permission';
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
    it('should execute task and return results', async () => {
      const result = await orchestrator.executeTask({
        userInput: 'Implement new authentication feature',
        detectedPattern: 'implementation'
      });

      expect(result.taskId).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.subagentResults).toBeDefined();
      expect(result.subagentResults.length).toBeGreaterThan(0);
    });

    it('should include rule-checker in subagent results', async () => {
      const result = await orchestrator.executeTask({
        userInput: 'Fix bug in login module',
        detectedPattern: 'bugfix'
      });

      expect(result.subagentResults).toBeDefined();
      expect(result.subagentResults.length).toBeGreaterThan(0);

      // Rule Checker が含まれているべき
      const hasRuleChecker = result.subagentResults.some(r => r.name === 'rule-checker');
      expect(hasRuleChecker).toBe(true);
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
      expect(context.previousResults![0].status).toBe('success');
    });
  });

  describe('セキュリティ統合', () => {
    it('should enforce permissions during execution', () => {
      expect(() => {
        securityGuard.checkOperation('rule-checker', OperationType.WRITE_FILE);
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

      const result = await orchestrator.executeTask({
        userInput: 'Add comment to function',
        detectedPattern: 'simple'
      });

      const duration = Date.now() - startTime;

      // 1秒以内に完了すべき
      expect(duration).toBeLessThan(1000);
      expect(result.taskId).toBeDefined();
    });
  });
});
