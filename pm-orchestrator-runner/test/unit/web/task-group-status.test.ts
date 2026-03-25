/**
 * Unit tests for task group status derivation and grouping
 *
 * Tests:
 * 1. deriveTaskGroupStatus correctly derives status from task status counts
 * 2. Task group grouping: new chats add to existing groups correctly
 * 3. group_status field is present in TaskGroupSummary
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { deriveTaskGroupStatus, TaskGroupStatus } from '../../../src/queue/queue-store';
import { InMemoryQueueStore } from '../../../src/queue/in-memory-queue-store';

describe('deriveTaskGroupStatus', () => {
  it('should return "active" when there are RUNNING tasks', () => {
    const status = deriveTaskGroupStatus({
      QUEUED: 0,
      RUNNING: 2,
      AWAITING_RESPONSE: 0,
      COMPLETE: 3,
      ERROR: 0,
      CANCELLED: 0,
    });
    assert.equal(status, 'active');
  });

  it('should return "active" when there are QUEUED tasks', () => {
    const status = deriveTaskGroupStatus({
      QUEUED: 1,
      RUNNING: 0,
      AWAITING_RESPONSE: 0,
      COMPLETE: 0,
      ERROR: 0,
      CANCELLED: 0,
    });
    assert.equal(status, 'active');
  });

  it('should return "active" when there are AWAITING_RESPONSE tasks', () => {
    const status = deriveTaskGroupStatus({
      QUEUED: 0,
      RUNNING: 0,
      AWAITING_RESPONSE: 1,
      COMPLETE: 5,
      ERROR: 0,
      CANCELLED: 0,
    });
    assert.equal(status, 'active');
  });

  it('should return "active" when all tasks are COMPLETE (user decides group lifecycle)', () => {
    const status = deriveTaskGroupStatus({
      QUEUED: 0,
      RUNNING: 0,
      AWAITING_RESPONSE: 0,
      COMPLETE: 5,
      ERROR: 0,
      CANCELLED: 0,
    });
    assert.equal(status, 'active');
  });

  it('should return "active" when tasks are mix of COMPLETE and ERROR (user decides group lifecycle)', () => {
    const status = deriveTaskGroupStatus({
      QUEUED: 0,
      RUNNING: 0,
      AWAITING_RESPONSE: 0,
      COMPLETE: 3,
      ERROR: 2,
      CANCELLED: 1,
    });
    assert.equal(status, 'active');
  });

  it('should return "active" for empty status counts (user decides group lifecycle)', () => {
    const status = deriveTaskGroupStatus({});
    assert.equal(status, 'active');
  });

  it('should return "active" when mixed active and complete tasks', () => {
    const status = deriveTaskGroupStatus({
      QUEUED: 1,
      RUNNING: 0,
      AWAITING_RESPONSE: 0,
      COMPLETE: 10,
      ERROR: 2,
      CANCELLED: 0,
    });
    assert.equal(status, 'active');
  });
});

describe('TaskGroupStatus type', () => {
  it('should accept valid values', () => {
    const values: TaskGroupStatus[] = ['active', 'complete', 'archived'];
    assert.equal(values.length, 3);
    assert.ok(values.includes('active'));
    assert.ok(values.includes('complete'));
    assert.ok(values.includes('archived'));
  });
});

describe('InMemoryQueueStore task group archive', () => {
  let store: InMemoryQueueStore;

  beforeEach(() => {
    store = new InMemoryQueueStore({ namespace: 'test-ns' });
  });

  it('should set group_status to "archived" when archived', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    await store.setTaskGroupArchived('group-a', true);

    const groups = await store.getAllTaskGroups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].group_status, 'archived');
  });

  it('should restore derived status when unarchived', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    await store.setTaskGroupArchived('group-a', true);
    await store.setTaskGroupArchived('group-a', false);

    const groups = await store.getAllTaskGroups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].group_status, 'active'); // QUEUED task = active
  });

  it('should return false for non-existent group', async () => {
    const result = await store.setTaskGroupArchived('nonexistent', true);
    assert.equal(result, false);
  });

  it('should return true for existing group', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    const result = await store.setTaskGroupArchived('group-a', true);
    assert.equal(result, true);
  });

  it('should correctly group tasks when multiple tasks share a task_group_id', async () => {
    await store.enqueue('sess1', 'shared-group', 'prompt 1');
    await store.enqueue('sess1', 'shared-group', 'prompt 2');
    await store.enqueue('sess1', 'shared-group', 'prompt 3');
    await store.enqueue('sess1', 'other-group', 'prompt 4');

    const groups = await store.getAllTaskGroups();
    assert.equal(groups.length, 2);

    const sharedGroup = groups.find(g => g.task_group_id === 'shared-group');
    const otherGroup = groups.find(g => g.task_group_id === 'other-group');

    assert.ok(sharedGroup);
    assert.equal(sharedGroup!.task_count, 3);
    assert.ok(otherGroup);
    assert.equal(otherGroup!.task_count, 1);
  });

  it('should override derived status with archived even if tasks are active', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    // group-a has a QUEUED task, so derived status would be 'active'
    await store.setTaskGroupArchived('group-a', true);

    const groups = await store.getAllTaskGroups();
    assert.equal(groups[0].group_status, 'archived'); // Archived overrides active
  });
});

describe('InMemoryQueueStore setTaskGroupStatus', () => {
  let store: InMemoryQueueStore;

  beforeEach(() => {
    store = new InMemoryQueueStore({ namespace: 'test-ns' });
  });

  it('should set group_status to "complete" via setTaskGroupStatus', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    await store.setTaskGroupStatus('group-a', 'complete');

    const groups = await store.getAllTaskGroups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].group_status, 'complete');
  });

  it('should set group_status to "archived" via setTaskGroupStatus', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    await store.setTaskGroupStatus('group-a', 'archived');

    const groups = await store.getAllTaskGroups();
    assert.equal(groups[0].group_status, 'archived');
  });

  it('should set group_status to "active" via setTaskGroupStatus (override derived)', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    // First mark it as complete
    await store.setTaskGroupStatus('group-a', 'complete');
    assert.equal((await store.getAllTaskGroups())[0].group_status, 'complete');

    // Then set back to active
    await store.setTaskGroupStatus('group-a', 'active');
    assert.equal((await store.getAllTaskGroups())[0].group_status, 'active');
  });

  it('should clear override and return to derived status when set to null', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    await store.setTaskGroupStatus('group-a', 'complete');
    assert.equal((await store.getAllTaskGroups())[0].group_status, 'complete');

    // Clear override
    await store.setTaskGroupStatus('group-a', null);
    // Should return to derived status (QUEUED = active)
    assert.equal((await store.getAllTaskGroups())[0].group_status, 'active');
  });

  it('should return false for non-existent group', async () => {
    const result = await store.setTaskGroupStatus('nonexistent', 'complete');
    assert.equal(result, false);
  });

  it('should return true for existing group', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    const result = await store.setTaskGroupStatus('group-a', 'complete');
    assert.equal(result, true);
  });

  it('should sync archivedGroups when status set to archived', async () => {
    await store.enqueue('sess1', 'group-a', 'prompt 1');
    await store.setTaskGroupStatus('group-a', 'archived');

    // Unarchive via setTaskGroupArchived should clear the override
    await store.setTaskGroupArchived('group-a', false);
    assert.equal((await store.getAllTaskGroups())[0].group_status, 'active');
  });
});
