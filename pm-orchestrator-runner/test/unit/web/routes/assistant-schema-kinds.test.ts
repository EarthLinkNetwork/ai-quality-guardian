/**
 * Assistant Routes - Schema Kinds Tests (Batch 5)
 *
 * Verifies that the AI Generate JSON schema (PROPOSAL_RESPONSE_JSON_SCHEMA),
 * the runtime VALID_KINDS set, and the ALLOWED_EXTENSIONS map all support
 * the new artifact kinds `spec` and `test` introduced for the spec-first-tdd
 * planKind, while preserving full backward compatibility for the existing
 * 7 kinds (command/agent/skill/script/hook/claudeMdPatch/settingsJsonPatch).
 *
 * Spec: spec/37_AI_GENERATE.md §10.3 "新 artifact kinds: `spec`, `test`"
 *       spec/08_TESTING_STRATEGY.md "AI Generate Plan Kind Selector (Batch 5)"
 */
import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PROPOSAL_RESPONSE_JSON_SCHEMA } from '../../../../src/web/routes/assistant';

const ASSISTANT_TS = path.resolve(
  __dirname,
  '../../../../src/web/routes/assistant.ts'
);

function loadAssistantSource(): string {
  return fs.readFileSync(ASSISTANT_TS, 'utf8');
}

describe('AI Generate - schema kinds (Batch 5)', () => {
  it('PROPOSAL_RESPONSE_JSON_SCHEMA artifact.kind enum includes "spec"', () => {
    const enumVals: string[] =
      PROPOSAL_RESPONSE_JSON_SCHEMA.properties.choices.items.properties.artifacts.items
        .properties.kind.enum;
    assert.ok(Array.isArray(enumVals), 'kind.enum must be an array');
    assert.ok(enumVals.includes('spec'), `expected "spec" in enum, got ${JSON.stringify(enumVals)}`);
  });

  it('PROPOSAL_RESPONSE_JSON_SCHEMA artifact.kind enum includes "test"', () => {
    const enumVals: string[] =
      PROPOSAL_RESPONSE_JSON_SCHEMA.properties.choices.items.properties.artifacts.items
        .properties.kind.enum;
    assert.ok(enumVals.includes('test'), `expected "test" in enum, got ${JSON.stringify(enumVals)}`);
  });

  it('PROPOSAL_RESPONSE_JSON_SCHEMA preserves all 7 legacy kinds (backward compat)', () => {
    const enumVals: string[] =
      PROPOSAL_RESPONSE_JSON_SCHEMA.properties.choices.items.properties.artifacts.items
        .properties.kind.enum;
    for (const legacy of [
      'command', 'agent', 'skill', 'script', 'hook',
      'claudeMdPatch', 'settingsJsonPatch',
    ]) {
      assert.ok(
        enumVals.includes(legacy),
        `legacy kind "${legacy}" must remain in enum, got ${JSON.stringify(enumVals)}`
      );
    }
  });

  it('VALID_KINDS source declaration includes "spec" and "test"', () => {
    const src = loadAssistantSource();
    // Look for the VALID_KINDS Set literal block; assert both new kinds appear
    // at least once each as quoted string literals in the source.
    assert.match(src, /VALID_KINDS\s*=\s*new Set\(\[[\s\S]*?["']spec["'][\s\S]*?\]\)/,
      '"spec" must appear in the VALID_KINDS Set literal');
    assert.match(src, /VALID_KINDS\s*=\s*new Set\(\[[\s\S]*?["']test["'][\s\S]*?\]\)/,
      '"test" must appear in the VALID_KINDS Set literal');
  });

  it('ALLOWED_EXTENSIONS.spec contains ".md"', () => {
    const src = loadAssistantSource();
    // Match  spec: [".md"]  inside the ALLOWED_EXTENSIONS object literal.
    assert.match(
      src,
      /ALLOWED_EXTENSIONS[\s\S]{0,400}\bspec\s*:\s*\[\s*["']\.md["']/,
      'ALLOWED_EXTENSIONS must declare spec: [".md"]'
    );
  });

  it('ALLOWED_EXTENSIONS.test contains ".ts" and ".js"', () => {
    const src = loadAssistantSource();
    // Match  test: [".ts", ".js"]  (order independent, allow whitespace).
    assert.match(
      src,
      /ALLOWED_EXTENSIONS[\s\S]{0,500}\btest\s*:\s*\[[^\]]*["']\.ts["'][^\]]*["']\.js["']/,
      'ALLOWED_EXTENSIONS.test must include both ".ts" and ".js"'
    );
  });
});
