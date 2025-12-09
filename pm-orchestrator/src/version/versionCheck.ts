/**
 * Version Check Module
 * NPM パッケージの最新バージョンをチェックし、更新を提案する
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  isUpToDate: boolean;
  updateAvailable: boolean;
  packageName: string;
  updateCommand: string;
  checkSource: 'npm' | 'cache' | 'local_only';
  error?: string;
}

export interface VersionCheckOptions {
  skipCache?: boolean;
  cacheMaxAgeMinutes?: number;
  offline?: boolean;
}

const CACHE_FILE_NAME = '.pm-orchestrator-version-cache.json';
const DEFAULT_CACHE_MAX_AGE_MINUTES = 60;

interface VersionCache {
  latestVersion: string;
  checkedAt: string;
  packageName: string;
}

/**
 * 現在インストールされているパッケージのバージョンを取得
 */
export function getCurrentVersion(packageDir?: string): string {
  try {
    // まずローカルの package.json を確認
    const localPackageJson = packageDir
      ? path.join(packageDir, 'package.json')
      : path.join(__dirname, '..', '..', 'package.json');

    if (fs.existsSync(localPackageJson)) {
      const pkg = JSON.parse(fs.readFileSync(localPackageJson, 'utf-8'));
      return pkg.version || '0.0.0';
    }

    // node_modules 内の package.json を確認
    const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'pm-orchestrator-enhancement', 'package.json');
    if (fs.existsSync(nodeModulesPath)) {
      const pkg = JSON.parse(fs.readFileSync(nodeModulesPath, 'utf-8'));
      return pkg.version || '0.0.0';
    }

    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * NPM レジストリから最新バージョンを取得
 */
export function getLatestVersionFromNpm(packageName: string): string | null {
  try {
    const output = execSync(`npm view ${packageName} version 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * バージョンキャッシュを読み込む
 */
function readVersionCache(targetDir: string): VersionCache | null {
  try {
    const cachePath = path.join(targetDir, CACHE_FILE_NAME);
    if (!fs.existsSync(cachePath)) {
      return null;
    }
    const content = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as VersionCache;
  } catch {
    return null;
  }
}

/**
 * バージョンキャッシュを書き込む
 */
function writeVersionCache(targetDir: string, cache: VersionCache): void {
  try {
    const cachePath = path.join(targetDir, CACHE_FILE_NAME);
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // キャッシュ書き込み失敗は無視
  }
}

/**
 * キャッシュが有効かどうかをチェック
 */
function isCacheValid(cache: VersionCache, maxAgeMinutes: number): boolean {
  try {
    const checkedAt = new Date(cache.checkedAt);
    const now = new Date();
    const ageMinutes = (now.getTime() - checkedAt.getTime()) / (1000 * 60);
    return ageMinutes < maxAgeMinutes;
  } catch {
    return false;
  }
}

/**
 * セマンティックバージョンの比較
 * a > b なら 1, a < b なら -1, a === b なら 0
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.replace(/^v/, '').split('.').map(Number);
  const bParts = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || 0;
    const bPart = bParts[i] || 0;

    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }

  return 0;
}

/**
 * バージョンチェックを実行
 */
export async function checkVersion(
  targetDir: string = process.cwd(),
  options: VersionCheckOptions = {}
): Promise<VersionCheckResult> {
  const packageName = 'pm-orchestrator-enhancement';
  const currentVersion = getCurrentVersion();

  const result: VersionCheckResult = {
    currentVersion,
    latestVersion: currentVersion,
    isUpToDate: true,
    updateAvailable: false,
    packageName,
    updateCommand: `npm update ${packageName}`,
    checkSource: 'local_only'
  };

  // オフラインモードの場合はキャッシュのみ使用
  if (options.offline) {
    const cache = readVersionCache(targetDir);
    if (cache && cache.latestVersion) {
      result.latestVersion = cache.latestVersion;
      result.checkSource = 'cache';
      const comparison = compareVersions(cache.latestVersion, currentVersion);
      result.updateAvailable = comparison > 0;
      result.isUpToDate = comparison <= 0;
    }
    return result;
  }

  // キャッシュチェック
  const cacheMaxAgeMinutes = options.cacheMaxAgeMinutes ?? DEFAULT_CACHE_MAX_AGE_MINUTES;
  if (!options.skipCache) {
    const cache = readVersionCache(targetDir);
    if (cache && isCacheValid(cache, cacheMaxAgeMinutes)) {
      result.latestVersion = cache.latestVersion;
      result.checkSource = 'cache';
      const comparison = compareVersions(cache.latestVersion, currentVersion);
      result.updateAvailable = comparison > 0;
      result.isUpToDate = comparison <= 0;
      return result;
    }
  }

  // NPM から最新バージョンを取得
  const latestVersion = getLatestVersionFromNpm(packageName);

  if (latestVersion) {
    result.latestVersion = latestVersion;
    result.checkSource = 'npm';
    const comparison = compareVersions(latestVersion, currentVersion);
    result.updateAvailable = comparison > 0;
    result.isUpToDate = comparison <= 0;

    // キャッシュを更新
    writeVersionCache(targetDir, {
      latestVersion,
      checkedAt: new Date().toISOString(),
      packageName
    });
  } else {
    result.error = 'Failed to fetch latest version from npm registry';
  }

  return result;
}

/**
 * バージョンチェック結果をフォーマット
 */
export function formatVersionCheckResult(result: VersionCheckResult): string {
  const lines: string[] = [];

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('PM Orchestrator Version Check');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Package: ${result.packageName}`);
  lines.push(`Current version: ${result.currentVersion}`);
  lines.push(`Latest version: ${result.latestVersion}`);
  lines.push(`Check source: ${result.checkSource}`);
  lines.push('');

  if (result.updateAvailable) {
    lines.push('⚠️  UPDATE AVAILABLE');
    lines.push('');
    lines.push('To update, run:');
    lines.push(`  ${result.updateCommand}`);
    lines.push('');
    lines.push('Then reinstall:');
    lines.push('  npx pm-orchestrator install');
  } else {
    lines.push('✅ You are using the latest version');
  }

  if (result.error) {
    lines.push('');
    lines.push(`Note: ${result.error}`);
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

/**
 * PM Orchestrator 起動時のバージョン警告を生成
 */
export function generateStartupVersionWarning(result: VersionCheckResult): string | null {
  if (!result.updateAvailable) {
    return null;
  }

  return `
⚠️  PM Orchestrator v${result.latestVersion} is available (current: v${result.currentVersion})
   Run: npm update ${result.packageName} && npx pm-orchestrator install
`;
}
