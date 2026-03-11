/**
 * Workflow state machine.
 * Pure functions for managing workflow state transitions.
 */

export type WorkflowState =
  | 'draft'
  | 'pending_review'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'merged'
  | 'closed';

export type WorkflowAction =
  | 'submit'
  | 'start_review'
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'merge'
  | 'close'
  | 'reopen'
  | 'revise';

export type TransitionResult = {
  success: boolean;
  from: WorkflowState;
  to?: WorkflowState;
  error?: string;
};

const TRANSITIONS: Record<WorkflowState, Partial<Record<WorkflowAction, WorkflowState>>> = {
  draft: {
    submit: 'pending_review',
    close: 'closed',
  },
  pending_review: {
    start_review: 'in_review',
    close: 'closed',
  },
  in_review: {
    approve: 'approved',
    reject: 'rejected',
    request_changes: 'draft',
    close: 'closed',
  },
  approved: {
    merge: 'merged',
    close: 'closed',
  },
  rejected: {
    revise: 'draft',
    close: 'closed',
  },
  merged: {},
  closed: {
    reopen: 'draft',
  },
};

/**
 * Get all valid actions for a given state.
 */
export function getAvailableActions(state: WorkflowState): WorkflowAction[] {
  const stateTransitions = TRANSITIONS[state];
  if (!stateTransitions) {
    return [];
  }
  return Object.keys(stateTransitions) as WorkflowAction[];
}

/**
 * Check if a transition is valid without performing it.
 */
export function canTransition(currentState: WorkflowState, action: WorkflowAction): boolean {
  const stateTransitions = TRANSITIONS[currentState];
  if (!stateTransitions) {
    return false;
  }
  return action in stateTransitions;
}

/**
 * Perform a state transition. Returns the result with success/failure.
 */
export function transition(currentState: WorkflowState, action: WorkflowAction): TransitionResult {
  const stateTransitions = TRANSITIONS[currentState];
  if (!stateTransitions) {
    return {
      success: false,
      from: currentState,
      error: `Unknown state: "${currentState}"`,
    };
  }

  const nextState = stateTransitions[action];
  if (nextState === undefined) {
    const available = getAvailableActions(currentState);
    return {
      success: false,
      from: currentState,
      error: `Action "${action}" is not valid in state "${currentState}". Available actions: [${available.join(', ')}]`,
    };
  }

  return {
    success: true,
    from: currentState,
    to: nextState,
  };
}

/**
 * Check if a state is a terminal (final) state.
 */
export function isTerminalState(state: WorkflowState): boolean {
  return getAvailableActions(state).length === 0;
}
