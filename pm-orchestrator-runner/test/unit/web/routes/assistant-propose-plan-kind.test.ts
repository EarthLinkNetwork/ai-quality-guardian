/**
 * Assistant Routes - POST /api/assistant/propose planKind Validation (Batch 5)
 *
 * Verifies the propose endpoint:
 *   - accepts an optional planKind in {auto, spec-first-tdd, plugin-bundle}
 *   - defaults to "auto" when omitted / null / ""
 *   - rejects any other value with HTTP 400 + error="VALIDATION_ERROR"
 *   - returns the resolved planKind in meta.selectedPlanKind (mock mode)
 *
 * The mock=true mode is used to avoid LLM calls.
 *
 * Spec: spec/37_AI_GENERATE.md §10.4 "POST /api/assistant/propose 入力契約拡張"
 *       spec/08_TESTING_STRATEGY.md "AI Generate Plan Kind Selector (Batch 5)"
 */
import { describe, it, before } from 'mocha';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createAssistantRoutes } from '../../../../src/web/routes/assistant';

function makeApp(): express.Express {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-pk-proj-'));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-pk-state-'));
  const app = express();
  app.use(express.json());
  app.use('/api/assistant', createAssistantRoutes({
    projectRoot: tmpDir,
    stateDir,
  }));
  return app;
}

describe('AI Generate - POST /api/assistant/propose planKind validation (Batch 5)', () => {
  let app: express.Express;
  before(() => { app = makeApp(); });

  it('omitted planKind → meta.selectedPlanKind === "auto" (mock mode)', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'add a slash command for lint', scope: 'project' })
      .expect(200);
    assert.equal(res.body.meta?.selectedPlanKind, 'auto',
      `expected "auto" default, got ${JSON.stringify(res.body.meta)}`);
  });

  it('planKind="auto" → meta.selectedPlanKind === "auto"', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'lint', scope: 'project', planKind: 'auto' })
      .expect(200);
    assert.equal(res.body.meta?.selectedPlanKind, 'auto');
  });

  it('planKind="spec-first-tdd" → meta.selectedPlanKind === "spec-first-tdd"', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({
        prompt: 'create a tdd workflow for csv-to-json',
        scope: 'project',
        planKind: 'spec-first-tdd',
      })
      .expect(200);
    assert.equal(res.body.meta?.selectedPlanKind, 'spec-first-tdd');
  });

  it('planKind="plugin-bundle" → meta.selectedPlanKind === "plugin-bundle"', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({
        prompt: 'pack as plugin',
        scope: 'project',
        planKind: 'plugin-bundle',
      })
      .expect(200);
    assert.equal(res.body.meta?.selectedPlanKind, 'plugin-bundle');
  });

  it('planKind=null → defaults to "auto" (backward compat)', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'lint', scope: 'project', planKind: null })
      .expect(200);
    assert.equal(res.body.meta?.selectedPlanKind, 'auto');
  });

  it('planKind="" → defaults to "auto" (backward compat)', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'lint', scope: 'project', planKind: '' })
      .expect(200);
    assert.equal(res.body.meta?.selectedPlanKind, 'auto');
  });

  it('planKind="invalid-kind" → HTTP 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'lint', scope: 'project', planKind: 'invalid-kind' })
      .expect(400);
    assert.equal(res.body.error, 'VALIDATION_ERROR');
    assert.match(String(res.body.message || ''), /planKind/i);
  });

  it('planKind=42 (non-string) → HTTP 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'lint', scope: 'project', planKind: 42 })
      .expect(400);
    assert.equal(res.body.error, 'VALIDATION_ERROR');
  });
});
