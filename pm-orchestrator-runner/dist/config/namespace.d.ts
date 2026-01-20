/**
 * Namespace Configuration
 * Per spec/21_STABLE_DEV.md
 *
 * Provides state separation between stable and dev runners:
 * - QueueStore table name: pm-runner-queue-{namespace}
 * - State directory: .claude/state/{namespace}/
 * - Web UI port: configurable via --port
 *
 * Fail-closed: Invalid namespace names cause immediate exit
 */
/**
 * Default namespace name
 */
export declare const DEFAULT_NAMESPACE = "default";
/**
 * Namespace configuration
 */
export interface NamespaceConfig {
    /** Namespace name (default: 'default') */
    namespace: string;
    /** DynamoDB table name derived from namespace */
    tableName: string;
    /** State directory path derived from namespace */
    stateDir: string;
    /** Web UI port (default: 3000 for default namespace) */
    port: number;
}
/**
 * Validate namespace name
 * Fail-closed: Returns error message if invalid, undefined if valid
 */
export declare function validateNamespace(namespace: string): string | undefined;
/**
 * Get QueueStore table name for namespace
 */
export declare function getTableName(namespace: string): string;
/**
 * Get state directory path for namespace
 * @param projectRoot - The project root directory
 * @param namespace - The namespace
 */
export declare function getStateDir(projectRoot: string, namespace: string): string;
/**
 * Get default Web UI port for namespace
 * - default: 3000
 * - stable: 3000
 * - dev: 3001
 * - Others: 3000 + hash(namespace) % 1000
 */
export declare function getDefaultPort(namespace: string): number;
/**
 * Build namespace configuration
 * Fail-closed: Throws on invalid namespace
 *
 * @param options - Configuration options
 * @returns Namespace configuration
 * @throws Error if namespace is invalid
 */
export declare function buildNamespaceConfig(options: {
    namespace?: string;
    projectRoot: string;
    port?: number;
}): NamespaceConfig;
/**
 * Namespace comparison utilities
 */
export declare const NamespaceUtils: {
    /**
     * Check if two namespaces are the same
     */
    isSameNamespace(ns1: string, ns2: string): boolean;
    /**
     * Check if namespace is the default namespace
     */
    isDefaultNamespace(namespace: string): boolean;
    /**
     * Check if namespace represents stable
     */
    isStable(namespace: string): boolean;
    /**
     * Check if namespace represents dev
     */
    isDev(namespace: string): boolean;
};
//# sourceMappingURL=namespace.d.ts.map