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

    /**
     * R1 (Phase 1-fix): OpenAI strict-mode requires additionalProperties:false
     * at EVERY nested object. The previous schema declared `patch` as
     *   { type: "object", additionalProperties: true }
     * which OpenAI rejects with HTTP 500 ("additionalProperties must be false")
     * when strict=true. This regression broke the entire AI Generate flow at
     * runtime even though the local parse path was healthy.
     *
     * Fix: declare `patch` as `type: "string"` (JSON-encoded) and assert
     * recursively that no nested object node permits additionalProperties=true.
     */
    it('REGRESSION (Phase 1-fix): every nested object in the schema sets additionalProperties:false (OpenAI strict-mode)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function walk(node: any, pathStr: string): string[] {
        const failures: string[] = [];
        if (node === null || typeof node !== 'object') return failures;
        if (node.type === 'object') {
          if (node.additionalProperties !== false) {
            failures.push(`${pathStr}: additionalProperties must be false (got ${JSON.stringify(node.additionalProperties)})`);
          }
        }
        if (node.properties && typeof node.properties === 'object') {
          for (const [k, v] of Object.entries(node.properties)) {
            failures.push(...walk(v, `${pathStr}.${k}`));
          }
        }
        if (node.items) {
          failures.push(...walk(node.items, `${pathStr}[]`));
        }
        return failures;
      }
      const failures = walk(PROPOSAL_RESPONSE_JSON_SCHEMA, '$');
      assert.equal(
        failures.length,
        0,
        `OpenAI strict-mode violations:\n${failures.join('\n')}`
      );
    });

    it('REGRESSION (Phase 1-fix): artifact.patch is declared as a (nullable) JSON-encoded string (not open object)', () => {
      const schema = PROPOSAL_RESPONSE_JSON_SCHEMA;
      const patchNode = schema.properties.choices.items.properties.artifacts.items.properties.patch;
      assert.ok(patchNode, 'patch property must exist');
      // Acceptable forms under OpenAI strict-mode: "string" OR ["string","null"].
      // Both encode the patch as a JSON string; null is the optional sentinel.
      const t = patchNode.type;
      const isString = t === 'string';
      const isNullableString =
        Array.isArray(t) && t.includes('string') && (t.length === 1 || t.includes('null'));
      assert.ok(
        isString || isNullableString,
        `patch must be declared as "string" or ["string","null"] (got ${JSON.stringify(t)})`
      );
    });

    /**
     * R4 (Phase 1-fix, discovered during live verification V2 round 2):
     *
     * The Step-1 markdown code-block stripper used a greedy regex that matched
     * the FIRST ``` and the next ``` anywhere in the response. When the LLM
     * returned a clean JSON object whose `content` fields contained embedded
     * fenced code (e.g. "```bash\n./run-tests.sh\n```"), the stripper
     * extracted a chunk of bash source instead of the JSON, and downstream
     * extractBalancedJson rightly returned null.
     *
     * Fix: only strip the fence when the entire trimmed response is wrapped
     * in fences (i.e. starts with ``` and ends with ```). Otherwise leave the
     * raw response untouched and let extractBalancedJson find the object.
     */
    it('REGRESSION (Phase 1-fix V2): does not strip code fences embedded inside JSON string values', () => {
      const valid = JSON.stringify({
        choices: [{
          title: 't', summary: 's', scope: 'project',
          artifacts: [{
            kind: 'script',
            name: 'run-tests',
            targetPathHint: null,
            content: '#!/bin/bash\n```bash\n./run.sh\n```\n',
            patch: null,
            dependsOn: null,
          }],
          applySteps: [], rollbackSteps: [], riskNotes: [], questions: [],
        }],
      });
      // No outer code fence, just bare JSON with an embedded fence inside a string value.
      const planSet = parseProposalResponse(valid, 'p');
      assert.equal(planSet.choices.length, 1);
      assert.equal(planSet.choices[0].artifacts[0].kind, 'script');
    });

    /**
     * R1' (Phase 1-fix, discovered during live verification V2):
     *
     * OpenAI strict-mode rejects schemas where any object's `required` array
     * does not list every key in its `properties`. Optional fields must be
     * declared as `["<type>", "null"]` and STILL listed in `required`.
     *
     * The first round of fixes only addressed `additionalProperties:false` and
     * the open-object `patch`, which let the request reach OpenAI but produced:
     *   400 - "required is required to be supplied and to be an array
     *          including every key in properties. Missing 'targetPathHint'."
     *
     * This test locks down the requirement recursively so any future schema
     * extension that forgets to register a property in `required` is caught
     * at unit-test time, not during a real OpenAI call.
     */
    it('REGRESSION (Phase 1-fix V2): every object node lists every property key in its `required` array (OpenAI strict-mode)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function walk(node: any, pathStr: string): string[] {
        const failures: string[] = [];
        if (node === null || typeof node !== 'object') return failures;
        if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
          const propKeys = Object.keys(node.properties);
          const required: string[] = Array.isArray(node.required) ? node.required : [];
          const missing = propKeys.filter((k) => !required.includes(k));
          if (missing.length > 0) {
            failures.push(`${pathStr}: missing in required: [${missing.join(', ')}]`);
          }
        }
        if (node.properties && typeof node.properties === 'object') {
          for (const [k, v] of Object.entries(node.properties)) {
            failures.push(...walk(v, `${pathStr}.${k}`));
          }
        }
        if (node.items) {
          failures.push(...walk(node.items, `${pathStr}[]`));
        }
        return failures;
      }
      const failures = walk(PROPOSAL_RESPONSE_JSON_SCHEMA, '$');
      assert.equal(
        failures.length,
        0,
        `OpenAI strict-mode (required completeness) violations:\n${failures.join('\n')}`
      );
    });
  });
});
