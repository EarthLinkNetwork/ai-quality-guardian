"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticRunner = exports.DiagnosticRegistry = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/**
 * Registry of diagnostic definitions.
 */
class DiagnosticRegistry {
    definitions = new Map();
    register(definition) {
        this.definitions.set(definition.id, definition);
    }
    get(id) {
        return this.definitions.get(id);
    }
    getAll() {
        return Array.from(this.definitions.values());
    }
    getByCategory(category) {
        return this.getAll().filter(d => d.category === category);
    }
    has(id) {
        return this.definitions.has(id);
    }
    count() {
        return this.definitions.size;
    }
}
exports.DiagnosticRegistry = DiagnosticRegistry;
/**
 * Diagnostic Runner - executes diagnostic definitions.
 */
class DiagnosticRunner {
    cwd;
    customStepHandlers = new Map();
    customAssertionHandlers = new Map();
    constructor(cwd) {
        this.cwd = cwd;
    }
    /**
     * Register a custom step handler.
     */
    registerStepHandler(name, handler) {
        this.customStepHandlers.set(name, handler);
    }
    /**
     * Register a custom assertion handler.
     */
    registerAssertionHandler(name, handler) {
        this.customAssertionHandlers.set(name, handler);
    }
    /**
     * Run a diagnostic definition and return results.
     */
    async run(definition) {
        const startedAt = new Date().toISOString();
        const startTime = Date.now();
        // Check preconditions
        const preconditionErrors = [];
        for (const precondition of definition.preconditions) {
            const error = this.checkPrecondition(precondition);
            if (error) {
                preconditionErrors.push(error);
            }
        }
        if (preconditionErrors.length > 0) {
            return {
                definitionId: definition.id,
                title: definition.title,
                startedAt,
                completedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                preconditionsMet: false,
                preconditionErrors,
                stepResults: [],
                assertionResults: [],
                passed: false,
                summary: `Preconditions not met: ${preconditionErrors.join('; ')}`,
            };
        }
        // Execute steps
        const stepResults = [];
        for (const step of definition.steps) {
            const result = await this.executeStep(step);
            stepResults.push(result);
        }
        // Evaluate assertions
        const assertionResults = [];
        for (const assertion of definition.assertions) {
            const stepResult = stepResults.find(s => s.stepId === assertion.stepId);
            const result = this.evaluateAssertion(assertion, stepResult);
            assertionResults.push(result);
        }
        // Determine overall pass/fail
        const hasErrors = assertionResults.some(a => !a.passed && a.assertion.severity === 'error');
        const hasWarnings = assertionResults.some(a => !a.passed && a.assertion.severity === 'warning');
        const passed = !hasErrors;
        // Build summary
        const totalAssertions = assertionResults.length;
        const passedAssertions = assertionResults.filter(a => a.passed).length;
        const failedErrors = assertionResults.filter(a => !a.passed && a.assertion.severity === 'error').length;
        const failedWarnings = assertionResults.filter(a => !a.passed && a.assertion.severity === 'warning').length;
        let summary = `${passedAssertions}/${totalAssertions} assertions passed`;
        if (failedErrors > 0)
            summary += `, ${failedErrors} errors`;
        if (failedWarnings > 0)
            summary += `, ${failedWarnings} warnings`;
        const completedAt = new Date().toISOString();
        return {
            definitionId: definition.id,
            title: definition.title,
            startedAt,
            completedAt,
            durationMs: Date.now() - startTime,
            preconditionsMet: true,
            preconditionErrors: [],
            stepResults,
            assertionResults,
            passed,
            summary,
        };
    }
    /**
     * Simple glob implementation using fs (avoids external dependency).
     */
    simpleGlob(cwd, pattern) {
        const results = [];
        const isRecursive = pattern.includes('**');
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*\*\//g, '(.+/)?')
            .replace(/\*/g, '[^/]*')
            .replace(/\./g, '\\.')
            .replace(/\?/g, '[^/]');
        const regex = new RegExp(`^${regexPattern}$`);
        const walk = (dir, prefix) => {
            let entries;
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const entry of entries) {
                const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
                if (entry.isDirectory() && isRecursive) {
                    walk(path.join(dir, entry.name), rel);
                }
                else if (entry.isFile() && regex.test(rel)) {
                    results.push(rel);
                }
            }
        };
        walk(cwd, '');
        return results.sort();
    }
    /**
     * Check a single precondition.
     */
    checkPrecondition(precondition) {
        const resolvedTarget = path.isAbsolute(precondition.target)
            ? precondition.target
            : path.join(this.cwd, precondition.target);
        switch (precondition.type) {
            case 'file_exists': {
                if (!fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isFile()) {
                    return `File not found: ${precondition.target} (${precondition.description})`;
                }
                return null;
            }
            case 'dir_exists': {
                if (!fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isDirectory()) {
                    return `Directory not found: ${precondition.target} (${precondition.description})`;
                }
                return null;
            }
            case 'command_available': {
                try {
                    (0, child_process_1.execSync)(`which ${precondition.target}`, { encoding: 'utf-8', timeout: 5000 });
                    return null;
                }
                catch {
                    return `Command not available: ${precondition.target} (${precondition.description})`;
                }
            }
            default:
                return null;
        }
    }
    /**
     * Execute a single step.
     */
    async executeStep(step) {
        const startTime = Date.now();
        const action = step.action;
        try {
            switch (action.type) {
                case 'glob': {
                    const cwd = action.cwd ? path.resolve(this.cwd, action.cwd) : this.cwd;
                    const files = this.simpleGlob(cwd, action.pattern);
                    return {
                        stepId: step.id,
                        success: true,
                        output: files.join('\n'),
                        durationMs: Date.now() - startTime,
                    };
                }
                case 'exec': {
                    const cwd = action.cwd ? path.resolve(this.cwd, action.cwd) : this.cwd;
                    const timeout = action.timeout || 30000;
                    try {
                        const output = (0, child_process_1.execSync)(action.command, {
                            cwd,
                            encoding: 'utf-8',
                            timeout,
                            stdio: ['pipe', 'pipe', 'pipe'],
                        });
                        return {
                            stepId: step.id,
                            success: true,
                            output: output.trim(),
                            exitCode: 0,
                            durationMs: Date.now() - startTime,
                        };
                    }
                    catch (execErr) {
                        const err = execErr;
                        return {
                            stepId: step.id,
                            success: false,
                            output: (err.stdout || '') + (err.stderr || ''),
                            exitCode: err.status || 1,
                            durationMs: Date.now() - startTime,
                            error: err.message,
                        };
                    }
                }
                case 'read_file': {
                    const filePath = path.isAbsolute(action.path)
                        ? action.path
                        : path.join(this.cwd, action.path);
                    if (!fs.existsSync(filePath)) {
                        return {
                            stepId: step.id,
                            success: false,
                            output: '',
                            durationMs: Date.now() - startTime,
                            error: `File not found: ${action.path}`,
                        };
                    }
                    const content = fs.readFileSync(filePath, 'utf-8');
                    return {
                        stepId: step.id,
                        success: true,
                        output: content,
                        durationMs: Date.now() - startTime,
                    };
                }
                case 'compare': {
                    const leftPath = path.isAbsolute(action.left) ? action.left : path.join(this.cwd, action.left);
                    const rightPath = path.isAbsolute(action.right) ? action.right : path.join(this.cwd, action.right);
                    switch (action.mode) {
                        case 'exists': {
                            const leftExists = fs.existsSync(leftPath);
                            const rightExists = fs.existsSync(rightPath);
                            const match = leftExists === rightExists;
                            return {
                                stepId: step.id,
                                success: match,
                                output: `left(${leftExists}) vs right(${rightExists})`,
                                durationMs: Date.now() - startTime,
                                error: match ? undefined : `Existence mismatch: ${action.left}(${leftExists}) vs ${action.right}(${rightExists})`,
                            };
                        }
                        case 'content': {
                            if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) {
                                return {
                                    stepId: step.id,
                                    success: false,
                                    output: '',
                                    durationMs: Date.now() - startTime,
                                    error: `Cannot compare: file(s) missing`,
                                };
                            }
                            const leftContent = fs.readFileSync(leftPath, 'utf-8');
                            const rightContent = fs.readFileSync(rightPath, 'utf-8');
                            const match = leftContent === rightContent;
                            return {
                                stepId: step.id,
                                success: match,
                                output: match ? 'identical' : 'different',
                                durationMs: Date.now() - startTime,
                                error: match ? undefined : `Content differs: ${action.left} vs ${action.right}`,
                            };
                        }
                        case 'mtime': {
                            if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) {
                                return {
                                    stepId: step.id,
                                    success: false,
                                    output: '',
                                    durationMs: Date.now() - startTime,
                                    error: `Cannot compare: file(s) missing`,
                                };
                            }
                            const leftMtime = fs.statSync(leftPath).mtimeMs;
                            const rightMtime = fs.statSync(rightPath).mtimeMs;
                            const leftNewer = leftMtime >= rightMtime;
                            return {
                                stepId: step.id,
                                success: true,
                                output: `left(${leftMtime}) vs right(${rightMtime}), left_newer=${leftNewer}`,
                                durationMs: Date.now() - startTime,
                            };
                        }
                        default:
                            return {
                                stepId: step.id,
                                success: false,
                                output: '',
                                durationMs: Date.now() - startTime,
                                error: `Unknown compare mode`,
                            };
                    }
                }
                case 'custom': {
                    const handler = this.customStepHandlers.get(action.handler);
                    if (!handler) {
                        return {
                            stepId: step.id,
                            success: false,
                            output: '',
                            durationMs: Date.now() - startTime,
                            error: `Custom handler not found: ${action.handler}`,
                        };
                    }
                    const result = await handler(this.cwd);
                    return {
                        stepId: step.id,
                        success: true,
                        output: result.output,
                        exitCode: result.exitCode,
                        durationMs: Date.now() - startTime,
                    };
                }
                default:
                    return {
                        stepId: step.id,
                        success: false,
                        output: '',
                        durationMs: Date.now() - startTime,
                        error: `Unknown action type`,
                    };
            }
        }
        catch (err) {
            return {
                stepId: step.id,
                success: false,
                output: '',
                durationMs: Date.now() - startTime,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    /**
     * Evaluate a single assertion against step output.
     */
    evaluateAssertion(assertion, stepResult) {
        if (!stepResult) {
            return {
                assertion,
                passed: false,
                message: `Step '${assertion.stepId}' not found`,
            };
        }
        const output = stepResult.output;
        switch (assertion.type) {
            case 'not_empty': {
                const passed = output.trim().length > 0;
                return {
                    assertion,
                    passed,
                    actual: output.length,
                    message: passed ? assertion.message : `${assertion.message} (output was empty)`,
                };
            }
            case 'matches': {
                const regex = new RegExp(assertion.expected);
                const passed = regex.test(output);
                return {
                    assertion,
                    passed,
                    actual: output.slice(0, 100),
                    message: passed ? assertion.message : `${assertion.message} (no match for /${assertion.expected}/)`,
                };
            }
            case 'count_eq': {
                const lines = output.trim().split('\n').filter(l => l.length > 0);
                const count = lines.length;
                const expected = assertion.expected;
                const passed = count === expected;
                return {
                    assertion,
                    passed,
                    actual: count,
                    message: passed ? assertion.message : `${assertion.message} (expected ${expected}, got ${count})`,
                };
            }
            case 'count_gt': {
                const lines = output.trim().split('\n').filter(l => l.length > 0);
                const count = lines.length;
                const expected = assertion.expected;
                const passed = count > expected;
                return {
                    assertion,
                    passed,
                    actual: count,
                    message: passed ? assertion.message : `${assertion.message} (expected >${expected}, got ${count})`,
                };
            }
            case 'count_lt': {
                const lines = output.trim().split('\n').filter(l => l.length > 0);
                const count = lines.length;
                const expected = assertion.expected;
                const passed = count < expected;
                return {
                    assertion,
                    passed,
                    actual: count,
                    message: passed ? assertion.message : `${assertion.message} (expected <${expected}, got ${count})`,
                };
            }
            case 'exit_code': {
                const expected = assertion.expected;
                const passed = stepResult.exitCode === expected;
                return {
                    assertion,
                    passed,
                    actual: stepResult.exitCode,
                    message: passed ? assertion.message : `${assertion.message} (expected exit ${expected}, got ${stepResult.exitCode})`,
                };
            }
            case 'contains': {
                const needle = assertion.expected;
                const passed = output.includes(needle);
                return {
                    assertion,
                    passed,
                    actual: output.slice(0, 100),
                    message: passed ? assertion.message : `${assertion.message} (output does not contain '${needle}')`,
                };
            }
            case 'custom': {
                const handler = this.customAssertionHandlers.get(assertion.message);
                if (!handler) {
                    return {
                        assertion,
                        passed: false,
                        message: `Custom assertion handler not found: ${assertion.message}`,
                    };
                }
                const result = handler(output, assertion.expected);
                return {
                    assertion,
                    passed: result.passed,
                    actual: result.actual,
                    message: assertion.message,
                };
            }
            default:
                return {
                    assertion,
                    passed: false,
                    message: `Unknown assertion type`,
                };
        }
    }
}
exports.DiagnosticRunner = DiagnosticRunner;
//# sourceMappingURL=runner.js.map