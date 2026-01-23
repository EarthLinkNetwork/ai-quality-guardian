/**
 * AC-3: CLI 入力中にログ割り込みがない
 *
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md AC-3:
 * - 上部ペインにログが流れても下部ペインの入力は乱れない
 * - カーソル位置が維持される
 * - 入力中の文字列が維持される
 *
 * Per spec/18_CLI_TWO_PANE.md:
 * - 2ペイン構造: 上部ログ、下部入力
 * - ログは入力行を絶対に乱さない
 * - ANSI エスケープシーケンスで制御
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { TwoPaneRenderer } from '../../src/repl/two-pane-renderer';
import { Writable } from 'stream';

describe('AC-3: CLI 入力中にログ割り込みがない', () => {
  let renderer: TwoPaneRenderer;
  let outputBuffer: string;
  let mockOutput: Writable & { columns?: number };

  beforeEach(() => {
    outputBuffer = '';
    mockOutput = new Writable({
      write(chunk, encoding, callback) {
        outputBuffer += chunk.toString();
        callback();
      }
    }) as Writable & { columns?: number };
    mockOutput.columns = 80;
    (mockOutput as { isTTY?: boolean }).isTTY = true;

    renderer = new TwoPaneRenderer({
      output: mockOutput as NodeJS.WriteStream,
      prompt: 'pm> ',
      enabled: true,
    });
  });

  describe('入力バッファの維持', () => {
    it('ログ出力が入力バッファに影響しない', (done) => {
      // 入力バッファに文字を設定
      const testInput = 'test input string';
      renderer.updateInput(testInput, testInput.length);

      // 入力状態を確認
      assert.strictEqual(renderer.getInputBuffer(), testInput);

      // ログを出力
      renderer.writeLog('Background log message');

      // flushを待つ
      setTimeout(() => {
        // 入力バッファが変更されていないことを確認
        assert.strictEqual(
          renderer.getInputBuffer(),
          testInput,
          'Input buffer should not be affected by log output'
        );
        done();
      }, 50);
    });

    it('カーソル位置が維持される', (done) => {
      // 入力バッファとカーソル位置を設定
      const testInput = 'hello world';
      const cursorPos = 5; // "hello" の後
      renderer.updateInput(testInput, cursorPos);

      // カーソル位置を確認
      assert.strictEqual(renderer.getInputCursorPos(), cursorPos);

      // ログを出力
      renderer.writeLog('Some log message');

      // flushを待つ
      setTimeout(() => {
        // カーソル位置が変更されていないことを確認
        assert.strictEqual(
          renderer.getInputCursorPos(),
          cursorPos,
          'Cursor position should not be affected by log output'
        );
        done();
      }, 50);
    });

    it('複数のログ出力でも入力が維持される', (done) => {
      // 入力バッファを設定
      const testInput = 'my important input';
      renderer.updateInput(testInput, testInput.length);

      // 複数のログを出力
      renderer.writeLog('Log 1');
      renderer.writeLog('Log 2');
      renderer.writeLog('Log 3');
      renderer.writeLog('Log 4');
      renderer.writeLog('Log 5');

      // flushを待つ
      setTimeout(() => {
        // 入力バッファが維持されていることを確認
        assert.strictEqual(
          renderer.getInputBuffer(),
          testInput,
          'Input buffer should be maintained after multiple logs'
        );
        done();
      }, 50);
    });
  });

  describe('2ペイン構造', () => {
    it('TwoPaneRenderer が有効化される（TTY環境）', () => {
      assert.ok(
        renderer.isEnabled(),
        '2-pane mode should be enabled in TTY environment'
      );
    });

    it('ログとプロンプトが正しく出力される', (done) => {
      renderer.updateInput('test', 4);
      renderer.writeLog('Test log');

      setTimeout(() => {
        renderer.flush();
        // 出力にログが含まれることを確認
        assert.ok(
          outputBuffer.includes('Test log'),
          'Log message should appear in output'
        );
        done();
      }, 50);
    });

    it('clearInput で入力がクリアされる', () => {
      renderer.updateInput('some text', 9);
      assert.strictEqual(renderer.getInputBuffer(), 'some text');

      renderer.clearInput();

      assert.strictEqual(renderer.getInputBuffer(), '');
      assert.strictEqual(renderer.getInputCursorPos(), 0);
    });
  });

  describe('プロンプト管理', () => {
    it('プロンプトが設定できる', () => {
      assert.strictEqual(renderer.getPrompt(), 'pm> ');

      renderer.setPrompt('custom> ');
      assert.strictEqual(renderer.getPrompt(), 'custom> ');
    });
  });

  describe('RUNNING/COMPLETE 表示', () => {
    it('RUNNING 表示がフォーマットされる', () => {
      const runningInfo = {
        taskId: 'task-1234',
        elapsedMs: 12345,
        status: 'processing',
      };

      const formatted = renderer.formatRunning(runningInfo);

      assert.ok(formatted.includes('RUNNING'), 'Should contain RUNNING');
      assert.ok(formatted.includes('task-1234'), 'Should contain task ID');
      assert.ok(formatted.includes('12.3'), 'Should contain elapsed time in seconds');
      assert.ok(formatted.includes('processing'), 'Should contain status');
    });

    it('COMPLETE 表示がフォーマットされる', () => {
      const completeInfo = {
        taskId: 'task-5678',
        elapsedMs: 5000,
        filesModified: ['src/index.ts', 'src/utils.ts'],
        nextOperations: 'Run tests',
      };

      const formatted = renderer.formatComplete(completeInfo);

      assert.ok(Array.isArray(formatted), 'Should return array of lines');
      assert.ok(formatted.some(l => l.includes('COMPLETE')), 'Should contain COMPLETE');
      assert.ok(formatted.some(l => l.includes('task-5678')), 'Should contain task ID');
      assert.ok(formatted.some(l => l.includes('src/index.ts')), 'Should contain modified files');
      assert.ok(formatted.some(l => l.includes('Run tests')), 'Should contain next operations');
    });

    it('showRunning がログに出力される', (done) => {
      renderer.showRunning({
        taskId: 'task-test',
        elapsedMs: 1000,
        status: 'running',
      });

      setTimeout(() => {
        renderer.flush();
        assert.ok(
          outputBuffer.includes('RUNNING'),
          'RUNNING should be in output'
        );
        done();
      }, 50);
    });

    it('showComplete がログに出力される', (done) => {
      renderer.showComplete({
        taskId: 'task-done',
        elapsedMs: 2000,
        filesModified: ['file.ts'],
        nextOperations: 'Done',
      });

      setTimeout(() => {
        renderer.flush();
        assert.ok(
          outputBuffer.includes('COMPLETE'),
          'COMPLETE should be in output'
        );
        done();
      }, 50);
    });
  });

  describe('非TTY環境のフォールバック', () => {
    it('非TTY環境では2ペインモードが無効', () => {
      const nonTtyOutput = new Writable({
        write(chunk, encoding, callback) {
          callback();
        }
      }) as NodeJS.WriteStream;
      // isTTY を明示的に設定しない（undefined）

      const nonTtyRenderer = new TwoPaneRenderer({
        output: nonTtyOutput,
        prompt: 'pm> ',
      });

      assert.strictEqual(
        nonTtyRenderer.isEnabled(),
        false,
        '2-pane mode should be disabled in non-TTY environment'
      );
    });
  });

  describe('flush 機能', () => {
    it('flush で保留中のログが即座に出力される', (done) => {
      renderer.writeLog('Pending log 1');
      renderer.writeLog('Pending log 2');

      // まだ出力されていない（debounce中）
      assert.strictEqual(
        outputBuffer.includes('Pending log 1'),
        false,
        'Log should be pending before flush'
      );

      // 即座にflush
      renderer.flush();

      setTimeout(() => {
        assert.ok(
          outputBuffer.includes('Pending log 1'),
          'Log 1 should be output after flush'
        );
        assert.ok(
          outputBuffer.includes('Pending log 2'),
          'Log 2 should be output after flush'
        );
        done();
      }, 10);
    });
  });
});
