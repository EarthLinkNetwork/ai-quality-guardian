/**
 * Skill Auto-Generator
 *
 * Scans a project directory and generates Claude Code Skills
 * based on detected technology stack, configuration, and structure.
 *
 * Generated skills follow the Claude Code Skills format:
 * .claude/skills/<name>/SKILL.md
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProjectScanResult {
  /** Detected package manager */
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip' | 'cargo' | 'go' | 'unknown';
  /** Detected frameworks */
  frameworks: string[];
  /** Detected cloud services */
  cloudServices: string[];
  /** Environment variables found */
  envVars: string[];
  /** Has Docker */
  hasDocker: boolean;
  /** Has CI/CD */
  hasCi: boolean;
  /** Detected test framework */
  testFramework: string | null;
  /** Database type */
  database: string | null;
  /** Project language */
  language: 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'unknown';
  /** Protected resources detected */
  protectedResources: string[];
}

export interface GeneratedSkill {
  name: string;
  directory: string;
  skillMdContent: string;
  supportingFiles: Array<{ name: string; content: string }>;
}

/**
 * Scan a project directory and detect its technology stack
 */
export function scanProject(projectPath: string): ProjectScanResult {
  const result: ProjectScanResult = {
    packageManager: 'unknown',
    frameworks: [],
    cloudServices: [],
    envVars: [],
    hasDocker: false,
    hasCi: false,
    testFramework: null,
    database: null,
    language: 'unknown',
    protectedResources: [],
  };

  // Package manager detection
  if (fileExists(projectPath, 'package.json')) {
    result.language = fileExists(projectPath, 'tsconfig.json') ? 'typescript' : 'javascript';
    if (fileExists(projectPath, 'pnpm-lock.yaml')) result.packageManager = 'pnpm';
    else if (fileExists(projectPath, 'yarn.lock')) result.packageManager = 'yarn';
    else result.packageManager = 'npm';

    // Parse package.json for frameworks
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
      const allDeps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

      if (allDeps['next']) result.frameworks.push('Next.js');
      if (allDeps['react']) result.frameworks.push('React');
      if (allDeps['vue']) result.frameworks.push('Vue');
      if (allDeps['express']) result.frameworks.push('Express');
      if (allDeps['fastify']) result.frameworks.push('Fastify');
      if (allDeps['@nestjs/core']) result.frameworks.push('NestJS');
      if (allDeps['nuxt']) result.frameworks.push('Nuxt');
      if (allDeps['svelte'] || allDeps['@sveltejs/kit']) result.frameworks.push('SvelteKit');

      // Cloud services
      if (allDeps['@aws-sdk/client-dynamodb'] || allDeps['aws-sdk']) result.cloudServices.push('AWS');
      if (allDeps['@google-cloud/storage'] || allDeps['firebase']) result.cloudServices.push('GCP');
      if (allDeps['@azure/storage-blob']) result.cloudServices.push('Azure');
      if (allDeps['@aws-amplify/backend']) result.cloudServices.push('AWS Amplify');

      // Test framework
      if (allDeps['jest']) result.testFramework = 'jest';
      else if (allDeps['mocha']) result.testFramework = 'mocha';
      else if (allDeps['vitest']) result.testFramework = 'vitest';
      else if (allDeps['playwright']) result.testFramework = 'playwright';

      // Database
      if (allDeps['prisma'] || allDeps['@prisma/client']) result.database = 'prisma';
      else if (allDeps['mongoose']) result.database = 'mongodb';
      else if (allDeps['pg']) result.database = 'postgresql';
      else if (allDeps['mysql2']) result.database = 'mysql';
      else if (allDeps['better-sqlite3']) result.database = 'sqlite';
    } catch {
      /* ignore parse errors */
    }
  } else if (fileExists(projectPath, 'requirements.txt') || fileExists(projectPath, 'pyproject.toml')) {
    result.language = 'python';
    result.packageManager = 'pip';
  } else if (fileExists(projectPath, 'Cargo.toml')) {
    result.language = 'rust';
    result.packageManager = 'cargo';
  } else if (fileExists(projectPath, 'go.mod')) {
    result.language = 'go';
    result.packageManager = 'go';
  }

  // Docker
  result.hasDocker = fileExists(projectPath, 'Dockerfile')
    || fileExists(projectPath, 'docker-compose.yml')
    || fileExists(projectPath, 'docker-compose.yaml');

  // CI/CD
  result.hasCi = dirExists(projectPath, '.github/workflows')
    || fileExists(projectPath, '.gitlab-ci.yml')
    || fileExists(projectPath, 'Jenkinsfile')
    || fileExists(projectPath, 'amplify.yml');

  // Environment variables
  for (const envFile of ['.env.example', '.env.template', '.env.sample']) {
    if (fileExists(projectPath, envFile)) {
      try {
        const content = fs.readFileSync(path.join(projectPath, envFile), 'utf-8');
        const vars = content.split('\n')
          .filter((line: string) => line.trim() && !line.startsWith('#'))
          .map((line: string) => line.split('=')[0].trim())
          .filter((v: string) => v.length > 0);
        result.envVars = vars;
      } catch {
        /* ignore */
      }
      break;
    }
  }

  // Protected resources
  if (fileExists(projectPath, '.env')) result.protectedResources.push('.env');
  if (fileExists(projectPath, '.env.local')) result.protectedResources.push('.env.local');
  if (fileExists(projectPath, '.env.production')) result.protectedResources.push('.env.production');

  // Check for AWS config
  if (fileExists(projectPath, 'amplify.yml') || dirExists(projectPath, 'amplify')) {
    result.cloudServices.push('AWS Amplify');
    result.protectedResources.push('amplify.yml');
  }
  if (dirExists(projectPath, 'cdk.out') || fileExists(projectPath, 'cdk.json')) {
    result.cloudServices.push('AWS CDK');
  }

  return result;
}

/**
 * Generate skills based on scan results
 */
export function generateSkills(projectPath: string, scanResult: ProjectScanResult): GeneratedSkill[] {
  const skills: GeneratedSkill[] = [];

  // 1. Project conventions skill (always generated)
  skills.push(generateConventionsSkill(projectPath, scanResult));

  // 2. Test skill (if test framework detected)
  if (scanResult.testFramework) {
    skills.push(generateTestSkill(scanResult));
  }

  // 3. Deploy skill (if CI/CD or cloud detected)
  if (scanResult.hasCi || scanResult.cloudServices.length > 0) {
    skills.push(generateDeploySkill(scanResult));
  }

  // 4. Safety skill (if protected resources detected)
  if (scanResult.protectedResources.length > 0 || scanResult.cloudServices.length > 0) {
    skills.push(generateProjectSafetySkill(scanResult));
  }

  return skills;
}

/**
 * Write generated skills to the project's .claude/skills/ directory
 */
export function writeSkills(projectPath: string, skills: GeneratedSkill[]): string[] {
  const written: string[] = [];
  const skillsBase = path.join(projectPath, '.claude', 'skills');

  for (const skill of skills) {
    const skillDir = path.join(skillsBase, skill.name);
    fs.mkdirSync(skillDir, { recursive: true });

    const skillPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillPath, skill.skillMdContent);
    written.push(skillPath);

    for (const file of skill.supportingFiles) {
      const filePath = path.join(skillDir, file.name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content);
      written.push(filePath);
    }
  }

  return written;
}

// --- Skill generators ---

function generateConventionsSkill(_projectPath: string, scan: ProjectScanResult): GeneratedSkill {
  const lines: string[] = [];
  lines.push('---');
  lines.push('name: project-conventions');
  lines.push('description: Project coding conventions, tech stack, and development patterns. Auto-loaded when writing or reviewing code.');
  lines.push('user-invocable: false');
  lines.push('---');
  lines.push('');
  lines.push('# Project Conventions');
  lines.push('');
  lines.push(`- Language: ${scan.language}`);
  lines.push(`- Package manager: ${scan.packageManager}`);
  if (scan.frameworks.length > 0) lines.push(`- Frameworks: ${scan.frameworks.join(', ')}`);
  if (scan.database) lines.push(`- Database: ${scan.database}`);
  if (scan.testFramework) lines.push(`- Test framework: ${scan.testFramework}`);
  lines.push('');
  lines.push('## Rules');
  lines.push('- Follow existing code patterns in this project');
  lines.push('- Use the project\'s package manager for dependency management');
  if (scan.testFramework) lines.push(`- Write tests using ${scan.testFramework}`);
  if (scan.language === 'typescript') lines.push('- Maintain strict TypeScript types, avoid `any`');

  return {
    name: 'project-conventions',
    directory: '.claude/skills/project-conventions',
    skillMdContent: lines.join('\n'),
    supportingFiles: [],
  };
}

function generateTestSkill(scan: ProjectScanResult): GeneratedSkill {
  const lines: string[] = [];
  lines.push('---');
  lines.push('name: test');
  lines.push(`description: Run and write tests using ${scan.testFramework}. Invoked when testing or writing test files.`);
  lines.push('---');
  lines.push('');
  lines.push('# Test Guidelines');
  lines.push('');
  lines.push(`Test framework: ${scan.testFramework}`);
  lines.push('');

  let runCmd: string;
  if (scan.packageManager === 'pnpm') runCmd = 'pnpm test';
  else if (scan.packageManager === 'yarn') runCmd = 'yarn test';
  else runCmd = 'npm test';

  lines.push(`Run tests: \`${runCmd}\``);
  lines.push('');
  lines.push('## Rules');
  lines.push('- Write tests BEFORE implementation (TDD)');
  lines.push('- Do NOT read implementation source when writing tests (prevent tautological tests)');
  lines.push('- Base tests on specifications and requirements');
  lines.push('- Include edge cases and error scenarios');
  lines.push('- Each test should have a clear description referencing the requirement');

  return {
    name: 'test',
    directory: '.claude/skills/test',
    skillMdContent: lines.join('\n'),
    supportingFiles: [],
  };
}

function generateDeploySkill(scan: ProjectScanResult): GeneratedSkill {
  const lines: string[] = [];
  lines.push('---');
  lines.push('name: deploy');
  lines.push('description: Deployment procedures and checks. Use when deploying or discussing deployment.');
  lines.push('disable-model-invocation: true');
  lines.push('---');
  lines.push('');
  lines.push('# Deployment');
  lines.push('');
  if (scan.cloudServices.length > 0) {
    lines.push(`Cloud services: ${scan.cloudServices.join(', ')}`);
  }
  lines.push('');
  lines.push('## Pre-deployment checklist');
  lines.push('1. All tests pass');
  lines.push('2. Build succeeds');
  lines.push('3. No lint errors');
  if (scan.envVars.length > 0) {
    lines.push('4. Environment variables verified');
  }
  lines.push('');
  lines.push('## CAUTION');
  lines.push('- Never deploy without running tests first');
  lines.push('- Verify target environment before deploying');
  if (scan.cloudServices.includes('AWS') || scan.cloudServices.includes('AWS Amplify')) {
    lines.push('- Verify AWS account/profile before any AWS operations');
  }

  return {
    name: 'deploy',
    directory: '.claude/skills/deploy',
    skillMdContent: lines.join('\n'),
    supportingFiles: [],
  };
}

function generateProjectSafetySkill(scan: ProjectScanResult): GeneratedSkill {
  const lines: string[] = [];
  lines.push('---');
  lines.push('name: project-safety');
  lines.push('description: Project-specific safety rules. Protects critical files and cloud resources from accidental deletion or modification.');
  lines.push('user-invocable: false');
  lines.push('---');
  lines.push('');
  lines.push('# Project Safety Rules');
  lines.push('');
  if (scan.protectedResources.length > 0) {
    lines.push('## Protected Files (NEVER delete without user confirmation)');
    for (const r of scan.protectedResources) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }
  if (scan.cloudServices.length > 0) {
    lines.push('## Cloud Resources');
    lines.push('This project uses: ' + scan.cloudServices.join(', '));
    lines.push('');
    lines.push('**Before ANY cloud resource deletion:**');
    lines.push('1. Verify the correct account/profile is being used');
    lines.push('2. Confirm the resource belongs to THIS project');
    lines.push('3. Ask the user for explicit confirmation');
    lines.push('');
  }
  if (scan.envVars.length > 0) {
    lines.push('## Environment Variables');
    lines.push('Known variables: ' + scan.envVars.slice(0, 10).join(', '));
    lines.push('');
  }

  return {
    name: 'project-safety',
    directory: '.claude/skills/project-safety',
    skillMdContent: lines.join('\n'),
    supportingFiles: [],
  };
}

// --- Helpers ---

function fileExists(dir: string, file: string): boolean {
  try { return fs.existsSync(path.join(dir, file)); } catch { return false; }
}

function dirExists(dir: string, subdir: string): boolean {
  try {
    const p = path.join(dir, subdir);
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch { return false; }
}
