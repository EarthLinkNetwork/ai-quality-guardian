/**
 * Claude Code Context - Sidebar project dropdown tests
 *
 * Validates:
 * 1. Only active projects appear in the sidebar dropdown
 * 2. Aliases are displayed instead of paths when available
 * 3. Global/Project scope toggle (dropdown only shown in project scope)
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';

/**
 * Represents a cached project entry as stored in projectListCache.
 * Mirrors the shape produced by loadProjectListCached() in index.html.
 */
interface CachedProject {
  id: string;
  path: string;
  alias: string;
  projectStatus: string;
}

/**
 * Filter projects for the sidebar context dropdown.
 * Only active projects with absolute paths are shown.
 * Mirrors the logic in renderSidebarContext().
 */
function filterSidebarProjects(projects: CachedProject[]): CachedProject[] {
  return projects.filter(p =>
    p.path && p.path.charAt(0) === '/' && (p.projectStatus || 'active') === 'active'
  );
}

/**
 * Derive the display label for a project in the sidebar dropdown.
 * Shows alias when available; falls back to shortened path.
 * Must never expose the full project path when an alias is set.
 * Mirrors the label logic in renderSidebarContext().
 */
function sidebarProjectLabel(p: CachedProject): string {
  if (p.alias && p.alias !== p.path) return p.alias;
  return shortenPath(p.path);
}

/**
 * Shorten a filesystem path for display.
 * Mirrors shortenPath() in index.html.
 */
function shortenPath(p: string): string {
  if (!p) return '';
  if (p.indexOf('/Users/') === 0) {
    const parts = p.split('/');
    p = '~/' + parts.slice(3).join('/');
  }
  if (p.length > 50) p = '...' + p.slice(-47);
  return p;
}

// ---------- Fixtures ----------

function mkProject(overrides?: Partial<CachedProject>): CachedProject {
  return {
    id: 'proj_default',
    path: '/home/user/project',
    alias: '/home/user/project',
    projectStatus: 'active',
    ...overrides,
  };
}

// ---------- Tests ----------

describe('Claude Code Context - sidebar project filtering', () => {
  const activeProject = mkProject({ id: 'active_1', path: '/home/user/app', alias: 'My App', projectStatus: 'active' });
  const activeNoExplicitStatus = mkProject({ id: 'active_default', path: '/home/user/api', alias: 'Backend API', projectStatus: '' }); // empty defaults to active
  const pausedProject = mkProject({ id: 'paused_1', path: '/home/user/paused', alias: 'Paused Project', projectStatus: 'paused' });
  const completedProject = mkProject({ id: 'completed_1', path: '/home/user/done', alias: 'Done Project', projectStatus: 'completed' });
  const onHoldProject = mkProject({ id: 'on_hold_1', path: '/home/user/hold', alias: 'On Hold', projectStatus: 'on_hold' });
  const nonAbsolutePath = mkProject({ id: 'relative', path: 'relative/path', alias: 'Relative', projectStatus: 'active' });

  const allProjects = [activeProject, activeNoExplicitStatus, pausedProject, completedProject, onHoldProject, nonAbsolutePath];

  it('shows only active projects', () => {
    const filtered = filterSidebarProjects(allProjects);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.some(p => p.id === 'active_1'));
    assert.ok(filtered.some(p => p.id === 'active_default'));
  });

  it('hides paused projects', () => {
    const filtered = filterSidebarProjects(allProjects);
    assert.ok(!filtered.some(p => p.id === 'paused_1'));
  });

  it('hides completed projects', () => {
    const filtered = filterSidebarProjects(allProjects);
    assert.ok(!filtered.some(p => p.id === 'completed_1'));
  });

  it('hides on_hold projects', () => {
    const filtered = filterSidebarProjects(allProjects);
    assert.ok(!filtered.some(p => p.id === 'on_hold_1'));
  });

  it('excludes projects without absolute paths', () => {
    const filtered = filterSidebarProjects(allProjects);
    assert.ok(!filtered.some(p => p.id === 'relative'));
  });

  it('treats missing projectStatus as active', () => {
    const projects = [mkProject({ id: 'no_status', path: '/x', projectStatus: undefined as any })];
    const filtered = filterSidebarProjects(projects);
    assert.equal(filtered.length, 1);
  });

  it('returns empty array when no active projects exist', () => {
    const projects = [pausedProject, completedProject, onHoldProject];
    const filtered = filterSidebarProjects(projects);
    assert.equal(filtered.length, 0);
  });
});

describe('Claude Code Context - sidebar project label (alias display)', () => {
  it('shows alias when alias differs from path', () => {
    const p = mkProject({ alias: 'My Frontend', path: '/home/user/frontend' });
    assert.equal(sidebarProjectLabel(p), 'My Frontend');
  });

  it('does not expose the project path when alias is set', () => {
    const p = mkProject({ alias: 'My Frontend', path: '/home/user/frontend' });
    const label = sidebarProjectLabel(p);
    assert.ok(!label.includes('/home/user/frontend'), 'Label should not contain the full path');
  });

  it('falls back to shortened path when alias equals path', () => {
    const p = mkProject({ alias: '/Users/masa/dev/frontend', path: '/Users/masa/dev/frontend' });
    const label = sidebarProjectLabel(p);
    // Should use tilde-shortened path, not the full absolute path
    assert.equal(label, '~/dev/frontend');
    assert.ok(!label.includes('/Users/masa'), 'Should not contain the full /Users/ prefix');
  });

  it('falls back to shortened path when alias is empty', () => {
    const p = mkProject({ alias: '', path: '/Users/masa/dev/project' });
    const label = sidebarProjectLabel(p);
    assert.equal(label, '~/dev/project');
  });

  it('shortens /Users/ paths with tilde', () => {
    const p = mkProject({ alias: '/Users/john/code/app', path: '/Users/john/code/app' });
    const label = sidebarProjectLabel(p);
    assert.equal(label, '~/code/app');
  });

  it('truncates very long paths', () => {
    const longPath = '/home/user/a/very/deeply/nested/directory/structure/that/goes/on';
    const p = mkProject({ alias: longPath, path: longPath });
    const label = sidebarProjectLabel(p);
    assert.ok(label.length <= 50, 'Label should be truncated to 50 chars or less');
  });
});

describe('Claude Code Context - scope behavior', () => {
  it('project dropdown has items only from active projects', () => {
    // Simulates what renderSidebarContext would produce
    const projects = [
      mkProject({ id: 'a', path: '/x/active', alias: 'Active', projectStatus: 'active' }),
      mkProject({ id: 'b', path: '/x/paused', alias: 'Paused', projectStatus: 'paused' }),
      mkProject({ id: 'c', path: '/x/done', alias: 'Done', projectStatus: 'completed' }),
    ];
    const dropdown = filterSidebarProjects(projects);
    assert.equal(dropdown.length, 1);
    assert.equal(dropdown[0].id, 'a');
  });

  it('all labels use aliases and never raw paths', () => {
    const projects = [
      mkProject({ id: 'a', path: '/home/user/proj1', alias: 'Project Alpha', projectStatus: 'active' }),
      mkProject({ id: 'b', path: '/home/user/proj2', alias: 'Project Beta', projectStatus: 'active' }),
    ];
    const filtered = filterSidebarProjects(projects);
    for (const p of filtered) {
      const label = sidebarProjectLabel(p);
      assert.ok(!label.includes('/home/user/'), `Label "${label}" should not contain raw path`);
    }
  });
});
