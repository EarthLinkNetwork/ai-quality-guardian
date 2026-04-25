/**
 * AI Generate Plan Kind Selector - Inline JS / HTML Structure Tests (Batch 5)
 *
 * Validates that src/web/public/index.html exposes a planKind <select> on the
 * /ai-generate page (renderProposeTab) and that the inline JS:
 *   - includes 'auto', 'spec-first-tdd', 'plugin-bundle' as option values
 *   - reads/writes localStorage key 'pm-runner-ai-generate-plan-kind'
 *   - includes planKind in the POST /api/assistant/propose body (assistantSend)
 *
 * Spec: spec/37_AI_GENERATE.md §10.5 + spec/19_WEB_UI.md "AI Generate Plan Kind Selector"
 */
import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INDEX_HTML = path.resolve(
  __dirname,
  '../../../src/web/public/index.html'
);

function loadHtml(): string {
  return fs.readFileSync(INDEX_HTML, 'utf8');
}

function getSelectOpenTag(html: string, selectId: string): string | null {
  const re = new RegExp(`<select[^>]*\\bid="${selectId}"[^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[0] : null;
}

describe('AI Generate Plan Kind Selector (Batch 5)', () => {
  describe('HTML elements', () => {
    it('<select id="ai-generate-plan-kind"> exists', () => {
      const tag = getSelectOpenTag(loadHtml(), 'ai-generate-plan-kind');
      assert.ok(tag, '<select id="ai-generate-plan-kind"> not found in index.html');
    });

    it('<select id="ai-generate-plan-kind"> has data-testid="ai-generate-plan-kind"', () => {
      const tag = getSelectOpenTag(loadHtml(), 'ai-generate-plan-kind');
      assert.ok(tag);
      assert.match(
        tag!,
        /data-testid="ai-generate-plan-kind"/,
        'expected data-testid="ai-generate-plan-kind"'
      );
    });

    it('contains option value="auto"', () => {
      const html = loadHtml();
      // Restrict search to a window after the select opening tag.
      const idx = html.indexOf('id="ai-generate-plan-kind"');
      assert.ok(idx >= 0, 'select id must be present first');
      const window = html.substring(idx, idx + 2000);
      assert.match(window, /<option[^>]*value="auto"/i);
    });

    it('contains option value="spec-first-tdd"', () => {
      const html = loadHtml();
      const idx = html.indexOf('id="ai-generate-plan-kind"');
      assert.ok(idx >= 0);
      const window = html.substring(idx, idx + 2000);
      assert.match(window, /<option[^>]*value="spec-first-tdd"/i);
    });

    it('contains option value="plugin-bundle"', () => {
      const html = loadHtml();
      const idx = html.indexOf('id="ai-generate-plan-kind"');
      assert.ok(idx >= 0);
      const window = html.substring(idx, idx + 2000);
      assert.match(window, /<option[^>]*value="plugin-bundle"/i);
    });
  });

  describe('Inline JS', () => {
    it('reads localStorage key "pm-runner-ai-generate-plan-kind"', () => {
      const html = loadHtml();
      assert.match(
        html,
        /localStorage\.getItem\(\s*['"]pm-runner-ai-generate-plan-kind['"]/,
        'must call localStorage.getItem("pm-runner-ai-generate-plan-kind")'
      );
    });

    it('writes localStorage key "pm-runner-ai-generate-plan-kind"', () => {
      const html = loadHtml();
      assert.match(
        html,
        /localStorage\.setItem\(\s*['"]pm-runner-ai-generate-plan-kind['"]/,
        'must call localStorage.setItem("pm-runner-ai-generate-plan-kind", ...)'
      );
    });

    it('assistantSend includes planKind in the POST body', () => {
      const html = loadHtml();
      const sendStart = html.indexOf('async function assistantSend');
      assert.ok(sendStart >= 0, 'assistantSend function must exist');
      // Window large enough to cover the whole function body.
      const sendBody = html.substring(sendStart, sendStart + 4000);
      // Must reference planKind as a key being assembled into the proposeBody.
      assert.match(
        sendBody,
        /planKind\s*[:=]/,
        'assistantSend must build a planKind field into the propose request body'
      );
    });
  });
});
