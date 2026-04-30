/**
 * Settings Model Dropdown Structure - Unit Tests (Batch 2)
 *
 * Validates that the three model dropdowns in src/web/public/index.html
 * (settings-model, settings-qd-model, project-model) have been migrated
 * from hardcoded <option> lists to dynamic population via /api/models.
 *
 * Spec: spec/19_WEB_UI.md "Model Dropdown Cost / Tier Display".
 *
 * Contract:
 *   1. Each <select> is marked with data-dynamic="true".
 *   2. Each <select> contains an "Loading..." placeholder option only
 *      (no hardcoded model rows like gpt-4o, claude-sonnet-4-*, etc.).
 *   3. The JS helper `populateModelDropdown(selectId, provider, selectedValue)`
 *      is defined in the inline script.
 *   4. renderAppSettings (or the equivalent flow) calls
 *      populateModelDropdown for both settings-model and settings-qd-model.
 *   5. renderProjectOverrides calls populateModelDropdown for project-model.
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

/**
 * Extract the immediate <option ...> children of a given <select id="..."> ... </select>.
 * Returns the array of <option> tag strings (entire opening tag + text + closing tag).
 */
function extractOptions(html: string, selectId: string): string[] {
  const selectRegex = new RegExp(
    `<select[^>]*\\bid="${selectId}"[\\s\\S]*?</select>`,
    'i'
  );
  const m = html.match(selectRegex);
  if (!m) return [];
  const optionRegex = /<option\b[^>]*>[\s\S]*?<\/option>/gi;
  return m[0].match(optionRegex) || [];
}

function getSelectOpenTag(html: string, selectId: string): string | null {
  const re = new RegExp(`<select[^>]*\\bid="${selectId}"[^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[0] : null;
}

const HARDCODED_MODEL_VALUES = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'claude-3-5-sonnet-20241022',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-4-5-20251001',
  'gpt-5.4',
  'gpt-5.4-mini',
];

describe('Settings Model Dropdowns (Batch 2)', () => {
  for (const selectId of ['settings-model', 'settings-qd-model', 'project-model']) {
    describe(`<select id="${selectId}">`, () => {
      it('exists in the page', () => {
        const tag = getSelectOpenTag(loadHtml(), selectId);
        assert.ok(tag, `<select id="${selectId}"> not found in index.html`);
      });

      it('has data-dynamic="true" attribute', () => {
        const tag = getSelectOpenTag(loadHtml(), selectId);
        assert.ok(tag);
        assert.ok(
          /data-dynamic="true"/.test(tag),
          `<select id="${selectId}"> must carry data-dynamic="true". Got: ${tag}`
        );
      });

      it('does not contain hardcoded model <option>s (only a placeholder)', () => {
        const html = loadHtml();
        const opts = extractOptions(html, selectId);
        // Allow ONLY a placeholder option (e.g. value="" or "Loading...").
        // Reject any option whose value is a known model id.
        for (const opt of opts) {
          for (const modelId of HARDCODED_MODEL_VALUES) {
            const escId = modelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`value="${escId}"`, 'i');
            assert.ok(
              !re.test(opt),
              `<select id="${selectId}"> still contains hardcoded option for ${modelId}: ${opt}`
            );
          }
        }
      });

      it('contains a placeholder/loading option', () => {
        const opts = extractOptions(loadHtml(), selectId);
        assert.ok(
          opts.length >= 1,
          `<select id="${selectId}"> must keep at least a placeholder <option>`
        );
      });
    });
  }

  describe('populateModelDropdown helper', () => {
    it('is defined as a function in the inline script', () => {
      const html = loadHtml();
      assert.ok(
        /function\s+populateModelDropdown\s*\(/.test(html),
        'expected `function populateModelDropdown(` in inline script'
      );
    });

    it('accepts (selectId, provider, selectedValue) signature', () => {
      const html = loadHtml();
      // Look for the function declaration line; tolerate whitespace.
      const m = html.match(
        /function\s+populateModelDropdown\s*\(\s*([a-zA-Z_$][\w$]*)\s*,\s*([a-zA-Z_$][\w$]*)\s*,\s*([a-zA-Z_$][\w$]*)\s*\)/
      );
      assert.ok(m, 'populateModelDropdown must take exactly three parameters');
    });

    it('formats option text as "{name} ($X/1M in, $Y/1M out • {tier})" (A-4)', () => {
      const html = loadHtml();
      // Verify the A-4 format pieces are present in the helper body.
      // Format: "{displayName} ($X.XX/1M in, $Y.YY/1M out • {tier})"
      assert.ok(
        /\/1M in/.test(html),
        'populateModelDropdown must include "/1M in" in option text (A-4 format)'
      );
      assert.ok(
        /\/1M out/.test(html),
        'populateModelDropdown must include "/1M out" in option text (A-4 format)'
      );
      assert.ok(
        /•|&bull;/.test(html),
        'populateModelDropdown must include the bullet separator (•) in option text'
      );
    });
  });

  describe('Dropdowns are wired into render flow', () => {
    it('settings-model is populated after settings render', () => {
      const html = loadHtml();
      assert.ok(
        /populateModelDropdown\(\s*['"]settings-model['"]/.test(html),
        'expected populateModelDropdown("settings-model", ...) call'
      );
    });

    it('settings-qd-model is populated after settings render', () => {
      const html = loadHtml();
      assert.ok(
        /populateModelDropdown\(\s*['"]settings-qd-model['"]/.test(html),
        'expected populateModelDropdown("settings-qd-model", ...) call'
      );
    });

    it('project-model is populated after project overrides render', () => {
      const html = loadHtml();
      assert.ok(
        /populateModelDropdown\(\s*['"]project-model['"]/.test(html),
        'expected populateModelDropdown("project-model", ...) call'
      );
    });
  });
});
