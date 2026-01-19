/**
 * API Key Onboarding Module
 *
 * Handles the API key input flow on first launch.
 * Requirements:
 * - Must enter API Key Input Flow before .claude initialization
 * - No immediate exit on error - allow interactive input
 * - Validate keys against provider APIs
 * - Re-prompt on invalid keys (unlimited retries)
 * - Save valid keys and transition to normal flow
 */

import * as readline from 'readline';
import { validateApiKey, isKeyFormatValid } from './key-validator';
import { setApiKey, hasAnyApiKey, getConfigFilePath } from '../config/global-config';

/**
 * Result of the onboarding process
 */
export interface OnboardingResult {
  success: boolean;
  provider?: 'openai' | 'anthropic';
  skipped?: boolean;
  error?: string;
}

/**
 * Provider selection options
 */
type ProviderChoice = 'openai' | 'anthropic' | 'skip';

/**
 * Display welcome message for API key onboarding
 */
function displayWelcome(): void {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PM Orchestrator Runner - API Key Setup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  An API key is required to use PM Orchestrator Runner.');
  console.log('  You can use either OpenAI or Anthropic API keys.');
  console.log('');
  console.log('  Your key will be saved to:');
  console.log(`    ${getConfigFilePath()}`);
  console.log('');
  console.log('  Alternatively, set environment variables:');
  console.log('    OPENAI_API_KEY or ANTHROPIC_API_KEY');
  console.log('');
}

/**
 * Prompt user to select a provider
 */
async function promptProviderSelection(rl: readline.Interface): Promise<ProviderChoice> {
  return new Promise((resolve) => {
    console.log('  Select your API provider:');
    console.log('');
    console.log('    [1] OpenAI');
    console.log('    [2] Anthropic');
    console.log('    [s] Skip (use --no-auth option next time)');
    console.log('');

    const ask = (): void => {
      rl.question('  Enter choice [1/2/s]: ', (answer) => {
        const choice = answer.trim().toLowerCase();
        if (choice === '1') {
          resolve('openai');
        } else if (choice === '2') {
          resolve('anthropic');
        } else if (choice === 's' || choice === 'skip') {
          resolve('skip');
        } else {
          console.log('  Invalid choice. Please enter 1, 2, or s.');
          ask();
        }
      });
    };

    ask();
  });
}

/**
 * Prompt user for API key with hidden input (shows asterisks)
 */
async function promptApiKey(rl: readline.Interface, provider: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    // Store original settings
    const wasRaw = stdin.isRaw;

    console.log('');
    console.log(`  Enter your ${provider.toUpperCase()} API key:`);
    console.log('  (Input is hidden for security)');
    console.log('');

    stdout.write('  API Key: ');

    let key = '';

    // Enable raw mode for character-by-character input
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const onData = (char: Buffer): void => {
      const c = char.toString();

      if (c === '\n' || c === '\r') {
        // Enter pressed - finish input
        stdin.removeListener('data', onData);
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw ?? false);
        }
        stdout.write('\n');
        resolve(key);
      } else if (c === '\u0003') {
        // Ctrl+C - exit
        stdin.removeListener('data', onData);
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw ?? false);
        }
        process.exit(0);
      } else if (c === '\u007F' || c === '\b') {
        // Backspace
        if (key.length > 0) {
          key = key.slice(0, -1);
          stdout.write('\b \b');
        }
      } else if (c.charCodeAt(0) >= 32) {
        // Printable character
        key += c;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Validate API key and display result
 */
async function validateAndReport(provider: string, key: string): Promise<boolean> {
  // First check format
  if (!isKeyFormatValid(provider, key)) {
    console.log('');
    console.log(`  Invalid key format for ${provider}.`);
    if (provider === 'openai') {
      console.log('  OpenAI keys should start with "sk-"');
    } else if (provider === 'anthropic') {
      console.log('  Anthropic keys should start with "sk-ant-"');
    }
    return false;
  }

  console.log('');
  console.log('  Validating API key...');

  try {
    const result = await validateApiKey(provider, key);

    if (result.valid) {
      console.log('');
      console.log('  API key is valid!');
      return true;
    } else {
      console.log('');
      console.log(`  API key validation failed: ${result.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.log('');
    console.log(`  API key validation error: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Run the API key onboarding flow
 *
 * @param skipIfKeyExists - If true, skip onboarding if any API key is already configured
 * @returns OnboardingResult indicating success/failure
 */
export async function runApiKeyOnboarding(skipIfKeyExists = true): Promise<OnboardingResult> {
  // Check if API key already exists
  if (skipIfKeyExists && hasAnyApiKey()) {
    return { success: true, skipped: true };
  }

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    displayWelcome();

    // Provider selection loop
    const provider = await promptProviderSelection(rl);

    if (provider === 'skip') {
      console.log('');
      console.log('  Skipping API key setup.');
      console.log('  Note: Use --no-auth option to bypass this in the future.');
      console.log('');
      rl.close();
      return { success: false, skipped: true };
    }

    // API key input and validation loop (unlimited retries)
    while (true) {
      const key = await promptApiKey(rl, provider);

      if (!key || key.trim() === '') {
        console.log('');
        console.log('  No key entered. Please try again.');
        continue;
      }

      const isValid = await validateAndReport(provider, key.trim());

      if (isValid) {
        // Save the key
        setApiKey(provider, key.trim());
        console.log('');
        console.log(`  API key saved to ${getConfigFilePath()}`);
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  Setup complete! Starting PM Orchestrator Runner...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        rl.close();
        return { success: true, provider: provider as 'openai' | 'anthropic' };
      }

      // Invalid key - prompt to retry
      console.log('');
      console.log('  Would you like to try again? (Press Enter to retry, or Ctrl+C to exit)');

      await new Promise<void>((resolve) => {
        rl.question('', () => resolve());
      });
    }
  } catch (error) {
    rl.close();
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check if onboarding is required
 * Returns true if no API key is configured and --no-auth is not specified
 */
export function isOnboardingRequired(noAuthOption = false): boolean {
  if (noAuthOption) {
    return false;
  }
  return !hasAnyApiKey();
}
