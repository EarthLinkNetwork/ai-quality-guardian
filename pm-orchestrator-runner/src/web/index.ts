/**
 * Web Module
 * Per spec/19_WEB_UI.md
 *
 * Exports:
 * - WebServer: Express HTTP server
 * - createApp: Express app factory
 * - createNamespacedWebServer: Factory for namespace-separated WebServer
 */

export {
  WebServer,
  WebServerConfig,
  WebServerState,
  createApp,
} from './server';

import { WebServer, WebServerConfig } from './server';
import { QueueStore } from '../queue';

/**
 * Namespace configuration for WebServer
 * Per spec/21_STABLE_DEV.md
 */
export interface NamespaceWebConfig {
  /** Namespace name (e.g., 'stable', 'dev') */
  namespace: string;
  /** Port number derived from namespace */
  port: number;
}

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
 * const store = createNamespacedQueueStore({ ... });
 * const server = createNamespacedWebServer(
 *   { namespace: namespaceConfig.namespace, port: namespaceConfig.port },
 *   store,
 *   'session-123'
 * );
 * ```
 */
export function createNamespacedWebServer(
  namespaceConfig: NamespaceWebConfig,
  queueStore: QueueStore,
  sessionId: string,
  host?: string
): WebServer {
  return new WebServer({
    port: namespaceConfig.port,
    host,
    queueStore,
    sessionId,
  });
}
