/**
 * QueueStore Progress Events Tests
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { InMemoryQueueStore } from '../../../src/queue/in-memory-queue-store';

describe('QueueStore progress events', () => {
  it('appends events and updates updated_at', async () => {
    const store = new InMemoryQueueStore({ namespace: 'test-ns' });

    const item = await store.enqueue('session-1', 'group-1', 'prompt');
    const eventTimestamp = new Date(Date.now() + 1000).toISOString();

    const ok = await store.appendEvent(item.task_id, {
      type: 'log_chunk',
      timestamp: eventTimestamp,
      data: { text: 'hello' },
    });

    assert.equal(ok, true);

    const updated = await store.getItem(item.task_id);
    assert.ok(updated);
    assert.equal(updated?.events?.length, 1);
    assert.equal(updated?.events?.[0].type, 'log_chunk');
    assert.equal(updated?.events?.[0].timestamp, eventTimestamp);
    assert.equal(updated?.updated_at, eventTimestamp);
  });

  it('returns false when task is missing', async () => {
    const store = new InMemoryQueueStore({ namespace: 'test-ns' });

    const ok = await store.appendEvent('missing-task', {
      type: 'log_chunk',
      timestamp: new Date().toISOString(),
      data: { text: 'hello' },
    });

    assert.equal(ok, false);
  });
});
