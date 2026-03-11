import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { fibonacci, isPrime, gcd } from '../../src/math-utils';

describe('fibonacci', () => {
  it('returns 0 for n=0', () => {
    assert.equal(fibonacci(0), 0);
  });

  it('returns 1 for n=1', () => {
    assert.equal(fibonacci(1), 1);
  });

  it('returns 55 for n=10', () => {
    assert.equal(fibonacci(10), 55);
  });

  it('throws for negative input', () => {
    assert.throws(() => fibonacci(-1), /non-negative/);
  });
});

describe('isPrime', () => {
  it('returns false for 1', () => {
    assert.equal(isPrime(1), false);
  });

  it('returns true for 2', () => {
    assert.equal(isPrime(2), true);
  });

  it('returns true for 17', () => {
    assert.equal(isPrime(17), true);
  });

  it('returns false for 15', () => {
    assert.equal(isPrime(15), false);
  });
});

describe('gcd', () => {
  it('computes gcd of 12 and 8', () => {
    assert.equal(gcd(12, 8), 4);
  });

  it('computes gcd of 7 and 13 (coprimes)', () => {
    assert.equal(gcd(7, 13), 1);
  });

  it('computes gcd when one value is 0', () => {
    assert.equal(gcd(5, 0), 5);
  });

  it('handles negative numbers', () => {
    assert.equal(gcd(-12, 8), 4);
  });
});
