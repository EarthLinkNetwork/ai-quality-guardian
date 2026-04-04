# UI Component Map

Reference for shared rendering functions and their consumers in `src/web/public/index.html`.

## Shared Rendering Functions

| Function | Purpose | Used By |
|---|---|---|
| `renderProjectCard(p, opts)` | Single project card (favorite, status badges, description, notes, cost, task status summary) | `renderProjectList`, `renderDashboard` |
| `renderTaskGroupItem(g)` | Single task group row | `renderTaskGroupListUI` (via grouped rendering) |
| `renderTaskGroupPanel(id, groups, opts)` | Task group list with search, date filter, status tabs | `renderTaskGroupListUI`, `renderProjectDetail` |
| `buildListControls(opts)` | Pagination + search + filter bar (status tabs, sort, favorites) | `renderProjectList`, `renderDashboard` |
| `getProjectStatusBadge(ps)` | Project status badge HTML (active/paused/completed/on_hold) | `renderProjectCard` |
| `renderTraceEntry(entry)` | Single trace/log entry | Task detail trace view |
| `renderTemplateCard(template, isBuiltIn)` | Template card in settings | `renderTemplatesSettings` |
| `renderResumeInfo(info)` | Self-host resume info | `renderProjectDetail` |
| `renderSessionTreeNodes(nodes, level)` | Session tree hierarchy | Sidebar context |

## Page-Level Renderers

| Page | URL Pattern | Renderer | Shared Components Used |
|---|---|---|---|
| Dashboard | `/dashboard` | `renderDashboard` | `renderProjectCard`, `buildListControls`, `renderLiveProjects` |
| Projects | `/projects` | `renderProjectList` | `renderProjectCard`, `buildListControls` |
| Task Groups | `/task-groups` | `renderTaskGroupList` | `renderTaskGroupPanel`, `renderTaskGroupItem`, `buildListControls` |
| Project Detail | `/projects/:id` | `renderProjectDetail` | `renderTaskGroupPanel` |
| Task Detail | `/tasks/:id` | `renderTaskDetail` | `renderTraceEntry` |
| Chat | `/chat/:id` | `renderChat` | `renderAttachments` |
| Activity | `/activity` | `renderActivity` | - |
| Settings | `/settings` | `renderSettingsPage` | `renderTemplateCard` |
| Commands | `/commands` | `renderCommandsPage` | - |
| Agents | `/agents` | `renderAgentsPage` | - |
| Hooks | `/hooks` | `renderHooksPage` | - |
| MCP Servers | `/mcp-servers` | `renderMcpServersPage` | - |
| Logs | `/logs` | `renderLogsPage` | - |
| Agent Launcher | `/agent-launcher` | `renderAgentLauncher` | - |
| Plugins | `/plugins` | `renderPluginsPage` | - |
| PR Reviews | `/pr-reviews` | `renderPRReviewsPage` | - |
| Task Tracker | `/task-tracker` | `renderTaskTrackerPage` | - |

## Data Sources

| API Endpoint | Returns | Used By |
|---|---|---|
| `GET /api/dashboard` | Projects (basic), activity, stats | Dashboard (stats + activity) |
| `GET /api/projects` | Projects (with costInfo enrichment) | Dashboard (project cards), Projects page |
| `GET /api/projects/:id` | Project detail + task groups + tasks + cost | Project Detail page |
| `GET /api/task-groups` | All task groups with status_counts | Dashboard, Task Groups page, Project Detail |
| `GET /api/required-actions` | Awaiting/error tasks needing attention | Dashboard, Project Detail |
| `GET /api/activity` | Activity events (with link resolution) | Activity page |
| `GET /api/tasks/:id` | Task detail | Task Detail page |
| `GET /api/tasks/:id/trace` | Task execution trace | Task Detail (trace tab) |

## When modifying a list component

1. Check this map for all pages that use the component
2. Test ALL pages that render the component
3. Update this document if new usage is added
4. Shared functions should be placed before their first consumer in the file

## Architecture Notes

- `renderProjectCard` was extracted to ensure Dashboard and Projects page render identical project cards
- Both pages fetch from `/api/projects` (with costInfo) and `/api/task-groups` (for status counts)
- Dashboard additionally fetches `/api/dashboard` for stats and recent activity
- Filter state is maintained in separate variable sets per page (`projectListFilters` for Projects, `dashProject*` for Dashboard) to allow independent filter states
