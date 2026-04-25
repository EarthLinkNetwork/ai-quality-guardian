/**
 * Assistant Routes - System Prompt Structure Tests (Batch 3)
 *
 * Verifies that `buildSystemPrompt(scope)` produces an enriched, well-structured
 * prompt covering all 6 required sections (Role / Output Format / Artifact Kinds /
 * Quality Guidelines / Examples / Constraints) and that the prompt has been
 * substantively expanded relative to the prior ~50-line version.
 *
 * Spec: spec/37_AI_GENERATE.md §4 "System Prompt Structure"
 *       spec/08_TESTING_STRATEGY.md "AI Generate Model Selector & Quality (Batch 3)"
 */
import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { buildSystemPrompt } from '../../../../src/web/routes/assistant';

describe('AI Generate - buildSystemPrompt structure (Batch 3)', () => {
  it('buildSystemPrompt is exported as a function', () => {
    assert.ok(
      typeof buildSystemPrompt === 'function',
      'buildSystemPrompt must be exported from assistant.ts for testability'
    );
  });

  it('returns a non-empty string for scope=project', () => {
    const out = buildSystemPrompt('project');
    assert.ok(typeof out === 'string');
    assert.ok(out.length > 0);
  });

  it('embeds the scope value into the prompt', () => {
    const out = buildSystemPrompt('global');
    assert.ok(
      out.includes('global'),
      'prompt must reference the scope passed in (got no "global" in output)'
    );
  });

  it('contains a Role / 役割 section header', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /(^|\n)\s*(?:#{1,6}\s*)?Role\b/i,
      'expected a "Role" section header'
    );
  });

  it('contains an Output Format section header', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /(^|\n)\s*(?:#{1,6}\s*)?Output Format\b/i,
      'expected an "Output Format" section header'
    );
  });

  it('contains an Artifact Kind(s) guidance section', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /(^|\n)\s*(?:#{1,6}\s*)?Artifact (?:Kind|Kinds)\b/i,
      'expected an "Artifact Kinds" section header'
    );
  });

  it('contains a Quality Guidelines section header', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /(^|\n)\s*(?:#{1,6}\s*)?Quality Guidelines\b/i,
      'expected a "Quality Guidelines" section header'
    );
  });

  it('contains an Examples (few-shot) section header', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /(^|\n)\s*(?:#{1,6}\s*)?Examples\b/i,
      'expected an "Examples" section header (few-shot)'
    );
  });

  it('contains a Constraints section header', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /(^|\n)\s*(?:#{1,6}\s*)?Constraints\b/i,
      'expected a "Constraints" section header'
    );
  });

  it('still documents the JSON output schema with "choices" array', () => {
    const out = buildSystemPrompt('project');
    assert.match(out, /"choices"/);
    assert.match(out, /"artifacts"/);
  });

  it('still references all valid artifact kinds (skill, agent, command, hook, script)', () => {
    const out = buildSystemPrompt('project');
    for (const kind of ['skill', 'agent', 'command', 'hook', 'script']) {
      assert.ok(
        out.toLowerCase().includes(kind),
        `prompt must mention artifact kind "${kind}"`
      );
    }
  });

  it('is substantially longer than the legacy ~50-line prompt (>= 2500 chars)', () => {
    const out = buildSystemPrompt('project');
    assert.ok(
      out.length >= 2500,
      `prompt is too short for the enriched Batch 3 spec (got ${out.length} chars, need >= 2500)`
    );
  });

  it('contains at least one few-shot example block (User: / Output:)', () => {
    const out = buildSystemPrompt('project');
    // We require a recognizable input/output pairing in the Examples section.
    // Accept variations: "User Prompt:", "Input:", "Example Input", etc.
    const hasExampleInputMarker =
      /(User Prompt|Example Input|Example Request|Input Prompt|User Request)/i.test(out);
    const hasExampleOutputMarker =
      /(Example Output|Output JSON|Expected Output|Example Response|Output:)/i.test(out);
    assert.ok(
      hasExampleInputMarker,
      'prompt must mark at least one few-shot example input'
    );
    assert.ok(
      hasExampleOutputMarker,
      'prompt must mark at least one few-shot example output'
    );
  });

  it('warns the model not to invent / hallucinate flags or APIs', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /\b(do not (invent|hallucinate|fabricate)|never invent|avoid inventing|do not (?:make up|guess))\b/i,
      'prompt must explicitly forbid hallucinating flags / APIs'
    );
  });

  it('warns about secrets / credentials', () => {
    const out = buildSystemPrompt('project');
    assert.match(
      out,
      /\b(secret|credential|api key|token)s?\b/i,
      'prompt should mention secrets/credentials in the constraints'
    );
  });
});
