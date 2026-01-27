/**
 * Dist Integrity Diagnostic Definition
 *
 * Checks that the dist/ directory is in sync with src/.
 * This is a pure data definition - no execution logic.
 * The DiagnosticRunner handles all execution.
 */

import { DiagnosticDefinition } from '../definition';

export const distIntegrityDiagnostic: DiagnosticDefinition = {
  id: 'dist-integrity',
  title: 'Dist Directory Integrity Check',
  description: 'Verifies that dist/ output is consistent with src/ and build configuration.',
  category: 'build',

  preconditions: [
    {
      type: 'dir_exists',
      target: 'src',
      description: 'Source directory must exist',
    },
    {
      type: 'dir_exists',
      target: 'dist',
      description: 'Dist directory must exist (run build first)',
    },
    {
      type: 'file_exists',
      target: 'tsconfig.json',
      description: 'TypeScript configuration must exist',
    },
  ],

  steps: [
    {
      id: 'list-src-ts',
      label: 'List TypeScript source files',
      action: {
        type: 'glob',
        pattern: 'src/**/*.ts',
      },
    },
    {
      id: 'list-dist-js',
      label: 'List compiled JavaScript files',
      action: {
        type: 'glob',
        pattern: 'dist/**/*.js',
      },
    },
    {
      id: 'list-dist-dts',
      label: 'List type declaration files',
      action: {
        type: 'glob',
        pattern: 'dist/**/*.d.ts',
      },
    },
    {
      id: 'list-dist-maps',
      label: 'List source map files',
      action: {
        type: 'glob',
        pattern: 'dist/**/*.js.map',
      },
    },
    {
      id: 'check-package-main',
      label: 'Check package.json main entry',
      action: {
        type: 'read_file',
        path: 'package.json',
      },
    },
    {
      id: 'git-status-dist',
      label: 'Check git status of dist/',
      action: {
        type: 'exec',
        command: 'git status --porcelain dist/',
        timeout: 10000,
      },
    },
  ],

  assertions: [
    {
      stepId: 'list-src-ts',
      type: 'not_empty',
      severity: 'error',
      message: 'Source directory should contain TypeScript files',
    },
    {
      stepId: 'list-dist-js',
      type: 'not_empty',
      severity: 'error',
      message: 'Dist directory should contain compiled JavaScript files',
    },
    {
      stepId: 'list-dist-dts',
      type: 'not_empty',
      severity: 'error',
      message: 'Dist directory should contain type declaration files',
    },
    {
      stepId: 'list-dist-maps',
      type: 'not_empty',
      severity: 'warning',
      message: 'Dist directory should contain source map files',
    },
    {
      stepId: 'check-package-main',
      type: 'contains',
      expected: '"main"',
      severity: 'warning',
      message: 'package.json should have a main entry point',
    },
  ],

  artifacts: [
    {
      label: 'Source file list',
      source: 'step_output',
      ref: 'list-src-ts',
    },
    {
      label: 'Dist file list',
      source: 'step_output',
      ref: 'list-dist-js',
    },
    {
      label: 'Git status of dist/',
      source: 'step_output',
      ref: 'git-status-dist',
    },
  ],
};
