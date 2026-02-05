"use strict";
/**
 * Sessions DAL Stub
 * Placeholder for Sessions data access layer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSessionsByProject = listSessionsByProject;
exports.getSession = getSession;
async function listSessionsByProject(_orgId, _projectPath, _options) {
    return {
        items: [],
        cursor: undefined,
    };
}
async function getSession(_orgId, _sessionId) {
    return null;
}
//# sourceMappingURL=sessions.js.map