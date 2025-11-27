#!/usr/bin/env node

/**
 * Quality Guardian CLI
 * サブコマンド: install, upgrade
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLI_VERSION = '1.0.0';
const INSTALL_SCRIPT = path.join(__dirname, 'install.sh');

function showHelp() {
  console.log(`
Quality Guardian CLI v${CLI_VERSION}

Usage:
  quality-guardian <command> [options]

Commands:
  install [path]    Install Quality Guardian to a project
                    Defaults to current directory if path not specified

  upgrade [path]    Upgrade Quality Guardian in an existing project
                    Defaults to current directory if path not specified

  check             Run quality checks (default command)

  help, -h          Show this help message

Options for install/upgrade:
  --mode=<mode>     Installation mode: team or personal
                    team    - Install directly in project (.claude/)
                    personal - Install in parent directory

Examples:
  quality-guardian install                    # Install in current dir
  quality-guardian install /path/to/project  # Install in specific path
  quality-guardian install --mode=personal   # Personal mode
  quality-guardian upgrade                   # Upgrade existing installation
  quality-guardian check                     # Run quality checks

For more information:
  https://github.com/EarthLinkNetwork/ai-quality-guardian
`);
}

function runInstallScript(targetPath, mode, isUpgrade) {
  const args = [INSTALL_SCRIPT];

  if (targetPath && targetPath !== process.cwd()) {
    args.push(targetPath);
  }

  const env = { ...process.env };

  if (mode) {
    env.QG_MODE = mode;
  }

  if (isUpgrade) {
    env.QG_UPGRADE = '1';
  }

  const proc = spawn('bash', args, {
    stdio: 'inherit',
    env
  });

  proc.on('close', (code) => {
    process.exit(code || 0);
  });

  proc.on('error', (err) => {
    console.error('Failed to run install script:', err.message);
    process.exit(1);
  });
}

function parseArgs(args) {
  const result = {
    command: null,
    path: null,
    mode: null
  };

  for (const arg of args) {
    if (arg.startsWith('--mode=')) {
      result.mode = arg.split('=')[1];
    } else if (arg.startsWith('-')) {
      // Other flags (ignored for now)
    } else if (!result.command) {
      result.command = arg;
    } else if (!result.path) {
      result.path = arg;
    }
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'check') {
    // Default: run quality checks
    const mainScript = path.join(__dirname, 'quality-guardian.js');
    require(mainScript);
    return;
  }

  const parsed = parseArgs(args);

  switch (parsed.command) {
    case 'install':
      runInstallScript(parsed.path || process.cwd(), parsed.mode, false);
      break;

    case 'upgrade':
      runInstallScript(parsed.path || process.cwd(), parsed.mode, true);
      break;

    case 'help':
    case '-h':
    case '--help':
      showHelp();
      break;

    default:
      console.error(`Unknown command: ${parsed.command}`);
      showHelp();
      process.exit(1);
  }
}

main();
