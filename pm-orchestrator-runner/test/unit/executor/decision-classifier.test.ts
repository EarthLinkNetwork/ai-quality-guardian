/**
 * Tests for Decision Classification and User Preference System
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import { DecisionClassifier } from '../../../src/executor/decision-classifier';
import { UserPreferenceStore } from '../../../src/executor/user-preference-store';

describe('DecisionClassifier', () => {
  let classifier: DecisionClassifier;

  beforeEach(() => {
    classifier = new DecisionClassifier();
  });

  describe('classify', () => {
    it('should classify documentation questions as best_practice', () => {
      const result = classifier.classify('Where should I put the documentation?');
      assert.equal(result.category, 'best_practice');
      assert.ok(result.confidence >= 0.9, `Expected confidence >= 0.9, got ${result.confidence}`);
      assert.ok(result.suggestedResolution, 'Expected suggestedResolution to be defined');
    });

    it('should classify test location questions as best_practice', () => {
      const result = classifier.classify('Where should I put the test file?');
      assert.equal(result.category, 'best_practice');
      assert.ok(result.matchedRule, 'Expected matchedRule to be defined');
    });

    it('should classify product direction questions as case_by_case', () => {
      const result = classifier.classify('Which feature should we implement first?');
      assert.equal(result.category, 'case_by_case');
      assert.ok(result.confidence >= 0.7, `Expected confidence >= 0.7, got ${result.confidence}`);
    });

    it('should classify preference questions as case_by_case', () => {
      const result = classifier.classify('Do you prefer React or Vue for this project?');
      assert.equal(result.category, 'case_by_case');
    });

    it('should classify framework choice as case_by_case', () => {
      const result = classifier.classify('Which library should we use for state management?');
      assert.equal(result.category, 'case_by_case');
    });

    it('should return unknown for ambiguous questions', () => {
      const result = classifier.classify('What color is the sky?');
      assert.equal(result.category, 'unknown');
    });

    it('should classify config location as best_practice', () => {
      const result = classifier.classify('Where should I put the configuration file?');
      assert.equal(result.category, 'best_practice');
    });

    it('should classify branch naming as best_practice', () => {
      const result = classifier.classify('What should I name this feature branch?');
      assert.equal(result.category, 'best_practice');
    });

    it('should classify commit message format as best_practice', () => {
      const result = classifier.classify('How should I format this git commit message?');
      assert.equal(result.category, 'best_practice');
    });
  });

  describe('with context', () => {
    it('should consider context in classification', () => {
      const result = classifier.classify(
        'Where should this go?',
        'I need to create a new test file for the UserService component'
      );
      assert.equal(result.category, 'best_practice');
    });
  });

  describe('custom rules', () => {
    it('should accept custom rules', () => {
      const customClassifier = new DecisionClassifier([
        {
          id: 'custom-api-location',
          pattern: /api.*route/i,
          category: 'api_location',
          resolution: 'src/api/',
          reasoning: 'API routes should be in src/api/',
        },
      ]);

      const result = customClassifier.classify('Where should I put this API route?');
      assert.equal(result.category, 'best_practice');
      assert.equal(result.suggestedResolution, 'src/api/');
    });
  });
});

describe('UserPreferenceStore', () => {
  let store: UserPreferenceStore;
  const testStoragePath = '/tmp/pm-runner-test-prefs.json';

  beforeEach(() => {
    // Clean up test storage
    try {
      fs.unlinkSync(testStoragePath);
    } catch {
      // File may not exist
    }

    store = new UserPreferenceStore({
      storagePath: testStoragePath,
      namespace: 'test',
      minAutoApplyConfidence: 0.7,
    });
  });

  afterEach(() => {
    // Clean up test storage
    try {
      fs.unlinkSync(testStoragePath);
    } catch {
      // File may not exist
    }
  });

  describe('recordPreference', () => {
    it('should record a new preference', () => {
      const pref = store.recordPreference(
        'framework_choice',
        'Which framework do you prefer?',
        'React',
        'For a new web project'
      );

      assert.equal(pref.category, 'framework_choice');
      assert.equal(pref.choice, 'React');
      assert.equal(pref.confidence, 0.6); // Initial confidence
      assert.equal(pref.confirmationCount, 1);
    });

    it('should increase confidence on repeated same choice', () => {
      store.recordPreference('framework_choice', 'Which framework?', 'React');
      const pref = store.recordPreference('framework_choice', 'Which framework?', 'React');

      assert.ok(pref.confidence > 0.6, `Expected confidence > 0.6, got ${pref.confidence}`);
      assert.equal(pref.confirmationCount, 2);
    });

    it('should decrease confidence on different choice', () => {
      const firstPref = store.recordPreference('framework_choice', 'Which framework?', 'React');
      // Record same question with different answer
      store.recordPreference('framework_choice', 'Which framework?', 'Vue');

      // The React preference should have decreased confidence
      const prefs = store.getByCategory('framework_choice');
      const reactPref = prefs.find(p => p.choice === 'React');

      // React preference may be replaced or have decreased confidence
      if (reactPref) {
        assert.ok(
          reactPref.confidence <= firstPref.confidence,
          `Expected confidence <= ${firstPref.confidence}, got ${reactPref.confidence}`
        );
      }
    });
  });

  describe('findMatch', () => {
    it('should find matching preference by keywords', () => {
      store.recordPreference('framework_choice', 'Which JavaScript framework?', 'React');

      const match = store.findMatch('framework_choice', 'What framework should I use?');
      assert.ok(match, 'Expected to find a match');
      assert.equal(match?.preference.choice, 'React');
    });

    it('should return null when no match found', () => {
      store.recordPreference('framework_choice', 'Which JavaScript framework?', 'React');

      const match = store.findMatch('database_choice', 'Which database should I use?');
      assert.equal(match, null);
    });
  });

  describe('canAutoApply', () => {
    it('should not auto-apply low confidence preferences', () => {
      store.recordPreference('test_category', 'test question', 'test choice');
      const match = store.findMatch('test_category', 'test question');

      if (match) {
        assert.equal(store.canAutoApply(match), false); // Initial confidence is 0.6
      }
    });

    it('should auto-apply high confidence preferences', () => {
      // Record multiple times to increase confidence
      store.recordPreference('test_category', 'test question', 'test choice');
      store.recordPreference('test_category', 'test question', 'test choice');
      store.recordPreference('test_category', 'test question', 'test choice');

      const match = store.findMatch('test_category', 'test question');

      if (match) {
        // After 3 confirmations, confidence should be >= 0.7
        assert.equal(store.canAutoApply(match), true);
      }
    });
  });

  describe('persistence', () => {
    it('should persist and load preferences', () => {
      store.recordPreference('framework_choice', 'Which framework?', 'React');

      // Create new store instance with same storage path
      const newStore = new UserPreferenceStore({
        storagePath: testStoragePath,
        namespace: 'test',
      });

      const prefs = newStore.getAll();
      assert.equal(prefs.length, 1);
      assert.equal(prefs[0].choice, 'React');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      store.recordPreference('framework_choice', 'Which framework?', 'React');
      store.recordPreference('database_choice', 'Which database?', 'PostgreSQL');

      const stats = store.getStats();
      assert.equal(stats.totalPreferences, 2);
      assert.equal(stats.byCategory['framework_choice'], 1);
      assert.equal(stats.byCategory['database_choice'], 1);
    });
  });

  describe('clear', () => {
    it('should clear all preferences', () => {
      store.recordPreference('test', 'question', 'answer');
      store.clear();

      assert.equal(store.getAll().length, 0);
    });
  });
});
