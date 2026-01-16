"use strict";
/**
 * Real LLM Mediation Layer
 *
 * Uses REAL LLM API calls (no stubs/mocks) to:
 * 1. Generate natural language questions from structured reason codes
 * 2. Normalize free-form user input into structured tasks
 *
 * ARCHITECTURAL RULES:
 * - This layer sits ABOVE Runner Core
 * - Runner Core returns ONLY structured signals (no conversational text)
 * - This layer generates ALL human-readable text via LLM
 * - Output structure is ALWAYS stable regardless of LLM text variation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealLLMMediationLayer = void 0;
const llm_client_1 = require("./llm-client");
/**
 * Real LLM Mediation Layer
 *
 * IMPORTANT: This class makes REAL API calls to LLM providers.
 * - No stubs or mocks
 * - temperature > 0 for non-deterministic output
 * - Output varies every call, but structure remains stable
 */
class RealLLMMediationLayer {
    client;
    constructor(config) {
        this.client = llm_client_1.LLMClient.fromEnv(config?.provider ?? 'openai', config?.model, { temperature: config?.temperature ?? 0.7 });
    }
    /**
     * Get the LLM client (for testing/inspection)
     */
    getClient() {
        return this.client;
    }
    /**
     * Process Runner signal and generate appropriate output using LLM
     *
     * @param signal - Structured signal from Runner Core
     * @returns Mediation output with LLM-generated question
     */
    async processRunnerSignal(signal) {
        // If no clarification needed, generate status message via LLM
        if (!signal.clarification_needed) {
            const statusMessage = await this.generateStatusMessage(signal);
            return {
                needs_user_input: false,
                status_message: statusMessage,
            };
        }
        // Generate question via LLM based on clarification reason
        const question = await this.generateQuestion(signal);
        const suggestedResponses = this.getSuggestedResponses(signal.clarification_reason);
        return {
            needs_user_input: true,
            question,
            suggested_responses: suggestedResponses,
        };
    }
    /**
     * Parse and normalize user response using LLM
     *
     * @param userInput - Raw user input string
     * @param context - Context from previous clarification
     * @returns Parsed user response (structure is stable regardless of LLM variation)
     */
    async parseUserResponse(userInput, context) {
        const prompt = this.buildParsePrompt(userInput, context);
        const response = await this.client.chat([
            {
                role: 'system',
                content: `You are a response parser. Analyze the user's response and classify it into exactly one of these types:
- "overwrite": User wants to overwrite an existing file
- "new_name": User wants to create with a new/different name
- "cancel": User wants to cancel the operation
- "specify_file": User specified a file name or path
- "specify_action": User specified what action to take
- "unknown": Cannot determine user's intent

Respond with ONLY a JSON object in this exact format:
{"type": "<type>", "file_name": "<extracted_file_name_if_any>", "action": "<extracted_action_if_any>"}

Do not include any explanation, only the JSON.`,
            },
            {
                role: 'user',
                content: prompt,
            },
        ]);
        return this.parseClassificationResponse(response.content, userInput);
    }
    /**
     * Normalize user response into explicit task for Runner
     *
     * @param originalPrompt - Original user prompt
     * @param signal - Runner signal that triggered clarification
     * @param parsedResponse - Parsed user response
     * @returns Normalized task (structure is always stable)
     */
    async normalizeToTask(originalPrompt, signal, parsedResponse) {
        if (parsedResponse.type === 'cancel') {
            return null;
        }
        const context = {
            original_prompt: originalPrompt,
            clarification_reason: signal.clarification_reason,
            user_response: parsedResponse.raw_input,
        };
        // Map parsed response to normalized task
        // This mapping is DETERMINISTIC - no LLM involved
        // Structure is always stable regardless of how we got here
        switch (parsedResponse.type) {
            case 'overwrite':
                return {
                    explicit_prompt: await this.generateExplicitPrompt('overwrite', signal.target_file, originalPrompt),
                    target_file: signal.target_file,
                    action: 'overwrite',
                    original_context: context,
                };
            case 'new_name':
                const newFileName = parsedResponse.new_file_name || this.generateAlternativeName(signal.target_file);
                return {
                    explicit_prompt: await this.generateExplicitPrompt('create_new', newFileName, originalPrompt),
                    target_file: newFileName,
                    action: 'create_new',
                    original_context: context,
                };
            case 'specify_file':
                return {
                    explicit_prompt: await this.generateExplicitPrompt('create', parsedResponse.new_file_name, originalPrompt),
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
    // Private LLM-powered methods
    // ============================================================
    /**
     * Generate question via LLM from clarification reason
     *
     * Each call may produce different text, but conveys the same meaning.
     */
    async generateQuestion(signal) {
        const reasonDescription = this.getReasonDescription(signal.clarification_reason);
        const response = await this.client.chat([
            {
                role: 'system',
                content: `You are a helpful assistant that generates natural Japanese questions.
Generate a clear, polite question to ask the user for clarification.
The question should be natural and conversational.
Respond with ONLY the question text, no explanations.`,
            },
            {
                role: 'user',
                content: `Generate a Japanese question for this situation:

Reason: ${reasonDescription}
${signal.target_file ? `Target file: ${signal.target_file}` : ''}
${signal.original_prompt ? `Original request: ${signal.original_prompt}` : ''}

Generate a natural Japanese question to ask the user.`,
            },
        ]);
        return response.content.trim();
    }
    /**
     * Generate status message via LLM
     */
    async generateStatusMessage(signal) {
        if (!signal.execution_result) {
            return 'タスクを処理中です。';
        }
        const result = signal.execution_result;
        let context = `Status: ${result.status}`;
        if (result.verified_files && result.verified_files.length > 0) {
            const existingFiles = result.verified_files.filter(f => f.exists).map(f => f.path);
            if (existingFiles.length > 0) {
                context += `\nCreated files: ${existingFiles.join(', ')}`;
            }
        }
        const response = await this.client.chat([
            {
                role: 'system',
                content: `You are a helpful assistant that generates natural Japanese status messages.
Generate a brief, clear status message based on the task result.
Respond with ONLY the message text, no explanations.`,
            },
            {
                role: 'user',
                content: `Generate a Japanese status message for this result:\n${context}`,
            },
        ]);
        return response.content.trim();
    }
    /**
     * Generate explicit prompt for Runner
     */
    async generateExplicitPrompt(action, targetFile, originalPrompt) {
        // For simplicity and stability, use template-based prompts
        // This ensures the structure passed to Runner is always predictable
        switch (action) {
            case 'overwrite':
                return `${targetFile} を上書きして作成してください。元のリクエスト: ${originalPrompt}`;
            case 'create_new':
                return `${targetFile} を新規作成してください。元のリクエスト: ${originalPrompt}`;
            case 'create':
                return `${targetFile} を作成してください。元のリクエスト: ${originalPrompt}`;
        }
    }
    /**
     * Get human-readable description for clarification reason
     */
    getReasonDescription(reason) {
        switch (reason) {
            case 'target_file_exists':
                return 'A file with the same name already exists. Need to decide whether to overwrite or create with a new name.';
            case 'target_file_ambiguous':
                return 'Cannot determine which file to target from the request. Need the user to specify a file name or path.';
            case 'target_action_ambiguous':
                return 'Cannot determine what action to take. Need the user to clarify what they want to do.';
            case 'missing_required_info':
                return 'Missing required information to proceed. Need the user to provide more details.';
            default:
                return 'Need clarification from the user.';
        }
    }
    /**
     * Get suggested responses for clarification reason
     */
    getSuggestedResponses(reason) {
        switch (reason) {
            case 'target_file_exists':
                return ['overwrite', 'new', 'cancel'];
            case 'target_file_ambiguous':
            case 'target_action_ambiguous':
            case 'missing_required_info':
            default:
                return [];
        }
    }
    /**
     * Build prompt for parsing user response
     */
    buildParsePrompt(userInput, context) {
        let prompt = `User input: "${userInput}"\n\n`;
        if (context.clarification_reason) {
            prompt += `Context: We asked about "${this.getReasonDescription(context.clarification_reason)}"\n`;
        }
        if (context.target_file) {
            prompt += `Target file: ${context.target_file}\n`;
        }
        if (context.original_prompt) {
            prompt += `Original request: ${context.original_prompt}\n`;
        }
        prompt += '\nClassify this response into one of the types.';
        return prompt;
    }
    /**
     * Parse LLM classification response into ParsedUserResponse
     *
     * This is the NORMALIZATION step - ensures stable structure regardless of LLM variation
     */
    parseClassificationResponse(llmResponse, rawInput) {
        try {
            // Extract JSON from response (LLM might include extra text)
            const jsonMatch = llmResponse.match(/\{[^}]+\}/);
            if (!jsonMatch) {
                return { type: 'unknown', raw_input: rawInput };
            }
            const parsed = JSON.parse(jsonMatch[0]);
            // Validate and normalize type
            const validTypes = ['overwrite', 'new_name', 'cancel', 'specify_file', 'specify_action', 'unknown'];
            const type = validTypes.includes(parsed.type)
                ? parsed.type
                : 'unknown';
            return {
                type,
                new_file_name: parsed.file_name || undefined,
                specified_action: parsed.action || undefined,
                raw_input: rawInput,
            };
        }
        catch {
            // If JSON parsing fails, return unknown
            return { type: 'unknown', raw_input: rawInput };
        }
    }
    /**
     * Generate alternative file name (deterministic, no LLM)
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
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `${baseName}_${timestamp}${ext}`;
    }
}
exports.RealLLMMediationLayer = RealLLMMediationLayer;
//# sourceMappingURL=real-llm-mediation-layer.js.map