/**
 * E2E Test: Docs-First Gate
 * 
 * Demonstrates REJECT -> FIX -> PASS flow
 * Log output: .tmp/e2e-docs-first.log
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkDocsFirst } from '../diagnostics/docs-first.check';

const LOG_FILE = path.join(__dirname, '..', '.tmp', 'e2e-docs-first.log');

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = '[' + timestamp + '] ' + message;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function getFailReason(results: Array<{status: string, reason?: string}>): string {
  const failed = results.find(r => r.status === 'FAIL');
  return failed?.reason || 'Unknown';
}

async function main(): Promise<void> {
  // Ensure .tmp directory exists
  const tmpDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  
  // Clear previous log
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
  }
  
  log('E2E Test: docs-first gate started');
  
  // Create temporary test directory
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-docs-first-'));
  fs.mkdirSync(path.join(testDir, 'docs'));
  
  log('Test directory: ' + testDir);
  
  try {
    // Phase 1: Missing docs -> REJECT
    log('Phase 1: Initial state (missing docs)');
    let result = checkDocsFirst(testDir);
    if (result.passed) {
      throw new Error('Expected REJECT but got PASS');
    }
    log('  Result: REJECT - ' + getFailReason(result.results));
    
    // Phase 2: Create docs without proper AC format -> REJECT
    log('Phase 2: Created docs without AC format');
    fs.writeFileSync(path.join(testDir, 'docs/SPEC.md'), '# Spec');
    fs.writeFileSync(path.join(testDir, 'docs/TASK_PLAN.md'), '# Tasks');
    fs.writeFileSync(path.join(testDir, 'docs/TEST_PLAN.md'), '# Tests');
    fs.writeFileSync(path.join(testDir, 'docs/ACCEPTANCE.md'), '# Acceptance\nNo proper format');
    fs.writeFileSync(path.join(testDir, 'docs/EVIDENCE.md'), '# Evidence');
    
    result = checkDocsFirst(testDir);
    if (result.passed) {
      throw new Error('Expected REJECT but got PASS');
    }
    log('  Result: REJECT - ' + getFailReason(result.results));
    
    // Phase 3: Add AC format but no evidence -> REJECT
    log('Phase 3: Added AC format, no evidence');
    fs.writeFileSync(path.join(testDir, 'docs/ACCEPTANCE.md'), '# Acceptance\n## AC-1: First\n## AC-2: Second');
    
    result = checkDocsFirst(testDir);
    if (result.passed) {
      throw new Error('Expected REJECT but got PASS');
    }
    log('  Result: REJECT - ' + getFailReason(result.results));
    
    // Phase 4: Add AC references but declaration-only -> REJECT
    log('Phase 4: Added AC references, but declaration-only');
    fs.writeFileSync(path.join(testDir, 'docs/EVIDENCE.md'), '# Evidence\n## AC-1\ndone\n## AC-2\ncompleted');
    
    result = checkDocsFirst(testDir);
    if (result.passed) {
      throw new Error('Expected REJECT but got PASS');
    }
    log('  Result: REJECT - ' + getFailReason(result.results));
    
    // Phase 5: Add actual evidence -> PASS
    log('Phase 5: Added actual evidence');
    const evidenceContent = '# Evidence\n\n## AC-1\n\n```bash\n$ npm test\nAll tests passed\n```\n\n## AC-2\n\n```bash\n$ npm run lint\nNo errors found\n```\n';
    fs.writeFileSync(path.join(testDir, 'docs/EVIDENCE.md'), evidenceContent);
    
    result = checkDocsFirst(testDir);
    if (!result.passed) {
      throw new Error('Expected PASS but got REJECT: ' + getFailReason(result.results));
    }
    log('  Result: PASS - All requirements met');
    
    log('');
    log('=== RESULT: REJECT -> FIX -> PASS flow verified ===');
    log('E2E Test: PASSED');
    
  } finally {
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  
  console.log('\nLog file: ' + LOG_FILE);
}

main().catch((err) => {
  log('ERROR: ' + err.message);
  process.exit(1);
});
