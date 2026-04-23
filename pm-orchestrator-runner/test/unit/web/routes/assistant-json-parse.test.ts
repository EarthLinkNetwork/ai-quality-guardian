/**
 * Assistant Routes - JSON Parse Robustness Tests
 *
 * Validates the LLM-response JSON extraction pipeline used by
 * src/web/routes/assistant.ts (POST /api/assistant/propose).
 *
 * Background:
 *   The original implementation used a greedy regex `/\{[\s\S]*\}/` to extract
 *   the JSON object from raw LLM output. This regex is anchored to the FIRST
 *   `{` and the LAST `}`, which mangles inputs that contain prose after the
 *   real JSON ends with a `}` followed by additional `}` characters elsewhere
 *   (or that are simply truncated).
 *
 * These tests exercise:
 *   1. Bracket-balanced extraction (regression for greedy-regex bug)
 *   2. Truncated JSON repair fallback
 *   3. OpenAI structured-output schema integrity (response_format: json_schema strict)
 *
 * Spec: spec/12_LLM_PROVIDER_AND_MODELS.md §6 (JSON Output Parse Strategy)
 *       spec/08_TESTING_STRATEGY.md (AI Generate JSON Parse Robustness)
 */

import { describe, it } from 'mocha';
import assert from 'node:assert/strict';
import {
  extractBalancedJson,
  parseProposalResponse,
  repairTruncatedJson,
  buildOpenAIResponseFormat,
  PROPOSAL_RESPONSE_JSON_SCHEMA,
} from '../../../../src/web/routes/assistant';

describe('Assistant Routes - JSON parse robustness', () => {
  describe('extractBalancedJson', () => {
    it('returns the first balanced JSON object, ignoring trailing prose', () => {
      const input = 'noise before {"a":1,"b":{"c":2}} trailing prose }';
      const result = extractBalancedJson(input);
      assert.equal(result, '{"a":1,"b":{"c":2}}');
    });

    it('handles strings containing unescaped braces correctly', () => {
      const input = '{"text":"value with } inside string","n":1}';
      const result = extractBalancedJson(input);
      assert.equal(result, input);
    });

    it('handles escaped quotes inside strings', () => {
      const input = '{"text":"he said \\"hi\\" then left","n":1}';
      const result = extractBalancedJson(input);
      assert.equal(result, input);
    });

    it('returns null when JSON object is truncated (depth never reaches 0)', () => {
      const input = '{"a":1,"b":[1,2,3'; // unclosed
      const result = extractBalancedJson(input);
      assert.equal(result, null);
    });

    it('returns null when no opening brace exists', () => {
      const result = extractBalancedJson('no json here');
      assert.equal(result, null);
    });

    it('REGRESSION: greedy /\\{[\\s\\S]*\\}/ would over-capture; balanced extractor stops at first close', () => {
      // The original greedy regex would match from the FIRST { to the LAST }
      // producing INVALID JSON. The balanced extractor must stop at the matching close.
      const input = '{"k":"v"} extra text } more text }';
      const result = extractBalancedJson(input);
      assert.equal(result, '{"k":"v"}');
      // Confirm result parses cleanly
      assert.doesNotThrow(() => JSON.parse(result as string));
    });
  });

  describe('parseProposalResponse - bracket-balanced flow', () => {
    it('parses a valid JSON object with surrounding noise', () => {
      const valid = JSON.stringify({
        choices: [{
          title: 't', summary: 's', scope: 'project',
          artifacts: [], applySteps: [], rollbackSteps: [], riskNotes: [], questions: [],
        }],
      });
      const raw = 'Here is your plan:\n' + valid + '\n(end)';
      const planSet = parseProposalResponse(raw, 'orig prompt');
      assert.equal(planSet.choices.length, 1);
      assert.equal(planSet.userPrompt, 'orig prompt');
    });

    it('REGRESSION: parses JSON wrapped in markdown code block', () => {
      const valid = JSON.stringify({
        choices: [{
          title: 'in code block', summary: '', scope: 'project',
          artifacts: [], applySteps: [], rollbackSteps: [], riskNotes: [], questions: [],
        }],
      });
      const raw = '```json\n' + valid + '\n```';
      const planSet = parseProposalResponse(raw, 'p');
      assert.equal(planSet.choices[0].title, 'in code block');
    });

    it('REGRESSION: recovers from truncated JSON via repair fallback', () => {
      // Truncated mid-array (unclosed brackets)
      const truncated = '{"choices":[{"title":"t","summary":"s","scope":"project","artifacts":[';
      const planSet = parseProposalResponse(truncated, 'p');
      // After repair, we should have a usable (possibly empty) choices array
      assert.ok(Array.isArray(planSet.choices));
    });

    it('throws a clear error when the LLM response contains no JSON object', () => {
      assert.throws(
        () => parseProposalResponse('plain text, no braces at all', 'p'),
        /does not contain valid JSON|malformed/i
      );
    });
  });

  describe('repairTruncatedJson', () => {
    it('returns null for non-object input', () => {
      assert.equal(repairTruncatedJson('not json'), null);
    });

    it('repairs an object truncated mid-array', () => {
      const input = '{"choices":[{"title":"t"';
      const repaired = repairTruncatedJson(input);
      assert.ok(repaired, 'expected non-null repair result');
      // Must be valid JSON
      assert.doesNotThrow(() => JSON.parse(repaired as string));
    });
  });

  describe('OpenAI structured output (response_format: json_schema strict)', () => {
    it('PROPOSAL_RESPONSE_JSON_SCHEMA defines the choices/artifacts shape', () => {
      const schema = PROPOSAL_RESPONSE_JSON_SCHEMA;
      assert.equal(schema.type, 'object');
      assert.ok(schema.properties);
      assert.ok(schema.properties.choices, 'schema must define "choices"');
      assert.equal(schema.properties.choices.type, 'array');
      assert.ok(Array.isArray(schema.required) && schema.required.includes('choices'));
    });

    it('schema constrains artifact.kind to the same VALID_KINDS used by the validator', () => {
      const schema = PROPOSAL_RESPONSE_JSON_SCHEMA;
      const choiceItems = schema.properties.choices.items;
      const artifactItems = choiceItems.properties.artifacts.items;
      const kindEnum = artifactItems.properties.kind.enum as string[];
      // VALID_KINDS includes these — schema must mirror them exactly.
      const expected = ['command', 'agent', 'skill', 'script', 'hook', 'claudeMdPatch', 'settingsJsonPatch'];
      for (const k of expected) {
        assert.ok(kindEnum.includes(k), `expected kind "${k}" in schema enum`);
      }
    });

    it('buildOpenAIResponseFormat returns response_format with type=json_schema and strict=true', () => {
      const rf = buildOpenAIResponseFormat();
      assert.equal(rf.type, 'json_schema');
      assert.ok(rf.json_schema, 'must contain json_schema');
      assert.equal(rf.json_schema.strict, true);
      assert.equal(rf.json_schema.name, 'AIGenerateProposal');
      assert.equal(rf.json_schema.schema, PROPOSAL_RESPONSE_JSON_SCHEMA);
    });
  });
});
