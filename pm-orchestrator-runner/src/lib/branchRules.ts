/**
 * Branch name validation rules.
 * Pure functions for validating git branch names.
 */

const RESERVED_BRANCHES = ['main', 'master', 'develop', 'staging', 'production'] as const;

const VALID_PREFIXES = ['feature/', 'bugfix/', 'hotfix/', 'release/', 'chore/'] as const;

const MAX_BRANCH_LENGTH = 100;

export type ValidationResult = {
  valid: boolean;
  reason?: string;
};

/**
 * Checks if a branch name is a reserved (protected) branch.
 */
export function isReservedBranch(name: string): boolean {
  return RESERVED_BRANCHES.includes(name as typeof RESERVED_BRANCHES[number]);
}

/**
 * Checks if a branch name has a valid prefix.
 */
export function hasValidPrefix(name: string): boolean {
  return VALID_PREFIXES.some(prefix => name.startsWith(prefix));
}

/**
 * Validates a branch name against all rules.
 * Returns a ValidationResult with valid=true or valid=false with a reason.
 */
export function validateBranchName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: 'Branch name must not be empty' };
  }

  if (name !== name.trim()) {
    return { valid: false, reason: 'Branch name must not have leading or trailing whitespace' };
  }

  if (name.length > MAX_BRANCH_LENGTH) {
    return { valid: false, reason: `Branch name must not exceed ${MAX_BRANCH_LENGTH} characters` };
  }

  if (/[^a-zA-Z0-9/_\-.]/.test(name)) {
    return { valid: false, reason: 'Branch name contains invalid characters' };
  }

  if (name.includes('..')) {
    return { valid: false, reason: 'Branch name must not contain ".."' };
  }

  if (name.endsWith('.lock')) {
    return { valid: false, reason: 'Branch name must not end with ".lock"' };
  }

  if (isReservedBranch(name)) {
    return { valid: false, reason: `"${name}" is a reserved branch name` };
  }

  if (!hasValidPrefix(name)) {
    return { valid: false, reason: 'Branch name must start with a valid prefix (feature/, bugfix/, hotfix/, release/, chore/)' };
  }

  return { valid: true };
}
