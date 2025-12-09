/**
 * Unit Tests for TDD Enforcement Flow
 *
 * Tests for TDD enforcement in implementation tasks
 * - Reporter TDD Evidence Section
 * - Implementer TDD Output Fields
 * - QA TDD Verification Logic
 * - CLAUDE.md 第13原則
 */

import * as fs from 'fs';
import * as path from 'path';

describe('TDD Enforcement Flow', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const skillsDir = path.join(projectRoot, '.claude/skills');

  describe('Reporter TDD Evidence Section', () => {
    let reporterContent: string;

    beforeAll(() => {
      const reporterPath = path.join(skillsDir, 'reporter.md');
      reporterContent = fs.readFileSync(reporterPath, 'utf-8');
    });

    it('should have TDD Evidence Section', () => {
      expect(reporterContent).toMatch(/TDD Evidence Section|TDD Evidence/);
    });

    it('should define required TDD fields', () => {
      expect(reporterContent).toContain('hasImplementationChanges');
      expect(reporterContent).toContain('tddRequired');
      expect(reporterContent).toContain('tddExecuted');
      expect(reporterContent).toContain('TDDCompliance');
    });

    it('should define testPlanSummary field', () => {
      expect(reporterContent).toContain('testPlanSummary');
    });

    it('should define changedTestFiles field', () => {
      expect(reporterContent).toContain('changedTestFiles');
    });

    it('should define testCommands field', () => {
      expect(reporterContent).toContain('testCommands');
    });

    it('should define redPhaseEvidence field', () => {
      expect(reporterContent).toContain('redPhaseEvidence');
    });

    it('should define greenPhaseEvidence field', () => {
      expect(reporterContent).toContain('greenPhaseEvidence');
    });

    it('should define implementationChangesSummary field', () => {
      expect(reporterContent).toContain('implementationChangesSummary');
    });

    it('should define planDocumentPath field', () => {
      expect(reporterContent).toContain('planDocumentPath');
    });

    it('should define TDDCompliance values', () => {
      expect(reporterContent).toMatch(/"yes"|"no"|"partial"/);
    });

    it('should have TDD information missing warning', () => {
      expect(reporterContent).toMatch(/TDD 情報が不足|TDD information missing/i);
    });

    it('should mention target TaskTypes', () => {
      expect(reporterContent).toContain('IMPLEMENTATION');
      expect(reporterContent).toContain('CONFIG_CI_CHANGE');
      expect(reporterContent).toContain('DANGEROUS_OP');
    });
  });

  describe('Implementer TDD Output Fields', () => {
    let implementerContent: string;

    beforeAll(() => {
      const implementerPath = path.join(skillsDir, 'implementer.md');
      implementerContent = fs.readFileSync(implementerPath, 'utf-8');
    });

    it('should have TDD Output Fields section', () => {
      expect(implementerContent).toMatch(/TDD Output Fields|tddOutput/);
    });

    it('should define changedCodeFiles field', () => {
      expect(implementerContent).toContain('changedCodeFiles');
    });

    it('should define changedTestFiles field', () => {
      expect(implementerContent).toContain('changedTestFiles');
    });

    it('should define initialTestRun field', () => {
      expect(implementerContent).toContain('initialTestRun');
    });

    it('should define finalTestRun field', () => {
      expect(implementerContent).toContain('finalTestRun');
    });

    it('should define implementationChangesSummary field', () => {
      expect(implementerContent).toContain('implementationChangesSummary');
    });

    it('should define planDocumentPath field', () => {
      expect(implementerContent).toContain('planDocumentPath');
    });

    it('should mention Reporter handoff', () => {
      expect(implementerContent).toMatch(/Reporter|QA/);
    });
  });

  describe('QA TDD Verification Logic', () => {
    let qaContent: string;

    beforeAll(() => {
      const qaPath = path.join(skillsDir, 'qa.md');
      qaContent = fs.readFileSync(qaPath, 'utf-8');
    });

    it('should have TDD Verification Logic section', () => {
      expect(qaContent).toMatch(/TDD Verification Logic|tddCheck/);
    });

    it('should define tddCheck output structure', () => {
      expect(qaContent).toContain('tddCheck');
      expect(qaContent).toContain('passed');
      expect(qaContent).toContain('issues');
    });

    it('should verify test file existence', () => {
      expect(qaContent).toMatch(/changedTestFiles|テストファイル/);
    });

    it('should verify test command existence', () => {
      expect(qaContent).toMatch(/finalTestRun|テストコマンド/);
    });

    it('should have verification flow', () => {
      expect(qaContent).toMatch(/検証フロー|verification flow/i);
    });

    it('should mention Reporter handoff', () => {
      expect(qaContent).toMatch(/Reporter/);
    });
  });

  describe('PM Orchestrator TDD Flow', () => {
    let pmContent: string;

    beforeAll(() => {
      const pmPath = path.join(skillsDir, 'pm-orchestrator.md');
      pmContent = fs.readFileSync(pmPath, 'utf-8');
    });

    it('should have TDD Enforcement Flow section', () => {
      expect(pmContent).toMatch(/TDD Enforcement Flow|TDD 強制/);
    });

    it('should mention target TaskTypes', () => {
      expect(pmContent).toContain('IMPLEMENTATION');
      expect(pmContent).toContain('CONFIG_CI_CHANGE');
      expect(pmContent).toContain('DANGEROUS_OP');
    });

    it('should define TDD pipeline', () => {
      expect(pmContent).toMatch(/Implementer.*tddOutput|tddOutput/);
      expect(pmContent).toMatch(/QA.*tddCheck|tddCheck/);
      expect(pmContent).toMatch(/Reporter.*TDD Evidence|TDD Evidence/);
    });

    it('should mention TDDCompliance', () => {
      expect(pmContent).toContain('TDDCompliance');
    });
  });

  describe('CLAUDE.md 第13原則', () => {
    let claudeMdContent: string;

    beforeAll(() => {
      const claudeMdPath = path.join(projectRoot, '.claude/CLAUDE.md');
      claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8');
    });

    it('should contain 第13原則', () => {
      expect(claudeMdContent).toContain('第13原則');
    });

    it('should mention TDD Enforcement', () => {
      expect(claudeMdContent).toMatch(/TDD 強制|TDD Enforcement/);
    });

    it('should mention target TaskTypes', () => {
      expect(claudeMdContent).toContain('IMPLEMENTATION');
      expect(claudeMdContent).toContain('CONFIG_CI_CHANGE');
      expect(claudeMdContent).toContain('DANGEROUS_OP');
    });

    it('should mention tddOutput', () => {
      expect(claudeMdContent).toContain('tddOutput');
    });

    it('should mention tddCheck', () => {
      expect(claudeMdContent).toContain('tddCheck');
    });

    it('should mention TDD Evidence Section', () => {
      expect(claudeMdContent).toMatch(/TDD Evidence Section|TDD Evidence/);
    });

    it('should mention TDDCompliance', () => {
      expect(claudeMdContent).toContain('TDDCompliance');
    });

    it('should prohibit completion without TDD evidence', () => {
      expect(claudeMdContent).toMatch(/エビデンスなしの完了報告禁止|TDD エビデンスなし/);
    });

    it('should reference skill files', () => {
      expect(claudeMdContent).toContain('.claude/skills/reporter.md');
      expect(claudeMdContent).toContain('.claude/skills/implementer.md');
      expect(claudeMdContent).toContain('.claude/skills/qa.md');
    });
  });

  describe('TDD Flow Integration', () => {
    it('should have consistent field names across skills', () => {
      const reporterPath = path.join(skillsDir, 'reporter.md');
      const implementerPath = path.join(skillsDir, 'implementer.md');
      const qaPath = path.join(skillsDir, 'qa.md');

      const reporterContent = fs.readFileSync(reporterPath, 'utf-8');
      const implementerContent = fs.readFileSync(implementerPath, 'utf-8');
      const qaContent = fs.readFileSync(qaPath, 'utf-8');

      // Implementer and QA should share common TDD fields
      const implementerQaFields = ['changedTestFiles', 'finalTestRun'];
      for (const field of implementerQaFields) {
        expect(implementerContent).toContain(field);
        expect(qaContent).toContain(field);
      }

      // Reporter should have TDD output fields (may use different naming)
      expect(reporterContent).toContain('changedTestFiles');
      expect(reporterContent).toMatch(/greenPhaseEvidence|testCommands/);
    });

    it('should have consistent TDDCompliance values', () => {
      const reporterPath = path.join(skillsDir, 'reporter.md');
      const pmPath = path.join(skillsDir, 'pm-orchestrator.md');

      const reporterContent = fs.readFileSync(reporterPath, 'utf-8');
      const pmContent = fs.readFileSync(pmPath, 'utf-8');

      // Both should mention the same TDDCompliance values
      expect(reporterContent).toMatch(/"yes"|"no"|"partial"/);
      expect(pmContent).toContain('TDDCompliance');
    });
  });
});

describe('TDD Plan Document Structure', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const tddDir = path.join(projectRoot, 'docs/tdd');

  it('should have docs/tdd directory', () => {
    expect(fs.existsSync(tddDir)).toBe(true);
  });

  it('should have TDD plan files', () => {
    const files = fs.readdirSync(tddDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);
  });

  describe('TDD Plan File Structure', () => {
    let planFiles: string[];

    beforeAll(() => {
      const files = fs.readdirSync(tddDir);
      planFiles = files.filter(f => f.endsWith('.md'));
    });

    it('should have Summary section in plan files', () => {
      for (const file of planFiles) {
        const content = fs.readFileSync(path.join(tddDir, file), 'utf-8');
        expect(content).toMatch(/## Summary|# Summary/);
      }
    });

    it('should have Evidence section in plan files', () => {
      for (const file of planFiles) {
        const content = fs.readFileSync(path.join(tddDir, file), 'utf-8');
        expect(content).toMatch(/## Evidence|# Evidence/);
      }
    });
  });
});
