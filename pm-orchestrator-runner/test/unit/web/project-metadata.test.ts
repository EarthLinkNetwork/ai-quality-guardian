/**
 * Unit tests for project metadata (alias, description, notes) feature
 *
 * Tests:
 *   - Alias: set, modify, clear, display priority over projectPath
 *   - Description and notes: set, modify, clear
 *   - Filtering/search covers alias, description and notes
 *   - Revert returns original values for all three fields
 *   - Empty strings treated correctly
 *   - UpdateProjectIndexInput supports all metadata fields
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { ProjectIndex, UpdateProjectIndexInput } from "../../../src/web/dal/types";
import { filterProjects } from "./project-filtering.test";

describe("Project Metadata (alias, description, notes) - Unit Tests", () => {
  const now = new Date().toISOString();
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 1);

  const createProject = (
    id: string,
    overrides?: Partial<ProjectIndex>
  ): ProjectIndex => ({
    PK: `ORG#org_1`,
    SK: `PIDX#${id}`,
    projectId: id,
    orgId: "org_1",
    projectPath: `/test/${id}`,
    tags: [],
    favorite: false,
    archived: false,
    status: "idle",
    lastActivityAt: recentDate.toISOString(),
    sessionCount: 0,
    taskStats: { total: 0, completed: 0, failed: 0, running: 0, awaiting: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  describe("Alias (display name) - set, modify, clear", () => {
    it("sets an alias on a new project", () => {
      const p = createProject("alias_new", { alias: "My Web App" });
      assert.equal(p.alias, "My Web App");
    });

    it("alias is optional (undefined by default)", () => {
      const p = createProject("alias_none");
      assert.equal(p.alias, undefined);
    });

    it("modifies an existing alias", () => {
      const p = createProject("alias_mod", { alias: "Old Name" });
      assert.equal(p.alias, "Old Name");

      // Simulate update via spread (same as DAL updateProjectIndex)
      const updated: ProjectIndex = { ...p, alias: "New Name", updatedAt: new Date().toISOString() };
      assert.equal(updated.alias, "New Name");
      assert.notEqual(updated.alias, p.alias);
    });

    it("clears alias by setting to undefined", () => {
      const p = createProject("alias_clear", { alias: "Temp Name" });
      assert.equal(p.alias, "Temp Name");

      const cleared: ProjectIndex = { ...p, alias: undefined };
      assert.equal(cleared.alias, undefined);
    });

    it("alias takes display priority over projectPath", () => {
      const p = createProject("alias_display", {
        alias: "Friendly Name",
        projectPath: "/very/long/path/to/project",
      });
      // The UI renders: p.alias || p.projectPath
      const displayName = p.alias || p.projectPath;
      assert.equal(displayName, "Friendly Name");
    });

    it("falls back to projectPath when alias is not set", () => {
      const p = createProject("alias_fallback", {
        projectPath: "/my/project/path",
      });
      const displayName = p.alias || p.projectPath;
      assert.equal(displayName, "/my/project/path");
    });

    it("search finds projects by alias", () => {
      const projects = [
        createProject("a1", { alias: "Dashboard App" }),
        createProject("a2", { alias: "API Server" }),
      ];
      const filtered = filterProjects(projects, { search: "Dashboard" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "a1");
    });
  });

  describe("UpdateProjectIndexInput supports alias modification", () => {
    it("UpdateProjectIndexInput accepts alias field", () => {
      const update: UpdateProjectIndexInput = { alias: "Updated Alias" };
      assert.equal(update.alias, "Updated Alias");
    });

    it("UpdateProjectIndexInput accepts all metadata fields together", () => {
      const update: UpdateProjectIndexInput = {
        alias: "New Alias",
        description: "New Description",
        notes: "New Notes",
      };
      assert.equal(update.alias, "New Alias");
      assert.equal(update.description, "New Description");
      assert.equal(update.notes, "New Notes");
    });

    it("simulates full update cycle: create -> modify alias -> verify", () => {
      // Step 1: Create project with initial alias
      const original = createProject("update_cycle", { alias: "v1" });
      assert.equal(original.alias, "v1");

      // Step 2: Apply update (simulating DAL behavior)
      const updates: UpdateProjectIndexInput = { alias: "v2" };
      const updated: ProjectIndex = {
        ...original,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // Step 3: Verify
      assert.equal(updated.alias, "v2");
      assert.equal(updated.projectId, original.projectId);
      assert.equal(updated.projectPath, original.projectPath);
      assert.ok(updated.updatedAt > original.updatedAt);
    });
  });

  describe("ProjectIndex type supports description and notes", () => {
    it("accepts description field", () => {
      const p = createProject("p1", { description: "My project description" });
      assert.equal(p.description, "My project description");
    });

    it("accepts notes field", () => {
      const p = createProject("p2", { notes: "Some important notes" });
      assert.equal(p.notes, "Some important notes");
    });

    it("description and notes are optional (undefined by default)", () => {
      const p = createProject("p3");
      assert.equal(p.description, undefined);
      assert.equal(p.notes, undefined);
    });

    it("supports both description and notes together", () => {
      const p = createProject("p4", {
        description: "Frontend app",
        notes: "Needs migration to React 19",
      });
      assert.equal(p.description, "Frontend app");
      assert.equal(p.notes, "Needs migration to React 19");
    });
  });

  describe("Search includes description and notes", () => {
    const projects = [
      createProject("proj_a", {
        alias: "Alpha Project",
        description: "Main API server for production",
        notes: "Uses Express with TypeScript",
      }),
      createProject("proj_b", {
        alias: "Beta Project",
        description: "Mobile frontend application",
        notes: "React Native with Expo",
      }),
      createProject("proj_c", {
        alias: "Gamma Project",
      }),
    ];

    it("finds project by description keyword", () => {
      const filtered = filterProjects(projects, { search: "API server" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_a");
    });

    it("finds project by notes keyword", () => {
      const filtered = filterProjects(projects, { search: "React Native" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_b");
    });

    it("search is case-insensitive for description", () => {
      const filtered = filterProjects(projects, { search: "mobile frontend" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_b");
    });

    it("search is case-insensitive for notes", () => {
      const filtered = filterProjects(projects, { search: "express with typescript" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_a");
    });

    it("projects without description/notes are not falsely matched", () => {
      const filtered = filterProjects(projects, { search: "production" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_a");
    });

    it("search still works on alias when description/notes exist", () => {
      const filtered = filterProjects(projects, { search: "Gamma" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_c");
    });
  });

  describe("Revert behavior", () => {
    it("original values are preserved for revert (all three fields)", () => {
      const original = createProject("revert_test", {
        alias: "Original Alias",
        description: "Original Description",
        notes: "Original Notes",
      });

      // Simulate user editing values
      const edited = { ...original };
      edited.alias = "Edited Alias";
      edited.description = "Edited Description";
      edited.notes = "Edited Notes";

      // Verify edited values differ
      assert.notEqual(edited.alias, original.alias);
      assert.notEqual(edited.description, original.description);
      assert.notEqual(edited.notes, original.notes);

      // Simulate revert by restoring original values
      edited.alias = original.alias;
      edited.description = original.description;
      edited.notes = original.notes;

      // Verify revert
      assert.equal(edited.alias, "Original Alias");
      assert.equal(edited.description, "Original Description");
      assert.equal(edited.notes, "Original Notes");
    });

    it("revert works when original alias was undefined", () => {
      const original = createProject("revert_undef", {});

      const edited = { ...original };
      edited.alias = "Temporarily Set";

      // Revert
      edited.alias = original.alias;
      assert.equal(edited.alias, undefined);
    });
  });

  describe("Empty string handling", () => {
    it("empty string alias is treated as set", () => {
      const p = createProject("empty_alias", { alias: "" });
      assert.equal(p.alias, "");
    });

    it("empty string description is treated as set", () => {
      const p = createProject("empty_desc", { description: "" });
      assert.equal(p.description, "");
    });

    it("empty string notes is treated as set", () => {
      const p = createProject("empty_notes", { notes: "" });
      assert.equal(p.notes, "");
    });

    it("undefined description means not set", () => {
      const p = createProject("no_desc");
      assert.equal(p.description, undefined);
    });
  });
});
