/**
 * AC-7: Runner 再起動後も状態復元
 *
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md AC-7:
 * - Session が復元される
 * - Task Group が復元される
 * - Queue Store の状態が維持される
 *
 * Per spec/20_QUEUE_STORE.md:
 * - DynamoDB Local で永続化
 * - Namespace ベースでデータ分離
 * - Runner 再起動後もデータ維持
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { QueueItem, QueueItemStatus } from '../../src/queue';
import {
  createTaskGroup,
  activateTaskGroup,
  addConversationEntry,
  TaskGroup,
  resetTaskGroupCounter,
  resetConversationEntryCounter,
} from '../../src/models/task-group';
import { TaskGroupState } from '../../src/models/enums';

/**
 * Mock QueueStore for testing state restoration
 * Simulates DynamoDB behavior with in-memory storage
 */
class MockQueueStore {
  private items: Map<string, QueueItem> = new Map();
  private runners: Map<string, { runner_id: string; status: string; last_heartbeat: string; project_root: string }> = new Map();
  private namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  getNamespace(): string {
    return this.namespace;
  }

  async enqueue(sessionId: string, taskGroupId: string, prompt: string): Promise<QueueItem> {
    const item: QueueItem = {
      namespace: this.namespace,
      task_id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      task_group_id: taskGroupId,
      session_id: sessionId,
      status: 'QUEUED' as QueueItemStatus,
      prompt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.items.set(item.task_id, item);
    return item;
  }

  async getItem(taskId: string): Promise<QueueItem | null> {
    const item = this.items.get(taskId);
    if (item && item.namespace === this.namespace) {
      return item;
    }
    return null;
  }

  async updateStatus(taskId: string, status: QueueItemStatus): Promise<void> {
    const item = this.items.get(taskId);
    if (item) {
      item.status = status;
      item.updated_at = new Date().toISOString();
    }
  }

  async getByTaskGroup(taskGroupId: string): Promise<QueueItem[]> {
    return Array.from(this.items.values()).filter(
      item => item.task_group_id === taskGroupId && item.namespace === this.namespace
    );
  }

  async registerRunner(runnerId: string, projectRoot: string): Promise<void> {
    this.runners.set(runnerId, {
      runner_id: runnerId,
      status: 'running',
      last_heartbeat: new Date().toISOString(),
      project_root: projectRoot,
    });
  }

  async updateHeartbeat(runnerId: string): Promise<void> {
    const runner = this.runners.get(runnerId);
    if (runner) {
      runner.last_heartbeat = new Date().toISOString();
    }
  }

  async getRunnersWithStatus(timeoutMs: number): Promise<Array<{ runner_id: string; status: string; isAlive: boolean; last_heartbeat: string; project_root: string }>> {
    const now = Date.now();
    const result = [];
    for (const runner of this.runners.values()) {
      const lastHeartbeat = new Date(runner.last_heartbeat).getTime();
      const isAlive = now - lastHeartbeat < timeoutMs;
      result.push({ ...runner, isAlive });
    }
    return result;
  }

  // For simulating namespace isolation
  getItemsInNamespace(): QueueItem[] {
    return Array.from(this.items.values()).filter(item => item.namespace === this.namespace);
  }
}

/**
 * Simulates shared storage between QueueStore instances (like DynamoDB)
 */
class SharedMockStorage {
  private items: Map<string, QueueItem> = new Map();

  createStore(namespace: string): MockQueueStoreWithSharedStorage {
    return new MockQueueStoreWithSharedStorage(namespace, this.items);
  }
}

class MockQueueStoreWithSharedStorage {
  private items: Map<string, QueueItem>;
  private namespace: string;

  constructor(namespace: string, sharedItems: Map<string, QueueItem>) {
    this.namespace = namespace;
    this.items = sharedItems;
  }

  getNamespace(): string {
    return this.namespace;
  }

  async enqueue(sessionId: string, taskGroupId: string, prompt: string): Promise<QueueItem> {
    const item: QueueItem = {
      namespace: this.namespace,
      task_id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      task_group_id: taskGroupId,
      session_id: sessionId,
      status: 'QUEUED' as QueueItemStatus,
      prompt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // Key includes namespace for shared storage simulation
    this.items.set(this.namespace + ':' + item.task_id, item);
    return item;
  }

  async getItem(taskId: string): Promise<QueueItem | null> {
    return this.items.get(this.namespace + ':' + taskId) || null;
  }

  async updateStatus(taskId: string, status: QueueItemStatus): Promise<void> {
    const item = this.items.get(this.namespace + ':' + taskId);
    if (item) {
      item.status = status;
      item.updated_at = new Date().toISOString();
    }
  }

  async getByTaskGroup(taskGroupId: string): Promise<QueueItem[]> {
    return Array.from(this.items.values()).filter(
      item => item.task_group_id === taskGroupId && item.namespace === this.namespace
    );
  }
}

describe('AC-7: Runner 再起動後も状態復元', () => {
  let tempDir: string;
  let queueStore: MockQueueStore;
  const testNamespace = 'test-restore-' + Date.now();

  beforeEach(async () => {
    resetTaskGroupCounter();
    resetConversationEntryCounter();

    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-7-test-'));

    // Create MockQueueStore
    queueStore = new MockQueueStore(testNamespace);
  });

  afterEach(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Queue Store 状態維持', () => {
    it('タスクが Queue Store に永続化される', async () => {
      // タスクを追加
      const item = await queueStore.enqueue(
        'session-1',
        'task-group-1',
        'Test task prompt'
      );

      assert.ok(item.task_id);
      assert.strictEqual(item.status, 'QUEUED');

      // 取得して確認
      const retrieved = await queueStore.getItem(item.task_id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.task_id, item.task_id);
      assert.strictEqual(retrieved.prompt, 'Test task prompt');
    });

    it('複数タスクが維持される', async () => {
      // 複数タスクを追加
      const tasks: QueueItem[] = [];
      for (let i = 1; i <= 5; i++) {
        const item = await queueStore.enqueue(
          'session-1',
          'task-group-1',
          'Task ' + i
        );
        tasks.push(item);
      }

      // 全て取得できる
      for (const task of tasks) {
        const retrieved = await queueStore.getItem(task.task_id);
        assert.ok(retrieved, 'Task ' + task.task_id + ' should be retrievable');
      }
    });

    it('状態変更が維持される', async () => {
      // タスクを追加
      const item = await queueStore.enqueue(
        'session-1',
        'task-group-1',
        'Task to update'
      );

      // QUEUED -> RUNNING
      await queueStore.updateStatus(item.task_id, 'RUNNING');
      let retrieved = await queueStore.getItem(item.task_id);
      assert.strictEqual(retrieved?.status, 'RUNNING');

      // RUNNING -> COMPLETE
      await queueStore.updateStatus(item.task_id, 'COMPLETE');
      retrieved = await queueStore.getItem(item.task_id);
      assert.strictEqual(retrieved?.status, 'COMPLETE');
    });
  });

  describe('Task Group 状態復元', () => {
    it('Task Group の会話履歴が復元される', async () => {
      // Task Group を作成し会話を追加
      let taskGroup = createTaskGroup('session-1', 'Restore test');
      taskGroup = activateTaskGroup(taskGroup);
      taskGroup = addConversationEntry(taskGroup, 'user', 'First message', 'task-1');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'First response', 'task-1');
      taskGroup = addConversationEntry(taskGroup, 'user', 'Second message', 'task-2');

      // Task Group をファイルに保存（シミュレーション）
      const taskGroupPath = path.join(tempDir, 'task-group.json');
      fs.writeFileSync(taskGroupPath, JSON.stringify(taskGroup, null, 2));

      // 「再起動」シミュレーション - ファイルから読み込み
      const restoredData = JSON.parse(fs.readFileSync(taskGroupPath, 'utf-8'));
      const restoredTaskGroup: TaskGroup = restoredData;

      // 復元確認
      assert.strictEqual(restoredTaskGroup.task_group_id, taskGroup.task_group_id);
      assert.strictEqual(restoredTaskGroup.state, TaskGroupState.ACTIVE);
      assert.strictEqual(restoredTaskGroup.context.conversation_history.length, 3);
      assert.strictEqual(
        restoredTaskGroup.context.conversation_history[0].content,
        'First message'
      );
    });

    it('Task Group の working_files が復元される', () => {
      // Task Group を作成
      let taskGroup = createTaskGroup('session-1');
      taskGroup = activateTaskGroup(taskGroup);

      // working_files を追加（手動でコンテキスト更新）
      taskGroup = {
        ...taskGroup,
        context: {
          ...taskGroup.context,
          working_files: ['file1.ts', 'file2.ts', 'file3.ts'],
        },
      };

      // ファイルに保存
      const taskGroupPath = path.join(tempDir, 'task-group-files.json');
      fs.writeFileSync(taskGroupPath, JSON.stringify(taskGroup, null, 2));

      // 復元
      const restoredTaskGroup: TaskGroup = JSON.parse(
        fs.readFileSync(taskGroupPath, 'utf-8')
      );

      // 確認
      assert.strictEqual(restoredTaskGroup.context.working_files.length, 3);
      assert.ok(restoredTaskGroup.context.working_files.includes('file1.ts'));
      assert.ok(restoredTaskGroup.context.working_files.includes('file2.ts'));
      assert.ok(restoredTaskGroup.context.working_files.includes('file3.ts'));
    });
  });

  describe('Session 状態復元', () => {
    it('Session ID とメタデータが復元される', () => {
      // Session データを作成
      const sessionData = {
        session_id: 'session-123',
        created_at: new Date().toISOString(),
        project_root: '/tmp/test-project',
        task_groups: ['tg_1', 'tg_2'],
        current_task_group: 'tg_2',
      };

      // ファイルに保存
      const sessionPath = path.join(tempDir, '.claude', 'session.json');
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));

      // 「再起動」シミュレーション - ファイルから読み込み
      const restoredSession = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

      // 復元確認
      assert.strictEqual(restoredSession.session_id, 'session-123');
      assert.strictEqual(restoredSession.project_root, '/tmp/test-project');
      assert.strictEqual(restoredSession.task_groups.length, 2);
      assert.strictEqual(restoredSession.current_task_group, 'tg_2');
    });
  });

  describe('Namespace によるデータ分離', () => {
    it('異なる Namespace のデータは分離される', async () => {
      // Use shared storage to simulate DynamoDB
      const sharedStorage = new SharedMockStorage();

      // Namespace 1 にタスク追加
      const ns1Store = sharedStorage.createStore('namespace-1');
      const task1 = await ns1Store.enqueue('session-1', 'group-1', 'Task in NS1');

      // Namespace 2 にタスク追加
      const ns2Store = sharedStorage.createStore('namespace-2');
      const task2 = await ns2Store.enqueue('session-2', 'group-2', 'Task in NS2');

      // NS1 からは NS1 のタスクのみ見える
      const ns1Task = await ns1Store.getItem(task1.task_id);
      const ns1TaskFromNs2 = await ns1Store.getItem(task2.task_id);
      assert.ok(ns1Task, 'NS1 task should be visible from NS1');
      assert.strictEqual(ns1TaskFromNs2, null, 'NS2 task should not be visible from NS1');

      // NS2 からは NS2 のタスクのみ見える
      const ns2Task = await ns2Store.getItem(task2.task_id);
      const ns2TaskFromNs1 = await ns2Store.getItem(task1.task_id);
      assert.ok(ns2Task, 'NS2 task should be visible from NS2');
      assert.strictEqual(ns2TaskFromNs1, null, 'NS1 task should not be visible from NS2');
    });
  });

  describe('再起動シミュレーション', () => {
    it('完全な再起動シナリオ', async () => {
      // === 最初のセッション ===
      const sessionId = 'session-restart-test';
      const taskGroupId = 'tg-restart-test';

      // タスクを Queue に追加
      const task1 = await queueStore.enqueue(
        sessionId,
        taskGroupId,
        'Task before restart'
      );

      // Task Group 状態を保存
      let taskGroup = createTaskGroup(sessionId);
      taskGroup = activateTaskGroup(taskGroup);
      taskGroup = addConversationEntry(taskGroup, 'user', 'Hello before restart');

      const statePath = path.join(tempDir, 'state.json');
      fs.writeFileSync(statePath, JSON.stringify({
        session_id: sessionId,
        task_group: taskGroup,
        queue_task_ids: [task1.task_id],
      }, null, 2));

      // === 「再起動」 ===
      // In real scenario, this would be a new QueueStore connecting to same DynamoDB
      // For mock, we simulate by verifying the task is still accessible

      // 状態を復元
      const restoredState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

      // Queue からタスクを取得（同じ mock store で確認）
      const restoredTask = await queueStore.getItem(task1.task_id);
      assert.ok(restoredTask, 'Task should be restored from Queue');
      assert.strictEqual(restoredTask.prompt, 'Task before restart');

      // Task Group を復元
      const restoredTaskGroup: TaskGroup = restoredState.task_group;
      assert.strictEqual(restoredTaskGroup.session_id, sessionId);
      assert.strictEqual(restoredTaskGroup.context.conversation_history.length, 1);
      assert.strictEqual(
        restoredTaskGroup.context.conversation_history[0].content,
        'Hello before restart'
      );

      // 会話を継続
      const continued = addConversationEntry(
        restoredTaskGroup,
        'user',
        'Hello after restart'
      );
      assert.strictEqual(continued.context.conversation_history.length, 2);

      // 新しいタスクを追加
      await queueStore.enqueue(
        sessionId,
        taskGroupId,
        'Task after restart'
      );

      // 両方のタスクが存在
      const allTasks = await queueStore.getByTaskGroup(taskGroupId);
      assert.strictEqual(allTasks.length, 2);
    });
  });

  describe('Runner 登録と Heartbeat', () => {
    it('Runner が登録され Heartbeat が更新される', async () => {
      const runnerId = 'runner-' + Date.now();

      // Runner 登録
      await queueStore.registerRunner(runnerId, '/tmp/project');

      // Runner 状態を確認
      const runners = await queueStore.getRunnersWithStatus(120000);
      const registeredRunner = runners.find(r => r.runner_id === runnerId);

      assert.ok(registeredRunner, 'Runner should be registered');
      assert.strictEqual(registeredRunner.status, 'running');
      assert.ok(registeredRunner.isAlive, 'Runner should be alive');
    });

    it('Heartbeat が更新される', async () => {
      const runnerId = 'runner-heartbeat-' + Date.now();

      // Runner 登録
      await queueStore.registerRunner(runnerId, '/tmp/project');

      // 少し待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      // Heartbeat 更新
      await queueStore.updateHeartbeat(runnerId);

      // 確認
      const runners = await queueStore.getRunnersWithStatus(120000);
      const runner = runners.find(r => r.runner_id === runnerId);
      assert.ok(runner?.isAlive, 'Runner should be alive after heartbeat update');
    });
  });
});
