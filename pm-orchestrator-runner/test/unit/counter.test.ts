import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { Counter } from '../../src/counter';

describe('Counter', () => {
  it('starts at 0 by default', () => {
    const counter = new Counter();
    assert.equal(counter.getCount(), 0);
  });

  it('increments the count by 1', () => {
    const counter = new Counter();
    counter.increment();
    assert.equal(counter.getCount(), 1);
  });

  it('decrements the count by 1', () => {
    const counter = new Counter();
    counter.decrement();
    assert.equal(counter.getCount(), -1);
  });

  it('handles multiple increments', () => {
    const counter = new Counter();
    counter.increment();
    counter.increment();
    counter.increment();
    assert.equal(counter.getCount(), 3);
  });

  it('handles mixed increment and decrement', () => {
    const counter = new Counter();
    counter.increment();
    counter.increment();
    counter.decrement();
    assert.equal(counter.getCount(), 1);
  });
});
