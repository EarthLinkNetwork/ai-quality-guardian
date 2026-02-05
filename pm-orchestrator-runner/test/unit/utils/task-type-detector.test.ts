/**
 * Unit tests for task-type-detector
 * Verifies proper detection of READ_INFO, REPORT, and IMPLEMENTATION task types
 *
 * Critical fix: Japanese inputs must be correctly classified to prevent
 * INCOMPLETE -> ERROR misclassification in the executor pipeline.
 * See docs/REPORT_web_incomplete_runtime.md for details.
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
        assert.strictEqual(detectTaskType('is this approach correct?'), 'READ_INFO');
      });

      it('should detect explain requests', () => {
        assert.strictEqual(detectTaskType('explain the login flow'), 'READ_INFO');
      });

      it('should detect analyze requests', () => {
        assert.strictEqual(detectTaskType('analyze the database schema'), 'READ_INFO');
      });

      it('should detect show requests', () => {
        assert.strictEqual(detectTaskType('show me the current settings'), 'READ_INFO');
      });

      it('should detect status requests', () => {
        assert.strictEqual(detectTaskType('check the status of deployments'), 'READ_INFO');
      });

      it('should detect Japanese read patterns (start-anchored)', () => {
        assert.strictEqual(detectTaskType('確認してください'), 'READ_INFO');
        assert.strictEqual(detectTaskType('教えてください'), 'READ_INFO');
      });

      // NEW: Japanese patterns anywhere in input (not just start-anchored)
      it('should detect Japanese confirmation/check patterns mid-sentence', () => {
        assert.strictEqual(detectTaskType('このプロジェクトの構造を教えて'), 'READ_INFO');
        assert.strictEqual(detectTaskType('コードを確認してください'), 'READ_INFO');
        assert.strictEqual(detectTaskType('アーキテクチャの説明して'), 'READ_INFO');
      });

      // CRITICAL: These were misclassified as IMPLEMENTATION before the fix
      it('should detect Japanese test/verification/inspection patterns as READ_INFO', () => {
        assert.strictEqual(detectTaskType('矛盾検知テスト'), 'READ_INFO');
        assert.strictEqual(detectTaskType('整合性テスト'), 'READ_INFO');
        assert.strictEqual(detectTaskType('動作確認'), 'READ_INFO');
        assert.strictEqual(detectTaskType('品質チェック'), 'READ_INFO');
        assert.strictEqual(detectTaskType('ヘルスチェック'), 'READ_INFO');
        assert.strictEqual(detectTaskType('セキュリティ検査'), 'READ_INFO');
        assert.strictEqual(detectTaskType('矛盾検知'), 'READ_INFO');
      });

      it('should detect Japanese analysis patterns as READ_INFO', () => {
        assert.strictEqual(detectTaskType('パフォーマンス分析'), 'READ_INFO');
        assert.strictEqual(detectTaskType('コード解析'), 'READ_INFO');
        assert.strictEqual(detectTaskType('品質評価'), 'READ_INFO');
        assert.strictEqual(detectTaskType('セキュリティ診断'), 'READ_INFO');
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

      it('should detect Japanese report patterns', () => {
        assert.strictEqual(detectTaskType('要約してください'), 'REPORT');
        assert.strictEqual(detectTaskType('まとめを作成'), 'REPORT');
        assert.strictEqual(detectTaskType('レポートを出力'), 'REPORT');
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

      it('should detect Japanese implementation patterns (start-anchored)', () => {
        assert.strictEqual(detectTaskType('新しい機能を追加'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('追加してください'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('作成してください'), 'IMPLEMENTATION');
      });

      it('should detect Japanese implementation patterns (action verbs)', () => {
        assert.strictEqual(detectTaskType('バグを修正して'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('ファイルを削除して'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('コードを書き換えて'), 'IMPLEMENTATION');
      });

      it('should detect explicit test creation in Japanese', () => {
        assert.strictEqual(detectTaskType('テストを書いて'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('テストを追加して'), 'IMPLEMENTATION');
        assert.strictEqual(detectTaskType('テストを作成して'), 'IMPLEMENTATION');
      });
    });

    describe('ambiguous cases', () => {
      it('should prioritize REPORT over READ_INFO for report-related questions', () => {
        assert.strictEqual(detectTaskType('what is the summary of changes?'), 'REPORT');
      });

      it('should default to READ_INFO for truly ambiguous inputs', () => {
        // Changed from IMPLEMENTATION default to READ_INFO default
        // This prevents INCOMPLETE -> ERROR misclassification
        // 'handle' is not an explicit IMPLEMENTATION verb, defaults to READ_INFO
        assert.strictEqual(detectTaskType('handle the user data'), 'READ_INFO');
      });

      it('should default to READ_INFO for unrecognized Japanese inputs', () => {
        // Japanese inputs without clear modification verbs should not be IMPLEMENTATION
        assert.strictEqual(detectTaskType('何かを処理する'), 'READ_INFO');
        assert.strictEqual(detectTaskType('システムの状態'), 'READ_INFO');
      });
    });
  });
});
