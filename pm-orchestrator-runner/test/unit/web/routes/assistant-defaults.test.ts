/**
 * Assistant Routes - Default Model Tests (Batch 3)
 *
 * Verifies that the default models used by `generateProposal` (when neither
 * the request body nor `defaultModels` config supplies one) match the new
 * Batch 3 defaults:
 *   openai    -> "gpt-4o"                       (flagship)
 *   anthropic -> "claude-sonnet-4-20250514"     (advanced)
 *
 * Also enforces that the deprecated basic-tier defaults (`gpt-4o-mini`,
 * `claude-3-haiku-20240307`) no longer appear in the source as the chosen
 * fallback for AI Generate.
 *
 * Spec: spec/37_AI_GENERATE.md §3 "Default Models"
 *       spec/19_WEB_UI.md "AI Generate Model Selector (v3.x 新規 - Batch 3)"
 */
import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDefaultModel } from '../../../../src/web/routes/assistant';

// NOTE: The static import above is load-bearing — it forces ts-node to resolve
// this file as CommonJS, which gives us the native `__dirname`. Using
// `import.meta.url` here would flip ts-node into ESM mode and break the
// dynamic-import tests in sibling files (mocha loads modules once per run).
const ASSISTANT_TS = path.resolve(
  __dirname,
  '../../../../src/web/routes/assistant.ts'
);

function loadAssistantSource(): string {
  return fs.readFileSync(ASSISTANT_TS, 'utf8');
}

describe('AI Generate - Default Models (Batch 3)', () => {
  it('source references the new openai default "gpt-4o"', () => {
    const src = loadAssistantSource();
    assert.match(
      src,
      /["']gpt-4o["']/,
      'expected new openai default "gpt-4o" string literal in assistant.ts'
    );
  });

  it('source references the new anthropic default "claude-sonnet-4-20250514"', () => {
    const src = loadAssistantSource();
    assert.match(
      src,
      /["']claude-sonnet-4-20250514["']/,
      'expected new anthropic default "claude-sonnet-4-20250514" string literal in assistant.ts'
    );
  });

  it('does not use deprecated "gpt-4o-mini" as fallback default for AI Generate', () => {
    const src = loadAssistantSource();
    // The fallback expression in generateProposal previously read:
    //   provider === "openai" ? "gpt-4o-mini" : "claude-3-haiku-20240307"
    // The new version must not pick gpt-4o-mini as the openai fallback.
    assert.ok(
      !/provider\s*===\s*["']openai["']\s*\?\s*["']gpt-4o-mini["']/.test(src),
      'gpt-4o-mini must no longer appear as the openai AI Generate fallback default'
    );
  });

  it('does not use deprecated "claude-3-haiku-20240307" as fallback default for AI Generate', () => {
    const src = loadAssistantSource();
    assert.ok(
      !/:\s*["']claude-3-haiku-20240307["']/.test(src),
      'claude-3-haiku-20240307 must no longer appear as the anthropic AI Generate fallback default'
    );
  });

  it('exports/exposes a default-resolver that returns the new defaults', () => {
    // The implementation MUST expose a pure function that, given a provider,
    // returns the AI-Generate default model. The exact name is
    // `resolveDefaultModel` and it accepts ("openai" | "anthropic").
    assert.ok(
      typeof resolveDefaultModel === 'function',
      'resolveDefaultModel must be exported as a function'
    );
    assert.equal(resolveDefaultModel('openai'), 'gpt-4o');
    assert.equal(resolveDefaultModel('anthropic'), 'claude-sonnet-4-20250514');
  });
});
