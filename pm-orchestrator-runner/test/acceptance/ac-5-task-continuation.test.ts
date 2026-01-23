/**
 * AC-5: Task 完了後も会話が継続できる
 *
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md AC-5:
 * - Task 完了後に Task Group は終了しない
 * - 次のタスクを同一 Task Group で実行できる
 *
 * Per spec/16_TASK_GROUP.md:
 * - Task Group 状態遷移: Created → Active ↔ Paused → Completed
 * - Task 完了後も Task Group は Active のまま
 * - ユーザーが明示的に /end するまで継続
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  createTaskGroup,
  activateTaskGroup,
  completeTaskGroup,
  pauseTaskGroup,
  resumeTaskGroup,
  addConversationEntry,
  updateLastTaskResult,
  isTaskGroupActive,
  isTaskGroupCompleted,
  resetTaskGroupCounter,
  resetConversationEntryCounter,
  TaskGroup,
  TaskResult,
} from '../../src/models/task-group';
import { TaskGroupState } from '../../src/models/enums';

describe('AC-5: Task 完了後も会話が継続できる', () => {
  beforeEach(() => {
    resetTaskGroupCounter();
    resetConversationEntryCounter();
  });

  describe('Task 完了後の Task Group 状態', () => {
    it('Task 完了後も Task Group は Active のまま', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      // Task 1 実行・完了
      taskGroup = addConversationEntry(taskGroup, 'user', 'hello', 'task_1');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'Hi there!', 'task_1');
      const result1: TaskResult = {
        task_id: 'task_1',
        status: 'COMPLETE',
        summary: 'Greeted user',
        files_modified: [],
        completed_at: new Date().toISOString(),
      };
      taskGroup = updateLastTaskResult(taskGroup, result1);

      // Task Group はまだ Active
      assert.strictEqual(
        taskGroup.state,
        TaskGroupState.ACTIVE,
        'Task Group should remain ACTIVE after task completion'
      );
      assert.ok(isTaskGroupActive(taskGroup));
      assert.ok(!isTaskGroupCompleted(taskGroup));
    });

    it('複数タスク完了後も Task Group は Active のまま', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      // Task 1
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 1');
      taskGroup = updateLastTaskResult(taskGroup, {
        task_id: 'task_1',
        status: 'COMPLETE',
        summary: 'Task 1 done',
        files_modified: [],
        completed_at: new Date().toISOString(),
      });
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // Task 2
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 2');
      taskGroup = updateLastTaskResult(taskGroup, {
        task_id: 'task_2',
        status: 'COMPLETE',
        summary: 'Task 2 done',
        files_modified: [],
        completed_at: new Date().toISOString(),
      });
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // Task 3
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 3');
      taskGroup = updateLastTaskResult(taskGroup, {
        task_id: 'task_3',
        status: 'COMPLETE',
        summary: 'Task 3 done',
        files_modified: [],
        completed_at: new Date().toISOString(),
      });
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // 3つのタスクが同一 Task Group に属する
      assert.strictEqual(
        taskGroup.context.conversation_history.length,
        3,
        'All 3 tasks should be in the same Task Group'
      );
    });
  });

  describe('同一 Task Group での継続実行', () => {
    it('次のタスクを同一 Task Group で実行できる', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      const taskGroupId = taskGroup.task_group_id;

      // Task 1
      taskGroup = addConversationEntry(taskGroup, 'user', 'First task');
      assert.strictEqual(taskGroup.task_group_id, taskGroupId);

      // Task 2
      taskGroup = addConversationEntry(taskGroup, 'user', 'Second task');
      assert.strictEqual(taskGroup.task_group_id, taskGroupId);

      // Task 3
      taskGroup = addConversationEntry(taskGroup, 'user', 'Third task');
      assert.strictEqual(
        taskGroup.task_group_id,
        taskGroupId,
        'All tasks should be in the same Task Group'
      );
    });

    it('会話履歴が継続して蓄積される', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      // 複数のタスクを実行
      for (let i = 1; i <= 5; i++) {
        taskGroup = addConversationEntry(taskGroup, 'user', `Message ${i}`);
        taskGroup = addConversationEntry(taskGroup, 'assistant', `Response ${i}`);
      }

      // 10件の会話エントリ（5タスク x 2）
      assert.strictEqual(
        taskGroup.context.conversation_history.length,
        10,
        'Conversation history should accumulate across tasks'
      );

      // 順序が正しい
      assert.strictEqual(
        taskGroup.context.conversation_history[0].content,
        'Message 1'
      );
      assert.strictEqual(
        taskGroup.context.conversation_history[9].content,
        'Response 5'
      );
    });
  });

  describe('明示的な終了', () => {
    it('ユーザーが明示的に終了するまで継続', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      // 複数タスク実行
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 1');
      taskGroup = addConversationEntry(taskGroup, 'user', 'Task 2');
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // 明示的に終了
      taskGroup = completeTaskGroup(taskGroup);
      assert.strictEqual(taskGroup.state, TaskGroupState.COMPLETED);
      assert.ok(isTaskGroupCompleted(taskGroup));
      assert.ok(!isTaskGroupActive(taskGroup));
    });

    it('Complete 後は新しいタスクを追加できない', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);
      taskGroup = completeTaskGroup(taskGroup);

      // Complete 状態からの再 activate は不可
      assert.throws(() => {
        activateTaskGroup(taskGroup);
      }, /Cannot activate a completed task group/);
    });
  });

  describe('Pause/Resume 機能', () => {
    it('一時停止後も会話を継続できる', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      // いくつかのタスクを実行
      taskGroup = addConversationEntry(taskGroup, 'user', 'Before pause');
      assert.strictEqual(taskGroup.context.conversation_history.length, 1);

      // 一時停止
      taskGroup = pauseTaskGroup(taskGroup);
      assert.strictEqual(taskGroup.state, TaskGroupState.PAUSED);

      // 再開
      taskGroup = resumeTaskGroup(taskGroup);
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // 会話を継続
      taskGroup = addConversationEntry(taskGroup, 'user', 'After resume');
      assert.strictEqual(taskGroup.context.conversation_history.length, 2);

      // 会話履歴が保持されている
      assert.strictEqual(
        taskGroup.context.conversation_history[0].content,
        'Before pause'
      );
      assert.strictEqual(
        taskGroup.context.conversation_history[1].content,
        'After resume'
      );
    });
  });

  describe('エラー後の継続', () => {
    it('タスクがエラーで終了しても Task Group は継続', () => {
      let taskGroup = createTaskGroup('session_1');
      taskGroup = activateTaskGroup(taskGroup);

      // Task 1: エラーで終了
      taskGroup = addConversationEntry(taskGroup, 'user', 'Error task');
      const errorResult: TaskResult = {
        task_id: 'task_1',
        status: 'ERROR',
        summary: 'Task failed',
        files_modified: [],
        error: 'Something went wrong',
        completed_at: new Date().toISOString(),
      };
      taskGroup = updateLastTaskResult(taskGroup, errorResult);

      // Task Group はまだ Active
      assert.strictEqual(
        taskGroup.state,
        TaskGroupState.ACTIVE,
        'Task Group should remain ACTIVE after task error'
      );

      // エラー情報が保持されている
      assert.ok(taskGroup.context.last_task_result?.error);

      // 次のタスクを実行できる
      taskGroup = addConversationEntry(taskGroup, 'user', 'Retry task');
      assert.strictEqual(taskGroup.context.conversation_history.length, 2);
    });
  });

  describe('統合テスト: 典型的な会話フロー', () => {
    it('hello -> world -> goodbye の会話フロー', () => {
      let taskGroup = createTaskGroup('session_test');
      taskGroup = activateTaskGroup(taskGroup);

      // hello
      taskGroup = addConversationEntry(taskGroup, 'user', 'hello');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'Hello! How can I help?');
      taskGroup = updateLastTaskResult(taskGroup, {
        task_id: 'task_1',
        status: 'COMPLETE',
        summary: 'Greeted user',
        files_modified: [],
        completed_at: new Date().toISOString(),
      });
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // world
      taskGroup = addConversationEntry(taskGroup, 'user', 'world');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'The world is vast!');
      taskGroup = updateLastTaskResult(taskGroup, {
        task_id: 'task_2',
        status: 'COMPLETE',
        summary: 'Discussed world',
        files_modified: [],
        completed_at: new Date().toISOString(),
      });
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);

      // goodbye
      taskGroup = addConversationEntry(taskGroup, 'user', 'goodbye');
      taskGroup = addConversationEntry(taskGroup, 'assistant', 'Goodbye! Have a nice day!');
      taskGroup = updateLastTaskResult(taskGroup, {
        task_id: 'task_3',
        status: 'COMPLETE',
        summary: 'Said goodbye',
        files_modified: [],
        completed_at: new Date().toISOString(),
      });

      // 最終確認
      assert.strictEqual(taskGroup.state, TaskGroupState.ACTIVE);
      assert.strictEqual(taskGroup.context.conversation_history.length, 6);

      // 会話履歴の確認
      const userMessages = taskGroup.context.conversation_history
        .filter(e => e.role === 'user')
        .map(e => e.content);
      assert.deepStrictEqual(userMessages, ['hello', 'world', 'goodbye']);
    });
  });
});
