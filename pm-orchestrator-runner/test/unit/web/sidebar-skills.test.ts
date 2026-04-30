/**
 * Sidebar Skills nav link test
 *
 * Task B Q1=α: Skills is an independent sidebar entry separate from Agents.
 *
 * Verifies that `src/web/public/index.html` contains:
 * - A sidebar `<a>` targeting `/skills`
 * - `data-nav="skills"` and `data-testid="nav-skills"` attributes
 *
 * Prevents the Agents-only regression (where Skills list was merged into
 * the Agents page) from coming back during future refactors.
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

describe("Sidebar: Skills nav link", () => {
  function loadHtml(): string {
    const indexPath = path.join(__dirname, "../../../src/web/public/index.html");
    return fs.readFileSync(indexPath, "utf-8");
  }

  it("should expose a Skills sidebar link with data-nav=skills", () => {
    const html = loadHtml();
    assert.ok(
      html.includes('data-nav="skills"'),
      "Sidebar should have data-nav=\"skills\" attribute"
    );
  });

  it("should expose data-testid=nav-skills on the Skills sidebar link", () => {
    const html = loadHtml();
    assert.ok(
      html.includes('data-testid="nav-skills"'),
      "Sidebar Skills link should have data-testid=\"nav-skills\""
    );
  });

  it("should have an href pointing to /skills", () => {
    const html = loadHtml();
    assert.ok(
      html.includes('href="/skills"'),
      "Sidebar should have <a href=\"/skills\">"
    );
  });

  it("should register /skills in the navMap", () => {
    const html = loadHtml();
    assert.ok(
      /['"]\/skills['"]\s*:\s*['"]skills['"]/.test(html),
      "navMap should include '/skills': 'skills' entry"
    );
  });
});
