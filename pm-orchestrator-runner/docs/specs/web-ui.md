# Web UI Specification

## 1. Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **State**: React hooks + polling
- **Auth**: Cookie-based session

## 2. Pages

### 2.1 Login Page (`/login`)

| Element | Description |
|---------|-------------|
| Email input | Required, validated |
| Password input | Required, min 8 chars |
| Submit button | "Sign In" |
| Error display | Invalid credentials message |

**Flow:**
1. POST `/api/auth/login` with email/password
2. Success → Set httpOnly cookie, redirect to `/`
3. Failure → Show error message

### 2.2 Dashboard (`/`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Header: Logo | Org Name | User Menu (logout)            │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│ │ Agents      │ │ Projects    │ │ Active Tasks│        │
│ │ Online: 3   │ │ Total: 5    │ │ Running: 2  │        │
│ │ Stale: 1    │ │             │ │ Queued: 5   │        │
│ └─────────────┘ └─────────────┘ └─────────────┘        │
├─────────────────────────────────────────────────────────┤
│ Notifications (最新5件)                                  │
│ [!] Task "Add auth" awaiting response (2m ago)          │
│ [x] Task "Fix bug" failed (5m ago)                      │
│ [✓] Task "Refactor" completed (10m ago)                 │
└─────────────────────────────────────────────────────────┘
```

**Polling:** 2 seconds

### 2.3 Projects Page (`/projects`)

**List View:**
| Column | Description |
|--------|-------------|
| Name | Project name (link to detail) |
| Path Hint | Local path hint |
| Tasks | Active task count |
| Updated | Last updated time |
| Actions | Edit, Delete |

**Create Project Modal:**
- Name (required)
- Local Path Hint (optional)
- Default Model (select)

### 2.4 Project Detail (`/projects/[id]`)

**Sections:**
1. **Project Info**: Name, path, model, created/updated
2. **New Task Form**: Prompt textarea + Submit
3. **Task List**: Filtered by this project

### 2.5 Agents Page (`/agents`)

**List View:**
| Column | Description |
|--------|-------------|
| Status | 🟢 online / 🟡 stale / ⚫ offline |
| Host | Hostname |
| CWD | Current working directory |
| Current Task | Task ID if running |
| Last Heartbeat | Relative time |
| Version | Agent version |

**Note:** Agents are read-only from Web (no spawn/kill)

### 2.6 Tasks Page (`/tasks`)

**Filters:**
- State: All / Queued / Running / Awaiting / Complete / Error
- Project: All / Specific project

**List View:**
| Column | Description |
|--------|-------------|
| ID | Task ID (link to detail) |
| Title | Auto-generated title |
| State | Color-coded badge |
| Project | Project name |
| Agent | Agent host if assigned |
| Created | Relative time |

### 2.7 Task Detail (`/tasks/[id]`)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ Task: task_abc123                    State: RUNNING     │
│ Project: my-project | Agent: macbook-pro               │
├─────────────────────────────────────────────────────────┤
│ Prompt:                                                 │
│ "Add user authentication with JWT tokens"               │
├─────────────────────────────────────────────────────────┤
│ Logs (auto-scroll, polling 1s):                         │
│ [10:00:01] Analyzing requirements...                    │
│ [10:00:05] Creating auth module...                      │
│ [10:00:10] Writing tests...                             │
│ ...                                                     │
├─────────────────────────────────────────────────────────┤
│ [AWAITING_RESPONSE の場合]                              │
│ Question: "Which auth method? JWT or Session?"          │
│ [Response textarea] [Send]                              │
├─────────────────────────────────────────────────────────┤
│ Actions: [Cancel] [Retry (if ERROR)]                    │
└─────────────────────────────────────────────────────────┘
```

### 2.8 Settings Page (`/settings`)

**Tabs:**
1. **General**: Default model, UI preferences
2. **API Keys**: OpenAI, Anthropic key management
3. **Notifications**: Email/Slack preferences (future)

**API Key Management:**
- Masked display (last 4 chars visible)
- Add/Update/Delete operations
- Validation on save

### 2.9 Notifications Page (`/notifications`)

**List View:**
| Column | Description |
|--------|-------------|
| Type | Icon for type |
| Title | Notification title |
| Message | Detail message |
| Related | Link to task/project |
| Time | Relative time |
| Status | Read/Unread |

**Actions:**
- Mark as read
- Mark all as read
- Delete

## 3. Components

### 3.1 Common Components

| Component | Description |
|-----------|-------------|
| `<Header>` | Navigation, user menu |
| `<Sidebar>` | Navigation links |
| `<Card>` | Stats display |
| `<Badge>` | Status badges |
| `<Modal>` | Create/Edit dialogs |
| `<Table>` | Data tables with sorting |
| `<Pagination>` | Page navigation |
| `<Toast>` | Notifications |

### 3.2 Task-Specific Components

| Component | Description |
|-----------|-------------|
| `<TaskStateIndicator>` | Color-coded state badge |
| `<LogViewer>` | Auto-scrolling log display |
| `<ResponseForm>` | Clarification response input |
| `<PromptInput>` | Task prompt textarea |

## 4. API Integration

### 4.1 Polling Strategy

| Resource | Interval | Endpoint |
|----------|----------|----------|
| Dashboard stats | 2s | `/api/dashboard` |
| Agent list | 5s | `/api/agents` |
| Task list | 2s | `/api/tasks` |
| Task detail logs | 1s | `/api/tasks/[id]/logs` |
| Notifications | 5s | `/api/notifications` |

### 4.2 Error Handling

- Network error → Toast + retry
- 401 Unauthorized → Redirect to login
- 403 Forbidden → Toast "Permission denied"
- 404 Not Found → Redirect to 404 page
- 500 Server Error → Toast + log

## 5. Responsive Design

| Breakpoint | Layout |
|------------|--------|
| Mobile (<768px) | Single column, collapsible sidebar |
| Tablet (768-1024px) | Two columns |
| Desktop (>1024px) | Full layout |

## 6. Accessibility

- ARIA labels on interactive elements
- Keyboard navigation support
- Color contrast compliance (WCAG 2.1 AA)
- Screen reader compatible tables

## 7. Performance

- Code splitting per page
- Image optimization (next/image)
- Incremental Static Regeneration where applicable
- Client-side caching of static data
