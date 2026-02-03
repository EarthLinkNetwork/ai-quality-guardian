# Authentication & RBAC Specification

## 1. Overview

- **Authentication**: Email/Password with bcrypt hashing
- **Session**: httpOnly cookie with encrypted payload
- **Authorization**: Role-Based Access Control (RBAC)

## 2. Authentication Flow

### 2.1 Login

```
1. User submits email/password
2. Server looks up user by email (GSI1 on Users table)
3. Server verifies password with bcrypt.compare()
4. If valid:
   - Generate session token (UUID)
   - Encrypt session payload (userId, orgId, role, expiry)
   - Set httpOnly cookie
   - Update lastLoginAt in Users table
5. If invalid:
   - Return 401
   - Log failed attempt
```

### 2.2 Session Cookie

**Cookie Settings:**
```javascript
{
  name: "session",
  value: encryptedPayload,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 // 7 days
}
```

**Payload Structure:**
```javascript
{
  userId: "usr_abc123",
  orgId: "org_xyz789",
  role: "admin",
  exp: 1706500000 // Unix timestamp
}
```

**Encryption:**
- Algorithm: AES-256-GCM
- Key: `process.env.AUTH_SECRET` (32 bytes)
- IV: Random 12 bytes per encryption

### 2.3 Session Validation

On each API request:
```javascript
async function validateSession(request) {
  const cookie = request.cookies.get("session");
  if (!cookie) throw new UnauthorizedError();

  const payload = decrypt(cookie.value);
  if (payload.exp < Date.now() / 1000) {
    throw new UnauthorizedError("Session expired");
  }

  // Optionally verify user still exists/active
  const user = await getUser(payload.userId);
  if (!user || user.status !== "active") {
    throw new UnauthorizedError("User inactive");
  }

  return payload;
}
```

### 2.4 Logout

```javascript
async function logout(request) {
  // Clear cookie
  return new Response(null, {
    headers: {
      "Set-Cookie": "session=; Path=/; Max-Age=0"
    }
  });
}
```

## 3. Password Handling

### 3.1 Hashing

```javascript
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### 3.2 Password Requirements

| Rule | Value |
|------|-------|
| Minimum length | 8 characters |
| Maximum length | 128 characters |
| Required chars | At least 1 letter, 1 number |

## 4. Role-Based Access Control

### 4.1 Roles

| Role | Description |
|------|-------------|
| `owner` | Organization owner, full access |
| `admin` | Administrator, can manage users |
| `member` | Regular member, can use features |
| `viewer` | Read-only access |

### 4.2 Permission Matrix

| Resource | Action | owner | admin | member | viewer |
|----------|--------|-------|-------|--------|--------|
| Projects | List | ✓ | ✓ | ✓ | ✓ |
| Projects | Create | ✓ | ✓ | ✓ | ✗ |
| Projects | Update | ✓ | ✓ | ✓ | ✗ |
| Projects | Delete | ✓ | ✓ | ✗ | ✗ |
| Tasks | List | ✓ | ✓ | ✓ | ✓ |
| Tasks | Create | ✓ | ✓ | ✓ | ✗ |
| Tasks | Respond | ✓ | ✓ | ✓ | ✗ |
| Tasks | Cancel | ✓ | ✓ | ✓ | ✗ |
| Tasks | Retry | ✓ | ✓ | ✓ | ✗ |
| Agents | List | ✓ | ✓ | ✓ | ✓ |
| Settings | View | ✓ | ✓ | ✓ | ✓ |
| Settings | Update | ✓ | ✓ | ✗ | ✗ |
| API Keys | View | ✓ | ✓ | ✗ | ✗ |
| API Keys | Update | ✓ | ✓ | ✗ | ✗ |
| Users | List | ✓ | ✓ | ✗ | ✗ |
| Users | Create | ✓ | ✓ | ✗ | ✗ |
| Users | Update | ✓ | ✓ | ✗ | ✗ |
| Users | Delete | ✓ | ✗ | ✗ | ✗ |
| Org | Update | ✓ | ✗ | ✗ | ✗ |

### 4.3 Permission Check Implementation

```typescript
type Action = "list" | "create" | "update" | "delete" | "respond" | "cancel" | "retry";
type Resource = "projects" | "tasks" | "agents" | "settings" | "apiKeys" | "users" | "org";

const PERMISSIONS: Record<string, Record<Resource, Action[]>> = {
  owner: {
    projects: ["list", "create", "update", "delete"],
    tasks: ["list", "create", "respond", "cancel", "retry"],
    agents: ["list"],
    settings: ["list", "update"],
    apiKeys: ["list", "update"],
    users: ["list", "create", "update", "delete"],
    org: ["update"]
  },
  admin: {
    projects: ["list", "create", "update", "delete"],
    tasks: ["list", "create", "respond", "cancel", "retry"],
    agents: ["list"],
    settings: ["list", "update"],
    apiKeys: ["list", "update"],
    users: ["list", "create", "update"],
    org: []
  },
  member: {
    projects: ["list", "create", "update"],
    tasks: ["list", "create", "respond", "cancel", "retry"],
    agents: ["list"],
    settings: ["list"],
    apiKeys: [],
    users: [],
    org: []
  },
  viewer: {
    projects: ["list"],
    tasks: ["list"],
    agents: ["list"],
    settings: ["list"],
    apiKeys: [],
    users: [],
    org: []
  }
};

function hasPermission(role: string, resource: Resource, action: Action): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;
  return resourcePerms.includes(action);
}
```

### 4.4 API Middleware

```typescript
function requirePermission(resource: Resource, action: Action) {
  return async (request: Request) => {
    const session = await validateSession(request);

    if (!hasPermission(session.role, resource, action)) {
      throw new ForbiddenError(`Permission denied: ${action} on ${resource}`);
    }

    return session;
  };
}

// Usage in route handler
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requirePermission("tasks", "create")(request);
  // ... handle request
}
```

## 5. Organization Isolation

All data access is scoped by `orgId`:

```javascript
// All queries include orgId filter
async function getTasks(orgId: string) {
  return ddb.query({
    TableName: "Tasks",
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `ORG#${orgId}`
    }
  });
}

// Middleware adds orgId to all requests
async function withOrgId(request: Request, handler: Function) {
  const session = await validateSession(request);
  return handler(request, { orgId: session.orgId, userId: session.userId });
}
```

## 6. Security Best Practices

### 6.1 Implemented

- [x] Password hashing with bcrypt
- [x] httpOnly cookies
- [x] Secure flag in production
- [x] Session expiry
- [x] RBAC enforcement
- [x] Organization isolation

### 6.2 Future Enhancements

- [ ] Rate limiting on login
- [ ] Account lockout after failures
- [ ] 2FA support
- [ ] Audit logging
- [ ] Session revocation
- [ ] Password reset flow
- [ ] OAuth providers

## 7. Development Mode

In development (`NODE_ENV=development`):

- Default test user is seeded:
  ```json
  {
    "email": "dev@example.com",
    "password": "password123",
    "role": "owner",
    "orgId": "org_dev"
  }
  ```
- AUTH_SECRET defaults to a fixed dev key
- Cookie secure flag is false

**Warning:** Never use development defaults in production.
