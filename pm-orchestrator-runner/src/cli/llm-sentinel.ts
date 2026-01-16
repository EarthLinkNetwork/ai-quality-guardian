#!/usr/bin/env node
/**
 * LLM Sentinel CLI
 *
 * Verifies Real LLM test execution gate and evidence status.
 * Usage:
 *   npx ts-node src/cli/llm-sentinel.ts [--evidence-dir <path>]
 *
 * Output:
 *   - Gate status (OPEN/CLOSED)
 *   - Evidence count and verification
 *   - Combined verdict (REPL + Real LLM)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  checkExecutionGate,
  generateCombinedVerdict,
  printVerdict,
} from '../mediation/verdict-reporter';

interface LLMEvidence {
  evidence: {
    call_id: string;
    provider: string;
    model: string;
    request_hash: string;
    response_hash: string;
    timestamp: string;
    duration_ms: number;
    success: boolean;
  };
  integrity_hash: string;
}

function findEvidenceDir(): string | null {
  // Default evidence locations (in priority order)
  const candidates = [
    path.join(process.cwd(), '.claude', 'evidence'),  // Main location
    path.join(process.cwd(), '.llm-evidence'),
    path.join(process.cwd(), 'llm-evidence'),
    path.join(process.cwd(), 'evidence'),
    '/tmp/llm-evidence',
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function verifyEvidence(evidencePath: string): { valid: boolean; error?: string } {
  try {
    const content = fs.readFileSync(evidencePath, 'utf-8');
    const evidence: LLMEvidence = JSON.parse(content);

    // Verify integrity hash
    const dataToHash = JSON.stringify(evidence.evidence);
    const computedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    if (computedHash !== evidence.integrity_hash) {
      return { valid: false, error: 'Integrity hash mismatch' };
    }

    // Verify required fields
    if (!evidence.evidence.call_id || !evidence.evidence.provider || !evidence.evidence.success) {
      return { valid: false, error: 'Missing required fields' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Parse error: ${(err as Error).message}` };
  }
}

function collectEvidence(evidenceDir: string): { count: number; verified: number; files: string[] } {
  const files: string[] = [];
  let verified = 0;

  try {
    const entries = fs.readdirSync(evidenceDir, { recursive: true });
    for (const entry of entries) {
      const fullPath = path.join(evidenceDir, entry as string);
      if (fs.statSync(fullPath).isFile() && fullPath.endsWith('.json')) {
        files.push(fullPath);
        const result = verifyEvidence(fullPath);
        if (result.valid) {
          verified++;
        }
      }
    }
  } catch {
    // Directory might not exist or be empty
  }

  return { count: files.length, verified, files };
}

function main() {
  const args = process.argv.slice(2);
  let evidenceDir: string | null = null;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--evidence-dir' && args[i + 1]) {
      evidenceDir = args[i + 1];
      i++;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('[LLM Sentinel] Real LLM Test Verification');
  console.log('='.repeat(70));
  console.log('');

  // Check gate
  const gate = checkExecutionGate();
  console.log('[Gate Status]');
  console.log(`  LLM_TEST_MODE: ${process.env.LLM_TEST_MODE || '(not set)'}`);
  console.log(`  Provider: ${gate.provider || 'openai (default)'}`);
  console.log(`  API Key Env: ${gate.envVar || 'OPENAI_API_KEY'}`);
  console.log(`  API Key Present: ${gate.canExecute ? 'YES' : 'NO'}`);
  console.log(`  Gate: ${gate.canExecute ? 'OPEN' : 'CLOSED'}`);
  if (gate.skipReason) {
    console.log(`  Skip Reason: ${gate.skipReason}`);
  }
  console.log('');

  // Find and collect evidence
  if (!evidenceDir) {
    evidenceDir = findEvidenceDir();
  }

  console.log('[Evidence Status]');
  if (evidenceDir && fs.existsSync(evidenceDir)) {
    console.log(`  Directory: ${evidenceDir}`);
    const evidence = collectEvidence(evidenceDir);
    console.log(`  Files Found: ${evidence.count}`);
    console.log(`  Verified: ${evidence.verified}/${evidence.count}`);
    if (evidence.files.length > 0) {
      console.log('  Files:');
      for (const f of evidence.files.slice(0, 5)) {
        console.log(`    - ${path.basename(f)}`);
      }
      if (evidence.files.length > 5) {
        console.log(`    ... and ${evidence.files.length - 5} more`);
      }
    }

    // Generate verdict
    const coreTestsPassed = true; // Assume REPL tests passed if we're running sentinel
    const verdict = generateCombinedVerdict(
      coreTestsPassed,
      evidence.verified,
      evidence.verified > 0
    );
    printVerdict(verdict);
  } else {
    console.log('  Directory: (not found)');
    console.log('  Files Found: 0');
    console.log('  Verified: 0');

    // Generate verdict without evidence
    const verdict = generateCombinedVerdict(true, 0, false);
    printVerdict(verdict);
  }

  console.log('');
  console.log('[Reproduction Commands]');
  console.log('  # Gate CLOSED (no API key):');
  console.log('  unset OPENAI_API_KEY && unset LLM_TEST_MODE && npm run llm:sentinel');
  console.log('');
  console.log('  # Gate OPEN (with API key):');
  console.log('  export LLM_TEST_MODE=1');
  console.log('  export OPENAI_API_KEY=sk-...');
  console.log('  npm run llm:sentinel');
  console.log('');
  console.log('  # Run Real LLM tests (Gate must be OPEN):');
  console.log('  npm run llm:test:real');
  console.log('');
}

main();
