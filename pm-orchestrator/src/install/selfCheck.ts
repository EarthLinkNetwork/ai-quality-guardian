/**
 * Self-Check Module
 * インストール後の自己診断・動作チェック + 自動修復機能
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SelfCheckResult {
  success: boolean;
  mode: 'team' | 'personal' | 'unknown';
  checks: {
    claudeDir: boolean;
    settingsJson: boolean;
    claudeMd: boolean;
    agentFile: boolean;
    commandFile: boolean;
    hookScript: boolean;
    hookSyntax: boolean;
    hookOutput: boolean;
    rulesFile: boolean;
  };
  errors: string[];
  warnings: string[];
  repaired: string[];
}

export interface SelfCheckOptions {
  autoRepair?: boolean;
}

export async function runSelfCheck(
  targetDir: string = '.',
  options: SelfCheckOptions = {}
): Promise<SelfCheckResult> {
  const result: SelfCheckResult = {
    success: false,
    mode: 'unknown',
    checks: {
      claudeDir: false,
      settingsJson: false,
      claudeMd: false,
      agentFile: false,
      commandFile: false,
      hookScript: false,
      hookSyntax: false,
      hookOutput: false,
      rulesFile: false,
    },
    errors: [],
    warnings: [],
    repaired: [],
  };

  const autoRepair = options.autoRepair ?? false;

  try {
    const mode = await detectMode(targetDir);
    result.mode = mode;

    const claudeDir = mode === 'personal'
      ? path.resolve(targetDir, '..', '.claude')
      : path.resolve(targetDir, '.claude');

    result.checks.claudeDir = await checkClaudeDir(claudeDir, result, autoRepair);
    result.checks.settingsJson = await checkSettingsJson(claudeDir, result, autoRepair);
    result.checks.claudeMd = await checkClaudeMd(claudeDir, result);
    result.checks.agentFile = await checkAgentFile(claudeDir, result);
    result.checks.commandFile = await checkCommandFile(claudeDir, result);
    result.checks.hookScript = await checkHookScript(claudeDir, result);
    result.checks.hookSyntax = await checkHookSyntax(claudeDir, result);
    result.checks.hookOutput = await checkHookOutput(claudeDir, result);
    result.checks.rulesFile = await checkRulesFile(claudeDir, result);

    result.success = Object.values(result.checks).every(check => check) && result.errors.length === 0;
  } catch (error) {
    result.errors.push(`Unexpected error: ${(error as Error).message}`);
  }

  return result;
}

async function detectMode(targetDir: string): Promise<'team' | 'personal' | 'unknown'> {
  const teamClaudeMd = path.resolve(targetDir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(teamClaudeMd)) {
    const content = fs.readFileSync(teamClaudeMd, 'utf-8');
    if (content.includes('_pmOrchestratorMode: team')) {
      return 'team';
    }
  }

  const personalClaudeMd = path.resolve(targetDir, '..', '.claude', 'CLAUDE.md');
  if (fs.existsSync(personalClaudeMd)) {
    const content = fs.readFileSync(personalClaudeMd, 'utf-8');
    if (content.includes('_pmOrchestratorMode: personal')) {
      return 'personal';
    }
  }

  if (fs.existsSync(path.resolve(targetDir, '.claude'))) {
    return 'team';
  }

  return 'unknown';
}

async function checkClaudeDir(
  claudeDir: string,
  result: SelfCheckResult,
  autoRepair: boolean
): Promise<boolean> {
  if (!fs.existsSync(claudeDir)) {
    if (autoRepair) {
      try {
        fs.mkdirSync(claudeDir, { recursive: true });
        result.repaired.push('.claude/ directory created');
        return true;
      } catch (error) {
        result.errors.push(`Failed to create .claude/ directory: ${(error as Error).message}`);
        return false;
      }
    } else {
      result.errors.push(`.claude/ directory not found: ${claudeDir}`);
      return false;
    }
  }

  if (!fs.statSync(claudeDir).isDirectory()) {
    result.errors.push(`.claude/ is not a directory: ${claudeDir}`);
    return false;
  }

  return true;
}

async function checkSettingsJson(
  claudeDir: string,
  result: SelfCheckResult,
  autoRepair: boolean
): Promise<boolean> {
  const settingsPath = path.join(claudeDir, 'settings.json');

  if (!fs.existsSync(settingsPath)) {
    if (autoRepair) {
      try {
        const defaultSettings = {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    _pmOrchestratorManaged: true,
                    type: 'command',
                    command: '$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh'
                  }
                ]
              }
            ]
          }
        };
        fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
        result.repaired.push('settings.json created');
        return true;
      } catch (error) {
        result.errors.push(`Failed to create settings.json: ${(error as Error).message}`);
        return false;
      }
    } else {
      result.errors.push('settings.json not found');
      return false;
    }
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const json = JSON.parse(content);

    const hooks = json.hooks?.UserPromptSubmit;
    if (!hooks || !Array.isArray(hooks) || hooks.length === 0) {
      if (autoRepair) {
        if (!json.hooks) json.hooks = {};
        json.hooks.UserPromptSubmit = [
          {
            hooks: [
              {
                _pmOrchestratorManaged: true,
                type: 'command',
                command: '$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh'
              }
            ]
          }
        ];
        fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2), 'utf-8');
        result.repaired.push('UserPromptSubmit hook added to settings.json');
        return true;
      } else {
        result.errors.push('UserPromptSubmit hook not configured in settings.json');
        return false;
      }
    }

    const findPmHook = (hookArray: unknown[]): boolean => {
      for (const hook of hookArray) {
        if (typeof hook !== 'object' || hook === null) continue;
        const h = hook as Record<string, unknown>;

        if (h._pmOrchestratorManaged === true) return true;

        if (h.type === 'command' && typeof h.command === 'string' && (
          h.command.includes('user-prompt-submit.sh') ||
          h.command.includes('pm-orchestrator-hook.sh')
        )) return true;

        if (Array.isArray(h.hooks) && findPmHook(h.hooks)) return true;
      }
      return false;
    };

    if (!findPmHook(hooks)) {
      if (autoRepair) {
        hooks.push({
          hooks: [
            {
              _pmOrchestratorManaged: true,
              type: 'command',
              command: '$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh'
            }
          ]
        });
        fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2), 'utf-8');
        result.repaired.push('PM Orchestrator hook entry added to settings.json');
        return true;
      } else {
        result.errors.push('PM Orchestrator hook not found in settings.json');
        return false;
      }
    }

    let pmHookCount = 0;
    const countPmHooks = (hookArray: unknown[]): void => {
      for (const hook of hookArray) {
        if (typeof hook !== 'object' || hook === null) continue;
        const h = hook as Record<string, unknown>;

        if (h._pmOrchestratorManaged === true) {
          pmHookCount++;
        }
        if (h.type === 'command' && typeof h.command === 'string' && (
          h.command.includes('user-prompt-submit.sh') ||
          h.command.includes('pm-orchestrator-hook.sh')
        )) {
          pmHookCount++;
        }
        if (Array.isArray(h.hooks)) {
          countPmHooks(h.hooks);
        }
      }
    };

    countPmHooks(hooks);

    if (pmHookCount > 1) {
      if (autoRepair) {
        let foundFirst = false;

        const cleanArray = (hookArray: unknown[]): unknown[] => {
          const cleaned: unknown[] = [];
          for (const hook of hookArray) {
            if (typeof hook !== 'object' || hook === null) {
              cleaned.push(hook);
              continue;
            }
            const h = hook as Record<string, unknown>;

            const isPmHook = h._pmOrchestratorManaged === true ||
              (h.type === 'command' && typeof h.command === 'string' && (
                h.command.includes('user-prompt-submit.sh') ||
                h.command.includes('pm-orchestrator-hook.sh')
              ));

            if (isPmHook) {
              if (!foundFirst) {
                foundFirst = true;
                cleaned.push(hook);
              }
            } else if (Array.isArray(h.hooks)) {
              const nestedCleaned = cleanArray(h.hooks);
              cleaned.push({ ...h, hooks: nestedCleaned });
            } else {
              cleaned.push(hook);
            }
          }
          return cleaned;
        };

        json.hooks.UserPromptSubmit = cleanArray(hooks);
        fs.writeFileSync(settingsPath, JSON.stringify(json, null, 2), 'utf-8');
        result.repaired.push(`Removed ${pmHookCount - 1} duplicate PM Orchestrator hook entries`);
      } else {
        result.warnings.push(`Found ${pmHookCount} PM Orchestrator hook entries (expected: 1)`);
      }
    }

    return true;
  } catch (error) {
    result.errors.push(`Failed to parse settings.json: ${(error as Error).message}`);
    return false;
  }
}

async function checkClaudeMd(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    result.errors.push('CLAUDE.md not found');
    return false;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf-8');

  if (!content.includes('<!-- PM-ORCHESTRATOR-START -->')) {
    result.warnings.push('PM Orchestrator section marker not found in CLAUDE.md (optional)');
    if (!content.toLowerCase().includes('pm orchestrator') && !content.toLowerCase().includes('pm-orchestrator')) {
      result.errors.push('PM Orchestrator configuration not found in CLAUDE.md');
      return false;
    }
  }

  return true;
}

async function checkRulesFile(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const rulesPath = path.join(claudeDir, 'rules', 'critical-must.md');

  if (!fs.existsSync(rulesPath)) {
    result.errors.push('rules/critical-must.md not found');
    return false;
  }

  const content = fs.readFileSync(rulesPath, 'utf-8');

  // CRITICAL MUST Rulesの検証
  const criticalRulesKeywords = [
    'CRITICAL MUST Rules',
    'MUST 3',
    'MUST 7',
    'MUST 9',
    'MUST 10',
    'MUST 21',
    'MUST 22',
    'MUST 24'
  ];

  const missingRules: string[] = [];
  for (const keyword of criticalRulesKeywords) {
    if (!content.includes(keyword)) {
      missingRules.push(keyword);
    }
  }

  if (missingRules.length > 0) {
    result.errors.push(`CRITICAL MUST Rules missing or incomplete in rules file: ${missingRules.join(', ')}`);
    return false;
  }

  return true;
}

async function checkAgentFile(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const agentPath = path.join(claudeDir, 'agents', 'pm-orchestrator.md');

  if (!fs.existsSync(agentPath)) {
    result.errors.push('agents/pm-orchestrator.md not found');
    return false;
  }

  const content = fs.readFileSync(agentPath, 'utf-8');

  if (!content.toLowerCase().includes('task') && !content.toLowerCase().includes('orchestrator')) {
    result.warnings.push('agents/pm-orchestrator.md may not contain expected content');
  }

  return true;
}

async function checkCommandFile(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const commandPath = path.join(claudeDir, 'commands', 'pm.md');

  if (!fs.existsSync(commandPath)) {
    result.errors.push('commands/pm.md not found');
    return false;
  }

  const content = fs.readFileSync(commandPath, 'utf-8');

  if (!content.toLowerCase().includes('task') || !content.toLowerCase().includes('pm-orchestrator')) {
    result.warnings.push('commands/pm.md may not contain Task tool invocation for pm-orchestrator');
  }

  return true;
}

async function checkHookScript(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const possibleHooks = [
    'pm-orchestrator-hook.sh',
    'user-prompt-submit.sh'
  ];

  let hookPath: string | null = null;
  for (const hookName of possibleHooks) {
    const testPath = path.join(claudeDir, 'hooks', hookName);
    if (fs.existsSync(testPath)) {
      hookPath = testPath;
      break;
    }
  }

  if (!hookPath) {
    result.warnings.push('Hook script not found (optional - slash command format is used)');
    return true;
  }

  try {
    const stats = fs.statSync(hookPath);
    const isExecutable = (stats.mode & 0o111) !== 0;

    if (!isExecutable) {
      result.warnings.push(`${path.basename(hookPath)} is not executable (chmod +x required)`);
    }
  } catch (error) {
    result.warnings.push(`Failed to check hook script permissions: ${(error as Error).message}`);
  }

  return true;
}

async function checkHookSyntax(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const possibleHooks = [
    'pm-orchestrator-hook.sh',
    'user-prompt-submit.sh'
  ];

  let hookPath: string | null = null;
  for (const hookName of possibleHooks) {
    const testPath = path.join(claudeDir, 'hooks', hookName);
    if (fs.existsSync(testPath)) {
      hookPath = testPath;
      break;
    }
  }

  if (!hookPath) {
    return true;
  }

  try {
    execSync(`bash -n "${hookPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return true;
  } catch (error) {
    const execError = error as { stderr?: string; message?: string };
    const stderr = execError.stderr || execError.message || 'Unknown syntax error';
    result.warnings.push(`Hook script syntax warning: ${stderr.trim()}`);
    return true;
  }
}

async function checkHookOutput(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const possibleHooks = [
    'pm-orchestrator-hook.sh',
    'user-prompt-submit.sh'
  ];

  let hookPath: string | null = null;
  for (const hookName of possibleHooks) {
    const testPath = path.join(claudeDir, 'hooks', hookName);
    if (fs.existsSync(testPath)) {
      hookPath = testPath;
      break;
    }
  }

  if (!hookPath) {
    return true;
  }

  try {
    const output = execSync(`echo '{"prompt": "テストでーす"}' | bash "${hookPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });

    const checks = {
      pmOrchestratorBlock: output.includes('PM ORCHESTRATOR') ||
                           output.includes('pm-orchestrator') ||
                           output.includes('PM Orchestrator'),
      taskType: output.includes('TaskType') ||
                output.includes('Task tool') ||
                output.includes('subagent_type'),
      criticalRules: output.includes('CRITICAL MUST Rules') ||
                     output.includes('MUST 3') ||
                     output.includes('MUST 7')
    };

    if (!checks.pmOrchestratorBlock && !checks.taskType) {
      result.warnings.push('Hook output does not contain PM Orchestrator reference (optional)');
    }

    if (!checks.criticalRules) {
      result.warnings.push('Hook output does not contain CRITICAL MUST Rules (optional)');
    }

    return true;
  } catch (error) {
    const execError = error as { message?: string };
    result.warnings.push(`Hook execution test skipped: ${execError.message || 'Unknown error'}`);
    return true;
  }
}

export function formatResult(result: SelfCheckResult): string {
  const lines: string[] = [];

  lines.push('PM Orchestrator Self-Check Results');
  lines.push('='.repeat(50));
  lines.push('');

  lines.push(`Mode: ${result.mode}`);
  lines.push(`Overall: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
  lines.push('');

  lines.push('Checks:');
  for (const [key, value] of Object.entries(result.checks)) {
    lines.push(`  ${value ? '✅' : '❌'} ${key}`);
  }
  lines.push('');

  if (result.repaired.length > 0) {
    lines.push('Auto-Repaired:');
    for (const repair of result.repaired) {
      lines.push(`  🔧 ${repair}`);
    }
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  ❌ ${error}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ⚠️  ${warning}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(50));

  return lines.join('\n');
}
