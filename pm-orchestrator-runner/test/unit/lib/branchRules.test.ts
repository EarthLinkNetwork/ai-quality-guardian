import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  isReservedBranch,
  hasValidPrefix,
  validateBranchName,
} from '../../../src/lib/branchRules';

describe('branchRules', () => {
  describe('isReservedBranch', () => {
    it('returns true for all reserved branch names', () => {
      assert.equal(isReservedBranch('main'), true);
      assert.equal(isReservedBranch('master'), true);
      assert.equal(isReservedBranch('develop'), true);
      assert.equal(isReservedBranch('staging'), true);
      assert.equal(isReservedBranch('production'), true);
    });

    it('returns false for non-reserved names', () => {
      assert.equal(isReservedBranch('feature/add-login'), false);
      assert.equal(isReservedBranch('my-branch'), false);
    });

    it('is case-sensitive', () => {
      assert.equal(isReservedBranch('Main'), false);
      assert.equal(isReservedBranch('MAIN'), false);
      assert.equal(isReservedBranch('Develop'), false);
    });

    it('returns false for empty string', () => {
      assert.equal(isReservedBranch(''), false);
    });
  });

  describe('hasValidPrefix', () => {
    it('returns true for all valid prefixes', () => {
      assert.equal(hasValidPrefix('feature/x'), true);
      assert.equal(hasValidPrefix('bugfix/x'), true);
      assert.equal(hasValidPrefix('hotfix/x'), true);
      assert.equal(hasValidPrefix('release/x'), true);
      assert.equal(hasValidPrefix('chore/x'), true);
    });

    it('returns false for invalid prefixes', () => {
      assert.equal(hasValidPrefix('fix/x'), false);
      assert.equal(hasValidPrefix('feat/x'), false);
      assert.equal(hasValidPrefix('main'), false);
    });

    it('returns false for empty string', () => {
      assert.equal(hasValidPrefix(''), false);
    });

    it('requires the slash in the prefix', () => {
      assert.equal(hasValidPrefix('feature'), false);
      assert.equal(hasValidPrefix('featurex'), false);
    });
  });

  describe('validateBranchName', () => {
    describe('valid branch names', () => {
      it('accepts standard feature branch', () => {
        const result = validateBranchName('feature/add-login');
        assert.equal(result.valid, true);
        assert.equal(result.reason, undefined);
      });

      it('accepts bugfix branch', () => {
        assert.equal(validateBranchName('bugfix/fix-crash').valid, true);
      });

      it('accepts hotfix branch', () => {
        assert.equal(validateBranchName('hotfix/urgent-patch').valid, true);
      });

      it('accepts release branch', () => {
        assert.equal(validateBranchName('release/1.0.0').valid, true);
      });

      it('accepts chore branch', () => {
        assert.equal(validateBranchName('chore/update-deps').valid, true);
      });

      it('accepts branch with dots', () => {
        assert.equal(validateBranchName('release/1.2.3').valid, true);
      });

      it('accepts branch with underscores', () => {
        assert.equal(validateBranchName('feature/add_login_page').valid, true);
      });
    });

    describe('empty / whitespace boundary', () => {
      it('rejects empty string', () => {
        const result = validateBranchName('');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Branch name must not be empty');
      });

      it('rejects whitespace-only string', () => {
        const result = validateBranchName('   ');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Branch name must not be empty');
      });

      it('rejects leading whitespace', () => {
        const result = validateBranchName(' feature/x');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Branch name must not have leading or trailing whitespace');
      });

      it('rejects trailing whitespace', () => {
        const result = validateBranchName('feature/x ');
        assert.equal(result.valid, false);
        assert.equal(result.reason, 'Branch name must not have leading or trailing whitespace');
      });
    });

    describe('length boundary', () => {
      it('accepts name at exactly 100 characters', () => {
        const name = 'feature/' + 'a'.repeat(92); // 8 + 92 = 100
        assert.equal(name.length, 100);
        assert.equal(validateBranchName(name).valid, true);
      });

      it('rejects name at 101 characters', () => {
        const name = 'feature/' + 'a'.repeat(93); // 8 + 93 = 101
        assert.equal(name.length, 101);
        const result = validateBranchName(name);
        assert.equal(result.valid, false);
        assert.ok(result.reason!.includes('100'));
      });

      it('accepts single-char suffix', () => {
        assert.equal(validateBranchName('feature/x').valid, true);
      });
    });

    describe('invalid characters', () => {
      it('rejects spaces in name', () => {
        const result = validateBranchName('feature/add login');
        assert.equal(result.valid, false);
        assert.ok(result.reason!.includes('invalid characters'));
      });

      it('rejects special characters', () => {
        assert.equal(validateBranchName('feature/add@login').valid, false);
        assert.equal(validateBranchName('feature/add#login').valid, false);
        assert.equal(validateBranchName('feature/add~login').valid, false);
      });
    });

    describe('double-dot rule', () => {
      it('rejects names containing ".."', () => {
        const result = validateBranchName('feature/a..b');
        assert.equal(result.valid, false);
        assert.ok(result.reason!.includes('..'));
      });

      it('allows single dots', () => {
        assert.equal(validateBranchName('feature/v1.0').valid, true);
      });
    });

    describe('.lock suffix rule', () => {
      it('rejects names ending with ".lock"', () => {
        const result = validateBranchName('feature/my.lock');
        assert.equal(result.valid, false);
        assert.ok(result.reason!.includes('.lock'));
      });

      it('allows ".lock" in the middle', () => {
        assert.equal(validateBranchName('feature/lock-file').valid, true);
      });
    });

    describe('reserved branch names', () => {
      it('rejects "main"', () => {
        const result = validateBranchName('main');
        assert.equal(result.valid, false);
        assert.ok(result.reason!.includes('reserved'));
      });

      it('rejects "develop"', () => {
        const result = validateBranchName('develop');
        assert.equal(result.valid, false);
        assert.ok(result.reason!.includes('reserved'));
      });
    });

    describe('prefix validation', () => {
      it('rejects name without valid prefix', () => {
        const result = validateBranchName('my-branch');
        assert.equal(result.valid, false);
        assert.ok(result.reason!.includes('valid prefix'));
      });

      it('rejects name with prefix-like string but no slash', () => {
        const result = validateBranchName('featurebranch');
        assert.equal(result.valid, false);
      });
    });
  });
});
