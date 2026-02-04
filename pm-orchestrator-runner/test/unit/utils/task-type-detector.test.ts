/**
 * Unit tests for task-type-detector
 * Verifies proper detection of READ_INFO, REPORT, and IMPLEMENTATION task types
 */

import { strict as assert } from 'assert';
import { detectTaskType } from '../../../src/utils/task-type-detector';

describe('task-type-detector', () => {
  describe('detectTaskType', () => {
    describe('READ_INFO detection', () => {
      it('should detect questions starting with "what"', () => {
        assert.strictEqual(detectTaskType('what is the architecture of this project?'), 'READ_INFO');
      });

      it('should detect questions starting with "how"', () => {
        assert.strictEqual(detectTaskType('how does the authentication work?'), 'READ_INFO');
      });

      it('should detect questions ending with question mark', () => {
        // Note: "file" word triggers IMPLEMENTATION pattern, so use a question without it
        assert.strictEqual(detectTaskType('is this approach correct?'), 'READ_INFO');
      });

      it('should detect explain requests', () => {
        assert.strictEqual(detectTaskType('explain the login flow'), 'READ_INFO');
      });

      it('should detect analyze requests', () => {
        assert.strictEqual(detectTaskType('analyze the database schema'), 'READ_INFO');
      });

      it('should detect show requests', () => {
        // Note: "file" word triggers IMPLEMENTATION pattern, so use different example
        assert.strictEqual(detectTaskType('show me the current settings'), 'READ_INFO');
      });

      it('should detect status requests', () => {
        assert.strictEqual(detectTaskType('check the status of deployments'), 'READ_INFO');
      });

      it('should detect Japanese read patterns', () => {
        // Japanese patterns require starting with the pattern: 確認, 教えて, etc.
        assert.strictEqual(detectTaskType('確認してください'), 'READ_INFO');
        assert.strictEqual(detectTaskType('教えてください'), 'READ_INFO');
      });
    });

    describe('REPORT detection', () => {
      it('should detect report keyword', () => {
        assert.strictEqual(detectTaskType('generate a report of test coverage'), 'REPORT');
      });

      it('should detect summary keyword', () => {
        assert.strictEqual(detectTaskType('create a summary of changes'), 'REPORT');
      });

      it('should detect summarize keyword', () => {
        assert.strictEqual(detectTaskType('summarize the pull request'), 'REPORT');
      });

      it('should detect overview keyword', () => {
        assert.strictEqual(detectTaskType('give me an overview of the codebase'), 'REPORT');
      });

      it('should detect stats/statistics keyword', () => {
        assert.strictEqual(detectTaskType('show project stats'), 'REPORT');
        assert.strictEqual(detectTaskType('get code statistics'), 'REPORT');
      });
    });

    describe('IMPLEMENTATION detection', () => {
      it('should detect create requests', () => {
        assert.strictEqual(detectTaskType('create a new user service'), 'IMPLEMENTATION');
      });

      it('should detect add requests', () => {
        assert.strictEqual(detectTaskType('add a logout button'), 'IMPLEMENTATION');
      });

      it('should detect fix requests', () => {
        assert.strictEqual(detectTaskType('fix the authentication bug'), 'IMPLEMENTATION');
      });

      it('should detect modify requests', () => {
        assert.strictEqual(detectTaskType('modify the database connection'), 'IMPLEMENTATION');
      });

      it('should detect refactor requests', () => {
        assert.strictEqual(detectTaskType('refactor the user module'), 'IMPLEMENTATION');
      });

      it('should detect file extension patterns', () => {
        assert.strictEqual(detectTaskType('update app.ts'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('create config.json'), 'IMPLEMENTATION');
      });

      it('should detect Japanese implementation patterns', () => {
        assert.strictEqual(detectTaskType('新しい機能を追加'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('バグを修正して'), 'IMPLEMENTATION');
      });
    });

    describe('ambiguous cases', () => {
      it('should prioritize REPORT over READ_INFO for report-related questions', () => {
        assert.strictEqual(detectTaskType('what is the summary of changes?'), 'REPORT');
      });

      it('should default to IMPLEMENTATION for ambiguous cases', () => {
        // Ambiguous cases default to IMPLEMENTATION (fail-closed for safety)
        assert.strictEqual(detectTaskType('handle the user data'), 'IMPLEMENTATION');
      });
    });
  });
});
