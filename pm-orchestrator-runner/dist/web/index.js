"use strict";
/**
 * Web Module (v2)
 * Per spec/19_WEB_UI.md
 *
 * v2 Changes:
 * - WebServer requires namespace parameter
 * - Project root for display
 *
 * Exports:
 * - WebServer: Express HTTP server
 * - createApp: Express app factory
 * - createNamespacedWebServer: Factory for namespace-separated WebServer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = exports.WebServer = void 0;
exports.createNamespacedWebServer = createNamespacedWebServer;
var server_1 = require("./server");
Object.defineProperty(exports, "WebServer", { enumerable: true, get: function () { return server_1.WebServer; } });
Object.defineProperty(exports, "createApp", { enumerable: true, get: function () { return server_1.createApp; } });
const server_2 = require("./server");
/**
 * Create a WebServer instance with namespace separation
 * Per spec/21_STABLE_DEV.md
 *
 * @param namespaceConfig - Namespace configuration with port
 * @param queueStore - QueueStore instance to use
 * @param sessionId - Session ID for new tasks
 * @param host - Optional host (default: localhost)
 * @returns Configured WebServer instance
 *
 * @example
 * ```typescript
 * const namespaceConfig = buildNamespaceConfig({ namespace: 'dev', projectRoot: '/path' });
 * const store = new QueueStore({ namespace: 'dev' });
 * const server = createNamespacedWebServer(
 *   { namespace: namespaceConfig.namespace, port: namespaceConfig.port },
 *   store,
 *   'session-123'
 * );
 * ```
 */
function createNamespacedWebServer(namespaceConfig, queueStore, sessionId, host) {
    return new server_2.WebServer({
        port: namespaceConfig.port,
        host,
        queueStore,
        sessionId,
        namespace: namespaceConfig.namespace,
        projectRoot: namespaceConfig.projectRoot,
    });
}
//# sourceMappingURL=index.js.map