/**
 * Skills Routes - Template-Only Behavior Tests (Batch 4)
 *
 * Asserts that POST /api/skills/generate is a template-based scaffold and
 * does NOT invoke any LLM:
 *   1. The endpoint succeeds even when no API key (OPENAI_API_KEY /
 *      ANTHROPIC_API_KEY) is set in the environment.
 *   2. The response payload includes a deterministic `template: true` marker
 *      so that clients can distinguish it from AI-generated output
 *      (which is produced by POST /api/assistant/propose).
 *
 * Spec: spec/19_WEB_UI.md "Skills: Template Scaffold vs AI Generate (v3.x 新規 - Batch 4)"
 *       spec/37_AI_GENERATE.md "Not to be confused with /api/skills/generate"
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createSkillsRoutes } from '../../../../src/web/routes/skills';

describe('Skills Routes - Template-only (Batch 4)', () => {
  let app: express.Express;
  let tmpDir: string;
  let savedOpenAi: string | undefined;
  let savedAnthropic: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-template-only-'));

    // Strip API keys from the environment to *prove* no LLM call can happen.
    savedOpenAi = process.env.OPENAI_API_KEY;
    savedAnthropic = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    app = express();
    app.use(express.json());
    app.use(
      '/api/skills',
      createSkillsRoutes({
        projectRoot: tmpDir,
      })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedOpenAi !== undefined) process.env.OPENAI_API_KEY = savedOpenAi;
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
  });

  it('succeeds with NO API keys set (proof: no LLM call required)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      })
    );
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

    const res = await request(app)
      .post('/api/skills/generate')
      .send({ dryRun: true });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.skills));
    assert.ok(res.body.skills.length > 0);
  });

  it('response payload includes template: true marker (dry-run mode)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: {}, devDependencies: {} })
    );

    const res = await request(app)
      .post('/api/skills/generate')
      .send({ dryRun: true });

    assert.equal(res.status, 200);
    assert.equal(
      res.body.template,
      true,
      'response should include template: true to distinguish from AI-generated output'
    );
  });

  it('response payload includes template: true marker (write mode)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: {}, devDependencies: {} })
    );

    const res = await request(app)
      .post('/api/skills/generate')
      .send({ dryRun: false });

    assert.equal(res.status, 200);
    assert.equal(
      res.body.template,
      true,
      'response should include template: true to distinguish from AI-generated output'
    );
  });

  it('response payload does NOT include LLM-related metadata (no selectedProvider/selectedModel)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: {}, devDependencies: {} })
    );

    const res = await request(app)
      .post('/api/skills/generate')
      .send({ dryRun: true });

    assert.equal(res.status, 200);
    // /api/assistant/propose returns meta.selectedProvider / meta.selectedModel.
    // /api/skills/generate must not, since it never selects a model.
    if (res.body.meta) {
      assert.equal(
        res.body.meta.selectedProvider,
        undefined,
        'template scaffold must not report a selectedProvider'
      );
      assert.equal(
        res.body.meta.selectedModel,
        undefined,
        'template scaffold must not report a selectedModel'
      );
    }
  });

  it('produces deterministic output for the same input (template, not AI)', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: {},
        devDependencies: { typescript: '^5.0.0' },
      })
    );
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

    const a = await request(app)
      .post('/api/skills/generate')
      .send({ dryRun: true });
    const b = await request(app)
      .post('/api/skills/generate')
      .send({ dryRun: true });

    assert.equal(a.status, 200);
    assert.equal(b.status, 200);

    // Same skill names in the same order = deterministic template output.
    const namesA = (a.body.skills as Array<{ name: string }>).map((s) => s.name);
    const namesB = (b.body.skills as Array<{ name: string }>).map((s) => s.name);
    assert.deepEqual(namesA, namesB, 'template output must be deterministic');

    // Content also identical (true determinism).
    const contentsA = (a.body.skills as Array<{ content?: string }>).map(
      (s) => s.content
    );
    const contentsB = (b.body.skills as Array<{ content?: string }>).map(
      (s) => s.content
    );
    assert.deepEqual(
      contentsA,
      contentsB,
      'template output content must be deterministic'
    );
  });
});
