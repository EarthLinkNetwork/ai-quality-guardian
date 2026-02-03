# Notifications Specification

## 1. Overview

Notifications alert users to important events requiring attention:
- Tasks awaiting response
- Task errors
- Task completions
- Agent status changes
- Queue issues

## 2. Notification Types

| Type | Trigger | Severity | Description |
|------|---------|----------|-------------|
| `TASK_AWAITING_RESPONSE` | Task enters AWAITING_RESPONSE | warning | User input needed |
| `TASK_ERROR` | Task enters ERROR | error | Task failed |
| `TASK_COMPLETED` | Task enters COMPLETE | info | Task finished successfully |
| `AGENT_OFFLINE` | Agent status → offline | warning | Agent disconnected |
| `QUEUE_STUCK` | Task in QUEUED > 10 min | warning | No agent picking up tasks |

## 3. Notification Structure

```javascript
{
  PK: "ORG#<orgId>",
  SK: "NOTIF#<timestamp>#<notificationId>",
  notificationId: "notif_abc123",
  userId: null, // null = all users in org
  type: "TASK_AWAITING_RESPONSE",
  title: "Task needs response",
  message: "Which authentication method should be used?",
  severity: "warning", // info, warning, error
  taskId: "task_xyz789",
  projectId: "proj_123",
  agentId: null,
  read: false,
  createdAt: "2025-01-29T10:00:00Z",
  ttl: 1707000000 // 7 days from creation
}
```

## 4. Creation Logic

### 4.1 TASK_AWAITING_RESPONSE

```javascript
async function onTaskAwaitingResponse(task) {
  await createNotification({
    orgId: task.orgId,
    type: "TASK_AWAITING_RESPONSE",
    title: "Task needs response",
    message: task.clarificationQuestion,
    severity: "warning",
    taskId: task.taskId,
    projectId: task.projectId
  });
}
```

### 4.2 TASK_ERROR

```javascript
async function onTaskError(task) {
  await createNotification({
    orgId: task.orgId,
    type: "TASK_ERROR",
    title: "Task failed",
    message: task.error.substring(0, 200), // Truncate long errors
    severity: "error",
    taskId: task.taskId,
    projectId: task.projectId
  });
}
```

### 4.3 TASK_COMPLETED

```javascript
async function onTaskComplete(task) {
  // Only create if configured in settings
  const settings = await getSettings(task.orgId);
  if (!settings.notifyOnComplete) return;

  await createNotification({
    orgId: task.orgId,
    type: "TASK_COMPLETED",
    title: "Task completed",
    message: `Task "${task.title}" finished successfully`,
    severity: "info",
    taskId: task.taskId,
    projectId: task.projectId
  });
}
```

### 4.4 AGENT_OFFLINE

```javascript
async function onAgentOffline(agent) {
  await createNotification({
    orgId: agent.orgId,
    type: "AGENT_OFFLINE",
    title: "Agent offline",
    message: `Agent on ${agent.host} is no longer responding`,
    severity: "warning",
    agentId: agent.agentId
  });
}
```

### 4.5 QUEUE_STUCK

Detected by periodic background job:

```javascript
async function checkQueueHealth() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // Find tasks queued for > 10 minutes
  const stuckTasks = await ddb.query({
    TableName: "Tasks",
    IndexName: "state-queue",
    KeyConditionExpression: "#state = :state AND createdAt < :threshold",
    ExpressionAttributeNames: { "#state": "state" },
    ExpressionAttributeValues: {
      ":state": "QUEUED",
      ":threshold": tenMinutesAgo
    }
  });

  for (const task of stuckTasks) {
    // Check if notification already exists
    const existing = await findNotification(task.orgId, "QUEUE_STUCK", task.taskId);
    if (existing) continue;

    await createNotification({
      orgId: task.orgId,
      type: "QUEUE_STUCK",
      title: "Task stuck in queue",
      message: `Task "${task.title}" has been waiting for ${elapsedMinutes} minutes`,
      severity: "warning",
      taskId: task.taskId,
      projectId: task.projectId
    });
  }
}
```

## 5. Reading Notifications

### 5.1 List Notifications

```javascript
async function getNotifications(orgId, { unreadOnly, limit, cursor }) {
  const params = {
    TableName: "Notifications",
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `ORG#${orgId}`
    },
    Limit: limit,
    ScanIndexForward: false // Newest first
  };

  if (unreadOnly) {
    params.FilterExpression = "#read = :false";
    params.ExpressionAttributeNames = { "#read": "read" };
    params.ExpressionAttributeValues[":false"] = false;
  }

  if (cursor) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(cursor, "base64").toString());
  }

  const result = await ddb.query(params);

  return {
    items: result.Items,
    nextCursor: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
      : null
  };
}
```

### 5.2 Get Unread Count

```javascript
async function getUnreadCount(orgId) {
  const result = await ddb.query({
    TableName: "Notifications",
    KeyConditionExpression: "PK = :pk",
    FilterExpression: "#read = :false",
    ExpressionAttributeNames: { "#read": "read" },
    ExpressionAttributeValues: {
      ":pk": `ORG#${orgId}`,
      ":false": false
    },
    Select: "COUNT"
  });

  return result.Count;
}
```

## 6. Marking as Read

### 6.1 Mark Single

```javascript
async function markAsRead(orgId, notificationId) {
  // Need to find the notification first to get SK
  const notifications = await ddb.query({
    TableName: "Notifications",
    KeyConditionExpression: "PK = :pk",
    FilterExpression: "notificationId = :id",
    ExpressionAttributeValues: {
      ":pk": `ORG#${orgId}`,
      ":id": notificationId
    }
  });

  if (notifications.Items.length === 0) {
    throw new NotFoundError("Notification not found");
  }

  const notif = notifications.Items[0];

  await ddb.updateItem({
    TableName: "Notifications",
    Key: { PK: notif.PK, SK: notif.SK },
    UpdateExpression: "SET #read = :true",
    ExpressionAttributeNames: { "#read": "read" },
    ExpressionAttributeValues: { ":true": true }
  });
}
```

### 6.2 Mark All as Read

```javascript
async function markAllAsRead(orgId) {
  // Get all unread notifications
  const unread = await ddb.query({
    TableName: "Notifications",
    KeyConditionExpression: "PK = :pk",
    FilterExpression: "#read = :false",
    ExpressionAttributeNames: { "#read": "read" },
    ExpressionAttributeValues: {
      ":pk": `ORG#${orgId}`,
      ":false": false
    }
  });

  // Batch update
  const updates = unread.Items.map(item => ({
    Update: {
      TableName: "Notifications",
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: "SET #read = :true",
      ExpressionAttributeNames: { "#read": "read" },
      ExpressionAttributeValues: { ":true": true }
    }
  }));

  // DynamoDB transact write (max 100 items)
  for (let i = 0; i < updates.length; i += 25) {
    await ddb.transactWriteItems({
      TransactItems: updates.slice(i, i + 25)
    });
  }

  return { updatedCount: updates.length };
}
```

## 7. Cleanup

Notifications have TTL of 7 days. DynamoDB automatically deletes expired items.

**Manual cleanup (if needed):**
```javascript
async function cleanupOldNotifications(orgId, olderThan) {
  // Query and delete notifications older than threshold
  // This is a fallback if TTL is not enabled
}
```

## 8. UI Display

### 8.1 Badge

Show unread count on notification icon:
```jsx
<NotificationIcon>
  {unreadCount > 0 && (
    <Badge>{unreadCount > 99 ? "99+" : unreadCount}</Badge>
  )}
</NotificationIcon>
```

### 8.2 Toast

Show toast for new critical notifications:
```javascript
// Poll for notifications
const prevIds = new Set(notifications.map(n => n.notificationId));
const newNotifications = await fetchNotifications();
const newItems = newNotifications.filter(n => !prevIds.has(n.notificationId));

for (const notif of newItems) {
  if (notif.severity === "error" || notif.severity === "warning") {
    toast({
      title: notif.title,
      description: notif.message,
      variant: notif.severity
    });
  }
}
```

### 8.3 Severity Colors

| Severity | Color | Icon |
|----------|-------|------|
| info | blue | ✓ |
| warning | yellow | ! |
| error | red | ✕ |

## 9. Future: External Notifications

### 9.1 Email (Phase 2)

```javascript
interface EmailNotificationConfig {
  enabled: boolean;
  types: NotificationType[]; // Which types to send
  minSeverity: "info" | "warning" | "error";
}
```

### 9.2 Slack (Phase 2)

```javascript
interface SlackNotificationConfig {
  enabled: boolean;
  webhookUrl: string;
  channel: string;
  types: NotificationType[];
  minSeverity: "info" | "warning" | "error";
}
```
