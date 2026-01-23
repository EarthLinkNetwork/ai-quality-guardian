"use strict";
/**
 * Review Loop Implementation
 *
 * Per spec 25_REVIEW_LOOP.md: Automatic quality judgment with PASS/REJECT/RETRY
 *
 * This is the core LLM Layer component that:
 * - Wraps the existing IExecutor
 * - Performs Q1-Q6 quality checks on ExecutorResult
 * - Generates modification prompts for REJECT cases
 * - Logs all REVIEW_LOOP_* events
 * - Controls iteration with max_iterations
 *
 * Design Principle:
 * - Runner is the sole completion authority (not Claude Code)
 * - Evidence-Based: File verification and output validation
 * - Fail-Closed: Unknown situations result in REJECT
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewLoopExecutorWrapper = exports.DEFAULT_REVIEW_LOOP_CONFIG = void 0;
exports.checkQ1FilesVerified = checkQ1FilesVerified;
exports.checkQ2NoTodoLeft = checkQ2NoTodoLeft;
exports.checkQ3NoOmissionMarkers = checkQ3NoOmissionMarkers;
exports.checkQ4NoIncompleteSyntax = checkQ4NoIncompleteSyntax;
exports.checkQ5EvidencePresent = checkQ5EvidencePresent;
exports.checkQ6NoEarlyTermination = checkQ6NoEarlyTermination;
exports.performQualityJudgment = performQualityJudgment;
exports.generateModificationPrompt = generateModificationPrompt;
exports.generateIssuesFromCriteria = generateIssuesFromCriteria;
// ============================================================================
// Default Configuration
// ============================================================================
/**
 * Default omission patterns
 * Per spec 25_REVIEW_LOOP.md Section 9.1
 */
const DEFAULT_OMISSION_PATTERNS = [
    /\.\.\.(?!\s*\w)/, // ... but not ... followed by word
    /\/\/\s*残り省略/,
    /\/\/\s*etc\./i,
    /\/\/\s*以下同様/,
    /\/\*\s*省略\s*\*\//,
    /\/\/\s*\.\.\./,
    /\/\/\s*remaining/i,
    /\/\/\s*and so on/i,
    /\/\/\s*続く/,
    /\/\/\s*以下略/,
];
/**
 * Default early termination patterns
 * Per spec 25_REVIEW_LOOP.md Section 9.1
 */
const DEFAULT_EARLY_TERMINATION_PATTERNS = [
    /これで完了です/,
    /以上です/,
    /完了しました/,
    /This completes/i,
    /^Done\.$/m,
    /That's all/i,
    /作業は終了です/,
    /実装完了/,
];
/**
 * TODO/FIXME patterns for Q2
 */
const TODO_PATTERNS = [
    /\bTODO\b/i,
    /\bFIXME\b/i,
    /\bTBD\b/i,
    /\bHACK\b/i,
    /\bXXX\b/,
];
/**
 * Default Review Loop configuration
 */
exports.DEFAULT_REVIEW_LOOP_CONFIG = {
    max_iterations: 3,
    retry_delay_ms: 1000,
    escalate_on_max: true,
    mandatory_criteria: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'],
    optional_criteria: [],
    omission_patterns: DEFAULT_OMISSION_PATTERNS,
    early_termination_patterns: DEFAULT_EARLY_TERMINATION_PATTERNS,
};
/**
 * Get human-readable name for quality criteria
 */
function getCriteriaName(criteriaId) {
    switch (criteriaId) {
        case 'Q1': return 'Files Verified';
        case 'Q2': return 'No TODO/FIXME';
        case 'Q3': return 'No Omission Markers';
        case 'Q4': return 'No Incomplete Syntax';
        case 'Q5': return 'Evidence Present';
        case 'Q6': return 'No Early Termination';
        case 'Q7': return 'Lint Pass';
        case 'Q8': return 'Test Pass';
        case 'Q9': return 'Build Pass';
        default: return `Criteria ${criteriaId}`;
    }
}
// ============================================================================
// Quality Criteria Checkers (Q1-Q6)
// ============================================================================
/**
 * Q1: Files Verified - Check that expected files exist on disk
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
function checkQ1FilesVerified(result) {
    // Check if any verified files exist
    const hasVerifiedFiles = result.verified_files.some(vf => vf.exists);
    // Check for unverified files (claimed but don't exist)
    const hasUnverifiedFiles = result.unverified_files.length > 0;
    if (hasUnverifiedFiles) {
        return {
            criteria_id: 'Q1',
            passed: false,
            details: `Files claimed but not verified: ${result.unverified_files.join(', ')}`,
        };
    }
    if (!hasVerifiedFiles && result.files_modified.length > 0) {
        return {
            criteria_id: 'Q1',
            passed: false,
            details: 'Files reported as modified but none verified on disk',
        };
    }
    return {
        criteria_id: 'Q1',
        passed: true,
        details: hasVerifiedFiles
            ? `${result.verified_files.filter(vf => vf.exists).length} files verified`
            : 'No files expected or modified',
    };
}
/**
 * Q2: No TODO/FIXME Left - Check for TODO markers in output
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
function checkQ2NoTodoLeft(result) {
    const output = result.output;
    const foundTodos = [];
    for (const pattern of TODO_PATTERNS) {
        const match = output.match(pattern);
        if (match) {
            foundTodos.push(match[0]);
        }
    }
    // Also check verified file content previews
    for (const vf of result.verified_files) {
        if (vf.content_preview) {
            for (const pattern of TODO_PATTERNS) {
                const match = vf.content_preview.match(pattern);
                if (match) {
                    foundTodos.push(`${match[0]} in ${vf.path}`);
                }
            }
        }
    }
    if (foundTodos.length > 0) {
        return {
            criteria_id: 'Q2',
            passed: false,
            details: `TODO/FIXME markers found: ${foundTodos.join(', ')}`,
        };
    }
    return {
        criteria_id: 'Q2',
        passed: true,
        details: 'No TODO/FIXME markers detected',
    };
}
/**
 * Q3: No Omission Markers - Check for ... or similar patterns
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
function checkQ3NoOmissionMarkers(result, patterns) {
    const output = result.output;
    const foundOmissions = [];
    for (const pattern of patterns) {
        const match = output.match(pattern);
        if (match) {
            foundOmissions.push(match[0]);
        }
    }
    // Also check verified file content previews
    for (const vf of result.verified_files) {
        if (vf.content_preview) {
            for (const pattern of patterns) {
                const match = vf.content_preview.match(pattern);
                if (match) {
                    foundOmissions.push(`${match[0]} in ${vf.path}`);
                }
            }
        }
    }
    if (foundOmissions.length > 0) {
        return {
            criteria_id: 'Q3',
            passed: false,
            details: `Omission markers found: ${foundOmissions.slice(0, 5).join(', ')}${foundOmissions.length > 5 ? '...' : ''}`,
        };
    }
    return {
        criteria_id: 'Q3',
        passed: true,
        details: 'No omission markers detected',
    };
}
/**
 * Q4: No Incomplete Syntax - Check for syntax errors
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 *
 * This is a heuristic check for common incomplete syntax patterns.
 */
function checkQ4NoIncompleteSyntax(result) {
    const output = result.output;
    const issues = [];
    // Check for unclosed brackets/braces patterns in code blocks
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = output.match(codeBlockRegex) || [];
    for (const block of codeBlocks) {
        // Simple heuristic: count opening and closing braces/brackets
        const openBraces = (block.match(/\{/g) || []).length;
        const closeBraces = (block.match(/\}/g) || []).length;
        const openBrackets = (block.match(/\[/g) || []).length;
        const closeBrackets = (block.match(/\]/g) || []).length;
        const openParens = (block.match(/\(/g) || []).length;
        const closeParens = (block.match(/\)/g) || []).length;
        if (openBraces !== closeBraces) {
            issues.push(`Unmatched braces: ${openBraces} open, ${closeBraces} close`);
        }
        if (openBrackets !== closeBrackets) {
            issues.push(`Unmatched brackets: ${openBrackets} open, ${closeBrackets} close`);
        }
        if (openParens !== closeParens) {
            issues.push(`Unmatched parentheses: ${openParens} open, ${closeParens} close`);
        }
    }
    // Check for truncated output indicators
    if (output.includes('truncated') || output.includes('cut off')) {
        issues.push('Output appears to be truncated');
    }
    if (issues.length > 0) {
        return {
            criteria_id: 'Q4',
            passed: false,
            details: issues.join('; '),
        };
    }
    return {
        criteria_id: 'Q4',
        passed: true,
        details: 'No incomplete syntax detected',
    };
}
/**
 * Q5: Evidence Present - Check that completion evidence exists
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 */
function checkQ5EvidencePresent(result) {
    // Evidence can be:
    // 1. Verified files that exist on disk
    // 2. Successful execution output
    // 3. files_modified list
    const hasVerifiedEvidence = result.verified_files.some(vf => vf.exists);
    const hasModifiedFiles = result.files_modified.length > 0;
    const hasSuccessfulExecution = result.executed && result.status === 'COMPLETE';
    if (hasVerifiedEvidence) {
        return {
            criteria_id: 'Q5',
            passed: true,
            details: `Evidence: ${result.verified_files.filter(vf => vf.exists).length} verified files`,
        };
    }
    if (hasSuccessfulExecution && hasModifiedFiles) {
        return {
            criteria_id: 'Q5',
            passed: true,
            details: `Evidence: Successful execution with ${result.files_modified.length} modified files`,
        };
    }
    if (result.status === 'NO_EVIDENCE') {
        return {
            criteria_id: 'Q5',
            passed: false,
            details: 'No evidence of completion - executor returned NO_EVIDENCE',
        };
    }
    return {
        criteria_id: 'Q5',
        passed: false,
        details: 'No verified evidence of completion',
    };
}
/**
 * Q6: No Early Termination - Check for premature completion claims
 * Per spec 25_REVIEW_LOOP.md Section 3.1
 *
 * Claude Code should not claim completion - Runner decides.
 */
function checkQ6NoEarlyTermination(result, patterns) {
    const output = result.output;
    const foundTerminations = [];
    for (const pattern of patterns) {
        const match = output.match(pattern);
        if (match) {
            foundTerminations.push(match[0]);
        }
    }
    // Early termination is only a problem if combined with lack of evidence
    // If there's solid evidence (Q5 passes), early termination phrases are OK
    const hasEvidence = result.verified_files.some(vf => vf.exists);
    if (foundTerminations.length > 0 && !hasEvidence) {
        return {
            criteria_id: 'Q6',
            passed: false,
            details: `Early termination without evidence: ${foundTerminations.join(', ')}`,
        };
    }
    return {
        criteria_id: 'Q6',
        passed: true,
        details: foundTerminations.length > 0
            ? 'Termination phrases found but evidence present'
            : 'No early termination detected',
    };
}
// ============================================================================
// Quality Judgment Engine
// ============================================================================
/**
 * Perform quality judgment on execution result
 * Per spec 25_REVIEW_LOOP.md Section 3
 *
 * @param result - Executor result to judge
 * @param config - Review Loop configuration
 * @returns Judgment result with criteria details
 */
function performQualityJudgment(result, config) {
    const criteria_results = [];
    const failed_criteria = [];
    // Handle error/blocked cases first
    if (result.status === 'ERROR') {
        return {
            judgment: 'RETRY',
            criteria_results: [{
                    criteria_id: 'Q1',
                    passed: false,
                    details: `Executor error: ${result.error}`,
                }],
            failed_criteria: ['Q1'],
        };
    }
    if (result.status === 'BLOCKED') {
        return {
            judgment: 'RETRY',
            criteria_results: [{
                    criteria_id: 'Q1',
                    passed: false,
                    details: `Executor blocked: ${result.blocked_reason}`,
                }],
            failed_criteria: ['Q1'],
        };
    }
    // Check each mandatory criteria
    for (const criteriaId of config.mandatory_criteria) {
        let result_;
        switch (criteriaId) {
            case 'Q1':
                result_ = checkQ1FilesVerified(result);
                break;
            case 'Q2':
                result_ = checkQ2NoTodoLeft(result);
                break;
            case 'Q3':
                result_ = checkQ3NoOmissionMarkers(result, config.omission_patterns);
                break;
            case 'Q4':
                result_ = checkQ4NoIncompleteSyntax(result);
                break;
            case 'Q5':
                result_ = checkQ5EvidencePresent(result);
                break;
            case 'Q6':
                result_ = checkQ6NoEarlyTermination(result, config.early_termination_patterns);
                break;
            default:
                // Q7-Q9 are optional and need external validation
                continue;
        }
        criteria_results.push(result_);
        if (!result_.passed) {
            failed_criteria.push(criteriaId);
        }
    }
    // Determine judgment
    // Per spec 25_REVIEW_LOOP.md Section 8: Fail-Closed
    if (failed_criteria.length === 0) {
        return {
            judgment: 'PASS',
            criteria_results,
            failed_criteria: [],
        };
    }
    // Check if it's a temporary/retriable error
    const isRetriable = result.status === 'INCOMPLETE' ||
        result.executor_blocked ||
        (result.error && result.error.includes('timeout'));
    return {
        judgment: isRetriable ? 'RETRY' : 'REJECT',
        criteria_results,
        failed_criteria,
    };
}
// ============================================================================
// Modification Prompt Generator
// ============================================================================
/**
 * Generate modification prompt for REJECT case
 * Per spec 25_REVIEW_LOOP.md Section 4.2
 *
 * @param originalPrompt - Original user prompt
 * @param criteriaResults - Failed criteria results
 * @param issues - Detected issues
 * @returns Modification prompt to re-submit
 */
function generateModificationPrompt(originalPrompt, criteriaResults, issues) {
    const failedCriteria = criteriaResults.filter(cr => !cr.passed);
    let prompt = `## 前回の出力に問題が検出されました\n\n`;
    prompt += `### 検出された問題\n`;
    for (const issue of issues) {
        prompt += `- **${issue.type}**: ${issue.description}\n`;
        if (issue.location) {
            prompt += `  場所: ${issue.location}\n`;
        }
        if (issue.suggestion) {
            prompt += `  提案: ${issue.suggestion}\n`;
        }
    }
    prompt += '\n';
    prompt += `### 失敗した品質基準\n`;
    for (const cr of failedCriteria) {
        prompt += `- ${cr.criteria_id}: ${cr.details}\n`;
    }
    prompt += '\n';
    prompt += `### 修正要求\n`;
    prompt += `以下の点を修正して、再度完全な実装を提供してください:\n\n`;
    prompt += `1. 省略せず全てのコードを出力する\n`;
    prompt += `2. TODO/FIXME を残さない\n`;
    prompt += `3. 全ての期待されるファイルを作成する\n`;
    prompt += `4. 「完了です」等の早期終了宣言をしない\n\n`;
    prompt += `### 前回のタスク\n`;
    prompt += `${originalPrompt}\n`;
    return prompt;
}
/**
 * Generate issues from criteria results
 */
function generateIssuesFromCriteria(criteriaResults) {
    const issues = [];
    for (const cr of criteriaResults) {
        if (cr.passed)
            continue;
        let type;
        switch (cr.criteria_id) {
            case 'Q1':
                type = 'missing_file';
                break;
            case 'Q2':
                type = 'todo_left';
                break;
            case 'Q3':
                type = 'omission';
                break;
            case 'Q4':
                type = 'syntax_error';
                break;
            case 'Q5':
                type = 'incomplete';
                break;
            case 'Q6':
                type = 'early_termination';
                break;
            default:
                type = 'incomplete';
        }
        issues.push({
            type,
            description: cr.details || `Failed criteria ${cr.criteria_id}`,
        });
    }
    return issues;
}
// ============================================================================
// Review Loop Executor Wrapper
// ============================================================================
/**
 * Review Loop Executor Wrapper
 *
 * Wraps an IExecutor to add Review Loop functionality.
 * Per spec 25_REVIEW_LOOP.md Section 7.1
 *
 * Integrates with PromptAssembler for:
 * - Template-based modification prompts (per spec/17_PROMPT_TEMPLATE.md L102-124)
 * - Customizable modification templates
 */
class ReviewLoopExecutorWrapper {
    executor;
    config;
    eventCallback;
    promptAssembler;
    conversationTracer;
    constructor(executor, config = {}, eventCallback, promptAssembler, conversationTracer) {
        this.executor = executor;
        this.config = { ...exports.DEFAULT_REVIEW_LOOP_CONFIG, ...config };
        this.eventCallback = eventCallback;
        this.promptAssembler = promptAssembler;
        this.conversationTracer = conversationTracer;
    }
    /**
     * Execute task with Review Loop
     *
     * @param task - Task to execute
     * @returns Review Loop result with iteration history
     */
    async executeWithReview(task) {
        const iterationHistory = [];
        let currentPrompt = task.prompt;
        let lastResult = null;
        // Emit REVIEW_LOOP_START event
        this.emitEvent('REVIEW_LOOP_START', {
            original_prompt: task.prompt,
            max_iterations: this.config.max_iterations,
        });
        for (let iteration = 1; iteration <= this.config.max_iterations; iteration++) {
            const iterationStartedAt = new Date().toISOString();
            const iterationIndex = iteration - 1; // 0-based for trace
            // Emit REVIEW_ITERATION_START event
            this.emitEvent('REVIEW_ITERATION_START', {
                iteration,
                started_at: iterationStartedAt,
                prompt: currentPrompt,
            });
            // Log LLM request to conversation trace
            this.conversationTracer?.logLLMRequest(currentPrompt, iterationIndex);
            // Execute with current prompt
            const currentTask = {
                ...task,
                prompt: currentPrompt,
            };
            lastResult = await this.executor.execute(currentTask);
            // Log LLM response to conversation trace
            this.conversationTracer?.logLLMResponse(lastResult.output, lastResult.status, lastResult.files_modified, iterationIndex);
            // Perform quality judgment
            const { judgment, criteria_results, failed_criteria } = performQualityJudgment(lastResult, this.config);
            // Emit QUALITY_JUDGMENT event
            this.emitEvent('QUALITY_JUDGMENT', {
                iteration,
                judgment,
                criteria_results,
                criteria_failed: failed_criteria,
                judgment_summary: `${judgment}: ${failed_criteria.length} criteria failed`,
            });
            // Log quality judgment to conversation trace
            this.conversationTracer?.logQualityJudgment(judgment, criteria_results.map(cr => ({
                id: cr.criteria_id,
                name: getCriteriaName(cr.criteria_id),
                passed: cr.passed,
                reason: cr.details,
            })), iterationIndex, `${judgment}: ${failed_criteria.length} criteria failed`);
            const iterationEndedAt = new Date().toISOString();
            // Create iteration record
            const record = {
                iteration,
                started_at: iterationStartedAt,
                ended_at: iterationEndedAt,
                judgment,
                criteria_results,
            };
            // Handle PASS
            if (judgment === 'PASS') {
                iterationHistory.push(record);
                // Log iteration end to conversation trace
                this.conversationTracer?.logIterationEnd(iterationIndex, judgment);
                // Emit REVIEW_ITERATION_END event
                this.emitEvent('REVIEW_ITERATION_END', {
                    iteration,
                    ended_at: iterationEndedAt,
                    judgment,
                });
                // Log final summary to conversation trace
                // Use 'PASS' for trace semantics (more meaningful than 'COMPLETE')
                this.conversationTracer?.logFinalSummary('PASS', iteration, lastResult.files_modified);
                // Emit REVIEW_LOOP_END event
                this.emitEvent('REVIEW_LOOP_END', {
                    total_iterations: iteration,
                    final_status: 'COMPLETE',
                    original_prompt: task.prompt,
                });
                return {
                    final_status: 'COMPLETE',
                    total_iterations: iteration,
                    iteration_history: iterationHistory,
                    final_output: lastResult,
                };
            }
            // Handle REJECT - generate modification prompt
            // Per spec/17_PROMPT_TEMPLATE.md L102-124: Use template-based modification prompt
            if (judgment === 'REJECT') {
                const issues = generateIssuesFromCriteria(criteria_results);
                // Use PromptAssembler's template if available, otherwise fall back to hardcoded
                const modificationPrompt = this.buildModificationPromptInternal(task.prompt, criteria_results, issues);
                const rejectionDetails = {
                    criteria_failed: failed_criteria,
                    issues_detected: issues,
                    modification_prompt: modificationPrompt,
                    iteration,
                };
                record.rejection_details = rejectionDetails;
                // Emit REJECTION_DETAILS event
                this.emitEvent('REJECTION_DETAILS', {
                    iteration,
                    criteria_failed: failed_criteria,
                    issues_detected: issues,
                });
                // Log rejection details to conversation trace
                this.conversationTracer?.logRejectionDetails(failed_criteria, modificationPrompt, iterationIndex);
                // Emit MODIFICATION_PROMPT event
                this.emitEvent('MODIFICATION_PROMPT', {
                    iteration,
                    modification_prompt: modificationPrompt,
                });
                // Update prompt for next iteration
                currentPrompt = modificationPrompt;
            }
            // Handle RETRY - use same prompt
            if (judgment === 'RETRY') {
                // Wait before retry
                if (iteration < this.config.max_iterations) {
                    await this.delay(this.config.retry_delay_ms);
                }
            }
            iterationHistory.push(record);
            // Log iteration end to conversation trace
            this.conversationTracer?.logIterationEnd(iterationIndex, judgment);
            // Emit REVIEW_ITERATION_END event
            this.emitEvent('REVIEW_ITERATION_END', {
                iteration,
                ended_at: iterationEndedAt,
                judgment,
            });
        }
        // Max iterations reached
        const finalStatus = this.config.escalate_on_max ? 'INCOMPLETE' : 'ERROR';
        // Log final summary to conversation trace (max iterations reached)
        // Use 'ESCALATE' for trace semantics when escalate_on_max is true
        this.conversationTracer?.logFinalSummary(this.config.escalate_on_max ? 'ESCALATE' : 'ERROR', this.config.max_iterations, lastResult?.files_modified || []);
        // Emit REVIEW_LOOP_END event
        this.emitEvent('REVIEW_LOOP_END', {
            total_iterations: this.config.max_iterations,
            final_status: finalStatus,
            original_prompt: task.prompt,
            escalated: this.config.escalate_on_max,
        });
        return {
            final_status: finalStatus,
            total_iterations: this.config.max_iterations,
            iteration_history: iterationHistory,
            final_output: lastResult,
        };
    }
    /**
     * Build modification prompt using PromptAssembler or fallback
     * Per spec/17_PROMPT_TEMPLATE.md L102-124
     *
     * @param originalPrompt - Original user prompt
     * @param criteriaResults - Failed criteria results
     * @param issues - Detected issues
     * @returns Modification prompt to re-submit
     */
    buildModificationPromptInternal(originalPrompt, criteriaResults, issues) {
        // If PromptAssembler is available, use template-based approach
        if (this.promptAssembler) {
            const detectedIssues = issues.map(issue => {
                let description = `${issue.type}: ${issue.description}`;
                if (issue.location) {
                    description += ` (場所: ${issue.location})`;
                }
                if (issue.suggestion) {
                    description += ` [提案: ${issue.suggestion}]`;
                }
                return description;
            });
            // Add failed criteria details
            const failedCriteria = criteriaResults.filter(cr => !cr.passed);
            for (const cr of failedCriteria) {
                detectedIssues.push(`品質基準 ${cr.criteria_id} 失敗: ${cr.details}`);
            }
            const input = {
                detectedIssues,
                originalTask: originalPrompt,
            };
            return this.promptAssembler.buildModificationPrompt(input);
        }
        // Fall back to hardcoded generation
        return generateModificationPrompt(originalPrompt, criteriaResults, issues);
    }
    /**
     * Emit event through callback
     */
    emitEvent(eventType, content) {
        if (this.eventCallback) {
            this.eventCallback(eventType, content);
        }
    }
    /**
     * Delay helper for retry
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ReviewLoopExecutorWrapper = ReviewLoopExecutorWrapper;
//# sourceMappingURL=review-loop.js.map