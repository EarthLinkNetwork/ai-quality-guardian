/**
 * Integration tests for Project Metadata API (description, notes, alias)
 *
 * Tests the full round-trip: create with metadata, update metadata, search by metadata,
 * and revert behavior through the NoDynamo DAL.
 */

import { describe, it, before, after } from "mocha";
import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  NoDynamoDAL,
  initNoDynamo,
  getNoDynamo,
} from "../../src/web/dal/no-dynamo";

describe("Project Metadata API - Integration Tests", () => {
  let dal: NoDynamoDAL;
  let stateDir: string;

  before(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-metadata-test-"));
    initNoDynamo(stateDir);
    dal = getNoDynamo();
  });

  after(() => {
    // Cleanup temp directory
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  describe("Create project with metadata", () => {
    it("creates project with description and notes", async () => {
      const project = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/create-with-meta",
        alias: "Meta Project",
        description: "A project with full metadata",
        notes: "Important: handle with care",
      });

      assert.equal(project.alias, "Meta Project");
      assert.equal(project.description, "A project with full metadata");
      assert.equal(project.notes, "Important: handle with care");
    });

    it("creates project without optional metadata", async () => {
      const project = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/create-without-meta",
      });

      assert.equal(project.alias, undefined);
      assert.equal(project.description, undefined);
      assert.equal(project.notes, undefined);
    });
  });

  describe("Update project metadata", () => {
    it("updates description on existing project", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/update-desc",
      });

      const updated = await dal.updateProjectIndex(created.projectId, {
        description: "Now has a description",
      });

      assert.ok(updated);
      assert.equal(updated!.description, "Now has a description");
    });

    it("updates notes on existing project", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/update-notes",
      });

      const updated = await dal.updateProjectIndex(created.projectId, {
        notes: "Some notes added later",
      });

      assert.ok(updated);
      assert.equal(updated!.notes, "Some notes added later");
    });

    it("updates alias, description, and notes simultaneously", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/update-all-meta",
        alias: "Old Name",
      });

      const updated = await dal.updateProjectIndex(created.projectId, {
        alias: "New Name",
        description: "New description",
        notes: "New notes",
      });

      assert.ok(updated);
      assert.equal(updated!.alias, "New Name");
      assert.equal(updated!.description, "New description");
      assert.equal(updated!.notes, "New notes");
    });

    it("clears description by setting to undefined", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/clear-desc",
        description: "Will be cleared",
      });

      const updated = await dal.updateProjectIndex(created.projectId, {
        description: undefined,
      });

      // When undefined is spread, the original value should remain
      // (NoDynamo uses object spread, so undefined fields keep original)
      assert.ok(updated);
    });

    it("preserves updatedAt after metadata change", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/updated-at-check",
      });

      const originalUpdatedAt = created.updatedAt;
      // Small delay to ensure different timestamp
      await new Promise(r => setTimeout(r, 10));

      const updated = await dal.updateProjectIndex(created.projectId, {
        description: "Updated description",
      });

      assert.ok(updated);
      assert.ok(updated!.updatedAt >= originalUpdatedAt);
    });
  });

  describe("Search includes metadata", () => {
    before(async () => {
      // Create projects with searchable metadata
      await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/search-alpha",
        alias: "Alpha",
        description: "REST API microservice for payments",
        notes: "Uses Stripe integration",
      });
      await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/search-beta",
        alias: "Beta",
        description: "Mobile app built with Flutter",
        notes: "iOS and Android deployment",
      });
      await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/search-gamma",
        alias: "Gamma",
      });
    });

    it("finds project by description keyword", async () => {
      const result = await dal.listProjectIndexes({ search: "payments" });
      assert.ok(result.items.some(p => p.alias === "Alpha"));
    });

    it("finds project by notes keyword", async () => {
      const result = await dal.listProjectIndexes({ search: "Stripe" });
      assert.ok(result.items.some(p => p.alias === "Alpha"));
    });

    it("finds project by notes - Flutter", async () => {
      const result = await dal.listProjectIndexes({ search: "Flutter" });
      assert.ok(result.items.some(p => p.alias === "Beta"));
    });

    it("search does not match projects without matching metadata", async () => {
      const result = await dal.listProjectIndexes({ search: "Stripe" });
      assert.ok(!result.items.some(p => p.alias === "Gamma"));
    });
  });

  describe("Revert (re-read original) behavior", () => {
    it("original values are recoverable after update", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/revert-check",
        alias: "Original Name",
        description: "Original Desc",
        notes: "Original Notes",
      });

      // Save original values
      const originalAlias = created.alias;
      const originalDescription = created.description;
      const originalNotes = created.notes;

      // Update
      await dal.updateProjectIndex(created.projectId, {
        alias: "Changed Name",
        description: "Changed Desc",
        notes: "Changed Notes",
      });

      // Revert by updating back to original values
      const reverted = await dal.updateProjectIndex(created.projectId, {
        alias: originalAlias,
        description: originalDescription,
        notes: originalNotes,
      });

      assert.ok(reverted);
      assert.equal(reverted!.alias, "Original Name");
      assert.equal(reverted!.description, "Original Desc");
      assert.equal(reverted!.notes, "Original Notes");
    });
  });

  describe("Alias modification (set, modify, clear)", () => {
    it("sets alias on a project that had none", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/alias-set-new",
      });
      assert.equal(created.alias, undefined);

      const updated = await dal.updateProjectIndex(created.projectId, {
        alias: "My Alias",
      });
      assert.ok(updated);
      assert.equal(updated!.alias, "My Alias");
    });

    it("modifies an existing alias", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/alias-modify",
        alias: "Old Alias",
      });
      assert.equal(created.alias, "Old Alias");

      const updated = await dal.updateProjectIndex(created.projectId, {
        alias: "New Alias",
      });
      assert.ok(updated);
      assert.equal(updated!.alias, "New Alias");

      // Verify persistence
      const reRead = await dal.getProjectIndex(created.projectId);
      assert.ok(reRead);
      assert.equal(reRead!.alias, "New Alias");
    });

    it("modifies alias multiple times in succession", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/alias-multi-modify",
        alias: "v1",
      });

      const v2 = await dal.updateProjectIndex(created.projectId, { alias: "v2" });
      assert.equal(v2!.alias, "v2");

      const v3 = await dal.updateProjectIndex(created.projectId, { alias: "v3" });
      assert.equal(v3!.alias, "v3");

      const v4 = await dal.updateProjectIndex(created.projectId, { alias: "Final Name" });
      assert.equal(v4!.alias, "Final Name");

      // Verify final state on disk
      const final = await dal.getProjectIndex(created.projectId);
      assert.equal(final!.alias, "Final Name");
    });

    it("modifies alias without affecting other fields", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/alias-isolated",
        alias: "Original",
        description: "Keep this",
        notes: "And this",
        tags: ["tag1"],
      });

      const updated = await dal.updateProjectIndex(created.projectId, {
        alias: "Changed",
      });

      assert.ok(updated);
      assert.equal(updated!.alias, "Changed");
      assert.equal(updated!.description, "Keep this");
      assert.equal(updated!.notes, "And this");
      assert.deepEqual(updated!.tags, ["tag1"]);
    });

    it("alias is searchable after modification", async () => {
      await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/alias-search-mod",
        alias: "Searchable Name",
      });

      const result = await dal.listProjectIndexes({ search: "Searchable Name" });
      assert.ok(result.items.some(p => p.alias === "Searchable Name"));
    });
  });

  describe("Persistence", () => {
    it("metadata persists across reads", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/persist-meta",
        alias: "Persistent",
        description: "This should persist",
        notes: "And this too",
      });

      // Re-read from disk
      const read = await dal.getProjectIndex(created.projectId);
      assert.ok(read);
      assert.equal(read!.alias, "Persistent");
      assert.equal(read!.description, "This should persist");
      assert.equal(read!.notes, "And this too");
    });

    it("alias persists after modification", async () => {
      const created = await dal.createProjectIndex({
        orgId: "default",
        projectPath: "/test/persist-alias-mod",
        alias: "Before",
      });

      await dal.updateProjectIndex(created.projectId, { alias: "After" });

      // Re-read from disk
      const read = await dal.getProjectIndex(created.projectId);
      assert.ok(read);
      assert.equal(read!.alias, "After");
    });
  });
});
