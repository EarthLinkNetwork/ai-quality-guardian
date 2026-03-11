import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  getAvailableActions,
  canTransition,
  transition,
  isTerminalState,
  WorkflowState,
  WorkflowAction,
} from '../../../src/lib/workflowStateMachine';

describe('workflowStateMachine', () => {
  describe('getAvailableActions', () => {
    it('returns submit and close for draft', () => {
      const actions = getAvailableActions('draft');
      assert.deepEqual(actions.sort(), ['close', 'submit']);
    });

    it('returns start_review and close for pending_review', () => {
      const actions = getAvailableActions('pending_review');
      assert.deepEqual(actions.sort(), ['close', 'start_review']);
    });

    it('returns approve, reject, request_changes, close for in_review', () => {
      const actions = getAvailableActions('in_review');
      assert.deepEqual(actions.sort(), ['approve', 'close', 'reject', 'request_changes']);
    });

    it('returns merge and close for approved', () => {
      const actions = getAvailableActions('approved');
      assert.deepEqual(actions.sort(), ['close', 'merge']);
    });

    it('returns revise and close for rejected', () => {
      const actions = getAvailableActions('rejected');
      assert.deepEqual(actions.sort(), ['close', 'revise']);
    });

    it('returns empty array for merged (terminal state)', () => {
      assert.deepEqual(getAvailableActions('merged'), []);
    });

    it('returns reopen for closed', () => {
      assert.deepEqual(getAvailableActions('closed'), ['reopen']);
    });
  });

  describe('canTransition', () => {
    it('allows draft -> submit', () => {
      assert.equal(canTransition('draft', 'submit'), true);
    });

    it('allows draft -> close', () => {
      assert.equal(canTransition('draft', 'close'), true);
    });

    it('disallows draft -> merge', () => {
      assert.equal(canTransition('draft', 'merge'), false);
    });

    it('disallows draft -> approve', () => {
      assert.equal(canTransition('draft', 'approve'), false);
    });

    it('disallows merged -> any action', () => {
      const allActions: WorkflowAction[] = [
        'submit', 'start_review', 'approve', 'reject',
        'request_changes', 'merge', 'close', 'reopen', 'revise',
      ];
      for (const action of allActions) {
        assert.equal(canTransition('merged', action), false, `merged should not allow ${action}`);
      }
    });

    it('allows closed -> reopen', () => {
      assert.equal(canTransition('closed', 'reopen'), true);
    });

    it('disallows closed -> merge', () => {
      assert.equal(canTransition('closed', 'merge'), false);
    });
  });

  describe('transition', () => {
    it('successfully transitions draft -> pending_review via submit', () => {
      const result = transition('draft', 'submit');
      assert.equal(result.success, true);
      assert.equal(result.from, 'draft');
      assert.equal(result.to, 'pending_review');
      assert.equal(result.error, undefined);
    });

    it('successfully transitions in_review -> approved via approve', () => {
      const result = transition('in_review', 'approve');
      assert.equal(result.success, true);
      assert.equal(result.to, 'approved');
    });

    it('successfully transitions in_review -> draft via request_changes', () => {
      const result = transition('in_review', 'request_changes');
      assert.equal(result.success, true);
      assert.equal(result.to, 'draft');
    });

    it('successfully transitions approved -> merged via merge', () => {
      const result = transition('approved', 'merge');
      assert.equal(result.success, true);
      assert.equal(result.to, 'merged');
    });

    it('successfully transitions closed -> draft via reopen', () => {
      const result = transition('closed', 'reopen');
      assert.equal(result.success, true);
      assert.equal(result.to, 'draft');
    });

    it('fails for invalid action in current state', () => {
      const result = transition('draft', 'merge');
      assert.equal(result.success, false);
      assert.equal(result.from, 'draft');
      assert.equal(result.to, undefined);
      assert.ok(result.error!.includes('not valid'));
      assert.ok(result.error!.includes('draft'));
    });

    it('includes available actions in error message', () => {
      const result = transition('draft', 'approve');
      assert.equal(result.success, false);
      assert.ok(result.error!.includes('submit'));
      assert.ok(result.error!.includes('close'));
    });

    it('fails for any action on merged state', () => {
      const result = transition('merged', 'close');
      assert.equal(result.success, false);
      assert.ok(result.error!.includes('not valid'));
    });

    describe('full workflow path: draft -> merged', () => {
      it('completes happy path', () => {
        let state: WorkflowState = 'draft';

        const r1 = transition(state, 'submit');
        assert.equal(r1.success, true);
        state = r1.to!;
        assert.equal(state, 'pending_review');

        const r2 = transition(state, 'start_review');
        assert.equal(r2.success, true);
        state = r2.to!;
        assert.equal(state, 'in_review');

        const r3 = transition(state, 'approve');
        assert.equal(r3.success, true);
        state = r3.to!;
        assert.equal(state, 'approved');

        const r4 = transition(state, 'merge');
        assert.equal(r4.success, true);
        state = r4.to!;
        assert.equal(state, 'merged');
      });
    });

    describe('rejection and revision cycle', () => {
      it('handles reject -> revise -> resubmit path', () => {
        let state: WorkflowState = 'in_review';

        const r1 = transition(state, 'reject');
        assert.equal(r1.success, true);
        state = r1.to!;
        assert.equal(state, 'rejected');

        const r2 = transition(state, 'revise');
        assert.equal(r2.success, true);
        state = r2.to!;
        assert.equal(state, 'draft');

        const r3 = transition(state, 'submit');
        assert.equal(r3.success, true);
        state = r3.to!;
        assert.equal(state, 'pending_review');
      });
    });

    describe('close and reopen cycle', () => {
      it('allows closing from any non-terminal state and reopening', () => {
        const closableStates: WorkflowState[] = ['draft', 'pending_review', 'in_review', 'approved', 'rejected'];
        for (const s of closableStates) {
          const r = transition(s, 'close');
          assert.equal(r.success, true, `Should be able to close from ${s}`);
          assert.equal(r.to, 'closed');
        }

        const reopen = transition('closed', 'reopen');
        assert.equal(reopen.success, true);
        assert.equal(reopen.to, 'draft');
      });
    });
  });

  describe('isTerminalState', () => {
    it('returns true for merged', () => {
      assert.equal(isTerminalState('merged'), true);
    });

    it('returns false for closed (can reopen)', () => {
      assert.equal(isTerminalState('closed'), false);
    });

    it('returns false for all non-terminal states', () => {
      const nonTerminal: WorkflowState[] = ['draft', 'pending_review', 'in_review', 'approved', 'rejected', 'closed'];
      for (const state of nonTerminal) {
        assert.equal(isTerminalState(state), false, `${state} should not be terminal`);
      }
    });
  });
});
