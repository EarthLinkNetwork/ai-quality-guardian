/**
 * Assistant Routes - System Prompt by planKind Tests (Batch 5)
 *
 * Verifies that buildSystemPrompt accepts an optional planKind argument and
 * varies its few-shot section accordingly:
 *
 *   - 'auto'           : identical to the legacy 1-arg call (backward compat).
 *                        Only Examples A (slash command) and B (skill) are present.
 *   - 'spec-first-tdd' : adds Example C — spec → RED test → impl with applySteps
 *                        instructing "Run npm test and verify GREEN".
 *   - 'plugin-bundle'  : adds Example D — multi-artifact plugin bundle with
 *                        installPlan-style applySteps.
 *
 * The 6 section headers (Role / Output Format / Artifact Kinds / Quality
 * Guidelines / Examples / Constraints) MUST remain present for every planKind.
 *
 * Spec: spec/37_AI_GENERATE.md §10.5 "system prompt の差分"
 *       spec/08_TESTING_STRATEGY.md "AI Generate Plan Kind Selector (Batch 5)"
 */
import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
// Static import gives us the typed function; we cast at the call sites to
// the loose form so this RED test compiles against the current 1-arg
// signature AND the future 2-arg signature.
import { buildSystemPrompt as _buildSystemPrompt } from '../../../../src/web/routes/assistant';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildSystemPrompt: (...args: any[]) => string = _buildSystemPrompt as any;

const SECTIONS = [
  'Role',
  'Output Format',
  'Artifact Kind',
  'Quality Guidelines',
  'Examples',
  'Constraints',
];

function assertHasAllSections(prompt: string, label: string): void {
  for (const sec of SECTIONS) {
    assert.match(
      prompt,
      new RegExp(`(^|\\n)\\s*(?:#{1,6}\\s*)?${sec}\\b`, 'i'),
      `[${label}] missing section header "${sec}"`
    );
  }
}

describe('AI Generate - buildSystemPrompt by planKind (Batch 5)', () => {
  it('buildSystemPrompt accepts an optional planKind argument', () => {
    // The new signature is buildSystemPrompt(scope, planKind = 'auto').
    // Calling with a planKind must not throw.
    const out = buildSystemPrompt('project', 'auto');
    assert.ok(typeof out === 'string' && out.length > 0);
  });

  it('planKind="auto" is byte-identical to the 1-arg call (backward compat)', () => {
    const oneArg = buildSystemPrompt('project');
    const explicit = buildSystemPrompt('project', 'auto');
    assert.equal(
      oneArg,
      explicit,
      'auto planKind must produce IDENTICAL output to the existing 1-arg form'
    );
  });

  it('planKind="auto" preserves all 6 section headers', () => {
    const out = buildSystemPrompt('project', 'auto');
    assertHasAllSections(out, 'auto');
  });

  it('planKind="spec-first-tdd" preserves all 6 section headers', () => {
    const out = buildSystemPrompt('project', 'spec-first-tdd');
    assertHasAllSections(out, 'spec-first-tdd');
  });

  it('planKind="plugin-bundle" preserves all 6 section headers', () => {
    const out = buildSystemPrompt('project', 'plugin-bundle');
    assertHasAllSections(out, 'plugin-bundle');
  });

  it('planKind="spec-first-tdd" includes Example C (spec kind in few-shot)', () => {
    const auto = buildSystemPrompt('project', 'auto');
    const tdd = buildSystemPrompt('project', 'spec-first-tdd');
    // The tdd variant must be strictly larger than auto and must mention
    // a "spec" kind artifact and a "test" kind artifact in the few-shot block.
    assert.ok(
      tdd.length > auto.length,
      `spec-first-tdd prompt (${tdd.length} chars) must be longer than auto (${auto.length})`
    );
    // Example C marker — accept either explicit "Example C" label or the
    // presence of a "spec-first" / "TDD" reference in the prompt body.
    assert.match(
      tdd,
      /Example\s+C|spec[-\s]?first[-\s]?TDD|spec-first-tdd/i,
      'spec-first-tdd prompt must include Example C / spec-first-tdd reference'
    );
    // Few-shot must demonstrate kind=spec and kind=test artifacts.
    assert.match(
      tdd,
      /["']kind["']\s*:\s*["']spec["']/,
      'spec-first-tdd few-shot must contain a kind:"spec" artifact'
    );
    assert.match(
      tdd,
      /["']kind["']\s*:\s*["']test["']/,
      'spec-first-tdd few-shot must contain a kind:"test" artifact'
    );
  });

  it('planKind="spec-first-tdd" instructs to verify GREEN after npm test', () => {
    const tdd = buildSystemPrompt('project', 'spec-first-tdd');
    // The applySteps guidance for spec-first-tdd must mention running
    // tests and verifying GREEN.
    assert.match(
      tdd,
      /npm\s+test/i,
      'spec-first-tdd guidance must reference "npm test"'
    );
    assert.match(
      tdd,
      /\bGREEN\b/,
      'spec-first-tdd guidance must reference verifying GREEN'
    );
  });

  it('planKind="plugin-bundle" includes Example D (multi-artifact bundle)', () => {
    const auto = buildSystemPrompt('project', 'auto');
    const bundle = buildSystemPrompt('project', 'plugin-bundle');
    assert.ok(
      bundle.length > auto.length,
      `plugin-bundle prompt (${bundle.length} chars) must be longer than auto (${auto.length})`
    );
    assert.match(
      bundle,
      /Example\s+D|plugin[-\s]?bundle|PluginDefinition/i,
      'plugin-bundle prompt must include Example D / plugin-bundle reference'
    );
    // Bundle few-shot or guidance should reference an install-style apply step.
    assert.match(
      bundle,
      /pm-orchestrator\s+install|install\s+plan|installPlan|npm\s+pack/i,
      'plugin-bundle prompt must describe a bundle install workflow'
    );
  });

  it('planKind="spec-first-tdd" still mentions all valid artifact kinds', () => {
    const tdd = buildSystemPrompt('project', 'spec-first-tdd');
    for (const kind of ['skill', 'agent', 'command', 'hook', 'script']) {
      assert.ok(
        tdd.toLowerCase().includes(kind),
        `spec-first-tdd prompt must still mention legacy kind "${kind}"`
      );
    }
  });
});
