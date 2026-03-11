/**
 * macOS launchd Daemon Manager
 *
 * Generates and manages launchd plist files for running
 * pm-orchestrator-runner as a persistent background agent.
 *
 * Plist location: ~/Library/LaunchAgents/com.pm-runner.agent.plist
 * Log location: ~/.pm-orchestrator-runner/logs/agent.log
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

const PLIST_LABEL = 'com.pm-runner.agent';
const PLIST_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const LOG_DIR = path.join(os.homedir(), '.pm-orchestrator-runner', 'logs');

export interface DaemonConfig {
  /** Project path where pm-orchestrator-runner is installed */
  projectPath: string;
  /** Namespace to use */
  namespace?: string;
  /** Whether to use local DynamoDB */
  localDynamodb?: boolean;
  /** API key for authentication */
  apiKey?: string;
}

/**
 * Get the plist file path
 */
export function getPlistPath(): string {
  return path.join(PLIST_DIR, `${PLIST_LABEL}.plist`);
}

/**
 * Get the log file path
 */
export function getLogPath(): string {
  return path.join(LOG_DIR, 'agent.log');
}

/**
 * Get the error log file path
 */
export function getErrorLogPath(): string {
  return path.join(LOG_DIR, 'agent-error.log');
}

/**
 * Generate launchd plist XML content
 */
export function generatePlist(config: DaemonConfig): string {
  const nodePath = process.execPath;
  const entryPoint = path.join(config.projectPath, 'dist', 'cli', 'index.js');

  const args = ['agent'];
  if (config.namespace) args.push('--namespace', config.namespace);
  if (config.localDynamodb) args.push('--local-dynamodb');
  if (config.apiKey) args.push('--api-key', config.apiKey);

  const programArgs = [nodePath, entryPoint, ...args]
    .map(a => `    <string>${escapeXml(a)}</string>`)
    .join('\n');

  const logPath = getLogPath();
  const errorLogPath = getErrorLogPath();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>

  <key>WorkingDirectory</key>
  <string>${escapeXml(config.projectPath)}</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${escapeXml(logPath)}</string>

  <key>StandardErrorPath</key>
  <string>${escapeXml(errorLogPath)}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(process.env.PATH || '/usr/local/bin:/usr/bin:/bin')}</string>
    <key>HOME</key>
    <string>${escapeXml(os.homedir())}</string>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
`;
}

/**
 * Install the daemon (write plist + launchctl load)
 */
export function installDaemon(config: DaemonConfig): { success: boolean; message: string } {
  try {
    // Ensure directories exist
    fs.mkdirSync(PLIST_DIR, { recursive: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });

    // Unload existing if present
    const plistPath = getPlistPath();
    if (fs.existsSync(plistPath)) {
      try {
        execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
      } catch {
        // Ignore unload errors (may not be loaded)
      }
    }

    // Write plist
    const plistContent = generatePlist(config);
    fs.writeFileSync(plistPath, plistContent, 'utf-8');

    // Load with launchctl
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });

    return {
      success: true,
      message: `Daemon installed and started.\nPlist: ${plistPath}\nLog: ${getLogPath()}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to install daemon: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Uninstall the daemon (launchctl unload + remove plist)
 */
export function uninstallDaemon(): { success: boolean; message: string } {
  try {
    const plistPath = getPlistPath();

    if (!fs.existsSync(plistPath)) {
      return { success: false, message: 'Daemon is not installed (plist not found)' };
    }

    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
    } catch {
      // May already be unloaded
    }

    fs.unlinkSync(plistPath);

    return { success: true, message: 'Daemon uninstalled and stopped.' };
  } catch (error) {
    return {
      success: false,
      message: `Failed to uninstall daemon: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get daemon status
 */
export function getDaemonStatus(): { installed: boolean; running: boolean; pid?: number; label: string } {
  const plistPath = getPlistPath();
  const installed = fs.existsSync(plistPath);

  let running = false;
  let pid: number | undefined;

  if (installed) {
    try {
      const output = execSync(`launchctl list | grep "${PLIST_LABEL}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (output) {
        running = true;
        const parts = output.split(/\s+/);
        if (parts[0] && parts[0] !== '-') {
          pid = parseInt(parts[0], 10);
          if (isNaN(pid)) pid = undefined;
        }
      }
    } catch {
      // Not running
    }
  }

  return { installed, running, pid, label: PLIST_LABEL };
}

/**
 * Get recent log output
 */
export function getRecentLogs(lines: number = 50): string {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) {
    return '(no logs yet)';
  }
  try {
    return execSync(`tail -n ${lines} "${logPath}"`, { encoding: 'utf-8' });
  } catch {
    return '(failed to read logs)';
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
