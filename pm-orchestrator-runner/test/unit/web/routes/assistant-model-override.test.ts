/**
 * Assistant Routes - Model Override Tests (Batch 3)
 *
 * Verifies POST /api/assistant/propose accepts optional `provider` and
 * `model` fields in the request body, validates them against the model
 * registry, and rejects invalid combinations with HTTP 400.
 *
 * Validation rules:
 *   - provider must be "openai" | "anthropic"
 *   - model must exist in the registry for that provider
 *   - both must be supplied together (model without provider is rejected)
 *   - omitting both falls back to defaults (no error)
 *
 * The actual LLM call is NOT exercised here because no API key is configured
 * in the test environment; that path returns 500 with the LLM_ERROR code,
 * which proves the request body passed the override validator.
 *
 * Spec: spec/37_AI_GENERATE.md §3 (Default Models) and §5.3 (POST Body Extension)
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createAssistantRoutes } from '../../../../src/web/routes/assistant';

function makeApp(): { app: express.Express; tmpDir: string; stateDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-override-proj-'));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-override-state-'));
  const app = express();
  app.use(express.json());
  app.use('/api/assistant', createAssistantRoutes({
    projectRoot: tmpDir,
    stateDir,
  }));
  return { app, tmpDir, stateDir };
}

describe('AI Generate - validateModelOverride helper (Batch 3)', () => {
  let validateModelOverride: (
    provider: unknown,
    model: unknown
  ) => { ok: true; provider: 'openai' | 'anthropic'; model: string }
    | { ok: false; error: string };

  before(async () => {
    const mod = await import('../../../../src/web/routes/assistant');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateModelOverride = (mod as any).validateModelOverride;
    assert.ok(
      typeof validateModelOverride === 'function',
      'validateModelOverride must be exported from assistant.ts'
    );
  });

  it('returns ok for valid openai provider/model pair', () => {
    const res = validateModelOverride('openai', 'gpt-4o');
    assert.equal(res.ok, true, JSON.stringify(res));
    if (res.ok) {
      assert.equal(res.provider, 'openai');
      assert.equal(res.model, 'gpt-4o');
    }
  });

  it('returns ok for valid anthropic provider/model pair', () => {
    const res = validateModelOverride('anthropic', 'claude-sonnet-4-20250514');
    assert.equal(res.ok, true, JSON.stringify(res));
    if (res.ok) {
      assert.equal(res.provider, 'anthropic');
      assert.equal(res.model, 'claude-sonnet-4-20250514');
    }
  });

  it('rejects provider not in {openai, anthropic}', () => {
    const res = validateModelOverride('mistral', 'gpt-4o');
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /provider/i);
    }
  });

  it('rejects model that does not exist in the chosen provider registry', () => {
    const res = validateModelOverride('openai', 'gpt-9000-fictional');
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /model/i);
    }
  });

  it('rejects model that exists in OTHER provider but not in chosen one (cross-provider)', () => {
    const res = validateModelOverride('openai', 'claude-sonnet-4-20250514');
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.match(res.error, /model/i);
    }
  });

  it('treats null/undefined provider+model as "no override" (ok with defaults)', () => {
    const res = validateModelOverride(undefined, undefined);
    assert.equal(res.ok, true);
    if (res.ok) {
      // The defaults must be the new Batch 3 defaults
      assert.equal(res.provider, 'openai');
      assert.equal(res.model, 'gpt-4o');
    }
  });

  it('rejects model supplied without provider (partial override is ambiguous)', () => {
    const res = validateModelOverride(undefined, 'gpt-4o');
    assert.equal(res.ok, false);
  });
});

describe('AI Generate - POST /api/assistant/propose with override (Batch 3)', () => {
  let ctx: ReturnType<typeof makeApp>;

  beforeEach(() => {
    ctx = makeApp();
  });

  afterEach(() => {
    fs.rmSync(ctx.tmpDir, { recursive: true, force: true });
    fs.rmSync(ctx.stateDir, { recursive: true, force: true });
  });

  it('returns 400 VALIDATION_ERROR for invalid provider', async () => {
    const res = await request(ctx.app)
      .post('/api/assistant/propose')
      .send({ prompt: 'create a hello skill', provider: 'mistral', model: 'gpt-4o' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'VALIDATION_ERROR');
    assert.match(String(res.body.message || ''), /provider/i);
  });

  it('returns 400 VALIDATION_ERROR for invalid model on a valid provider', async () => {
    const res = await request(ctx.app)
      .post('/api/assistant/propose')
      .send({ prompt: 'create a hello skill', provider: 'openai', model: 'gpt-9000-fictional' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'VALIDATION_ERROR');
    assert.match(String(res.body.message || ''), /model/i);
  });

  it('returns 400 VALIDATION_ERROR for model from wrong provider (cross-provider mismatch)', async () => {
    const res = await request(ctx.app)
      .post('/api/assistant/propose')
      .send({ prompt: 'x', provider: 'openai', model: 'claude-sonnet-4-20250514' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'VALIDATION_ERROR');
  });

  it('mock mode (mock=true) bypasses LLM and returns selectedProvider/selectedModel meta when override is valid', async () => {
    const res = await request(ctx.app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'create a hello skill', provider: 'anthropic', model: 'claude-sonnet-4-20250514' });
    assert.equal(res.status, 200);
    // The mock path must echo the resolved override in `meta` for debugging.
    assert.ok(res.body.meta, 'response must include meta block');
    assert.equal(res.body.meta.selectedProvider, 'anthropic');
    assert.equal(res.body.meta.selectedModel, 'claude-sonnet-4-20250514');
  });

  it('mock mode without override returns the new defaults in meta', async () => {
    const res = await request(ctx.app)
      .post('/api/assistant/propose?mock=true')
      .send({ prompt: 'create a hello skill' });
    assert.equal(res.status, 200);
    assert.ok(res.body.meta);
    assert.equal(res.body.meta.selectedProvider, 'openai');
    assert.equal(res.body.meta.selectedModel, 'gpt-4o');
  });
});
