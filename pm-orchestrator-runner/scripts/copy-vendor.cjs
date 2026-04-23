#!/usr/bin/env node
/**
 * Copy vendor JS (marked, dompurify) from node_modules into
 * src/web/public/vendor/ (for dev) and dist/web/public/vendor/ (for build).
 *
 * Why vendored?
 *   The web UI is a static SPA served from public/. There is no module bundler.
 *   We pin upstream versions in package.json and copy the UMD/min builds so the
 *   browser can <script src="/vendor/..."> without a network fetch.
 *
 * Run order:
 *   - Standalone: `node scripts/copy-vendor.cjs`
 *   - Postbuild:  invoked from package.json `postbuild`
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_VENDOR = path.join(ROOT, 'src', 'web', 'public', 'vendor');
const DIST_VENDOR = path.join(ROOT, 'dist', 'web', 'public', 'vendor');

const ASSETS = [
  {
    name: 'marked.umd.js',
    from: path.join(ROOT, 'node_modules', 'marked', 'lib', 'marked.umd.js'),
  },
  {
    name: 'purify.min.js',
    from: path.join(ROOT, 'node_modules', 'dompurify', 'dist', 'purify.min.js'),
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyTo(targetDir) {
  ensureDir(targetDir);
  for (const asset of ASSETS) {
    if (!fs.existsSync(asset.from)) {
      throw new Error(`[copy-vendor] missing source: ${asset.from}`);
    }
    const dest = path.join(targetDir, asset.name);
    fs.copyFileSync(asset.from, dest);
    const size = fs.statSync(dest).size;
    console.log(`[copy-vendor] ${asset.name} -> ${dest} (${size} bytes)`);
  }
}

function main() {
  copyTo(SRC_VENDOR);
  if (fs.existsSync(path.join(ROOT, 'dist', 'web', 'public'))) {
    copyTo(DIST_VENDOR);
  } else {
    console.log('[copy-vendor] dist/web/public not present; skipping dist copy');
  }
}

main();
