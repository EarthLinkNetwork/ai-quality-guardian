"use strict";
/**
 * DAL Utilities Stub
 * Placeholder for DAL utility functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.marshalItem = marshalItem;
exports.unmarshalItem = unmarshalItem;
exports.createTableName = createTableName;
exports.nowISO = nowISO;
exports.orgPK = orgPK;
exports.projectIndexSK = projectIndexSK;
exports.taskEventSK = taskEventSK;
exports.generateId = generateId;
exports.encodeCursor = encodeCursor;
exports.decodeCursor = decodeCursor;
function marshalItem(_item) {
    return _item;
}
function unmarshalItem(_item) {
    return _item;
}
function createTableName(prefix, suffix) {
    return `${prefix}-${suffix}`;
}
function nowISO() {
    return new Date().toISOString();
}
function orgPK(orgId) {
    return `ORG#${orgId}`;
}
function projectIndexSK(projectId) {
    return `PIDX#${projectId}`;
}
function taskEventSK(taskId, timestamp, eventId) {
    return `TASKEVT#${taskId}#${timestamp}#${eventId}`;
}
function generateId(prefix) {
    const random = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${random}`;
}
function encodeCursor(key) {
    if (!key)
        return undefined;
    return Buffer.from(JSON.stringify(key)).toString('base64');
}
function decodeCursor(cursor) {
    if (!cursor)
        return undefined;
    try {
        return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=utils.js.map