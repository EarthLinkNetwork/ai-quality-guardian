import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { greet } from '../../src/greeting';

describe('greet', () => {
  it('returns a greeting with the given name', () => {
    assert.equal(greet('Alice'), 'Hello, Alice!');
  });

  it('works with a different name', () => {
    assert.equal(greet('Bob'), 'Hello, Bob!');
  });

  it('handles an empty string', () => {
    assert.equal(greet(''), 'Hello, !');
  });

  it('handles a name with spaces', () => {
    assert.equal(greet('John Doe'), 'Hello, John Doe!');
  });
});
