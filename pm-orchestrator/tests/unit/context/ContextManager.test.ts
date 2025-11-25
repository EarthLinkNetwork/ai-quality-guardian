/**
 * ContextManager - ユニットテスト
 */

import { ContextManager } from '../../../lib/context/ContextManager';
import * as fs from 'fs';
import * as path from 'path';

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('サブエージェント実行コンテキスト', () => {
    it('should set and get execution context', () => {
      const context = {
        subagentName: 'rule-checker',
        taskId: 'task-123',
        userInput: 'Check MUST Rules'
      };

      manager.setExecutionContext(context);
      const retrieved = manager.getExecutionContext('task-123', 'rule-checker');

      expect(retrieved).toEqual(context);
    });

    it('should return undefined for non-existent context', () => {
      const retrieved = manager.getExecutionContext('non-existent', 'subagent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('サブエージェント結果の保存と取得', () => {
    it('should save and retrieve subagent result', () => {
      const result = {
        status: 'success',
        message: 'All checks passed'
      };

      manager.saveSubagentResult('task-123', 'rule-checker', result);
      const retrieved = manager.getSubagentResult('task-123', 'rule-checker');

      expect(retrieved).toEqual(result);
    });

    it('should get all previous results for a task', () => {
      manager.saveSubagentResult('task-123', 'rule-checker', { status: 'success' });
      manager.saveSubagentResult('task-123', 'implementer', { status: 'success' });
      manager.saveSubagentResult('task-123', 'qa', { status: 'success' });

      const results = manager.getPreviousResults('task-123');
      expect(results.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('ファイルキャッシュ', () => {
    const testFilePath = path.join(__dirname, 'test-context-file.txt');
    const testContent = 'Test content for context manager.';

    beforeEach(() => {
      fs.writeFileSync(testFilePath, testContent, 'utf-8');
    });

    afterEach(() => {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should cache file and retrieve content', () => {
      const content = manager.cacheFile(testFilePath);
      expect(content).toBe(testContent);

      const cached = manager.getCachedFile(testFilePath);
      expect(cached).toBe(testContent);
    });

    it('should refresh cache if file changes', () => {
      manager.cacheFile(testFilePath);
      const cached1 = manager.getCachedFile(testFilePath);
      expect(cached1).toBe(testContent);

      // ファイルを変更
      const newContent = 'Modified content';
      fs.writeFileSync(testFilePath, newContent, 'utf-8');

      // 再取得（キャッシュ検証 → 無効 → 再読み込み）
      const cached2 = manager.getCachedFile(testFilePath);
      expect(cached2).toBe(newContent);
    });

    it('should cache multiple files', () => {
      const file1 = path.join(__dirname, 'file1.txt');
      const file2 = path.join(__dirname, 'file2.txt');

      fs.writeFileSync(file1, 'content1', 'utf-8');
      fs.writeFileSync(file2, 'content2', 'utf-8');

      const cached = manager.cacheFiles([file1, file2]);
      expect(cached.size).toBe(2);
      expect(cached.get(file1)).toBe('content1');
      expect(cached.get(file2)).toBe('content2');

      fs.unlinkSync(file1);
      fs.unlinkSync(file2);
    });
  });

  describe('タスクコンテキストの準備', () => {
    it('should prepare task context with previous results', () => {
      // 前のサブエージェントの結果を保存
      manager.saveSubagentResult('task-456', 'rule-checker', { status: 'success' });
      manager.saveSubagentResult('task-456', 'designer', { design: 'plan' });

      // タスクコンテキストを準備
      const context = manager.prepareTaskContext(
        'task-456',
        'implementer',
        'Implement feature X',
        ['rule-checker', 'designer']
      );

      expect(context.subagentName).toBe('implementer');
      expect(context.taskId).toBe('task-456');
      expect(context.userInput).toBe('Implement feature X');
      expect(context.previousResults).toHaveLength(2);
      expect(context.environmentInfo).toBeDefined();
      expect(context.environmentInfo?.cwd).toBeDefined();
    });

    it('should include environment info', () => {
      const context = manager.prepareTaskContext(
        'task-789',
        'qa',
        'Run tests',
        []
      );

      expect(context.environmentInfo).toBeDefined();
      expect(context.environmentInfo?.cwd).toBe(process.cwd());
    });
  });

  describe('統計情報', () => {
    it('should return stats', () => {
      manager.saveSubagentResult('task-123', 'subagent-a', { data: 'result' });
      manager.cacheFile(__filename);

      const stats = manager.getStats();
      expect(stats.storeSize).toBeGreaterThanOrEqual(1);
      expect(stats.fileCacheSize).toBeGreaterThanOrEqual(1);
    });
  });

  describe('クリア機能', () => {
    it('should clear all data', () => {
      manager.saveSubagentResult('task-123', 'subagent-a', { data: 'result' });
      manager.cacheFile(__filename);

      manager.clear();

      const stats = manager.getStats();
      expect(stats.storeSize).toBe(0);
      expect(stats.fileCacheSize).toBe(0);
    });
  });
});
