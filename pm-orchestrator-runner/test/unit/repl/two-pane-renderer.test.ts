/**
 * Tests for TwoPaneRenderer
 * Per spec/18_CLI_TWO_PANE.md
 *
 * Critical requirement: Input line must NEVER be disrupted by log output
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import { Writable } from 'stream';
import {
  TwoPaneRenderer,
  RunningInfo,
  CompleteInfo,
} from '../../../src/repl/two-pane-renderer';

/**
 * Mock writable stream that captures output
 */
class MockWriteStream extends Writable {
  public chunks: string[] = [];
  public isTTY = true;

  _write(chunk: Buffer, _encoding: string, callback: () => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  getOutput(): string {
    return this.chunks.join('');
  }

  clear(): void {
    this.chunks = [];
  }
}

describe('TwoPaneRenderer', () => {
  describe('basic functionality', () => {
    it('should initialize with default config', () => {
      const renderer = new TwoPaneRenderer();
      assert.ok(renderer);
      assert.equal(renderer.getPrompt(), 'pm> ');
    });

    it('should initialize with custom prompt', () => {
      const renderer = new TwoPaneRenderer({ prompt: 'test> ' });
      assert.equal(renderer.getPrompt(), 'test> ');
    });

    it('should detect TTY status', () => {
      const mockOutput = new MockWriteStream();
      mockOutput.isTTY = true;

      const renderer = new TwoPaneRenderer({
        output: mockOutput as unknown as NodeJS.WriteStream,
      });
      assert.equal(renderer.isEnabled(), true);
    });

    it('should fallback to console.log for non-TTY', () => {
      const mockOutput = new MockWriteStream();
      mockOutput.isTTY = false;

      const renderer = new TwoPaneRenderer({
        output: mockOutput as unknown as NodeJS.WriteStream,
      });
      assert.equal(renderer.isEnabled(), false);
    });
  });

  describe('input state preservation', () => {
    let mockOutput: MockWriteStream;
    let renderer: TwoPaneRenderer;

    beforeEach(() => {
      mockOutput = new MockWriteStream();
      renderer = new TwoPaneRenderer({
        output: mockOutput as unknown as NodeJS.WriteStream,
        enabled: true,
      });
    });

    it('should preserve input buffer across log writes', () => {
      // Set input state
      renderer.updateInput('test input', 5);

      // Write log
      renderer.writeLog('Some log message');
      renderer.flush();

      // Input buffer should be preserved
      assert.equal(renderer.getInputBuffer(), 'test input');
      assert.equal(renderer.getInputCursorPos(), 5);
    });

    it('should maintain cursor position after log output', () => {
      // Set cursor at different positions
      renderer.updateInput('hello world', 6);

      renderer.writeLog('Log 1');
      renderer.flush();

      assert.equal(renderer.getInputCursorPos(), 6);

      renderer.updateInput('hello world', 11);
      renderer.writeLog('Log 2');
      renderer.flush();

      assert.equal(renderer.getInputCursorPos(), 11);
    });

    it('should survive high volume of log output', () => {
      // Set input state
      renderer.updateInput('my command', 10);

      // Write many logs rapidly
      for (let i = 0; i < 100; i++) {
        renderer.writeLog(`Log message ${i}`);
      }
      renderer.flush();

      // Input state should still be preserved
      assert.equal(renderer.getInputBuffer(), 'my command');
      assert.equal(renderer.getInputCursorPos(), 10);
    });

    it('should clear input state correctly', () => {
      renderer.updateInput('test', 4);
      assert.equal(renderer.getInputBuffer(), 'test');

      renderer.clearInput();

      assert.equal(renderer.getInputBuffer(), '');
      assert.equal(renderer.getInputCursorPos(), 0);
    });
  });

  describe('RUNNING display format', () => {
    it('should format RUNNING display per spec/18 L40-48', () => {
      const renderer = new TwoPaneRenderer();

      const info: RunningInfo = {
        taskId: 'task-1234',
        elapsedMs: 12300,
        status: 'processing',
      };

      const output = renderer.formatRunning(info);

      // Per spec/18: RUNNING task-1234 | 12.3s | processing
      // Now includes ANSI color codes, so check parts separately
      assert.ok(output.includes('RUNNING'), 'Should include RUNNING');
      assert.ok(output.includes('task-1234'), 'Should include task ID');
      assert.ok(output.includes('12.3s'), 'Should include elapsed time');
      assert.ok(output.includes('processing'), 'Should include status');
    });

    it('should format elapsed time with one decimal place', () => {
      const renderer = new TwoPaneRenderer();

      const info: RunningInfo = {
        taskId: 'task-5678',
        elapsedMs: 5678,
        status: 'executing',
      };

      const output = renderer.formatRunning(info);

      assert.ok(output.includes('RUNNING'), 'Should include RUNNING');
      assert.ok(output.includes('task-5678'), 'Should include task ID');
      assert.ok(output.includes('5.7s'), 'Should include elapsed time');
      assert.ok(output.includes('executing'), 'Should include status');
    });

    it('should handle sub-second elapsed time', () => {
      const renderer = new TwoPaneRenderer();

      const info: RunningInfo = {
        taskId: 'task-quick',
        elapsedMs: 250,
        status: 'starting',
      };

      const output = renderer.formatRunning(info);

      assert.ok(output.includes('RUNNING'), 'Should include RUNNING');
      assert.ok(output.includes('task-quick'), 'Should include task ID');
      assert.ok(output.includes('0.3s'), 'Should include elapsed time');
      assert.ok(output.includes('starting'), 'Should include status');
    });
  });

  describe('COMPLETE display format', () => {
    it('should format COMPLETE display per spec/18 L51-66', () => {
      const renderer = new TwoPaneRenderer();

      const info: CompleteInfo = {
        taskId: 'task-1234',
        elapsedMs: 45000,
        filesModified: ['src/main.ts', 'package.json'],
        nextOperations: 'Run npm test to verify changes',
      };

      const lines = renderer.formatComplete(info);
      const output = lines.join('\n');

      // Check structure per spec/18 (with ANSI codes, check parts)
      assert.ok(output.includes('COMPLETE'), 'Should include COMPLETE');
      assert.ok(output.includes('task-1234'), 'Should include task ID');
      assert.ok(output.includes('45.0s'), 'Should include elapsed time');
      assert.ok(output.includes('Files modified'), 'Should include Files modified header');
      assert.ok(output.includes('src/main.ts'), 'Should include first file');
      assert.ok(output.includes('package.json'), 'Should include second file');
      assert.ok(output.includes('Next'), 'Should include Next header');
      assert.ok(output.includes('Run npm test to verify changes'), 'Should include next operations');
    });

    it('should handle empty files list', () => {
      const renderer = new TwoPaneRenderer();

      const info: CompleteInfo = {
        taskId: 'task-nofiles',
        elapsedMs: 1000,
        filesModified: [],
        nextOperations: 'Nothing to do',
      };

      const lines = renderer.formatComplete(info);
      const output = lines.join('\n');

      assert.ok(output.includes('COMPLETE'), 'Should include COMPLETE');
      assert.ok(output.includes('task-nofiles'), 'Should include task ID');
      assert.ok(output.includes('1.0s'), 'Should include elapsed time');
      assert.ok(!output.includes('Files modified'), 'Should not include Files modified for empty list');
      assert.ok(output.includes('Next'), 'Should include Next header');
      assert.ok(output.includes('Nothing to do'), 'Should include next operations');
    });

    it('should include all modified files', () => {
      const renderer = new TwoPaneRenderer();

      const files = [
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
        'test/a.test.ts',
        'docs/README.md',
      ];

      const info: CompleteInfo = {
        taskId: 'task-many',
        elapsedMs: 60000,
        filesModified: files,
        nextOperations: 'Review changes',
      };

      const lines = renderer.formatComplete(info);

      // All files should be listed
      for (const file of files) {
        assert.ok(
          lines.some(line => line.includes(file)),
          `File ${file} should be in output`
        );
      }
    });
  });

  describe('showRunning and showComplete', () => {
    let mockOutput: MockWriteStream;
    let renderer: TwoPaneRenderer;

    beforeEach(() => {
      mockOutput = new MockWriteStream();
      renderer = new TwoPaneRenderer({
        output: mockOutput as unknown as NodeJS.WriteStream,
        enabled: true,
      });
    });

    it('should output RUNNING status via writeLog', () => {
      const info: RunningInfo = {
        taskId: 'task-show',
        elapsedMs: 5000,
        status: 'testing',
      };

      renderer.showRunning(info);
      renderer.flush();

      const output = mockOutput.getOutput();
      // ANSI codes split strings, check parts separately
      assert.ok(output.includes('RUNNING'), 'Should include RUNNING');
      assert.ok(output.includes('task-show'), 'Should include task ID');
      assert.ok(output.includes('5.0s'), 'Should include elapsed time');
      assert.ok(output.includes('testing'), 'Should include status');
    });

    it('should output COMPLETE status via writeLog', () => {
      const info: CompleteInfo = {
        taskId: 'task-done',
        elapsedMs: 10000,
        filesModified: ['test.ts'],
        nextOperations: 'Deploy',
      };

      renderer.showComplete(info);
      renderer.flush();

      const output = mockOutput.getOutput();
      // ANSI codes split strings, check parts separately
      assert.ok(output.includes('COMPLETE'), 'Should include COMPLETE');
      assert.ok(output.includes('task-done'), 'Should include task ID');
      assert.ok(output.includes('test.ts'), 'Should include file');
      assert.ok(output.includes('Deploy'), 'Should include next operation');
    });
  });

  describe('debouncing', () => {
    it('should batch rapid log writes', async () => {
      const mockOutput = new MockWriteStream();
      const renderer = new TwoPaneRenderer({
        output: mockOutput as unknown as NodeJS.WriteStream,
        enabled: true,
      });

      // Write multiple logs rapidly
      renderer.writeLog('Log 1');
      renderer.writeLog('Log 2');
      renderer.writeLog('Log 3');

      // Wait for debounce to flush
      await new Promise(resolve => setTimeout(resolve, 50));

      const output = mockOutput.getOutput();
      assert.ok(output.includes('Log 1'));
      assert.ok(output.includes('Log 2'));
      assert.ok(output.includes('Log 3'));
    });

    it('should flush immediately when flush() is called', () => {
      const mockOutput = new MockWriteStream();
      const renderer = new TwoPaneRenderer({
        output: mockOutput as unknown as NodeJS.WriteStream,
        enabled: true,
      });

      renderer.writeLog('Immediate log');
      renderer.flush();

      const output = mockOutput.getOutput();
      assert.ok(output.includes('Immediate log'));
    });
  });

  describe('non-TTY fallback', () => {
    it('should use console.log without ANSI codes in non-TTY mode', () => {
      const mockOutput = new MockWriteStream();
      mockOutput.isTTY = false;

      // Capture console.log output
      const capturedLogs: string[] = [];
      const originalConsoleLog = console.log;
      console.log = (msg: string) => {
        capturedLogs.push(msg);
      };

      try {
        const renderer = new TwoPaneRenderer({
          output: mockOutput as unknown as NodeJS.WriteStream,
          // Don't set enabled - let it auto-detect based on isTTY
        });

        renderer.writeLog('Plain log');
        renderer.flush();

        // Should output via console.log
        assert.ok(capturedLogs.includes('Plain log'), 'Should output to console.log');
        // Should not contain ANSI escape codes (basic check)
        assert.ok(
          !capturedLogs.some(log => log.includes('\x1b[s')),
          'Should not have save cursor'
        );
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });
});
