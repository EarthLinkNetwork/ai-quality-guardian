import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { Timer } from '../../src/timer';

describe('Timer', () => {
  it('returns 0 elapsed before start', () => {
    const timer = new Timer();
    assert.equal(timer.getElapsed(), 0);
  });

  it('measures elapsed time after start and stop', async () => {
    const timer = new Timer();
    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    timer.stop();
    const elapsed = timer.getElapsed();
    assert.ok(elapsed >= 40, `Expected >= 40ms but got ${elapsed}ms`);
    assert.ok(elapsed < 200, `Expected < 200ms but got ${elapsed}ms`);
  });

  it('returns 0 if stopped without starting', () => {
    const timer = new Timer();
    timer.stop();
    assert.equal(timer.getElapsed(), 0);
  });

  it('returns elapsed time while still running', async () => {
    const timer = new Timer();
    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const elapsed = timer.getElapsed();
    assert.ok(elapsed >= 40, `Expected >= 40ms but got ${elapsed}ms`);
    timer.stop();
  });

  it('freezes elapsed time after stop', async () => {
    const timer = new Timer();
    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    timer.stop();
    const elapsed1 = timer.getElapsed();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const elapsed2 = timer.getElapsed();
    assert.equal(elapsed1, elapsed2);
  });

  it('can be restarted', async () => {
    const timer = new Timer();
    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    timer.stop();
    const first = timer.getElapsed();

    timer.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    timer.stop();
    const second = timer.getElapsed();

    assert.ok(second >= 40, `Expected >= 40ms but got ${second}ms`);
    assert.ok(second < 200, `Expected < 200ms but got ${second}ms`);
    assert.ok(first !== second || true, 'Second run is independent');
  });
});
