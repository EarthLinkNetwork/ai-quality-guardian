/**
 * Clarification History Tests
 *
 * Tier-0 Rule I compliance: no repeat clarification after /respond.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { ClarificationHistory } from '../../../src/repl/clarification-history';
import { ClarificationType } from '../../../src/models/clarification';

describe('ClarificationHistory', () => {
  describe('record and lookup', () => {
    it('should record and retrieve an answer', () => {
      const history = new ClarificationHistory();
      history.record('Which file?', ClarificationType.TARGET_FILE, 'src/index.ts');

      const result = history.lookup('Which file?');
      assert.equal(result.found, true);
      assert.equal(result.answer, 'src/index.ts');
    });

    it('should return not found for unrecorded question', () => {
      const history = new ClarificationHistory();
      const result = history.lookup('Unknown question');
      assert.equal(result.found, false);
      assert.equal(result.answer, undefined);
    });

    it('should match regardless of trailing punctuation', () => {
      const history = new ClarificationHistory();
      history.record('Which file?', ClarificationType.TARGET_FILE, 'src/index.ts');

      const result = history.lookup('Which file');
      assert.equal(result.found, true, 'Should match without question mark');
      assert.equal(result.answer, 'src/index.ts');
    });

    it('should match regardless of case', () => {
      const history = new ClarificationHistory();
      history.record('Which File?', ClarificationType.TARGET_FILE, 'src/index.ts');

      const result = history.lookup('which file?');
      assert.equal(result.found, true, 'Should match case-insensitively');
    });

    it('should match regardless of extra whitespace', () => {
      const history = new ClarificationHistory();
      history.record('Which  file?', ClarificationType.TARGET_FILE, 'src/index.ts');

      const result = history.lookup('Which file?');
      assert.equal(result.found, true, 'Should match with collapsed whitespace');
    });
  });

  describe('hasAnswer', () => {
    it('should return true for recorded questions', () => {
      const history = new ClarificationHistory();
      history.record('Overwrite?', ClarificationType.CONFIRM, 'yes');

      assert.equal(history.hasAnswer('Overwrite?'), true);
    });

    it('should return false for unrecorded questions', () => {
      const history = new ClarificationHistory();
      assert.equal(history.hasAnswer('New question'), false);
    });
  });

  describe('repeat prevention (Rule I)', () => {
    it('should auto-resolve second identical clarification', () => {
      const history = new ClarificationHistory();

      // First time: record answer
      history.record('Which file to modify?', ClarificationType.TARGET_FILE, 'src/app.ts');

      // Second time: same question should auto-resolve
      const lookup = history.lookup('Which file to modify?');
      assert.equal(lookup.found, true);
      assert.equal(lookup.answer, 'src/app.ts');
    });

    it('should distinguish different questions', () => {
      const history = new ClarificationHistory();

      history.record('Which file?', ClarificationType.TARGET_FILE, 'src/a.ts');
      history.record('Which action?', ClarificationType.SELECT_ONE, 'create');

      const file = history.lookup('Which file?');
      assert.equal(file.found, true);
      assert.equal(file.answer, 'src/a.ts');

      const action = history.lookup('Which action?');
      assert.equal(action.found, true);
      assert.equal(action.answer, 'create');
    });

    it('should update answer if same question answered differently', () => {
      const history = new ClarificationHistory();

      history.record('Overwrite?', ClarificationType.CONFIRM, 'no');
      history.record('Overwrite?', ClarificationType.CONFIRM, 'yes');

      const result = history.lookup('Overwrite?');
      assert.equal(result.found, true);
      assert.equal(result.answer, 'yes', 'Should use latest answer');
    });
  });

  describe('normalisation', () => {
    it('should lowercase', () => {
      assert.equal(ClarificationHistory.normalise('HELLO'), 'hello');
    });

    it('should trim whitespace', () => {
      assert.equal(ClarificationHistory.normalise('  hello  '), 'hello');
    });

    it('should remove trailing punctuation', () => {
      assert.equal(ClarificationHistory.normalise('hello?'), 'hello');
      assert.equal(ClarificationHistory.normalise('hello!'), 'hello');
      assert.equal(ClarificationHistory.normalise('hello.'), 'hello');
      assert.equal(ClarificationHistory.normalise('hello???'), 'hello');
    });

    it('should collapse multiple spaces', () => {
      assert.equal(ClarificationHistory.normalise('hello   world'), 'hello world');
    });
  });

  describe('hash', () => {
    it('should produce consistent hashes', () => {
      const h1 = ClarificationHistory.hash('Which file?');
      const h2 = ClarificationHistory.hash('Which file?');
      assert.equal(h1, h2);
    });

    it('should produce same hash for normalised equivalents', () => {
      const h1 = ClarificationHistory.hash('Which file?');
      const h2 = ClarificationHistory.hash('which file');
      assert.equal(h1, h2, 'Normalised equivalents should have same hash');
    });

    it('should produce different hashes for different questions', () => {
      const h1 = ClarificationHistory.hash('Which file?');
      const h2 = ClarificationHistory.hash('Which action?');
      assert.notEqual(h1, h2);
    });
  });

  describe('management', () => {
    it('should report size correctly', () => {
      const history = new ClarificationHistory();
      assert.equal(history.size, 0);

      history.record('Q1', ClarificationType.CONFIRM, 'yes');
      assert.equal(history.size, 1);

      history.record('Q2', ClarificationType.CONFIRM, 'no');
      assert.equal(history.size, 2);
    });

    it('should clear all entries', () => {
      const history = new ClarificationHistory();
      history.record('Q1', ClarificationType.CONFIRM, 'yes');
      history.record('Q2', ClarificationType.CONFIRM, 'no');

      history.clear();
      assert.equal(history.size, 0);
      assert.equal(history.hasAnswer('Q1'), false);
    });

    it('should return all entries', () => {
      const history = new ClarificationHistory();
      history.record('Q1', ClarificationType.CONFIRM, 'yes');
      history.record('Q2', ClarificationType.TARGET_FILE, 'src/a.ts');

      const all = history.getAll();
      assert.equal(all.length, 2);
    });
  });
});
