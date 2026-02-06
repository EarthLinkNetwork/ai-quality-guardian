/**
 * Unit Tests for Timeout Profile
 *
 * Per docs/spec/WEB_COMPLETE_OPERATION.md AC-TIMEOUT-1
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import {
  STANDARD_PROFILE,
  LONG_PROFILE,
  EXTENDED_PROFILE,
  getTimeoutProfile,
  createCustomProfile,
  checkTimeout,
  getRemainingTime,
  selectTimeoutProfile,
  TimeoutProfile,
} from '../../../src/utils/timeout-profile';

describe('timeout-profile', () => {
  describe('predefined profiles', () => {
    it('should have correct STANDARD_PROFILE values', () => {
      assert.strictEqual(STANDARD_PROFILE.name, 'standard');
      assert.strictEqual(STANDARD_PROFILE.idle_timeout_ms, 60_000);
      assert.strictEqual(STANDARD_PROFILE.hard_timeout_ms, 600_000);
    });

    it('should have correct LONG_PROFILE values', () => {
      assert.strictEqual(LONG_PROFILE.name, 'long');
      assert.strictEqual(LONG_PROFILE.idle_timeout_ms, 120_000);
      assert.strictEqual(LONG_PROFILE.hard_timeout_ms, 1_800_000);
    });

    it('should have correct EXTENDED_PROFILE values', () => {
      assert.strictEqual(EXTENDED_PROFILE.name, 'extended');
      assert.strictEqual(EXTENDED_PROFILE.idle_timeout_ms, 300_000);
      assert.strictEqual(EXTENDED_PROFILE.hard_timeout_ms, 3_600_000);
    });
  });

  describe('getTimeoutProfile', () => {
    it('should return standard profile by name', () => {
      const profile = getTimeoutProfile('standard');
      assert.deepStrictEqual(profile, STANDARD_PROFILE);
    });

    it('should return long profile by name', () => {
      const profile = getTimeoutProfile('long');
      assert.deepStrictEqual(profile, LONG_PROFILE);
    });

    it('should return extended profile by name', () => {
      const profile = getTimeoutProfile('extended');
      assert.deepStrictEqual(profile, EXTENDED_PROFILE);
    });
  });

  describe('createCustomProfile', () => {
    it('should create custom profile with specified values', () => {
      const profile = createCustomProfile(45_000, 900_000);

      assert.strictEqual(profile.name, 'custom');
      assert.strictEqual(profile.idle_timeout_ms, 45_000);
      assert.strictEqual(profile.hard_timeout_ms, 900_000);
      assert.ok(profile.description.includes('45000'));
      assert.ok(profile.description.includes('900000'));
    });
  });

  describe('checkTimeout', () => {
    it('should detect idle timeout', () => {
      const now = Date.now();
      const twoMinutesAgo = new Date(now - 2 * 60 * 1000);
      // Started 2 min ago, last progress 2 min ago (> 60s idle)
      const result = checkTimeout(twoMinutesAgo, twoMinutesAgo, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, true);
      assert.strictEqual(result.timeoutType, 'idle');
      assert.strictEqual(result.shouldSetAwaitingResponse, true);
    });

    it('should detect hard timeout', () => {
      const now = Date.now();
      const elevenMinutesAgo = new Date(now - 11 * 60 * 1000);
      const thirtySecsAgo = new Date(now - 30 * 1000);
      // Started 11 minutes ago (> 10 min hard timeout)
      const result = checkTimeout(elevenMinutesAgo, thirtySecsAgo, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, true);
      assert.strictEqual(result.timeoutType, 'hard');
      assert.strictEqual(result.shouldSetAwaitingResponse, true);
    });

    it('should not timeout with recent progress', () => {
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const tenSecsAgo = new Date(now - 10 * 1000);
      // Started 5 min ago, last progress 10s ago (< 60s idle, < 10 min hard)
      const result = checkTimeout(fiveMinutesAgo, tenSecsAgo, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, false);
      assert.strictEqual(result.timeoutType, 'none');
      assert.strictEqual(result.shouldSetAwaitingResponse, false);
    });

    it('should prioritize hard timeout over idle', () => {
      const now = Date.now();
      const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
      const threeMinutesAgo = new Date(now - 3 * 60 * 1000);
      // Started 15 minutes ago, last progress 3 min ago
      // Both idle (180s > 60s) and hard (15min > 10min) timeout
      const result = checkTimeout(fifteenMinutesAgo, threeMinutesAgo, STANDARD_PROFILE);

      assert.strictEqual(result.isTimedOut, true);
      // Hard timeout should be detected first
      assert.strictEqual(result.timeoutType, 'hard');
    });

    it('should work with string dates', () => {
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const tenSecsAgo = new Date(now - 10 * 1000);
      const result = checkTimeout(
        fiveMinutesAgo.toISOString(),
        tenSecsAgo.toISOString(),
        STANDARD_PROFILE
      );

      assert.strictEqual(result.isTimedOut, false);
    });
  });

  describe('getRemainingTime', () => {
    it('should calculate remaining time until timeout', () => {
      const now = Date.now();
      const twoMinutesAgo = new Date(now - 2 * 60 * 1000);
      const thirtySecsAgo = new Date(now - 30 * 1000);
      const result = getRemainingTime(twoMinutesAgo, thirtySecsAgo, STANDARD_PROFILE);

      // Remaining idle: 60s - 30s = ~30s
      assert.ok(result.untilIdleTimeout > 0, 'untilIdleTimeout should be > 0');
      assert.ok(result.untilIdleTimeout <= 31_000, 'untilIdleTimeout should be <= 31s');

      // Remaining hard: 10min - 2min = ~8min
      assert.ok(result.untilHardTimeout > 0, 'untilHardTimeout should be > 0');
      assert.ok(result.untilHardTimeout <= 8 * 60 * 1000 + 1000, 'untilHardTimeout should be <= 8min');
    });

    it('should identify next timeout type', () => {
      const now = Date.now();
      const twoMinutesAgo = new Date(now - 2 * 60 * 1000);
      const thirtySecsAgo = new Date(now - 30 * 1000);
      const result = getRemainingTime(twoMinutesAgo, thirtySecsAgo, STANDARD_PROFILE);

      // Idle timeout comes first (30s vs 8 min)
      assert.strictEqual(result.nextTimeoutType, 'idle');
      assert.ok(result.nextTimeout <= 31_000);
    });

    it('should return 0 for expired timeouts', () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
      const result = getRemainingTime(tenMinutesAgo, tenMinutesAgo, STANDARD_PROFILE);

      assert.strictEqual(result.untilIdleTimeout, 0);
      assert.strictEqual(result.untilHardTimeout, 0);
      assert.strictEqual(result.nextTimeout, 0);
    });
  });

  describe('selectTimeoutProfile', () => {
    it('should return standard profile by default', () => {
      const profile = selectTimeoutProfile({});
      assert.deepStrictEqual(profile, STANDARD_PROFILE);
    });

    it('should return extended profile for auto-dev loop', () => {
      const profile = selectTimeoutProfile({ isAutoDevLoop: true });
      assert.deepStrictEqual(profile, EXTENDED_PROFILE);
    });

    it('should return long profile for long-running operations', () => {
      const profile = selectTimeoutProfile({ hasLongRunningOperations: true });
      assert.deepStrictEqual(profile, LONG_PROFILE);
    });

    it('should use custom timeouts when provided', () => {
      const profile = selectTimeoutProfile({
        customTimeouts: {
          idle_timeout_ms: 90_000,
          hard_timeout_ms: 1_200_000,
        },
      });

      assert.strictEqual(profile.name, 'custom');
      assert.strictEqual(profile.idle_timeout_ms, 90_000);
      assert.strictEqual(profile.hard_timeout_ms, 1_200_000);
    });

    it('should prioritize custom timeouts over other options', () => {
      const profile = selectTimeoutProfile({
        isAutoDevLoop: true,
        hasLongRunningOperations: true,
        customTimeouts: {
          idle_timeout_ms: 30_000,
          hard_timeout_ms: 300_000,
        },
      });

      assert.strictEqual(profile.name, 'custom');
      assert.strictEqual(profile.idle_timeout_ms, 30_000);
    });
  });
});
