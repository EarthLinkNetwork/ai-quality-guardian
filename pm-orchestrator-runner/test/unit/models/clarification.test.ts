/**
 * ClarificationType Tests
 *
 * Tier-0 Rule F compliance: typed clarification system.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { ClarificationType, reasonToType } from '../../../src/models/clarification';

describe('ClarificationType', () => {
  describe('enum values', () => {
    it('should have TARGET_FILE', () => {
      assert.equal(ClarificationType.TARGET_FILE, 'TARGET_FILE');
    });

    it('should have SELECT_ONE', () => {
      assert.equal(ClarificationType.SELECT_ONE, 'SELECT_ONE');
    });

    it('should have CONFIRM', () => {
      assert.equal(ClarificationType.CONFIRM, 'CONFIRM');
    });

    it('should have FREE_TEXT', () => {
      assert.equal(ClarificationType.FREE_TEXT, 'FREE_TEXT');
    });

    it('should have exactly 4 values', () => {
      const values = Object.values(ClarificationType);
      assert.equal(values.length, 4);
    });
  });

  describe('reasonToType mapping', () => {
    it('should map target_file_exists to CONFIRM', () => {
      assert.equal(reasonToType('target_file_exists'), ClarificationType.CONFIRM);
    });

    it('should map target_file_ambiguous to TARGET_FILE', () => {
      assert.equal(reasonToType('target_file_ambiguous'), ClarificationType.TARGET_FILE);
    });

    it('should map target_action_ambiguous to SELECT_ONE', () => {
      assert.equal(reasonToType('target_action_ambiguous'), ClarificationType.SELECT_ONE);
    });

    it('should map missing_required_info to FREE_TEXT', () => {
      assert.equal(reasonToType('missing_required_info'), ClarificationType.FREE_TEXT);
    });

    it('should map scope_unclear to SELECT_ONE', () => {
      assert.equal(reasonToType('scope_unclear'), ClarificationType.SELECT_ONE);
    });

    it('should map action_ambiguous to SELECT_ONE', () => {
      assert.equal(reasonToType('action_ambiguous'), ClarificationType.SELECT_ONE);
    });

    it('should map missing_context to FREE_TEXT', () => {
      assert.equal(reasonToType('missing_context'), ClarificationType.FREE_TEXT);
    });

    it('should default unknown reasons to FREE_TEXT', () => {
      assert.equal(reasonToType('unknown_reason'), ClarificationType.FREE_TEXT);
      assert.equal(reasonToType(''), ClarificationType.FREE_TEXT);
    });
  });
});
