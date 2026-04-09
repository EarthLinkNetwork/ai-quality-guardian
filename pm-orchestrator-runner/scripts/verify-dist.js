#!/usr/bin/env node
/**
 * Post-build verification: ensures dist/web/public/index.html
 * is up-to-date and contains expected render functions.
 *
 * Fails the build if:
 *  - dist/web/public/index.html is missing
 *  - Expected render functions are absent
 *  - "Coming Soon" placeholder text appears for Commands/Agents pages
 *  - A nested dist/web/public/public/ directory exists (cp -r bug)
 */

const fs = require('fs');
const path = require('path');

const distHtml = path.join(__dirname, '..', 'dist', 'web', 'public', 'index.html');
const nestedDir = path.join(__dirname, '..', 'dist', 'web', 'public', 'public');

let failures = 0;

function fail(msg) {
  console.error(`  FAIL: ${msg}`);
  failures++;
}

function pass(msg) {
  console.log(`  OK: ${msg}`);
}

console.log('verify-dist: checking dist/web/public/index.html ...');

// 1. File must exist
if (!fs.existsSync(distHtml)) {
  fail('dist/web/public/index.html does not exist');
  process.exit(1);
}
pass('dist/web/public/index.html exists');

// 2. No nested public/ directory (cp -r nesting bug)
if (fs.existsSync(nestedDir)) {
  fail('dist/web/public/public/ exists — cp -r nesting bug detected');
}

const content = fs.readFileSync(distHtml, 'utf8');

// 3. Expected render functions must be present
const requiredFunctions = [
  'renderCommandsPage',
  'renderAgentsPage',
  'renderHooksPage',
  'renderCommandsContent',
  'renderAgentsContent',
  'renderHooksContent',
];

for (const fn of requiredFunctions) {
  if (content.includes(`function ${fn}`)) {
    pass(`contains function ${fn}`);
  } else {
    fail(`missing function ${fn}`);
  }
}

// 4. Commands/Agents pages must NOT have "Coming Soon" placeholder cards
//    (The Backup page is allowed to have it, so we check specifically for
//     the old placeholder patterns)
const forbiddenPatterns = [
  { pattern: 'renderCommandsPage() {\n      app.innerHTML = `\n        <div class="page-header">\n          <h2>Commands</h2>\n          <span class="coming-soon-badge">', label: 'Commands page "Coming Soon" card' },
  { pattern: 'renderAgentsPage() {\n      app.innerHTML = `\n        <div class="page-header">\n          <h2>Agents</h2>\n          <span class="coming-soon-badge">', label: 'Agents page "Coming Soon" card' },
];

for (const { pattern, label } of forbiddenPatterns) {
  if (content.includes(pattern)) {
    fail(`${label} detected — dist has stale placeholder UI`);
  } else {
    pass(`no ${label}`);
  }
}

// 5. Commands/Agents should use CRUD API endpoints (not placeholders)
const expectedApiCalls = [
  { pattern: "/api/claude-files/commands/", label: 'Commands API call' },
  { pattern: "/api/claude-files/agents/", label: 'Agents API call' },
  { pattern: "/api/claude-hooks/", label: 'Hooks API call' },
];

for (const { pattern, label } of expectedApiCalls) {
  if (content.includes(pattern)) {
    pass(`contains ${label}`);
  } else {
    fail(`missing ${label}`);
  }
}

// 6. src and dist line count should match
const srcHtml = path.join(__dirname, '..', 'src', 'web', 'public', 'index.html');
if (fs.existsSync(srcHtml)) {
  const srcLines = fs.readFileSync(srcHtml, 'utf8').split('\n').length;
  const distLines = content.split('\n').length;
  if (srcLines === distLines) {
    pass(`line count matches src (${srcLines})`);
  } else {
    fail(`line count mismatch: src=${srcLines} dist=${distLines}`);
  }
}

// Check 8: All 15 page renderer functions exist
const pageRenderers = [
  'renderDashboard', 'renderProjectList', 'renderTaskGroupList', 'renderActivity',
  'renderAssistantPage', 'renderHooksPage', 'renderCommandsPage', 'renderAgentsPage',
  'renderPluginsPage', 'renderMcpServersPage', 'renderBackupPage',
  'renderTaskTrackerPage', 'renderPRReviewsPage', 'renderLogsPage', 'renderSettingsPage',
];
for (const fn of pageRenderers) {
  if (content.includes(fn)) {
    pass(`contains renderer: ${fn}`);
  } else {
    fail(`missing renderer: ${fn}`);
  }
}

// Check 9: Delete navigation goes to /task-groups (not /)
const deleteNavPattern = "navigate('/task-groups')";
const deleteNavCount = (content.match(/navigate\('\/task-groups'\)/g) || []).length;
if (deleteNavCount >= 2) {
  pass(`delete navigation to /task-groups present (${deleteNavCount} occurrences)`);
} else {
  fail(`delete navigation to /task-groups missing or insufficient (found: ${deleteNavCount}, need: >= 2)`);
}

console.log('');
if (failures > 0) {
  console.error(`verify-dist: ${failures} failure(s) — build is invalid`);
  process.exit(1);
} else {
  console.log('verify-dist: all checks passed');
}
