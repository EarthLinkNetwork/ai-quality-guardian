/**
 * DAL Utilities Stub
 * Placeholder for DAL utility functions
 */

export function marshalItem(_item: Record<string, any>): Record<string, any> {
  return _item;
}

export function unmarshalItem(_item: Record<string, any>): Record<string, any> {
  return _item;
}

export function createTableName(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function orgPK(orgId: string): string {
  return `ORG#${orgId}`;
}

export function projectIndexSK(projectId: string): string {
  return `PIDX#${projectId}`;
}

export function taskEventSK(taskId: string, timestamp: string, eventId: string): string {
  return `TASKEVT#${taskId}#${timestamp}#${eventId}`;
}

export function generateId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 15);
  return `${prefix}_${random}`;
}

export function encodeCursor(key: Record<string, unknown> | undefined): string | undefined {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}

export function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
}
