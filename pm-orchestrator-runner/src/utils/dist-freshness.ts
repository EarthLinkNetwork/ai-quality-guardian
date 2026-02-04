/**
 * Dist Freshness Check Utility
 *
 * Ensures dist/ is up-to-date with src/ before web server starts.
 * Auto-builds if src is newer than dist.
 *
 * Per PM Orchestrator design: no manual user intervention required.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface FreshnessResult {
  fresh: boolean;
  srcLatest?: number;
  distLatest?: number;
  rebuilt: boolean;
  error?: string;
}

/**
 * Get the latest modification time of all TypeScript files in a directory
 */
function getLatestMtime(dir: string, extensions: string[]): number {
  let latest = 0;

  function walk(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        // Skip node_modules, .git, dist, etc.
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', '.tmp', 'coverage'].includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs > latest) {
              latest = stat.mtimeMs;
            }
          }
        }
      }
    } catch (e) {
      // Ignore permission errors, etc.
    }
  }

  walk(dir);
  return latest;
}

/**
 * Check if dist is fresh (up-to-date with src)
 *
 * Returns true if dist exists and is newer than all src files.
 */
export function checkDistFreshness(projectRoot: string): { fresh: boolean; srcLatest: number; distLatest: number } {
  const srcDir = path.join(projectRoot, 'src');
  const distDir = path.join(projectRoot, 'dist');

  // If dist doesn't exist, not fresh
  if (!fs.existsSync(distDir)) {
    return { fresh: false, srcLatest: Date.now(), distLatest: 0 };
  }

  // Get latest mtime from src (TypeScript files)
  const srcLatest = getLatestMtime(srcDir, ['.ts', '.tsx']);

  // Get latest mtime from dist (JavaScript files)
  const distLatest = getLatestMtime(distDir, ['.js', '.d.ts']);

  // Fresh if dist is newer than src
  return {
    fresh: distLatest >= srcLatest,
    srcLatest,
    distLatest,
  };
}

/**
 * Ensure dist is fresh before web server starts.
 * If not fresh, automatically rebuild.
 *
 * @param projectRoot - Project root directory
 * @param options - Options for rebuild behavior
 * @returns FreshnessResult with rebuild status
 */
export function ensureDistFresh(
  projectRoot: string,
  options: { silent?: boolean; copyPublic?: boolean } = {}
): FreshnessResult {
  const { silent = false, copyPublic = true } = options;

  const freshness = checkDistFreshness(projectRoot);

  if (freshness.fresh) {
    return {
      fresh: true,
      srcLatest: freshness.srcLatest,
      distLatest: freshness.distLatest,
      rebuilt: false,
    };
  }

  // Auto-rebuild
  if (!silent) {
    console.log('[dist-freshness] src is newer than dist, rebuilding...');
    console.log(`[dist-freshness] src latest: ${new Date(freshness.srcLatest).toISOString()}`);
    console.log(`[dist-freshness] dist latest: ${new Date(freshness.distLatest).toISOString()}`);
  }

  try {
    // Run build
    execSync('npm run build', {
      cwd: projectRoot,
      stdio: silent ? 'pipe' : 'inherit',
    });

    // Copy public files if needed
    if (copyPublic) {
      const publicSrc = path.join(projectRoot, 'src/web/public');
      const publicDest = path.join(projectRoot, 'dist/web/public');

      if (fs.existsSync(publicSrc)) {
        // Ensure parent directory exists
        fs.mkdirSync(path.dirname(publicDest), { recursive: true });

        // Use cp -r for simplicity
        execSync(`cp -r "${publicSrc}" "${path.dirname(publicDest)}/"`, {
          cwd: projectRoot,
          stdio: 'pipe',
        });

        if (!silent) {
          console.log('[dist-freshness] Copied public files to dist/web/');
        }
      }
    }

    if (!silent) {
      console.log('[dist-freshness] Rebuild complete');
    }

    // Verify rebuild succeeded
    const postBuildFreshness = checkDistFreshness(projectRoot);

    return {
      fresh: postBuildFreshness.fresh,
      srcLatest: postBuildFreshness.srcLatest,
      distLatest: postBuildFreshness.distLatest,
      rebuilt: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!silent) {
      console.error('[dist-freshness] Rebuild failed:', errorMessage);
    }

    return {
      fresh: false,
      srcLatest: freshness.srcLatest,
      distLatest: freshness.distLatest,
      rebuilt: false,
      error: errorMessage,
    };
  }
}

/**
 * Quick check if public files are copied to dist
 */
export function checkPublicFilesCopied(projectRoot: string): boolean {
  const indexHtml = path.join(projectRoot, 'dist/web/public/index.html');
  return fs.existsSync(indexHtml);
}
