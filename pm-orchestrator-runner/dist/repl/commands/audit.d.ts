/**
 * Audit Command
 *
 * FZF-style task selection UI for dist audit and evidence capture.
 * Implements "監査失格" prevention by blocking dangerous commands during audit.
 *
 * Commands:
 * - /audit ui       - Interactive FZF-style task picker
 * - /audit run <id> - Execute audit task directly
 * - /audit list     - List all audit tasks
 *
 * Audit Tasks:
 * - T001: docs-only dist change audit (full automation)
 * - T002: Current dist diff detection
 * - T003: Change trigger tracking (hooks, package.json scripts)
 * - T004: File monitoring for dist generation process
 * - T005: "不正検知" reproduction helper
 */
/**
 * Audit task category
 */
export type AuditCategory = 'dist_audit' | 'repo_hygiene' | 'evidence_capture' | 'ci_hook_investigation' | 'safe_commands';
/**
 * Audit task definition
 */
export interface AuditTask {
    id: string;
    name: string;
    description: string;
    category: AuditCategory;
    /** Commands that are BLOCKED during this task */
    blockedCommands: string[];
    /** Execute the audit task */
    execute: (projectPath: string, log: AuditLogFn) => Promise<AuditTaskResult>;
}
/**
 * Audit task execution result
 */
export interface AuditTaskResult {
    taskId: string;
    result: 'PASS' | 'FAIL' | 'ERROR' | 'BLOCKED';
    evidence: AuditEvidence[];
    summary: string;
}
/**
 * Evidence record
 */
export interface AuditEvidence {
    timestamp: string;
    type: 'command' | 'observation' | 'blocked' | 'file_state';
    command?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    observation?: string;
    filePath?: string;
    fileState?: 'exists' | 'not_exists' | 'modified' | 'unchanged';
}
/**
 * Audit log function type
 */
export type AuditLogFn = (evidence: Omit<AuditEvidence, 'timestamp'>) => void;
/**
 * Audit command result
 */
export interface AuditCommandResult {
    success: boolean;
    message: string;
    output?: string;
    error?: {
        code: string;
        message: string;
    };
}
/**
 * Audit Command class
 */
export declare class AuditCommand {
    private projectPath;
    private currentTaskId;
    private auditLog;
    /**
     * Get all audit tasks
     */
    getTasks(): AuditTask[];
    /**
     * Get task by ID
     */
    getTask(taskId: string): AuditTask | undefined;
    /**
     * Check if a command is blocked during current audit
     */
    isCommandBlocked(command: string): boolean;
    /**
     * Get current audit task ID
     */
    getCurrentTaskId(): string | null;
    /**
     * List all audit tasks
     */
    listTasks(): AuditCommandResult;
    /**
     * Run an audit task
     */
    runTask(taskId: string, projectPath: string): Promise<AuditCommandResult>;
    /**
     * Get audit log for integration with /logs
     */
    getAuditLog(): AuditEvidence[];
    /**
     * Format tasks for FZF-style picker
     */
    formatForPicker(): {
        items: Map<number, string>;
        display: string[];
    };
}
//# sourceMappingURL=audit.d.ts.map