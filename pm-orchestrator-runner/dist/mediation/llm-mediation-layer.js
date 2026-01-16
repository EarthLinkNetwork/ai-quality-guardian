"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMMediationLayer = void 0;
/**
 * LLM Mediation Layer
 *
 * Handles all user interaction and decision making.
 * Receives structured signals from Runner, generates natural language,
 * interprets user responses, and normalizes them into explicit tasks.
 */
class LLMMediationLayer {
    /**
     * Process Runner signal and generate appropriate output
     *
     * @param signal - Structured signal from Runner Core
     * @returns Mediation output (question to user or normalized task)
     */
    processRunnerSignal(signal) {
        // If no clarification needed, pass through
        if (!signal.clarification_needed) {
            return {
                needs_user_input: false,
                status_message: this.generateStatusMessage(signal),
            };
        }
        // Generate appropriate question based on clarification reason
        switch (signal.clarification_reason) {
            case 'target_file_exists':
                return this.handleFileExistsCase(signal);
            case 'target_file_ambiguous':
                return this.handleFileAmbiguousCase(signal);
            case 'target_action_ambiguous':
                return this.handleActionAmbiguousCase(signal);
            case 'missing_required_info':
                return this.handleMissingInfoCase(signal);
            default:
                // Unknown reason - ask for general clarification
                return {
                    needs_user_input: true,
                    question: 'タスクの詳細を教えてください。',
                    suggested_responses: [],
                };
        }
    }
    /**
     * Parse user response and determine response type
     *
     * @param userInput - Raw user input string
     * @param context - Context from previous clarification
     * @returns Parsed user response
     */
    parseUserResponse(userInput, context) {
        const input = userInput.trim().toLowerCase();
        // Check for cancel intent
        if (this.isCancelIntent(input)) {
            return { type: 'cancel', raw_input: userInput };
        }
        // Parse based on context
        switch (context.clarification_reason) {
            case 'target_file_exists':
                return this.parseOverwriteResponse(userInput);
            case 'target_file_ambiguous':
                return this.parseFileSpecification(userInput);
            case 'target_action_ambiguous':
                return this.parseActionSpecification(userInput);
            default:
                return { type: 'unknown', raw_input: userInput };
        }
    }
    /**
     * Normalize user response into explicit task for Runner
     *
     * @param originalPrompt - Original user prompt
     * @param signal - Runner signal that triggered clarification
     * @param parsedResponse - Parsed user response
     * @returns Normalized task or null if cancelled
     */
    normalizeToTask(originalPrompt, signal, parsedResponse) {
        if (parsedResponse.type === 'cancel') {
            return null;
        }
        const context = {
            original_prompt: originalPrompt,
            clarification_reason: signal.clarification_reason,
            user_response: parsedResponse.raw_input,
        };
        switch (parsedResponse.type) {
            case 'overwrite':
                return {
                    explicit_prompt: `${signal.target_file} を上書きして作成してください`,
                    target_file: signal.target_file,
                    action: 'overwrite',
                    original_context: context,
                };
            case 'new_name':
                const newFileName = parsedResponse.new_file_name || this.generateAlternativeName(signal.target_file);
                return {
                    explicit_prompt: `${newFileName} を新規作成してください`,
                    target_file: newFileName,
                    action: 'create_new',
                    original_context: context,
                };
            case 'specify_file':
                return {
                    explicit_prompt: `${parsedResponse.new_file_name} を作成してください`,
                    target_file: parsedResponse.new_file_name,
                    action: 'create',
                    original_context: context,
                };
            case 'specify_action':
                return {
                    explicit_prompt: parsedResponse.specified_action || originalPrompt,
                    action: 'modify',
                    original_context: context,
                };
            default:
                // Unknown response - return original prompt with context
                return {
                    explicit_prompt: originalPrompt,
                    action: 'create',
                    original_context: context,
                };
        }
    }
    // ============================================================
    // Private helper methods
    // ============================================================
    /**
     * Handle case when target file already exists
     */
    handleFileExistsCase(signal) {
        const fileName = signal.target_file || 'ファイル';
        return {
            needs_user_input: true,
            question: `${fileName} は既に存在します。上書きしますか？それとも別名で新規作成しますか？（overwrite / new）`,
            suggested_responses: ['overwrite', 'new', 'cancel'],
        };
    }
    /**
     * Handle case when target file is ambiguous
     */
    handleFileAmbiguousCase(signal) {
        return {
            needs_user_input: true,
            question: '対象のファイル名またはパスを指定してください。',
            suggested_responses: [],
        };
    }
    /**
     * Handle case when action is ambiguous
     */
    handleActionAmbiguousCase(signal) {
        return {
            needs_user_input: true,
            question: 'どの機能/箇所を修正しますか？（例: コマンド名、エラー文、対象ファイル）',
            suggested_responses: [],
        };
    }
    /**
     * Handle case when required info is missing
     */
    handleMissingInfoCase(signal) {
        return {
            needs_user_input: true,
            question: 'タスクを実行するために必要な情報を教えてください。',
            suggested_responses: [],
        };
    }
    /**
     * Generate status message for non-clarification cases
     */
    generateStatusMessage(signal) {
        if (signal.execution_result) {
            const result = signal.execution_result;
            switch (result.status) {
                case 'COMPLETE':
                    const files = result.verified_files?.filter(f => f.exists).map(f => f.path) || [];
                    return files.length > 0
                        ? `完了しました。作成されたファイル: ${files.join(', ')}`
                        : '完了しました。';
                case 'INCOMPLETE':
                    return 'タスクは部分的に完了しました。';
                case 'NO_EVIDENCE':
                    return 'タスクの完了を確認できませんでした。';
                case 'ERROR':
                    return 'エラーが発生しました。';
            }
        }
        return 'タスクを処理中です。';
    }
    /**
     * Check if input indicates cancel intent
     */
    isCancelIntent(input) {
        const cancelPatterns = [
            'cancel', 'キャンセル', '中止', 'やめる', 'やめて',
            'abort', 'stop', '止める', '止めて', 'いいえ', 'no',
        ];
        return cancelPatterns.some(pattern => input.includes(pattern));
    }
    /**
     * Parse response for overwrite/new decision
     */
    parseOverwriteResponse(input) {
        const normalized = input.trim().toLowerCase();
        // Check for overwrite intent
        const overwritePatterns = [
            'overwrite', '上書き', 'うわがき', 'replace', '置き換え',
            'yes', 'はい', 'ok', 'おｋ',
        ];
        if (overwritePatterns.some(p => normalized.includes(p))) {
            return { type: 'overwrite', raw_input: input };
        }
        // Check for new name intent
        const newNamePatterns = [
            'new', '新規', 'しんき', '別名', 'べつめい', '別の名前',
            'different', 'another',
        ];
        if (newNamePatterns.some(p => normalized.includes(p))) {
            // Try to extract new file name from input
            const newFileName = this.extractFileName(input);
            return {
                type: 'new_name',
                new_file_name: newFileName || undefined,
                raw_input: input,
            };
        }
        // Check if user provided a specific file name
        const extractedFile = this.extractFileName(input);
        if (extractedFile) {
            return {
                type: 'new_name',
                new_file_name: extractedFile,
                raw_input: input,
            };
        }
        return { type: 'unknown', raw_input: input };
    }
    /**
     * Parse response for file specification
     */
    parseFileSpecification(input) {
        const fileName = this.extractFileName(input);
        if (fileName) {
            return {
                type: 'specify_file',
                new_file_name: fileName,
                raw_input: input,
            };
        }
        return { type: 'unknown', raw_input: input };
    }
    /**
     * Parse response for action specification
     */
    parseActionSpecification(input) {
        // If input is non-trivial, treat it as action specification
        if (input.trim().length > 2) {
            return {
                type: 'specify_action',
                specified_action: input.trim(),
                raw_input: input,
            };
        }
        return { type: 'unknown', raw_input: input };
    }
    /**
     * Extract file name from user input
     */
    extractFileName(input) {
        // Pattern for file paths with extensions
        const extensions = 'ts|tsx|js|jsx|json|md|txt|yaml|yml|html|css|sh';
        const filePattern = new RegExp(`(?:^|\\s)((?:[\\w.-]+\\/)*[\\w.-]+\\.(?:${extensions}))(?:\\s|$|を|に|の|で|と|は)`, 'i');
        const match = input.match(filePattern);
        if (match) {
            return match[1];
        }
        return null;
    }
    /**
     * Generate alternative file name
     */
    generateAlternativeName(originalFile) {
        if (!originalFile) {
            return 'new_file.txt';
        }
        const ext = originalFile.includes('.')
            ? originalFile.substring(originalFile.lastIndexOf('.'))
            : '';
        const baseName = originalFile.includes('.')
            ? originalFile.substring(0, originalFile.lastIndexOf('.'))
            : originalFile;
        // Add timestamp suffix
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `${baseName}_${timestamp}${ext}`;
    }
}
exports.LLMMediationLayer = LLMMediationLayer;
//# sourceMappingURL=llm-mediation-layer.js.map