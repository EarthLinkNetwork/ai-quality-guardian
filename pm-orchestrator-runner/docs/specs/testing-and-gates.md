# Testing and Gates Specification

## 1. Overview

Quality gates ensure the system meets acceptance criteria before release.

## 2. Test Categories

### 2.1 Unit Tests

**Scope:** Individual functions and modules

**Location:** `test/unit/`

**Framework:** Vitest

**Coverage Target:** 80%

**Examples:**
```typescript
// test/unit/web/api/tasks.test.ts
describe("createTask", () => {
  it("should create task with valid input", async () => {
    const result = await createTask({
      orgId: "org_test",
      projectId: "proj_test",
      prompt: "Test prompt",
      priority: 50
    });

    expect(result.taskId).toMatch(/^task_/);
    expect(result.state).toBe("QUEUED");
  });

  it("should reject invalid priority", async () => {
    await expect(createTask({
      orgId: "org_test",
      projectId: "proj_test",
      prompt: "Test",
      priority: 150 // Invalid
    })).rejects.toThrow("Invalid priority");
  });
});
```

### 2.2 Integration Tests

**Scope:** Component interactions, DynamoDB operations

**Location:** `test/integration/`

**Framework:** Vitest + DynamoDB Local

**Examples:**
```typescript
// test/integration/task-lifecycle.test.ts
describe("Task Lifecycle", () => {
  beforeAll(async () => {
    await setupDynamoDBLocal();
    await seedTestData();
  });

  it("should complete full task lifecycle", async () => {
    // Create task
    const task = await createTask({ ... });
    expect(task.state).toBe("QUEUED");

    // Simulate agent lease
    await leaseTask(task.taskId, "agent_test");
    const updated = await getTask(task.taskId);
    expect(updated.state).toBe("RUNNING");

    // Complete task
    await completeTask(task.taskId, "agent_test", "Done");
    const final = await getTask(task.taskId);
    expect(final.state).toBe("COMPLETE");
  });
});
```

### 2.3 E2E Tests

**Scope:** Full system from Web UI to Agent

**Location:** `test/e2e/`

**Framework:** Playwright

**Examples:**
```typescript
// test/e2e/task-creation.test.ts
test("create and execute task via Web UI", async ({ page }) => {
  // Login
  await page.goto("/login");
  await page.fill('[name="email"]', "dev@example.com");
  await page.fill('[name="password"]', "password123");
  await page.click('button[type="submit"]');

  // Navigate to project
  await page.click('text=My Project');

  // Create task
  await page.fill('[name="prompt"]', "Add hello world endpoint");
  await page.click('button:has-text("Create Task")');

  // Verify task created
  await expect(page.locator(".task-state")).toContainText("QUEUED");

  // Wait for agent to pick up (with mock agent)
  await expect(page.locator(".task-state")).toContainText("RUNNING", {
    timeout: 10000
  });

  // Wait for completion
  await expect(page.locator(".task-state")).toContainText("COMPLETE", {
    timeout: 60000
  });
});
```

### 2.4 API Tests

**Scope:** HTTP API endpoints

**Location:** `test/api/`

**Framework:** Vitest + supertest

**Examples:**
```typescript
// test/api/tasks.test.ts
describe("POST /api/tasks", () => {
  it("should create task", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set("Cookie", sessionCookie)
      .send({
        projectId: "proj_test",
        prompt: "Test prompt"
      });

    expect(response.status).toBe(201);
    expect(response.body.taskId).toBeDefined();
  });

  it("should require authentication", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .send({ projectId: "proj_test", prompt: "Test" });

    expect(response.status).toBe(401);
  });
});
```

## 3. Test Infrastructure

### 3.1 DynamoDB Local

```yaml
# docker-compose.test.yml
version: "3.8"
services:
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    ports:
      - "8000:8000"
    command: ["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"]
```

**Setup script:**
```javascript
// test/setup/dynamodb.ts
export async function setupDynamoDBLocal() {
  const ddb = new DynamoDBClient({
    endpoint: "http://localhost:8000",
    region: "local"
  });

  // Create tables
  for (const table of TABLE_DEFINITIONS) {
    await createTable(ddb, table);
  }
}
```

### 3.2 Mock Agent

```javascript
// test/helpers/mock-agent.ts
export class MockAgent {
  private taskId: string | null = null;

  async pollAndExecute(mockResult: string) {
    // Poll for task
    const task = await pollQueue();
    if (!task) return null;

    this.taskId = task.taskId;

    // Lease task
    await leaseTask(task.taskId, this.agentId);

    // Simulate execution
    await this.writeLogs([
      "Starting execution...",
      "Processing...",
      "Done."
    ]);

    // Complete
    await completeTask(task.taskId, this.agentId, mockResult);

    return task.taskId;
  }
}
```

### 3.3 Test Data Seeding

```javascript
// test/helpers/seed.ts
export async function seedTestData() {
  // Create org
  await createOrg({
    orgId: "org_test",
    name: "Test Org",
    plan: "pro"
  });

  // Create user
  await createUser({
    userId: "usr_test",
    email: "dev@example.com",
    passwordHash: await hashPassword("password123"),
    role: "admin",
    orgId: "org_test"
  });

  // Create project
  await createProject({
    projectId: "proj_test",
    orgId: "org_test",
    name: "Test Project"
  });
}
```

## 4. Quality Gates

### 4.1 Gate A: Lint

```bash
npm run lint
# Must pass with 0 errors
```

### 4.2 Gate B: Type Check

```bash
npm run typecheck
# Must pass with 0 errors
```

### 4.3 Gate C: Unit Tests

```bash
npm run test:unit
# Must pass with 0 failures
# Coverage >= 80%
```

### 4.4 Gate D: Integration Tests

```bash
npm run test:integration
# Must pass with 0 failures
```

### 4.5 Gate E: E2E Tests

```bash
npm run test:e2e
# Must pass with 0 failures
```

### 4.6 Gate F: Build

```bash
npm run build
# Must complete successfully
```

### 4.7 Gate G: Acceptance Criteria

Manual verification of 7 acceptance criteria:

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | Agent heartbeats visible | Dashboard shows online agents |
| AC2 | Tasks from Web execute on Agent | Create task, verify execution |
| AC3 | Logs stream in near-real-time | View logs while task runs |
| AC4 | AWAITING_RESPONSE handled | Respond to clarification |
| AC5 | ERROR tasks can be retried | Retry failed task |
| AC6 | Settings persist | Change settings, verify |
| AC7 | Multi-user orgId enforced | Cross-org access denied |

## 5. CI/CD Pipeline

### 5.1 GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    services:
      dynamodb:
        image: amazon/dynamodb-local
        ports:
          - 8000:8000
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, unit-tests]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
```

## 6. Evidence Files

Test results are saved to `.tmp/` for verification:

```
.tmp/
├── test-unit-results.json
├── test-integration-results.json
├── test-e2e-results.json
├── coverage/
│   └── lcov.info
├── acceptance-criteria-verification.md
└── gate-all-results.txt
```

### Evidence Format

```markdown
# Acceptance Criteria Verification

Date: 2025-01-29
Tester: Claude Code

## AC1: Agent heartbeats visible in Web Dashboard

**Status:** PASS

**Evidence:**
- Screenshot: .tmp/screenshots/ac1-dashboard-agents.png
- Agent "macbook-pro" shows status "online"
- Last heartbeat: 5 seconds ago

## AC2: Tasks created from Web execute on Agent

**Status:** PASS

**Evidence:**
- Created task via /projects/proj_123
- Task ID: task_abc123
- Initial state: QUEUED
- After 3s: state changed to RUNNING
- Agent assigned: macbook-pro
- Completion time: 45s
- Final state: COMPLETE

...
```

## 7. Running All Gates

```bash
# Run all gates
npm run gate:all

# Output:
# Gate A (lint):        PASS
# Gate B (typecheck):   PASS
# Gate C (unit):        PASS (142 tests, 85% coverage)
# Gate D (integration): PASS (28 tests)
# Gate E (e2e):         PASS (12 tests)
# Gate F (build):       PASS
#
# All gates passed!
```
