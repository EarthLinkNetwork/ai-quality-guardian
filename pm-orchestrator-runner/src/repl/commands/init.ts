/**
 * /init Command Handler
 * Creates .claude/ scaffold in target project
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Result of init command
 */
export interface InitResult {
  success: boolean;
  message: string;
  createdPaths?: string[];
  existingFiles?: string[];  // Per spec 10_REPL_UX.md L98: list existing files on ERROR
}

/**
 * Default CLAUDE.md template
 */
const DEFAULT_CLAUDE_MD = `# Project Configuration

This project uses PM Orchestrator for AI-assisted development.

## Project Overview

[Add your project description here]

## Development Guidelines

- Follow the established coding standards
- Write tests for new functionality
- Document significant changes

## Task Categories

- READ_INFO: Information gathering, code analysis
- LIGHT_EDIT: Small changes, bug fixes
- IMPLEMENTATION: New features, significant changes
- REVIEW_RESPONSE: Code review responses
- CONFIG_CI_CHANGE: Configuration and CI/CD changes
- DANGEROUS_OP: Destructive operations requiring confirmation
`;

/**
 * Default settings.json template
 */
const DEFAULT_SETTINGS = {
  project: {
    name: '',
    version: '1.0.0',
  },
  pm: {
    autoStart: false,
    defaultModel: 'claude-sonnet-4-20250514',
  },
  executor: {
    maxRetries: 3,
    timeoutMs: 300000,
    checkIntervalMs: 5000,
  },
};

/**
 * Default pm-orchestrator agent template
 */
const DEFAULT_PM_ORCHESTRATOR_AGENT = `# PM Orchestrator Agent

This agent orchestrates task execution across sub-agents.

## Responsibilities

- Task type classification
- Sub-agent coordination
- Result aggregation

## Task Types

| Type | Description |
|------|-------------|
| READ_INFO | Read-only operations |
| LIGHT_EDIT | Minor edits |
| IMPLEMENTATION | Feature implementation |
| REVIEW_RESPONSE | PR review responses |
| CONFIG_CI_CHANGE | Config changes |
| DANGEROUS_OP | Destructive operations |
`;

/**
 * Default rules template
 */
const DEFAULT_RULES = `# Project Rules

## Code Quality

- All code must pass linting
- Test coverage required for new features
- Type safety is mandatory

## Git Workflow

- Feature branches required
- PR review before merge
- Descriptive commit messages
`;

/**
 * Init command handler
 */
export class InitCommand {
  /**
   * Execute init command
   * Per spec 10_REPL_UX.md L96-99:
   * - Check ALL files BEFORE creating any
   * - If ANY exist, return ERROR with list of existing files
   * - Only create if NONE exist
   */
  async execute(targetPath: string): Promise<InitResult> {
    const absolutePath = path.resolve(targetPath);

    // Verify target directory exists
    if (!fs.existsSync(absolutePath)) {
      return {
        success: false,
        message: `Directory does not exist: ${absolutePath}`,
      };
    }

    const claudeDir = path.join(absolutePath, '.claude');
    const agentsDir = path.join(claudeDir, 'agents');
    const rulesDir = path.join(claudeDir, 'rules');

    // Define all paths that will be created
    const pathsToCreate = {
      '.claude/': claudeDir,
      '.claude/CLAUDE.md': path.join(claudeDir, 'CLAUDE.md'),
      '.claude/settings.json': path.join(claudeDir, 'settings.json'),
      '.claude/agents/': agentsDir,
      '.claude/agents/pm-orchestrator.md': path.join(agentsDir, 'pm-orchestrator.md'),
      '.claude/rules/': rulesDir,
      '.claude/rules/project-rules.md': path.join(rulesDir, 'project-rules.md'),
    };

    // Per spec L97-98: Check ALL files BEFORE creating any
    // If any exist, return ERROR with list
    const existingFiles: string[] = [];
    for (const [name, fullPath] of Object.entries(pathsToCreate)) {
      if (fs.existsSync(fullPath)) {
        existingFiles.push(name);
      }
    }

    // Per spec L98: "存在する場合は ERROR（どれが存在しているかを明示）として停止する"
    if (existingFiles.length > 0) {
      return {
        success: false,
        message: `Cannot initialize: files already exist: ${existingFiles.join(', ')}`,
        existingFiles,
      };
    }

    // Per spec L97: Only create if NONE exist
    const createdPaths: string[] = [];

    try {
      // Create .claude directory
      fs.mkdirSync(claudeDir, { recursive: true });
      createdPaths.push(claudeDir);

      // Create CLAUDE.md
      const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');
      fs.writeFileSync(claudeMdPath, DEFAULT_CLAUDE_MD, 'utf-8');
      createdPaths.push(claudeMdPath);

      // Create settings.json
      const settingsPath = path.join(claudeDir, 'settings.json');
      const settings = {
        ...DEFAULT_SETTINGS,
        project: {
          ...DEFAULT_SETTINGS.project,
          name: path.basename(absolutePath),
        },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      createdPaths.push(settingsPath);

      // Create agents directory
      fs.mkdirSync(agentsDir, { recursive: true });
      createdPaths.push(agentsDir);

      // Create pm-orchestrator.md
      const pmOrchestratorPath = path.join(agentsDir, 'pm-orchestrator.md');
      fs.writeFileSync(pmOrchestratorPath, DEFAULT_PM_ORCHESTRATOR_AGENT, 'utf-8');
      createdPaths.push(pmOrchestratorPath);

      // Create rules directory
      fs.mkdirSync(rulesDir, { recursive: true });
      createdPaths.push(rulesDir);

      // Create default rules
      const rulesPath = path.join(rulesDir, 'project-rules.md');
      fs.writeFileSync(rulesPath, DEFAULT_RULES, 'utf-8');
      createdPaths.push(rulesPath);

      return {
        success: true,
        message: `Initialized .claude/ with ${createdPaths.length} files/directories`,
        createdPaths,
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to initialize: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Check if a directory is already initialized
   */
  isInitialized(targetPath: string): boolean {
    const claudeDir = path.join(path.resolve(targetPath), '.claude');
    return fs.existsSync(claudeDir);
  }
}
