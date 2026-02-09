#!/usr/bin/env ts-node
/**
 * Directory Import Gate Check
 *
 * Prevents ESM directory import errors by detecting forbidden patterns.
 * These cause ERR_UNSUPPORTED_DIR_IMPORT in ESM execution.
 *
 * Forbidden patterns:
 * - from 'path/to/directory' (without /index)
 * - from '../supervisor' instead of '../supervisor/index'
 */

import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Directories that have index.ts and should never be imported as directories
const INDEXED_DIRS = [
  'src/supervisor',
  'src/queue',
  'src/web',
  'src/core',
  'src/cli',
];

// Files to scan
const SCAN_PATTERNS = [
  'src/**/*.ts',
  'test/**/*.ts',
];

interface Violation {
  file: string;
  line: number;
  content: string;
  pattern: string;
}

function findTsFiles(dir: string, pattern: string): string[] {
  const files: string[] = [];
  const parts = pattern.split('/');

  function scan(currentDir: string, patternIndex: number) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (patternIndex >= parts.length) continue;

      const currentPattern = parts[patternIndex];

      if (currentPattern === '**') {
        // Recursive match
        if (entry.isDirectory()) {
          scan(fullPath, patternIndex); // Stay at **
          scan(fullPath, patternIndex + 1); // Move past **
        } else if (entry.isFile()) {
          const remaining = parts.slice(patternIndex + 1).join('/');
          if (matchGlob(entry.name, remaining) || remaining === '') {
            files.push(fullPath);
          }
        }
      } else if (entry.isDirectory() && matchGlob(entry.name, currentPattern)) {
        scan(fullPath, patternIndex + 1);
      } else if (entry.isFile() && patternIndex === parts.length - 1 && matchGlob(entry.name, currentPattern)) {
        files.push(fullPath);
      }
    }
  }

  scan(dir, 0);
  return files;
}

function matchGlob(name: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === '*.ts') return name.endsWith('.ts');
  if (pattern.startsWith('*.')) return name.endsWith(pattern.slice(1));
  return name === pattern;
}

function getAllTsFiles(): string[] {
  const allFiles: string[] = [];

  for (const pattern of SCAN_PATTERNS) {
    const files = findTsFiles(PROJECT_ROOT, pattern);
    allFiles.push(...files);
  }

  // Remove duplicates and filter out dist/
  return [...new Set(allFiles)].filter(f => !f.includes('/dist/') && !f.includes('/node_modules/'));
}

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const relPath = path.relative(PROJECT_ROOT, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Check for import statements
    const importMatch = line.match(/from\s+['"]([^'"]+)['"]/);
    if (!importMatch) continue;

    const importPath = importMatch[1];

    // Check each indexed directory
    for (const indexedDir of INDEXED_DIRS) {
      // Get the directory name (e.g., 'supervisor' from 'src/supervisor')
      const dirName = path.basename(indexedDir);

      // Pattern: ends with /dirName but not /dirName/index or /dirName/something
      // Forbidden: '../supervisor', '../../src/supervisor'
      // Allowed: '../supervisor/index', '../supervisor/config-loader'

      const patterns = [
        new RegExp(`['"]\\.\\./${dirName}['"]`), // '../supervisor'
        new RegExp(`['"]\\.\\.\\./src/${dirName}['"]`), // '../../src/supervisor'
        new RegExp(`['"]\\.\\.\\./\\.\\./${dirName}['"]`), // '../../supervisor'
        new RegExp(`/${dirName}['"]$`), // ends with /supervisor'
      ];

      for (const pattern of patterns) {
        if (pattern.test(line)) {
          // Make sure it's not already using /index
          if (!importPath.includes(`/${dirName}/`)) {
            violations.push({
              file: relPath,
              line: i + 1,
              content: line.trim(),
              pattern: `Directory import of '${dirName}' - use '${dirName}/index' instead`,
            });
            break;
          }
        }
      }
    }
  }

  return violations;
}

function main() {
  console.log('\n=== Directory Import Gate Check ===\n');

  const files = getAllTsFiles();
  console.log(`Scanning ${files.length} TypeScript files...`);

  const allViolations: Violation[] = [];

  for (const file of files) {
    const violations = checkFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    console.log('\n[FAIL] Directory imports detected:\n');
    for (const v of allViolations) {
      console.log(`  ${v.file}:${v.line}`);
      console.log(`    ${v.content}`);
      console.log(`    Problem: ${v.pattern}\n`);
    }
    console.log(`\nTotal violations: ${allViolations.length}`);
    console.log('\nFix by changing directory imports to explicit /index imports.');
    console.log('Example: from "../supervisor" → from "../supervisor/index"\n');
    process.exit(1);
  }

  console.log('[PASS] No directory imports found');
  console.log(`\nOverall: ALL PASS\n`);
}

main();
