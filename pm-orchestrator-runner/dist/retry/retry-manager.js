"use strict";
/**
 * Retry Manager Module
 *
 * Per spec 30_RETRY_AND_RECOVERY.md
 *
 * Provides:
 * - Retry decision logic (RETRY | ESCALATE | PASS)
 * - Backoff calculation (fixed, linear, exponential with jitter)
 * - Cause-specific retry handling
 * - ESCALATE flow and reporting
 * - Recovery mechanisms for partial failures
 *
 * Fail-Closed Principle: When in doubt, ESCALATE to human.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryManager = exports.DEFAULT_RETRY_MANAGER_CONFIG = exports.DEFAULT_RETRY_CONFIG = void 0;
exports.calculateBackoff = calculateBackoff;
exports.classifyFailure = classifyFailure;
exports.generateModificationHint = generateModificationHint;
exports.decideRetry = decideRetry;
exports.generateUserMessage = generateUserMessage;
exports.generateEscalationReport = generateEscalationReport;
exports.determineRecoveryStrategy = determineRecoveryStrategy;
// ============================================================
// Default Configuration
// ============================================================
/**
 * Default retry configuration per spec
 */
exports.DEFAULT_RETRY_CONFIG = {
    max_retries: 3,
    backoff: {
        type: 'exponential',
        initial_delay_ms: 1000,
        max_delay_ms: 30000,
        multiplier: 2,
        jitter: 0.1,
    },
    retryable_failures: [
        'INCOMPLETE',
        'QUALITY_FAILURE',
        'TIMEOUT',
        'TRANSIENT_ERROR',
        'RATE_LIMIT',
    ],
    cause_specific: [
        {
            failure_type: 'RATE_LIMIT',
            max_retries: 5,
            backoff: {
                type: 'exponential',
                initial_delay_ms: 5000,
                max_delay_ms: 60000,
                multiplier: 2,
                jitter: 0.2,
            },
        },
        {
            failure_type: 'TIMEOUT',
            max_retries: 2,
            backoff: {
                type: 'fixed',
                initial_delay_ms: 5000,
                max_delay_ms: 5000,
            },
        },
    ],
};
/**
 * Modification hint templates for each failure type
 */
const MODIFICATION_HINTS = {
    INCOMPLETE: `前回の出力は不完全でした。

修正要求:
1. 省略せず、全てのコードを出力してください
2. ファイルの最初から最後まで完全に出力してください
3. "..." や "残り省略" 等のマーカーを使用しないでください
4. Runner が完了を判定するため、完了宣言は不要です`,
    QUALITY_FAILURE: `品質基準を満たしていません。

修正要求:
1. 全てのコードを完全に出力してください
2. TODO/FIXME マーカーを残さないでください
3. 構文エラーがないことを確認してください`,
    TIMEOUT: `前回の実行がタイムアウトしました。

修正要求:
1. より小さな単位に分割して実行してください
2. 複雑な処理は段階的に実行してください
3. 中間結果を出力してください`,
    TRANSIENT_ERROR: '', // No modification needed, same request retry
    RATE_LIMIT: '', // No modification needed, just wait and retry
    FATAL_ERROR: '', // Not retryable
    ESCALATE_REQUIRED: '', // Not retryable
};
// ============================================================
// Core Functions
// ============================================================
/**
 * Calculate backoff delay for a retry attempt
 */
function calculateBackoff(strategy, retryCount) {
    let delay;
    switch (strategy.type) {
        case 'fixed':
            delay = strategy.initial_delay_ms;
            break;
        case 'linear':
            delay = strategy.initial_delay_ms * (retryCount + 1);
            break;
        case 'exponential': {
            const multiplier = strategy.multiplier ?? 2;
            delay = strategy.initial_delay_ms * Math.pow(multiplier, retryCount);
            break;
        }
        default:
            // Fail-closed: use initial delay
            delay = strategy.initial_delay_ms;
    }
    // Apply max limit
    delay = Math.min(delay, strategy.max_delay_ms);
    // Apply jitter if specified
    if (strategy.jitter && strategy.jitter > 0) {
        const jitterRange = delay * strategy.jitter;
        const jitterOffset = (Math.random() - 0.5) * 2 * jitterRange;
        delay = Math.max(0, delay + jitterOffset);
    }
    return Math.round(delay);
}
/**
 * Classify a task result into a failure type
 */
function classifyFailure(result) {
    // Check for timeout
    if (result.status === 'TIMEOUT') {
        return 'TIMEOUT';
    }
    // Check for quality failures
    if (result.quality_results) {
        const hasQualityFailure = result.quality_results.some((q) => !q.passed);
        if (hasQualityFailure) {
            return 'QUALITY_FAILURE';
        }
    }
    // Check for incomplete output (omission markers)
    if (result.output) {
        const omissionPatterns = [
            /\.\.\./,
            /\/\/\s*(残り|以下)?(省略|同様)/i,
            /\/\/\s*etc\.?/i,
            /\/\*\s*\.\.\.\s*\*\//,
            /#\s*(残り|以下)?(省略|同様)/i,
        ];
        for (const pattern of omissionPatterns) {
            if (pattern.test(result.output)) {
                return 'INCOMPLETE';
            }
        }
    }
    // Check for transient errors
    if (result.error) {
        const transientPatterns = [
            /5\d{2}/, // 5xx errors
            /network/i,
            /connection/i,
            /ECONNREFUSED/,
            /ETIMEDOUT/,
        ];
        for (const pattern of transientPatterns) {
            if (pattern.test(result.error)) {
                return 'TRANSIENT_ERROR';
            }
        }
        // Check for rate limit
        if (/429|rate.?limit/i.test(result.error)) {
            return 'RATE_LIMIT';
        }
        // Check for fatal errors
        const fatalPatterns = [
            /auth/i,
            /401/,
            /403/,
            /permission/i,
            /denied/i,
        ];
        for (const pattern of fatalPatterns) {
            if (pattern.test(result.error)) {
                return 'FATAL_ERROR';
            }
        }
    }
    // Check for detected issues
    if (result.detected_issues && result.detected_issues.length > 0) {
        return 'INCOMPLETE';
    }
    // Default to quality failure for general failures
    if (result.status === 'FAIL' || result.status === 'ERROR') {
        return 'QUALITY_FAILURE';
    }
    // Fail-closed: if we can't classify, escalate
    return 'ESCALATE_REQUIRED';
}
/**
 * Generate modification hint for a failure
 */
function generateModificationHint(failureType, result, causeConfig) {
    // Use cause-specific hint if available
    if (causeConfig?.modification_hint) {
        return causeConfig.modification_hint;
    }
    // Use base template
    let hint = MODIFICATION_HINTS[failureType] || '';
    // Append detected issues if available
    if (result.detected_issues && result.detected_issues.length > 0) {
        hint += `\n\n検出された問題:\n${result.detected_issues.map((i) => `- ${i}`).join('\n')}`;
    }
    // Append quality results if available
    if (result.quality_results) {
        const failed = result.quality_results.filter((q) => !q.passed);
        if (failed.length > 0) {
            hint += `\n\n失敗した品質基準:\n${failed.map((q) => `- ${q.criterion}: ${q.details || 'FAIL'}`).join('\n')}`;
        }
    }
    return hint;
}
/**
 * Decide whether to retry a failed task
 */
function decideRetry(result, config, history) {
    // Success case
    if (result.status === 'PASS') {
        return {
            decision: 'PASS',
            current_retry_count: history.retry_count,
            max_retries: config.max_retries,
            reasoning: 'Task completed successfully',
        };
    }
    // Classify the failure
    const failureType = classifyFailure(result);
    // Check if retryable
    if (!config.retryable_failures.includes(failureType)) {
        return {
            decision: 'ESCALATE',
            failure_type: failureType,
            current_retry_count: history.retry_count,
            max_retries: config.max_retries,
            escalate_reason: `Non-retryable failure: ${failureType}`,
            reasoning: `Failure type ${failureType} is not retryable`,
        };
    }
    // Get cause-specific config
    const causeConfig = config.cause_specific.find((c) => c.failure_type === failureType);
    const effectiveMaxRetries = causeConfig?.max_retries ?? config.max_retries;
    // Check retry limit
    if (history.retry_count >= effectiveMaxRetries) {
        return {
            decision: 'ESCALATE',
            failure_type: failureType,
            current_retry_count: history.retry_count,
            max_retries: effectiveMaxRetries,
            escalate_reason: `Max retries (${effectiveMaxRetries}) exceeded`,
            reasoning: `Retry count ${history.retry_count} >= max ${effectiveMaxRetries}`,
        };
    }
    // Calculate backoff delay
    const effectiveBackoff = causeConfig?.backoff ?? config.backoff;
    const delay = calculateBackoff(effectiveBackoff, history.retry_count);
    // Generate modification hint
    const hint = generateModificationHint(failureType, result, causeConfig);
    return {
        decision: 'RETRY',
        failure_type: failureType,
        current_retry_count: history.retry_count,
        max_retries: effectiveMaxRetries,
        delay_ms: delay,
        modification_hint: hint || undefined,
        reasoning: `Retryable failure, attempt ${history.retry_count + 1}/${effectiveMaxRetries}`,
    };
}
/**
 * Generate user-facing message for escalation
 */
function generateUserMessage(report) {
    const { reason, failure_summary, task_id, recommended_actions } = report;
    const actionsText = recommended_actions
        .map((a, i) => `${i + 1}. ${a}`)
        .join('\n');
    switch (reason.type) {
        case 'MAX_RETRIES':
            return `タスク (ID: ${task_id}) は ${failure_summary.total_attempts} 回試行しましたが完了できませんでした。

主な問題: ${failure_summary.last_failure.message}

推奨アクション:
${actionsText}

詳細: /trace ${task_id}`;
        case 'FATAL_ERROR':
            return `タスク (ID: ${task_id}) で回復不能なエラーが発生しました。

エラー: ${failure_summary.last_failure.message}

推奨アクション:
${actionsText}`;
        case 'HUMAN_JUDGMENT':
            return `タスク (ID: ${task_id}) は人間の判断が必要です。

理由: ${reason.description}

推奨アクション:
${actionsText}`;
        case 'RESOURCE_EXHAUSTED':
            return `タスク (ID: ${task_id}) はリソース制限により中断されました。

制限: ${reason.description}

推奨アクション:
${actionsText}`;
        default:
            return `タスク (ID: ${task_id}) でエラーが発生しました。

詳細: /trace ${task_id}`;
    }
}
/**
 * Generate escalation report
 */
function generateEscalationReport(task_id, subtask_id, reason, history, traceFile) {
    const failureTypes = history.attempts
        .filter((a) => a.failure_type)
        .map((a) => a.failure_type);
    const lastAttempt = history.attempts[history.attempts.length - 1];
    const failureSummary = {
        total_attempts: history.retry_count + 1,
        failure_types: failureTypes,
        last_failure: {
            type: lastAttempt?.failure_type || 'ESCALATE_REQUIRED',
            message: lastAttempt?.error_message || reason.description,
            timestamp: lastAttempt?.timestamp || new Date().toISOString(),
        },
    };
    const debugInfo = {
        retry_history: history.attempts,
        trace_file: traceFile,
        relevant_logs: [],
    };
    // Generate recommended actions based on reason type
    let recommended_actions;
    switch (reason.type) {
        case 'MAX_RETRIES':
            recommended_actions = [
                'タスクを小さく分割してください',
                'より具体的な指示を提供してください',
                `/trace ${task_id} で詳細を確認してください`,
            ];
            break;
        case 'FATAL_ERROR':
            recommended_actions = [
                '認証情報を確認してください',
                'API Keyを確認してください',
                '/keys set で再設定してください',
            ];
            break;
        case 'HUMAN_JUDGMENT':
            recommended_actions = [
                '要件を明確化してください',
                'どちらの方法を選択するか指定してください',
            ];
            break;
        case 'RESOURCE_EXHAUSTED':
            recommended_actions = [
                'タスクを小さく分割してください',
                'コスト制限を確認してください',
            ];
            break;
        default:
            recommended_actions = [`/trace ${task_id} で詳細を確認してください`];
    }
    const report = {
        task_id,
        subtask_id,
        escalated_at: new Date().toISOString(),
        reason,
        failure_summary: failureSummary,
        user_message: '', // Will be generated below
        debug_info: debugInfo,
        recommended_actions,
    };
    // Generate user message
    report.user_message = generateUserMessage(report);
    return report;
}
/**
 * Determine recovery strategy for partial failures
 */
function determineRecoveryStrategy(failedSubtasks, succeededSubtasks, dependencies) {
    // No failures = no recovery needed
    if (failedSubtasks.length === 0) {
        return 'PARTIAL_COMMIT';
    }
    // Check if any succeeded subtask depends on a failed subtask
    const hasDependentFailures = succeededSubtasks.some((succeeded) => {
        const deps = dependencies.get(succeeded) || [];
        return deps.some((dep) => failedSubtasks.includes(dep));
    });
    if (hasDependentFailures) {
        // Dependent failures require rollback
        return 'ROLLBACK_AND_RETRY';
    }
    // Independent failures can be retried individually
    return 'RETRY_FAILED_ONLY';
}
/**
 * Default RetryManager configuration
 */
exports.DEFAULT_RETRY_MANAGER_CONFIG = {
    retryConfig: exports.DEFAULT_RETRY_CONFIG,
    enableSnapshots: true,
    snapshotRetentionHours: 24,
    partialCommitEnabled: true,
    traceDir: '.pm-orchestrator/traces',
};
/**
 * RetryManager - Manages retry logic and recovery
 */
class RetryManager {
    config;
    historyMap;
    eventCallback;
    conversationTracer;
    constructor(config = {}, eventCallback, conversationTracer) {
        this.config = {
            ...exports.DEFAULT_RETRY_MANAGER_CONFIG,
            ...config,
            retryConfig: {
                ...exports.DEFAULT_RETRY_MANAGER_CONFIG.retryConfig,
                ...config.retryConfig,
            },
        };
        this.historyMap = new Map();
        this.eventCallback = eventCallback;
        this.conversationTracer = conversationTracer;
    }
    /**
     * Emit an event to callback and tracer
     */
    emitEvent(event) {
        // Call callback if provided
        if (this.eventCallback) {
            try {
                this.eventCallback(event);
            }
            catch (e) {
                // Ignore callback errors
            }
        }
        // Note: ConversationTracer integration for retry events
        // could be added here when specific event types are defined in the tracer
    }
    /**
     * Get or create retry history for a task
     */
    getHistory(taskId, subtaskId) {
        const key = subtaskId ? `${taskId}:${subtaskId}` : taskId;
        if (!this.historyMap.has(key)) {
            this.historyMap.set(key, {
                task_id: taskId,
                subtask_id: subtaskId,
                retry_count: 0,
                attempts: [],
            });
        }
        return this.historyMap.get(key);
    }
    /**
     * Record an attempt in history
     */
    recordAttempt(taskId, subtaskId, status, failureType, errorMessage, durationMs) {
        const history = this.getHistory(taskId, subtaskId);
        const attempt = {
            attempt_number: history.attempts.length,
            timestamp: new Date().toISOString(),
            failure_type: failureType,
            status,
            error_message: errorMessage,
            duration_ms: durationMs || 0,
        };
        history.attempts.push(attempt);
        if (status === 'FAIL') {
            history.retry_count++;
        }
    }
    /**
     * Decide whether to retry a task
     */
    decide(taskId, subtaskId, result) {
        const history = this.getHistory(taskId, subtaskId);
        const decision = decideRetry(result, this.config.retryConfig, history);
        // Emit decision event
        this.emitEvent({
            type: 'RETRY_DECISION',
            decision,
            task_id: taskId,
            subtask_id: subtaskId,
        });
        return decision;
    }
    /**
     * Signal that a retry is starting
     */
    startRetry(taskId, subtaskId, modificationHint) {
        const history = this.getHistory(taskId, subtaskId);
        this.emitEvent({
            type: 'RETRY_START',
            task_id: taskId,
            subtask_id: subtaskId,
            retry_count: history.retry_count,
            modification_hint: modificationHint,
        });
    }
    /**
     * Signal that a retry succeeded
     */
    retrySucceeded(taskId, subtaskId) {
        const history = this.getHistory(taskId, subtaskId);
        this.emitEvent({
            type: 'RETRY_SUCCESS',
            task_id: taskId,
            subtask_id: subtaskId,
            retry_count: history.retry_count,
            total_attempts: history.attempts.length + 1,
        });
    }
    /**
     * Generate and emit an escalation
     */
    escalate(taskId, subtaskId, reason) {
        const history = this.getHistory(taskId, subtaskId);
        const traceFile = `${this.config.traceDir}/${taskId}.jsonl`;
        const report = generateEscalationReport(taskId, subtaskId, reason, history, traceFile);
        // Emit escalation decision
        this.emitEvent({
            type: 'ESCALATE_DECISION',
            report,
        });
        // Emit escalation executed
        this.emitEvent({
            type: 'ESCALATE_EXECUTED',
            task_id: taskId,
            user_message: report.user_message,
            recommended_actions: report.recommended_actions,
        });
        return report;
    }
    /**
     * Start a recovery process
     */
    startRecovery(taskId, failedSubtasks, succeededSubtasks, dependencies) {
        const strategy = determineRecoveryStrategy(failedSubtasks, succeededSubtasks, dependencies);
        const recovery = {
            task_id: taskId,
            succeeded_subtasks: succeededSubtasks,
            failed_subtasks: failedSubtasks,
            strategy,
        };
        // Emit recovery start
        this.emitEvent({
            type: 'RECOVERY_START',
            task_id: taskId,
            strategy,
            failed_subtasks: failedSubtasks,
        });
        return recovery;
    }
    /**
     * Complete a recovery process
     */
    completeRecovery(taskId, strategy, finalStatus) {
        this.emitEvent({
            type: 'RECOVERY_COMPLETE',
            task_id: taskId,
            strategy,
            final_status: finalStatus,
        });
    }
    /**
     * Reset history for a task
     */
    resetHistory(taskId, subtaskId) {
        const key = subtaskId ? `${taskId}:${subtaskId}` : taskId;
        this.historyMap.delete(key);
    }
    /**
     * Get current retry count for a task
     */
    getRetryCount(taskId, subtaskId) {
        const key = subtaskId ? `${taskId}:${subtaskId}` : taskId;
        const history = this.historyMap.get(key);
        return history?.retry_count || 0;
    }
    /**
     * Check if max retries have been reached
     */
    isMaxRetriesReached(taskId, subtaskId, failureType) {
        const retryCount = this.getRetryCount(taskId, subtaskId);
        // Get effective max retries
        let maxRetries = this.config.retryConfig.max_retries;
        if (failureType) {
            const causeConfig = this.config.retryConfig.cause_specific.find((c) => c.failure_type === failureType);
            if (causeConfig?.max_retries !== undefined) {
                maxRetries = causeConfig.max_retries;
            }
        }
        return retryCount >= maxRetries;
    }
    /**
     * Get the delay for the next retry
     */
    getNextRetryDelay(taskId, subtaskId, failureType) {
        const retryCount = this.getRetryCount(taskId, subtaskId);
        // Get effective backoff strategy
        let backoff = this.config.retryConfig.backoff;
        if (failureType) {
            const causeConfig = this.config.retryConfig.cause_specific.find((c) => c.failure_type === failureType);
            if (causeConfig?.backoff) {
                backoff = causeConfig.backoff;
            }
        }
        return calculateBackoff(backoff, retryCount);
    }
    /**
     * Get configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
exports.RetryManager = RetryManager;
//# sourceMappingURL=retry-manager.js.map