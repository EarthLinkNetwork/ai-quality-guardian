"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runApiKeyOnboarding = runApiKeyOnboarding;
exports.isOnboardingRequired = isOnboardingRequired;
const readline = __importStar(require("readline"));
const key_validator_1 = require("./key-validator");
const global_config_1 = require("../config/global-config");
/**
 * Display welcome message for API key onboarding
 */
function displayWelcome() {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PM Orchestrator Runner - API Key Setup');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('  An API key is required to use PM Orchestrator Runner.');
    console.log('  You can use either OpenAI or Anthropic API keys.');
    console.log('');
    console.log('  Your key will be saved to:');
    console.log(`    ${(0, global_config_1.getConfigFilePath)()}`);
    console.log('');
    console.log('  Alternatively, set environment variables:');
    console.log('    OPENAI_API_KEY or ANTHROPIC_API_KEY');
    console.log('');
}
/**
 * Prompt user to select a provider
 */
async function promptProviderSelection(rl) {
    return new Promise((resolve) => {
        console.log('  Select your API provider:');
        console.log('');
        console.log('    [1] OpenAI');
        console.log('    [2] Anthropic');
        console.log('    [s] Skip (use --no-auth option next time)');
        console.log('');
        const ask = () => {
            rl.question('  Enter choice [1/2/s]: ', (answer) => {
                const choice = answer.trim().toLowerCase();
                if (choice === '1') {
                    resolve('openai');
                }
                else if (choice === '2') {
                    resolve('anthropic');
                }
                else if (choice === 's' || choice === 'skip') {
                    resolve('skip');
                }
                else {
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
async function promptApiKey(rl, provider) {
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
        const onData = (char) => {
            const c = char.toString();
            if (c === '\n' || c === '\r') {
                // Enter pressed - finish input
                stdin.removeListener('data', onData);
                if (stdin.isTTY) {
                    stdin.setRawMode(wasRaw ?? false);
                }
                stdout.write('\n');
                resolve(key);
            }
            else if (c === '\u0003') {
                // Ctrl+C - exit
                stdin.removeListener('data', onData);
                if (stdin.isTTY) {
                    stdin.setRawMode(wasRaw ?? false);
                }
                process.exit(0);
            }
            else if (c === '\u007F' || c === '\b') {
                // Backspace
                if (key.length > 0) {
                    key = key.slice(0, -1);
                    stdout.write('\b \b');
                }
            }
            else if (c.charCodeAt(0) >= 32) {
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
async function validateAndReport(provider, key) {
    // First check format
    if (!(0, key_validator_1.isKeyFormatValid)(provider, key)) {
        console.log('');
        console.log(`  Invalid key format for ${provider}.`);
        if (provider === 'openai') {
            console.log('  OpenAI keys should start with "sk-"');
        }
        else if (provider === 'anthropic') {
            console.log('  Anthropic keys should start with "sk-ant-"');
        }
        return false;
    }
    console.log('');
    console.log('  Validating API key...');
    try {
        const result = await (0, key_validator_1.validateApiKey)(provider, key);
        if (result.valid) {
            console.log('');
            console.log('  API key is valid!');
            return true;
        }
        else {
            console.log('');
            console.log(`  API key validation failed: ${result.error || 'Unknown error'}`);
            return false;
        }
    }
    catch (error) {
        console.log('');
        console.log(`  API key validation error: ${error.message}`);
        return false;
    }
}
/**
 * Run the API key onboarding flow
 *
 * @param skipIfKeyExists - If true, skip onboarding if any API key is already configured
 * @returns OnboardingResult indicating success/failure
 */
async function runApiKeyOnboarding(skipIfKeyExists = true) {
    // Check if API key already exists
    if (skipIfKeyExists && (0, global_config_1.hasAnyApiKey)()) {
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
                (0, global_config_1.setApiKey)(provider, key.trim());
                console.log('');
                console.log(`  API key saved to ${(0, global_config_1.getConfigFilePath)()}`);
                console.log('');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('  Setup complete! Starting PM Orchestrator Runner...');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('');
                rl.close();
                return { success: true, provider: provider };
            }
            // Invalid key - prompt to retry
            console.log('');
            console.log('  Would you like to try again? (Press Enter to retry, or Ctrl+C to exit)');
            await new Promise((resolve) => {
                rl.question('', () => resolve());
            });
        }
    }
    catch (error) {
        rl.close();
        return {
            success: false,
            error: error.message,
        };
    }
}
/**
 * Check if onboarding is required
 * Returns true if no API key is configured and --no-auth is not specified
 */
function isOnboardingRequired(noAuthOption = false) {
    if (noAuthOption) {
        return false;
    }
    return !(0, global_config_1.hasAnyApiKey)();
}
//# sourceMappingURL=api-key-onboarding.js.map