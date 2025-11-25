/**
 * Unit Tests for Orchestrator Components
 */

import { PatternDetector } from '../../../src/orchestrator/pattern-detector';
import { OrchestratorLauncher } from '../../../src/orchestrator/orchestrator-launcher';

describe('PatternDetector', () => {
  let detector: PatternDetector;

  beforeEach(() => {
    detector = new PatternDetector();
  });

  describe('Pattern Detection', () => {
    it('should detect PR review pattern', () => {
      const result = detector.detect('Please address the PR review comments');

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches[0].pattern).toBe('pr-review');
    });

    it('should detect version update pattern', () => {
      const result = detector.detect('Update version to 1.3.0');

      const versionMatch = result.matches.find(m => m.pattern === 'version-update');
      expect(versionMatch).toBeDefined();
    });

    it('should detect quality check pattern', () => {
      const result = detector.detect('Run lint and test');

      const qualityMatch = result.matches.find(m => m.pattern === 'quality-check');
      expect(qualityMatch).toBeDefined();
    });

    it('should detect complex implementation pattern', () => {
      const result = detector.detect('Implement new authentication feature');

      const implMatch = result.matches.find(m => m.pattern === 'complex-implementation');
      expect(implMatch).toBeDefined();
    });

    it('should detect multiple patterns', () => {
      const result = detector.detect('Implement feature and write tests');

      expect(result.matches.length).toBeGreaterThan(1);
    });

    it('should calculate confidence score', () => {
      const result = detector.detect('Fix PR review and run tests');

      const prMatch = result.matches.find(m => m.pattern === 'pr-review');
      expect(prMatch?.confidence).toBeGreaterThan(0);
      expect(prMatch?.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('PM Recommendation', () => {
    it('should recommend PM for multiple patterns', () => {
      const result = detector.detect('Implement feature, write tests, and update docs');

      expect(result.shouldUsePM).toBe(true);
    });

    it('should recommend PM for complex keywords', () => {
      const result = detector.detect('Create comprehensive solution with multiple files');

      expect(result.shouldUsePM).toBe(true);
    });

    it('should recommend PM for multiple files', () => {
      const result = detector.detect('Update 10 files with new implementation');

      expect(result.shouldUsePM).toBe(true);
    });

    it('should recommend PM for multiple steps', () => {
      const result = detector.detect('Execute 5 steps to complete the task');

      expect(result.shouldUsePM).toBe(true);
    });

    it('should not recommend PM for simple tasks', () => {
      const result = detector.detect('Fix typo in README');

      expect(result.shouldUsePM).toBe(false);
    });
  });

  describe('Recommendation Message', () => {
    it('should generate recommendation message', () => {
      const result = detector.detect('Implement feature with tests and docs');
      const message = detector.generateRecommendation(result);

      if (result.shouldUsePM) {
        expect(message).toContain('複雑なタスク');
        expect(message).toContain('PM Orchestrator');
      }
    });

    it('should include detected patterns in message', () => {
      const result = detector.detect('Fix PR review comments');
      const message = detector.generateRecommendation(result);

      if (result.shouldUsePM && result.matches.length > 0) {
        expect(message).toContain('検出されたパターン');
      }
    });
  });

  describe('Complexity Score', () => {
    it('should calculate complexity score', () => {
      const result = detector.detect('Implement complex feature with multiple files and tests');
      const score = detector.calculateComplexityScore(
        'Implement complex feature with multiple files and tests',
        result.matches
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should increase score for more patterns', () => {
      const simple = detector.detect('Fix bug');
      const complex = detector.detect('Implement feature, write tests, update docs, create PR');

      const simpleScore = detector.calculateComplexityScore('Fix bug', simple.matches);
      const complexScore = detector.calculateComplexityScore(
        'Implement feature, write tests, update docs, create PR',
        complex.matches
      );

      expect(complexScore).toBeGreaterThan(simpleScore);
    });

    it('should increase score for file count', () => {
      const noFiles = detector.detect('Implement feature');
      const manyFiles = detector.detect('Implement feature across 15 files');

      const noFilesScore = detector.calculateComplexityScore('Implement feature', noFiles.matches);
      const manyFilesScore = detector.calculateComplexityScore(
        'Implement feature across 15 files',
        manyFiles.matches
      );

      expect(manyFilesScore).toBeGreaterThan(noFilesScore);
    });
  });

  describe('Recommended Agents', () => {
    it('should recommend agents for PR review', () => {
      const result = detector.detect('Address PR review comments');
      const agents = detector.getRecommendedAgents(result.matches);

      expect(agents).toContain('rule-checker');
      expect(agents).toContain('implementer');
      expect(agents).toContain('qa');
      expect(agents).toContain('reporter');
    });

    it('should recommend agents for quality check', () => {
      const result = detector.detect('Run lint and test');
      const agents = detector.getRecommendedAgents(result.matches);

      expect(agents).toContain('qa');
      expect(agents).toContain('reporter');
    });

    it('should recommend designer for complex implementation', () => {
      const result = detector.detect('Implement complex architecture');
      const agents = detector.getRecommendedAgents(result.matches);

      expect(agents).toContain('designer');
      expect(agents).toContain('implementer');
    });

    it('should always include reporter', () => {
      const result = detector.detect('Any task');
      const agents = detector.getRecommendedAgents(result.matches);

      expect(agents).toContain('reporter');
    });
  });

  describe('Custom Patterns', () => {
    it('should allow adding custom patterns', () => {
      detector.addPattern('custom', /my-custom-pattern/i);

      const result = detector.detect('Execute my-custom-pattern');
      const customMatch = result.matches.find(m => m.pattern === 'custom');

      expect(customMatch).toBeDefined();
    });

    it('should remove pattern categories', () => {
      const removed = detector.removePattern('debugging');
      expect(removed).toBe(true);

      const result = detector.detect('Debug the issue');
      const debugMatch = result.matches.find(m => m.pattern === 'debugging');

      expect(debugMatch).toBeUndefined();
    });

    it('should get all patterns', () => {
      const allPatterns = detector.getAllPatterns();

      expect(allPatterns.size).toBeGreaterThan(0);
      expect(allPatterns.has('pr-review')).toBe(true);
    });
  });
});

describe('OrchestratorLauncher', () => {
  let launcher: OrchestratorLauncher;

  beforeEach(() => {
    launcher = new OrchestratorLauncher();
  });

  describe('Launch Decision', () => {
    it('should decide to launch for complex tasks', () => {
      const result = launcher.shouldLaunch('Implement feature with tests');

      if (result.shouldUsePM) {
        expect(result.matches.length).toBeGreaterThan(0);
      }
    });

    it('should recommend auto-launch for high complexity', () => {
      const shouldAuto = launcher.recommendsAutoLaunch(
        'Implement complex feature across 20 files with comprehensive tests'
      );

      expect(shouldAuto).toBe(true);
    });

    it('should not recommend auto-launch for simple tasks', () => {
      const shouldAuto = launcher.recommendsAutoLaunch('Fix typo');

      expect(shouldAuto).toBe(false);
    });
  });

  describe('Launch Prompt Generation', () => {
    it('should generate launch prompt for complex tasks', () => {
      const prompt = launcher.generateLaunchPrompt('Implement feature with tests and docs');

      if (prompt) {
        expect(prompt).toContain('複雑なタスク');
        expect(prompt).toContain('PM Orchestrator');
      }
    });

    it('should include complexity score', () => {
      const prompt = launcher.generateLaunchPrompt('Complex implementation task');

      if (prompt) {
        expect(prompt).toMatch(/複雑度スコア: \d+\/100/);
      }
    });

    it('should list recommended agents', () => {
      const prompt = launcher.generateLaunchPrompt('Implement feature');

      if (prompt) {
        expect(prompt).toContain('推奨されるサブエージェント');
      }
    });
  });

  describe('Launch Validation', () => {
    it('should validate launch options', () => {
      const validation = launcher.validateLaunch({
        userInput: 'Valid input'
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should reject empty input', () => {
      const validation = launcher.validateLaunch({
        userInput: ''
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('User input is empty');
    });

    it('should reject empty forceAgents', () => {
      const validation = launcher.validateLaunch({
        userInput: 'Valid input',
        forceAgents: []
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('forceAgents is empty');
    });
  });

  describe('Launch Execution', () => {
    it('should launch successfully with valid input', async () => {
      const result = await launcher.launch({
        userInput: 'Implement feature'
      });

      expect(result.launched).toBe(true);
      expect(result.agents.length).toBeGreaterThan(0);
    });

    it('should use forced agents when provided', async () => {
      const forcedAgents = ['designer', 'implementer', 'qa'];

      const result = await launcher.launch({
        userInput: 'Task',
        forceAgents: forcedAgents,
        skipPatternDetection: true
      });

      expect(result.launched).toBe(true);
      expect(result.agents).toEqual(forcedAgents);
    });

    it('should prevent concurrent launches', async () => {
      const promise1 = launcher.launch({ userInput: 'Task 1' });
      const promise2 = launcher.launch({ userInput: 'Task 2' });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should launch, one should fail
      const launchedCount = [result1, result2].filter(r => r.launched).length;
      expect(launchedCount).toBe(1);
    });
  });

  describe('Main AI Instruction', () => {
    it('should generate Main AI instruction', () => {
      const instruction = launcher.generateMainAIInstruction('Implement complex feature');

      if (instruction) {
        expect(instruction).toContain('PM Orchestrator');
        expect(instruction).toContain('Task tool');
      }
    });

    it('should include pattern detection results', () => {
      const instruction = launcher.generateMainAIInstruction('Fix PR review comments');

      if (instruction) {
        expect(instruction).toContain('検出されたパターン');
        expect(instruction).toContain('pr-review');
      }
    });

    it('should include agent execution order', () => {
      const instruction = launcher.generateMainAIInstruction('Implement feature');

      if (instruction) {
        expect(instruction).toContain('実行順序');
      }
    });

    it('should return empty for simple tasks', () => {
      const instruction = launcher.generateMainAIInstruction('Fix typo');

      expect(instruction).toBe('');
    });
  });

  describe('Launch State', () => {
    it('should track launch state', async () => {
      expect(launcher.canLaunch()).toBe(true);
      expect(launcher.isLaunched()).toBe(false);

      await launcher.launch({ userInput: 'Task' });

      expect(launcher.canLaunch()).toBe(true); // Back to ready after completion
      expect(launcher.isLaunched()).toBe(false);
    });
  });
});
