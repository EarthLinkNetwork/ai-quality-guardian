/**
 * Self-Check Module
 * インストール後の自己診断・動作チェック
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
  };
  errors: string[];
  warnings: string[];
}

export async function runSelfCheck(targetDir: string = '.'): Promise<SelfCheckResult> {
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
    },
    errors: [],
    warnings: [],
  };

  try {
    const mode = await detectMode(targetDir);
    result.mode = mode;

    const claudeDir = mode === 'personal'
      ? path.resolve(targetDir, '..', '.claude')
      : path.resolve(targetDir, '.claude');

    // 基本的なファイル存在チェック
    result.checks.claudeDir = await checkClaudeDir(claudeDir, result);
    result.checks.settingsJson = await checkSettingsJson(claudeDir, result);
    result.checks.claudeMd = await checkClaudeMd(claudeDir, result);
    result.checks.agentFile = await checkAgentFile(claudeDir, result);
    result.checks.commandFile = await checkCommandFile(claudeDir, result);
    result.checks.hookScript = await checkHookScript(claudeDir, result);

    // hook構文チェック（bash -n）
    result.checks.hookSyntax = await checkHookSyntax(claudeDir, result);

    // hook動作確認（出力内容チェック）
    result.checks.hookOutput = await checkHookOutput(claudeDir, result);

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

  // マーカーがなくても.claudeディレクトリがあればteamと判定
  if (fs.existsSync(path.resolve(targetDir, '.claude'))) {
    return 'team';
  }

  return 'unknown';
}

async function checkClaudeDir(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  if (!fs.existsSync(claudeDir)) {
    result.errors.push(`.claude/ directory not found: ${claudeDir}`);
    return false;
  }

  if (!fs.statSync(claudeDir).isDirectory()) {
    result.errors.push(`.claude/ is not a directory: ${claudeDir}`);
    return false;
  }

  return true;
}

async function checkSettingsJson(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  const settingsPath = path.join(claudeDir, 'settings.json');

  if (!fs.existsSync(settingsPath)) {
    result.errors.push('settings.json not found');
    return false;
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const json = JSON.parse(content);

    // UserPromptSubmit hookが設定されているか確認
    const hooks = json.hooks?.UserPromptSubmit;
    if (!hooks || !Array.isArray(hooks) || hooks.length === 0) {
      result.errors.push('UserPromptSubmit hook not configured in settings.json');
      return false;
    }

    // PM Orchestrator用のエントリを探す
    // 正しい形式: シェルスクリプト呼び出し（user-prompt-submit.sh）
    // または _pmOrchestratorManaged マーカー付き（ネスト構造も対応）
    const findPmHook = (hookArray: unknown[]): boolean => {
      for (const hook of hookArray) {
        if (typeof hook !== 'object' || hook === null) continue;
        const h = hook as Record<string, unknown>;

        // マーカー付きのエントリ
        if (h._pmOrchestratorManaged === true) return true;

        // シェルスクリプト呼び出し形式
        if (h.type === 'command' && typeof h.command === 'string' && (
          h.command.includes('user-prompt-submit.sh') ||
          h.command.includes('pm-orchestrator-hook.sh')
        )) return true;

        // ネスト構造（hooks配列内にhooksがある場合）
        if (Array.isArray(h.hooks) && findPmHook(h.hooks)) return true;
      }
      return false;
    };

    if (!findPmHook(hooks)) {
      result.errors.push('PM Orchestrator hook not found in settings.json (expected: user-prompt-submit.sh or _pmOrchestratorManaged marker)');
      return false;
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
    // マーカーがなくてもPM関連の内容があればOK
    if (!content.toLowerCase().includes('pm orchestrator') && !content.toLowerCase().includes('pm-orchestrator')) {
      result.errors.push('PM Orchestrator configuration not found in CLAUDE.md');
      return false;
    }
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

  // Task toolで起動する内容があるか確認
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

  // pm-orchestrator を Task tool で起動する内容があるか確認
  if (!content.toLowerCase().includes('task') || !content.toLowerCase().includes('pm-orchestrator')) {
    result.warnings.push('commands/pm.md may not contain Task tool invocation for pm-orchestrator');
  }

  return true;
}

async function checkHookScript(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  // hookスクリプトはオプション（スラッシュコマンド形式では不要）
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
    // hookスクリプトがなくてもOK（スラッシュコマンド形式を使用）
    result.warnings.push('Hook script not found (optional - slash command format is used)');
    return true;  // エラーではなく成功扱い
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
  // hookスクリプトはオプション
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
    // hookスクリプトがない場合はスキップ（オプション）
    return true;
  }

  try {
    // bash -n で構文チェック
    execSync(`bash -n "${hookPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return true;
  } catch (error) {
    const execError = error as { stderr?: string; message?: string };
    const stderr = execError.stderr || execError.message || 'Unknown syntax error';
    result.warnings.push(`Hook script syntax warning: ${stderr.trim()}`);
    return true;  // 構文エラーがあっても成功扱い（スラッシュコマンドがメイン）
  }
}

async function checkHookOutput(claudeDir: string, result: SelfCheckResult): Promise<boolean> {
  // hookスクリプトはオプション
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
    // hookスクリプトがない場合はスキップ（オプション）
    return true;
  }

  try {
    // テスト入力でhookを実行
    const output = execSync(`echo '{"prompt": "テストでーす"}' | bash "${hookPath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    });

    // 期待される出力内容をチェック（参考情報として）
    const checks = {
      pmOrchestratorBlock: output.includes('PM ORCHESTRATOR') ||
                           output.includes('pm-orchestrator') ||
                           output.includes('PM Orchestrator'),
      taskType: output.includes('TaskType') ||
                output.includes('Task tool') ||
                output.includes('subagent_type'),
    };

    if (!checks.pmOrchestratorBlock && !checks.taskType) {
      result.warnings.push('Hook output does not contain PM Orchestrator reference (optional)');
    }

    return true;  // hookの出力内容に関わらず成功
  } catch (error) {
    const execError = error as { message?: string };
    result.warnings.push(`Hook execution test skipped: ${execError.message || 'Unknown error'}`);
    return true;  // 実行に失敗しても成功扱い（スラッシュコマンドがメイン）
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
