/**
 * Skills page renderer test
 *
 * Task B Q1=α: Skills has its own renderer function and SPA route
 * separate from Agents.
 *
 * Verifies that `src/web/public/index.html` contains:
 * - A `renderSkillsPage` function declaration (independent from renderAgentsPage)
 * - An SPA dispatcher branch for `/skills` that calls renderSkillsPage
 * - The old "Agents & Skills" page title is gone (just "Agents")
 *
 * Prevents accidental removal during refactors.
 *
 * @see spec/19_WEB_UI.md section 2
 * @see spec/08_TESTING_STRATEGY.md "Skills page tests"
 */

import { describe, it } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Skills page renderer", () => {
  function loadHtml(): string {
    const indexPath = path.join(
      __dirname,
      "../../../../src/web/public/index.html"
    );
    return fs.readFileSync(indexPath, "utf-8");
  }

  it("should declare a renderSkillsPage function", () => {
    const html = loadHtml();
    assert.ok(
      /function\s+renderSkillsPage\s*\(/.test(html),
      "index.html should define a renderSkillsPage function"
    );
  });

  it("should dispatch /skills to renderSkillsPage from the SPA router", () => {
    const html = loadHtml();
    // Match: } else if (path === '/skills') { renderSkillsPage();
    // The assertion is intentionally tolerant about whitespace and quote style.
    const dispatcherPattern =
      /path\s*===\s*['"]\/skills['"][^}]*renderSkillsPage\s*\(/s;
    assert.ok(
      dispatcherPattern.test(html),
      "SPA dispatcher should route '/skills' to renderSkillsPage()"
    );
  });

  it("should no longer render the combined \"Agents & Skills\" page header", () => {
    const html = loadHtml();
    // The old renderAgentsContent used to emit <h2>Agents &amp; Skills</h2>.
    // After Task B the Agents page renders just "Agents".
    assert.ok(
      !html.includes("Agents &amp; Skills"),
      "Agents page should no longer use the combined 'Agents & Skills' title"
    );
  });
});
