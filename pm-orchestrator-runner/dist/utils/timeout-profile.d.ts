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
export declare const STANDARD_PROFILE: TimeoutProfile;
/**
 * Long timeout profile
 * - idle: 120s without progress
 * - hard: 30 minutes
 */
export declare const LONG_PROFILE: TimeoutProfile;
/**
 * Extended timeout profile
 * - idle: 300s without progress
 * - hard: 60 minutes
 */
export declare const EXTENDED_PROFILE: TimeoutProfile;
/**
 * All predefined profiles
 */
export declare const TIMEOUT_PROFILES: Record<TimeoutProfile['name'], TimeoutProfile>;
/**
 * Gets a timeout profile by name
 *
 * @param name - Profile name
 * @returns The timeout profile
 */
export declare function getTimeoutProfile(name: TimeoutProfile['name']): TimeoutProfile;
/**
 * Creates a custom timeout profile
 *
 * @param idle_timeout_ms - Idle timeout in milliseconds
 * @param hard_timeout_ms - Hard timeout in milliseconds
 * @returns Custom timeout profile
 */
export declare function createCustomProfile(idle_timeout_ms: number, hard_timeout_ms: number): TimeoutProfile;
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
export declare function checkTimeout(startTime: string | Date, lastProgressTime: string | Date, profile?: TimeoutProfile): TimeoutCheckResult;
/**
 * Calculates remaining time until timeout
 *
 * @param startTime - Task start time
 * @param lastProgressTime - Last progress event time
 * @param profile - Timeout profile to use
 * @returns Remaining milliseconds until next timeout (-1 if already timed out)
 */
export declare function getRemainingTime(startTime: string | Date, lastProgressTime: string | Date, profile?: TimeoutProfile): {
    untilIdleTimeout: number;
    untilHardTimeout: number;
    nextTimeout: number;
    nextTimeoutType: 'idle' | 'hard';
};
/**
 * Selects an appropriate timeout profile based on task characteristics
 *
 * @param options - Task characteristics
 * @returns Recommended timeout profile
 */
export declare function selectTimeoutProfile(options: {
    taskType?: string;
    hasLongRunningOperations?: boolean;
    isAutoDevLoop?: boolean;
    customTimeouts?: {
        idle_timeout_ms?: number;
        hard_timeout_ms?: number;
    };
}): TimeoutProfile;
//# sourceMappingURL=timeout-profile.d.ts.map