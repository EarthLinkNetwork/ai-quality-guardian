/**
 * Verdict Reporter
 *
 * Separates verdicts for different test categories:
 * - REPL: COMPLETE if core tests pass (no API key required)
 * - Real LLM: COMPLETE only if:
 *   1. GATE: OPEN (LLM_TEST_MODE=1 + API key present)
 *   2. At least one successful LLM evidence exists
 *   3. Evidence integrity verified
 *
 * This ensures honest reporting - Real LLM cannot be marked COMPLETE
 * without actual API calls being made and verified.
 */

export interface VerdictResult {
  category: 'REPL' | 'REAL_LLM';
  verdict: 'COMPLETE' | 'INCOMPLETE' | 'SKIPPED';
  reason: string;
  details: {
    gate_status?: 'OPEN' | 'CLOSED';
    real_calls_made: boolean;
    evidence_count?: number;
    evidence_verified?: boolean;
    skip_reason?: string;
  };
}

export interface CombinedVerdict {
  repl: VerdictResult;
  real_llm: VerdictResult;
  summary: string;
}

export interface ExecutionGate {
  canExecute: boolean;
  skipReason?: string;
  provider?: string;
  envVar?: string;
}

/**
 * Check execution gate for Real LLM tests
 */
export function checkExecutionGate(): ExecutionGate {
  // Gate 1: LLM_TEST_MODE must be set to 1
  if (process.env.LLM_TEST_MODE !== '1') {
    return {
      canExecute: false,
      skipReason: 'LLM_TEST_MODE is not set to 1',
    };
  }

  // Gate 2: API key must be present
  const provider = process.env.LLM_PROVIDER || 'openai';
  const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';

  if (!process.env[envVar]) {
    return {
      canExecute: false,
      skipReason: `${envVar} is not set`,
      provider,
      envVar,
    };
  }

  return {
    canExecute: true,
    provider,
    envVar,
  };
}

/**
 * Generate REPL verdict (based on core test pass rate)
 */
export function generateREPLVerdict(coreTestsPassed: boolean): VerdictResult {
  return {
    category: 'REPL',
    verdict: coreTestsPassed ? 'COMPLETE' : 'INCOMPLETE',
    reason: coreTestsPassed
      ? 'Core REPL tests passed'
      : 'Core REPL tests failed',
    details: {
      real_calls_made: false,
    },
  };
}

/**
 * Generate Real LLM verdict (requires gate open + evidence)
 */
export function generateRealLLMVerdict(
  gate: ExecutionGate,
  evidenceCount: number = 0,
  evidenceVerified: boolean = false
): VerdictResult {
  // Gate closed = INCOMPLETE (Fail-Closed: no execution = cannot assert completion)
  if (!gate.canExecute) {
    return {
      category: 'REAL_LLM',
      verdict: 'INCOMPLETE',
      reason: `Real LLM tests not executed (gate closed)`,
      details: {
        gate_status: 'CLOSED',
        real_calls_made: false,
        evidence_count: 0,
        evidence_verified: false,
        skip_reason: gate.skipReason,
      },
    };
  }

  // Gate open but no evidence = INCOMPLETE
  if (evidenceCount === 0) {
    return {
      category: 'REAL_LLM',
      verdict: 'INCOMPLETE',
      reason: 'Gate OPEN but no LLM evidence found',
      details: {
        gate_status: 'OPEN',
        real_calls_made: false,
        evidence_count: 0,
        evidence_verified: false,
      },
    };
  }

  // Gate open + evidence exists but not verified = INCOMPLETE
  if (!evidenceVerified) {
    return {
      category: 'REAL_LLM',
      verdict: 'INCOMPLETE',
      reason: 'Evidence exists but integrity verification failed',
      details: {
        gate_status: 'OPEN',
        real_calls_made: true,
        evidence_count: evidenceCount,
        evidence_verified: false,
      },
    };
  }

  // Gate open + evidence verified = COMPLETE
  return {
    category: 'REAL_LLM',
    verdict: 'COMPLETE',
    reason: 'Real LLM API calls made and evidence verified',
    details: {
      gate_status: 'OPEN',
      real_calls_made: true,
      evidence_count: evidenceCount,
      evidence_verified: true,
    },
  };
}

/**
 * Generate combined verdict with formatted output
 */
export function generateCombinedVerdict(
  coreTestsPassed: boolean,
  evidenceCount: number = 0,
  evidenceVerified: boolean = false
): CombinedVerdict {
  const gate = checkExecutionGate();
  const repl = generateREPLVerdict(coreTestsPassed);
  const real_llm = generateRealLLMVerdict(gate, evidenceCount, evidenceVerified);

  return {
    repl,
    real_llm,
    summary: formatVerdictSummary(repl, real_llm),
  };
}

/**
 * Format verdict summary for console output
 */
export function formatVerdictSummary(repl: VerdictResult, real_llm: VerdictResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('=' .repeat(70));
  lines.push('[Verdict Report] Test Execution Summary');
  lines.push('=' .repeat(70));
  lines.push('');

  // REPL verdict
  lines.push(`[REPL Enhancement]`);
  lines.push(`  VERDICT: ${repl.verdict}`);
  lines.push(`  Reason: ${repl.reason}`);
  lines.push('');

  // Real LLM verdict
  lines.push(`[Real LLM Mediation]`);
  lines.push(`  VERDICT: ${real_llm.verdict}`);
  lines.push(`  Reason: ${real_llm.reason}`);
  lines.push(`  GATE: ${real_llm.details.gate_status || 'N/A'}`);
  lines.push(`  REAL_CALLS_MADE: ${real_llm.details.real_calls_made}`);

  if (real_llm.details.skip_reason) {
    lines.push(`  SKIP_REASON: ${real_llm.details.skip_reason}`);
  }

  if (real_llm.details.evidence_count !== undefined) {
    lines.push(`  EVIDENCE_COUNT: ${real_llm.details.evidence_count}`);
  }

  if (real_llm.details.evidence_verified !== undefined) {
    lines.push(`  EVIDENCE_VERIFIED: ${real_llm.details.evidence_verified}`);
  }

  lines.push('');
  lines.push('=' .repeat(70));

  return lines.join('\n');
}

/**
 * Print verdict to console
 */
export function printVerdict(verdict: CombinedVerdict): void {
  console.log(verdict.summary);
}
