/**
 * Settings Page Structure - Unit Tests (Batch 1)
 *
 * Validates that the Settings page markup in src/web/public/index.html
 * follows the "one save button per card" UX structure (spec/19_WEB_UI.md).
 *
 * Contract:
 *   1. Default LLM Configuration card has its own save button
 *      (data-testid="settings-save-default-llm") wired to saveDefaultLlmSettings().
 *   2. Default Generation Parameters card has its own save button
 *      (data-testid="settings-save-default-params") wired to saveDefaultGenerationParams().
 *   3. Internal LLM card keeps its existing save button
 *      (saveInternalLlmSettings).
 *   4. The omnibus bottom "Save Global Settings" button is removed,
 *      and the legacy saveGlobalSettings() JS function no longer exists.
 *
 * Rationale: the old bottom button saved Default LLM + Default Generation Parameters
 * together, while Internal LLM had its own save button. Users were confused
 * about which button persisted which state. Splitting per card is the fix.
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

describe('Settings Page Structure (Batch 1)', () => {
  describe('Default LLM Configuration card', () => {
    it('has a save button with data-testid="settings-save-default-llm"', () => {
      const html = loadHtml();
      assert.ok(
        /data-testid="settings-save-default-llm"/.test(html),
        'expected a save button with data-testid="settings-save-default-llm" inside Default LLM Configuration card'
      );
    });

    it('wires the save button to saveDefaultLlmSettings()', () => {
      const html = loadHtml();
      assert.ok(
        /onclick="saveDefaultLlmSettings\(\)"/.test(html),
        'expected onclick="saveDefaultLlmSettings()" handler to be present'
      );
    });

    it('defines the saveDefaultLlmSettings() JS function', () => {
      const html = loadHtml();
      assert.ok(
        /async function saveDefaultLlmSettings\s*\(/.test(html),
        'expected async function saveDefaultLlmSettings() to be defined'
      );
    });
  });

  describe('Default Generation Parameters card', () => {
    it('has a save button with data-testid="settings-save-default-params"', () => {
      const html = loadHtml();
      assert.ok(
        /data-testid="settings-save-default-params"/.test(html),
        'expected a save button with data-testid="settings-save-default-params" inside Default Generation Parameters card'
      );
    });

    it('wires the save button to saveDefaultGenerationParams()', () => {
      const html = loadHtml();
      assert.ok(
        /onclick="saveDefaultGenerationParams\(\)"/.test(html),
        'expected onclick="saveDefaultGenerationParams()" handler to be present'
      );
    });

    it('defines the saveDefaultGenerationParams() JS function', () => {
      const html = loadHtml();
      assert.ok(
        /async function saveDefaultGenerationParams\s*\(/.test(html),
        'expected async function saveDefaultGenerationParams() to be defined'
      );
    });
  });

  describe('Internal LLM card (unchanged)', () => {
    it('keeps its existing saveInternalLlmSettings() handler', () => {
      const html = loadHtml();
      assert.ok(
        /onclick="saveInternalLlmSettings\(\)"/.test(html),
        'expected saveInternalLlmSettings() handler to remain'
      );
      assert.ok(
        /async function saveInternalLlmSettings\s*\(/.test(html),
        'expected async function saveInternalLlmSettings() to remain defined'
      );
    });
  });

  describe('Legacy omnibus "Save Global Settings" button is removed', () => {
    it('no longer has a button with label "Save Global Settings"', () => {
      const html = loadHtml();
      assert.ok(
        !/>\s*Save Global Settings\s*</.test(html),
        'expected the "Save Global Settings" button to be removed from the page'
      );
    });

    it('no longer exposes onclick="saveGlobalSettings()"', () => {
      const html = loadHtml();
      assert.ok(
        !/onclick="saveGlobalSettings\(\)"/.test(html),
        'expected onclick="saveGlobalSettings()" to be removed'
      );
    });

    it('no longer defines the saveGlobalSettings() JS function', () => {
      const html = loadHtml();
      assert.ok(
        !/async function saveGlobalSettings\s*\(/.test(html),
        'expected async function saveGlobalSettings() to be removed'
      );
    });
  });
});
