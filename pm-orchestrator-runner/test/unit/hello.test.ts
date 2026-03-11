import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { fizzBuzz, fizzBuzzSequence } from '../../src/hello';

describe('fizzBuzz', () => {
  it('returns "Fizz" for multiples of 3', () => {
    assert.equal(fizzBuzz(3), 'Fizz');
    assert.equal(fizzBuzz(6), 'Fizz');
    assert.equal(fizzBuzz(9), 'Fizz');
  });

  it('returns "Buzz" for multiples of 5', () => {
    assert.equal(fizzBuzz(5), 'Buzz');
    assert.equal(fizzBuzz(10), 'Buzz');
    assert.equal(fizzBuzz(20), 'Buzz');
  });

  it('returns "FizzBuzz" for multiples of 15', () => {
    assert.equal(fizzBuzz(15), 'FizzBuzz');
    assert.equal(fizzBuzz(30), 'FizzBuzz');
    assert.equal(fizzBuzz(45), 'FizzBuzz');
  });

  it('returns the number as string for non-multiples', () => {
    assert.equal(fizzBuzz(1), '1');
    assert.equal(fizzBuzz(2), '2');
    assert.equal(fizzBuzz(7), '7');
    assert.equal(fizzBuzz(11), '11');
  });
});

describe('fizzBuzzSequence', () => {
  it('returns correct sequence for n=15', () => {
    const result = fizzBuzzSequence(15);
    assert.equal(result.length, 15);
    assert.equal(result[0], '1');
    assert.equal(result[2], 'Fizz');
    assert.equal(result[4], 'Buzz');
    assert.equal(result[14], 'FizzBuzz');
  });

  it('returns empty array for n=0', () => {
    assert.deepEqual(fizzBuzzSequence(0), []);
  });

  it('returns ["1"] for n=1', () => {
    assert.deepEqual(fizzBuzzSequence(1), ['1']);
  });
});
