/**
 * Docs-First Gate Diagnostic Check
 *
 * Verifies fail-closed documentation requirements:
 * 1. All 5 required docs exist
 * 2. ACCEPTANCE.md has numbered AC-N format
 * 3. EVIDENCE.md references all AC numbers with actual execution results
 *
 * Run: npx ts-node diagnostics/docs-first.check.ts
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks fail (REJECT)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface CheckResult {
  rule: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  reason?: string;
}

export interface DocsFirstResult {
  passed: boolean;
  results: CheckResult[];
  acNumbers: string[];
  evidenceAcRefs: string[];
  missingEvidence: string[];
}

const REQUIRED_DOCS = [
  'docs/SPEC.md',
  'docs/TASK_PLAN.md',
  'docs/TEST_PLAN.md',
  'docs/ACCEPTANCE.md',
  'docs/EVIDENCE.md',
];

// Patterns that indicate "declaration only" without actual execution results
const DECLARATION_ONLY_PATTERNS = [
  /^[\s\-\*]*完了$/m,
  /^[\s\-\*]*done$/im,
  /^[\s\-\*]*実装済み$/m,
  /^[\s\-\*]*implemented$/im,
  /^[\s\-\*]*動くはず$/m,
  /^[\s\-\*]*should work$/im,
  /^[\s\-\*]*works$/im,
  /^[\s\-\*]*ok$/im,
  /^[\s\-\*]*pass$/im,
  /^[\s\-\*]*passed$/im,
];

// Patterns that indicate actual evidence (command output, URL, screenshot)
const EVIDENCE_PATTERNS = [
  /```[\s\S]*?```/,  // Code block (command output)
  /https?:\/\/[^\s]+/,  // URL
  /!\[.*?\]\(.*?\)/,  // Image reference (screenshot)
  /\$ .+/,  // Command execution
  /output:/i,  // Output section
  /result:/i,  // Result section
  /log:/i,  // Log section
  /screenshot/i,  // Screenshot reference
  /\.png|\.jpg|\.gif/i,  // Image file reference
];

export function extractAcNumbers(content: string): string[] {
  const pattern = /\bAC-(\d+)\b/gi;
  const matches = content.matchAll(pattern);
  const numbers = new Set<string>();
  for (const match of matches) {
    numbers.add('AC-' + match[1]);
  }
  return Array.from(numbers).sort((a, b) => {
    const numA = parseInt(a.replace('AC-', ''), 10);
    const numB = parseInt(b.replace('AC-', ''), 10);
    return numA - numB;
  });
}

export function hasActualEvidence(section: string): boolean {
  // Check if section has actual evidence patterns
  for (const pattern of EVIDENCE_PATTERNS) {
    if (pattern.test(section)) {
      return true;
    }
  }
  return false;
}

export function isDeclarationOnly(section: string): boolean {
  // Check if section is just a declaration without evidence
  const trimmed = section.trim();
  for (const pattern of DECLARATION_ONLY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  // If the section is very short (less than 50 chars) and has no evidence patterns, it's likely declaration only
  if (trimmed.length < 50 && !hasActualEvidence(section)) {
    return true;
  }
  return false;
}

export function extractEvidenceForAc(evidenceContent: string): Map<string, string> {
  const acSections = new Map<string, string>();
  
  // Split by AC-N headers, but ignore those inside code blocks
  const lines = evidenceContent.split('\n');
  let currentAc: string | null = null;
  let currentSection: string[] = [];
  let inCodeBlock = false;
  
  for (const line of lines) {
    // Track code block state
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (currentAc) {
        currentSection.push(line);
      }
      continue;
    }
    
    // Only match AC headers outside of code blocks
    // Match: ## AC-1, ### AC-1, **AC-1**, AC-1:
    // But only at the start of a line (top-level section headers)
    const acMatch = !inCodeBlock && line.match(/^(#{1,3})\s+(AC-\d+)\b/i);
    
    if (acMatch) {
      // Save previous section
      if (currentAc) {
        acSections.set(currentAc, currentSection.join('\n'));
      }
      currentAc = acMatch[2].toUpperCase();
      currentSection = [line];
    } else if (currentAc) {
      currentSection.push(line);
    }
  }
  
  // Save last section
  if (currentAc) {
    acSections.set(currentAc, currentSection.join('\n'));
  }
  
  return acSections;
}

export function checkDocsFirst(projectRoot: string): DocsFirstResult {
  const results: CheckResult[] = [];
  let acNumbers: string[] = [];
  let evidenceAcRefs: string[] = [];
  const missingEvidence: string[] = [];

  // Check 1: All required docs exist
  const missingDocs: string[] = [];
  for (const doc of REQUIRED_DOCS) {
    const fullPath = path.join(projectRoot, doc);
    if (!fs.existsSync(fullPath)) {
      missingDocs.push(doc);
    }
  }

  if (missingDocs.length > 0) {
    results.push({
      rule: 'DOCS-1',
      description: 'Required documentation files exist',
      status: 'FAIL',
      reason: 'Missing: ' + missingDocs.join(', '),
    });
    return {
      passed: false,
      results,
      acNumbers: [],
      evidenceAcRefs: [],
      missingEvidence: missingDocs,
    };
  }

  results.push({
    rule: 'DOCS-1',
    description: 'Required documentation files exist',
    status: 'PASS',
  });

  // Check 2: ACCEPTANCE.md has AC-N format
  const acceptancePath = path.join(projectRoot, 'docs/ACCEPTANCE.md');
  const acceptanceContent = fs.readFileSync(acceptancePath, 'utf-8');
  acNumbers = extractAcNumbers(acceptanceContent);

  if (acNumbers.length === 0) {
    results.push({
      rule: 'DOCS-2',
      description: 'ACCEPTANCE.md has numbered acceptance criteria (AC-N)',
      status: 'FAIL',
      reason: 'No AC-N format criteria found. Use format: AC-1, AC-2, etc.',
    });
    return {
      passed: false,
      results,
      acNumbers: [],
      evidenceAcRefs: [],
      missingEvidence: ['AC numbers in ACCEPTANCE.md'],
    };
  }

  results.push({
    rule: 'DOCS-2',
    description: 'ACCEPTANCE.md has numbered acceptance criteria (AC-N)',
    status: 'PASS',
    reason: 'Found: ' + acNumbers.join(', '),
  });

  // Check 3: EVIDENCE.md references all AC numbers
  const evidencePath = path.join(projectRoot, 'docs/EVIDENCE.md');
  const evidenceContent = fs.readFileSync(evidencePath, 'utf-8');
  evidenceAcRefs = extractAcNumbers(evidenceContent);

  const missingAcRefs = acNumbers.filter(ac => !evidenceAcRefs.includes(ac));
  if (missingAcRefs.length > 0) {
    results.push({
      rule: 'DOCS-3',
      description: 'EVIDENCE.md references all acceptance criteria',
      status: 'FAIL',
      reason: 'Missing evidence for: ' + missingAcRefs.join(', '),
    });
    return {
      passed: false,
      results,
      acNumbers,
      evidenceAcRefs,
      missingEvidence: missingAcRefs,
    };
  }

  results.push({
    rule: 'DOCS-3',
    description: 'EVIDENCE.md references all acceptance criteria',
    status: 'PASS',
  });

  // Check 4: Evidence is not just declarations
  const evidenceSections = extractEvidenceForAc(evidenceContent);
  const declarationOnlyAcs: string[] = [];

  for (const ac of acNumbers) {
    const section = evidenceSections.get(ac);
    if (!section || isDeclarationOnly(section)) {
      declarationOnlyAcs.push(ac);
    } else if (!hasActualEvidence(section)) {
      declarationOnlyAcs.push(ac);
    }
  }

  if (declarationOnlyAcs.length > 0) {
    results.push({
      rule: 'DOCS-4',
      description: 'Evidence contains actual execution results (not just declarations)',
      status: 'FAIL',
      reason: 'Declaration-only evidence for: ' + declarationOnlyAcs.join(', ') + '. Need command output, URL, or screenshot.',
    });
    return {
      passed: false,
      results,
      acNumbers,
      evidenceAcRefs,
      missingEvidence: declarationOnlyAcs,
    };
  }

  results.push({
    rule: 'DOCS-4',
    description: 'Evidence contains actual execution results (not just declarations)',
    status: 'PASS',
  });

  return {
    passed: true,
    results,
    acNumbers,
    evidenceAcRefs,
    missingEvidence: [],
  };
}

// -------------------------------------------------------------------
// Main execution
// -------------------------------------------------------------------
if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const result = checkDocsFirst(projectRoot);

  console.log('\n=== Docs-First Gate Diagnostic Check ===\n');

  for (const r of result.results) {
    const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[SKIP]';
    console.log(icon + ' ' + r.rule + ': ' + r.description);
    if (r.reason) {
      console.log('       Reason: ' + r.reason);
    }
  }

  if (result.acNumbers.length > 0) {
    console.log('\nAcceptance Criteria: ' + result.acNumbers.join(', '));
  }

  if (result.missingEvidence.length > 0) {
    console.log('\nMissing Evidence: ' + result.missingEvidence.join(', '));
  }

  console.log('\nOverall: ' + (result.passed ? 'ALL PASS' : 'REJECTED'));

  if (!result.passed) {
    console.log('\n[REJECT] Docs-first gate failed. Fix the above issues before proceeding.');
    console.log('Hint: Create missing docs with proper AC-N format and provide actual evidence.');
  }

  process.exit(result.passed ? 0 : 1);
}
