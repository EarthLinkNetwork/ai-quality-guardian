/**
 * Auto-Resolving Executor with Decision Classification
 *
 * Enhanced executor that:
 * 1. Classifies clarification requests (best_practice vs case_by_case)
 * 2. Auto-resolves best practices using established conventions
 * 3. Routes case-by-case decisions to user input
 * 4. Learns from user preferences to reduce future questions
 *
 * Key insight: Not all clarifications are equal.
 * - Best practices (e.g., docs in docs/) can be auto-resolved
 * - Case-by-case (e.g., which feature first) needs user input
 * - User preferences can be learned over time
 */

import * as fs from 'fs';
import * as path from 'path';
import { ClaudeCodeExecutor, ExecutorConfig, ExecutorTask, ExecutorResult, IExecutor, AuthCheckResult } from './claude-code-executor';
import { LLMClient } from '../mediation/llm-client';
import { DecisionClassifier, ClassificationResult, BestPracticeRule } from './decision-classifier';
import { UserPreferenceStore, PreferenceMatch } from './user-preference-store';
import { getExecutorOutputStream } from './executor-output-stream';

/**
 * Clarification types detected from Claude Code output
 */
export type ClarificationType =
  | 'target_file_ambiguous'
  | 'scope_unclear'
  | 'action_ambiguous'
  | 'missing_context'
  | 'unknown';

/**
 * Fallback questions for BLOCKED status
 * Per docs/spec/BLOCKED_OUTPUT_INVARIANTS.md: INV-1
 */
export const FALLBACK_QUESTIONS = {
  default: 'YES/NO: このタスクはコード変更を許可しますか？\n(Do you permit code changes for this task?)',
  implementation: 'このタスクを実行するために、以下の情報を教えてください:\n1. 変更対象のファイル\n2. 期待する動作\n\n(Please provide the following information to proceed:\n1. Target files to modify\n2. Expected behavior)',
  blocked_timeout: 'タスクがタイムアウトしました。続行しますか？ (YES/NO)\n(Task timed out. Do you want to continue? YES/NO)',
  blocked_interactive: '対話的な確認が必要です。続行を許可しますか？ (YES/NO)\n(Interactive confirmation required. Do you allow continuing? YES/NO)',
  dangerous_op: '危険な操作の確認が必要です。続行を許可しますか？ (YES/NO)\n(Dangerous operation confirmation required. Do you allow continuing? YES/NO)',
};

/**
 * Task types that can be BLOCKED (require explicit confirmation)
 * AC D: Guard Responsibility - Only DANGEROUS_OP and forgery prevention can block
 */
export const BLOCKABLE_TASK_TYPES: string[] = ['DANGEROUS_OP'];

/**
 * Select appropriate fallback question based on blocked reason and task type
 * Exported for testing - INV-1 helper
 */
export function selectFallbackQuestion(result: ExecutorResult, task: ExecutorTask): string {
  // For DANGEROUS_OP tasks (the only type that can be BLOCKED per AC D)
  if (task.taskType === 'DANGEROUS_OP') {
    return FALLBACK_QUESTIONS.dangerous_op;
  }

  // For IMPLEMENTATION tasks, use implementation-specific question
  if (task.taskType === 'IMPLEMENTATION') {
    return FALLBACK_QUESTIONS.implementation;
  }

  // Check blocked reason for specific question
  if (result.blocked_reason === 'TIMEOUT') {
    return FALLBACK_QUESTIONS.blocked_timeout;
  }

  if (result.blocked_reason === 'INTERACTIVE_PROMPT') {
    return FALLBACK_QUESTIONS.blocked_interactive;
  }

  // Default fallback
  return FALLBACK_QUESTIONS.default;
}

/**
 * Check if a task type can be BLOCKED
 * AC D: Guard Responsibility - Only DANGEROUS_OP can be BLOCKED
 * All other task types convert BLOCKED to INCOMPLETE
 */
export function canTaskTypeBeBlocked(taskType?: string): boolean {
  return taskType !== undefined && BLOCKABLE_TASK_TYPES.includes(taskType);
}

/**
 * Apply BLOCKED output guard (INV-1)
 * Ensures BLOCKED status always has non-empty output with actionable question
 * Per docs/spec/BLOCKED_OUTPUT_INVARIANTS.md
 * Exported for testing
 */
export function applyBlockedOutputGuard(result: ExecutorResult, task: ExecutorTask): ExecutorResult {
  // Check if output is empty or insufficient
  const hasOutput = result.output && result.output.trim().length > 0;

  if (hasOutput) {
    // Output exists, but ensure it contains a question
    const hasQuestion = result.output.includes('?') ||
                        result.output.includes('YES/NO') ||
                        result.output.includes('confirm') ||
                        result.output.includes('許可') ||
                        result.output.includes('確認') ||
                        result.output.includes('？');

    if (hasQuestion) {
      console.log('[BlockedOutputGuard] INV-1: BLOCKED output already has question');
      return result;
    }

    // Add fallback question to existing output
    console.log('[BlockedOutputGuard] INV-1: Adding fallback question to BLOCKED output');
    const fallbackQuestion = selectFallbackQuestion(result, task);
    return {
      ...result,
      output: `${result.output}\n\n---\n${fallbackQuestion}`,
    };
  }

  // No output - generate fallback question based on blocked reason
  console.log('[BlockedOutputGuard] INV-1: BLOCKED with empty output, generating fallback question');
  const fallbackQuestion = selectFallbackQuestion(result, task);
  return {
    ...result,
    output: fallbackQuestion,
  };
}

/**
 * Parsed clarification from output
 */
export interface ParsedClarification {
  type: ClarificationType;
  question?: string;
  context?: string;
}

/**
 * Auto-resolution result
 */
export interface AutoResolution {
  resolved: boolean;
  resolvedValue?: string;
  explicitPrompt?: string;
  reasoning?: string;
  /** How the resolution was made */
  resolutionMethod?: 'best_practice' | 'user_preference' | 'llm_inference' | 'user_input';
}

/**
 * User response handler callback
 */
export type UserResponseHandler = (
  question: string,
  options?: string[],
  context?: string
) => Promise<string>;

/**
 * Configuration for auto-resolving executor
 */
export interface AutoResolveConfig extends ExecutorConfig {
  /** Max retry attempts for auto-resolution (default: 2) */
  maxRetries?: number;
  /** LLM provider for auto-resolution (default: openai) */
  llmProvider?: 'openai' | 'anthropic';
  /** Custom best practice rules */
  customRules?: BestPracticeRule[];
  /** User preference store configuration */
  preferenceStoreConfig?: {
    storagePath?: string;
    namespace?: string;
    minAutoApplyConfidence?: number;
  };
  /** Handler for case-by-case questions that need user input */
  userResponseHandler?: UserResponseHandler;
}

/**
 * Patterns to detect clarification requests in output
 */
const CLARIFICATION_PATTERNS = [
  // Explicit clarification markers
  /clarification_required:(\w+)/i,
  /clarification_needed:(\w+)/i,

  // Question patterns
  /where.*(?:should|save|create|put).*\?/i,
  /which.*(?:file|path|directory).*\?/i,
  /what.*(?:file|name|path).*\?/i,
  /specify.*(?:file|path|location)/i,

  // File path related (Japanese)
  /ファイル(?:名|パス).*(?:指定|教えて)/i,
  /どこに.*(?:保存|作成)/i,
  /保存先.*(?:を|は)/i,
];

function truncateForLog(input: string | undefined, maxLen: number): string {
  if (!input) return '';
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + '...';
}

/**
 * Auto-Resolving Executor with Decision Classification
 *
 * Enhanced to classify clarifications and learn user preferences
 */
export class AutoResolvingExecutor implements IExecutor {
  private readonly innerExecutor: ClaudeCodeExecutor;
  private readonly llmClient: LLMClient | null;
  private readonly maxRetries: number;
  private readonly projectPath: string;
  private readonly classifier: DecisionClassifier | null;
  private readonly preferenceStore: UserPreferenceStore;
  private readonly userResponseHandler?: UserResponseHandler;
  private readonly llmProvider: 'openai' | 'anthropic';
  private llmUnavailableReason?: string;
  private activeTaskId?: string;

  constructor(config: AutoResolveConfig) {
    this.innerExecutor = new ClaudeCodeExecutor(config);
    this.projectPath = config.projectPath;
    this.maxRetries = config.maxRetries ?? 2;
    this.userResponseHandler = config.userResponseHandler;
    this.llmProvider = config.llmProvider ?? 'openai';

    // Initialize LLM client for auto-resolution (optional - tasks work without it)
    let llmClient: LLMClient | null = null;
    let classifier: DecisionClassifier | null = null;
    try {
      llmClient = LLMClient.fromEnv(
        this.llmProvider,
        undefined,
        { temperature: 0.3 }
      );
      classifier = new DecisionClassifier(
        config.customRules,
        llmClient,
        (message: string) => this.emitLLMLog(message)
      );
    } catch (e) {
      this.llmUnavailableReason = (e as Error).message;
      console.log(`[AutoResolvingExecutor] LLM client not available (auto-resolution disabled): ${this.llmUnavailableReason}`);
    }
    this.llmClient = llmClient;
    this.classifier = classifier;

    // Initialize user preference store
    this.preferenceStore = new UserPreferenceStore(
      config.preferenceStoreConfig || {}
    );

    console.log('[AutoResolvingExecutor] Initialized with decision classification and preference learning');
    const stats = this.preferenceStore.getStats();
    console.log(`[AutoResolvingExecutor] Loaded ${stats.totalPreferences} preferences (${stats.highConfidenceCount} high-confidence)`);
  }

  /**
   * Check if Claude Code CLI is available
   */
  async isClaudeCodeAvailable(): Promise<boolean> {
    return this.innerExecutor.isClaudeCodeAvailable();
  }

  /**
   * Check Claude Code CLI auth status
   */
  async checkAuthStatus(): Promise<AuthCheckResult> {
    return this.innerExecutor.checkAuthStatus();
  }

  /**
   * Execute task with smart clarification handling
   */
  async execute(task: ExecutorTask): Promise<ExecutorResult> {
    let attempts = 0;
    let currentTask = task;
    let lastResult: ExecutorResult | undefined;
    this.activeTaskId = task.id;

    // Guard trace: log task type and guard decision
    const guardStream = getExecutorOutputStream();
    guardStream.emit(task.id, 'guard', `[guard] taskType=${task.taskType || 'unknown'}`);
    guardStream.emit(task.id, 'guard', `[guard] maxRetries=${this.maxRetries}`);

    while (attempts < this.maxRetries) {
      attempts++;
      console.log(`[AutoResolvingExecutor] Attempt ${attempts}/${this.maxRetries}`);

      // Execute with inner executor
      const result = await this.innerExecutor.execute(currentTask);
      lastResult = result;

      // If successful, return
      if (result.status === 'COMPLETE') {
        console.log('[AutoResolvingExecutor] Task completed successfully');
        guardStream.emit(task.id, 'guard', `[guard] decision=PROCEED status=COMPLETE`);
        return result;
      }

      // READ_INFO/REPORT tasks: output itself is the deliverable, not file evidence
      // If we have output, treat as COMPLETE regardless of file evidence status
      if ((task.taskType === 'READ_INFO' || task.taskType === 'REPORT') &&
          result.output && result.output.trim().length > 0) {
        console.log(`[AutoResolvingExecutor] ${task.taskType} task completed with output (file evidence not required)`);
        return {
          ...result,
          status: 'COMPLETE',
        };
      }

      // INV-1: BLOCKED Output Non-Empty Guard
      // Per docs/spec/BLOCKED_OUTPUT_INVARIANTS.md
      if (result.status === 'BLOCKED') {
        const guardedResult = applyBlockedOutputGuard(result, task);

        // AC D: Guard Responsibility - Only DANGEROUS_OP can be BLOCKED
        // All other task types convert BLOCKED to INCOMPLETE
        // This replaces the previous INV-2 (IMPLEMENTATION-only prohibition)
        if (!canTaskTypeBeBlocked(task.taskType)) {
          const taskTypeStr = task.taskType || 'unknown';
          console.log(`[AutoResolvingExecutor] AC D Guard: Converting ${taskTypeStr} BLOCKED to INCOMPLETE (only DANGEROUS_OP can be BLOCKED)`);
          guardStream.emit(task.id, 'guard', `[guard] decision=BLOCKED_TO_INCOMPLETE taskType=${taskTypeStr}`);
          return {
            ...guardedResult,
            status: 'INCOMPLETE' as const, // AWAITING_RESPONSE is handled at higher level
            error: guardedResult.output, // Output becomes the clarification question
          };
        }

        // DANGEROUS_OP: Allow BLOCKED status (requires explicit user confirmation)
        console.log('[AutoResolvingExecutor] AC D Guard: DANGEROUS_OP task allowed to be BLOCKED');
        guardStream.emit(task.id, 'guard', `[guard] decision=BLOCKED (DANGEROUS_OP)`);
        return guardedResult;
      }

      // Check if clarification is needed
      const clarification = this.detectClarification(result.output, result.error);

      if (!clarification || clarification.type === 'unknown') {
        console.log('[AutoResolvingExecutor] No resolvable clarification detected');
        return result;
      }

      console.log(`[AutoResolvingExecutor] Clarification detected: ${clarification.type}`);
      this.emitLLMLog(
        `clarification detected type=${clarification.type} question="${truncateForLog(clarification.question, 140)}"`
      );

      // Smart resolution with classification
      const resolution = await this.smartResolve(clarification, currentTask.prompt);

      if (!resolution.resolved || !resolution.explicitPrompt) {
        console.log('[AutoResolvingExecutor] Could not resolve, returning original result');
        return result;
      }

      console.log(`[AutoResolvingExecutor] Resolved via ${resolution.resolutionMethod}: ${resolution.reasoning}`);
      this.emitLLMLog(
        `resolved via ${resolution.resolutionMethod || 'unknown'} value="${truncateForLog(resolution.resolvedValue, 120)}"`
      );

      // Update task with explicit prompt
      this.emitLLMLog('retrying with explicit prompt (auto-resolve)');
      currentTask = {
        ...task,
        prompt: resolution.explicitPrompt,
      };
    }

    console.log('[AutoResolvingExecutor] Max retries reached');
    return lastResult!;
  }

  /**
   * Smart resolution using classification and preferences
   */
  private async smartResolve(
    clarification: ParsedClarification,
    originalPrompt: string
  ): Promise<AutoResolution> {
    const question = clarification.question || this.generateQuestionFromType(clarification.type);
    const category = this.mapClarificationTypeToCategory(clarification.type);

    // Step 1: Check user preferences first
    const preferenceMatch = this.preferenceStore.findMatch(category, question, clarification.context);
    
    if (preferenceMatch && this.preferenceStore.canAutoApply(preferenceMatch)) {
      console.log(`[AutoResolvingExecutor] Found high-confidence preference: ${preferenceMatch.preference.choice}`);
      this.emitLLMLog(`preference applied choice="${truncateForLog(preferenceMatch.preference.choice, 120)}"`);
      
      return this.applyPreference(preferenceMatch, originalPrompt, clarification);
    }

    // Step 2: Classify the clarification (requires LLM client)
    if (!this.classifier) {
      console.log('[AutoResolvingExecutor] No classifier available, cannot auto-resolve');
      this.emitLLMLog(`auto-resolve unavailable: ${this.llmUnavailableReason || 'classifier not initialized'}`);
      return { resolved: false };
    }
    const classification = await this.classifier.classifyFull(question, clarification.context);
    console.log(`[AutoResolvingExecutor] Classification: ${classification.category} (confidence: ${classification.confidence})`);
    this.emitLLMLog(
      `classification ${classification.category} confidence=${classification.confidence.toFixed(2)} reason="${truncateForLog(classification.reasoning, 140)}"`
    );

    // Step 3: Route based on classification
    switch (classification.category) {
      case 'best_practice':
        return this.resolveBestPractice(classification, originalPrompt, clarification);

      case 'case_by_case':
        return this.handleCaseByCase(classification, originalPrompt, clarification, category);

      default:
        // Unknown - try LLM inference as fallback
        return this.autoResolve(clarification, originalPrompt);
    }
  }

  /**
   * Apply a matched user preference
   */
  private applyPreference(
    match: PreferenceMatch,
    originalPrompt: string,
    clarification: ParsedClarification
  ): AutoResolution {
    const choice = match.preference.choice;
    const prefContext = match.preference.context || choice;
    
    // Build explicit prompt with the preferred choice
    const explicitPrompt = this.buildExplicitPrompt(
      originalPrompt,
      clarification,
      choice,
      `Based on your previous preference: ${prefContext}`
    );

    return {
      resolved: true,
      resolvedValue: choice,
      explicitPrompt,
      reasoning: `Applied user preference (confidence: ${match.preference.confidence.toFixed(2)}, matched keywords: ${match.matchedKeywords.join(', ')})`,
      resolutionMethod: 'user_preference',
    };
  }

  /**
   * Resolve using best practice rules
   */
  private async resolveBestPractice(
    classification: ClassificationResult,
    originalPrompt: string,
    clarification: ParsedClarification
  ): Promise<AutoResolution> {
    const resolution = classification.suggestedResolution || classification.matchedRule?.resolution;
    
    if (!resolution) {
      // Fallback to LLM inference
      return this.autoResolve(clarification, originalPrompt);
    }

    this.emitLLMLog(`best_practice resolution="${truncateForLog(resolution, 120)}"`);

    const explicitPrompt = this.buildExplicitPrompt(
      originalPrompt,
      clarification,
      resolution,
      classification.reasoning
    );

    return {
      resolved: true,
      resolvedValue: resolution,
      explicitPrompt,
      reasoning: `Best practice: ${classification.reasoning}`,
      resolutionMethod: 'best_practice',
    };
  }

  /**
   * Handle case-by-case decisions that need user input
   */
  private async handleCaseByCase(
    classification: ClassificationResult,
    originalPrompt: string,
    clarification: ParsedClarification,
    category: string
  ): Promise<AutoResolution> {
    const question = clarification.question || this.generateQuestionFromType(clarification.type);

    // Check if we have a user response handler
    if (!this.userResponseHandler) {
      console.log('[AutoResolvingExecutor] No user response handler, falling back to LLM');
      this.emitLLMLog('case_by_case -> fallback to LLM inference (no user handler)');
      return this.autoResolve(clarification, originalPrompt);
    }

    // Ask the user
    console.log(`[AutoResolvingExecutor] Asking user: ${question}`);
    
    try {
      const contextStr = clarification.context || 'No additional context';
      const userChoice = await this.userResponseHandler(
        question,
        undefined, // Options could be extracted from context
        `Context: ${contextStr}`
      );

      this.emitLLMLog(`case_by_case user choice="${truncateForLog(userChoice, 120)}"`);

      // Record the preference for future use
      this.preferenceStore.recordPreference(
        category,
        question,
        userChoice,
        clarification.context
      );

      // Build explicit prompt with user's choice
      const explicitPrompt = this.buildExplicitPrompt(
        originalPrompt,
        clarification,
        userChoice,
        'User specified'
      );

      return {
        resolved: true,
        resolvedValue: userChoice,
        explicitPrompt,
        reasoning: `User chose: ${userChoice}`,
        resolutionMethod: 'user_input',
      };
    } catch (error) {
      console.error('[AutoResolvingExecutor] User response error:', error);
      this.emitLLMLog(`user response error: ${truncateForLog((error as Error).message, 160)}`);
      // Fallback to LLM inference
      return this.autoResolve(clarification, originalPrompt);
    }
  }

  /**
   * Build an explicit prompt with the resolved value
   */
  private buildExplicitPrompt(
    originalPrompt: string,
    clarification: ParsedClarification,
    resolvedValue: string,
    reasoning: string
  ): string {
    switch (clarification.type) {
      case 'target_file_ambiguous':
        return `${originalPrompt}

Important: Save the file to: ${resolvedValue}
Reason: ${reasoning}
Do not ask for clarification. Create the file at the specified path.`;

      case 'scope_unclear':
        return `${originalPrompt}

Scope clarification: ${resolvedValue}
Reason: ${reasoning}
Do not ask for clarification. Proceed with the clarified scope.`;

      case 'action_ambiguous':
        return `${originalPrompt}

Action to take: ${resolvedValue}
Reason: ${reasoning}
Do not ask for clarification. Proceed with the specified action.`;

      default:
        return `${originalPrompt}

Clarification: ${resolvedValue}
Reason: ${reasoning}
Do not ask for further clarification. Proceed with the above.`;
    }
  }

  /**
   * Map clarification type to preference category
   */
  private mapClarificationTypeToCategory(type: ClarificationType): string {
    switch (type) {
      case 'target_file_ambiguous':
        return 'file_location';
      case 'scope_unclear':
        return 'task_scope';
      case 'action_ambiguous':
        return 'action_choice';
      case 'missing_context':
        return 'context_clarification';
      default:
        return 'general';
    }
  }

  /**
   * Generate a question from clarification type
   */
  private generateQuestionFromType(type: ClarificationType): string {
    switch (type) {
      case 'target_file_ambiguous':
        return 'Where should the file be saved?';
      case 'scope_unclear':
        return 'What is the scope of this task?';
      case 'action_ambiguous':
        return 'What action should be taken?';
      case 'missing_context':
        return 'Can you provide more context?';
      default:
        return 'Need clarification';
    }
  }

  /**
   * Detect clarification request from output
   */
  private detectClarification(output: string, error?: string): ParsedClarification | null {
    const errorStr = error || '';
    const combined = `${output}\n${errorStr}`;

    // Check for explicit clarification markers
    for (const pattern of CLARIFICATION_PATTERNS) {
      const match = combined.match(pattern);
      if (match) {
        let type: ClarificationType = 'unknown';

        if (match[1]) {
          const typeStr = match[1].toLowerCase();
          if (typeStr.includes('file') || typeStr.includes('path')) {
            type = 'target_file_ambiguous';
          } else if (typeStr.includes('scope')) {
            type = 'scope_unclear';
          } else if (typeStr.includes('action')) {
            type = 'action_ambiguous';
          } else if (typeStr.includes('context') || typeStr.includes('missing')) {
            type = 'missing_context';
          }
        } else {
          if (/(?:file|path|save|create|put|保存|作成)/i.test(match[0])) {
            type = 'target_file_ambiguous';
          }
        }

        const questionMatch = combined.match(/([^.!?\n]*\?)/);

        return {
          type,
          question: questionMatch?.[1],
          context: combined.substring(0, 500),
        };
      }
    }

    if (combined.includes('INCOMPLETE') || combined.includes('incomplete')) {
      const questionMatch = combined.match(/([^.!?\n]*\?)/);
      if (questionMatch) {
        return {
          type: 'target_file_ambiguous',
          question: questionMatch[1],
          context: combined.substring(0, 500),
        };
      }
    }

    return null;
  }

  /**
   * Auto-resolve clarification using LLM (fallback method)
   */
  private async autoResolve(
    clarification: ParsedClarification,
    originalPrompt: string
  ): Promise<AutoResolution> {
    this.emitLLMLog(`auto-resolve via LLM inference type=${clarification.type}`);
    try {
      switch (clarification.type) {
        case 'target_file_ambiguous':
          return this.resolveFilePath(originalPrompt, clarification);

        case 'scope_unclear':
          return this.resolveScope(originalPrompt, clarification);

        case 'action_ambiguous':
          return this.resolveAction(originalPrompt, clarification);

        default:
          return { resolved: false };
      }
    } catch (error) {
      console.error('[AutoResolvingExecutor] Auto-resolve error:', error);
      return { resolved: false };
    }
  }

  /**
   * Resolve ambiguous file path using LLM
   */
  private async resolveFilePath(
    originalPrompt: string,
    clarification: ParsedClarification
  ): Promise<AutoResolution> {
    if (!this.llmClient) {
      this.emitLLMLog(`LLM unavailable for resolveFilePath: ${this.llmUnavailableReason || 'missing client'}`);
      return { resolved: false };
    }
    const projectStructure = this.scanProjectStructure();
    const questionStr = clarification.question || 'Where should the file be saved?';

    this.emitLLMLog(`resolveFilePath request question="${truncateForLog(questionStr, 120)}"`);
    const response = await this.llmClient.chat([
      {
        role: 'system',
        content: `You are an AI assistant that decides file paths for development tasks.
Based on the project structure and task description, determine the most appropriate file path.

Rules:
1. Documentation should go in docs/ directory (create if doesn't exist)
2. Spec/specification files should be named *-spec.md or spec-*.md
3. Use kebab-case for file names
4. Use .md extension for documentation
5. Be specific and include full relative path

Respond with ONLY a JSON object:
{"file_path": "<path>", "reasoning": "<brief explanation>"}`,
      },
      {
        role: 'user',
        content: `Project structure:
${projectStructure}

Task: ${originalPrompt}
Question from system: ${questionStr}

Determine the appropriate file path.`,
      },
    ]);

    this.emitLLMLog(`resolveFilePath response="${truncateForLog(response.content, 200)}"`);

    try {
      const jsonMatch = response.content.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        return { resolved: false };
      }

      const parsed = JSON.parse(jsonMatch[0]) as { file_path: string; reasoning: string };
      this.emitLLMLog(`resolveFilePath resolved file_path="${truncateForLog(parsed.file_path, 140)}"`);

      return {
        resolved: true,
        resolvedValue: parsed.file_path,
        explicitPrompt: this.buildExplicitPrompt(
          originalPrompt,
          clarification,
          parsed.file_path,
          parsed.reasoning
        ),
        reasoning: parsed.reasoning,
        resolutionMethod: 'llm_inference',
      };
    } catch {
      return { resolved: false };
    }
  }

  /**
   * Resolve unclear scope using LLM
   */
  private async resolveScope(
    originalPrompt: string,
    clarification: ParsedClarification
  ): Promise<AutoResolution> {
    if (!this.llmClient) {
      this.emitLLMLog(`LLM unavailable for resolveScope: ${this.llmUnavailableReason || 'missing client'}`);
      return { resolved: false };
    }
    const questionStr = clarification.question || 'What is the scope?';

    this.emitLLMLog(`resolveScope request question="${truncateForLog(questionStr, 120)}"`);
    const response = await this.llmClient.chat([
      {
        role: 'system',
        content: `You are an AI assistant that clarifies task scope.
When the scope is unclear, make a reasonable decision based on common development practices.

Respond with ONLY a JSON object:
{"clarified_scope": "<specific scope>", "reasoning": "<brief explanation>"}`,
      },
      {
        role: 'user',
        content: `Original task: ${originalPrompt}
Question: ${questionStr}

Clarify the scope.`,
      },
    ]);

    this.emitLLMLog(`resolveScope response="${truncateForLog(response.content, 200)}"`);

    try {
      const jsonMatch = response.content.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        return { resolved: false };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        clarified_scope: string;
        reasoning: string;
      };

      return {
        resolved: true,
        resolvedValue: parsed.clarified_scope,
        explicitPrompt: this.buildExplicitPrompt(
          originalPrompt,
          clarification,
          parsed.clarified_scope,
          parsed.reasoning
        ),
        reasoning: parsed.reasoning,
        resolutionMethod: 'llm_inference',
      };
    } catch {
      return { resolved: false };
    }
  }

  /**
   * Resolve ambiguous action using LLM
   */
  private async resolveAction(
    originalPrompt: string,
    clarification: ParsedClarification
  ): Promise<AutoResolution> {
    if (!this.llmClient) {
      this.emitLLMLog(`LLM unavailable for resolveAction: ${this.llmUnavailableReason || 'missing client'}`);
      return { resolved: false };
    }
    const questionStr = clarification.question || 'What action should be taken?';

    this.emitLLMLog(`resolveAction request question="${truncateForLog(questionStr, 120)}"`);
    const response = await this.llmClient.chat([
      {
        role: 'system',
        content: `You are an AI assistant that clarifies ambiguous actions.
When the action is unclear, make a reasonable decision based on the context.

Respond with ONLY a JSON object:
{"action": "<specific action>", "reasoning": "<brief explanation>"}`,
      },
      {
        role: 'user',
        content: `Original task: ${originalPrompt}
Question: ${questionStr}

Clarify the action.`,
      },
    ]);

    this.emitLLMLog(`resolveAction response="${truncateForLog(response.content, 200)}"`);

    try {
      const jsonMatch = response.content.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        return { resolved: false };
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        action: string;
        reasoning: string;
      };

      return {
        resolved: true,
        resolvedValue: parsed.action,
        explicitPrompt: this.buildExplicitPrompt(
          originalPrompt,
          clarification,
          parsed.action,
          parsed.reasoning
        ),
        reasoning: parsed.reasoning,
        resolutionMethod: 'llm_inference',
      };
    } catch {
      return { resolved: false };
    }
  }

  private emitLLMLog(message: string): void {
    if (!this.activeTaskId) {
      return;
    }
    const text = message.startsWith('[llm]') ? message : `[llm] ${message}`;
    getExecutorOutputStream().emit(this.activeTaskId, 'system', text);
  }

  /**
   * Scan project structure for context
   */
  private scanProjectStructure(): string {
    const structure: string[] = [];
    const maxDepth = 3;
    const maxEntries = 50;
    let entryCount = 0;

    const scan = (dir: string, depth: number, prefix: string): void => {
      if (depth > maxDepth || entryCount >= maxEntries) return;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        const sorted = entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        for (const entry of sorted) {
          if (entryCount >= maxEntries) break;

          if (entry.name.startsWith('.') ||
              entry.name === 'node_modules' ||
              entry.name === 'dist' ||
              entry.name === 'build' ||
              entry.name === 'coverage') {
            continue;
          }

          entryCount++;
          const isDir = entry.isDirectory();
          structure.push(`${prefix}${isDir ? '/' : ''}${entry.name}`);

          if (isDir) {
            scan(path.join(dir, entry.name), depth + 1, prefix + '  ');
          }
        }
      } catch {
        // Directory not accessible
      }
    };

    scan(this.projectPath, 0, '');

    return structure.join('\n') || '(empty project)';
  }

  /**
   * Get preference store statistics
   */
  getPreferenceStats(): {
    totalPreferences: number;
    byCategory: Record<string, number>;
    avgConfidence: number;
    highConfidenceCount: number;
  } {
    return this.preferenceStore.getStats();
  }

  /**
   * Clear all learned preferences
   */
  clearPreferences(): void {
    this.preferenceStore.clear();
    console.log('[AutoResolvingExecutor] All preferences cleared');
  }
}
