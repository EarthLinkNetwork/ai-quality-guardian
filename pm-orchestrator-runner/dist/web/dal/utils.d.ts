/**
 * DAL Utilities Stub
 * Placeholder for DAL utility functions
 */
export declare function marshalItem(_item: Record<string, any>): Record<string, any>;
export declare function unmarshalItem(_item: Record<string, any>): Record<string, any>;
export declare function createTableName(prefix: string, suffix: string): string;
export declare function nowISO(): string;
export declare function orgPK(orgId: string): string;
export declare function projectIndexSK(projectId: string): string;
export declare function taskEventSK(taskId: string, timestamp: string, eventId: string): string;
export declare function generateId(prefix: string): string;
export declare function encodeCursor(key: Record<string, unknown> | undefined): string | undefined;
export declare function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined;
//# sourceMappingURL=utils.d.ts.map