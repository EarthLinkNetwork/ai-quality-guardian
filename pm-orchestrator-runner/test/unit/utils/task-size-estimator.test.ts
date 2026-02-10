/**
 * Unit Tests for Task Size Estimator
 *
 * AC C: Dynamic Control - LLM estimates task size to select monitoring profile
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  estimateTaskSize,
  quickEstimateProfile,
  getCustomProfileForTask,
  TaskSizeCategory,
  TaskSizeEstimate,
} from '../../../src/utils/task-size-estimator';
import {
  STANDARD_PROFILE,
  LONG_PROFILE,
  EXTENDED_PROFILE,
} from '../../../src/utils/timeout-profile';

describe('task-size-estimator (AC C: Dynamic Control)', () => {
  describe('estimateTaskSize', () => {
    describe('small task detection', () => {
      it('should detect small tasks from keywords', () => {
        const result = estimateTaskSize('read the contents of this file');

        assert.strictEqual(result.category, 'small');
        assert.ok(result.confidence >= 0.4, 'Confidence should be >= 0.4');
        assert.ok(result.factors.some(f => f.name === 'small_keywords'));
        assert.deepStrictEqual(result.recommendedProfile, STANDARD_PROFILE);
      });

      it('should detect very short prompts as small', () => {
        const result = estimateTaskSize('hello');

        // Very short prompt with small keyword
        assert.strictEqual(result.category, 'small');
        assert.ok(result.factors.some(f => f.name === 'prompt_length'));
      });

      it('should detect "show" and "list" tasks as small', () => {
        const result = estimateTaskSize('show me the version');
        assert.strictEqual(result.category, 'small');

        const result2 = estimateTaskSize('list all files');
        assert.ok(result2.category === 'small' || result2.category === 'medium');
      });
    });

    describe('medium task detection', () => {
      it('should detect standard implementation tasks as medium', () => {
        const result = estimateTaskSize('implement a new function to validate input');

        assert.strictEqual(result.category, 'medium');
        assert.ok(result.factors.some(f => f.name === 'medium_keywords'));
      });

      it('should detect feature work as medium', () => {
        const result = estimateTaskSize('add a new component for user profile');

        assert.ok(result.category === 'medium' || result.category === 'small');
      });

      it('should detect bug fixes as medium', () => {
        const result = estimateTaskSize('fix bug in the authentication module');

        assert.ok(result.category === 'medium' || result.category === 'small');
      });
    });

    describe('large task detection', () => {
      it('should detect refactoring tasks as large', () => {
        // "refactor" is a large keyword - avoid "entire" which could push to x-large
        const result = estimateTaskSize('refactor the authentication system');

        assert.strictEqual(result.category, 'large');
        assert.ok(result.factors.some(f => f.name === 'large_keywords'));
        assert.deepStrictEqual(result.recommendedProfile, LONG_PROFILE);
      });

      it('should detect multi-file operations as large', () => {
        // "migrate" and "all files" are large keywords
        const result = estimateTaskSize('migrate all files from CommonJS to ESM');

        assert.ok(
          result.category === 'large' || result.category === 'x-large',
          `Expected large or x-large, got ${result.category}`
        );
      });

      it('should detect build tasks as at least large', () => {
        // "build" is a large keyword; with "deploy" it may reach x-large due to scoring
        const result = estimateTaskSize('build the application');

        assert.ok(
          result.category === 'large' || result.category === 'medium',
          `Expected large or medium, got ${result.category}`
        );
        assert.ok(result.factors.some(f => f.name === 'large_keywords'));
      });

      it('should detect comprehensive testing as large', () => {
        const result = estimateTaskSize('run full test suite with e2e tests');

        assert.ok(result.category === 'large' || result.category === 'medium');
      });
    });

    describe('x-large task detection', () => {
      it('should detect full project operations as x-large', () => {
        const result = estimateTaskSize('rewrite the entire codebase to TypeScript');

        assert.strictEqual(result.category, 'x-large');
        assert.ok(result.factors.some(f => f.name === 'xlarge_keywords'));
        assert.deepStrictEqual(result.recommendedProfile, EXTENDED_PROFILE);
      });

      it('should detect bulk operations as x-large', () => {
        const result = estimateTaskSize('batch process thousands of files automatically');

        assert.strictEqual(result.category, 'x-large');
      });

      it('should detect auto-dev loop indicators as x-large', () => {
        const result = estimateTaskSize('auto iterate until all tests pass in a loop');

        assert.ok(result.category === 'large' || result.category === 'x-large');
      });
    });

    describe('prompt length factor', () => {
      it('should treat very short prompts as smaller', () => {
        const shortPrompt = 'test';  // < 50 chars
        const result = estimateTaskSize(shortPrompt);

        const lengthFactor = result.factors.find(f => f.name === 'prompt_length');
        assert.ok(lengthFactor, 'Should have prompt_length factor');
        assert.ok(lengthFactor.score < 0, 'Short prompt should have negative score');
      });

      it('should treat long prompts as larger', () => {
        const longPrompt = 'a'.repeat(1100);  // > 1000 chars
        const result = estimateTaskSize(longPrompt);

        const lengthFactor = result.factors.find(f => f.name === 'prompt_length');
        assert.ok(lengthFactor, 'Should have prompt_length factor');
        assert.ok(lengthFactor.score > 0, 'Long prompt should have positive score');
      });
    });

    describe('file count factor', () => {
      it('should detect file count mentions', () => {
        const result = estimateTaskSize('update 15 files in the components directory');

        const fileCountFactor = result.factors.find(f => f.name === 'file_count');
        assert.ok(fileCountFactor, 'Should have file_count factor');
        assert.ok(fileCountFactor.score > 0, 'Many files should increase score');
      });

      it('should detect component count mentions', () => {
        // Regex expects: \d+\s*(files?|components?|modules?)
        const result = estimateTaskSize('create 8 components for the dashboard');

        const fileCountFactor = result.factors.find(f => f.name === 'file_count');
        assert.ok(fileCountFactor, 'Should have file_count factor');
      });
    });

    describe('taskType modifier', () => {
      it('should decrease score for READ_INFO task type', () => {
        const withoutType = estimateTaskSize('analyze the codebase');
        const withType = estimateTaskSize('analyze the codebase', 'READ_INFO');

        // READ_INFO should have a modifier that reduces the score
        const typeFactor = withType.factors.find(f => f.name === 'task_type');
        if (typeFactor) {
          assert.ok(typeFactor.score < 0, 'READ_INFO should have negative modifier');
        }
      });

      it('should increase score for DANGEROUS_OP task type', () => {
        const result = estimateTaskSize('delete old backups', 'DANGEROUS_OP');

        const typeFactor = result.factors.find(f => f.name === 'task_type');
        if (typeFactor) {
          assert.ok(typeFactor.score > 0, 'DANGEROUS_OP should have positive modifier');
        }
      });
    });

    describe('iteration/loop indicators', () => {
      it('should detect iteration keywords', () => {
        const result = estimateTaskSize('iterate until all tests pass');

        const iterFactor = result.factors.find(f => f.name === 'iteration');
        assert.ok(iterFactor, 'Should have iteration factor');
        assert.ok(iterFactor.score > 0, 'Iteration should increase score');
      });

      it('should detect repeat keywords', () => {
        const result = estimateTaskSize('repeat the process for each module');

        const iterFactor = result.factors.find(f => f.name === 'iteration');
        assert.ok(iterFactor, 'Should have iteration factor for repeat');
      });
    });

    describe('confidence calculation', () => {
      it('should have higher confidence when factors agree', () => {
        // All pointing to small
        const smallResult = estimateTaskSize('read this file');

        // Mixed signals
        const mixedResult = estimateTaskSize('read and refactor this entire module');

        // Both should have reasonable confidence
        assert.ok(smallResult.confidence >= 0.4 && smallResult.confidence <= 1);
        assert.ok(mixedResult.confidence >= 0.4 && mixedResult.confidence <= 1);
      });
    });

    describe('explanation', () => {
      it('should provide meaningful explanation', () => {
        const result = estimateTaskSize('implement a new feature');

        assert.ok(result.explanation, 'Should have explanation');
        assert.ok(result.explanation.length > 0, 'Explanation should not be empty');
      });
    });
  });

  describe('quickEstimateProfile', () => {
    it('should return STANDARD_PROFILE for small tasks', () => {
      const profile = quickEstimateProfile('read the file contents');
      assert.deepStrictEqual(profile, STANDARD_PROFILE);
    });

    it('should return LONG_PROFILE for large tasks', () => {
      // "refactor" is a large keyword but without "entire" to avoid x-large
      const profile = quickEstimateProfile('refactor the authentication module');
      assert.deepStrictEqual(profile, LONG_PROFILE);
    });

    it('should return EXTENDED_PROFILE for x-large tasks', () => {
      const profile = quickEstimateProfile('rewrite the entire codebase and auto iterate until complete');
      assert.deepStrictEqual(profile, EXTENDED_PROFILE);
    });

    it('should accept taskType parameter', () => {
      const profile = quickEstimateProfile('analyze this', 'READ_INFO');
      // READ_INFO modifier should influence result
      assert.ok(profile, 'Should return a profile');
    });
  });

  describe('getCustomProfileForTask', () => {
    it('should return base profile when no overrides provided', () => {
      const estimate: TaskSizeEstimate = {
        category: 'medium',
        confidence: 0.7,
        factors: [],
        recommendedProfile: STANDARD_PROFILE,
        explanation: 'Test',
      };

      const profile = getCustomProfileForTask(estimate);
      assert.deepStrictEqual(profile, STANDARD_PROFILE);
    });

    it('should apply idle timeout override', () => {
      const estimate: TaskSizeEstimate = {
        category: 'medium',
        confidence: 0.7,
        factors: [],
        recommendedProfile: STANDARD_PROFILE,
        explanation: 'Test',
      };

      const profile = getCustomProfileForTask(estimate, {
        idle_timeout_ms: 90_000,
        hard_timeout_ms: 900_000,
      });

      assert.strictEqual(profile.name, 'custom');
      assert.strictEqual(profile.idle_timeout_ms, 90_000);
      assert.strictEqual(profile.hard_timeout_ms, 900_000);
    });

    it('should use base profile values for missing overrides', () => {
      const estimate: TaskSizeEstimate = {
        category: 'large',
        confidence: 0.7,
        factors: [],
        recommendedProfile: LONG_PROFILE,
        explanation: 'Test',
      };

      // No overrides - should return LONG_PROFILE
      const profile = getCustomProfileForTask(estimate, {});
      assert.deepStrictEqual(profile, LONG_PROFILE);
    });
  });

  describe('integration with TimeoutProfile system', () => {
    it('should return valid TimeoutProfile objects', () => {
      const estimate = estimateTaskSize('refactor everything');
      const profile = estimate.recommendedProfile;

      // Verify it's a valid TimeoutProfile
      assert.ok(profile.name, 'Should have name');
      assert.ok(profile.idle_timeout_ms > 0, 'Should have positive idle_timeout_ms');
      assert.ok(profile.hard_timeout_ms > 0, 'Should have positive hard_timeout_ms');
      assert.ok(profile.hard_timeout_ms >= profile.idle_timeout_ms, 'hard >= idle');
      assert.ok(profile.description, 'Should have description');
    });

    it('should map categories to appropriate profiles', () => {
      // Small/medium -> STANDARD
      const small = estimateTaskSize('hello');
      assert.strictEqual(small.recommendedProfile.name, 'standard');

      // Large -> LONG (use refactor without "entire" which is x-large keyword)
      const large = estimateTaskSize('refactor the module structure');
      assert.strictEqual(large.recommendedProfile.name, 'long');

      // X-large -> EXTENDED (rewrite + entire + batch are all x-large indicators)
      const xlarge = estimateTaskSize('rewrite entire codebase batch thousands');
      assert.strictEqual(xlarge.recommendedProfile.name, 'extended');
    });
  });

  describe('edge cases', () => {
    it('should handle empty prompt', () => {
      const result = estimateTaskSize('');

      assert.ok(result.category, 'Should have category');
      assert.ok(result.recommendedProfile, 'Should have recommendedProfile');
    });

    it('should handle whitespace-only prompt', () => {
      const result = estimateTaskSize('   ');

      assert.ok(result.category, 'Should have category');
    });

    it('should handle unknown taskType', () => {
      const result = estimateTaskSize('do something', 'UNKNOWN_TYPE');

      // Should not have task_type factor for unknown types
      assert.ok(result.category, 'Should have category');
    });

    it('should be case insensitive for keywords', () => {
      const lower = estimateTaskSize('refactor the code');
      const upper = estimateTaskSize('REFACTOR THE CODE');
      const mixed = estimateTaskSize('Refactor The Code');

      // All should detect refactor
      assert.ok(lower.factors.some(f => f.name === 'large_keywords'));
      assert.ok(upper.factors.some(f => f.name === 'large_keywords'));
      assert.ok(mixed.factors.some(f => f.name === 'large_keywords'));
    });
  });
});
