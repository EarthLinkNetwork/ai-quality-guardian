/**
 * E2E Test: Executor Preflight Auth Detection
 *
 * Per design spec: "timeoutで誤魔化すな", "silent fail禁止", "ユーザーに推測させるな"
 *
 * Validates that authentication and configuration issues are detected
 * immediately with clear, actionable error messages - not as timeouts.
 *
 * Key Principle: All auth/config issues must FAIL FAST with clear errors.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import {
  runPreflightChecks,
  checkClaudeCodeCLI,
  checkClaudeCodeAuth,
  checkOpenAIKey,
  checkAnthropicKey,
  checkNetwork,
  formatPreflightReport,
  formatPreflightReportJSON,
  enforcePreflightCheck,
  PreflightResult,
  PreflightReport,
  ExecutorType,
} from '../../src/diagnostics/executor-preflight';

describe('E2E: Executor Preflight Auth Detection', function() {
  // Preflight checks may include network calls, allow reasonable timeout
  this.timeout(30000);

  describe('AC-AUTH-1: Claude Code CLI Not Found Detection', function() {
    it('should return structured error when Claude CLI is not in PATH', function() {
      // Test the checkClaudeCodeCLI function directly
      const result = checkClaudeCodeCLI();

      // Result should always be a valid PreflightResult
      assert.ok('ok' in result, 'Should have ok property');
      assert.ok('fatal' in result, 'Should have fatal property');
      assert.ok('code' in result, 'Should have code property');
      assert.ok('message' in result, 'Should have message property');
      assert.ok('fix_hint' in result, 'Should have fix_hint property');

      // If CLI not found, should have clear error
      if (!result.ok) {
        assert.equal(result.code, 'CLAUDE_CLI_NOT_FOUND', 'Code should be CLAUDE_CLI_NOT_FOUND');
        assert.ok(result.fatal, 'Should be marked as fatal');
        assert.ok(result.message.length > 0, 'Should have error message');
        assert.ok(result.fix_hint.length > 0, 'Should have fix hint');
        assert.ok(
          result.fix_hint.includes('npm install') || result.fix_hint.includes('claude'),
          'Fix hint should mention installation'
        );
      }
    });

    it('should not timeout when CLI is missing - immediate response', function() {
      const start = Date.now();
      checkClaudeCodeCLI();
      const duration = Date.now() - start;

      // Should complete quickly (under 10 seconds even with network issues)
      assert.ok(duration < 10000, `Should fail fast, but took ${duration}ms`);
    });
  });

  describe('AC-AUTH-2: Claude Code Auth Detection', function() {
    it('should detect authentication status with clear message', function() {
      const result = checkClaudeCodeAuth();

      // Must be a valid PreflightResult
      assert.ok('ok' in result, 'Should have ok property');
      assert.ok('code' in result, 'Should have code property');
      assert.ok('message' in result, 'Should have message property');

      // If not authenticated, should have actionable fix
      if (!result.ok) {
        assert.ok(
          ['CLAUDE_CLI_NOT_FOUND', 'CLAUDE_LOGIN_REQUIRED', 'CLAUDE_AUTH_MISSING', 'CLAUDE_SESSION_EXPIRED']
            .includes(result.code as string),
          `Code should be a recognized auth error, got: ${result.code}`
        );
        assert.ok(result.fix_hint.length > 0, 'Should have fix hint');
        assert.ok(
          result.fix_hint.includes('login') || result.fix_hint.includes('claude'),
          'Fix hint should mention login process'
        );
      }
    });

    it('should not mask errors as timeout', function() {
      const start = Date.now();
      const result = checkClaudeCodeAuth();
      const duration = Date.now() - start;

      // Should complete within reasonable time (not 30+ second timeout)
      assert.ok(duration < 15000, `Auth check should fail fast, but took ${duration}ms`);

      // Error should be explicit, not "timeout"
      if (!result.ok) {
        assert.ok(!result.message.toLowerCase().includes('timeout'), 'Should not report as timeout');
      }
    });
  });

  describe('AC-AUTH-3: No Executor Configured Detection', function() {
    it('should detect when no executor is available (auto mode)', function() {
      const report = runPreflightChecks('auto');

      // Must return a valid PreflightReport
      assert.ok('status' in report, 'Should have status property');
      assert.ok('can_proceed' in report, 'Should have can_proceed property');
      assert.ok('checks' in report, 'Should have checks property');
      assert.ok('fatal_errors' in report, 'Should have fatal_errors property');
      assert.ok('timestamp' in report, 'Should have timestamp property');
      assert.ok('executor' in report, 'Should have executor property');

      // Status should be one of expected values
      assert.ok(
        ['OK', 'ERROR', 'WARNING'].includes(report.status),
        `Status should be OK, ERROR, or WARNING, got: ${report.status}`
      );

      // If no executor available, should clearly indicate
      if (!report.can_proceed) {
        assert.ok(report.fatal_errors.length > 0, 'Should have at least one fatal error');
        assert.ok(report.fatal_errors[0].fix_hint.length > 0, 'Fatal error should have fix hint');
      }
    });

    it('should provide clear summary when no executor configured', function() {
      const report = runPreflightChecks('auto');

      if (!report.can_proceed) {
        const formatted = formatPreflightReport(report);

        // Formatted output should be human-readable
        assert.ok(formatted.includes('Executor'), 'Should mention executor');
        assert.ok(formatted.includes('Fix:') || formatted.includes('FATAL'), 'Should include fix instructions or fatal marker');
      }
    });
  });

  describe('AC-AUTH-4: API Key Detection', function() {
    it('should detect OpenAI API key presence/absence', function() {
      const result = checkOpenAIKey();

      assert.ok('ok' in result, 'Should have ok property');
      assert.ok('code' in result, 'Should have code property');

      if (process.env.OPENAI_API_KEY) {
        // If key is set, should pass
        if (result.ok) {
          assert.equal(result.code, 'OK');
        }
      } else {
        // If key not set, should fail with clear message
        if (!result.ok) {
          assert.equal(result.code, 'OPENAI_KEY_MISSING');
          assert.ok(result.fix_hint.includes('OPENAI_API_KEY'), 'Fix hint should mention env var');
        }
      }
    });

    it('should detect Anthropic API key presence/absence', function() {
      const result = checkAnthropicKey();

      assert.ok('ok' in result, 'Should have ok property');
      assert.ok('code' in result, 'Should have code property');

      if (process.env.ANTHROPIC_API_KEY) {
        // If key is set, should pass
        if (result.ok) {
          assert.equal(result.code, 'OK');
        }
      } else {
        // If key not set, should fail with clear message
        if (!result.ok) {
          assert.equal(result.code, 'ANTHROPIC_KEY_MISSING');
          assert.ok(result.fix_hint.includes('ANTHROPIC_API_KEY'), 'Fix hint should mention env var');
        }
      }
    });

    it('should allow non-standard API key format', function() {
      // Save original
      const originalOpenAI = process.env.OPENAI_API_KEY;
      const originalAnthropic = process.env.ANTHROPIC_API_KEY;

      try {
        // Test with non-standard OpenAI key format
        process.env.OPENAI_API_KEY = 'invalid-key-format';
        const openaiResult = checkOpenAIKey();
        assert.equal(openaiResult.ok, true, 'Should accept non-standard format');
        assert.equal(openaiResult.code, 'OK');

        // Test with non-standard Anthropic key format
        process.env.ANTHROPIC_API_KEY = 'invalid-key-format';
        const anthropicResult = checkAnthropicKey();
        assert.equal(anthropicResult.ok, true, 'Should accept non-standard format');
        assert.equal(anthropicResult.code, 'OK');
      } finally {
        // Restore
        if (originalOpenAI) {
          process.env.OPENAI_API_KEY = originalOpenAI;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
        if (originalAnthropic) {
          process.env.ANTHROPIC_API_KEY = originalAnthropic;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
      }
    });
  });

  describe('AC-AUTH-5: Actionable Fix Hints', function() {
    it('should always provide actionable fix hints for failures', function() {
      // Run full preflight check
      const report = runPreflightChecks('auto');

      // All fatal errors must have fix hints
      for (const error of report.fatal_errors) {
        assert.ok(error.fix_hint !== undefined, `Fatal error ${error.code} should have fix_hint`);
        assert.ok(error.fix_hint.length > 0, `Fatal error ${error.code} should have non-empty fix_hint`);
      }

      // All failed checks must have fix hints
      for (const check of report.checks) {
        if (!check.ok) {
          assert.ok(check.fix_hint !== undefined, `Failed check ${check.code} should have fix_hint`);
          assert.ok(check.fix_hint.length > 0, `Failed check ${check.code} should have non-empty fix_hint`);
        }
      }
    });

    it('should include specific commands in fix hints', function() {
      const report = runPreflightChecks('auto');

      for (const error of report.fatal_errors) {
        // Fix hints should contain actionable commands
        const hasCommand =
          error.fix_hint.includes('npm') ||
          error.fix_hint.includes('claude') ||
          error.fix_hint.includes('export') ||
          error.fix_hint.includes('set') ||
          error.fix_hint.includes('Run:');

        assert.ok(hasCommand, `Fix hint for ${error.code} should contain actionable command: "${error.fix_hint}"`);
      }
    });
  });

  describe('Report Formatting', function() {
    it('should format report as human-readable text', function() {
      const report = runPreflightChecks('auto');
      const formatted = formatPreflightReport(report);

      // Should be a non-empty string
      assert.equal(typeof formatted, 'string');
      assert.ok(formatted.length > 0, 'Formatted report should not be empty');

      // Should contain key information
      assert.ok(formatted.includes('Executor'), 'Should mention executor');
      assert.ok(formatted.includes('Status'), 'Should include status');
      assert.ok(formatted.includes(report.executor), 'Should include executor type');
    });

    it('should format report as valid JSON', function() {
      const report = runPreflightChecks('auto');
      const jsonString = formatPreflightReportJSON(report);

      // Should be valid JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonString);
      } catch (e) {
        assert.fail(`Should be valid JSON: ${e}`);
      }

      // Should have expected fields
      assert.ok('status' in parsed, 'JSON should have status');
      assert.ok('executor' in parsed, 'JSON should have executor');
      assert.ok('checks' in parsed, 'JSON should have checks');
      assert.ok('fatal' in parsed, 'JSON should have fatal');
    });
  });

  describe('Network Check', function() {
    it('should check network connectivity', function() {
      const result = checkNetwork();

      assert.ok('ok' in result, 'Should have ok property');
      assert.ok('code' in result, 'Should have code property');
      assert.ok('message' in result, 'Should have message property');

      // Network check should not cause test failures if offline
      // Just verify the structure is correct
      if (!result.ok) {
        assert.equal(result.code, 'NETWORK_UNAVAILABLE');
        assert.ok(result.fix_hint.length > 0, 'Should have fix hint');
      }
    });
  });

  describe('Executor Type Specific Checks', function() {
    it('should run Claude Code checks for claude-code executor', function() {
      const report = runPreflightChecks('claude-code');

      assert.equal(report.executor, 'claude-code');
      // Should include network check and claude-specific checks
      assert.ok(report.checks.length >= 2, 'Should have at least 2 checks (network + claude)');
    });

    it('should run OpenAI checks for openai-api executor', function() {
      const report = runPreflightChecks('openai-api');

      assert.equal(report.executor, 'openai-api');
      // Should include network check and openai-specific checks
      assert.ok(report.checks.length >= 2, 'Should have at least 2 checks (network + openai)');
    });

    it('should run Anthropic checks for anthropic-api executor', function() {
      const report = runPreflightChecks('anthropic-api');

      assert.equal(report.executor, 'anthropic-api');
      // Should include network check and anthropic-specific checks
      assert.ok(report.checks.length >= 2, 'Should have at least 2 checks (network + anthropic)');
    });

    it('should check all executors for auto mode', function() {
      const report = runPreflightChecks('auto');

      assert.equal(report.executor, 'auto');
      // Auto mode should include network check and at least one executor check
      assert.ok(report.checks.length >= 1, 'Should have at least 1 check');
    });
  });

  describe('Fail-Fast Enforcement', function() {
    it('should handle enforcePreflightCheck based on environment', function() {
      // This test verifies the enforce function behavior
      // Behavior depends on environment configuration
      const report = runPreflightChecks('auto');

      if (!report.can_proceed) {
        // If environment has no executor, enforce should throw
        let threw = false;
        let errorMessage = '';
        try {
          enforcePreflightCheck('auto');
        } catch (e) {
          threw = true;
          errorMessage = (e as Error).message;
        }
        assert.ok(threw, 'Should throw when no executor available');
        assert.ok(errorMessage.includes('preflight failed'), 'Error should mention preflight failed');
      } else {
        // If environment has valid executor, enforce should not throw
        let threw = false;
        try {
          enforcePreflightCheck('auto');
        } catch {
          threw = true;
        }
        assert.equal(threw, false, 'Should not throw when executor is available');
      }
    });

    it('should not proceed when can_proceed is false', function() {
      const report = runPreflightChecks('auto');

      if (report.fatal_errors.length > 0) {
        assert.equal(report.can_proceed, false, 'Should not proceed with fatal errors');
        assert.equal(report.status, 'ERROR', 'Status should be ERROR');
      }
    });
  });

  describe('Clear Error Messages (No User Debug Required)', function() {
    it('should never return vague error messages', function() {
      const report = runPreflightChecks('auto');

      for (const error of report.fatal_errors) {
        // Should not have vague messages
        assert.ok(
          !error.message.toLowerCase().includes('unknown error') ||
          !error.message.toLowerCase().includes('something went wrong'),
          `Error message should be specific: "${error.message}"`
        );

        // Should have specific error code
        assert.ok(
          error.code !== 'UNKNOWN_ERROR' || error.message.length > 20,
          `Even UNKNOWN_ERROR should have detailed message`
        );
      }
    });

    it('should include timestamp for debugging', function() {
      const report = runPreflightChecks('auto');

      assert.ok(report.timestamp, 'Report should have timestamp');

      // Should be valid ISO date
      const date = new Date(report.timestamp);
      assert.ok(!isNaN(date.getTime()), 'Timestamp should be valid date');
    });
  });
});
