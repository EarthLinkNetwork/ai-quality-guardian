/**
 * Namespace Configuration (v2)
 * Per spec/21_STABLE_DEV.md
 *
 * v2 Changes:
 * - Single table design: namespace is part of the composite key
 * - Table name is fixed: pm-runner-queue
 * - getTableName() returns fixed value
 *
 * Provides state separation between namespaces:
 * - Data separation via namespace partition key
 * - State directory: .claude/state/{namespace}/
 * - Web UI port: configurable via --port
 *
 * Auto-derivation: "Same Folder = Same Queue"
 * - Derives namespace from project root path: {folder_name}-{path_hash_4_chars}
 * - Example: /Users/masa/dev/my-project -> my-project-a1b2
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
    /** DynamoDB table name (v2: always pm-runner-queue) */
    tableName: string;
    /** State directory path derived from namespace */
    stateDir: string;
    /** Web UI port (default: 5678 for default namespace) */
    port: number;
    /** Whether namespace was auto-derived from project path */
    autoDerived?: boolean;
}
/**
 * Validate namespace name
 * Fail-closed: Returns error message if invalid, undefined if valid
 */
export declare function validateNamespace(namespace: string): string | undefined;
/**
 * Get QueueStore table name (v2: always returns fixed table name)
 */
export declare function getTableName(_namespace: string): string;
/**
 * Get state directory path for namespace
 * @param projectRoot - The project root directory
 * @param namespace - The namespace
 */
export declare function getStateDir(projectRoot: string, namespace: string): string;
/**
 * Get default Web UI port for namespace
 * - default: 5678
 * - stable: 5678
 * - dev: 5679
 * - Others: 5680 + hash(namespace) % 1000
 */
export declare function getDefaultPort(namespace: string): number;
/**
 * Derive namespace from project path
 * Format: {folder_name}-{4_char_hash}
 * Example: /Users/masa/dev/my-project -> my-project-a1b2
 *
 * @param projectPath - Full path to project directory
 * @returns Derived namespace string
 */
export declare function deriveNamespaceFromPath(projectPath: string): string;
/**
 * Build namespace configuration
 * Fail-closed: Throws on invalid namespace
 *
 * Priority order:
 * 1. Explicit namespace option
 * 2. PM_RUNNER_NAMESPACE environment variable
 * 3. Auto-derived from projectRoot (if autoDerive is true)
 * 4. DEFAULT_NAMESPACE ('default')
 *
 * @param options - Configuration options
 * @returns Namespace configuration
 * @throws Error if namespace is invalid
 */
export declare function buildNamespaceConfig(options: {
    namespace?: string;
    projectRoot: string;
    port?: number;
    autoDerive?: boolean;
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