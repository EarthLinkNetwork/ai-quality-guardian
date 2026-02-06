/**
 * Progress-Aware Timeout Profiles
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-TIMEOUT-1:
 * - idle_timeout: Triggers only when no progress events for specified duration
 * - hard_timeout: Absolute upper limit (safety)
 * - On hard_timeout: Set to AWAITING_RESPONSE with Resume option
 */

/**
 * Timeout profile configuration
 */
export interface TimeoutProfile {
  /** Timeout triggered when no progress events for this duration (ms) */
  idle_timeout_ms: number;
  /** Absolute maximum execution time (ms) */
  hard_timeout_ms: number;
  /** Profile name for identification */
  name: 'standard' | 'long' | 'extended' | 'custom';
  /** Description of when to use this profile */
  description: string;
}

/**
 * Standard timeout profile
 * - idle: 60s without progress
 * - hard: 10 minutes
 */
export const STANDARD_PROFILE: TimeoutProfile = {
  name: 'standard',
  idle_timeout_ms: 60_000,    // 60 seconds
  hard_timeout_ms: 600_000,   // 10 minutes
  description: 'Default profile for most tasks',
};

/**
 * Long timeout profile
 * - idle: 120s without progress
 * - hard: 30 minutes
 */
export const LONG_PROFILE: TimeoutProfile = {
  name: 'long',
  idle_timeout_ms: 120_000,   // 2 minutes
  hard_timeout_ms: 1_800_000, // 30 minutes
  description: 'For tasks that may have long periods between progress updates',
};

/**
 * Extended timeout profile
 * - idle: 300s without progress
 * - hard: 60 minutes
 */
export const EXTENDED_PROFILE: TimeoutProfile = {
  name: 'extended',
  idle_timeout_ms: 300_000,   // 5 minutes
  hard_timeout_ms: 3_600_000, // 60 minutes
  description: 'For long-running tasks like builds or comprehensive tests',
};

/**
 * All predefined profiles
 */
export const TIMEOUT_PROFILES: Record<TimeoutProfile['name'], TimeoutProfile> = {
  standard: STANDARD_PROFILE,
  long: LONG_PROFILE,
  extended: EXTENDED_PROFILE,
  custom: {
    name: 'custom',
    idle_timeout_ms: 0,
    hard_timeout_ms: 0,
    description: 'Custom profile with user-defined values',
  },
};

/**
 * Gets a timeout profile by name
 *
 * @param name - Profile name
 * @returns The timeout profile
 */
export function getTimeoutProfile(name: TimeoutProfile['name']): TimeoutProfile {
  return TIMEOUT_PROFILES[name] || STANDARD_PROFILE;
}

/**
 * Creates a custom timeout profile
 *
 * @param idle_timeout_ms - Idle timeout in milliseconds
 * @param hard_timeout_ms - Hard timeout in milliseconds
 * @returns Custom timeout profile
 */
export function createCustomProfile(
  idle_timeout_ms: number,
  hard_timeout_ms: number
): TimeoutProfile {
  return {
    name: 'custom',
    idle_timeout_ms,
    hard_timeout_ms,
    description: `Custom profile: idle=${idle_timeout_ms}ms, hard=${hard_timeout_ms}ms`,
  };
}

/**
 * Timeout check result
 */
export interface TimeoutCheckResult {
  isTimedOut: boolean;
  timeoutType: 'idle' | 'hard' | 'none';
  elapsedSinceStart: number;
  elapsedSinceLastProgress: number;
  shouldSetAwaitingResponse: boolean;
}

/**
 * Checks if a task has timed out based on the given profile
 *
 * @param startTime - Task start time (ISO string or Date)
 * @param lastProgressTime - Last progress event time (ISO string or Date)
 * @param profile - Timeout profile to use
 * @returns Timeout check result
 */
export function checkTimeout(
  startTime: string | Date,
  lastProgressTime: string | Date,
  profile: TimeoutProfile = STANDARD_PROFILE
): TimeoutCheckResult {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const lastProgress = new Date(lastProgressTime).getTime();

  const elapsedSinceStart = now - start;
  const elapsedSinceLastProgress = now - lastProgress;

  // Check hard timeout first (absolute limit)
  if (elapsedSinceStart >= profile.hard_timeout_ms) {
    return {
      isTimedOut: true,
      timeoutType: 'hard',
      elapsedSinceStart,
      elapsedSinceLastProgress,
      shouldSetAwaitingResponse: true, // Per AC-TIMEOUT-1
    };
  }

  // Check idle timeout (no progress)
  if (elapsedSinceLastProgress >= profile.idle_timeout_ms) {
    return {
      isTimedOut: true,
      timeoutType: 'idle',
      elapsedSinceStart,
      elapsedSinceLastProgress,
      shouldSetAwaitingResponse: true, // Per AC-TIMEOUT-1
    };
  }

  return {
    isTimedOut: false,
    timeoutType: 'none',
    elapsedSinceStart,
    elapsedSinceLastProgress,
    shouldSetAwaitingResponse: false,
  };
}

/**
 * Calculates remaining time until timeout
 *
 * @param startTime - Task start time
 * @param lastProgressTime - Last progress event time
 * @param profile - Timeout profile to use
 * @returns Remaining milliseconds until next timeout (-1 if already timed out)
 */
export function getRemainingTime(
  startTime: string | Date,
  lastProgressTime: string | Date,
  profile: TimeoutProfile = STANDARD_PROFILE
): {
  untilIdleTimeout: number;
  untilHardTimeout: number;
  nextTimeout: number;
  nextTimeoutType: 'idle' | 'hard';
} {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const lastProgress = new Date(lastProgressTime).getTime();

  const untilHardTimeout = profile.hard_timeout_ms - (now - start);
  const untilIdleTimeout = profile.idle_timeout_ms - (now - lastProgress);

  const nextTimeoutType = untilIdleTimeout <= untilHardTimeout ? 'idle' : 'hard';
  const nextTimeout = Math.min(untilIdleTimeout, untilHardTimeout);

  return {
    untilIdleTimeout: Math.max(0, untilIdleTimeout),
    untilHardTimeout: Math.max(0, untilHardTimeout),
    nextTimeout: Math.max(0, nextTimeout),
    nextTimeoutType,
  };
}

/**
 * Selects an appropriate timeout profile based on task characteristics
 *
 * @param options - Task characteristics
 * @returns Recommended timeout profile
 */
export function selectTimeoutProfile(options: {
  taskType?: string;
  hasLongRunningOperations?: boolean;
  isAutoDevLoop?: boolean;
  customTimeouts?: { idle_timeout_ms?: number; hard_timeout_ms?: number };
}): TimeoutProfile {
  // Custom timeouts take precedence
  if (options.customTimeouts?.idle_timeout_ms && options.customTimeouts?.hard_timeout_ms) {
    return createCustomProfile(
      options.customTimeouts.idle_timeout_ms,
      options.customTimeouts.hard_timeout_ms
    );
  }

  // Auto-dev loops need extended timeouts
  if (options.isAutoDevLoop) {
    return EXTENDED_PROFILE;
  }

  // Long-running operations (builds, tests)
  if (options.hasLongRunningOperations) {
    return LONG_PROFILE;
  }

  // Default
  return STANDARD_PROFILE;
}
