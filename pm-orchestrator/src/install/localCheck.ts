/**
 * Local Installation Check Module
 * インストーラーがローカル node_modules から実行されていることを確認
 */
import * as fs from 'fs';
import * as path from 'path';

export interface LocalCheckResult {
  isLocalInstall: boolean;
  isGlobalInstall: boolean;
  installLocation: 'local' | 'global' | 'development' | 'unknown';
  packagePath: string;
  templatesPath: string;
  templatesExist: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 現在の実行環境がローカルインストールかどうかをチェック
 */
export function checkLocalInstallation(callerDir?: string): LocalCheckResult {
  const result: LocalCheckResult = {
    isLocalInstall: false,
    isGlobalInstall: false,
    installLocation: 'unknown',
    packagePath: '',
    templatesPath: '',
    templatesExist: false,
    errors: [],
    warnings: []
  };

  try {
    // 現在のスクリプトの場所を特定
    const scriptDir = callerDir || __dirname;
    result.packagePath = scriptDir;

    // node_modules 内かどうかをチェック
    const normalizedPath = scriptDir.replace(/\\/g, '/');

    // ローカル node_modules パターン
    const localNodeModulesPattern = /\/node_modules\/pm-orchestrator-enhancement\//;
    // グローバル node_modules パターン
    const globalNodeModulesPatterns = [
      /\/lib\/node_modules\/pm-orchestrator-enhancement\//,  // npm global (Linux/Mac)
      /\/npm\/node_modules\/pm-orchestrator-enhancement\//,  // npm global (Windows)
      /AppData.*\/npm\/node_modules\//i,                     // Windows global
    ];

    if (localNodeModulesPattern.test(normalizedPath)) {
      result.isLocalInstall = true;
      result.installLocation = 'local';
    } else if (globalNodeModulesPatterns.some(p => p.test(normalizedPath))) {
      result.isGlobalInstall = true;
      result.installLocation = 'global';
      result.warnings.push('Running from global npm installation. Local installation is recommended.');
    } else {
      // 開発環境（直接実行）の可能性をチェック
      const devIndicators = [
        path.join(scriptDir, '..', 'src'),
        path.join(scriptDir, '..', 'package.json'),
        path.join(scriptDir, '..', 'tsconfig.json')
      ];

      const isDevelopment = devIndicators.some(p => fs.existsSync(p));

      if (isDevelopment) {
        result.installLocation = 'development';
        result.isLocalInstall = true; // 開発環境はローカルとして扱う
      } else {
        result.installLocation = 'unknown';
        result.warnings.push('Could not determine installation location');
      }
    }

    // templates ディレクトリの存在確認
    const possibleTemplatesPaths = [
      // ローカル node_modules からの相対パス
      path.resolve(scriptDir, '..', '..', 'templates'),
      // dist からの相対パス
      path.resolve(scriptDir, '..', 'templates'),
      // 開発環境からの相対パス
      path.resolve(scriptDir, '..', '..', '..', 'templates'),
      // カレントディレクトリからの node_modules 経由
      path.resolve(process.cwd(), 'node_modules', 'pm-orchestrator-enhancement', 'templates')
    ];

    for (const templatesPath of possibleTemplatesPaths) {
      if (fs.existsSync(templatesPath)) {
        result.templatesPath = templatesPath;
        result.templatesExist = true;
        break;
      }
    }

    if (!result.templatesExist) {
      result.errors.push('templates/ directory not found. The package may be corrupted or incompletely installed.');
      result.errors.push('Try: npm uninstall pm-orchestrator-enhancement && npm install pm-orchestrator-enhancement');
    }

    // テンプレート内の必須ファイル確認
    if (result.templatesExist) {
      const requiredTemplateFiles = [
        '.claude/CLAUDE.md',
        '.claude/settings.json',
        '.claude/agents/pm-orchestrator.md',
        '.claude/hooks/user-prompt-submit.sh'
      ];

      const missingFiles: string[] = [];
      for (const file of requiredTemplateFiles) {
        const filePath = path.join(result.templatesPath, file);
        if (!fs.existsSync(filePath)) {
          missingFiles.push(file);
        }
      }

      if (missingFiles.length > 0) {
        result.warnings.push(`Missing template files: ${missingFiles.join(', ')}`);
      }
    }

  } catch (error) {
    result.errors.push(`Failed to check installation location: ${(error as Error).message}`);
  }

  return result;
}

/**
 * ローカルインストールを強制するためのガード
 * グローバルインストールから実行された場合はエラーを表示
 */
export function enforceLocalInstallation(): boolean {
  const check = checkLocalInstallation();

  if (check.isGlobalInstall) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('⚠️  PM Orchestrator: Global Installation Detected');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('You are running pm-orchestrator from a global npm installation.');
    console.error('This is not recommended. Please install locally instead:');
    console.error('');
    console.error('  cd /path/to/your/project');
    console.error('  npm install pm-orchestrator-enhancement');
    console.error('  npx pm-orchestrator install');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    return false;
  }

  if (!check.templatesExist) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ PM Orchestrator: Templates Not Found');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('The templates/ directory was not found.');
    console.error('The package may be corrupted or incompletely installed.');
    console.error('');
    console.error('Try reinstalling:');
    console.error('  npm uninstall pm-orchestrator-enhancement');
    console.error('  npm install pm-orchestrator-enhancement');
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    return false;
  }

  return true;
}

/**
 * ローカルチェック結果をフォーマット
 */
export function formatLocalCheckResult(result: LocalCheckResult): string {
  const lines: string[] = [];

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('PM Orchestrator Installation Check');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Installation location: ${result.installLocation}`);
  lines.push(`Package path: ${result.packagePath}`);
  lines.push(`Templates path: ${result.templatesPath || 'Not found'}`);
  lines.push(`Templates exist: ${result.templatesExist ? '✅ Yes' : '❌ No'}`);
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

  if (result.isLocalInstall && result.templatesExist && result.errors.length === 0) {
    lines.push('✅ Installation check passed');
  } else {
    lines.push('❌ Installation check failed');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
