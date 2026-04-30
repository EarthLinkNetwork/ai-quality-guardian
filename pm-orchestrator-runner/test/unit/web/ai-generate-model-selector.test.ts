/**
 * AI Generate Model Selector - Inline JS / HTML Structure Tests (Batch 3)
 *
 * Validates that src/web/public/index.html contains the new model selector
 * UI for the /ai-generate page (renderProposeTab) and that the inline JS
 *   - calls populateModelDropdown('ai-generate-model', ...)
 *   - reads/writes localStorage for keys
 *       'pm-runner-ai-generate-provider'
 *       'pm-runner-ai-generate-model'
 *   - includes provider/model in the POST /api/assistant/propose body
 *
 * Spec: spec/37_AI_GENERATE.md §5 "Model Override Flow (UI)"
 *       spec/19_WEB_UI.md "AI Generate Model Selector (v3.x 新規 - Batch 3)"
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

describe('AI Generate Model Selector (Batch 3)', () => {
  describe('HTML elements', () => {
    it('<select id="ai-generate-provider"> exists', () => {
      const tag = getSelectOpenTag(loadHtml(), 'ai-generate-provider');
      assert.ok(tag, '<select id="ai-generate-provider"> not found in index.html');
    });

    it('<select id="ai-generate-provider"> has data-testid', () => {
      const tag = getSelectOpenTag(loadHtml(), 'ai-generate-provider');
      assert.ok(tag);
      assert.match(
        tag,
        /data-testid="ai-generate-provider"/,
        'expected data-testid="ai-generate-provider"'
      );
    });

    it('<select id="ai-generate-model"> exists', () => {
      const tag = getSelectOpenTag(loadHtml(), 'ai-generate-model');
      assert.ok(tag, '<select id="ai-generate-model"> not found in index.html');
    });

    it('<select id="ai-generate-model"> is marked data-dynamic="true"', () => {
      const tag = getSelectOpenTag(loadHtml(), 'ai-generate-model');
      assert.ok(tag);
      assert.match(
        tag,
        /data-dynamic="true"/,
        '<select id="ai-generate-model"> must carry data-dynamic="true"'
      );
    });

    it('<select id="ai-generate-model"> has data-testid', () => {
      const tag = getSelectOpenTag(loadHtml(), 'ai-generate-model');
      assert.ok(tag);
      assert.match(
        tag,
        /data-testid="ai-generate-model"/,
        'expected data-testid="ai-generate-model"'
      );
    });
  });

  describe('JS wiring', () => {
    it('populateModelDropdown is called for "ai-generate-model"', () => {
      const html = loadHtml();
      assert.match(
        html,
        /populateModelDropdown\(\s*['"]ai-generate-model['"]/,
        'expected populateModelDropdown("ai-generate-model", ...) call'
      );
    });

    it('localStorage key "pm-runner-ai-generate-provider" is written', () => {
      const html = loadHtml();
      assert.match(
        html,
        /localStorage\.setItem\(\s*['"]pm-runner-ai-generate-provider['"]/,
        'expected localStorage.setItem("pm-runner-ai-generate-provider", ...) call'
      );
    });

    it('localStorage key "pm-runner-ai-generate-model" is written', () => {
      const html = loadHtml();
      assert.match(
        html,
        /localStorage\.setItem\(\s*['"]pm-runner-ai-generate-model['"]/,
        'expected localStorage.setItem("pm-runner-ai-generate-model", ...) call'
      );
    });

    it('localStorage key "pm-runner-ai-generate-provider" is read on page load', () => {
      const html = loadHtml();
      assert.match(
        html,
        /localStorage\.getItem\(\s*['"]pm-runner-ai-generate-provider['"]/,
        'expected localStorage.getItem("pm-runner-ai-generate-provider")'
      );
    });

    it('localStorage key "pm-runner-ai-generate-model" is read on page load', () => {
      const html = loadHtml();
      assert.match(
        html,
        /localStorage\.getItem\(\s*['"]pm-runner-ai-generate-model['"]/,
        'expected localStorage.getItem("pm-runner-ai-generate-model")'
      );
    });

    it('assistantSend (or equivalent) includes provider in propose POST body', () => {
      const html = loadHtml();
      // Look for property literal "provider:" within a region near assistant-input/propose body construction.
      // Conservative: just require that the literal string "provider:" appears
      // near "/api/assistant/propose".
      const idxApi = html.indexOf('/api/assistant/propose');
      assert.ok(idxApi >= 0, 'expected /api/assistant/propose call in index.html');
      const window = html.substring(Math.max(0, idxApi - 200), idxApi + 2000);
      assert.match(
        window,
        /provider\s*:/,
        'expected propose POST body to include a `provider:` property'
      );
    });

    it('assistantSend (or equivalent) includes model in propose POST body', () => {
      const html = loadHtml();
      const idxApi = html.indexOf('/api/assistant/propose');
      assert.ok(idxApi >= 0);
      const window = html.substring(Math.max(0, idxApi - 200), idxApi + 2000);
      assert.match(
        window,
        /model\s*:/,
        'expected propose POST body to include a `model:` property'
      );
    });
  });
});
