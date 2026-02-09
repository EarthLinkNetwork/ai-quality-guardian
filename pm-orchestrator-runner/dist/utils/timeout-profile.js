"use strict";
/**
 * Progress-Aware Timeout Profiles
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-TIMEOUT-1:
 * - idle_timeout: Triggers only when no progress events for specified duration
 * - hard_timeout: Absolute upper limit (safety)
 * - On hard_timeout: Set to AWAITING_RESPONSE with Resume option
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMEOUT_PROFILES = exports.EXTENDED_PROFILE = exports.LONG_PROFILE = exports.STANDARD_PROFILE = void 0;
exports.getTimeoutProfile = getTimeoutProfile;
exports.createCustomProfile = createCustomProfile;
exports.checkTimeout = checkTimeout;
exports.getRemainingTime = getRemainingTime;
exports.selectTimeoutProfile = selectTimeoutProfile;
/**
 * Standard timeout profile
 * - idle: 60s without progress
 * - hard: 10 minutes
 */
exports.STANDARD_PROFILE = {
    name: 'standard',
    idle_timeout_ms: 60_000, // 60 seconds
    hard_timeout_ms: 600_000, // 10 minutes
    description: 'Default profile for most tasks',
};
/**
 * Long timeout profile
 * - idle: 120s without progress
 * - hard: 30 minutes
 */
exports.LONG_PROFILE = {
    name: 'long',
    idle_timeout_ms: 120_000, // 2 minutes
    hard_timeout_ms: 1_800_000, // 30 minutes
    description: 'For tasks that may have long periods between progress updates',
};
/**
 * Extended timeout profile
 * - idle: 300s without progress
 * - hard: 60 minutes
 */
exports.EXTENDED_PROFILE = {
    name: 'extended',
    idle_timeout_ms: 300_000, // 5 minutes
    hard_timeout_ms: 3_600_000, // 60 minutes
    description: 'For long-running tasks like builds or comprehensive tests',
};
/**
 * All predefined profiles
 */
exports.TIMEOUT_PROFILES = {
    standard: exports.STANDARD_PROFILE,
    long: exports.LONG_PROFILE,
    extended: exports.EXTENDED_PROFILE,
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
function getTimeoutProfile(name) {
    return exports.TIMEOUT_PROFILES[name] || exports.STANDARD_PROFILE;
}
/**
 * Creates a custom timeout profile
 *
 * @param idle_timeout_ms - Idle timeout in milliseconds
 * @param hard_timeout_ms - Hard timeout in milliseconds
 * @returns Custom timeout profile
 */
function createCustomProfile(idle_timeout_ms, hard_timeout_ms) {
    return {
        name: 'custom',
        idle_timeout_ms,
        hard_timeout_ms,
        description: `Custom profile: idle=${idle_timeout_ms}ms, hard=${hard_timeout_ms}ms`,
    };
}
/**
 * Checks if a task has timed out based on the given profile
 *
 * @param startTime - Task start time (ISO string or Date)
 * @param lastProgressTime - Last progress event time (ISO string or Date)
 * @param profile - Timeout profile to use
 * @returns Timeout check result
 */
function checkTimeout(startTime, lastProgressTime, profile = exports.STANDARD_PROFILE) {
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
function getRemainingTime(startTime, lastProgressTime, profile = exports.STANDARD_PROFILE) {
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
function selectTimeoutProfile(options) {
    // Custom timeouts take precedence
    if (options.customTimeouts?.idle_timeout_ms && options.customTimeouts?.hard_timeout_ms) {
        return createCustomProfile(options.customTimeouts.idle_timeout_ms, options.customTimeouts.hard_timeout_ms);
    }
    // Auto-dev loops need extended timeouts
    if (options.isAutoDevLoop) {
        return exports.EXTENDED_PROFILE;
    }
    // Long-running operations (builds, tests)
    if (options.hasLongRunningOperations) {
        return exports.LONG_PROFILE;
    }
    // Default
    return exports.STANDARD_PROFILE;
}
//# sourceMappingURL=timeout-profile.js.map