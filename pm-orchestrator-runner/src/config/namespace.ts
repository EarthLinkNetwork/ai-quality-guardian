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

import * as path from 'path';
import * as crypto from 'crypto';
import { QUEUE_TABLE_NAME } from '../queue/queue-store';

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
export const DEFAULT_NAMESPACE = 'default';

/**
 * Maximum namespace length
 */
const MAX_NAMESPACE_LENGTH = 32;

/**
 * Hash length for auto-derived namespaces
 */
const HASH_LENGTH = 4;

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
export function validateNamespace(namespace: string): string | undefined {
  if (!namespace) {
    return 'Namespace cannot be empty';
  }

  if (namespace.length > MAX_NAMESPACE_LENGTH) {
    return 'Namespace too long: ' + namespace.length + ' characters (max ' + MAX_NAMESPACE_LENGTH + ')';
  }

  if (!NAMESPACE_PATTERN.test(namespace)) {
    return 'Invalid namespace format: "' + namespace + '". Use alphanumeric and hyphens only (e.g., "stable", "dev", "test-1")';
  }

  if (RESERVED_NAMESPACES.includes(namespace.toLowerCase())) {
    return 'Reserved namespace name: "' + namespace + '". Cannot use: ' + RESERVED_NAMESPACES.join(', ');
  }

  return undefined; // Valid
}

/**
 * Get QueueStore table name (v2: always returns fixed table name)
 */
export function getTableName(_namespace: string): string {
  // v2: Single table design - all namespaces share the same table
  return QUEUE_TABLE_NAME;
}

/**
 * Get state directory path for namespace
 * @param projectRoot - The project root directory
 * @param namespace - The namespace
 */
export function getStateDir(projectRoot: string, namespace: string): string {
  if (namespace === DEFAULT_NAMESPACE) {
    return projectRoot + '/.claude';
  }
  return projectRoot + '/.claude/state/' + namespace;
}

/**
 * Get default Web UI port for namespace
 * - default: 5678
 * - stable: 5678
 * - dev: 5679
 * - Others: 5680 + hash(namespace) % 1000
 */
export function getDefaultPort(namespace: string): number {
  const basePorts: Record<string, number> = {
    'default': 5678,
    'stable': 5678,
    'dev': 5679,
  };

  if (basePorts[namespace] !== undefined) {
    return basePorts[namespace];
  }

  // Hash-based port for other namespaces (5680-6677)
  let hash = 0;
  for (let i = 0; i < namespace.length; i++) {
    const char = namespace.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 5680 + (Math.abs(hash) % 998);
}

/**
 * Normalize folder name for namespace
 * - Convert to lowercase
 * - Replace underscores with hyphens
 * - Remove special characters (keep only alphanumeric and hyphens)
 * - Remove leading/trailing hyphens
 */
function normalizeFolderName(folderName: string): string {
  return folderName
    .toLowerCase()
    .replace(/_/g, '-')  // underscores to hyphens
    .replace(/[^a-z0-9-]/g, '')  // remove special chars
    .replace(/^-+|-+$/g, '')  // remove leading/trailing hyphens
    .replace(/-+/g, '-');  // collapse multiple hyphens
}

/**
 * Generate 4-character hash from path
 * Uses MD5 for speed and consistency
 */
function generatePathHash(fullPath: string): string {
  const hash = crypto.createHash('md5').update(fullPath).digest('hex');
  return hash.substring(0, HASH_LENGTH);
}

/**
 * Derive namespace from project path
 * Format: {folder_name}-{4_char_hash}
 * Example: /Users/masa/dev/my-project -> my-project-a1b2
 *
 * @param projectPath - Full path to project directory
 * @returns Derived namespace string
 */
export function deriveNamespaceFromPath(projectPath: string): string {
  // Normalize path separators and remove trailing slash
  const normalizedPath = projectPath
    .replace(/\\/g, '/')  // Windows to Unix paths
    .replace(/\/+$/, '');  // Remove trailing slashes

  // Extract folder name (basename)
  const folderName = path.basename(normalizedPath);

  // Normalize folder name for namespace
  const normalizedFolder = normalizeFolderName(folderName);

  // Generate hash from full path
  const pathHash = generatePathHash(normalizedPath);

  // Calculate max folder length to fit within MAX_NAMESPACE_LENGTH
  // Format: {folder}-{hash} where hash is 4 chars and hyphen is 1 char
  const maxFolderLength = MAX_NAMESPACE_LENGTH - HASH_LENGTH - 1;

  // Truncate folder name if needed
  let truncatedFolder = normalizedFolder;
  if (truncatedFolder.length > maxFolderLength) {
    truncatedFolder = truncatedFolder.substring(0, maxFolderLength);
    // Remove trailing hyphen if truncation created one
    truncatedFolder = truncatedFolder.replace(/-+$/, '');
  }

  // Handle edge case: empty folder name after normalization
  if (!truncatedFolder) {
    truncatedFolder = 'project';
  }

  // Combine folder name and hash
  const namespace = truncatedFolder + '-' + pathHash;

  return namespace;
}

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
export function buildNamespaceConfig(options: {
  namespace?: string;
  projectRoot: string;
  port?: number;
  autoDerive?: boolean;
}): NamespaceConfig {
  let namespace: string;
  let autoDerived = false;

  if (options.namespace) {
    // 1. Explicit namespace option takes highest priority
    namespace = options.namespace;
  } else if (process.env.PM_RUNNER_NAMESPACE) {
    // 2. Environment variable
    namespace = process.env.PM_RUNNER_NAMESPACE;
  } else if (options.autoDerive) {
    // 3. Auto-derive from project path
    namespace = deriveNamespaceFromPath(options.projectRoot);
    autoDerived = true;
  } else {
    // 4. Default namespace
    namespace = DEFAULT_NAMESPACE;
  }

  // Validate namespace (fail-closed)
  const error = validateNamespace(namespace);
  if (error) {
    throw new Error('Invalid namespace: ' + error);
  }

  return {
    namespace,
    tableName: getTableName(namespace),
    stateDir: getStateDir(options.projectRoot, namespace),
    port: options.port || getDefaultPort(namespace),
    autoDerived,
  };
}

/**
 * Namespace comparison utilities
 */
export const NamespaceUtils = {
  /**
   * Check if two namespaces are the same
   */
  isSameNamespace(ns1: string, ns2: string): boolean {
    return ns1.toLowerCase() === ns2.toLowerCase();
  },

  /**
   * Check if namespace is the default namespace
   */
  isDefaultNamespace(namespace: string): boolean {
    return namespace.toLowerCase() === DEFAULT_NAMESPACE;
  },

  /**
   * Check if namespace represents stable
   */
  isStable(namespace: string): boolean {
    return namespace.toLowerCase() === 'stable';
  },

  /**
   * Check if namespace represents dev
   */
  isDev(namespace: string): boolean {
    return namespace.toLowerCase() === 'dev';
  },
};
