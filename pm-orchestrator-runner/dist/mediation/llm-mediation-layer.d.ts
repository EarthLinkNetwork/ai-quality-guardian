/**
 * LLM Mediation Layer
 *
 * Sits ABOVE Runner Core to handle ALL user interaction and decision making.
 * Runner Core returns structured signals (facts only), this layer:
 * - Generates natural language questions to users
 * - Interprets user responses
 * - Normalizes responses into explicit tasks for Runner
 *
 * ARCHITECTURAL RULES:
 * - Runner MUST NOT contain conversational phrasing logic
 * - Runner MUST NOT contain file-name-specific logic
 * - This layer is the ONLY component that asks questions
 * - This layer decides how to phrase clarification questions
 * - This layer decides follow-up actions based on user answers
 */
/**
 * Clarification reason codes from Runner (structured, no conversation)
 */
export type ClarificationReason = 'target_file_exists' | 'target_file_ambiguous' | 'target_action_ambiguous' | 'missing_required_info';
/**
 * Structured signal from Runner Core (facts only)
 */
export interface RunnerSignal {
    /** Whether clarification is needed before proceeding */
    clarification_needed: boolean;
    /** Reason code for clarification (structured, not conversational) */
    clarification_reason?: ClarificationReason;
    /** Target file path if identified (fact) */
    target_file?: string;
    /** Whether to proceed with next action */
    next_action: boolean;
    /** Original prompt that was analyzed */
    original_prompt?: string;
    /** Task execution result if executed */
    execution_result?: {
        status: 'COMPLETE' | 'INCOMPLETE' | 'NO_EVIDENCE' | 'ERROR';
        output?: string;
        files_modified?: string[];
        verified_files?: Array<{
            path: string;
            exists: boolean;
            size?: number;
        }>;
    };
}
/**
 * User response types after clarification
 */
export type UserResponseType = 'overwrite' | 'new_name' | 'cancel' | 'specify_file' | 'specify_action' | 'unknown';
/**
 * Parsed user response
 */
export interface ParsedUserResponse {
    type: UserResponseType;
    /** New file name if type is 'new_name' or 'specify_file' */
    new_file_name?: string;
    /** Specified action if type is 'specify_action' */
    specified_action?: string;
    /** Raw user input */
    raw_input: string;
}
/**
 * Normalized task to send back to Runner
 */
export interface NormalizedTask {
    /** Explicit, unambiguous task description for Runner */
    explicit_prompt: string;
    /** Target file path */
    target_file?: string;
    /** Action type */
    action: 'create' | 'overwrite' | 'create_new' | 'modify' | 'cancel';
    /** Original context for tracing */
    original_context: {
        original_prompt: string;
        clarification_reason?: ClarificationReason;
        user_response: string;
    };
}
/**
 * LLM Mediation Layer output to user
 */
export interface MediationOutput {
    /** Whether to show a question to user */
    needs_user_input: boolean;
    /** Question to display to user (natural language) */
    question?: string;
    /** Suggested responses for user (optional hints) */
    suggested_responses?: string[];
    /** If no user input needed, the normalized task to execute */
    normalized_task?: NormalizedTask;
    /** Status message to display */
    status_message?: string;
}
/**
 * LLM Mediation Layer
 *
 * Handles all user interaction and decision making.
 * Receives structured signals from Runner, generates natural language,
 * interprets user responses, and normalizes them into explicit tasks.
 */
export declare class LLMMediationLayer {
    /**
     * Process Runner signal and generate appropriate output
     *
     * @param signal - Structured signal from Runner Core
     * @returns Mediation output (question to user or normalized task)
     */
    processRunnerSignal(signal: RunnerSignal): MediationOutput;
    /**
     * Parse user response and determine response type
     *
     * @param userInput - Raw user input string
     * @param context - Context from previous clarification
     * @returns Parsed user response
     */
    parseUserResponse(userInput: string, context: {
        clarification_reason?: ClarificationReason;
        target_file?: string;
    }): ParsedUserResponse;
    /**
     * Normalize user response into explicit task for Runner
     *
     * @param originalPrompt - Original user prompt
     * @param signal - Runner signal that triggered clarification
     * @param parsedResponse - Parsed user response
     * @returns Normalized task or null if cancelled
     */
    normalizeToTask(originalPrompt: string, signal: RunnerSignal, parsedResponse: ParsedUserResponse): NormalizedTask | null;
    /**
     * Handle case when target file already exists
     */
    private handleFileExistsCase;
    /**
     * Handle case when target file is ambiguous
     */
    private handleFileAmbiguousCase;
    /**
     * Handle case when action is ambiguous
     */
    private handleActionAmbiguousCase;
    /**
     * Handle case when required info is missing
     */
    private handleMissingInfoCase;
    /**
     * Generate status message for non-clarification cases
     */
    private generateStatusMessage;
    /**
     * Check if input indicates cancel intent
     */
    private isCancelIntent;
    /**
     * Parse response for overwrite/new decision
     */
    private parseOverwriteResponse;
    /**
     * Parse response for file specification
     */
    private parseFileSpecification;
    /**
     * Parse response for action specification
     */
    private parseActionSpecification;
    /**
     * Extract file name from user input
     */
    private extractFileName;
    /**
     * Generate alternative file name
     */
    private generateAlternativeName;
}
//# sourceMappingURL=llm-mediation-layer.d.ts.map