/**
 * AC-4: Task Group で文脈が維持される
 *
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md AC-4:
 * - 同一 Task Group 内で前のタスクの結果を参照できる
 * - 会話履歴が保持されている
 *
 * Per spec/16_TASK_GROUP.md:
 * - Task Group は「会話・思考・文脈の単位」
 * - Context には conversation_history, working_files, last_task_result, accumulated_changes
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  createTaskGroup,
  activateTaskGroup,
  addConversationEntry,
  addFileChange,
  updateLastTaskResult,
  resetTaskGroupCounter,
  resetConversationEntryCounter,
  TaskGroup,
  TaskResult,
} from '../../src/models/task-group';
import { TaskGroupState } from '../../src/models/enums';

describe('AC-4: Task Group で文脈が維持される', () => {
  beforeEach(() => {
    resetTaskGroupCounter();
    resetConversationEntryCounter();
  });

  describe('会話履歴の保持', () => {
    it('会話履歴が Task Group 内で保持される', () => {
      let taskGroup = createTaskGroup('session_1', 'Test task group');
      taskGroup = activateTaskGroup(taskGroup);

      // ユーザーメッセージを追加
      taskGroup = addConversationEntry(taskGroup, 'user', '変数 x に 42 を設定してください', 'task_1');
      
      // アシスタントの応答を追加
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'x = 42 を設定しました', 'task_1');

      // 会話履歴を確認
      assert.strictEqual(
        taskGroup.context.conversation_history.length,
        2,
        'Should have 2 conversation entries'
      );
      assert.strictEqual(
        taskGroup.context.conversation_history[0].role,
        'user'
      );
      assert.strictEqual(
        taskGroup.context.conversation_history[1].role,
        'assistant'
      );
    });

    it('複数タスクにわたって会話履歴が蓄積される', () => {
      let taskGroup = createTaskGroup('session_1', 'Multi-task test');
      taskGroup = activateTaskGroup(taskGroup);

      // Task 1
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 1 input', 'task_1');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'Task 1 response', 'task_1');

      // Task 2
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 2 input', 'task_2');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'Task 2 response', 'task_2');

      // Task 3
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 3 input', 'task_3');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'Task 3 response', 'task_3');

      // 6つのエントリがあることを確認
      assert.strictEqual(
        taskGroup.context.conversation_history.length,
        6,
        'Should have 6 conversation entries across 3 tasks'
      );

      // Task IDが正しく関連付けられている
      const task2Entries = taskGroup.context.conversation_history.filter(
        e => e.task_id === 'task_2'
      );
      assert.strictEqual(task2Entries.length, 2);
    });
  });

  describe('前のタスクの結果参照', () => {
    it('last_task_result が更新される', () => {
      let taskGroup = createTaskGroup('session_1', 'Result test');
      taskGroup = activateTaskGroup(taskGroup);

      // 最初は null
      assert.strictEqual(taskGroup.context.last_task_result, null);

      // タスク結果を更新
      const result: TaskResult = {
        task_id: 'task_1',
        status: 'COMPLETE',
        summary: '変数 x に 42 を設定しました',
        files_modified: [],
        completed_at: new Date().toISOString(),
      };

      taskGroup = updateLastTaskResult(taskGroup, result);

      // 結果が保持されている
      assert.ok(taskGroup.context.last_task_result);
      assert.strictEqual(taskGroup.context.last_task_result.task_id, 'task_1');
      assert.strictEqual(taskGroup.context.last_task_result.status, 'COMPLETE');
      assert.ok(taskGroup.context.last_task_result.summary.includes('42'));
    });

    it('次のタスクで前のタスク結果を参照できる', () => {
      let taskGroup = createTaskGroup('session_1', 'Reference test');
      taskGroup = activateTaskGroup(taskGroup);

      // Task 1: 変数を設定
      const result1: TaskResult = {
        task_id: 'task_1',
        status: 'COMPLETE',
        summary: 'x = 42',
        files_modified: [],
        completed_at: new Date().toISOString(),
      };
      taskGroup = updateLastTaskResult(taskGroup, result1);

      // Task 2 開始前に前のタスク結果を確認
      const previousResult = taskGroup.context.last_task_result;
      assert.ok(previousResult);
      assert.strictEqual(previousResult.summary, 'x = 42');

      // Task 2 の結果で上書き
      const result2: TaskResult = {
        task_id: 'task_2',
        status: 'COMPLETE',
        summary: 'x の値は 42 です',
        files_modified: [],
        completed_at: new Date().toISOString(),
      };
      taskGroup = updateLastTaskResult(taskGroup, result2);

      // 最新の結果が保持されている
      assert.ok(taskGroup.context.last_task_result);
      assert.strictEqual(taskGroup.context.last_task_result.task_id, 'task_2');
    });
  });

  describe('working_files の追跡', () => {
    it('ファイル変更が追跡される', () => {
      let taskGroup = createTaskGroup('session_1', 'File tracking test');
      taskGroup = activateTaskGroup(taskGroup);

      // ファイル作成
      taskGroup = addFileChange(
        taskGroup,
        'src/index.ts',
        'created',
        'task_1',
        undefined,
        'hash123'
      );

      assert.ok(taskGroup.context.working_files.includes('src/index.ts'));
      assert.strictEqual(taskGroup.context.accumulated_changes.length, 1);
      assert.strictEqual(
        taskGroup.context.accumulated_changes[0].change_type,
        'created'
      );
    });

    it('複数ファイルの変更が蓄積される', () => {
      let taskGroup = createTaskGroup('session_1', 'Multi-file test');
      taskGroup = activateTaskGroup(taskGroup);

      // 複数ファイルを変更
      taskGroup = addFileChange(taskGroup, 'file1.ts', 'created', 'task_1');
      taskGroup = addFileChange(taskGroup, 'file2.ts', 'created', 'task_1');
      taskGroup = addFileChange(taskGroup, 'file1.ts', 'modified', 'task_2');
      taskGroup = addFileChange(taskGroup, 'file3.ts', 'created', 'task_2');

      // 3つのファイルが working_files に
      assert.strictEqual(taskGroup.context.working_files.length, 3);
      assert.ok(taskGroup.context.working_files.includes('file1.ts'));
      assert.ok(taskGroup.context.working_files.includes('file2.ts'));
      assert.ok(taskGroup.context.working_files.includes('file3.ts'));

      // 4つの変更が蓄積
      assert.strictEqual(taskGroup.context.accumulated_changes.length, 4);
    });

    it('ファイル削除で working_files から除外される', () => {
      let taskGroup = createTaskGroup('session_1', 'Delete test');
      taskGroup = activateTaskGroup(taskGroup);

      // ファイル作成
      taskGroup = addFileChange(taskGroup, 'temp.ts', 'created', 'task_1');
      assert.ok(taskGroup.context.working_files.includes('temp.ts'));

      // ファイル削除
      taskGroup = addFileChange(taskGroup, 'temp.ts', 'deleted', 'task_2');
      assert.ok(!taskGroup.context.working_files.includes('temp.ts'));

      // 変更履歴は両方保持
      assert.strictEqual(taskGroup.context.accumulated_changes.length, 2);
    });
  });

  describe('Task Group 状態遷移', () => {
    it('Created -> Active 遷移', () => {
      let taskGroup = createTaskGroup('session_1');
      assert.strictEqual(taskGroup.state, TaskGroupState.CREATED);

      taskGroup = activateTaskGroup(taskGroup);
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);
    });

    it('Active 状態で会話が継続できる', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      // 複数の会話を追加
      taskGroup = addConversationEntry(taskGroup, 'user', 'Message 1');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'Response 1');
      taskGroup = addConversationEntry(taskGroup, 'user', 'Message 2');

      // 状態は Active のまま
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);
      assert.strictEqual(taskGroup.context.conversation_history.length, 3);
    });
  });

  describe('Context 統合テスト', () => {
    it('完全な Task Group ワークフロー', () => {
      // 1. Task Group 作成
      let taskGroup = createTaskGroup('session_test', 'Integration test');
      assert.strictEqual(taskGroup.state, TaskGroupState.CREATED);
      assert.strictEqual(taskGroup.context.conversation_history.length, 0);

      // 2. 最初のタスクで Active に
      taskGroup = activateTaskGroup(taskGroup);
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // 3. Task 1: ユーザー入力
      taskGroup = addConversationEntry(
        taskGroup,
        'user',
        '新しいファイルを作成してください',
        'task_1'
      );

      // 4. Task 1: ファイル作成
      taskGroup = addFileChange(
        taskGroup,
        'newfile.ts',
        'created',
        'task_1',
        undefined,
        'abc123'
      );

      // 5. Task 1: アシスタント応答
      taskGroup = addConversationEntry(
        taskGroup,
        'assistant',
        'newfile.ts を作成しました',
        'task_1'
      );

      // 6. Task 1: 結果更新
      const result1: TaskResult = {
        task_id: 'task_1',
        status: 'COMPLETE',
        summary: 'newfile.ts を作成',
        files_modified: ['newfile.ts'],
        completed_at: new Date().toISOString(),
      };
      taskGroup = updateLastTaskResult(taskGroup, result1);

      // 7. Task 2: 前のタスク結果を確認
      assert.ok(taskGroup.context.last_task_result);
      assert.strictEqual(
        taskGroup.context.last_task_result.files_modified[0],
        'newfile.ts'
      );

      // 8. Task 2: ユーザー入力（前のタスク結果を参照）
      taskGroup = addConversationEntry(
        taskGroup,
        'user',
        '先ほど作成したファイルに関数を追加してください',
        'task_2'
      );

      // 9. Task 2: ファイル修正
      taskGroup = addFileChange(
        taskGroup,
        'newfile.ts',
        'modified',
        'task_2',
        'abc123',
        'def456'
      );

      // 10. 最終確認
      assert.strictEqual(taskGroup.context.conversation_history.length, 3);
      assert.strictEqual(taskGroup.context.working_files.length, 1);
      assert.strictEqual(taskGroup.context.accumulated_changes.length, 2);
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // 11. 会話履歴で前のタスクの内容を確認できる
      const firstUserMessage = taskGroup.context.conversation_history[0];
      assert.strictEqual(firstUserMessage.content, '新しいファイルを作成してください');
      assert.strictEqual(firstUserMessage.task_id, 'task_1');
    });
  });
});
