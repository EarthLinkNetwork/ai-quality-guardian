/**
 * Unit tests for task-type-detector
 * Verifies proper detection of READ_INFO, REPORT, and IMPLEMENTATION task types
 */

import { expect } from 'chai';
import { detectTaskType, TaskType } from '../../../src/utils/task-type-detector';

describe('task-type-detector', () => {
  describe('detectTaskType', () => {
    describe('READ_INFO detection', () => {
      it('should detect questions starting with "what"', () => {
        expect(detectTaskType('what is the architecture of this project?')).to.equal('READ_INFO');
      });

      it('should detect questions starting with "how"', () => {
        expect(detectTaskType('how does the authentication work?')).to.equal('READ_INFO');
      });

      it('should detect questions ending with question mark', () => {
        // Note: "file" word triggers IMPLEMENTATION pattern, so use a question without it
        expect(detectTaskType('is this approach correct?')).to.equal('READ_INFO');
      });

      it('should detect explain requests', () => {
        expect(detectTaskType('explain the login flow')).to.equal('READ_INFO');
      });

      it('should detect analyze requests', () => {
        expect(detectTaskType('analyze the database schema')).to.equal('READ_INFO');
      });

      it('should detect show requests', () => {
        // Note: "file" word triggers IMPLEMENTATION pattern, so use different example
        expect(detectTaskType('show me the current settings')).to.equal('READ_INFO');
      });

      it('should detect status requests', () => {
        expect(detectTaskType('check the status of deployments')).to.equal('READ_INFO');
      });

      it('should detect Japanese read patterns', () => {
        // Japanese patterns require starting with the pattern: 確認, 教えて, etc.
        expect(detectTaskType('確認してください')).to.equal('READ_INFO');
        expect(detectTaskType('教えてください')).to.equal('READ_INFO');
      });
    });

    describe('REPORT detection', () => {
      it('should detect report keyword', () => {
        expect(detectTaskType('generate a report of test coverage')).to.equal('REPORT');
      });

      it('should detect summary keyword', () => {
        expect(detectTaskType('create a summary of changes')).to.equal('REPORT');
      });

      it('should detect summarize keyword', () => {
        expect(detectTaskType('summarize the pull request')).to.equal('REPORT');
      });

      it('should detect overview keyword', () => {
        expect(detectTaskType('give me an overview of the codebase')).to.equal('REPORT');
      });

      it('should detect stats/statistics keyword', () => {
        expect(detectTaskType('show project stats')).to.equal('REPORT');
        expect(detectTaskType('get code statistics')).to.equal('REPORT');
      });
    });

    describe('IMPLEMENTATION detection', () => {
      it('should detect create requests', () => {
        expect(detectTaskType('create a new user service')).to.equal('IMPLEMENTATION');
      });

      it('should detect add requests', () => {
        expect(detectTaskType('add a logout button')).to.equal('IMPLEMENTATION');
      });

      it('should detect fix requests', () => {
        expect(detectTaskType('fix the authentication bug')).to.equal('IMPLEMENTATION');
      });

      it('should detect modify requests', () => {
        expect(detectTaskType('modify the database connection')).to.equal('IMPLEMENTATION');
      });

      it('should detect refactor requests', () => {
        expect(detectTaskType('refactor the user module')).to.equal('IMPLEMENTATION');
      });

      it('should detect file extension patterns', () => {
        expect(detectTaskType('update app.ts')).to.equal('IMPLEMENTATION');
        expect(detectTaskType('create config.json')).to.equal('IMPLEMENTATION');
      });

      it('should detect Japanese implementation patterns', () => {
        expect(detectTaskType('新しい機能を追加')).to.equal('IMPLEMENTATION');
        expect(detectTaskType('バグを修正して')).to.equal('IMPLEMENTATION');
      });
    });

    describe('ambiguous cases', () => {
      it('should prioritize REPORT over READ_INFO for report-related questions', () => {
        expect(detectTaskType('what is the summary of changes?')).to.equal('REPORT');
      });

      it('should default to IMPLEMENTATION for ambiguous cases', () => {
        // Ambiguous cases default to IMPLEMENTATION (fail-closed for safety)
        expect(detectTaskType('handle the user data')).to.equal('IMPLEMENTATION');
      });
    });
  });
});
