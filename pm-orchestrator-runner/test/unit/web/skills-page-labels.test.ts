/**
 * Skills Page Labels - Template Scaffold vs AI Generate (Batch 4)
 *
 * Asserts that the Skills page (renderSkillsContent in src/web/public/index.html)
 * shows a help banner clarifying that:
 *   - This page manually edits skill files.
 *   - Natural-language AI generation lives at /ai-generate.
 *   - /api/skills/generate is a fixed template scaffold (no AI cost).
 *
 * The check is intentionally done by reading the raw index.html so that the
 * banner is statically present in the page (not added at runtime in a way that
 * could be silently dropped by a future refactor).
 *
 * Spec: spec/19_WEB_UI.md "Skills: Template Scaffold vs AI Generate (v3.x 新規 - Batch 4)"
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

describe('Skills Page Labels - Template Scaffold vs AI Generate (Batch 4)', () => {
  it('Skills page contains a help banner with data-testid="skills-template-help"', () => {
    const html = loadHtml();
    assert.ok(
      html.includes('data-testid="skills-template-help"'),
      'Skills page must include an element with data-testid="skills-template-help"'
    );
  });

  it('help banner mentions Template (distinguishes from AI Generate)', () => {
    const html = loadHtml();
    // Find the banner block by data-testid; the surrounding ~400 chars should mention Template/Scaffold.
    const idx = html.indexOf('data-testid="skills-template-help"');
    assert.notEqual(idx, -1, 'banner not found');
    const window = html.slice(Math.max(0, idx - 200), idx + 1200);
    assert.match(
      window,
      /[Tt]emplate|[Ss]caffold/,
      'banner copy must explain the page is template-based or that the API endpoint is a scaffold'
    );
  });

  it('help banner references AI Generate (cross-link to /ai-generate)', () => {
    const html = loadHtml();
    const idx = html.indexOf('data-testid="skills-template-help"');
    assert.notEqual(idx, -1, 'banner not found');
    const window = html.slice(Math.max(0, idx - 200), idx + 1200);
    assert.match(
      window,
      /AI\s*Generate|\/ai-generate/i,
      'banner copy must reference AI Generate so users know where the LLM-powered flow lives'
    );
  });

  it('help banner mentions /api/skills/generate (clarifies the API endpoint nature)', () => {
    const html = loadHtml();
    const idx = html.indexOf('data-testid="skills-template-help"');
    assert.notEqual(idx, -1, 'banner not found');
    const window = html.slice(Math.max(0, idx - 200), idx + 1200);
    assert.match(
      window,
      /\/api\/skills\/generate/,
      'banner copy must mention /api/skills/generate so users know which endpoint is template-only'
    );
  });

  it('help banner notes "no AI cost" (or equivalent zero-cost language)', () => {
    const html = loadHtml();
    const idx = html.indexOf('data-testid="skills-template-help"');
    assert.notEqual(idx, -1, 'banner not found');
    const window = html.slice(Math.max(0, idx - 200), idx + 1200);
    assert.match(
      window,
      /no\s+AI\s+cost|no\s+LLM|free|no\s+cost/i,
      'banner copy should reassure users that the template scaffold has no AI cost'
    );
  });
});
