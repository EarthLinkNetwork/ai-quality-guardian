/**
 * Unit Tests for Command Policy Configuration
 *
 * Tests for .claude/command-policy.json structure and validation
 * - JSON schema compliance
 * - taskTypePolicies structure
 * - categoryPolicies structure
 * - Operator skill existence
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Command Policy Configuration', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const policyPath = path.join(projectRoot, '.claude/command-policy.json');
  let policy: any;

  beforeAll(() => {
    const policyContent = fs.readFileSync(policyPath, 'utf-8');
    policy = JSON.parse(policyContent);
  });

  describe('JSON Structure', () => {
    it('should have valid JSON structure', () => {
      expect(policy).toBeDefined();
      expect(typeof policy).toBe('object');
    });

    it('should have required top-level fields', () => {
      expect(policy.version).toBeDefined();
      expect(policy.description).toBeDefined();
      expect(policy.taskTypePolicies).toBeDefined();
      expect(policy.categoryPolicies).toBeDefined();
      expect(policy.globalRules).toBeDefined();
    });

    it('should have valid version format', () => {
      expect(policy.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('TaskType Policies', () => {
    const expectedTaskTypes = [
      'READ_INFO',
      'LIGHT_EDIT',
      'IMPLEMENTATION',
      'REVIEW_RESPONSE',
      'CONFIG_CI_CHANGE',
      'DANGEROUS_OP'
    ];

    it('should define all required TaskTypes', () => {
      for (const taskType of expectedTaskTypes) {
        expect(policy.taskTypePolicies[taskType]).toBeDefined();
      }
    });

    it('should have allowedCategories array for each TaskType', () => {
      for (const taskType of expectedTaskTypes) {
        const taskPolicy = policy.taskTypePolicies[taskType];
        expect(Array.isArray(taskPolicy.allowedCategories)).toBe(true);
      }
    });

    it('should have notes for each TaskType', () => {
      for (const taskType of expectedTaskTypes) {
        const taskPolicy = policy.taskTypePolicies[taskType];
        expect(typeof taskPolicy.notes).toBe('string');
        expect(taskPolicy.notes.length).toBeGreaterThan(0);
      }
    });

    it('READ_INFO should have no allowed categories', () => {
      expect(policy.taskTypePolicies.READ_INFO.allowedCategories).toEqual([]);
    });

    it('IMPLEMENTATION should allow all categories', () => {
      const allowed = policy.taskTypePolicies.IMPLEMENTATION.allowedCategories;
      expect(allowed).toContain('version_control');
      expect(allowed).toContain('filesystem');
      expect(allowed).toContain('process');
    });

    it('DANGEROUS_OP should have no allowed categories', () => {
      expect(policy.taskTypePolicies.DANGEROUS_OP.allowedCategories).toEqual([]);
    });
  });

  describe('Category Policies', () => {
    const expectedCategories = ['version_control', 'filesystem', 'process'];

    it('should define all required categories', () => {
      for (const category of expectedCategories) {
        expect(policy.categoryPolicies[category]).toBeDefined();
      }
    });

    it('should have operatorSkill for each category', () => {
      for (const category of expectedCategories) {
        const categoryPolicy = policy.categoryPolicies[category];
        expect(categoryPolicy.operatorSkill).toBeDefined();
        expect(typeof categoryPolicy.operatorSkill).toBe('string');
      }
    });

    it('should have riskLevel for each category', () => {
      const validRiskLevels = ['low', 'medium', 'high', 'critical'];
      for (const category of expectedCategories) {
        const categoryPolicy = policy.categoryPolicies[category];
        expect(validRiskLevels).toContain(categoryPolicy.riskLevel);
      }
    });

    it('should have allowedOperations array for each category', () => {
      for (const category of expectedCategories) {
        const categoryPolicy = policy.categoryPolicies[category];
        expect(Array.isArray(categoryPolicy.allowedOperations)).toBe(true);
        expect(categoryPolicy.allowedOperations.length).toBeGreaterThan(0);
      }
    });

    it('should have dangerousOperations array for each category', () => {
      for (const category of expectedCategories) {
        const categoryPolicy = policy.categoryPolicies[category];
        expect(Array.isArray(categoryPolicy.dangerousOperations)).toBe(true);
        expect(categoryPolicy.dangerousOperations.length).toBeGreaterThan(0);
      }
    });

    it('should have alwaysBlock array for each category', () => {
      for (const category of expectedCategories) {
        const categoryPolicy = policy.categoryPolicies[category];
        expect(Array.isArray(categoryPolicy.alwaysBlock)).toBe(true);
      }
    });

    it('should have safetyChecks array for each category', () => {
      for (const category of expectedCategories) {
        const categoryPolicy = policy.categoryPolicies[category];
        expect(Array.isArray(categoryPolicy.safetyChecks)).toBe(true);
        expect(categoryPolicy.safetyChecks.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Operator Skill Mapping', () => {
    it('version_control should map to git-operator', () => {
      expect(policy.categoryPolicies.version_control.operatorSkill).toBe('git-operator');
    });

    it('filesystem should map to filesystem-operator', () => {
      expect(policy.categoryPolicies.filesystem.operatorSkill).toBe('filesystem-operator');
    });

    it('process should map to process-operator', () => {
      expect(policy.categoryPolicies.process.operatorSkill).toBe('process-operator');
    });
  });

  describe('Operator Skill Files Existence', () => {
    const skillsDir = path.join(projectRoot, '.claude/skills');

    it('git-operator.md should exist', () => {
      const skillPath = path.join(skillsDir, 'git-operator.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    it('filesystem-operator.md should exist', () => {
      const skillPath = path.join(skillsDir, 'filesystem-operator.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    });

    it('process-operator.md should exist', () => {
      const skillPath = path.join(skillsDir, 'process-operator.md');
      expect(fs.existsSync(skillPath)).toBe(true);
    });
  });

  describe('Version Control Category', () => {
    it('should include safe git operations in allowedOperations', () => {
      const ops = policy.categoryPolicies.version_control.allowedOperations;
      expect(ops).toContain('status');
      expect(ops).toContain('diff');
      expect(ops).toContain('log');
      expect(ops).toContain('add');
      expect(ops).toContain('commit');
    });

    it('should include dangerous git operations in dangerousOperations', () => {
      const ops = policy.categoryPolicies.version_control.dangerousOperations;
      expect(ops).toContain('push');
      expect(ops).toContain('push --force');
      expect(ops).toContain('reset --hard');
    });

    it('should always block force push to main/master', () => {
      const blocked = policy.categoryPolicies.version_control.alwaysBlock;
      expect(blocked).toContain('push --force origin main');
      expect(blocked).toContain('push --force origin master');
    });
  });

  describe('Filesystem Category', () => {
    it('should include safe file operations in allowedOperations', () => {
      const ops = policy.categoryPolicies.filesystem.allowedOperations;
      expect(ops).toContain('ls');
      expect(ops).toContain('cat');
      expect(ops).toContain('mkdir');
      expect(ops).toContain('cp');
    });

    it('should include dangerous file operations in dangerousOperations', () => {
      const ops = policy.categoryPolicies.filesystem.dangerousOperations;
      expect(ops).toContain('rm -rf');
      expect(ops).toContain('chmod 777');
    });

    it('should always block destructive commands', () => {
      const blocked = policy.categoryPolicies.filesystem.alwaysBlock;
      expect(blocked).toContain('rm -rf /');
      expect(blocked).toContain('rm -rf ~');
    });

    it('should have allowedPaths defined', () => {
      const paths = policy.categoryPolicies.filesystem.allowedPaths;
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should have forbiddenPaths defined', () => {
      const paths = policy.categoryPolicies.filesystem.forbiddenPaths;
      expect(Array.isArray(paths)).toBe(true);
      expect(paths).toContain('/');
      expect(paths).toContain('~');
      expect(paths).toContain('node_modules');
    });
  });

  describe('Process Category', () => {
    it('should include safe npm operations in allowedOperations', () => {
      const ops = policy.categoryPolicies.process.allowedOperations;
      expect(ops).toContain('npm install');
      expect(ops).toContain('npm test');
      expect(ops).toContain('npm run build');
    });

    it('should include dangerous operations in dangerousOperations', () => {
      const ops = policy.categoryPolicies.process.dangerousOperations;
      expect(ops).toContain('npm publish');
      expect(ops).toContain('docker rm -f');
    });
  });

  describe('Global Rules', () => {
    it('should have requireUserConfirmation array', () => {
      expect(Array.isArray(policy.globalRules.requireUserConfirmation)).toBe(true);
      expect(policy.globalRules.requireUserConfirmation).toContain('npm publish');
      expect(policy.globalRules.requireUserConfirmation).toContain('git push');
    });

    it('should have alwaysBlock array', () => {
      expect(Array.isArray(policy.globalRules.alwaysBlock)).toBe(true);
      expect(policy.globalRules.alwaysBlock).toContain('rm -rf /');
    });

    it('should have auditLog enabled', () => {
      expect(policy.globalRules.auditLog).toBe(true);
    });

    it('should have maxOperationsPerTask defined', () => {
      expect(typeof policy.globalRules.maxOperationsPerTask).toBe('number');
      expect(policy.globalRules.maxOperationsPerTask).toBeGreaterThan(0);
    });
  });

  describe('Future Categories', () => {
    it('should have futureCategories section', () => {
      expect(policy.futureCategories).toBeDefined();
    });

    it('should define planned categories', () => {
      expect(policy.futureCategories.network).toBeDefined();
      expect(policy.futureCategories.database).toBeDefined();
    });

    it('should have status for planned categories', () => {
      expect(policy.futureCategories.network.status).toBe('planned');
      expect(policy.futureCategories.database.status).toBe('planned');
    });
  });
});

describe('Skill File Structure', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const skillsDir = path.join(projectRoot, '.claude/skills');

  const operatorSkills = [
    'git-operator.md',
    'filesystem-operator.md',
    'process-operator.md'
  ];

  describe.each(operatorSkills)('%s', (skillFile) => {
    let content: string;

    beforeAll(() => {
      const skillPath = path.join(skillsDir, skillFile);
      content = fs.readFileSync(skillPath, 'utf-8');
    });

    it('should have YAML frontmatter', () => {
      expect(content.startsWith('---')).toBe(true);
      expect(content.includes('---', 4)).toBe(true);
    });

    it('should have skill name defined', () => {
      expect(content).toMatch(/skill:\s*.+-operator/);
    });

    it('should have version defined', () => {
      expect(content).toMatch(/version:\s*\d+\.\d+\.\d+/);
    });

    it('should have category set to operator', () => {
      expect(content).toMatch(/category:\s*operator/);
    });

    it('should have Allowed Operations section', () => {
      // Japanese: 許可される操作, 許可された操作, 安全な操作
      // English: Allowed Operations, allowedOperations
      expect(content).toMatch(/Allowed Operations|allowedOperations|許可され|安全な操作/i);
    });

    it('should have Dangerous Operations section', () => {
      // Japanese: 危険な操作
      // English: Dangerous Operations, dangerousOperations
      expect(content).toMatch(/Dangerous Operations|dangerousOperations|危険な操作/i);
    });

    it('should have Safety Checks section', () => {
      expect(content).toMatch(/Safety|safetyChecks/i);
    });
  });
});

describe('CLAUDE.md Rule 12 Integration', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const claudeMdPath = path.join(projectRoot, '.claude/CLAUDE.md');
  let claudeMdContent: string;

  beforeAll(() => {
    claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8');
  });

  it('should contain 第12原則', () => {
    expect(claudeMdContent).toContain('第12原則');
  });

  it('should mention Structure First, Rules Second', () => {
    expect(claudeMdContent).toContain('Structure First');
  });

  it('should reference command-policy.json', () => {
    expect(claudeMdContent).toContain('command-policy.json');
  });

  it('should mention all three operator categories', () => {
    expect(claudeMdContent).toContain('version_control');
    expect(claudeMdContent).toContain('filesystem');
    expect(claudeMdContent).toContain('process');
  });

  it('should mention all three operator skills', () => {
    expect(claudeMdContent).toContain('git-operator');
    expect(claudeMdContent).toContain('filesystem-operator');
    expect(claudeMdContent).toContain('process-operator');
  });
});

describe('Skill Dangerous Command Prohibition Integration', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const skillsDir = path.join(projectRoot, '.claude/skills');

  const nonOperatorSkills = [
    'implementer.md',
    'qa.md',
    'code-reviewer.md'
  ];

  describe.each(nonOperatorSkills)('%s', (skillFile) => {
    let content: string;

    beforeAll(() => {
      const skillPath = path.join(skillsDir, skillFile);
      content = fs.readFileSync(skillPath, 'utf-8');
    });

    it('should have Dangerous Command Prohibition section', () => {
      expect(content).toMatch(/Dangerous Command Prohibition/);
    });

    it('should reference operator skills', () => {
      expect(content).toMatch(/git-operator|filesystem-operator|process-operator/);
    });

    it('should have Prohibited Commands section', () => {
      expect(content).toMatch(/Prohibited|禁止/);
    });
  });
});
