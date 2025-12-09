/**
 * Unit Tests for Task Completion Detection
 *
 * Tests for task completion judgment and remaining work visualization
 * - Reporter Task Completion Judgment Section
 * - Implementer Plan/Subtask Output Fields
 * - PM Orchestrator Task Completion Flow
 * - CLAUDE.md 第14原則
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Task Completion Detection', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const skillsDir = path.join(projectRoot, '.claude/skills');

  describe('Reporter Task Completion Judgment Section', () => {
    let reporterContent: string;

    beforeAll(() => {
      const reporterPath = path.join(skillsDir, 'reporter.md');
      reporterContent = fs.readFileSync(reporterPath, 'utf-8');
    });

    it('should have Task Completion Judgment Section', () => {
      expect(reporterContent).toMatch(/Task Completion Judgment|タスク完了判定/);
    });

    it('should define isTaskRunComplete field', () => {
      expect(reporterContent).toContain('isTaskRunComplete');
    });

    it('should define hasRemainingWork field', () => {
      expect(reporterContent).toContain('hasRemainingWork');
    });

    it('should define remainingWorkSummary field', () => {
      expect(reporterContent).toContain('remainingWorkSummary');
    });

    it('should define canStartNewTask field', () => {
      expect(reporterContent).toContain('canStartNewTask');
    });

    it('should define continuationRecommended field', () => {
      expect(reporterContent).toContain('continuationRecommended');
    });

    it('should define suggestedNextUserPrompt field', () => {
      expect(reporterContent).toContain('suggestedNextUserPrompt');
    });

    it('should define wasInterrupted field', () => {
      expect(reporterContent).toContain('wasInterrupted');
    });

    it('should define interruptionReason field', () => {
      expect(reporterContent).toContain('interruptionReason');
    });

    it('should have completion message template', () => {
      expect(reporterContent).toMatch(/完了|未完了|completed|incomplete/i);
    });

    it('should have remaining work list format', () => {
      expect(reporterContent).toMatch(/残タスク|remaining|未完了/i);
    });

    it('should reference Plan model', () => {
      expect(reporterContent).toMatch(/Plan|plans/);
    });

    it('should reference Subtask model', () => {
      expect(reporterContent).toMatch(/Subtask|subtasks/);
    });
  });

  describe('Implementer Plan/Subtask Output Fields', () => {
    let implementerContent: string;

    beforeAll(() => {
      const implementerPath = path.join(skillsDir, 'implementer.md');
      implementerContent = fs.readFileSync(implementerPath, 'utf-8');
    });

    it('should have Plan Output Fields section', () => {
      expect(implementerContent).toMatch(/Plan Output|planOutput/);
    });

    it('should define plans array field', () => {
      expect(implementerContent).toMatch(/plans|Plan\[\]/);
    });

    it('should define currentPlanId field', () => {
      expect(implementerContent).toContain('currentPlanId');
    });

    it('should define currentSubtaskId field', () => {
      expect(implementerContent).toContain('currentSubtaskId');
    });

    it('should define Plan.id field', () => {
      expect(implementerContent).toMatch(/Plan.*id|id.*string/);
    });

    it('should define Plan.kind field', () => {
      expect(implementerContent).toMatch(/kind.*test_plan|implementation_plan/);
    });

    it('should define Plan.title field', () => {
      expect(implementerContent).toMatch(/title.*string/);
    });

    it('should define Plan.status field', () => {
      expect(implementerContent).toMatch(/status.*pending|in_progress|done/);
    });

    it('should define Plan.subtasks field', () => {
      expect(implementerContent).toMatch(/subtasks.*Subtask/);
    });

    it('should define Subtask.description field', () => {
      expect(implementerContent).toMatch(/description.*string/);
    });

    it('should define Subtask.evidenceSummary field', () => {
      expect(implementerContent).toContain('evidenceSummary');
    });

    it('should mention status update responsibility', () => {
      expect(implementerContent).toMatch(/status.*更新|update.*status/i);
    });

    it('should mention Reporter handoff', () => {
      expect(implementerContent).toMatch(/Reporter/);
    });
  });

  describe('PM Orchestrator Task Completion Flow', () => {
    let pmContent: string;

    beforeAll(() => {
      const pmPath = path.join(skillsDir, 'pm-orchestrator.md');
      pmContent = fs.readFileSync(pmPath, 'utf-8');
    });

    it('should have Task Completion Judgment Flow section', () => {
      expect(pmContent).toMatch(/Task Completion|タスク完了判定/);
    });

    it('should mention isTaskRunComplete', () => {
      expect(pmContent).toContain('isTaskRunComplete');
    });

    it('should mention hasRemainingWork', () => {
      expect(pmContent).toContain('hasRemainingWork');
    });

    it('should mention continuationRecommended', () => {
      expect(pmContent).toContain('continuationRecommended');
    });

    it('should define Reporter mandatory output fields', () => {
      expect(pmContent).toMatch(/Reporter.*必須|mandatory.*Reporter/i);
    });

    it('should define completion judgment logic', () => {
      expect(pmContent).toMatch(/完了判定|completion.*judgment/i);
    });

    it('should reference Plan/Subtask', () => {
      expect(pmContent).toMatch(/Plan|Subtask/);
    });
  });

  describe('CLAUDE.md 第14原則', () => {
    let claudeMdContent: string;

    beforeAll(() => {
      const claudeMdPath = path.join(projectRoot, '.claude/CLAUDE.md');
      claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8');
    });

    it('should contain 第14原則', () => {
      expect(claudeMdContent).toContain('第14原則');
    });

    it('should mention Task Completion Judgment', () => {
      expect(claudeMdContent).toMatch(/タスク完了判定|Task Completion/);
    });

    it('should mention isTaskRunComplete', () => {
      expect(claudeMdContent).toContain('isTaskRunComplete');
    });

    it('should mention hasRemainingWork', () => {
      expect(claudeMdContent).toContain('hasRemainingWork');
    });

    it('should mention continuationRecommended', () => {
      expect(claudeMdContent).toContain('continuationRecommended');
    });

    it('should prohibit completion without judgment', () => {
      expect(claudeMdContent).toMatch(/完了判定なし.*禁止|禁止.*完了判定/);
    });

    it('should reference skill files', () => {
      expect(claudeMdContent).toContain('.claude/skills/reporter.md');
    });
  });

  describe('Task Completion Flow Integration', () => {
    it('should have consistent field names across skills', () => {
      const reporterPath = path.join(skillsDir, 'reporter.md');
      const implementerPath = path.join(skillsDir, 'implementer.md');
      const pmPath = path.join(skillsDir, 'pm-orchestrator.md');

      const reporterContent = fs.readFileSync(reporterPath, 'utf-8');
      const implementerContent = fs.readFileSync(implementerPath, 'utf-8');
      const pmContent = fs.readFileSync(pmPath, 'utf-8');

      // All skills should reference common fields
      const commonFields = ['isTaskRunComplete', 'hasRemainingWork'];
      for (const field of commonFields) {
        expect(reporterContent).toContain(field);
        expect(pmContent).toContain(field);
      }

      // Implementer and PM should reference Plan
      expect(implementerContent).toMatch(/Plan|planOutput/);
      expect(pmContent).toMatch(/Plan|plans/);
    });

    it('should have consistent status values', () => {
      const implementerPath = path.join(skillsDir, 'implementer.md');
      const implementerContent = fs.readFileSync(implementerPath, 'utf-8');

      // Status values should be defined
      expect(implementerContent).toMatch(/pending|in_progress|done/);
    });

    it('should have consistent plan kinds', () => {
      const implementerPath = path.join(skillsDir, 'implementer.md');
      const implementerContent = fs.readFileSync(implementerPath, 'utf-8');

      // Plan kinds should be defined
      expect(implementerContent).toMatch(/test_plan|implementation_plan|investigation_plan|other_plan/);
    });
  });
});

describe('Plan Document Structure', () => {
  const projectRoot = path.resolve(__dirname, '../../../../');
  const tddDir = path.join(projectRoot, 'docs/tdd');

  it('should have docs/tdd directory', () => {
    expect(fs.existsSync(tddDir)).toBe(true);
  });

  it('should have task-completion TDD plan file', () => {
    const files = fs.readdirSync(tddDir);
    const completionPlanFile = files.find(f => f.includes('task-completion'));
    expect(completionPlanFile).toBeDefined();
  });

  describe('TDD Plan File Structure', () => {
    let planContent: string;

    beforeAll(() => {
      const planFiles = fs.readdirSync(tddDir).filter(f => f.includes('task-completion'));
      if (planFiles.length > 0) {
        planContent = fs.readFileSync(path.join(tddDir, planFiles[0]), 'utf-8');
      }
    });

    it('should have Summary section', () => {
      expect(planContent).toMatch(/## Summary|# Summary/);
    });

    it('should have Test Plan section', () => {
      expect(planContent).toMatch(/## Test Plan|# Test Plan/);
    });

    it('should have Implementation Plan section', () => {
      expect(planContent).toMatch(/## Implementation Plan|# Implementation Plan/);
    });

    it('should have Evidence section', () => {
      expect(planContent).toMatch(/## Evidence|# Evidence/);
    });

    it('should have Type Definitions section', () => {
      expect(planContent).toMatch(/## Type Definitions|# Type Definitions/);
    });
  });
});
