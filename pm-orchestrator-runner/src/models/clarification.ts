/**
 * Clarification Type System
 *
 * Typed clarifications for Tier-0 Rule F and I compliance.
 * Each clarification has a type that determines the UI component used.
 */

import { match } from 'ts-pattern';

/**
 * ClarificationType - determines which UI to present.
 *
 * TARGET_FILE: File selection (InteractivePicker with file list)
 * SELECT_ONE:  Choose one option (InteractivePicker with options)
 * CONFIRM:     Yes/No confirmation (InteractivePicker with 2 options)
 * FREE_TEXT:   Open-ended input (readline)
 */
export enum ClarificationType {
  TARGET_FILE = 'TARGET_FILE',
  SELECT_ONE = 'SELECT_ONE',
  CONFIRM = 'CONFIRM',
  FREE_TEXT = 'FREE_TEXT',
}

/**
 * Map from ClarificationReason to ClarificationType.
 *
 * ClarificationReason is the existing reason-based system.
 * ClarificationType is the new type-based system for UI routing.
 */
export function reasonToType(reason: string): ClarificationType {
  return match(reason)
    .with('target_file_exists', () => ClarificationType.CONFIRM)
    .with('target_file_ambiguous', () => ClarificationType.TARGET_FILE)
    .with('target_action_ambiguous', () => ClarificationType.SELECT_ONE)
    .with('missing_required_info', () => ClarificationType.FREE_TEXT)
    .with('scope_unclear', () => ClarificationType.SELECT_ONE)
    .with('action_ambiguous', () => ClarificationType.SELECT_ONE)
    .with('missing_context', () => ClarificationType.FREE_TEXT)
    .otherwise(() => ClarificationType.FREE_TEXT);
}

/**
 * Structured clarification request.
 */
export interface ClarificationRequest {
  /** The question to ask the user */
  question: string;
  /** Type of clarification (determines UI) */
  type: ClarificationType;
  /** Available options (for SELECT_ONE, TARGET_FILE, CONFIRM) */
  options?: string[];
  /** Default value (auto-applied if semantic resolver matches) */
  defaultValue?: string;
  /** Original reason from the mediation layer */
  reason?: string;
}
