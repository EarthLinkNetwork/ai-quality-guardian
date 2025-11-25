/**
 * PM Orchestrator Enhancement - ErrorHandler Unit Tests
 */

import { ErrorHandler } from '../../../src/error/error-handler';
import { ErrorType } from '../../../src/error/error-types';

describe('ErrorHandler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('classify', () => {
    it('should classify network error', () => {
      const error = new Error('Network connection failed');
      expect(handler.classify(error)).toBe(ErrorType.NETWORK_ERROR);
    });

    it('should classify timeout error', () => {
      const error = new Error('Request timeout after 5000ms');
      expect(handler.classify(error)).toBe(ErrorType.TIMEOUT);
    });

    it('should classify temporary failure', () => {
      const error = new Error('Service temporarily unavailable');
      expect(handler.classify(error)).toBe(ErrorType.TEMPORARY_FAILURE);
    });

    it('should classify lint error', () => {
      const error = new Error('ESLint found 3 errors');
      expect(handler.classify(error)).toBe(ErrorType.LINT_ERROR);
    });

    it('should classify format error', () => {
      const error = new Error('Prettier format check failed');
      expect(handler.classify(error)).toBe(ErrorType.FORMAT_ERROR);
    });

    it('should classify test failure', () => {
      const error = new Error('Jest test suite failed');
      expect(handler.classify(error)).toBe(ErrorType.TEST_FAILURE);
    });

    it('should classify build failure', () => {
      const error = new Error('Build compilation error');
      expect(handler.classify(error)).toBe(ErrorType.BUILD_FAILURE);
    });

    it('should classify rule violation', () => {
      const error = new Error('MUST Rule 1 violation detected');
      expect(handler.classify(error)).toBe(ErrorType.RULE_VIOLATION);
    });

    it('should classify design mismatch', () => {
      const error = new Error('Design specification mismatch');
      expect(handler.classify(error)).toBe(ErrorType.DESIGN_MISMATCH);
    });

    it('should classify dependency error', () => {
      const error = new Error('Module dependency not found');
      expect(handler.classify(error)).toBe(ErrorType.DEPENDENCY_ERROR);
    });

    it('should classify unknown error', () => {
      const error = new Error('Something went wrong');
      expect(handler.classify(error)).toBe(ErrorType.UNKNOWN);
    });
  });

  describe('canRetry', () => {
    it('should return true for network error', () => {
      expect(handler.canRetry(ErrorType.NETWORK_ERROR)).toBe(true);
    });

    it('should return true for timeout', () => {
      expect(handler.canRetry(ErrorType.TIMEOUT)).toBe(true);
    });

    it('should return true for temporary failure', () => {
      expect(handler.canRetry(ErrorType.TEMPORARY_FAILURE)).toBe(true);
    });

    it('should return false for lint error', () => {
      expect(handler.canRetry(ErrorType.LINT_ERROR)).toBe(false);
    });

    it('should return false for test failure', () => {
      expect(handler.canRetry(ErrorType.TEST_FAILURE)).toBe(false);
    });
  });

  describe('canAutoFix', () => {
    it('should return true for lint error', () => {
      expect(handler.canAutoFix(ErrorType.LINT_ERROR)).toBe(true);
    });

    it('should return true for format error', () => {
      expect(handler.canAutoFix(ErrorType.FORMAT_ERROR)).toBe(true);
    });

    it('should return false for network error', () => {
      expect(handler.canAutoFix(ErrorType.NETWORK_ERROR)).toBe(false);
    });

    it('should return false for test failure', () => {
      expect(handler.canAutoFix(ErrorType.TEST_FAILURE)).toBe(false);
    });
  });

  describe('needsRollback', () => {
    it('should return true for test failure', () => {
      expect(handler.needsRollback(ErrorType.TEST_FAILURE)).toBe(true);
    });

    it('should return true for build failure', () => {
      expect(handler.needsRollback(ErrorType.BUILD_FAILURE)).toBe(true);
    });

    it('should return false for lint error', () => {
      expect(handler.needsRollback(ErrorType.LINT_ERROR)).toBe(false);
    });

    it('should return false for network error', () => {
      expect(handler.needsRollback(ErrorType.NETWORK_ERROR)).toBe(false);
    });
  });

  describe('needsUserIntervention', () => {
    it('should return true for rule violation', () => {
      expect(handler.needsUserIntervention(ErrorType.RULE_VIOLATION)).toBe(true);
    });

    it('should return true for design mismatch', () => {
      expect(handler.needsUserIntervention(ErrorType.DESIGN_MISMATCH)).toBe(true);
    });

    it('should return true for dependency error', () => {
      expect(handler.needsUserIntervention(ErrorType.DEPENDENCY_ERROR)).toBe(true);
    });

    it('should return true for unknown error', () => {
      expect(handler.needsUserIntervention(ErrorType.UNKNOWN)).toBe(true);
    });

    it('should return false for network error', () => {
      expect(handler.needsUserIntervention(ErrorType.NETWORK_ERROR)).toBe(false);
    });

    it('should return false for lint error', () => {
      expect(handler.needsUserIntervention(ErrorType.LINT_ERROR)).toBe(false);
    });
  });
});
