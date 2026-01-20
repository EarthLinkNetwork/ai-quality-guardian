/**
 * Task Model
 * Based on 05_DATA_MODELS.md L23-37
 */

import { v4 as uuidv4 } from 'uuid';
import { TaskStatus } from './enums';

/**
 * Granularity limits for task execution
 */
export interface GranularityLimits {
  max_files: number;
  max_tests: number;
  max_seconds: number;
}

/**
 * Task data structure
 * Per spec 05_DATA_MODELS.md L108-142
 */
export interface Task {
  task_id: string;
  /** 所属スレッドの識別子 */
  thread_id?: string;
  /** 所属 Run の識別子 */
  run_id?: string;
  description: string;
  requirements: string[];
  status: TaskStatus;
  assigned_executor?: string;
  evidence_refs: string[];
  files_modified: string[];
  tests_run: string[];
  tests_required_before_implementation: boolean;
  granularity_limits: GranularityLimits;
  decomposition_approved_by_runner: boolean;
  parent_task_id?: string;
  subtask_ids?: string[];
  started_at?: string;
  completed_at?: string;
  /** 当該タスクに対応する TaskLog の識別子 */
  log_ref?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Task validation error
 */
export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

/**
 * Default granularity limits
 */
const DEFAULT_GRANULARITY_LIMITS: GranularityLimits = {
  max_files: 5,
  max_tests: 10,
  max_seconds: 300,
};

/**
 * Maximum allowed limits
 */
const MAX_LIMITS = {
  max_files: 20,
  max_tests: 50,
  max_seconds: 3600,
};

/**
 * Create a new task
 */
export function createTask(
  description: string,
  requirements: string[],
  granularityLimits?: Partial<GranularityLimits>
): Task {
  return {
    task_id: `task-${uuidv4()}`,
    description,
    requirements,
    status: TaskStatus.INCOMPLETE,
    evidence_refs: [],
    files_modified: [],
    tests_run: [],
    tests_required_before_implementation: true,
    granularity_limits: {
      ...DEFAULT_GRANULARITY_LIMITS,
      ...granularityLimits,
    },
    decomposition_approved_by_runner: false,
  };
}

/**
 * Validate a task object
 * @throws TaskValidationError if validation fails
 */
export function validateTask(task: Task): boolean {
  if (!task.task_id || task.task_id.length === 0) {
    throw new TaskValidationError('task_id is required');
  }

  if (!task.description || task.description.length === 0) {
    throw new TaskValidationError('description is required');
  }

  if (!Array.isArray(task.requirements)) {
    throw new TaskValidationError('requirements must be an array');
  }

  if (task.status === undefined) {
    throw new TaskValidationError('status is required');
  }

  if (!Array.isArray(task.evidence_refs)) {
    throw new TaskValidationError('evidence_refs must be an array');
  }

  if (!Array.isArray(task.files_modified)) {
    throw new TaskValidationError('files_modified must be an array');
  }

  if (!Array.isArray(task.tests_run)) {
    throw new TaskValidationError('tests_run must be an array');
  }

  // Validate granularity limits
  if (!task.granularity_limits) {
    throw new TaskValidationError('granularity_limits is required');
  }

  if (task.granularity_limits.max_files <= 0) {
    throw new TaskValidationError('max_files must be greater than 0');
  }

  if (task.granularity_limits.max_files > MAX_LIMITS.max_files) {
    throw new TaskValidationError(`max_files cannot exceed ${MAX_LIMITS.max_files}`);
  }

  if (task.granularity_limits.max_tests <= 0) {
    throw new TaskValidationError('max_tests must be greater than 0');
  }

  if (task.granularity_limits.max_tests > MAX_LIMITS.max_tests) {
    throw new TaskValidationError(`max_tests cannot exceed ${MAX_LIMITS.max_tests}`);
  }

  if (task.granularity_limits.max_seconds <= 0) {
    throw new TaskValidationError('max_seconds must be greater than 0');
  }

  if (task.granularity_limits.max_seconds > MAX_LIMITS.max_seconds) {
    throw new TaskValidationError(`max_seconds cannot exceed ${MAX_LIMITS.max_seconds}`);
  }

  return true;
}

/**
 * Update task status
 */
export function updateTaskStatus(task: Task, newStatus: TaskStatus): Task {
  return {
    ...task,
    status: newStatus,
    completed_at: newStatus === TaskStatus.COMPLETE ? new Date().toISOString() : task.completed_at,
  };
}

/**
 * Assign executor to task
 */
export function assignExecutor(task: Task, executorId: string): Task {
  return {
    ...task,
    assigned_executor: executorId,
    started_at: new Date().toISOString(),
  };
}

/**
 * Add evidence reference to task
 */
export function addEvidenceRef(task: Task, evidenceRef: string): Task {
  return {
    ...task,
    evidence_refs: [...task.evidence_refs, evidenceRef],
  };
}

/**
 * Add modified file to task
 */
export function addModifiedFile(task: Task, filePath: string): Task {
  return {
    ...task,
    files_modified: [...task.files_modified, filePath],
  };
}

/**
 * Add test run to task
 */
export function addTestRun(task: Task, testId: string): Task {
  return {
    ...task,
    tests_run: [...task.tests_run, testId],
  };
}

/**
 * Mark task decomposition as approved
 */
export function approveDecomposition(task: Task): Task {
  return {
    ...task,
    decomposition_approved_by_runner: true,
  };
}
