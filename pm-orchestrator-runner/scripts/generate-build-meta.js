#!/usr/bin/env node
/**
 * Generate build-meta.json after TypeScript compilation.
 *
 * Writes dist/build-meta.json with:
 *   - build_sha: git short SHA (or "build-<epoch>" if not a git repo)
 *   - build_timestamp: ISO-8601
 *   - git_sha: same as build_sha when available
 *   - git_branch: current branch name
 *
 * Called automatically via the "postbuild" npm script so that
 * /api/health always returns a valid build_sha, even without
 * ProcessSupervisor.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const outPath = path.join(distDir, 'build-meta.json');

let gitSha;
let gitBranch;

try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch {
  // not a git repo or git unavailable
}

try {
  gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
} catch {
  // ignore
}

const meta = {
  build_sha: gitSha || `build-${Date.now()}`,
  build_timestamp: new Date().toISOString(),
  git_sha: gitSha || undefined,
  git_branch: gitBranch || undefined,
};

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

fs.writeFileSync(outPath, JSON.stringify(meta, null, 2) + '\n');

// eslint-disable-next-line no-console
console.log(`build-meta.json written: ${meta.build_sha} (${meta.build_timestamp})`);
