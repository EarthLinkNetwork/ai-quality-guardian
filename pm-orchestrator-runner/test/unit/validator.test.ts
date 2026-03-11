import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { isValidEmail, isValidPhoneNumber } from '../../src/validator';

describe('isValidEmail', () => {
  it('accepts a standard email', () => {
    assert.equal(isValidEmail('user@example.com'), true);
  });

  it('accepts email with subdomain', () => {
    assert.equal(isValidEmail('user@mail.example.com'), true);
  });

  it('accepts email with plus tag', () => {
    assert.equal(isValidEmail('user+tag@example.com'), true);
  });

  it('accepts email with dots in local part', () => {
    assert.equal(isValidEmail('first.last@example.com'), true);
  });

  it('rejects empty string', () => {
    assert.equal(isValidEmail(''), false);
  });

  it('rejects string without @', () => {
    assert.equal(isValidEmail('userexample.com'), false);
  });

  it('rejects string with multiple @', () => {
    assert.equal(isValidEmail('user@@example.com'), false);
  });

  it('rejects string without domain', () => {
    assert.equal(isValidEmail('user@'), false);
  });

  it('rejects string without local part', () => {
    assert.equal(isValidEmail('@example.com'), false);
  });

  it('rejects domain without TLD', () => {
    assert.equal(isValidEmail('user@example'), false);
  });

  it('rejects email with spaces', () => {
    assert.equal(isValidEmail('user @example.com'), false);
  });
});

describe('isValidPhoneNumber', () => {
  it('accepts US format with country code', () => {
    assert.equal(isValidPhoneNumber('+12025551234'), true);
  });

  it('accepts international format with country code', () => {
    assert.equal(isValidPhoneNumber('+819012345678'), true);
  });

  it('accepts number with dashes', () => {
    assert.equal(isValidPhoneNumber('090-1234-5678'), true);
  });

  it('accepts number with spaces', () => {
    assert.equal(isValidPhoneNumber('090 1234 5678'), true);
  });

  it('accepts number with parentheses', () => {
    assert.equal(isValidPhoneNumber('(202) 555-1234'), true);
  });

  it('accepts plain digits of valid length', () => {
    assert.equal(isValidPhoneNumber('09012345678'), true);
  });

  it('rejects empty string', () => {
    assert.equal(isValidPhoneNumber(''), false);
  });

  it('rejects string with letters', () => {
    assert.equal(isValidPhoneNumber('090-abcd-5678'), false);
  });

  it('rejects too few digits', () => {
    assert.equal(isValidPhoneNumber('12345'), false);
  });

  it('rejects too many digits', () => {
    assert.equal(isValidPhoneNumber('+1234567890123456'), false);
  });
});
