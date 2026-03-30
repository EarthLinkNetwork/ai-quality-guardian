/**
 * Blast Radius Classifier
 *
 * Classifies commands and file operations by their potential impact:
 * - GREEN: Safe, reversible, within project scope -> auto-execute
 * - YELLOW: Caution, within project but notable -> LLM decides
 * - RED: Irreversible or out of scope -> require user confirmation
 */

export type BlastRadius = 'GREEN' | 'YELLOW' | 'RED';

export interface BlastRadiusConfig {
  /** Files that must never be deleted */
  protectedFiles: string[];
  /** Paths outside project that must not be touched */
  protectedPaths: string[];
  /** Allowed AWS account IDs (others are RED) */
  allowedAwsAccounts: string[];
  /** Allowed GCP project IDs (others are RED) */
  allowedGcpProjects: string[];
  /** Command patterns that are always RED */
  redCommands: string[];
  /** Command patterns that are YELLOW */
  yellowCommands: string[];
}

export const DEFAULT_BLAST_RADIUS_CONFIG: BlastRadiusConfig = {
  protectedFiles: [
    '.env', '.env.*', '.env.local', '.env.production',
    '*.pem', '*.key', '*.p12', '*.pfx',
    'credentials.*', 'serviceAccountKey.*',
    'id_rsa', 'id_ed25519', '*.secret',
  ],
  protectedPaths: [
    '/etc', '/usr', '/var', '/sys',
    '~/.ssh', '~/.aws', '~/.gcloud',
  ],
  allowedAwsAccounts: [],
  allowedGcpProjects: [],
  redCommands: [
    'rm -rf /',
    'drop table', 'drop database', 'truncate table',
    'delete-app', 'delete-stack', 'delete-cluster',
    'destroy', 'terminate-instances',
    'gcloud.*delete', 'az.*delete',
    'git push --force', 'git push -f',
    'git reset --hard',
    'kubectl delete',
    'docker rm', 'docker rmi',
    'npm unpublish',
  ],
  yellowCommands: [
    'git push',
    'npm publish',
    'docker push',
    'chmod', 'chown',
  ],
};

/**
 * Classify a command by its blast radius
 */
export function classifyCommand(
  command: string,
  config: BlastRadiusConfig = DEFAULT_BLAST_RADIUS_CONFIG,
): BlastRadius {
  const lower = command.toLowerCase().trim();

  // RED: Check red command patterns
  for (const pattern of config.redCommands) {
    if (matchesPattern(lower, pattern.toLowerCase())) {
      return 'RED';
    }
  }

  // RED: Check protected file deletion
  if (isFileDeletion(lower)) {
    for (const protectedPattern of config.protectedFiles) {
      if (deletionTargetsPattern(lower, protectedPattern.toLowerCase())) {
        return 'RED';
      }
    }
  }

  // RED: Check protected paths
  for (const protectedPath of config.protectedPaths) {
    if (lower.includes(protectedPath.toLowerCase())) {
      return 'RED';
    }
  }

  // YELLOW: Check yellow command patterns
  for (const pattern of config.yellowCommands) {
    if (matchesPattern(lower, pattern.toLowerCase())) {
      return 'YELLOW';
    }
  }

  return 'GREEN';
}

/**
 * Classify a file operation
 */
export function classifyFileOperation(
  operation: 'create' | 'edit' | 'delete' | 'move',
  filePath: string,
  config: BlastRadiusConfig = DEFAULT_BLAST_RADIUS_CONFIG,
): BlastRadius {
  const normalizedPath = filePath.toLowerCase();

  if (operation === 'delete' || operation === 'move') {
    // Check protected files
    for (const pattern of config.protectedFiles) {
      if (fileMatchesGlob(normalizedPath, pattern.toLowerCase())) {
        return 'RED';
      }
    }

    // Check protected paths
    for (const protectedPath of config.protectedPaths) {
      if (normalizedPath.startsWith(protectedPath.toLowerCase())) {
        return 'RED';
      }
    }
  }

  return 'GREEN';
}

/**
 * Generate safety rules text for prompt injection
 */
export function generateSafetyRules(config: BlastRadiusConfig): string {
  const lines: string[] = [];

  lines.push('[SAFETY RULES - NON-NEGOTIABLE]');
  lines.push('Before executing any destructive command, classify its blast radius:');
  lines.push('');
  lines.push('RED (STOP and ask user before executing):');
  for (const cmd of config.redCommands) {
    lines.push(`  - ${cmd}`);
  }
  lines.push('  - Any command deleting these files: ' + config.protectedFiles.join(', '));
  lines.push('  - Any command touching these paths: ' + config.protectedPaths.join(', '));
  if (config.allowedAwsAccounts.length > 0) {
    lines.push('  - Any AWS/GCP/Azure command targeting accounts OTHER than: ' + config.allowedAwsAccounts.join(', '));
  }
  if (config.allowedGcpProjects.length > 0) {
    lines.push('  - Any GCP command targeting projects OTHER than: ' + config.allowedGcpProjects.join(', '));
  }
  lines.push('');
  lines.push('YELLOW (Proceed but explain why):');
  for (const cmd of config.yellowCommands) {
    lines.push(`  - ${cmd}`);
  }
  lines.push('');
  lines.push('GREEN (Proceed automatically):');
  lines.push('  - All other commands within project scope');
  lines.push('');
  lines.push('For RED operations: Output "[RED OPERATION] <description>" and STOP.');
  lines.push('Do NOT execute RED operations without explicit user approval.');

  return lines.join('\n');
}

// --- Helper functions ---

function matchesPattern(command: string, pattern: string): boolean {
  // Simple substring or glob-like match
  if (pattern.includes('*')) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
    return regex.test(command);
  }
  return command.includes(pattern);
}

function isFileDeletion(command: string): boolean {
  return /\brm\b|\bdelete\b|\bunlink\b|\bremove\b/.test(command);
}

function deletionTargetsPattern(command: string, filePattern: string): boolean {
  const pattern = filePattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
  return new RegExp(pattern).test(command);
}

function fileMatchesGlob(filePath: string, pattern: string): boolean {
  const basename = filePath.split('/').pop() || '';
  const regexStr = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
  return new RegExp(regexStr).test(basename) || new RegExp(regexStr).test(filePath);
}
