import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  Task,
  createTask,
  validateTask,
  TaskValidationError,
} from '../../../src/models/task';
import { TaskStatus } from '../../../src/models/enums';

describe('Task (05_DATA_MODELS.md L23-37)', () => {
  describe('Task structure', () => {
    it('should contain all required fields', () => {
      const task: Task = {
        task_id: 'task-001',
        description: 'Implement feature X',
        requirements: ['req-1', 'req-2'],
        status: TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: {
          max_files: 5,
          max_tests: 10,
          max_seconds: 300,
        },
        decomposition_approved_by_runner: true,
      };

      assert.equal(task.task_id, 'task-001');
      assert.equal(task.description, 'Implement feature X');
      assert.deepEqual(task.requirements, ['req-1', 'req-2']);
      assert.equal(task.status, TaskStatus.INCOMPLETE);
      assert.equal(task.assigned_executor, undefined);
      assert.deepEqual(task.evidence_refs, []);
      assert.deepEqual(task.files_modified, []);
      assert.deepEqual(task.tests_run, []);
      assert.equal(task.tests_required_before_implementation, true);
      assert.deepEqual(task.granularity_limits, { max_files: 5, max_tests: 10, max_seconds: 300 });
      assert.equal(task.decomposition_approved_by_runner, true);
    });

    it('should allow optional assigned_executor', () => {
      const task: Task = {
        task_id: 'task-002',
        description: 'Test task',
        requirements: [],
        status: TaskStatus.INCOMPLETE,
        assigned_executor: 'executor-1',
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: { max_files: 5, max_tests: 10, max_seconds: 300 },
        decomposition_approved_by_runner: true,
      };

      assert.equal(task.assigned_executor, 'executor-1');
    });
  });

  describe('createTask', () => {
    it('should create task with generated ID', () => {
      const task = createTask('Test description', ['req-1']);
      assert.ok(task.task_id.length > 0);
      assert.equal(task.description, 'Test description');
      assert.deepEqual(task.requirements, ['req-1']);
      assert.equal(task.status, TaskStatus.INCOMPLETE);
      assert.equal(task.tests_required_before_implementation, true);
      assert.equal(task.decomposition_approved_by_runner, false);
    });

    it('should apply default granularity limits', () => {
      const task = createTask('Test', []);
      assert.equal(task.granularity_limits.max_files, 5);
      assert.equal(task.granularity_limits.max_tests, 10);
      assert.equal(task.granularity_limits.max_seconds, 300);
    });

    it('should generate unique task IDs', () => {
      const task1 = createTask('Task 1', []);
      const task2 = createTask('Task 2', []);
      assert.notEqual(task1.task_id, task2.task_id);
    });
  });

  describe('validateTask', () => {
    it('should accept valid task', () => {
      const task: Task = {
        task_id: 'task-001',
        description: 'Valid task',
        requirements: [],
        status: TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: { max_files: 5, max_tests: 10, max_seconds: 300 },
        decomposition_approved_by_runner: true,
      };
      assert.ok(validateTask(task));
    });

    it('should reject task without task_id', () => {
      const task = {
        description: 'No ID task',
        requirements: [],
        status: TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: { max_files: 5, max_tests: 10, max_seconds: 300 },
        decomposition_approved_by_runner: true,
      } as unknown as Task;
      assert.throws(() => validateTask(task), TaskValidationError);
    });

    it('should reject task without description', () => {
      const task = {
        task_id: 'task-001',
        requirements: [],
        status: TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: { max_files: 5, max_tests: 10, max_seconds: 300 },
        decomposition_approved_by_runner: true,
      } as unknown as Task;
      assert.throws(() => validateTask(task), TaskValidationError);
    });

    it('should reject task with invalid granularity limits', () => {
      const task: Task = {
        task_id: 'task-001',
        description: 'Invalid limits',
        requirements: [],
        status: TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: { max_files: 0, max_tests: 10, max_seconds: 300 },
        decomposition_approved_by_runner: true,
      };
      assert.throws(() => validateTask(task), TaskValidationError);
    });

    it('should reject task exceeding max_files limit of 20', () => {
      const task: Task = {
        task_id: 'task-001',
        description: 'Exceeds limit',
        requirements: [],
        status: TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: { max_files: 21, max_tests: 10, max_seconds: 300 },
        decomposition_approved_by_runner: true,
      };
      assert.throws(() => validateTask(task), TaskValidationError);
    });

    it('should reject task exceeding max_tests limit of 50', () => {
      const task: Task = {
        task_id: 'task-001',
        description: 'Exceeds limit',
        requirements: [],
        status: TaskStatus.INCOMPLETE,
        evidence_refs: [],
        files_modified: [],
        tests_run: [],
        tests_required_before_implementation: true,
        granularity_limits: { max_files: 5, max_tests: 51, max_seconds: 300 },
        decomposition_approved_by_runner: true,
      };
      assert.throws(() => validateTask(task), TaskValidationError);
    });
  });

  describe('TDD enforcement (Property 11)', () => {
    it('tests_required_before_implementation must be true for implementation tasks', () => {
      const task = createTask('Implementation task', []);
      assert.equal(task.tests_required_before_implementation, true);
    });
  });

  describe('Task decomposition authority (Property 13)', () => {
    it('decomposition_approved_by_runner defaults to false', () => {
      const task = createTask('New task', []);
      assert.equal(task.decomposition_approved_by_runner, false);
    });
  });
});
