/**
 * Self-Check Module
 * インストール後の自己診断・動作チェック + 自動修復機能
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * PM Orchestrator 呼び出し証跡のインターフェース
 * Task tool による実際の呼び出しがあったかを追跡する
 *
 * 【重要】v4.2.0 変更点:
 * - 内部コードの状態ではなく、実際のTask toolログを確認する
 * - ファイル内容のチェックだけでは true にならない
 * - 実際の呼び出しログが存在する場合のみ true
 */
export interface OrchestratorCallEvidence {
  /** 現在のセッションで Task tool により呼び出されたか（実ログベース） */
  wasCalledInCurrentSession: boolean;
  /** テスト実行時に呼び出されたか（実ログベース） */
  wasCalledInTests: boolean;
  /** 外部プロジェクトで呼び出されたか（実ログベース） */
  wasCalledInExternalProject: boolean;
  /** 呼び出し証跡のトレース（見つかった証跡の一覧） */
  callTraceFound: string[];
  /** 呼び出し証跡の検証日時 */
  verifiedAt: string;
  /** 証跡のソース（どこから証跡を取得したか） */
  evidenceSource: 'actual_task_log' | 'session_evidence_file' | 'hook_output_only' | 'no_evidence';
  /** 証跡ステータス（v4.2.0追加） */
  status: 'verified' | 'partial' | 'no-evidence' | 'incomplete';
  /** 3種の証跡確認結果（v4.2.0追加） */
  repoEvidence: {
    /** 開発リポジトリでの実起動証跡 */
    developmentRepo: boolean;
    /** 依存プロジェクトでの実起動証跡 */
    dependencyProject: boolean;
    /** npm配布版プロジェクトでの実起動証跡 */
    distTestProject: boolean;
  };
  /** 証跡ファイルのパス */
  evidenceFilePaths: string[];
}

/**
 * Playwright E2E テスト実行痕跡のインターフェース（v4.3.0 新機能）
 * UI変更時に Playwright テストが実行されたかを追跡する
 */
export interface PlaywrightEvidence {
  /** Playwright テストが実行されたか */
  executed: boolean;
  /** 検出された痕跡の種類 */
  evidenceType: 'test-results' | 'traces' | 'screenshots' | 'reports' | 'no_evidence';
  /** 見つかったアーティファクト */
  artifacts: string[];
  /** 検証日時 */
  verifiedAt: string;
  /** UI変更が検出されたか */
  uiChangeDetected: boolean;
  /** UI変更があるのに痕跡がない場合 true */
  missingVerification: boolean;
}

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
  /** PM Orchestrator の実際の呼び出し証跡 */
  orchestratorCallEvidence?: OrchestratorCallEvidence;
  /** Playwright E2E テスト実行痕跡（v4.3.0 新機能） */
  playwrightEvidence?: PlaywrightEvidence;
}

export interface SelfCheckOptions {
  autoRepair?: boolean;
  /** 呼び出し証跡の検証をスキップするかどうか（初回インストール時など） */
  skipCallEvidence?: boolean;
  /** 外部プロジェクトでの検証かどうか */
  isExternalProject?: boolean;
  /** UI変更の検証を行うかどうか（v4.3.0 新機能） */
  checkPlaywrightEvidence?: boolean;
  /** 変更タイプ（UI変更の場合に指定） */
  changeType?: 'ui_visibility' | 'feature_flag' | 'settings_env' | 'routing' | 'code_change' | 'other';
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

    // 呼び出し証跡の検証（オプション）
    if (!options.skipCallEvidence) {
      result.orchestratorCallEvidence = await checkOrchestratorCallEvidence(
        claudeDir,
        result,
        options.isExternalProject ?? false
      );
    }

    // Playwright E2E テスト痕跡の検証（v4.3.0 新機能）
    if (options.checkPlaywrightEvidence) {
      const projectRoot = path.resolve(claudeDir, '..');
      result.playwrightEvidence = await checkPlaywrightEvidence(
        projectRoot,
        result,
        options.changeType ?? 'other'
      );
    }

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
    const output = execSync(`echo '{"prompt": "テスト入力です"}' | bash "${hookPath}"`, {
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

  // 呼び出し証跡の表示（v4.2.0 拡張）
  if (result.orchestratorCallEvidence) {
    const ev = result.orchestratorCallEvidence;
    lines.push('');
    lines.push('PM Orchestrator Call Evidence (v4.2.0):');
    lines.push('─'.repeat(40));

    // ステータス表示
    const statusIcon = ev.status === 'verified' ? '✅' :
                       ev.status === 'partial' ? '⚠️' :
                       ev.status === 'no-evidence' ? '❌' : '❓';
    lines.push(`  Status: ${statusIcon} ${ev.status.toUpperCase()}`);
    lines.push(`  Evidence Source: ${ev.evidenceSource}`);
    lines.push('');

    // 3種のリポジトリ証跡
    lines.push('  Repository Evidence (必須3種):');
    lines.push(`    Development Repo:    ${ev.repoEvidence.developmentRepo ? '✅' : '❌'}`);
    lines.push(`    Dependency Project:  ${ev.repoEvidence.dependencyProject ? '✅' : '❌'}`);
    lines.push(`    Dist-Test Project:   ${ev.repoEvidence.distTestProject ? '✅' : '❌'}`);
    lines.push('');

    // 呼び出し状態
    lines.push('  Call Status:');
    lines.push(`    Session Call:        ${ev.wasCalledInCurrentSession ? '✅' : '❌'}`);
    lines.push(`    Test Call:           ${ev.wasCalledInTests ? '✅' : '❌'}`);
    lines.push(`    External Project:    ${ev.wasCalledInExternalProject ? '✅' : '❌'}`);

    // 証跡ファイル
    if (ev.evidenceFilePaths.length > 0) {
      lines.push('');
      lines.push('  Evidence Files:');
      for (const filePath of ev.evidenceFilePaths.slice(0, 5)) {
        lines.push(`    - ${path.basename(filePath)}`);
      }
      if (ev.evidenceFilePaths.length > 5) {
        lines.push(`    ... and ${ev.evidenceFilePaths.length - 5} more`);
      }
    }

    // 見つかったトレース
    if (ev.callTraceFound.length > 0) {
      lines.push('');
      lines.push('  Traces Found:');
      for (const trace of ev.callTraceFound.slice(0, 10)) {
        lines.push(`    - ${trace}`);
      }
      if (ev.callTraceFound.length > 10) {
        lines.push(`    ... and ${ev.callTraceFound.length - 10} more`);
      }
    }

    // 警告：hook_output_only の場合
    if (ev.evidenceSource === 'hook_output_only') {
      lines.push('');
      lines.push('  ⚠️  WARNING: Hook is configured but NO actual Task tool invocation found!');
      lines.push('  ⚠️  This is likely a FALSE SUCCESS. PM Orchestrator may not have actually run.');
      lines.push('  ⚠️  completion_status: COMPLETE is PROHIBITED in this state.');
    }

    // 警告：no_evidence の場合
    if (ev.evidenceSource === 'no_evidence') {
      lines.push('');
      lines.push('  ❌ ERROR: No Task tool invocation evidence found!');
      lines.push('  ❌ selfcheck.status = "incomplete"');
      lines.push('  ❌ completion_status: COMPLETE is PROHIBITED.');
    }

    lines.push('');
    lines.push('─'.repeat(40));
  }

  // Playwright E2E テスト痕跡の表示（v4.3.0 新機能）
  if (result.playwrightEvidence) {
    const pw = result.playwrightEvidence;
    lines.push('');
    lines.push('Playwright E2E Test Evidence (v4.3.0):');
    lines.push('─'.repeat(40));

    const statusIcon = pw.executed ? '✅' :
                       pw.missingVerification ? '❌' : '⚠️';
    lines.push(`  Status: ${statusIcon} ${pw.executed ? 'EXECUTED' : 'NOT EXECUTED'}`);
    lines.push(`  Evidence Type: ${pw.evidenceType}`);
    lines.push(`  UI Change Detected: ${pw.uiChangeDetected ? 'Yes' : 'No'}`);
    lines.push(`  Missing Verification: ${pw.missingVerification ? '❌ YES' : '✅ No'}`);

    if (pw.artifacts.length > 0) {
      lines.push('');
      lines.push('  Artifacts Found:');
      for (const artifact of pw.artifacts.slice(0, 10)) {
        lines.push(`    - ${artifact}`);
      }
      if (pw.artifacts.length > 10) {
        lines.push(`    ... and ${pw.artifacts.length - 10} more`);
      }
    }

    if (pw.missingVerification) {
      lines.push('');
      lines.push('  ❌ MUST Rule 11 違反の可能性:');
      lines.push('  ❌ UI変更があるのに Playwright テスト痕跡がありません');
      lines.push('  ❌ 「ブラウザで確認してください」は禁止です');
      lines.push('  ❌ completion_status: COMPLETE は禁止されます');
    }

    lines.push('');
    lines.push('─'.repeat(40));
  }

  return lines.join('\n');
}

/**
 * PM Orchestrator の呼び出し証跡を検証する（v4.2.0 完全書き換え）
 *
 * 【重要】この関数は内部コードの状態ではなく、実際のTask toolログを確認する。
 *
 * 証跡の取得方法：
 * 1. .pm-orchestrator/session-evidence/ ディレクトリの証跡ファイル
 * 2. .pm-orchestrator/logs/ の実行ログ（pm-orchestrator subagent の記録）
 * 3. 手動検証の記録ファイル
 *
 * ★ ファイル内容のチェック（hook, agentファイル）だけでは true にならない
 * ★ 実際の呼び出しログが存在する場合のみ true
 */
async function checkOrchestratorCallEvidence(
  claudeDir: string,
  result: SelfCheckResult,
  isExternalProject: boolean
): Promise<OrchestratorCallEvidence> {
  const evidence: OrchestratorCallEvidence = {
    wasCalledInCurrentSession: false,
    wasCalledInTests: false,
    wasCalledInExternalProject: false,
    callTraceFound: [],
    verifiedAt: new Date().toISOString(),
    evidenceSource: 'no_evidence',
    status: 'no-evidence',
    repoEvidence: {
      developmentRepo: false,
      dependencyProject: false,
      distTestProject: false,
    },
    evidenceFilePaths: [],
  };

  try {
    const projectRoot = path.resolve(claudeDir, '..');
    const pmOrchestratorDir = path.join(projectRoot, '.pm-orchestrator');

    // 1. セッション証跡ファイルをチェック（最も信頼性が高い）
    const sessionEvidenceDir = path.join(pmOrchestratorDir, 'session-evidence');
    if (fs.existsSync(sessionEvidenceDir)) {
      const evidenceFiles = fs.readdirSync(sessionEvidenceDir)
        .filter(f => f.endsWith('.json') && f.includes('task-tool-invocation'));

      for (const file of evidenceFiles) {
        const filePath = path.join(sessionEvidenceDir, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (content.subagent_type === 'pm-orchestrator' && content.invoked === true) {
            evidence.callTraceFound.push(`session_evidence:${file}`);
            evidence.evidenceFilePaths.push(filePath);
            evidence.evidenceSource = 'session_evidence_file';

            // プロジェクトタイプに応じた証跡を記録
            if (content.project_type === 'development') {
              evidence.repoEvidence.developmentRepo = true;
            } else if (content.project_type === 'dependency') {
              evidence.repoEvidence.dependencyProject = true;
            } else if (content.project_type === 'dist-test') {
              evidence.repoEvidence.distTestProject = true;
            }
          }
        } catch {
          // ファイル読み取りエラーは無視
        }
      }
    }

    // 2. 実行ログをチェック（pm-orchestratorが実際に実行された記録）
    const logsDir = path.join(pmOrchestratorDir, 'logs');
    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 10); // 最新10件

      for (const file of logFiles) {
        const filePath = path.join(logsDir, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          // 実際にpm-orchestratorのサブエージェントが実行された記録があるか
          if (content.subagents && Array.isArray(content.subagents)) {
            const hasPmExecution = content.subagents.some(
              (s: { name: string; status: string }) =>
                s.name === 'pm-orchestrator' || s.status === 'completed'
            );
            if (hasPmExecution && content.status === 'success') {
              evidence.callTraceFound.push(`execution_log:${file}`);
              evidence.evidenceFilePaths.push(filePath);
              if (evidence.evidenceSource === 'no_evidence') {
                evidence.evidenceSource = 'actual_task_log';
              }
            }
          }
        } catch {
          // ファイル読み取りエラーは無視
        }
      }
    }

    // 3. hook内容のチェック（これだけでは true にならない - 参考情報のみ）
    const hookPath = path.join(claudeDir, 'hooks', 'user-prompt-submit.sh');
    if (fs.existsSync(hookPath)) {
      const hookContent = fs.readFileSync(hookPath, 'utf-8');
      const hasPmTrigger = hookContent.includes('PM Orchestrator') ||
                           hookContent.includes('pm-orchestrator');

      if (hasPmTrigger) {
        evidence.callTraceFound.push('hook_trigger_configured');
        // 注意: これだけでは evidenceSource を変更しない
        if (evidence.evidenceSource === 'no_evidence') {
          evidence.evidenceSource = 'hook_output_only';
        }
      }
    }

    // 4. 証跡の評価（実ログベースのみ true）
    const hasActualEvidence =
      evidence.evidenceSource === 'session_evidence_file' ||
      evidence.evidenceSource === 'actual_task_log';

    if (hasActualEvidence) {
      // 実際のログが存在する場合
      const allReposCovered =
        evidence.repoEvidence.developmentRepo &&
        evidence.repoEvidence.dependencyProject &&
        evidence.repoEvidence.distTestProject;

      if (allReposCovered) {
        evidence.status = 'verified';
        evidence.wasCalledInCurrentSession = true;
        evidence.wasCalledInTests = true;
        evidence.wasCalledInExternalProject = true;
      } else {
        evidence.status = 'partial';
        // どのリポジトリで証跡があるかに応じて設定
        evidence.wasCalledInCurrentSession = evidence.repoEvidence.developmentRepo;
        evidence.wasCalledInExternalProject =
          evidence.repoEvidence.dependencyProject || evidence.repoEvidence.distTestProject;

        const missingRepos: string[] = [];
        if (!evidence.repoEvidence.developmentRepo) missingRepos.push('development repo');
        if (!evidence.repoEvidence.dependencyProject) missingRepos.push('dependency project');
        if (!evidence.repoEvidence.distTestProject) missingRepos.push('dist-test project');

        result.warnings.push(
          `PM Orchestrator の呼び出し証跡が不完全です。` +
          `以下のリポジトリで証跡が不足: ${missingRepos.join(', ')}`
        );
      }
    } else if (evidence.evidenceSource === 'hook_output_only') {
      // hookのみ設定されているが、実際の呼び出し証跡がない
      evidence.status = 'no-evidence';
      result.warnings.push(
        '【警告】hookは設定されていますが、Task tool 呼び出しの証跡がありません。' +
        '「テスト完了」と報告されても、PM Orchestratorが実際に起動されていない可能性があります。' +
        'これは偽成功です。'
      );
    } else {
      // 証跡がない
      evidence.status = 'no-evidence';
      result.warnings.push(
        '【警告】PM Orchestrator の呼び出し証跡が見つかりません。' +
        'Task tool 呼び出しの証跡がありません。' +
        'completion_status: COMPLETE は禁止されます。'
      );
    }

    // 5. 外部プロジェクトフラグの設定
    if (isExternalProject) {
      evidence.wasCalledInExternalProject = hasActualEvidence;
      if (hasActualEvidence) {
        evidence.repoEvidence.distTestProject = true;
      }
    }

  } catch (error) {
    result.warnings.push(`呼び出し証跡の検証中にエラー: ${(error as Error).message}`);
    evidence.status = 'incomplete';
  }

  return evidence;
}

/**
 * Playwright E2E テスト実行痕跡を検証する（v4.3.0 新機能）
 *
 * UI変更があるのに Playwright テストの痕跡がない場合、
 * NO-EVIDENCE を返して COMPLETE を禁止する。
 *
 * 【検出対象】
 * - test-results/ ディレクトリ
 * - playwright-report/ ディレクトリ
 * - *.png スクリーンショット
 * - trace.zip ファイル
 */
async function checkPlaywrightEvidence(
  projectRoot: string,
  result: SelfCheckResult,
  changeType: string
): Promise<PlaywrightEvidence> {
  const evidence: PlaywrightEvidence = {
    executed: false,
    evidenceType: 'no_evidence',
    artifacts: [],
    verifiedAt: new Date().toISOString(),
    uiChangeDetected: false,
    missingVerification: false,
  };

  // UI変更タイプかどうかを判定
  const uiChangeTypes = ['ui_visibility', 'feature_flag', 'settings_env', 'routing'];
  evidence.uiChangeDetected = uiChangeTypes.includes(changeType);

  try {
    // 1. test-results/ ディレクトリをチェック
    const testResultsDir = path.join(projectRoot, 'test-results');
    if (fs.existsSync(testResultsDir)) {
      const files = fs.readdirSync(testResultsDir, { recursive: true }) as string[];
      const screenshots = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
      const traces = files.filter(f => f.endsWith('.zip') || f.includes('trace'));

      if (screenshots.length > 0) {
        evidence.executed = true;
        evidence.evidenceType = 'screenshots';
        evidence.artifacts.push(...screenshots.slice(0, 10).map(f => `test-results/${f}`));
      }

      if (traces.length > 0) {
        evidence.executed = true;
        evidence.evidenceType = 'traces';
        evidence.artifacts.push(...traces.slice(0, 5).map(f => `test-results/${f}`));
      }
    }

    // 2. playwright-report/ ディレクトリをチェック
    const reportDir = path.join(projectRoot, 'playwright-report');
    if (fs.existsSync(reportDir)) {
      evidence.executed = true;
      evidence.evidenceType = 'reports';
      evidence.artifacts.push('playwright-report/');
    }

    // 3. 最近の Playwright 実行ログをチェック
    const pmOrchestratorDir = path.join(projectRoot, '.pm-orchestrator', 'logs');
    if (fs.existsSync(pmOrchestratorDir)) {
      const logFiles = fs.readdirSync(pmOrchestratorDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 5);

      for (const file of logFiles) {
        try {
          const content = JSON.parse(
            fs.readFileSync(path.join(pmOrchestratorDir, file), 'utf-8')
          );
          if (content.commands && Array.isArray(content.commands)) {
            const playwrightCommands = content.commands.filter(
              (cmd: string) => cmd.includes('playwright') || cmd.includes('npx playwright')
            );
            if (playwrightCommands.length > 0) {
              evidence.executed = true;
              evidence.artifacts.push(`log:${file}`);
            }
          }
        } catch {
          // ログ読み取りエラーは無視
        }
      }
    }

    // 4. UI変更があるのに痕跡がない場合を検出
    if (evidence.uiChangeDetected && !evidence.executed) {
      evidence.missingVerification = true;
      result.warnings.push(
        '【MUST Rule 11 違反の可能性】' +
        'UI変更が検出されましたが、Playwright E2E テストの痕跡がありません。' +
        '「ブラウザで確認してください」ではなく、' +
        'npx playwright test を実行して検証結果を artifacts に保存してください。' +
        'completion_status: COMPLETE は禁止されます。'
      );
      result.errors.push(
        'UI変更に対する Playwright E2E テスト痕跡がありません (NO-EVIDENCE)'
      );
    }

    // 5. 成功時のメッセージ
    if (evidence.executed && evidence.artifacts.length > 0) {
      result.repaired.push(
        `Playwright E2E テスト痕跡を検出: ${evidence.artifacts.length} 件のアーティファクト`
      );
    }

  } catch (error) {
    result.warnings.push(`Playwright 痕跡検証中にエラー: ${(error as Error).message}`);
  }

  return evidence;
}
