/**
 * Self-Check Module Tests
 */

import { runSelfCheck, formatResult, type SelfCheckResult } from '../../../src/install/selfCheck';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = path.join(__dirname, '..', '..', '..', '.pm-orchestrator-test');
const TEAM_CLAUDE_DIR = path.join(TEST_DIR, '.claude');

describe('SelfCheck Module', () => {
  beforeAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('Team Mode', () => {
    beforeEach(() => {
      createTeamModeEnvironment();
    });

    afterEach(() => {
      if (fs.existsSync(TEAM_CLAUDE_DIR)) {
        fs.rmSync(TEAM_CLAUDE_DIR, { recursive: true, force: true });
      }
    });

    it('should detect team mode correctly', async () => {
      const result = await runSelfCheck(TEST_DIR);
      expect(result.mode).toBe('team');
    });

    it('should pass all checks for valid team installation', async () => {
      const result = await runSelfCheck(TEST_DIR);
      expect(result.success).toBe(true);
      expect(result.checks.claudeDir).toBe(true);
      expect(result.checks.settingsJson).toBe(true);
      expect(result.checks.claudeMd).toBe(true);
      expect(result.checks.agentFile).toBe(true);
      expect(result.checks.commandFile).toBe(true);
      expect(result.checks.hookScript).toBe(true);
      expect(result.checks.hookSyntax).toBe(true);
      expect(result.checks.hookOutput).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail if settings.json is missing', async () => {
      fs.unlinkSync(path.join(TEAM_CLAUDE_DIR, 'settings.json'));
      const result = await runSelfCheck(TEST_DIR);
      expect(result.success).toBe(false);
      expect(result.checks.settingsJson).toBe(false);
      expect(result.errors).toContain('settings.json not found');
    });
  });

  describe('formatResult', () => {
    it('should format successful result correctly', () => {
      const result: SelfCheckResult = {
        success: true,
        mode: 'team',
        checks: {
          claudeDir: true,
          settingsJson: true,
          claudeMd: true,
          agentFile: true,
          commandFile: true,
          hookScript: true,
          hookSyntax: true,
          hookOutput: true,
        },
        errors: [],
        warnings: [],
        repaired: [],
      };

      const formatted = formatResult(result);
      expect(formatted).toContain('Mode: team');
      expect(formatted).toContain('PASS');
      expect(formatted).toContain('claudeDir');
    });
  });
});

function createTeamModeEnvironment() {
  fs.mkdirSync(TEAM_CLAUDE_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEAM_CLAUDE_DIR, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(TEAM_CLAUDE_DIR, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(TEAM_CLAUDE_DIR, 'hooks'), { recursive: true });

  const settingsJson = {
    hooks: {
      UserPromptSubmit: [
        {
          _pmOrchestratorManaged: true,
          type: 'command',
          command: '$CLAUDE_PROJECT_DIR/.claude/hooks/pm-orchestrator-hook.sh',
        },
      ],
    },
  };
  fs.writeFileSync(
    path.join(TEAM_CLAUDE_DIR, 'settings.json'),
    JSON.stringify(settingsJson, null, 2)
  );

  const claudeMd = `<!-- PM-ORCHESTRATOR-START -->
_pmOrchestratorMode: team
# PM Orchestrator Integration
<!-- PM-ORCHESTRATOR-END -->`;
  
  fs.writeFileSync(path.join(TEAM_CLAUDE_DIR, 'CLAUDE.md'), claudeMd);

  fs.writeFileSync(
    path.join(TEAM_CLAUDE_DIR, 'agents', 'pm-orchestrator.md'),
    '# PM Orchestrator Agent'
  );

  fs.writeFileSync(
    path.join(TEAM_CLAUDE_DIR, 'commands', 'pm.md'),
    '# PM Command'
  );

  const hookScript = `#!/bin/bash
echo "PM Orchestrator TaskType: READ_INFO"
`;
  const hookPath = path.join(TEAM_CLAUDE_DIR, 'hooks', 'pm-orchestrator-hook.sh');
  fs.writeFileSync(hookPath, hookScript);
  fs.chmodSync(hookPath, 0o755);
}
