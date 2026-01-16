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
export declare function checkExecutionGate(): ExecutionGate;
/**
 * Generate REPL verdict (based on core test pass rate)
 */
export declare function generateREPLVerdict(coreTestsPassed: boolean): VerdictResult;
/**
 * Generate Real LLM verdict (requires gate open + evidence)
 */
export declare function generateRealLLMVerdict(gate: ExecutionGate, evidenceCount?: number, evidenceVerified?: boolean): VerdictResult;
/**
 * Generate combined verdict with formatted output
 */
export declare function generateCombinedVerdict(coreTestsPassed: boolean, evidenceCount?: number, evidenceVerified?: boolean): CombinedVerdict;
/**
 * Format verdict summary for console output
 */
export declare function formatVerdictSummary(repl: VerdictResult, real_llm: VerdictResult): string;
/**
 * Print verdict to console
 */
export declare function printVerdict(verdict: CombinedVerdict): void;
//# sourceMappingURL=verdict-reporter.d.ts.map