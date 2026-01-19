/**
 * Key Input - Interactive hidden input for API keys
 *
 * Provides secure input collection for API keys:
 * - Hidden input (characters not echoed)
 * - Double-entry confirmation
 * - SECURITY: Keys are NEVER logged
 */

import * as readline from 'readline';
import { Writable } from 'stream';

/**
 * Result of key input operation
 */
export interface KeyInputResult {
  success: boolean;
  key?: string;
  error?: string;
  cancelled?: boolean;
}

/**
 * Muted output stream that suppresses all writes
 * Used for hidden password input
 */
class MutedStream extends Writable {
  private isMuted: boolean = false;

  mute(): void {
    this.isMuted = true;
  }

  unmute(): void {
    this.isMuted = false;
  }

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    if (!this.isMuted) {
      process.stdout.write(chunk);
    }
    callback();
  }
}

/**
 * Read a single line with hidden input (password-style)
 * Characters are not echoed to the terminal
 */
export async function readHiddenInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const mutedOutput = new MutedStream();

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutedOutput,
      terminal: true,
    });

    // Write the prompt, then mute for input
    process.stdout.write(prompt);
    mutedOutput.mute();

    rl.question('', (answer) => {
      mutedOutput.unmute();
      process.stdout.write('\n'); // Add newline after hidden input
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Interactively prompt for an API key with double-entry confirmation
 *
 * Flow:
 * 1. Prompt for API key (hidden input)
 * 2. Prompt to confirm (hidden input)
 * 3. Check if entries match
 * 4. Return key if matched, error if not
 *
 * SECURITY: The key is returned only in the result object, never logged
 */
export async function promptForApiKey(provider: string): Promise<KeyInputResult> {
  console.log('');
  console.log(`Setting up ${provider} API key...`);
  console.log('(Input will be hidden for security)');
  console.log('');

  try {
    // First entry
    const key1 = await readHiddenInput(`Enter ${provider} API key: `);

    // Check for empty input
    if (!key1 || key1.trim().length === 0) {
      return {
        success: false,
        error: 'Empty input. API key setup cancelled.',
        cancelled: true,
      };
    }

    // Check for minimum length
    if (key1.length < 10) {
      return {
        success: false,
        error: 'API key too short (minimum 10 characters).',
      };
    }

    // Second entry (confirmation)
    const key2 = await readHiddenInput(`Confirm ${provider} API key: `);

    // Check if entries match
    if (key1 !== key2) {
      console.log('');
      console.log('Error: API keys do not match.');
      console.log('Please try again with /keys set ' + provider);
      return {
        success: false,
        error: 'API keys do not match.',
      };
    }

    console.log('');
    console.log('Keys match. Validating with ' + provider + ' API...');

    return {
      success: true,
      key: key1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: 'Failed to read input: ' + message,
    };
  }
}
