# 01_PROJECT_MODEL.md - Project Entity Specification

## 1. Overview

The Project entity represents a code repository context within an organization.
Projects contain sessions, tasks, and configuration specific to a codebase.

## 2. Project Entity

### 2.1 Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | S | Y | UUID (format: `proj_<uuid>`) |
| orgId | S | Y | Parent organization ID |
| name | S | Y | Project display name |
| localPathHint | S | N | Suggested local path (e.g., `/Users/dev/myproject`) |
| description | S | N | Project description |
| status | S | Y | Derived status (see 2.2) |
| lifecycle | S | Y | `ACTIVE` / `IDLE` / `ARCHIVED` |
| defaultModel | S | N | Default LLM model for tasks |
| settings | M | N | Project-specific settings override |
| createdAt | S | Y | ISO8601 timestamp |
| updatedAt | S | Y | ISO8601 timestamp |
| archivedAt | S | N | ISO8601 timestamp (when archived) |
| lastActivityAt | S | N | ISO8601 timestamp of last task/session activity |

### 2.2 Derived Status

Status is **computed** from task states, not stored:

```typescript
function deriveProjectStatus(tasks: Task[]): 'running' | 'waiting' | 'idle' | 'error' {
  const activeTasks = tasks.filter(t => !['COMPLETE', 'CANCELLED'].includes(t.state));
  
  if (activeTasks.some(t => t.state === 'RUNNING')) return 'running';
  if (activeTasks.some(t => t.state === 'AWAITING_RESPONSE')) return 'waiting';
  if (activeTasks.some(t => t.state === 'ERROR')) return 'error';
  return 'idle';
}
```

| Status | Condition |
|--------|-----------|
| `running` | At least one task in RUNNING state |
| `waiting` | At least one task in AWAITING_RESPONSE state |
| `error` | At least one task in ERROR state (not running/waiting) |
| `idle` | All tasks are COMPLETE, CANCELLED, or QUEUED |

### 2.3 Lifecycle States

```
┌────────┐    archive()    ┌──────────┐
│ ACTIVE │ ───────────────▶│ ARCHIVED │
└───┬────┘                 └────┬─────┘
    │                           │
    │ idle > 7 days             │ restore()
    ▼                           ▼
┌────────┐                 ┌────────┐
│  IDLE  │ ───────────────▶│ ACTIVE │
└────────┘    activity()   └────────┘
```

| Lifecycle | Description |
|-----------|-------------|
| `ACTIVE` | Project is in active use |
| `IDLE` | No activity for > 7 days (auto-set) |
| `ARCHIVED` | Manually archived, hidden from default views |

## 3. Project Operations

### 3.1 Create Project

```typescript
async function createProject(orgId: string, name: string, options?: {
  localPathHint?: string;
  description?: string;
  defaultModel?: string;
}): Promise<Project> {
  const projectId = `proj_${uuid()}`;
  const now = new Date().toISOString();
  
  const project: Project = {
    PK: `ORG#${orgId}`,
    SK: `PROJ#${projectId}`,
    projectId,
    orgId,
    name,
    localPathHint: options?.localPathHint,
    description: options?.description,
    defaultModel: options?.defaultModel ?? 'claude-sonnet-4-20250514',
    status: 'idle',  // Initial status
    lifecycle: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now
  };
  
  await ddb.putItem({ TableName: 'Projects', Item: project });
  return project;
}
```

### 3.2 Archive Project

```typescript
async function archiveProject(orgId: string, projectId: string): Promise<void> {
  const now = new Date().toISOString();
  
  await ddb.updateItem({
    TableName: 'Projects',
    Key: { PK: `ORG#${orgId}`, SK: `PROJ#${projectId}` },
    UpdateExpression: 'SET lifecycle = :archived, archivedAt = :now, updatedAt = :now',
    ExpressionAttributeValues: {
      ':archived': 'ARCHIVED',
      ':now': now
    }
  });
}
```

### 3.3 Restore Project

```typescript
async function restoreProject(orgId: string, projectId: string): Promise<void> {
  const now = new Date().toISOString();
  
  await ddb.updateItem({
    TableName: 'Projects',
    Key: { PK: `ORG#${orgId}`, SK: `PROJ#${projectId}` },
    UpdateExpression: 'SET lifecycle = :active, archivedAt = :null, updatedAt = :now',
    ConditionExpression: 'lifecycle = :archived',
    ExpressionAttributeValues: {
      ':active': 'ACTIVE',
      ':archived': 'ARCHIVED',
      ':null': null,
      ':now': now
    }
  });
}
```

## 4. Project List Query

### 4.1 Active Projects (Dashboard Default)

```typescript
async function listActiveProjects(orgId: string): Promise<Project[]> {
  const result = await ddb.query({
    TableName: 'Projects',
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    FilterExpression: 'lifecycle <> :archived',
    ExpressionAttributeValues: {
      ':pk': `ORG#${orgId}`,
      ':prefix': 'PROJ#',
      ':archived': 'ARCHIVED'
    }
  });
  
  // Compute derived status for each project
  return Promise.all(result.Items.map(async (proj) => {
    const tasks = await getRecentTasks(proj.projectId);
    return {
      ...proj,
      status: deriveProjectStatus(tasks)
    };
  }));
}
```

### 4.2 All Projects (Including Archived)

```typescript
async function listAllProjects(orgId: string): Promise<Project[]> {
  // Same query without filter
}
```

## 5. DynamoDB Keys

| Access Pattern | PK | SK |
|----------------|----|----|
| Projects by org | `ORG#<orgId>` | `PROJ#<projectId>` |
| Single project | `ORG#<orgId>` | `PROJ#<projectId>` |

**GSI1** (project-lookup):
- PK: `projectId`
- Allows direct project lookup without orgId

## 6. Acceptance Criteria

- **AC-PROJ-1**: Projects can be created with name and optional localPathHint
- **AC-PROJ-2**: Project status is derived from task states (not stored)
- **AC-PROJ-3**: Projects can be archived and restored
- **AC-PROJ-4**: Dashboard shows only ACTIVE/IDLE projects by default
- **AC-PROJ-5**: ARCHIVED projects can be viewed with explicit filter
