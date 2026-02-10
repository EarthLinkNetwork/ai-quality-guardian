/**
 * Spec Coverage Gate Diagnostic Check
 *
 * Validates that all specification chapters listed in 00_INDEX.md exist
 * and contain required sections.
 *
 * Run: npx ts-node diagnostics/spec-coverage.check.ts
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks fail
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CheckResult {
  rule: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  reason?: string;
}

export interface SpecCoverageResult {
  passed: boolean;
  results: CheckResult[];
  missingChapters: string[];
  incompleteChapters: string[];
}

// Required chapters from 00_INDEX.md
const REQUIRED_CHAPTERS = [
  'overview.md',
  '01_PROJECT_MODEL.md',
  '02_SESSION_MODEL.md',
  'task-lifecycle.md',
  'dynamodb.md',
  '03_DASHBOARD_UI.md',
  'web-ui.md',
  'api.md',
  'agent.md',
  'auth-and-rbac.md',
  'logging-and-audit.md',
  'notifications.md',
  'testing-and-gates.md',
  '04_TRACEABILITY.md',
  '05_INSPECTION_PACKET.md',
];

// Required sections in each spec file
const REQUIRED_SECTIONS: Record<string, string[]> = {
  'overview.md': ['Vision', 'Architecture', 'Key Entities'],
  '01_PROJECT_MODEL.md': ['Overview', 'Project Entity', 'Acceptance Criteria'],
  '02_SESSION_MODEL.md': ['Overview', 'Session Entity', 'Thread Entity', 'Acceptance Criteria'],
  'task-lifecycle.md': ['State Machine', 'States', 'Transitions'],
  'dynamodb.md': ['Design Approach', 'Tables'],
  '03_DASHBOARD_UI.md': ['Overview', 'Dashboard Layout', 'Status Indicators', 'Acceptance Criteria'],
  'web-ui.md': [],  // No required sections
  'api.md': [],
  'agent.md': [],
  'auth-and-rbac.md': [],
  'logging-and-audit.md': [],
  'notifications.md': [],
  'testing-and-gates.md': [],
  '04_TRACEABILITY.md': ['Overview', 'Traceability Matrix'],
  '05_INSPECTION_PACKET.md': ['Overview', 'Packet Structure', 'Acceptance Criteria'],
};

function checkChapterExists(specsDir: string, chapter: string): boolean {
  const fullPath = path.join(specsDir, chapter);
  return fs.existsSync(fullPath);
}

function checkChapterSections(specsDir: string, chapter: string): string[] {
  const fullPath = path.join(specsDir, chapter);
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const requiredSections = REQUIRED_SECTIONS[chapter] || [];
  const missingSections: string[] = [];

  for (const section of requiredSections) {
    // Check for section header (## Section or # Section)
    // Also matches "## N. System Architecture" or "## N. Architecture"
    const pattern = new RegExp(`^#{1,3}\\s*\\d*\\.?\\s*(\\w+\\s+)?${section}`, 'im');
    if (!pattern.test(content)) {
      missingSections.push(section);
    }
  }

  return missingSections;
}

export function checkSpecCoverage(projectRoot: string): SpecCoverageResult {
  const results: CheckResult[] = [];
  const missingChapters: string[] = [];
  const incompleteChapters: string[] = [];
  const specsDir = path.join(projectRoot, 'docs', 'specs');

  // Check 1: specs directory exists
  if (!fs.existsSync(specsDir)) {
    results.push({
      rule: 'SPEC-0',
      description: 'docs/specs directory exists',
      status: 'FAIL',
      reason: 'docs/specs directory not found',
    });
    return {
      passed: false,
      results,
      missingChapters: ['docs/specs/'],
      incompleteChapters: [],
    };
  }

  results.push({
    rule: 'SPEC-0',
    description: 'docs/specs directory exists',
    status: 'PASS',
  });

  // Check 2: 00_INDEX.md exists
  const indexPath = path.join(specsDir, '00_INDEX.md');
  if (!fs.existsSync(indexPath)) {
    results.push({
      rule: 'SPEC-1',
      description: '00_INDEX.md exists',
      status: 'FAIL',
      reason: 'docs/specs/00_INDEX.md not found',
    });
    return {
      passed: false,
      results,
      missingChapters: ['00_INDEX.md'],
      incompleteChapters: [],
    };
  }

  results.push({
    rule: 'SPEC-1',
    description: '00_INDEX.md exists',
    status: 'PASS',
  });

  // Check 3: All required chapters exist
  for (const chapter of REQUIRED_CHAPTERS) {
    if (!checkChapterExists(specsDir, chapter)) {
      missingChapters.push(chapter);
    }
  }

  if (missingChapters.length > 0) {
    results.push({
      rule: 'SPEC-2',
      description: 'All required specification chapters exist',
      status: 'FAIL',
      reason: `Missing chapters: ${missingChapters.join(', ')}`,
    });
  } else {
    results.push({
      rule: 'SPEC-2',
      description: 'All required specification chapters exist',
      status: 'PASS',
      reason: `Found all ${REQUIRED_CHAPTERS.length} chapters`,
    });
  }

  // Check 4: Required sections exist in each chapter
  for (const chapter of REQUIRED_CHAPTERS) {
    if (missingChapters.includes(chapter)) {
      continue;  // Skip missing chapters
    }

    const missingSections = checkChapterSections(specsDir, chapter);
    if (missingSections.length > 0) {
      incompleteChapters.push(`${chapter}: missing ${missingSections.join(', ')}`);
    }
  }

  if (incompleteChapters.length > 0) {
    results.push({
      rule: 'SPEC-3',
      description: 'All chapters contain required sections',
      status: 'FAIL',
      reason: `Incomplete chapters:\n  - ${incompleteChapters.join('\n  - ')}`,
    });
  } else {
    results.push({
      rule: 'SPEC-3',
      description: 'All chapters contain required sections',
      status: 'PASS',
    });
  }

  // Check 5: 04_TRACEABILITY.md has traceability matrix
  const traceabilityPath = path.join(specsDir, '04_TRACEABILITY.md');
  if (fs.existsSync(traceabilityPath)) {
    const content = fs.readFileSync(traceabilityPath, 'utf-8');
    const hasMatrix = /\|\s*Req ID\s*\|.*\|.*\|/i.test(content);
    
    if (hasMatrix) {
      results.push({
        rule: 'SPEC-4',
        description: 'Traceability matrix exists with proper format',
        status: 'PASS',
      });
    } else {
      results.push({
        rule: 'SPEC-4',
        description: 'Traceability matrix exists with proper format',
        status: 'FAIL',
        reason: '04_TRACEABILITY.md missing Req ID table format',
      });
    }
  }

  // Check 6: P0 Completion Declaration Rules exist in P0_RUNTIME_GUARANTEE.md
  const p0SpecDir = path.join(projectRoot, 'docs', 'spec');
  const p0SpecPath = path.join(p0SpecDir, 'P0_RUNTIME_GUARANTEE.md');
  if (fs.existsSync(p0SpecPath)) {
    const p0Content = fs.readFileSync(p0SpecPath, 'utf-8');

    // Check P0-6: Stale Notification Mixing
    const hasP0_6 = /P0-6.*Stale Notification/i.test(p0Content);
    results.push({
      rule: 'SPEC-P0-6',
      description: 'P0-6 Stale Notification Mixing spec exists',
      status: hasP0_6 ? 'PASS' : 'FAIL',
      reason: hasP0_6 ? undefined : 'P0_RUNTIME_GUARANTEE.md missing P0-6 Stale Notification section',
    });

    // Check P0 Completion Declaration Rules
    const REQUIRED_COMPLETION_KEYS = ['verdict', 'violations', 'sessionCount', 'staleFiltered', 'totalChunks', 'evidencePath'];
    const hasCompletionSection = /Completion Declaration Rules/i.test(p0Content);
    const hasAllKeys = REQUIRED_COMPLETION_KEYS.every(key => p0Content.includes(key));
    const hasAmbiguousBan = /[Aa]mbiguous.*forbidden|曖昧.*禁止/i.test(p0Content);

    const completionPass = hasCompletionSection && hasAllKeys && hasAmbiguousBan;
    results.push({
      rule: 'SPEC-P0-COMPLETION',
      description: 'P0 Completion Declaration Rules (fail-closed format)',
      status: completionPass ? 'PASS' : 'FAIL',
      reason: completionPass ? undefined : [
        !hasCompletionSection && 'Missing "Completion Declaration Rules" section',
        !hasAllKeys && `Missing required keys: ${REQUIRED_COMPLETION_KEYS.filter(k => !p0Content.includes(k)).join(', ')}`,
        !hasAmbiguousBan && 'Missing ambiguous expression ban',
      ].filter(Boolean).join('; '),
    });
  } else {
    results.push({
      rule: 'SPEC-P0-6',
      description: 'P0-6 Stale Notification Mixing spec exists',
      status: 'FAIL',
      reason: 'docs/spec/P0_RUNTIME_GUARANTEE.md not found',
    });
    results.push({
      rule: 'SPEC-P0-COMPLETION',
      description: 'P0 Completion Declaration Rules (fail-closed format)',
      status: 'FAIL',
      reason: 'docs/spec/P0_RUNTIME_GUARANTEE.md not found',
    });
  }

  const passed = results.every(r => r.status === 'PASS');

  return {
    passed,
    results,
    missingChapters,
    incompleteChapters,
  };
}

// -------------------------------------------------------------------
// Main execution
// -------------------------------------------------------------------
if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const result = checkSpecCoverage(projectRoot);

  console.log('\n=== Spec Coverage Gate Diagnostic Check ===\n');

  for (const r of result.results) {
    const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[SKIP]';
    console.log(`${icon} ${r.rule}: ${r.description}`);
    if (r.reason) {
      console.log(`       Reason: ${r.reason}`);
    }
  }

  if (result.missingChapters.length > 0) {
    console.log(`\nMissing Chapters: ${result.missingChapters.join(', ')}`);
  }

  console.log(`\nOverall: ${result.passed ? 'ALL PASS' : 'REJECTED'}`);

  if (!result.passed) {
    console.log('\n[REJECT] Spec coverage gate failed. Create missing specifications.');
    console.log('Hint: Run "ls docs/specs/" to see existing specs.');
  }

  process.exit(result.passed ? 0 : 1);
}
