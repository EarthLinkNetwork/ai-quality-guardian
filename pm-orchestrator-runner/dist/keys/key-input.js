"use strict";
/**
 * Key Input - Interactive hidden input for API keys
 *
 * Provides secure input collection for API keys:
 * - Hidden input (characters not echoed)
 * - Double-entry confirmation
 * - SECURITY: Keys are NEVER logged
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
exports.readHiddenInput = readHiddenInput;
exports.promptForApiKey = promptForApiKey;
const readline = __importStar(require("readline"));
const stream_1 = require("stream");
/**
 * Muted output stream that suppresses all writes
 * Used for hidden password input
 */
class MutedStream extends stream_1.Writable {
    isMuted = false;
    mute() {
        this.isMuted = true;
    }
    unmute() {
        this.isMuted = false;
    }
    _write(chunk, _encoding, callback) {
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
async function readHiddenInput(prompt) {
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
async function promptForApiKey(provider) {
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
            success: false,
            error: 'Failed to read input: ' + message,
        };
    }
}
//# sourceMappingURL=key-input.js.map