/**
 * Skill Generator Unit Tests
 *
 * Tests for the project scanner and skill auto-generator:
 * 1. scanProject detects npm + TypeScript
 * 2. scanProject detects frameworks from package.json
 * 3. scanProject detects cloud services
 * 4. scanProject detects test framework
 * 5. scanProject detects protected resources
 * 6. generateSkills always creates conventions skill
 * 7. generateSkills creates test skill when testFramework exists
 * 8. generateSkills creates deploy skill when CI exists
 * 9. generateSkills creates project-safety when protected resources exist
 * 10. writeSkills creates files in correct locations
 * 11. Skill YAML frontmatter is valid
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  scanProject,
  generateSkills,
  writeSkills,
  ProjectScanResult,
} from '../../../src/skills/skill-generator';

describe('Skill Generator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-gen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // =====================
  // scanProject
  // =====================
  describe('scanProject', () => {
    it('detects npm + TypeScript project', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: { typescript: '^5.0.0' } })
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');

      const result = scanProject(tmpDir);
      assert.equal(result.language, 'typescript');
      assert.equal(result.packageManager, 'npm');
    });

    it('detects pnpm package manager', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');

      const result = scanProject(tmpDir);
      assert.equal(result.packageManager, 'pnpm');
    });

    it('detects yarn package manager', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');

      const result = scanProject(tmpDir);
      assert.equal(result.packageManager, 'yarn');
    });

    it('detects frameworks from package.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { next: '^14.0.0', react: '^18.0.0', express: '^4.0.0' },
          devDependencies: {},
        })
      );

      const result = scanProject(tmpDir);
      assert.ok(result.frameworks.includes('Next.js'));
      assert.ok(result.frameworks.includes('React'));
      assert.ok(result.frameworks.includes('Express'));
    });

    it('detects Vue and NestJS frameworks', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { vue: '^3.0.0', '@nestjs/core': '^10.0.0' },
          devDependencies: {},
        })
      );

      const result = scanProject(tmpDir);
      assert.ok(result.frameworks.includes('Vue'));
      assert.ok(result.frameworks.includes('NestJS'));
    });

    it('detects cloud services from dependencies', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@aws-sdk/client-dynamodb': '^3.0.0',
            'firebase': '^10.0.0',
          },
          devDependencies: {},
        })
      );

      const result = scanProject(tmpDir);
      assert.ok(result.cloudServices.includes('AWS'));
      assert.ok(result.cloudServices.includes('GCP'));
    });

    it('detects test framework - jest', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {},
          devDependencies: { jest: '^29.0.0' },
        })
      );

      const result = scanProject(tmpDir);
      assert.equal(result.testFramework, 'jest');
    });

    it('detects test framework - vitest', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {},
          devDependencies: { vitest: '^1.0.0' },
        })
      );

      const result = scanProject(tmpDir);
      assert.equal(result.testFramework, 'vitest');
    });

    it('detects test framework - mocha', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {},
          devDependencies: { mocha: '^10.0.0' },
        })
      );

      const result = scanProject(tmpDir);
      assert.equal(result.testFramework, 'mocha');
    });

    it('detects database - prisma', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { '@prisma/client': '^5.0.0' },
          devDependencies: { prisma: '^5.0.0' },
        })
      );

      const result = scanProject(tmpDir);
      assert.equal(result.database, 'prisma');
    });

    it('detects database - mongodb', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { mongoose: '^7.0.0' },
          devDependencies: {},
        })
      );

      const result = scanProject(tmpDir);
      assert.equal(result.database, 'mongodb');
    });

    it('detects protected resources (.env files)', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=xxx');
      fs.writeFileSync(path.join(tmpDir, '.env.local'), 'LOCAL=yyy');

      const result = scanProject(tmpDir);
      assert.ok(result.protectedResources.includes('.env'));
      assert.ok(result.protectedResources.includes('.env.local'));
    });

    it('detects Docker presence', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20');

      const result = scanProject(tmpDir);
      assert.equal(result.hasDocker, true);
    });

    it('detects CI/CD from .github/workflows', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });

      const result = scanProject(tmpDir);
      assert.equal(result.hasCi, true);
    });

    it('detects environment variables from .env.example', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.writeFileSync(
        path.join(tmpDir, '.env.example'),
        'DATABASE_URL=\nAPI_KEY=\n# Comment line\nSECRET='
      );

      const result = scanProject(tmpDir);
      assert.ok(result.envVars.includes('DATABASE_URL'));
      assert.ok(result.envVars.includes('API_KEY'));
      assert.ok(result.envVars.includes('SECRET'));
      // Comment lines should be excluded
      assert.ok(!result.envVars.includes('# Comment line'));
    });

    it('detects Python project', () => {
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask==2.0.0');

      const result = scanProject(tmpDir);
      assert.equal(result.language, 'python');
      assert.equal(result.packageManager, 'pip');
    });

    it('detects Rust project', () => {
      fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "myapp"');

      const result = scanProject(tmpDir);
      assert.equal(result.language, 'rust');
      assert.equal(result.packageManager, 'cargo');
    });

    it('detects Go project', () => {
      fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/myapp');

      const result = scanProject(tmpDir);
      assert.equal(result.language, 'go');
      assert.equal(result.packageManager, 'go');
    });

    it('returns unknown for empty directory', () => {
      const result = scanProject(tmpDir);
      assert.equal(result.language, 'unknown');
      assert.equal(result.packageManager, 'unknown');
      assert.equal(result.testFramework, null);
      assert.equal(result.database, null);
    });

    it('detects AWS CDK from cdk.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, 'cdk.json'), '{}');

      const result = scanProject(tmpDir);
      assert.ok(result.cloudServices.includes('AWS CDK'));
    });

    it('detects Amplify from amplify.yml', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, 'amplify.yml'), 'version: 1');

      const result = scanProject(tmpDir);
      assert.ok(result.cloudServices.includes('AWS Amplify'));
      assert.ok(result.protectedResources.includes('amplify.yml'));
    });
  });

  // =====================
  // generateSkills
  // =====================
  describe('generateSkills', () => {
    it('always creates project-conventions skill', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(names.includes('project-conventions'));
    });

    it('creates test skill when testFramework is detected', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: { vitest: '^1.0.0' } })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(names.includes('test'));
    });

    it('does not create test skill when no testFramework', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(!names.includes('test'));
    });

    it('creates deploy skill when CI exists', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(names.includes('deploy'));
    });

    it('creates deploy skill when cloud services exist', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { '@aws-sdk/client-dynamodb': '^3.0.0' },
          devDependencies: {},
        })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(names.includes('deploy'));
    });

    it('creates project-safety skill when protected resources exist', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=xxx');

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(names.includes('project-safety'));
    });

    it('creates project-safety skill when cloud services exist', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { firebase: '^10.0.0' },
          devDependencies: {},
        })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(names.includes('project-safety'));
    });

    it('does not create project-safety when no protected resources or cloud', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const names = skills.map(s => s.name);
      assert.ok(!names.includes('project-safety'));
    });

    it('conventions skill includes framework info', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { next: '^14.0.0', react: '^18.0.0' },
          devDependencies: { typescript: '^5.0.0' },
        })
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const conventions = skills.find(s => s.name === 'project-conventions');
      assert.ok(conventions);
      assert.ok(conventions.skillMdContent.includes('Next.js'));
      assert.ok(conventions.skillMdContent.includes('React'));
      assert.ok(conventions.skillMdContent.includes('typescript'));
    });

    it('test skill references the detected test framework', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: { mocha: '^10.0.0' } })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const testSkill = skills.find(s => s.name === 'test');
      assert.ok(testSkill);
      assert.ok(testSkill.skillMdContent.includes('mocha'));
    });

    it('deploy skill includes cloud service info', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { '@aws-sdk/client-dynamodb': '^3.0.0' },
          devDependencies: {},
        })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const deploySkill = skills.find(s => s.name === 'deploy');
      assert.ok(deploySkill);
      assert.ok(deploySkill.skillMdContent.includes('AWS'));
    });
  });

  // =====================
  // writeSkills
  // =====================
  describe('writeSkills', () => {
    it('creates files in correct locations', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: { react: '^18.0.0' },
          devDependencies: { vitest: '^1.0.0', typescript: '^5.0.0' },
        })
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=xxx');

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const written = writeSkills(tmpDir, skills);

      // Check that files were written
      assert.ok(written.length > 0);
      for (const filePath of written) {
        assert.ok(fs.existsSync(filePath), `File should exist: ${filePath}`);
      }
    });

    it('writes SKILL.md in .claude/skills/<name>/ directory', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      writeSkills(tmpDir, skills);

      const conventionsSkillPath = path.join(
        tmpDir,
        '.claude',
        'skills',
        'project-conventions',
        'SKILL.md'
      );
      assert.ok(
        fs.existsSync(conventionsSkillPath),
        `Conventions SKILL.md should exist at ${conventionsSkillPath}`
      );
    });

    it('returns list of written file paths', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: { jest: '^29.0.0' } })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const written = writeSkills(tmpDir, skills);

      // Should have at least conventions + test skill
      assert.ok(written.length >= 2);
      assert.ok(written.some(f => f.includes('project-conventions')));
      assert.ok(written.some(f => f.includes('test')));
    });

    it('writes supporting files when present', () => {
      const skills = [
        {
          name: 'test-skill',
          directory: '.claude/skills/test-skill',
          skillMdContent: '# Test',
          supportingFiles: [
            { name: 'config.json', content: '{"key":"value"}' },
          ],
        },
      ];

      const written = writeSkills(tmpDir, skills);
      assert.ok(written.length === 2); // SKILL.md + config.json
      const configPath = path.join(tmpDir, '.claude', 'skills', 'test-skill', 'config.json');
      assert.ok(fs.existsSync(configPath));
      assert.equal(fs.readFileSync(configPath, 'utf-8'), '{"key":"value"}');
    });
  });

  // =====================
  // YAML frontmatter validation
  // =====================
  describe('YAML frontmatter', () => {
    it('conventions skill has valid frontmatter with --- delimiters', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const conventions = skills.find(s => s.name === 'project-conventions');
      assert.ok(conventions);

      const content = conventions.skillMdContent;
      assert.ok(content.startsWith('---\n'), 'Should start with --- delimiter');
      const secondDelimiter = content.indexOf('---', 4);
      assert.ok(secondDelimiter > 0, 'Should have closing --- delimiter');
    });

    it('conventions skill frontmatter contains name field', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const conventions = skills.find(s => s.name === 'project-conventions');
      assert.ok(conventions);

      const content = conventions.skillMdContent;
      assert.ok(content.includes('name: project-conventions'));
    });

    it('test skill frontmatter contains name field', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: { jest: '^29.0.0' } })
      );

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const testSkill = skills.find(s => s.name === 'test');
      assert.ok(testSkill);

      const content = testSkill.skillMdContent;
      assert.ok(content.includes('name: test'));
    });

    it('deploy skill has disable-model-invocation in frontmatter', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );
      fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const deploySkill = skills.find(s => s.name === 'deploy');
      assert.ok(deploySkill);

      const content = deploySkill.skillMdContent;
      assert.ok(content.includes('disable-model-invocation: true'));
    });

    it('project-safety skill has user-invocable: false in frontmatter', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {}, devDependencies: {} })
      );
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=xxx');

      const scanResult = scanProject(tmpDir);
      const skills = generateSkills(tmpDir, scanResult);
      const safetySkill = skills.find(s => s.name === 'project-safety');
      assert.ok(safetySkill);

      const content = safetySkill.skillMdContent;
      assert.ok(content.includes('user-invocable: false'));
    });
  });
});
