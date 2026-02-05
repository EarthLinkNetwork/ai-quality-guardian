"use strict";
/**
 * DynamoDB Client Stub
 * Placeholder for DynamoDB client implementation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TABLES = exports.dynamoDBClient = void 0;
exports.createDynamoDBClient = createDynamoDBClient;
exports.getDocClient = getDocClient;
function createDynamoDBClient(_config) {
    return {};
}
exports.dynamoDBClient = createDynamoDBClient();
function getDocClient() {
    return {};
}
exports.TABLES = {
    PROJECT_INDEXES: 'pm-project-indexes',
    TASK_EVENTS: 'pm-task-events',
    SESSIONS: 'pm-sessions',
    TASKS: 'pm-tasks',
};
//# sourceMappingURL=client.js.map