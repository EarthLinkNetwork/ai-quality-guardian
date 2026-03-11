/**
 * Unit tests for project filtering logic
 *
 * Tests AC-3: Dashboard filter count accuracy
 *   - active/archived/favorite/tag filters
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { deriveLifecycleState } from "../../../src/web/dal/project-index-dal";
import { ProjectIndex, ProjectLifecycleState, ProjectUserStatus, ProjectSortField, SortDirection } from "../../../src/web/dal/types";

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
    projectStatus?: ProjectUserStatus;
    lifecycle?: ProjectLifecycleState;
    search?: string;
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

  // Filter by user-managed project status (default: "active")
  if (filter.projectStatus) {
    result = result.filter(p => (p.projectStatus || 'active') === filter.projectStatus);
  }

  // Filter by lifecycle state (computed)
  if (filter.lifecycle) {
    result = result.filter(p => deriveLifecycleState(p) === filter.lifecycle);
  }

  // Filter by search query
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(p => {
      const name = (p.alias || p.projectPath || '').toLowerCase();
      const pathStr = (p.projectPath || '').toLowerCase();
      const tagStr = (p.tags || []).join(' ').toLowerCase();
      return name.includes(q) || pathStr.includes(q) || tagStr.includes(q);
    });
  }

  return result;
}

/**
 * Pure function to sort projects
 */
export function sortProjects(
  projects: ProjectIndex[],
  sortBy: ProjectSortField = 'updatedAt',
  sortDirection: SortDirection = 'desc'
): ProjectIndex[] {
  const result = [...projects];
  result.sort((a, b) => {
    // Favorites always first
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;

    let cmp = 0;
    switch (sortBy) {
      case 'name':
        cmp = (a.alias || a.projectPath).localeCompare(b.alias || b.projectPath);
        break;
      case 'createdAt':
        cmp = a.createdAt.localeCompare(b.createdAt);
        break;
      case 'lastActivityAt':
        cmp = a.lastActivityAt.localeCompare(b.lastActivityAt);
        break;
      case 'updatedAt':
      default:
        cmp = a.updatedAt.localeCompare(b.updatedAt);
        break;
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });
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

describe("filterProjects - projectStatus filter", () => {
  const now = new Date();
  const recentDate = new Date(now);
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
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  });

  const projectsWithStatus: ProjectIndex[] = [
    createProject("active_1", { projectStatus: "active" }),
    createProject("active_2"),  // no projectStatus = defaults to "active"
    createProject("paused_1", { projectStatus: "paused" }),
    createProject("completed_1", { projectStatus: "completed" }),
    createProject("on_hold_1", { projectStatus: "on_hold" }),
  ];

  it("filters to active projects by default (including those without projectStatus)", () => {
    const filtered = filterProjects(projectsWithStatus, { projectStatus: "active" });
    assert.equal(filtered.length, 2);
    assert.ok(filtered.some(p => p.projectId === "active_1"));
    assert.ok(filtered.some(p => p.projectId === "active_2"));
  });

  it("filters to paused projects", () => {
    const filtered = filterProjects(projectsWithStatus, { projectStatus: "paused" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].projectId, "paused_1");
  });

  it("filters to completed projects", () => {
    const filtered = filterProjects(projectsWithStatus, { projectStatus: "completed" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].projectId, "completed_1");
  });

  it("filters to on_hold projects", () => {
    const filtered = filterProjects(projectsWithStatus, { projectStatus: "on_hold" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].projectId, "on_hold_1");
  });

  it("returns all projects when no projectStatus filter", () => {
    const filtered = filterProjects(projectsWithStatus, {});
    assert.equal(filtered.length, 5);
  });
});

describe("filterProjects - search filter", () => {
  const now = new Date();
  const recentDate = new Date(now);
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
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  });

  const searchProjects: ProjectIndex[] = [
    createProject("proj_1", { alias: "My Frontend App", projectPath: "/home/user/frontend", tags: ["react", "web"] }),
    createProject("proj_2", { alias: "Backend API", projectPath: "/home/user/backend", tags: ["node", "api"] }),
    createProject("proj_3", { projectPath: "/home/user/scripts/deploy" }),
  ];

  it("matches by alias", () => {
    const filtered = filterProjects(searchProjects, { search: "frontend" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].projectId, "proj_1");
  });

  it("matches by projectPath", () => {
    const filtered = filterProjects(searchProjects, { search: "deploy" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].projectId, "proj_3");
  });

  it("matches by tag", () => {
    const filtered = filterProjects(searchProjects, { search: "react" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].projectId, "proj_1");
  });

  it("is case insensitive", () => {
    const filtered = filterProjects(searchProjects, { search: "BACKEND" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].projectId, "proj_2");
  });

  it("returns nothing for no match", () => {
    const filtered = filterProjects(searchProjects, { search: "nonexistent" });
    assert.equal(filtered.length, 0);
  });
});

describe("sortProjects", () => {
  const now = new Date();

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
    lastActivityAt: now.toISOString(),
    sessionCount: 0,
    taskStats: { total: 0, completed: 0, failed: 0, running: 0, awaiting: 0 },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  });

  it("sorts by name ascending", () => {
    const projects = [
      createProject("p1", { alias: "Zebra" }),
      createProject("p2", { alias: "Apple" }),
      createProject("p3", { alias: "Mango" }),
    ];
    const sorted = sortProjects(projects, "name", "asc");
    assert.equal(sorted[0].alias, "Apple");
    assert.equal(sorted[1].alias, "Mango");
    assert.equal(sorted[2].alias, "Zebra");
  });

  it("sorts by name descending", () => {
    const projects = [
      createProject("p1", { alias: "Apple" }),
      createProject("p2", { alias: "Zebra" }),
    ];
    const sorted = sortProjects(projects, "name", "desc");
    assert.equal(sorted[0].alias, "Zebra");
    assert.equal(sorted[1].alias, "Apple");
  });

  it("sorts by updatedAt descending (default)", () => {
    const old = new Date(now.getTime() - 100000).toISOString();
    const recent = new Date(now.getTime() + 100000).toISOString();
    const projects = [
      createProject("p1", { updatedAt: old }),
      createProject("p2", { updatedAt: recent }),
    ];
    const sorted = sortProjects(projects);
    assert.equal(sorted[0].projectId, "p2");
    assert.equal(sorted[1].projectId, "p1");
  });

  it("sorts by createdAt descending", () => {
    const old = new Date(now.getTime() - 100000).toISOString();
    const recent = new Date(now.getTime() + 100000).toISOString();
    const projects = [
      createProject("p1", { createdAt: old }),
      createProject("p2", { createdAt: recent }),
    ];
    const sorted = sortProjects(projects, "createdAt", "desc");
    assert.equal(sorted[0].projectId, "p2");
    assert.equal(sorted[1].projectId, "p1");
  });

  it("favorites always come first regardless of sort", () => {
    const projects = [
      createProject("p1", { alias: "Zebra", favorite: false }),
      createProject("p2", { alias: "Apple", favorite: true }),
    ];
    const sorted = sortProjects(projects, "name", "asc");
    assert.equal(sorted[0].projectId, "p2");  // favorite comes first
    assert.equal(sorted[1].projectId, "p1");
  });
});
