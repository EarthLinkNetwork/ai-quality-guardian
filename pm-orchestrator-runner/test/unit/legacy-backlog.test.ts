/**
 * Legacy Backlog Scanner Test
 *
 * Forget-proof guard:
 * This test ensures that docs/BACKLOG.md exists and contains the
 * "Legacy Model Cleanup" entry created as a follow-up to Task E
 * (additive-only model registry refresh).
 *
 * Rationale:
 * Task E refreshed the model registry in an additive-only manner to
 * avoid breaking existing references. The actual cleanup of legacy
 * models (gpt-3.5-turbo, o1-preview, gpt-4-turbo, etc.) is deferred
 * to a follow-up task. This test ensures that follow-up task is not
 * silently deleted from the backlog — if someone removes the entry,
 * this test fails and forces them to explain why.
 *
 * Source: spec/12_LLM_PROVIDER_AND_MODELS.md "TODO: Legacy Cleanup" section.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Legacy Backlog Scanner (forget-proof)', () => {
  const backlogPath = path.resolve(__dirname, '..', '..', 'docs', 'BACKLOG.md');

  it('docs/BACKLOG.md must exist', () => {
    assert.ok(
      fs.existsSync(backlogPath),
      `docs/BACKLOG.md not found at ${backlogPath}. ` +
        'This file is required by Task E follow-up. Do not delete it.'
    );
  });

  it('docs/BACKLOG.md must contain "Legacy Model Cleanup" entry', () => {
    const body = fs.readFileSync(backlogPath, 'utf8');
    assert.ok(
      /Legacy Model Cleanup/i.test(body),
      'docs/BACKLOG.md must contain the "Legacy Model Cleanup" entry. ' +
        'If this test fails, someone has silently removed the follow-up task ' +
        'that Task E (additive model registry refresh) explicitly deferred. ' +
        'Restore the entry or document why cleanup is no longer needed.'
    );
  });

  it('Legacy Model Cleanup entry must reference the deprecated model IDs', () => {
    const body = fs.readFileSync(backlogPath, 'utf8');
    const requiredIds = ['gpt-3.5-turbo', 'o1-preview', 'gpt-4-turbo', 'o1', 'o1-mini'];
    for (const id of requiredIds) {
      assert.ok(
        body.includes(id),
        `docs/BACKLOG.md must mention legacy model "${id}" in the cleanup entry. ` +
          'These IDs were marked @deprecated in Task E but not removed.'
      );
    }
  });

  it('Legacy Model Cleanup entry must reference dependent files that need update', () => {
    const body = fs.readFileSync(backlogPath, 'utf8');
    const requiredRefs = [
      'model-policy-manager.ts',
      'ai-cost-service.test.ts',
      'project-settings-isolation.test.ts',
    ];
    for (const ref of requiredRefs) {
      assert.ok(
        body.includes(ref),
        `docs/BACKLOG.md must mention dependent file "${ref}" in the cleanup entry. ` +
          'Removing legacy models requires updating these files first.'
      );
    }
  });

  it('src/models/repl/model-registry.ts must carry @deprecated JSDoc for all 5 legacy IDs', () => {
    const registryPath = path.resolve(
      __dirname, '..', '..', 'src', 'models', 'repl', 'model-registry.ts'
    );
    const src = fs.readFileSync(registryPath, 'utf8');
    const legacyIds = ['gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1', 'o1-mini'];
    for (const id of legacyIds) {
      // Each legacy id line must be immediately preceded by a JSDoc block
      // that contains "@deprecated". We scan line-by-line to make the check
      // robust to reordering.
      const lines = src.split('\n');
      const idx = lines.findIndex((l) => l.includes(`id: '${id}'`));
      assert.ok(
        idx > 0,
        `model-registry.ts must still list legacy id "${id}" (additive-only refresh)`
      );
      // Walk upward: allow whitespace, expect a @deprecated JSDoc within 5 lines.
      let hasDeprecated = false;
      for (let i = idx - 1; i >= Math.max(0, idx - 5); i--) {
        if (lines[i].includes('@deprecated')) {
          hasDeprecated = true;
          break;
        }
        // If we run into another model entry above, stop — no JSDoc for us.
        if (/^\s*\{\s*id:/.test(lines[i])) break;
      }
      assert.ok(
        hasDeprecated,
        `legacy id "${id}" must be marked with a @deprecated JSDoc block in model-registry.ts (Task E scope: gpt-3.5-turbo, o1-preview, gpt-4-turbo, o1, o1-mini)`
      );
    }
  });
});
