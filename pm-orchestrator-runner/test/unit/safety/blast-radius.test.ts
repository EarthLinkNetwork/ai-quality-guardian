/**
 * Unit Tests for Blast Radius Classifier
 * Tests for src/safety/blast-radius.ts
 *
 * Classifies commands and file operations by their potential impact:
 * - GREEN: Safe, reversible, within project scope
 * - YELLOW: Caution, within project but notable
 * - RED: Irreversible or out of scope
 */

import * as assert from 'assert';
import {
  classifyCommand,
  classifyFileOperation,
  generateSafetyRules,
  DEFAULT_BLAST_RADIUS_CONFIG,
  BlastRadius,
  BlastRadiusConfig,
} from '../../../src/safety/blast-radius';
import { detectRedOperation } from '../../../src/utils/question-detector';

describe('Blast Radius Classifier', () => {
  describe('classifyCommand', () => {
    describe('RED commands', () => {
      it('should classify "rm -rf /" as RED', () => {
        const result = classifyCommand('rm -rf /');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "aws amplify delete-app" as RED', () => {
        const result = classifyCommand('aws amplify delete-app --app-id abc123');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "gcloud app delete" as RED', () => {
        const result = classifyCommand('gcloud app delete my-app');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "git push --force" as RED', () => {
        const result = classifyCommand('git push --force origin main');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "drop table users" as RED', () => {
        const result = classifyCommand('DROP TABLE users;');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "rm .env" as RED (protected file)', () => {
        const result = classifyCommand('rm .env');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "rm .env.local" as RED (protected file)', () => {
        const result = classifyCommand('rm .env.local');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "git reset --hard" as RED', () => {
        const result = classifyCommand('git reset --hard HEAD~3');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "kubectl delete" as RED', () => {
        const result = classifyCommand('kubectl delete pod my-pod');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "npm unpublish" as RED', () => {
        const result = classifyCommand('npm unpublish my-package');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "git push -f" as RED', () => {
        const result = classifyCommand('git push -f origin feature');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "destroy" as RED', () => {
        const result = classifyCommand('terraform destroy');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "terminate-instances" as RED', () => {
        const result = classifyCommand('aws ec2 terminate-instances --instance-ids i-123');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "docker rm" as RED', () => {
        const result = classifyCommand('docker rm my-container');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "docker rmi" as RED', () => {
        const result = classifyCommand('docker rmi my-image:latest');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "truncate table" as RED', () => {
        const result = classifyCommand('TRUNCATE TABLE sessions;');
        assert.strictEqual(result, 'RED');
      });

      it('should classify "drop database" as RED', () => {
        const result = classifyCommand('DROP DATABASE production;');
        assert.strictEqual(result, 'RED');
      });

      it('should classify deletion of protected paths as RED', () => {
        const result = classifyCommand('rm -rf ~/.ssh/known_hosts');
        assert.strictEqual(result, 'RED');
      });

      it('should classify deletion of credentials files as RED', () => {
        const result = classifyCommand('rm credentials.json');
        assert.strictEqual(result, 'RED');
      });

      it('should classify deletion of key files as RED', () => {
        const result = classifyCommand('rm server.pem');
        assert.strictEqual(result, 'RED');
      });
    });

    describe('YELLOW commands', () => {
      it('should classify "git push origin main" as YELLOW', () => {
        const result = classifyCommand('git push origin main');
        assert.strictEqual(result, 'YELLOW');
      });

      it('should classify "npm publish" as YELLOW', () => {
        const result = classifyCommand('npm publish');
        assert.strictEqual(result, 'YELLOW');
      });

      it('should classify "docker push" as YELLOW', () => {
        const result = classifyCommand('docker push my-image:latest');
        assert.strictEqual(result, 'YELLOW');
      });

      it('should classify "chmod 755" as YELLOW', () => {
        const result = classifyCommand('chmod 755 script.sh');
        assert.strictEqual(result, 'YELLOW');
      });

      it('should classify "chown" as YELLOW', () => {
        const result = classifyCommand('chown user:group file.txt');
        assert.strictEqual(result, 'YELLOW');
      });
    });

    describe('GREEN commands', () => {
      it('should classify "npm install" as GREEN', () => {
        const result = classifyCommand('npm install express');
        assert.strictEqual(result, 'GREEN');
      });

      it('should classify "npm test" as GREEN', () => {
        const result = classifyCommand('npm test');
        assert.strictEqual(result, 'GREEN');
      });

      it('should classify "echo hello" as GREEN', () => {
        const result = classifyCommand('echo hello');
        assert.strictEqual(result, 'GREEN');
      });

      it('should classify "ls -la" as GREEN', () => {
        const result = classifyCommand('ls -la');
        assert.strictEqual(result, 'GREEN');
      });

      it('should classify "cat file.txt" as GREEN', () => {
        const result = classifyCommand('cat file.txt');
        assert.strictEqual(result, 'GREEN');
      });

      it('should classify "mkdir src/new-dir" as GREEN', () => {
        const result = classifyCommand('mkdir src/new-dir');
        assert.strictEqual(result, 'GREEN');
      });

      it('should classify "tsc --noEmit" as GREEN', () => {
        const result = classifyCommand('tsc --noEmit');
        assert.strictEqual(result, 'GREEN');
      });
    });

    describe('case insensitivity', () => {
      it('should classify DROP TABLE case-insensitively', () => {
        assert.strictEqual(classifyCommand('drop table users'), 'RED');
        assert.strictEqual(classifyCommand('DROP TABLE USERS'), 'RED');
        assert.strictEqual(classifyCommand('Drop Table Users'), 'RED');
      });
    });

    describe('custom config', () => {
      it('should use custom red commands', () => {
        const config: BlastRadiusConfig = {
          ...DEFAULT_BLAST_RADIUS_CONFIG,
          redCommands: ['my-dangerous-command'],
        };
        assert.strictEqual(classifyCommand('my-dangerous-command --flag', config), 'RED');
        assert.strictEqual(classifyCommand('safe-command', config), 'GREEN');
      });

      it('should use custom protected files', () => {
        const config: BlastRadiusConfig = {
          ...DEFAULT_BLAST_RADIUS_CONFIG,
          protectedFiles: ['my-secret.yaml'],
        };
        assert.strictEqual(classifyCommand('rm my-secret.yaml', config), 'RED');
      });
    });
  });

  describe('classifyFileOperation', () => {
    it('should classify delete of ".env" as RED', () => {
      const result = classifyFileOperation('delete', '.env');
      assert.strictEqual(result, 'RED');
    });

    it('should classify delete of "credentials.json" as RED', () => {
      const result = classifyFileOperation('delete', 'credentials.json');
      assert.strictEqual(result, 'RED');
    });

    it('should classify delete of ".env.production" as RED', () => {
      const result = classifyFileOperation('delete', '.env.production');
      assert.strictEqual(result, 'RED');
    });

    it('should classify delete of "server.key" as RED', () => {
      const result = classifyFileOperation('delete', 'server.key');
      assert.strictEqual(result, 'RED');
    });

    it('should classify delete of file in protected path as RED', () => {
      const result = classifyFileOperation('delete', '/etc/nginx/nginx.conf');
      assert.strictEqual(result, 'RED');
    });

    it('should classify move of ".env" as RED', () => {
      const result = classifyFileOperation('move', '.env');
      assert.strictEqual(result, 'RED');
    });

    it('should classify edit of "src/app.ts" as GREEN', () => {
      const result = classifyFileOperation('edit', 'src/app.ts');
      assert.strictEqual(result, 'GREEN');
    });

    it('should classify delete of "src/temp.ts" as GREEN', () => {
      const result = classifyFileOperation('delete', 'src/temp.ts');
      assert.strictEqual(result, 'GREEN');
    });

    it('should classify create of any file as GREEN', () => {
      const result = classifyFileOperation('create', 'src/new-file.ts');
      assert.strictEqual(result, 'GREEN');
    });

    it('should classify edit of ".env" as GREEN (edit is not destructive)', () => {
      const result = classifyFileOperation('edit', '.env');
      assert.strictEqual(result, 'GREEN');
    });
  });

  describe('generateSafetyRules', () => {
    it('should return a non-empty string', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.length > 0, 'Safety rules should not be empty');
    });

    it('should contain RED section', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.includes('RED'), 'Should contain RED section');
    });

    it('should contain YELLOW section', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.includes('YELLOW'), 'Should contain YELLOW section');
    });

    it('should contain GREEN section', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.includes('GREEN'), 'Should contain GREEN section');
    });

    it('should contain SAFETY RULES header', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.includes('[SAFETY RULES'), 'Should contain safety rules header');
    });

    it('should contain RED OPERATION instruction', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.includes('[RED OPERATION]'), 'Should instruct to output RED OPERATION marker');
    });

    it('should include protected files', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.includes('.env'), 'Should include .env in protected files');
    });

    it('should include protected paths', () => {
      const rules = generateSafetyRules(DEFAULT_BLAST_RADIUS_CONFIG);
      assert.ok(rules.includes('/etc'), 'Should include /etc in protected paths');
    });

    it('should include allowed AWS accounts when configured', () => {
      const config: BlastRadiusConfig = {
        ...DEFAULT_BLAST_RADIUS_CONFIG,
        allowedAwsAccounts: ['123456789012'],
      };
      const rules = generateSafetyRules(config);
      assert.ok(rules.includes('123456789012'), 'Should include AWS account');
    });

    it('should include allowed GCP projects when configured', () => {
      const config: BlastRadiusConfig = {
        ...DEFAULT_BLAST_RADIUS_CONFIG,
        allowedGcpProjects: ['my-gcp-project'],
      };
      const rules = generateSafetyRules(config);
      assert.ok(rules.includes('my-gcp-project'), 'Should include GCP project');
    });
  });

  describe('detectRedOperation', () => {
    it('should detect [RED OPERATION] marker', () => {
      const output = 'Processing task...\n[RED OPERATION] Attempting to delete production database\nStopping.';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, true);
      assert.ok(result.operations.length > 0);
      assert.ok(result.operations[0].includes('delete production database'));
    });

    it('should detect multiple [RED OPERATION] markers', () => {
      const output = '[RED OPERATION] Deleting .env\n[RED OPERATION] Force pushing to main';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, true);
      assert.strictEqual(result.operations.length, 2);
    });

    it('should detect rm -rf execution patterns', () => {
      const output = 'executing: rm -rf /var/data/important';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, true);
      assert.ok(result.operations.length > 0);
    });

    it('should detect AWS delete execution patterns', () => {
      const output = 'running: aws s3 delete-bucket --bucket my-bucket';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, true);
    });

    it('should detect gcloud delete execution patterns', () => {
      const output = 'executed: gcloud app delete my-service';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, true);
    });

    it('should detect DROP TABLE execution', () => {
      const output = 'executing: DROP TABLE users CASCADE';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, true);
    });

    it('should detect git push --force execution', () => {
      const output = 'running: git push --force origin main';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, true);
    });

    it('should return empty for normal output', () => {
      const output = 'Task completed successfully.\nAll tests passed.\nFiles created: src/app.ts';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.operations.length, 0);
    });

    it('should return empty for empty output', () => {
      const result = detectRedOperation('');
      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.operations.length, 0);
    });

    it('should handle output with mention of commands but no execution', () => {
      const output = 'You could use rm -rf to clean up, but that would be dangerous.';
      const result = detectRedOperation(output);
      assert.strictEqual(result.detected, false);
    });
  });
});
