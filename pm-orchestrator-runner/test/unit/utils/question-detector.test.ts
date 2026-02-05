/**
 * Unit Tests for Question Detector
 * Tests for src/utils/question-detector.ts
 * Per spec COMPLETION_JUDGMENT.md
 */

import * as assert from 'assert';
import {
  detectQuestions,
  hasUnansweredQuestions,
  determineCompletionStatus,
  QuestionDetectionResult,
} from '../../../src/utils/question-detector';

describe('Question Detector', () => {
  describe('detectQuestions', () => {
    describe('Japanese Question Patterns', () => {
      it('should detect どうしますか pattern', () => {
        const result = detectQuestions('この問題をどうしますか？');
        assert.ok(result.hasQuestions, 'Should detect question');
        assert.ok(result.confidence >= 0.6, 'Confidence should be >= 0.6');
        assert.ok(result.matchedPatterns.length > 0, 'Should have matched patterns');
      });

      it('should detect どうしましょうか pattern', () => {
        const result = detectQuestions('次はどうしましょうか？');
        assert.ok(result.hasQuestions, 'Should detect question');
      });

      it('should detect どちらにしますか pattern', () => {
        const result = detectQuestions('AとBのどちらにしますか？');
        assert.ok(result.hasQuestions, 'Should detect question');
        assert.ok(result.confidence >= 0.6);
      });

      it('should detect よろしいですか pattern', () => {
        const result = detectQuestions('この方法でよろしいですか？');
        assert.ok(result.hasQuestions, 'Should detect question');
      });

      it('should detect 確認ください pattern', () => {
        const result = detectQuestions('設定を確認ください。');
        assert.ok(result.confidence > 0, 'Should have some confidence');
      });

      it('should detect 選んでください pattern', () => {
        const result = detectQuestions('以下のオプションから選んでください。');
        assert.ok(result.hasQuestions, 'Should detect selection request');
        assert.ok(result.confidence >= 0.6);
      });

      it('should detect お選びください pattern', () => {
        const result = detectQuestions('ご希望のプランをお選びください。');
        assert.ok(result.hasQuestions, 'Should detect formal selection request');
      });

      it('should detect いかがでしょうか pattern', () => {
        const result = detectQuestions('こちらのプランはいかがでしょうか？');
        assert.ok(result.confidence > 0, 'Should have some confidence');
      });
    });

    describe('English Question Patterns', () => {
      it('should detect "please let me know" pattern', () => {
        const result = detectQuestions('Please let me know your preference.');
        assert.ok(result.hasQuestions, 'Should detect question');
        assert.ok(result.confidence >= 0.6);
      });

      it('should detect "could you specify" pattern', () => {
        const result = detectQuestions('Could you specify the requirements?');
        assert.ok(result.hasQuestions, 'Should detect question');
      });

      it('should detect "which option" pattern', () => {
        const result = detectQuestions('Which option would you prefer?');
        assert.ok(result.hasQuestions, 'Should detect question');
      });

      it('should detect "do you want" pattern', () => {
        const result = detectQuestions('Do you want to proceed with this?');
        assert.ok(result.hasQuestions, 'Should detect question');
      });

      it('should detect "should I proceed" pattern', () => {
        const result = detectQuestions('Should I proceed with the implementation?');
        assert.ok(result.confidence > 0, 'Should have some confidence');
      });

      it('should detect "would you like" pattern', () => {
        const result = detectQuestions('Would you like me to continue?');
        assert.ok(result.hasQuestions, 'Should detect question');
      });

      it('should detect "can you tell" pattern', () => {
        const result = detectQuestions('Can you tell me more about the issue?');
        assert.ok(result.confidence > 0, 'Should have some confidence');
      });

      it('should detect "what do you" pattern', () => {
        const result = detectQuestions('What do you think about this approach?');
        assert.ok(result.hasQuestions, 'Should detect question');
      });

      it('should be case insensitive', () => {
        const result1 = detectQuestions('PLEASE LET ME KNOW your choice.');
        const result2 = detectQuestions('please let me know your choice.');
        assert.ok(result1.confidence === result2.confidence, 'Should be case insensitive');
      });
    });

    describe('Option Patterns', () => {
      it('should detect numbered options with selection request', () => {
        const result = detectQuestions(`
          以下から選んでください：
          1) オプションA
          2) オプションB
          3) オプションC
        `);
        assert.ok(result.hasQuestions, 'Should detect options with selection request');
        assert.ok(result.matchedPatterns.some(p => p.includes('1)')), 'Should match numbered option');
      });

      it('should detect lettered options', () => {
        const result = detectQuestions(`
          Please select:
          A) Option one
          B) Option two
        `);
        assert.ok(result.matchedPatterns.some(p => p.includes('A)')), 'Should match lettered option');
      });

      it('should detect Japanese option format', () => {
        const result = detectQuestions('オプション1を推奨します');
        assert.ok(result.matchedPatterns.some(p => p.includes('オプション')));
      });
    });

    describe('Question Mark Patterns', () => {
      it('should detect question marks at end of line', () => {
        const result = detectQuestions('Are you sure?\n');
        assert.ok(result.confidence > 0, 'Should have some confidence from question mark');
      });

      it('should detect question marks at end of text', () => {
        const result = detectQuestions('Is this correct?');
        assert.ok(result.confidence > 0);
      });
    });

    describe('Code Block Filtering', () => {
      it('should ignore questions inside code blocks', () => {
        const result = detectQuestions(`
          Here's an example:
          \`\`\`python
          def ask():
              return "Would you like to continue?"
          \`\`\`

          The code is complete.
        `);
        // The question is inside code block, should have low confidence
        assert.ok(!result.hasQuestions || result.confidence < 0.6,
          'Should ignore questions in code blocks');
      });

      it('should detect questions outside code blocks', () => {
        const result = detectQuestions(`
          \`\`\`python
          def example():
              pass
          \`\`\`

          Would you like me to explain this code?
        `);
        assert.ok(result.hasQuestions, 'Should detect questions outside code blocks');
      });
    });

    describe('Threshold Behavior', () => {
      it('should return hasQuestions=true when confidence >= 0.6', () => {
        // High-weight pattern: どちらにしますか (0.9)
        const result = detectQuestions('AとBのどちらにしますか？');
        assert.ok(result.hasQuestions === (result.confidence >= 0.6));
      });

      it('should return hasQuestions=false for low-confidence matches', () => {
        // Only question mark pattern (low weight)
        const result = detectQuestions('Hello world?');
        assert.ok(result.confidence < 0.6, 'Single question mark should have low confidence');
        assert.ok(!result.hasQuestions, 'Should not flag as question');
      });

      it('should accumulate weights from multiple patterns', () => {
        const result = detectQuestions(`
          どちらにしますか？
          Please let me know your choice.
        `);
        assert.ok(result.confidence > 0.6, 'Multiple patterns should accumulate');
        assert.ok(result.matchedPatterns.length >= 2, 'Should have multiple matches');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string', () => {
        const result = detectQuestions('');
        assert.ok(!result.hasQuestions);
        assert.equal(result.confidence, 0);
        assert.deepEqual(result.matchedPatterns, []);
      });

      it('should handle null/undefined', () => {
        const result1 = detectQuestions(null as any);
        const result2 = detectQuestions(undefined as any);
        assert.ok(!result1.hasQuestions);
        assert.ok(!result2.hasQuestions);
      });

      it('should handle very long text', () => {
        const longText = 'This is some text. '.repeat(1000) + 'Would you like to continue?';
        const result = detectQuestions(longText);
        assert.ok(result.hasQuestions, 'Should detect question in long text');
      });

      it('should handle text with no questions', () => {
        const result = detectQuestions(`
          Task completed successfully.
          All tests passed.
          Files updated: 3
        `);
        assert.ok(!result.hasQuestions, 'Should not detect questions in statement');
        assert.equal(result.confidence, 0);
      });
    });
  });

  describe('hasUnansweredQuestions', () => {
    it('should return true for text with questions', () => {
      assert.ok(hasUnansweredQuestions('どうしましょうか？'));
      assert.ok(hasUnansweredQuestions('Would you like to proceed?'));
    });

    it('should return false for text without questions', () => {
      assert.ok(!hasUnansweredQuestions('Task completed.'));
      assert.ok(!hasUnansweredQuestions('All files updated successfully.'));
    });

    it('should be a simple wrapper around detectQuestions', () => {
      const text = 'Please let me know your preference.';
      const detectedResult = detectQuestions(text);
      const simpleResult = hasUnansweredQuestions(text);
      assert.equal(simpleResult, detectedResult.hasQuestions);
    });
  });

  describe('determineCompletionStatus', () => {
    describe('INCOMPLETE status', () => {
      it('should return INCOMPLETE for empty output', () => {
        assert.equal(determineCompletionStatus(''), 'INCOMPLETE');
      });

      it('should return INCOMPLETE for undefined output', () => {
        assert.equal(determineCompletionStatus(undefined), 'INCOMPLETE');
      });

      it('should return INCOMPLETE for whitespace-only output', () => {
        assert.equal(determineCompletionStatus('   \n\t  '), 'INCOMPLETE');
      });
    });

    describe('AWAITING_RESPONSE status', () => {
      it('should return AWAITING_RESPONSE when questions detected', () => {
        assert.equal(
          determineCompletionStatus('この設定でよろしいですか？'),
          'AWAITING_RESPONSE'
        );
      });

      it('should return AWAITING_RESPONSE for English questions', () => {
        assert.equal(
          determineCompletionStatus('Would you like me to make these changes?'),
          'AWAITING_RESPONSE'
        );
      });

      it('should return AWAITING_RESPONSE for option selection requests', () => {
        assert.equal(
          determineCompletionStatus(`
            以下から選んでください：
            1) オプションA
            2) オプションB
          `),
          'AWAITING_RESPONSE'
        );
      });
    });

    describe('COMPLETE status', () => {
      it('should return COMPLETE for output without questions', () => {
        assert.equal(
          determineCompletionStatus('タスクが完了しました。'),
          'COMPLETE'
        );
      });

      it('should return COMPLETE for technical output', () => {
        assert.equal(
          determineCompletionStatus(`
            Build successful.
            Test results: 100 passed, 0 failed.
            Coverage: 85%
          `),
          'COMPLETE'
        );
      });

      it('should return COMPLETE for informational output', () => {
        assert.equal(
          determineCompletionStatus(`
            現在のプロジェクト構成：
            - src/: ソースコード
            - test/: テストファイル
            - docs/: ドキュメント
          `),
          'COMPLETE'
        );
      });
    });

    describe('Per COMPLETION_JUDGMENT.md spec', () => {
      it('should handle READ_INFO output correctly', () => {
        // READ_INFO output with information only -> COMPLETE
        const infoOutput = `
          File analysis complete:
          - Total files: 42
          - Lines of code: 5,000
          - Dependencies: 15
        `;
        assert.equal(determineCompletionStatus(infoOutput), 'COMPLETE');
      });

      it('should handle REPORT output with clarifying question', () => {
        // REPORT output that asks for clarification -> AWAITING_RESPONSE
        const reportWithQuestion = `
          Analysis complete. Summary:
          - 3 critical issues found
          - 5 warnings

          詳細なレポートを出力しますか？
        `;
        assert.equal(determineCompletionStatus(reportWithQuestion), 'AWAITING_RESPONSE');
      });
    });
  });
});
