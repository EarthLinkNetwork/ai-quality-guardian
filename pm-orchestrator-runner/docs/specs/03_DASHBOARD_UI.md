# 03_DASHBOARD_UI.md - Dashboard and Tree UI Specification

## 1. Overview

The Dashboard is the primary interface for monitoring and managing projects,
sessions, and tasks. It provides a hierarchical tree view for navigation
and real-time status indicators.

## 2. Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PM Orchestrator Runner                          [Notifications] [User] │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────────────────────────────────────┐ │
│ │ NAVIGATION      │ │ MAIN CONTENT                                    │ │
│ │                 │ │                                                 │ │
│ │ [+] New Task    │ │ ┌───────────────────────────────────────────┐   │ │
│ │                 │ │ │ Project: my-app              [running] ●  │   │ │
│ │ Projects        │ │ │ Last activity: 2 min ago                  │   │ │
│ │ ├─ my-app    ●  │ │ └───────────────────────────────────────────┘   │ │
│ │ │  ├─ Jan 29    │ │                                                 │ │
│ │ │  │  ├─ Auth   │ │ ┌─────────────────┬─────────────────────────┐   │ │
│ │ │  │  └─ Tests  │ │ │ Session Tree    │ Task Detail / Logs      │   │ │
│ │ │  └─ Jan 28    │ │ │                 │                         │   │ │
│ │ ├─ backend   ○  │ │ │ ▼ Jan 29 (3)    │ Task: "Add user auth"   │   │ │
│ │ └─ infra     !  │ │ │   └─ Auth ●     │ Status: RUNNING         │   │ │
│ │                 │ │ │   └─ Tests ○    │ Agent: agent_abc123     │   │ │
│ │ Agents (3)      │ │ │ ▶ Jan 28 (5)    │                         │   │ │
│ │ ├─ agent1    ● │ │ │                 │ [Logs Tab] [Events Tab] │   │ │
│ │ └─ agent2    ● │ │ │                 │ > npm test              │   │ │
│ │                 │ │ │                 │ > PASS: auth.test.ts    │   │ │
│ │ [Settings]      │ │ │                 │ > PASS: user.test.ts    │   │ │
│ └─────────────────┘ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

Legend:
●  Running (green pulse)
○  Idle (gray)
!  Error (red)
⏳ Waiting (yellow pulse)
```

## 3. Status Indicators

### 3.1 Color Coding

| Status | Color | Animation | Icon |
|--------|-------|-----------|------|
| `running` | Green | Pulse | ● |
| `waiting` | Yellow | Pulse | ⏳ |
| `error` | Red | None | ! |
| `idle` | Gray | None | ○ |
| `complete` | Green | None | ✓ |
| `offline` | Gray | None | ◌ |

### 3.2 Status Badge Component

```tsx
interface StatusBadgeProps {
  status: 'running' | 'waiting' | 'error' | 'idle' | 'complete' | 'offline';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function StatusBadge({ status, size = 'md', showLabel = false }: StatusBadgeProps) {
  const config = {
    running: { color: 'bg-green-500', pulse: true, label: 'Running' },
    waiting: { color: 'bg-yellow-500', pulse: true, label: 'Waiting' },
    error: { color: 'bg-red-500', pulse: false, label: 'Error' },
    idle: { color: 'bg-gray-400', pulse: false, label: 'Idle' },
    complete: { color: 'bg-green-500', pulse: false, label: 'Complete' },
    offline: { color: 'bg-gray-300', pulse: false, label: 'Offline' }
  };
  
  const { color, pulse, label } = config[status];
  
  return (
    <span className={`inline-flex items-center gap-1`}>
      <span className={`
        ${size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'}
        ${color} rounded-full
        ${pulse ? 'animate-pulse' : ''}
      `} />
      {showLabel && <span className="text-sm text-gray-600">{label}</span>}
    </span>
  );
}
```

## 4. Navigation Tree

### 4.1 Tree Structure

```tsx
interface TreeNode {
  id: string;
  type: 'project' | 'session' | 'thread' | 'task';
  label: string;
  status: Status;
  children?: TreeNode[];
  expanded?: boolean;
  count?: number;  // For sessions: thread count
}
```

### 4.2 Tree Component

```tsx
function NavigationTree({ nodes, onSelect, selectedId }: TreeProps) {
  return (
    <ul className="space-y-1">
      {nodes.map(node => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          onSelect={onSelect}
          isSelected={selectedId === node.id}
        />
      ))}
    </ul>
  );
}

function TreeNode({ node, depth, onSelect, isSelected }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(node.expanded ?? true);
  
  return (
    <li>
      <div
        className={`
          flex items-center gap-2 px-2 py-1 rounded cursor-pointer
          ${isSelected ? 'bg-blue-100' : 'hover:bg-gray-100'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id, node.type)}
      >
        {node.children && (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? '▼' : '▶'}
          </button>
        )}
        <StatusBadge status={node.status} size="sm" />
        <span className="truncate">{node.label}</span>
        {node.count !== undefined && (
          <span className="text-xs text-gray-500">({node.count})</span>
        )}
      </div>
      {expanded && node.children && (
        <ul>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              isSelected={selectedId === child.id}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
```

## 5. Main Content Panels

### 5.1 Project Overview Panel

```tsx
function ProjectOverview({ project }: { project: Project }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{project.name}</h2>
        <StatusBadge status={project.status} showLabel />
      </div>
      <p className="text-gray-500 text-sm">
        Last activity: {formatRelativeTime(project.lastActivityAt)}
      </p>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => openNewTask(project.projectId)}>
          + New Task
        </Button>
        <Button variant="secondary" onClick={() => archiveProject(project.projectId)}>
          Archive
        </Button>
      </div>
    </div>
  );
}
```

### 5.2 Session Tree Panel

```tsx
function SessionTree({ sessions, selectedThreadId, onSelectThread }: SessionTreeProps) {
  return (
    <div className="h-full overflow-y-auto">
      {sessions.map(session => (
        <SessionNode
          key={session.sessionId}
          session={session}
          selectedThreadId={selectedThreadId}
          onSelectThread={onSelectThread}
        />
      ))}
    </div>
  );
}
```

### 5.3 Task Detail Panel

```tsx
function TaskDetail({ task }: { task: Task }) {
  const [activeTab, setActiveTab] = useState<'logs' | 'events'>('logs');
  
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold">{task.title}</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <StatusBadge status={taskStatusToStatus(task.state)} />
          <span>{task.state}</span>
          {task.agentId && <span>Agent: {task.agentId}</span>}
        </div>
      </div>
      
      {task.state === 'AWAITING_RESPONSE' && (
        <ClarificationBanner
          question={task.clarificationQuestion}
          taskId={task.taskId}
        />
      )}
      
      <div className="border-b">
        <TabList>
          <Tab active={activeTab === 'logs'} onClick={() => setActiveTab('logs')}>
            Logs
          </Tab>
          <Tab active={activeTab === 'events'} onClick={() => setActiveTab('events')}>
            Events
          </Tab>
        </TabList>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'logs' ? (
          <LogViewer taskId={task.taskId} />
        ) : (
          <EventTimeline taskId={task.taskId} />
        )}
      </div>
    </div>
  );
}
```

## 6. Log Viewer

### 6.1 Log Entry Component

```tsx
interface LogEntry {
  timestamp: string;
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  level: 'debug' | 'info' | 'warn' | 'error';
}

function LogViewer({ taskId }: { taskId: string }) {
  const { logs, isLoading } = useLogs(taskId);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Auto-scroll to bottom on new logs
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);
  
  return (
    <div className="font-mono text-sm bg-gray-900 text-gray-100 p-4">
      {logs.map((log, i) => (
        <LogLine key={i} log={log} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function LogLine({ log }: { log: LogEntry }) {
  const colors = {
    stdout: 'text-gray-100',
    stderr: 'text-red-400',
    system: 'text-blue-400'
  };
  
  return (
    <div className={`${colors[log.stream]} whitespace-pre-wrap`}>
      <span className="text-gray-500">{formatTime(log.timestamp)}</span>
      {' '}{log.line}
    </div>
  );
}
```

## 7. Real-time Updates

### 7.1 Polling Strategy

```typescript
// Poll intervals (Phase 1)
const POLL_INTERVALS = {
  dashboard: 2000,      // 2s - Project/Agent status
  taskDetail: 1000,     // 1s - Logs when viewing task
  notifications: 5000   // 5s - Notification badge
};

function usePollData(endpoint: string, interval: number) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      const response = await fetch(endpoint);
      setData(await response.json());
      setIsLoading(false);
    };
    
    fetchData();
    const timer = setInterval(fetchData, interval);
    return () => clearInterval(timer);
  }, [endpoint, interval]);
  
  return { data, isLoading };
}
```

## 8. Responsive Design

### 8.1 Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 640px (sm) | Stack: Nav collapsed, single column |
| 640-1024px (md) | Two columns: Nav + Content |
| > 1024px (lg) | Three columns: Nav + Session Tree + Detail |

### 8.2 Mobile Navigation

```tsx
function MobileNav({ isOpen, onClose }: MobileNavProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="left">
        <NavigationTree {...} />
      </SheetContent>
    </Sheet>
  );
}
```

## 9. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `n` | New task |
| `j` / `k` | Navigate tree down/up |
| `Enter` | Select item |
| `Esc` | Close panel/modal |
| `?` | Show shortcuts help |

## 10. Acceptance Criteria

- **AC-DASH-1**: Dashboard shows project list with derived status
- **AC-DASH-2**: Status indicators use correct colors and animations
- **AC-DASH-3**: Navigation tree is collapsible/expandable
- **AC-DASH-4**: Session/Thread hierarchy is visible in tree view
- **AC-DASH-5**: Task detail shows logs with auto-scroll
- **AC-DASH-6**: Clarification banner shows for AWAITING_RESPONSE tasks
- **AC-DASH-7**: Real-time updates via polling (2s dashboard, 1s logs)
- **AC-DASH-8**: Responsive layout works on mobile
- **AC-DASH-9**: Keyboard navigation is functional
