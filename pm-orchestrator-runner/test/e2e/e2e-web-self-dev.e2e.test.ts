/**
 * E2E Test: Web UI Self-Development Capability
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md E2E-5
 *
 * Tests SUP-4: Project-specific templates via Web UI
 * Tests SUP-5: Global templates via Web UI
 *
 * Validates that the Web UI routes can manage Supervisor settings
 * enabling self-development of the PM Orchestrator system.
 */

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import express from 'express';
import request from 'supertest';

import {
  getSupervisor,
  resetSupervisor,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROJECT_CONFIG,
  TIMEOUT_PROFILES,
} from '../../src/supervisor/index';

import { createSupervisorConfigRoutes } from '../../src/web/routes/supervisor-config';

describe('E2E: Web UI Self-Development Capability (SUP-4, SUP-5)', () => {
  let testDir: string;
  let app: express.Application;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-self-dev-test-'));
    const claudeDir = path.join(testDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(path.join(claudeDir, 'projects'), { recursive: true });

    resetSupervisor();

    // Create Express app with supervisor config routes
    app = express();
    app.use(express.json());
    app.use('/api/supervisor', createSupervisorConfigRoutes({ projectRoot: testDir }));
  });

  after(() => {
    resetSupervisor();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('SUP-5: Global Config API', () => {
    it('GET /api/supervisor/global should return global config', async () => {
      const res = await request(app)
        .get('/api/supervisor/global')
        .expect(200);

      assert.ok('global_input_template' in res.body, 'Should have global_input_template');
      assert.ok('global_output_template' in res.body, 'Should have global_output_template');
      assert.ok('supervisor_rules' in res.body, 'Should have supervisor_rules');
      assert.ok('enabled' in res.body.supervisor_rules, 'Should have enabled');
      assert.ok('timeout_default_ms' in res.body.supervisor_rules, 'Should have timeout_default_ms');
    });

    it('PUT /api/supervisor/global should update global config', async () => {
      const newConfig = {
        global_input_template: 'Updated global input template',
        global_output_template: 'Updated global output template',
        supervisor_rules: {
          enabled: true,
          timeout_default_ms: 90000,
          max_retries: 5,
          fail_on_violation: false,
        },
      };

      const res = await request(app)
        .put('/api/supervisor/global')
        .send(newConfig)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.config.global_input_template, 'Updated global input template');
      assert.equal(res.body.config.global_output_template, 'Updated global output template');
    });

    it('PUT /api/supervisor/global should handle partial updates', async () => {
      const partialConfig = {
        supervisor_rules: {
          enabled: false,
        },
      };

      const res = await request(app)
        .put('/api/supervisor/global')
        .send(partialConfig)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.config.supervisor_rules.enabled, false);
    });
  });

  describe('SUP-4: Project Config API', () => {
    it('GET /api/supervisor/projects/:projectId should return project config', async () => {
      const res = await request(app)
        .get('/api/supervisor/projects/test-project')
        .expect(200);

      assert.equal(res.body.projectId, 'test-project');
      assert.ok('input_template' in res.body, 'Should have input_template');
      assert.ok('output_template' in res.body, 'Should have output_template');
      assert.ok('supervisor_rules' in res.body, 'Should have supervisor_rules');
    });

    it('PUT /api/supervisor/projects/:projectId should update project config', async () => {
      const projectConfig = {
        input_template: 'Project-specific input template',
        output_template: 'Project-specific output template',
        supervisor_rules: {
          timeout_profile: 'long',
          allow_raw_output: true,
          require_format_validation: false,
        },
      };

      const res = await request(app)
        .put('/api/supervisor/projects/custom-project')
        .send(projectConfig)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.config.projectId, 'custom-project');
      assert.equal(res.body.config.input_template, 'Project-specific input template');
    });

    it('should handle different project IDs independently', async () => {
      // Update project A
      await request(app)
        .put('/api/supervisor/projects/project-a')
        .send({ input_template: 'Template A' })
        .expect(200);

      // Update project B
      await request(app)
        .put('/api/supervisor/projects/project-b')
        .send({ input_template: 'Template B' })
        .expect(200);

      // Verify they are independent
      const resA = await request(app)
        .get('/api/supervisor/projects/project-a')
        .expect(200);

      const resB = await request(app)
        .get('/api/supervisor/projects/project-b')
        .expect(200);

      // Projects should have their own configs
      assert.equal(resA.body.projectId, 'project-a');
      assert.equal(resB.body.projectId, 'project-b');
    });
  });

  describe('Timeout Profiles API', () => {
    it('GET /api/supervisor/timeout-profiles should list profiles', async () => {
      const res = await request(app)
        .get('/api/supervisor/timeout-profiles')
        .expect(200);

      assert.ok('profiles' in res.body, 'Should have profiles property');
      assert.ok(Array.isArray(res.body.profiles), 'profiles should be an array');
      assert.ok(res.body.profiles.length > 0, 'profiles should not be empty');

      // Check profile structure
      const profile = res.body.profiles[0];
      assert.ok('name' in profile, 'Profile should have name');
      assert.ok('timeout_ms' in profile, 'Profile should have timeout_ms');
      assert.ok('description' in profile, 'Profile should have description');
    });

    it('should include standard, long, and extended profiles', async () => {
      const res = await request(app)
        .get('/api/supervisor/timeout-profiles')
        .expect(200);

      const profileNames = res.body.profiles.map((p: { name: string }) => p.name);

      assert.ok(profileNames.includes('standard'), 'Should include standard profile');
      assert.ok(profileNames.includes('long'), 'Should include long profile');
      assert.ok(profileNames.includes('extended'), 'Should include extended profile');
    });
  });

  describe('Supervisor Status API', () => {
    it('GET /api/supervisor/status should return current status', async () => {
      const res = await request(app)
        .get('/api/supervisor/status')
        .expect(200);

      assert.ok('enabled' in res.body, 'Should have enabled property');
      assert.ok('projectRoot' in res.body, 'Should have projectRoot property');
      assert.ok('timeout_ms' in res.body, 'Should have timeout_ms property');
      assert.ok('max_retries' in res.body, 'Should have max_retries property');
    });

    it('POST /api/supervisor/toggle should toggle supervisor', async () => {
      // Get current status
      const statusBefore = await request(app)
        .get('/api/supervisor/status')
        .expect(200);

      const enabledBefore = statusBefore.body.enabled;

      // Toggle
      const toggleRes = await request(app)
        .post('/api/supervisor/toggle')
        .send({})
        .expect(200);

      assert.equal(toggleRes.body.success, true);
      assert.equal(toggleRes.body.enabled, !enabledBefore);
    });

    it('POST /api/supervisor/toggle with explicit value', async () => {
      // Set to enabled
      const res = await request(app)
        .post('/api/supervisor/toggle')
        .send({ enabled: true })
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.enabled, true);

      // Set to disabled
      const res2 = await request(app)
        .post('/api/supervisor/toggle')
        .send({ enabled: false })
        .expect(200);

      assert.equal(res2.body.success, true);
      assert.equal(res2.body.enabled, false);
    });
  });

  describe('Self-Development Workflow', () => {
    it('should support complete config update cycle', async () => {
      // 1. Read current config
      const readRes = await request(app)
        .get('/api/supervisor/global')
        .expect(200);

      const currentConfig = readRes.body;

      // 2. Modify config
      const modifiedConfig = {
        ...currentConfig,
        global_input_template: 'Self-modified template',
        supervisor_rules: {
          ...currentConfig.supervisor_rules,
          max_retries: 10,
        },
      };

      // 3. Save modified config
      const saveRes = await request(app)
        .put('/api/supervisor/global')
        .send(modifiedConfig)
        .expect(200);

      assert.equal(saveRes.body.success, true);

      // 4. Verify changes persisted
      const verifyRes = await request(app)
        .get('/api/supervisor/global')
        .expect(200);

      assert.equal(verifyRes.body.global_input_template, 'Self-modified template');
    });

    it('should support project template customization', async () => {
      const projectId = 'self-dev-project';

      // 1. Create project config
      await request(app)
        .put(`/api/supervisor/projects/${projectId}`)
        .send({
          input_template: 'Custom input for self-dev',
          output_template: 'Custom output for self-dev',
          supervisor_rules: {
            timeout_profile: 'extended',
          },
        })
        .expect(200);

      // 2. Verify project config
      const res = await request(app)
        .get(`/api/supervisor/projects/${projectId}`)
        .expect(200);

      assert.equal(res.body.input_template, 'Custom input for self-dev');
      assert.equal(res.body.output_template, 'Custom output for self-dev');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      const res = await request(app)
        .put('/api/supervisor/global')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Should return error response
      assert.ok([400, 500].includes(res.status), 'Status should be 400 or 500');
    });

    it('should handle missing required fields with defaults', async () => {
      const res = await request(app)
        .put('/api/supervisor/global')
        .send({})
        .expect(200);

      // Should use defaults
      assert.equal(res.body.success, true);
      assert.ok('global_input_template' in res.body.config, 'Should have global_input_template');
    });
  });
});
