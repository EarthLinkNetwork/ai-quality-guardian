"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NamespaceUtils = exports.DEFAULT_NAMESPACE = void 0;
exports.validateNamespace = validateNamespace;
exports.getTableName = getTableName;
exports.getStateDir = getStateDir;
exports.getDefaultPort = getDefaultPort;
exports.buildNamespaceConfig = buildNamespaceConfig;
/**
 * Valid namespace pattern
 * - Alphanumeric and hyphens only
 * - 1-32 characters
 * - Cannot start or end with hyphen
 */
const NAMESPACE_PATTERN = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/i;
/**
 * Reserved namespace names that cannot be used
 */
const RESERVED_NAMESPACES = ['all', 'none', 'null', 'undefined', 'system'];
/**
 * Default namespace name
 */
exports.DEFAULT_NAMESPACE = 'default';
/**
 * Validate namespace name
 * Fail-closed: Returns error message if invalid, undefined if valid
 */
function validateNamespace(namespace) {
    if (!namespace) {
        return 'Namespace cannot be empty';
    }
    if (namespace.length > 32) {
        return `Namespace too long: ${namespace.length} characters (max 32)`;
    }
    if (!NAMESPACE_PATTERN.test(namespace)) {
        return `Invalid namespace format: "${namespace}". Use alphanumeric and hyphens only (e.g., "stable", "dev", "test-1")`;
    }
    if (RESERVED_NAMESPACES.includes(namespace.toLowerCase())) {
        return `Reserved namespace name: "${namespace}". Cannot use: ${RESERVED_NAMESPACES.join(', ')}`;
    }
    return undefined; // Valid
}
/**
 * Get QueueStore table name for namespace
 */
function getTableName(namespace) {
    if (namespace === exports.DEFAULT_NAMESPACE) {
        return 'pm-runner-queue';
    }
    return `pm-runner-queue-${namespace}`;
}
/**
 * Get state directory path for namespace
 * @param projectRoot - The project root directory
 * @param namespace - The namespace
 */
function getStateDir(projectRoot, namespace) {
    if (namespace === exports.DEFAULT_NAMESPACE) {
        return `${projectRoot}/.claude`;
    }
    return `${projectRoot}/.claude/state/${namespace}`;
}
/**
 * Get default Web UI port for namespace
 * - default: 3000
 * - stable: 3000
 * - dev: 3001
 * - Others: 3000 + hash(namespace) % 1000
 */
function getDefaultPort(namespace) {
    const basePorts = {
        'default': 3000,
        'stable': 3000,
        'dev': 3001,
    };
    if (basePorts[namespace] !== undefined) {
        return basePorts[namespace];
    }
    // Hash-based port for other namespaces (3002-3999)
    let hash = 0;
    for (let i = 0; i < namespace.length; i++) {
        const char = namespace.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 3002 + (Math.abs(hash) % 998);
}
/**
 * Build namespace configuration
 * Fail-closed: Throws on invalid namespace
 *
 * @param options - Configuration options
 * @returns Namespace configuration
 * @throws Error if namespace is invalid
 */
function buildNamespaceConfig(options) {
    const namespace = options.namespace || process.env.PM_RUNNER_NAMESPACE || exports.DEFAULT_NAMESPACE;
    // Validate namespace (fail-closed)
    const error = validateNamespace(namespace);
    if (error) {
        throw new Error(`Invalid namespace: ${error}`);
    }
    return {
        namespace,
        tableName: getTableName(namespace),
        stateDir: getStateDir(options.projectRoot, namespace),
        port: options.port || getDefaultPort(namespace),
    };
}
/**
 * Namespace comparison utilities
 */
exports.NamespaceUtils = {
    /**
     * Check if two namespaces are the same
     */
    isSameNamespace(ns1, ns2) {
        return ns1.toLowerCase() === ns2.toLowerCase();
    },
    /**
     * Check if namespace is the default namespace
     */
    isDefaultNamespace(namespace) {
        return namespace.toLowerCase() === exports.DEFAULT_NAMESPACE;
    },
    /**
     * Check if namespace represents stable
     */
    isStable(namespace) {
        return namespace.toLowerCase() === 'stable';
    },
    /**
     * Check if namespace represents dev
     */
    isDev(namespace) {
        return namespace.toLowerCase() === 'dev';
    },
};
//# sourceMappingURL=namespace.js.map