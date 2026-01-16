import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  OverallStatus,
  TaskStatus,
  Phase,
  LockType,
  getStatusPriority,
  aggregateStatus,
  isTerminalStatus,
  getNextPhase,
  isValidPhaseTransition,
} from '../../../src/models/enums';

describe('Status Enumerations (05_DATA_MODELS.md L103-119)', () => {
  describe('OverallStatus', () => {
    it('should define all required values', () => {
      assert.equal(OverallStatus.COMPLETE, 'COMPLETE');
      assert.equal(OverallStatus.INCOMPLETE, 'INCOMPLETE');
      assert.equal(OverallStatus.ERROR, 'ERROR');
      assert.equal(OverallStatus.INVALID, 'INVALID');
      assert.equal(OverallStatus.NO_EVIDENCE, 'NO_EVIDENCE');
    });
  });

  describe('TaskStatus', () => {
    it('should define all required values', () => {
      assert.equal(TaskStatus.COMPLETE, 'COMPLETE');
      assert.equal(TaskStatus.INCOMPLETE, 'INCOMPLETE');
      assert.equal(TaskStatus.ERROR, 'ERROR');
      assert.equal(TaskStatus.INVALID, 'INVALID');
      assert.equal(TaskStatus.NO_EVIDENCE, 'NO_EVIDENCE');
    });
  });

  describe('Phase', () => {
    it('should define all 7 phases', () => {
      assert.equal(Phase.REQUIREMENT_ANALYSIS, 'REQUIREMENT_ANALYSIS');
      assert.equal(Phase.TASK_DECOMPOSITION, 'TASK_DECOMPOSITION');
      assert.equal(Phase.PLANNING, 'PLANNING');
      assert.equal(Phase.EXECUTION, 'EXECUTION');
      assert.equal(Phase.QA, 'QA');
      assert.equal(Phase.COMPLETION_VALIDATION, 'COMPLETION_VALIDATION');
      assert.equal(Phase.REPORT, 'REPORT');
    });
  });

  describe('LockType', () => {
    it('should define READ and WRITE', () => {
      assert.equal(LockType.READ, 'READ');
      assert.equal(LockType.WRITE, 'WRITE');
    });
  });

  describe('Status Priority (05_DATA_MODELS.md L109-118)', () => {
    it('INVALID has highest priority', () => {
      assert.ok(getStatusPriority(OverallStatus.INVALID) > getStatusPriority(OverallStatus.ERROR));
      assert.ok(getStatusPriority(OverallStatus.INVALID) > getStatusPriority(OverallStatus.NO_EVIDENCE));
      assert.ok(getStatusPriority(OverallStatus.INVALID) > getStatusPriority(OverallStatus.INCOMPLETE));
      assert.ok(getStatusPriority(OverallStatus.INVALID) > getStatusPriority(OverallStatus.COMPLETE));
    });

    it('ERROR is second priority', () => {
      assert.ok(getStatusPriority(OverallStatus.ERROR) > getStatusPriority(OverallStatus.NO_EVIDENCE));
      assert.ok(getStatusPriority(OverallStatus.ERROR) > getStatusPriority(OverallStatus.INCOMPLETE));
      assert.ok(getStatusPriority(OverallStatus.ERROR) > getStatusPriority(OverallStatus.COMPLETE));
    });

    it('NO_EVIDENCE is below ERROR', () => {
      assert.ok(getStatusPriority(OverallStatus.NO_EVIDENCE) > getStatusPriority(OverallStatus.INCOMPLETE));
      assert.ok(getStatusPriority(OverallStatus.NO_EVIDENCE) > getStatusPriority(OverallStatus.COMPLETE));
    });

    it('INCOMPLETE is below NO_EVIDENCE', () => {
      assert.ok(getStatusPriority(OverallStatus.INCOMPLETE) > getStatusPriority(OverallStatus.COMPLETE));
    });

    it('COMPLETE has lowest priority', () => {
      assert.equal(getStatusPriority(OverallStatus.COMPLETE), 0);
    });
  });

  describe('Status Aggregation', () => {
    it('should return highest priority status', () => {
      assert.equal(
        aggregateStatus([OverallStatus.COMPLETE, OverallStatus.INCOMPLETE]),
        OverallStatus.INCOMPLETE
      );
      assert.equal(
        aggregateStatus([OverallStatus.COMPLETE, OverallStatus.ERROR]),
        OverallStatus.ERROR
      );
      assert.equal(
        aggregateStatus([OverallStatus.ERROR, OverallStatus.INVALID]),
        OverallStatus.INVALID
      );
      assert.equal(
        aggregateStatus([OverallStatus.NO_EVIDENCE, OverallStatus.INCOMPLETE]),
        OverallStatus.NO_EVIDENCE
      );
    });

    it('should return COMPLETE for empty array', () => {
      assert.equal(aggregateStatus([]), OverallStatus.COMPLETE);
    });

    it('should return COMPLETE for all COMPLETE', () => {
      assert.equal(
        aggregateStatus([OverallStatus.COMPLETE, OverallStatus.COMPLETE]),
        OverallStatus.COMPLETE
      );
    });
  });

  describe('Terminal Status', () => {
    it('COMPLETE is terminal', () => {
      assert.ok(isTerminalStatus(OverallStatus.COMPLETE));
    });

    it('ERROR is terminal', () => {
      assert.ok(isTerminalStatus(OverallStatus.ERROR));
    });

    it('INVALID is terminal', () => {
      assert.ok(isTerminalStatus(OverallStatus.INVALID));
    });

    it('INCOMPLETE is not terminal', () => {
      assert.ok(!isTerminalStatus(OverallStatus.INCOMPLETE));
    });

    it('NO_EVIDENCE is terminal', () => {
      assert.ok(isTerminalStatus(OverallStatus.NO_EVIDENCE));
    });
  });

  describe('Phase Transitions (03_LIFECYCLE.md)', () => {
    it('should define correct phase order', () => {
      assert.equal(getNextPhase(Phase.REQUIREMENT_ANALYSIS), Phase.TASK_DECOMPOSITION);
      assert.equal(getNextPhase(Phase.TASK_DECOMPOSITION), Phase.PLANNING);
      assert.equal(getNextPhase(Phase.PLANNING), Phase.EXECUTION);
      assert.equal(getNextPhase(Phase.EXECUTION), Phase.QA);
      assert.equal(getNextPhase(Phase.QA), Phase.COMPLETION_VALIDATION);
      assert.equal(getNextPhase(Phase.COMPLETION_VALIDATION), Phase.REPORT);
      assert.equal(getNextPhase(Phase.REPORT), null);
    });

    it('should validate phase transitions', () => {
      assert.ok(isValidPhaseTransition(Phase.REQUIREMENT_ANALYSIS, Phase.TASK_DECOMPOSITION));
      assert.ok(!isValidPhaseTransition(Phase.REQUIREMENT_ANALYSIS, Phase.EXECUTION));
      assert.ok(!isValidPhaseTransition(Phase.EXECUTION, Phase.REQUIREMENT_ANALYSIS));
    });

    it('should reject phase skipping', () => {
      assert.ok(!isValidPhaseTransition(Phase.REQUIREMENT_ANALYSIS, Phase.PLANNING));
      assert.ok(!isValidPhaseTransition(Phase.PLANNING, Phase.QA));
    });
  });
});
