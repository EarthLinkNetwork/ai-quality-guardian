import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { add, subtract } from '../../src/calculator';

describe('add', () => {
  it('adds two positive numbers', () => {
    assert.equal(add(1, 2), 3);
  });

  it('adds negative numbers', () => {
    assert.equal(add(-1, -2), -3);
  });

  it('adds zero', () => {
    assert.equal(add(5, 0), 5);
  });
});

describe('subtract', () => {
  it('subtracts two positive numbers', () => {
    assert.equal(subtract(5, 3), 2);
  });

  it('returns negative when b is larger', () => {
    assert.equal(subtract(3, 5), -2);
  });

  it('subtracts zero', () => {
    assert.equal(subtract(5, 0), 5);
  });
});
