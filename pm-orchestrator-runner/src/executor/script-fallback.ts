/**
 * Script Fallback - Tmpfile-based execution for fragile inline commands
 *
 * When a command like `node -e "..."` fails due to shell quoting issues,
 * this module rewrites the command to use a temporary file instead.
 *
 * Example:
 *   node -e "console.log('hello')"
 *   becomes:
 *   node /tmp/pm-runner-xxxx.js  (with file contents: console.log('hello'))
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { isFragileInlineCommand } from './script-failure-classifier';

/**
 * Result of converting a command to tmpfile-based execution
 */
export interface TmpfileConversion {
  /** Whether conversion was performed */
  converted: boolean;
  /** The new command to execute (or original if not converted) */
  command: string;
  /** Path to the temporary file (if created) */
  tmpfilePath?: string;
  /** The original command for logging */
  originalCommand: string;
}

/**
 * Map runtime to file extension
 */
const RUNTIME_EXTENSIONS: Record<string, string> = {
  node: '.js',
  python: '.py',
  ruby: '.rb',
  perl: '.pl',
};

/**
 * Extract the inline script body from a command like `node -e "script"`
 */
function extractInlineScript(command: string): { runtime: string; script: string } | null {
  const trimmed = command.trim();

  // Match: node -e "..." or node -e '...'
  const patterns = [
    /^(node)\s+-e\s+"((?:[^"\\]|\\.)*)"\s*$/is,
    /^(node)\s+-e\s+'((?:[^'\\]|\\.)*)'\s*$/is,
    /^(python)\s+-c\s+"((?:[^"\\]|\\.)*)"\s*$/is,
    /^(python)\s+-c\s+'((?:[^'\\]|\\.)*)'\s*$/is,
    /^(ruby)\s+-e\s+"((?:[^"\\]|\\.)*)"\s*$/is,
    /^(ruby)\s+-e\s+'((?:[^'\\]|\\.)*)'\s*$/is,
    /^(perl)\s+-e\s+"((?:[^"\\]|\\.)*)"\s*$/is,
    /^(perl)\s+-e\s+'((?:[^'\\]|\\.)*)'\s*$/is,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { runtime: match[1], script: match[2] };
    }
  }

  // Fallback: greedy extraction for unquoted or complex quoting
  const greedyMatch = trimmed.match(/^(node|python|ruby|perl)\s+(?:-e|-c)\s+(.+)$/is);
  if (greedyMatch) {
    let script = greedyMatch[2];
    // Strip outer quotes if present
    if ((script.startsWith('"') && script.endsWith('"')) ||
        (script.startsWith("'") && script.endsWith("'"))) {
      script = script.slice(1, -1);
    }
    return { runtime: greedyMatch[1], script };
  }

  return null;
}

/**
 * Convert a fragile inline command to a tmpfile-based command.
 *
 * @param command - The original command string
 * @returns TmpfileConversion with the new command and tmpfile path
 */
export function convertToTmpfile(command: string): TmpfileConversion {
  if (!isFragileInlineCommand(command)) {
    return { converted: false, command, originalCommand: command };
  }

  const extracted = extractInlineScript(command);
  if (!extracted) {
    return { converted: false, command, originalCommand: command };
  }

  const ext = RUNTIME_EXTENSIONS[extracted.runtime.toLowerCase()] || '.tmp';
  const tmpDir = os.tmpdir();
  const filename = `pm-runner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const tmpfilePath = path.join(tmpDir, filename);

  // Write the script to the tmp file
  fs.writeFileSync(tmpfilePath, extracted.script, 'utf-8');

  // Build new command using the flag appropriate for the runtime
  const flag = extracted.runtime.toLowerCase() === 'python' ? '' : '';
  const newCommand = `${extracted.runtime}${flag} ${tmpfilePath}`;

  return {
    converted: true,
    command: newCommand,
    tmpfilePath,
    originalCommand: command,
  };
}

/**
 * Clean up a temporary file created by convertToTmpfile.
 * Silently ignores errors (file may already be deleted).
 */
export function cleanupTmpfile(tmpfilePath: string): void {
  try {
    if (fs.existsSync(tmpfilePath)) {
      fs.unlinkSync(tmpfilePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}
