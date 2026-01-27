/**
 * Diagnostic Runner
 *
 * Execution engine that reads DiagnosticDefinitions and runs them.
 * Completely generic - no problem-specific logic.
 *
 * Responsibilities:
 * - Check preconditions
 * - Execute steps in order
 * - Evaluate assertions against step outputs
 * - Collect artifacts
 * - Produce DiagnosticResult
 */
import { DiagnosticDefinition, DiagnosticResult } from './definition';
/**
 * Registry of diagnostic definitions.
 */
export declare class DiagnosticRegistry {
    private definitions;
    register(definition: DiagnosticDefinition): void;
    get(id: string): DiagnosticDefinition | undefined;
    getAll(): DiagnosticDefinition[];
    getByCategory(category: string): DiagnosticDefinition[];
    has(id: string): boolean;
    count(): number;
}
/**
 * Custom step handler function type.
 */
export type CustomStepHandler = (cwd: string) => Promise<{
    output: string;
    exitCode?: number;
}>;
/**
 * Custom assertion handler function type.
 */
export type CustomAssertionHandler = (stepOutput: string, expected?: string | number) => {
    passed: boolean;
    actual?: string | number;
};
/**
 * Diagnostic Runner - executes diagnostic definitions.
 */
export declare class DiagnosticRunner {
    private readonly cwd;
    private customStepHandlers;
    private customAssertionHandlers;
    constructor(cwd: string);
    /**
     * Register a custom step handler.
     */
    registerStepHandler(name: string, handler: CustomStepHandler): void;
    /**
     * Register a custom assertion handler.
     */
    registerAssertionHandler(name: string, handler: CustomAssertionHandler): void;
    /**
     * Run a diagnostic definition and return results.
     */
    run(definition: DiagnosticDefinition): Promise<DiagnosticResult>;
    /**
     * Simple glob implementation using fs (avoids external dependency).
     */
    private simpleGlob;
    /**
     * Check a single precondition.
     */
    private checkPrecondition;
    /**
     * Execute a single step.
     */
    private executeStep;
    /**
     * Evaluate a single assertion against step output.
     */
    private evaluateAssertion;
}
//# sourceMappingURL=runner.d.ts.map