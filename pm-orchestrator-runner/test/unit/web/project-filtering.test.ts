/**
 * Unit tests for project filtering logic
 *
 * Tests AC-3: Dashboard filter count accuracy
 *   - active/archived/favorite/tag filters
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { deriveLifecycleState } from "../../../src/web/dal/project-index-dal";
import { ProjectIndex, ProjectLifecycleState } from "../../../src/web/dal/types";

/**
 * Pure function to filter projects based on filter criteria
 * Extracted for testability
 */
export function filterProjects(
  projects: ProjectIndex[],
  filter: {
    includeArchived?: boolean;
    favoriteOnly?: boolean;
    tags?: string[];
    status?: string;
    lifecycle?: ProjectLifecycleState;
  }
): ProjectIndex[] {
  let result = [...projects];

  // Filter archived (default: exclude)
  if (!filter.includeArchived) {
    result = result.filter(p => !p.archived);
  }

  // Filter by favorite
  if (filter.favoriteOnly) {
    result = result.filter(p => p.favorite);
  }

  // Filter by tags (any match)
  if (filter.tags && filter.tags.length > 0) {
    result = result.filter(p =>
      filter.tags!.some(tag => p.tags.includes(tag))
    );
  }

  // Filter by status
  if (filter.status) {
    result = result.filter(p => p.status === filter.status);
  }

  // Filter by lifecycle state (computed)
  if (filter.lifecycle) {
    result = result.filter(p => deriveLifecycleState(p) === filter.lifecycle);
  }

  return result;
}

/**
 * Pure function to count projects by category
 */
export function countProjectsByCategory(projects: ProjectIndex[]): {
  total: number;
  active: number;
  idle: number;
  archived: number;
  favorite: number;
  needsResponse: number;
  error: number;
  running: number;
} {
  const counts = {
    total: projects.length,
    active: 0,
    idle: 0,
    archived: 0,
    favorite: 0,
    needsResponse: 0,
    error: 0,
    running: 0,
  };

  for (const project of projects) {
    const lifecycle = deriveLifecycleState(project);

    if (lifecycle === "ARCHIVED") counts.archived++;
    else if (lifecycle === "IDLE") counts.idle++;
    else counts.active++;

    if (project.favorite) counts.favorite++;
    if (project.status === "needs_response") counts.needsResponse++;
    if (project.status === "error") counts.error++;
    if (project.status === "running") counts.running++;
  }

  return counts;
}

describe("filterProjects - AC-3: Dashboard filters", () => {
  const now = new Date();
  const recentDate = new Date(now);
  recentDate.setDate(recentDate.getDate() - 1);
  const oldDate = new Date(now);
  oldDate.setDate(oldDate.getDate() - 30);

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
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  });

  // Test fixtures
  const testProjects: ProjectIndex[] = [
    createProject("proj_active_1", { favorite: true, tags: ["frontend", "important"] }),
    createProject("proj_active_2", { status: "running", tags: ["backend"] }),
    createProject("proj_active_3", { status: "needs_response" }),
    createProject("proj_idle_1", { lastActivityAt: oldDate.toISOString() }),
    createProject("proj_idle_2", { lastActivityAt: oldDate.toISOString(), favorite: true }),
    createProject("proj_archived_1", { archived: true }),
    createProject("proj_archived_2", { archived: true, favorite: true }),
    createProject("proj_error", { status: "error", tags: ["urgent"] }),
  ];

  describe("Archived filter", () => {
    it("excludes archived projects by default", () => {
      const filtered = filterProjects(testProjects, {});
      assert.ok(filtered.every(p => !p.archived));
      assert.equal(filtered.length, 6);
    });

    it("includes archived when includeArchived=true", () => {
      const filtered = filterProjects(testProjects, { includeArchived: true });
      assert.equal(filtered.length, 8);
      assert.ok(filtered.some(p => p.archived));
    });
  });

  describe("Favorite filter", () => {
    it("filters to favorites only when favoriteOnly=true", () => {
      const filtered = filterProjects(testProjects, { favoriteOnly: true });
      assert.ok(filtered.every(p => p.favorite));
      assert.equal(filtered.length, 2); // proj_active_1, proj_idle_2 (archived excluded)
    });

    it("includes archived favorites when both filters enabled", () => {
      const filtered = filterProjects(testProjects, {
        favoriteOnly: true,
        includeArchived: true
      });
      assert.ok(filtered.every(p => p.favorite));
      assert.equal(filtered.length, 3); // proj_active_1, proj_idle_2, proj_archived_2
    });
  });

  describe("Tag filter", () => {
    it("filters by single tag", () => {
      const filtered = filterProjects(testProjects, { tags: ["frontend"] });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_active_1");
    });

    it("filters by multiple tags (OR logic)", () => {
      const filtered = filterProjects(testProjects, { tags: ["frontend", "backend"] });
      assert.equal(filtered.length, 2);
      assert.ok(filtered.map(p => p.projectId).includes("proj_active_1"));
      assert.ok(filtered.map(p => p.projectId).includes("proj_active_2"));
    });

    it("returns empty when no tags match", () => {
      const filtered = filterProjects(testProjects, { tags: ["nonexistent"] });
      assert.equal(filtered.length, 0);
    });
  });

  describe("Status filter", () => {
    it("filters by running status", () => {
      const filtered = filterProjects(testProjects, { status: "running" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_active_2");
    });

    it("filters by needs_response status", () => {
      const filtered = filterProjects(testProjects, { status: "needs_response" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_active_3");
    });

    it("filters by error status", () => {
      const filtered = filterProjects(testProjects, { status: "error" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_error");
    });
  });

  describe("Lifecycle filter", () => {
    it("filters by ACTIVE lifecycle", () => {
      const filtered = filterProjects(testProjects, { lifecycle: "ACTIVE" });
      assert.ok(filtered.every(p => deriveLifecycleState(p) === "ACTIVE"));
      assert.equal(filtered.length, 4); // proj_active_1, proj_active_2, proj_active_3, proj_error
    });

    it("filters by IDLE lifecycle", () => {
      const filtered = filterProjects(testProjects, { lifecycle: "IDLE" });
      assert.ok(filtered.every(p => deriveLifecycleState(p) === "IDLE"));
      assert.equal(filtered.length, 2); // proj_idle_1, proj_idle_2
    });

    it("filters by ARCHIVED lifecycle (requires includeArchived)", () => {
      // Without includeArchived, no archived projects returned
      const filtered1 = filterProjects(testProjects, { lifecycle: "ARCHIVED" });
      assert.equal(filtered1.length, 0);

      // With includeArchived, archived projects returned
      const filtered2 = filterProjects(testProjects, {
        lifecycle: "ARCHIVED",
        includeArchived: true
      });
      assert.equal(filtered2.length, 2);
    });
  });

  describe("Combined filters", () => {
    it("applies multiple filters together", () => {
      const filtered = filterProjects(testProjects, {
        favoriteOnly: true,
        lifecycle: "ACTIVE",
      });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_active_1");
    });

    it("applies tags + status filters", () => {
      const filtered = filterProjects(testProjects, {
        tags: ["urgent"],
        status: "error",
      });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].projectId, "proj_error");
    });
  });
});

describe("countProjectsByCategory - AC-3: Count accuracy", () => {
  const now = new Date();
  const recentDate = new Date(now);
  recentDate.setDate(recentDate.getDate() - 1);
  const oldDate = new Date(now);
  oldDate.setDate(oldDate.getDate() - 30);

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
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  });

  it("counts all categories correctly", () => {
    const projects: ProjectIndex[] = [
      // 3 active projects
      createProject("active_1", { status: "running" }),
      createProject("active_2", { status: "needs_response", favorite: true }),
      createProject("active_3", { status: "error" }),
      // 2 idle projects
      createProject("idle_1", { lastActivityAt: oldDate.toISOString() }),
      createProject("idle_2", { lastActivityAt: oldDate.toISOString(), favorite: true }),
      // 2 archived projects
      createProject("archived_1", { archived: true }),
      createProject("archived_2", { archived: true, favorite: true }),
    ];

    const counts = countProjectsByCategory(projects);

    assert.equal(counts.total, 7);
    assert.equal(counts.active, 3);
    assert.equal(counts.idle, 2);
    assert.equal(counts.archived, 2);
    assert.equal(counts.favorite, 3); // active_2, idle_2, archived_2
    assert.equal(counts.needsResponse, 1);
    assert.equal(counts.error, 1);
    assert.equal(counts.running, 1);
  });

  it("handles empty projects array", () => {
    const counts = countProjectsByCategory([]);
    assert.equal(counts.total, 0);
    assert.equal(counts.active, 0);
    assert.equal(counts.idle, 0);
    assert.equal(counts.archived, 0);
    assert.equal(counts.favorite, 0);
  });

  it("counts status and lifecycle independently", () => {
    // A project can be ACTIVE (lifecycle) with error (status)
    const projects: ProjectIndex[] = [
      createProject("error_active", { status: "error" }),
    ];
    const counts = countProjectsByCategory(projects);

    assert.equal(counts.active, 1);
    assert.equal(counts.error, 1);
  });
});
