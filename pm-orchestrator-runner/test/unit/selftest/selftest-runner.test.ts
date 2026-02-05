/**
 * SelfTestRunner Unit Tests
 *
 * Tests the self-test mode for pm-orchestrator-runner.
 * Verifies:
 * 1. 5 test tasks are created with correct attributes
 * 2. Judgment logic: COMPLETE + output.length > 0 = SUCCESS, else FAIL
 * 3. Report JSON structure
 * 4. Exit code: 100% success -> 0, any fail -> 1
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  SELFTEST_CASES,
  SELFTEST_TASK_GROUP,
  SELFTEST_TASK_TYPE,
  injectSelftestTasks,
  judgeResult,
  buildSelftestReport,
  SelftestCase,
  SelftestResult,
  SelftestReport,
} from '../../../src/selftest/selftest-runner';
import { InMemoryQueueStore } from '../../../src/queue/in-memory-queue-store';
import { QueueItem } from '../../../src/queue';

describe('SelfTestRunner', () => {
  let store: InMemoryQueueStore;

  beforeEach(() => {
    store = new InMemoryQueueStore({ namespace: 'selftest' });
  });

  describe('SELFTEST_CASES constant', () => {
    it('should define exactly 5 test tasks', () => {
      assert.equal(SELFTEST_CASES.length, 5);
    });

    it('should have unique names for all tasks', () => {
      const names = SELFTEST_CASES.map(t => t.name);
      const uniqueNames = new Set(names);
      assert.equal(uniqueNames.size, 5);
    });

    it('should include code-change prohibition note in all prompts', () => {
      for (const tc of SELFTEST_CASES) {
        assert.ok(
          tc.prompt.includes('コード変更禁止'),
          `Task ${tc.name} should mention code change prohibition`,
        );
      }
    });

    it('should include the expected case names', () => {
      const names = SELFTEST_CASES.map(t => t.name);
      assert.ok(names.includes('summary'));
      assert.ok(names.includes('unverified_stop'));
      assert.ok(names.includes('contradiction_detect'));
      assert.ok(names.includes('evidence_restriction'));
      assert.ok(names.includes('normal_question'));
    });
  });

  describe('SELFTEST_TASK_GROUP', () => {
    it('should be tg_selftest_auto', () => {
      assert.equal(SELFTEST_TASK_GROUP, 'tg_selftest_auto');
    });
  });

  describe('SELFTEST_TASK_TYPE', () => {
    it('should be READ_INFO', () => {
      assert.equal(SELFTEST_TASK_TYPE, 'READ_INFO');
    });
  });

  describe('injectSelftestTasks', () => {
    it('should enqueue 5 tasks into the queue store', async () => {
      const items = await injectSelftestTasks(store, 'test-session');
      assert.equal(items.length, 5);
    });

    it('should set task_type to READ_INFO for all tasks', async () => {
      const items = await injectSelftestTasks(store, 'test-session');
      for (const item of items) {
        assert.equal(item.task_type, 'READ_INFO');
      }
    });

    it('should set status to QUEUED for all tasks', async () => {
      const items = await injectSelftestTasks(store, 'test-session');
      for (const item of items) {
        assert.equal(item.status, 'QUEUED');
      }
    });

    it('should use the selftest task group', async () => {
      const items = await injectSelftestTasks(store, 'test-session');
      for (const item of items) {
        assert.equal(item.task_group_id, SELFTEST_TASK_GROUP);
      }
    });
  });

  describe('judgeResult', () => {
    function makeItem(overrides: Partial<QueueItem>): QueueItem {
      return {
        task_id: 'test-id',
        session_id: 'sess',
        task_group_id: 'tg',
        prompt: 'test',
        status: 'COMPLETE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
      } as QueueItem;
    }

    it('should return ok=true when status=COMPLETE and output is non-empty', () => {
      const item = makeItem({ status: 'COMPLETE', output: 'some output text' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, true);
      assert.equal(result.reason, 'COMPLETE with output');
    });

    it('should return ok=false when status=COMPLETE but output is empty', () => {
      const item = makeItem({ status: 'COMPLETE', output: '' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'output is empty');
    });

    it('should return ok=false when status=COMPLETE but output is undefined', () => {
      const item = makeItem({ status: 'COMPLETE', output: undefined });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'output is empty');
    });

    it('should return ok=false when status=COMPLETE but output is whitespace only', () => {
      const item = makeItem({ status: 'COMPLETE', output: '   \n  ' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'output is empty');
    });

    it('should return ok=false when status=ERROR', () => {
      const item = makeItem({ status: 'ERROR', output: 'some output' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, false);
      assert.ok(result.reason.includes('ERROR'));
    });

    it('should return ok=false when status=QUEUED (not completed)', () => {
      const item = makeItem({ status: 'QUEUED' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, false);
    });

    it('should return ok=false when status=RUNNING (not completed)', () => {
      const item = makeItem({ status: 'RUNNING' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, false);
    });

    it('should return ok=false when status=AWAITING_RESPONSE', () => {
      const item = makeItem({ status: 'AWAITING_RESPONSE', output: 'some output' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.ok, false);
      assert.ok(result.reason.includes('AWAITING_RESPONSE'));
    });

    it('should include correct output_length', () => {
      const item = makeItem({ status: 'COMPLETE', output: 'hello' });
      const result = judgeResult(item, 'summary');
      assert.equal(result.output_length, 5);
    });

    it('should include case name in result', () => {
      const item = makeItem({ status: 'COMPLETE', output: 'text' });
      const result = judgeResult(item, 'contradiction_detect');
      assert.equal(result.name, 'contradiction_detect');
    });
  });

  describe('buildSelftestReport', () => {
    function makeItem(overrides: Partial<QueueItem>): QueueItem {
      return {
        task_id: 'test-id',
        session_id: 'sess',
        task_group_id: 'tg',
        prompt: 'test',
        status: 'COMPLETE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
      } as QueueItem;
    }

    it('should produce correct JSON structure with all fields', () => {
      const items: QueueItem[] = [
        makeItem({ task_id: 'st-1', status: 'COMPLETE', output: 'output1' }),
        makeItem({ task_id: 'st-2', status: 'COMPLETE', output: 'output2' }),
        makeItem({ task_id: 'st-3', status: 'ERROR', output: '' }),
      ];
      const cases: SelftestCase[] = [
        { name: 'case1', prompt: 'p1' },
        { name: 'case2', prompt: 'p2' },
        { name: 'case3', prompt: 'p3' },
      ];

      const report = buildSelftestReport(items, cases);

      assert.ok(report.run_id);
      assert.ok(report.timestamp);
      assert.equal(report.total, 3);
      assert.equal(report.success, 2);
      assert.equal(report.fail, 1);
      assert.equal(report.results.length, 3);
    });

    it('should report all pass when all succeed', () => {
      const items: QueueItem[] = [
        makeItem({ task_id: 'st-1', status: 'COMPLETE', output: 'output1' }),
        makeItem({ task_id: 'st-2', status: 'COMPLETE', output: 'output2' }),
      ];
      const cases: SelftestCase[] = [
        { name: 'case1', prompt: 'p1' },
        { name: 'case2', prompt: 'p2' },
      ];

      const report = buildSelftestReport(items, cases);
      assert.equal(report.success, 2);
      assert.equal(report.fail, 0);
    });

    it('should report fails correctly', () => {
      const items: QueueItem[] = [
        makeItem({ task_id: 'st-1', status: 'COMPLETE', output: 'ok' }),
        makeItem({ task_id: 'st-2', status: 'ERROR', output: '' }),
      ];
      const cases: SelftestCase[] = [
        { name: 'pass_case', prompt: 'p1' },
        { name: 'fail_case', prompt: 'p2' },
      ];

      const report = buildSelftestReport(items, cases);
      assert.equal(report.success, 1);
      assert.equal(report.fail, 1);
    });

    it('should have run_id in selftest-YYYYMMDD-HHMM format', () => {
      const items: QueueItem[] = [
        makeItem({ task_id: 'st-1', status: 'COMPLETE', output: 'ok' }),
      ];
      const cases: SelftestCase[] = [{ name: 'test', prompt: 'p' }];

      const report = buildSelftestReport(items, cases);
      assert.match(report.run_id, /^selftest-\d{8}-\d{4}$/);
    });

    it('should have ISO timestamp', () => {
      const items: QueueItem[] = [
        makeItem({ task_id: 'st-1', status: 'COMPLETE', output: 'ok' }),
      ];
      const cases: SelftestCase[] = [{ name: 'test', prompt: 'p' }];

      const report = buildSelftestReport(items, cases);
      // Verify it's a valid ISO date
      const d = new Date(report.timestamp);
      assert.ok(!isNaN(d.getTime()));
    });

    it('should handle unknown case names gracefully', () => {
      const items: QueueItem[] = [
        makeItem({ task_id: 'st-1', status: 'COMPLETE', output: 'ok' }),
        makeItem({ task_id: 'st-2', status: 'COMPLETE', output: 'ok2' }),
      ];
      // Only 1 case for 2 items - second should get fallback name
      const cases: SelftestCase[] = [{ name: 'known', prompt: 'p' }];

      const report = buildSelftestReport(items, cases);
      assert.equal(report.results[0].name, 'known');
      assert.equal(report.results[1].name, 'unknown_1');
    });
  });

  describe('Exit code logic', () => {
    function makeItem(overrides: Partial<QueueItem>): QueueItem {
      return {
        task_id: 'test-id',
        session_id: 'sess',
        task_group_id: 'tg',
        prompt: 'test',
        status: 'COMPLETE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
      } as QueueItem;
    }

    it('exit code should be 0 when all pass (fail=0)', () => {
      const items: QueueItem[] = [
        makeItem({ status: 'COMPLETE', output: 'ok1' }),
        makeItem({ status: 'COMPLETE', output: 'ok2' }),
      ];
      const cases: SelftestCase[] = [
        { name: 'c1', prompt: 'p1' },
        { name: 'c2', prompt: 'p2' },
      ];

      const report = buildSelftestReport(items, cases);
      const exitCode = report.fail === 0 ? 0 : 1;
      assert.equal(exitCode, 0);
    });

    it('exit code should be 1 when any fail', () => {
      const items: QueueItem[] = [
        makeItem({ status: 'COMPLETE', output: 'ok1' }),
        makeItem({ status: 'ERROR', output: '' }),
      ];
      const cases: SelftestCase[] = [
        { name: 'c1', prompt: 'p1' },
        { name: 'c2', prompt: 'p2' },
      ];

      const report = buildSelftestReport(items, cases);
      const exitCode = report.fail === 0 ? 0 : 1;
      assert.equal(exitCode, 1);
    });
  });
});
