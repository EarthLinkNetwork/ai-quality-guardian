/**
 * Semantic Resolver Tests
 *
 * Tier-0 Rule I compliance: semantic resolution of user input.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { SemanticResolver, resolveSemanticInput } from '../../../src/repl/semantic-resolver';
import { ClarificationType } from '../../../src/models/clarification';

describe('SemanticResolver', () => {
  describe('project root patterns', () => {
    const resolver = new SemanticResolver();

    it('should resolve "root直下" to project root', () => {
      const result = resolver.resolve('root直下', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, '.');
      assert.equal(result.confidence, 'high');
      assert.equal(result.matchedPattern, 'project-root');
    });

    it('should resolve "." to project root', () => {
      const result = resolver.resolve('.', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, '.');
    });

    it('should resolve "ここ" to project root', () => {
      const result = resolver.resolve('ここ', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, '.');
    });

    it('should resolve "here" to project root', () => {
      const result = resolver.resolve('here', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, '.');
    });

    it('should resolve "root" to project root', () => {
      const result = resolver.resolve('root', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, '.');
    });
  });

  describe('confirmation patterns', () => {
    const resolver = new SemanticResolver();

    it('should resolve "yes" for CONFIRM', () => {
      const result = resolver.resolve('yes', ClarificationType.CONFIRM);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'yes');
    });

    it('should resolve "はい" for CONFIRM', () => {
      const result = resolver.resolve('はい', ClarificationType.CONFIRM);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'yes');
    });

    it('should resolve "no" for CONFIRM', () => {
      const result = resolver.resolve('no', ClarificationType.CONFIRM);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'no');
    });

    it('should resolve "いいえ" for CONFIRM', () => {
      const result = resolver.resolve('いいえ', ClarificationType.CONFIRM);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'no');
    });

    it('should NOT resolve "yes" for TARGET_FILE (wrong type)', () => {
      const result = resolver.resolve('yes', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, false);
    });
  });

  describe('file path heuristic', () => {
    const resolver = new SemanticResolver();

    it('should resolve path with / as file path', () => {
      const result = resolver.resolve('src/index.ts', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'src/index.ts');
      assert.equal(result.matchedPattern, 'file-path-heuristic');
    });

    it('should resolve .ts extension as file path', () => {
      const result = resolver.resolve('index.ts', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'index.ts');
    });

    it('should resolve .md extension as file path', () => {
      const result = resolver.resolve('README.md', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'README.md');
    });
  });

  describe('option matching', () => {
    const resolver = new SemanticResolver();
    const options = ['Create new file', 'Overwrite existing', 'Skip'];

    it('should exact-match option (case insensitive)', () => {
      const result = resolver.resolveFromOptions('skip', options);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'Skip');
      assert.equal(result.matchedPattern, 'exact-option-match');
    });

    it('should prefix-match unambiguous option', () => {
      const result = resolver.resolveFromOptions('over', options);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'Overwrite existing');
      assert.equal(result.matchedPattern, 'prefix-option-match');
    });

    it('should NOT match ambiguous prefix', () => {
      // "c" could match "Create new file"
      // Only one match so it should resolve
      const result = resolver.resolveFromOptions('c', options);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'Create new file');
    });

    it('should NOT match empty input', () => {
      const result = resolver.resolveFromOptions('', options);
      assert.equal(result.resolved, false);
    });
  });

  describe('custom patterns', () => {
    it('should match custom pattern with higher priority', () => {
      const resolver = new SemanticResolver();
      resolver.addPattern({
        name: 'custom-test',
        inputs: ['test-value'],
        resolvedValue: 'resolved-test',
        applicableTypes: [ClarificationType.FREE_TEXT],
        confidence: 'high',
      });

      const result = resolver.resolve('test-value', ClarificationType.FREE_TEXT);
      assert.equal(result.resolved, true);
      assert.equal(result.value, 'resolved-test');
      assert.equal(result.matchedPattern, 'custom-test');
    });
  });

  describe('resolveSemanticInput (module-level)', () => {
    it('should work as standalone function', () => {
      const result = resolveSemanticInput('root直下', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, true);
      assert.equal(result.value, '.');
    });
  });

  describe('non-matching inputs', () => {
    const resolver = new SemanticResolver();

    it('should not resolve random text for TARGET_FILE', () => {
      const result = resolver.resolve('something random', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, false);
    });

    it('should not resolve empty string', () => {
      const result = resolver.resolve('', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, false);
    });

    it('should not resolve whitespace only', () => {
      const result = resolver.resolve('   ', ClarificationType.TARGET_FILE);
      assert.equal(result.resolved, false);
    });
  });
});
