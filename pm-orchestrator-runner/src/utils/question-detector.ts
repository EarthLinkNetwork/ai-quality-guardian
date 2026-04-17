/**
 * Question Detector - Detects unanswered questions in task output
 * Per spec COMPLETION_JUDGMENT.md
 *
 * Used to determine if READ_INFO/REPORT tasks should be:
 * - COMPLETE: No pending questions
 * - AWAITING_RESPONSE: Contains questions requiring user input
 */

import { log } from '../logging/app-logger';

/**
 * LLM usage information for cost tracking.
 * Accumulated per-call and retrieved via getPendingUsage().
 */
export interface LlmUsageInfo {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Module-level accumulator for LLM usage in the current task.
// Safe in single-threaded Node.js where tasks execute sequentially.
let _pendingUsage: LlmUsageInfo[] = [];

/**
 * Retrieve and clear accumulated LLM usage data.
 * Call this after task execution to collect all usage from LLM calls.
 */
export function getPendingUsage(): LlmUsageInfo[] {
  const result = [..._pendingUsage];
  _pendingUsage = [];
  return result;
}

/**
 * Question detection result
 */
export interface QuestionDetectionResult {
  /** Whether unanswered questions were detected */
  hasQuestions: boolean;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** Detected patterns that triggered the detection */
  matchedPatterns: string[];
}

/**
 * Question patterns with weights
 * Higher weight = higher confidence that user response is needed
 */
interface QuestionPattern {
  pattern: RegExp;
  weight: number;
  description: string;
}

/**
 * Direct question patterns (Japanese + English)
 * Per spec COMPLETION_JUDGMENT.md L71-85
 */
const QUESTION_PATTERNS: QuestionPattern[] = [
  // Japanese patterns
  { pattern: /どう(します|しましょう)か/, weight: 0.8, description: 'JP: どうしますか' },
  { pattern: /どちら(にしますか|を選びますか)/, weight: 0.9, description: 'JP: どちらにしますか' },
  { pattern: /よろしい(です)?か/, weight: 0.8, description: 'JP: よろしいですか' },
  { pattern: /確認(させて)?ください/, weight: 0.7, description: 'JP: 確認ください' },
  { pattern: /教えてください/, weight: 0.6, description: 'JP: 教えてください' },
  { pattern: /お知らせください/, weight: 0.7, description: 'JP: お知らせください' },
  { pattern: /選んでください/, weight: 0.9, description: 'JP: 選んでください' },
  { pattern: /お選びください/, weight: 0.9, description: 'JP: お選びください' },
  { pattern: /いかがでしょうか/, weight: 0.7, description: 'JP: いかがでしょうか' },
  { pattern: /ご希望/, weight: 0.6, description: 'JP: ご希望' },
  { pattern: /しますか[？?]?/, weight: 0.7, description: 'JP: 〜しますか' },
  { pattern: /ますか[？?]?/, weight: 0.4, description: 'JP: 〜ますか (general polite question)' },

  // English patterns
  { pattern: /please (let me know|confirm|clarify)/i, weight: 0.7, description: 'EN: please let me know' },
  { pattern: /could you (please )?(specify|clarify)/i, weight: 0.7, description: 'EN: could you specify' },
  { pattern: /which (option|approach|method)/i, weight: 0.6, description: 'EN: which option' },
  { pattern: /do you (want|prefer|need)/i, weight: 0.7, description: 'EN: do you want' },
  { pattern: /should I (proceed|continue|use)/i, weight: 0.6, description: 'EN: should I proceed' },
  { pattern: /would you like/i, weight: 0.7, description: 'EN: would you like' },
  { pattern: /can you (tell|specify|provide)/i, weight: 0.6, description: 'EN: can you tell' },
  { pattern: /what (do you|would you)/i, weight: 0.7, description: 'EN: what do you' },
  { pattern: /how (do you|would you|should)/i, weight: 0.6, description: 'EN: how do you' },
];

/**
 * Option patterns (numbered/lettered choices)
 * Per spec COMPLETION_JUDGMENT.md L94-99
 */
const OPTION_PATTERNS: QuestionPattern[] = [
  { pattern: /[1-9]\)\s+\S/m, weight: 0.3, description: 'Numbered option: 1)' },
  { pattern: /[A-D]\)\s+\S/m, weight: 0.3, description: 'Lettered option: A)' },
  { pattern: /オプション\s*[1-9A-Z]/i, weight: 0.4, description: 'JP: オプション1' },
  { pattern: /選択肢/, weight: 0.3, description: 'JP: 選択肢' },
];

/**
 * Awaiting indicators that combine with options
 * Per spec COMPLETION_JUDGMENT.md L112-119
 */
const AWAITING_INDICATORS: QuestionPattern[] = [
  { pattern: /選んでください/, weight: 0.5, description: 'JP: 選んでください' },
  { pattern: /お選びください/, weight: 0.5, description: 'JP: お選びください' },
  { pattern: /please (select|choose)/i, weight: 0.5, description: 'EN: please select' },
  { pattern: /which.*prefer/i, weight: 0.4, description: 'EN: which prefer' },
];

/**
 * Question mark patterns (less reliable alone)
 */
const QUESTION_MARK_PATTERNS: QuestionPattern[] = [
  { pattern: /[?？][\s\n]*$/m, weight: 0.4, description: 'Ends with question mark' },
  { pattern: /[?？][\s]*\n/m, weight: 0.3, description: 'Question mark at line end' },
];

/**
 * Code block detection (to exclude false positives from code examples)
 */
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

/**
 * Remove code blocks from text to avoid false positives
 */
function removeCodeBlocks(text: string): string {
  // Remove fenced code blocks (```...```)
  let cleaned = text.replace(CODE_BLOCK_PATTERN, '');
  // Remove inline code (`...`) to avoid false positives from technical descriptions
  cleaned = cleaned.replace(/`[^`\n]+`/g, '');
  return cleaned;
}

/**
 * Detect if output contains unanswered questions requiring user response
 * Per spec COMPLETION_JUDGMENT.md
 *
 * @param output - The task output to analyze
 * @returns Detection result with confidence score
 */
export function detectQuestions(output: string): QuestionDetectionResult {
  if (!output || typeof output !== 'string') {
    return {
      hasQuestions: false,
      confidence: 0,
      matchedPatterns: [],
    };
  }

  // Remove code blocks to avoid false positives
  const cleanOutput = removeCodeBlocks(output);

  let totalWeight = 0;
  const matchedPatterns: string[] = [];

  // Check direct question patterns
  for (const { pattern, weight, description } of QUESTION_PATTERNS) {
    if (pattern.test(cleanOutput)) {
      totalWeight += weight;
      matchedPatterns.push(description);
    }
  }

  // Check question mark patterns (lower weight)
  for (const { pattern, weight, description } of QUESTION_MARK_PATTERNS) {
    if (pattern.test(cleanOutput)) {
      totalWeight += weight;
      matchedPatterns.push(description);
    }
  }

  // Check for options + awaiting indicators combination
  let hasOptions = false;
  for (const { pattern, description } of OPTION_PATTERNS) {
    if (pattern.test(cleanOutput)) {
      hasOptions = true;
      matchedPatterns.push(description);
      break;
    }
  }

  if (hasOptions) {
    for (const { pattern, weight, description } of AWAITING_INDICATORS) {
      if (pattern.test(cleanOutput)) {
        totalWeight += weight;
        matchedPatterns.push(description + ' (with options)');
      }
    }
  }

  // Per spec: threshold >= 0.6
  const THRESHOLD = 0.6;
  const confidence = Math.min(totalWeight, 1.0);
  const hasQuestions = confidence >= THRESHOLD;

  return {
    hasQuestions,
    confidence,
    matchedPatterns,
  };
}

/**
 * Check if output has unanswered questions (simple boolean version)
 * Per spec COMPLETION_JUDGMENT.md L69-126
 */
export function hasUnansweredQuestions(output: string): boolean {
  return detectQuestions(output).hasQuestions;
}

/**
 * Extract a concise question summary from output text.
 * Instead of using the entire output as the "question", this extracts
 * only the lines that contain actual questions.
 *
 * @param output - Full task output
 * @returns Concise question summary (max ~300 chars)
 */
export function extractQuestionSummary(output: string): string {
  if (!output || typeof output !== 'string') return '';

  const cleanOutput = removeCodeBlocks(output);
  const lines = cleanOutput.split('\n');
  const questionLines: string[] = [];

  // All patterns that indicate a question line
  const allPatterns = [
    ...QUESTION_PATTERNS.map(p => p.pattern),
    ...QUESTION_MARK_PATTERNS.map(p => p.pattern),
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line contains a question pattern
    for (const pattern of allPatterns) {
      // Reset lastIndex for regex with global flag
      pattern.lastIndex = 0;
      if (pattern.test(trimmed)) {
        questionLines.push(trimmed);
        break;
      }
    }
  }

  if (questionLines.length === 0) {
    // Fallback: first 200 chars of output
    const first = output.trim().substring(0, 200);
    return first + (output.length > 200 ? '...' : '');
  }

  // Join question lines, cap at 300 chars
  const summary = questionLines.join('\n');
  if (summary.length > 300) {
    return summary.substring(0, 300) + '...';
  }
  return summary;
}

/**
 * Determine the appropriate status for a READ_INFO/REPORT task based on output
 * Per spec COMPLETION_JUDGMENT.md L149-157
 *
 * @param output - Task output to analyze
 * @returns 'COMPLETE' if no questions, 'AWAITING_RESPONSE' if questions detected
 */
export function determineCompletionStatus(
  output: string | undefined
): 'COMPLETE' | 'AWAITING_RESPONSE' | 'INCOMPLETE' {
  // Empty output = INCOMPLETE
  if (!output || output.trim() === '') {
    return 'INCOMPLETE';
  }

  // Check for questions
  if (hasUnansweredQuestions(output)) {
    return 'AWAITING_RESPONSE';
  }

  // Has output, no questions = COMPLETE
  return 'COMPLETE';
}

/**
 * File change claim detection result
 */
export interface FileChangeClaimResult {
  /** Whether the assistant text claims to have created/modified files */
  hasClaims: boolean;
  /** LLM's reasoning */
  reasoning: string;
  /** Which provider/model was used */
  usedProvider?: string;
  usedModel?: string;
}

/**
 * LLM-based question detection result
 */
export interface LlmQuestionDetectionResult {
  /** Whether the output contains unanswered questions directed at the user */
  hasQuestions: boolean;
  /** Extracted question summary (empty if no questions) */
  questionSummary: string;
  /** LLM's reasoning */
  reasoning: string;
  /** Which provider/model was used */
  usedProvider?: string;
  usedModel?: string;
}

/**
 * LLM provider configuration for question detection
 */
export interface LlmProviderConfig {
  provider?: string;  // 'openai' | 'anthropic' | auto-detect
  model?: string;     // specific model or default for provider
  apiKey?: string;    // direct API key override
}

/** Default models per provider (cheapest/fastest for classification) */
const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

/** The shared prompt for question detection */
function buildDetectionPrompt(output: string, taskPrompt?: string): string {
  const truncated = output.length > 3000 ? output.substring(0, 3000) + '...' : output;
  return `You are analyzing the output of an AI coding assistant (Claude Code) that was given a task. Determine if the assistant is BLOCKED and genuinely needs the user to answer a question before it can proceed.

${taskPrompt ? `Original task prompt: "${taskPrompt}"` : ''}

Task output:
"""
${truncated}
"""

CRITICAL: Default to hasQuestions=false. Only flag true when the assistant is EXPLICITLY asking the user to make a choice or provide missing information WITHOUT which it CANNOT proceed.

These are NOT questions (hasQuestions=false):
- Code review observations: "this edge case might be intentional", "consider handling X"
- Suggestions or recommendations: "you might want to...", "it would be better to..."
- Rhetorical questions in explanations: "why does this work? because..."
- Technical analysis: "is this intentional?" when discussing code behavior
- Status reports with notes: "completed, but note that..."
- Completed work with follow-up suggestions: "done. you could also..."
- Questions the assistant answered itself in the output

These ARE questions (hasQuestions=true):
- "Which database should I use? Please choose: 1) PostgreSQL 2) MySQL"
- "I need your API key to proceed. What is it?"
- "The task is ambiguous. Do you want A or B?"
- The assistant explicitly says it cannot continue without user input

Respond in this exact JSON format (no markdown):
{"hasQuestions":true/false,"questionSummary":"concise question text or empty","reasoning":"brief explanation"}`;
}

/**
 * Resolve which provider and API key to use.
 * Priority: explicit config > global internalLlm setting > auto-detect from available keys
 */
async function resolveProvider(
  config?: LlmProviderConfig,
  stateDir?: string,
): Promise<{ provider: string; model: string; apiKey: string } | null> {
  // 1. Load global config for internalLlm settings (with questionDetection fallback)
  let globalProvider: string | undefined;
  let globalModel: string | undefined;
  try {
    const { loadGlobalConfig } = await import('../config/global-config');
    const gc = loadGlobalConfig();
    // Prefer internalLlm, fall back to deprecated questionDetection
    globalProvider = gc.internalLlm?.provider || gc.questionDetection?.provider;
    globalModel = gc.internalLlm?.model || gc.questionDetection?.model;
  } catch { /* ignore */ }

  // 2. Determine target provider
  const targetProvider = config?.provider || globalProvider; // may be undefined = auto-detect

  // 3. Collect available API keys
  const keys: Record<string, string> = {};

  // From stateDir api-keys.json (Web UI settings)
  // Skip keys that look like test dummies (too short to be real API keys)
  const isRealKey = (k: string) => k && k.length > 20 && !k.includes('test');
  if (stateDir) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const keysPath = path.join(stateDir, 'api-keys.json');
      if (fs.existsSync(keysPath)) {
        const data = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
        if (data?.openai?.key && isRealKey(data.openai.key)) keys.openai = data.openai.key;
        if (data?.anthropic?.key && isRealKey(data.anthropic.key)) keys.anthropic = data.anthropic.key;
      }
    } catch { /* ignore */ }
  }

  // From global config
  try {
    const { getApiKey } = await import('../config/global-config');
    if (!keys.openai) { const k = getApiKey('openai'); if (k) keys.openai = k; }
    if (!keys.anthropic) { const k = getApiKey('anthropic'); if (k) keys.anthropic = k; }
  } catch { /* ignore */ }

  // From env vars
  if (!keys.openai && process.env.OPENAI_API_KEY) keys.openai = process.env.OPENAI_API_KEY;
  if (!keys.anthropic && process.env.ANTHROPIC_API_KEY) keys.anthropic = process.env.ANTHROPIC_API_KEY;

  // Explicit API key override
  if (config?.apiKey && targetProvider) {
    keys[targetProvider] = config.apiKey;
  }

  // 4. Select provider
  let provider: string;
  if (targetProvider && keys[targetProvider]) {
    provider = targetProvider;
  } else if (targetProvider) {
    // Requested provider has no key
    return null;
  } else {
    // Auto-detect: prefer openai (cheaper), then anthropic
    if (keys.openai) provider = 'openai';
    else if (keys.anthropic) provider = 'anthropic';
    else return null;
  }

  const model = config?.model || globalModel || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;
  return { provider, model, apiKey: keys[provider] };
}

/**
 * Call OpenAI API for question detection
 */
async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<LlmQuestionDetectionResult> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  // Track usage for cost calculation
  if (response.usage) {
    _pendingUsage.push({
      provider: 'openai',
      model,
      prompt_tokens: response.usage.prompt_tokens || 0,
      completion_tokens: response.usage.completion_tokens || 0,
      total_tokens: response.usage.total_tokens || 0,
    });
  }

  const text = response.choices[0]?.message?.content || '';
  const parsed = JSON.parse(text);
  return {
    hasQuestions: parsed.hasQuestions === true,
    questionSummary: parsed.questionSummary || '',
    reasoning: parsed.reasoning || '',
    usedProvider: 'openai',
    usedModel: model,
  };
}

/**
 * Call Anthropic API for question detection
 */
async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<LlmQuestionDetectionResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  // Track usage for cost calculation
  if (response.usage) {
    _pendingUsage.push({
      provider: 'anthropic',
      model,
      prompt_tokens: response.usage.input_tokens || 0,
      completion_tokens: response.usage.output_tokens || 0,
      total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
    });
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const parsed = JSON.parse(text);
  return {
    hasQuestions: parsed.hasQuestions === true,
    questionSummary: parsed.questionSummary || '',
    reasoning: parsed.reasoning || '',
    usedProvider: 'anthropic',
    usedModel: model,
  };
}

/**
 * Detect questions using LLM for higher accuracy.
 * Supports multiple providers (OpenAI, Anthropic).
 * Falls back to regex-based detection if LLM call fails or no API key is available.
 *
 * Provider resolution order:
 * 1. Explicit config parameter
 * 2. Global config internalLlm.provider setting
 * 3. Auto-detect from available API keys (prefers OpenAI for cost)
 *
 * @param output - Task output to analyze
 * @param taskPrompt - Original task prompt for context
 * @param config - Optional provider/model/apiKey override
 * @param stateDir - Optional stateDir for reading api-keys.json
 * @returns Detection result with question summary
 */
export async function detectQuestionsWithLlm(
  output: string,
  taskPrompt?: string,
  config?: string | LlmProviderConfig,  // string for backward compat (apiKey)
  stateDir?: string,
): Promise<LlmQuestionDetectionResult> {
  if (!output || typeof output !== 'string' || output.trim() === '') {
    return { hasQuestions: false, questionSummary: '', reasoning: 'Empty output' };
  }

  // Backward compat: if config is a string, treat as apiKey
  const providerConfig: LlmProviderConfig | undefined =
    typeof config === 'string' ? { apiKey: config } : config;

  try {
    const resolved = await resolveProvider(providerConfig, stateDir);
    if (!resolved) {
      throw new Error('No LLM provider available (no API key configured)');
    }

    const prompt = buildDetectionPrompt(output, taskPrompt);
    log.app.info('Question detection using LLM', { provider: resolved.provider, model: resolved.model });

    if (resolved.provider === 'openai') {
      return await callOpenAI(resolved.apiKey, resolved.model, prompt);
    } else if (resolved.provider === 'anthropic') {
      return await callAnthropic(resolved.apiKey, resolved.model, prompt);
    } else {
      throw new Error(`Unsupported provider: ${resolved.provider}`);
    }
  } catch (error) {
    // Fallback to regex-based detection
    log.sys.warn('LLM question detection failed, falling back to regex', { error: error instanceof Error ? error.message : String(error) });
    const regexResult = detectQuestions(output);
    return {
      hasQuestions: regexResult.hasQuestions,
      questionSummary: regexResult.hasQuestions ? extractQuestionSummary(output) : '',
      reasoning: `Regex fallback (confidence: ${regexResult.confidence}, patterns: ${regexResult.matchedPatterns.join(', ')})`,
    };
  }
}

// ============================================================
// File Change Claim Detection (LLM-based with regex fallback)
// ============================================================

/** Prompt for file change claim detection */
function buildFileChangeClaimPrompt(assistantText: string): string {
  const truncated = assistantText.length > 3000 ? assistantText.substring(0, 3000) + '...' : assistantText;
  return `Analyze this AI assistant's output and determine if the assistant CLAIMS to have successfully created, modified, updated, or written any files.

Assistant output:
"""
${truncated}
"""

Rules:
- Only flag TRUE if the assistant explicitly states it has created/modified/written files
- Mentioning file names in discussion or planning is NOT a claim
- Reading or analyzing files is NOT a claim
- Proposing changes without executing them is NOT a claim
- Statements like "I created file X", "I updated Y", "The file has been modified" ARE claims
- Statements like "Let me create X", "I'll update Y" (future tense/planning) are NOT claims

Respond in this exact JSON format (no markdown):
{"hasClaims":true/false,"reasoning":"brief explanation"}`;
}

/**
 * Regex-based fallback for file change claim detection.
 * Used when LLM is not available.
 */
function detectFileChangeClaimsRegex(assistantText: string): FileChangeClaimResult {
  const patterns = [
    /(?:I |I've |I have )(?:created|updated|modified|written|added|edited)/i,
    /(?:file|files) (?:has|have) been (?:created|updated|modified|written)/i,
    /(?:作成|更新|修正|変更|編集)(?:しました|済み|完了)/,
    /Successfully (?:created|updated|modified|wrote)/i,
  ];

  const matched = patterns.filter(p => p.test(assistantText));

  return {
    hasClaims: matched.length > 0,
    reasoning: matched.length > 0
      ? `Regex fallback: matched ${matched.length} pattern(s)`
      : 'Regex fallback: no file change claim patterns matched',
  };
}

/**
 * Detect file change claims using LLM for higher accuracy.
 * Supports multiple providers (OpenAI, Anthropic).
 * Falls back to regex-based detection if LLM call fails or no API key is available.
 *
 * @param assistantText - Assistant's text output (NOT raw stream JSON)
 * @param config - Optional provider/model/apiKey override
 * @param stateDir - Optional stateDir for reading api-keys.json
 * @returns Detection result
 */
export async function detectFileChangeClaimsWithLlm(
  assistantText: string,
  config?: LlmProviderConfig,
  stateDir?: string,
): Promise<FileChangeClaimResult> {
  if (!assistantText || typeof assistantText !== 'string' || assistantText.trim() === '') {
    return { hasClaims: false, reasoning: 'Empty assistant text' };
  }

  try {
    const resolved = await resolveProvider(config, stateDir);
    if (!resolved) {
      throw new Error('No LLM provider available (no API key configured)');
    }

    const prompt = buildFileChangeClaimPrompt(assistantText);
    log.app.info('File change claim detection using LLM', { provider: resolved.provider, model: resolved.model });

    let parsed: { hasClaims: boolean; reasoning: string };

    if (resolved.provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: resolved.apiKey });
      const response = await client.chat.completions.create({
        model: resolved.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'openai', model: resolved.model,
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
        });
      }
      const text = response.choices[0]?.message?.content || '';
      parsed = JSON.parse(text);
    } else if (resolved.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: resolved.apiKey });
      const response = await client.messages.create({
        model: resolved.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'anthropic', model: resolved.model,
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        });
      }
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      parsed = JSON.parse(text);
    } else {
      throw new Error(`Unsupported provider: ${resolved.provider}`);
    }

    return {
      hasClaims: parsed.hasClaims === true,
      reasoning: parsed.reasoning || '',
      usedProvider: resolved.provider,
      usedModel: resolved.model,
    };
  } catch (error) {
    log.sys.warn('LLM file change claim detection failed, falling back to regex', { error: error instanceof Error ? error.message : String(error) });
    return detectFileChangeClaimsRegex(assistantText);
  }
}


// ============================================================
// Auto-Answer: LLM evaluates if it can answer Claude Code's question
// ============================================================

/**
 * Result of auto-answer evaluation
 */
export interface AutoAnswerResult {
  /** Whether the LLM can answer the question from context */
  canAnswer: boolean;
  /** The constructed answer/clarification to inject into prompt */
  answer?: string;
  /** Reasoning for the decision */
  reasoning: string;
  /** Provider used */
  usedProvider?: string;
}

/**
 * Build prompt for auto-answer evaluation
 */
function buildAutoAnswerPrompt(
  questionSummary: string,
  originalPrompt: string,
  claudeOutput: string,
): string {
  const truncatedOutput = claudeOutput.length > 2000
    ? claudeOutput.substring(0, 2000) + '...'
    : claudeOutput;

  return `You are a meta-AI mediator. Claude Code (an AI coding assistant) was given a task by a user, but instead of completing it, Claude Code asked a clarification question. Your job is to decide whether YOU can answer that question based on the user's original prompt context, so the task can proceed without bothering the user.

User's original prompt:
"""
${originalPrompt}
"""

Claude Code's output (which contains the question):
"""
${truncatedOutput}
"""

Claude Code's question summary: "${questionSummary}"

Rules:
1. If the user's prompt provides enough context to answer the question, answer it yourself
2. If the question is about specific technical details the user MUST decide (e.g., API keys, credentials, specific business logic), you CANNOT answer
3. For vague prompts like "make a demo" or "show it works", YOU should decide the specifics (file names, approach, etc.) — that's the whole point of having an AI mediator
4. Always err on the side of answering — only escalate to user when truly necessary
5. Your answer should be a concrete, actionable response that Claude Code can use to proceed

Respond in this exact JSON format (no markdown):
{"canAnswer":true/false,"answer":"your concrete answer to the question, or empty if canAnswer is false","reasoning":"brief explanation of why you can or cannot answer"}`;
}

/**
 * Try to auto-answer a question from Claude Code using LLM
 *
 * When Claude Code returns a question instead of completing the task,
 * this function uses the LLM to evaluate if the question can be answered
 * from the original prompt context, avoiding unnecessary AWAITING_RESPONSE.
 *
 * @param questionSummary - The detected question summary
 * @param originalPrompt - The user's original prompt
 * @param claudeOutput - Claude Code's full output text
 * @param config - Optional provider config
 * @param stateDir - Optional state directory
 * @returns Auto-answer result
 */
export async function tryAutoAnswerQuestion(
  questionSummary: string,
  originalPrompt: string,
  claudeOutput: string,
  config?: LlmProviderConfig,
  stateDir?: string,
): Promise<AutoAnswerResult> {
  if (!questionSummary || !originalPrompt) {
    return { canAnswer: false, reasoning: 'Missing question or prompt' };
  }

  try {
    const resolved = await resolveProvider(config, stateDir);
    if (!resolved) {
      return { canAnswer: false, reasoning: 'No LLM provider available' };
    }

    const prompt = buildAutoAnswerPrompt(questionSummary, originalPrompt, claudeOutput);
    log.app.info('Auto-answer evaluation using LLM', { provider: resolved.provider, model: resolved.model });

    let parsed: { canAnswer: boolean; answer: string; reasoning: string };

    if (resolved.provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: resolved.apiKey });
      const response = await client.chat.completions.create({
        model: resolved.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'openai', model: resolved.model,
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
        });
      }
      const text = response.choices[0]?.message?.content || '';
      parsed = JSON.parse(text);
    } else if (resolved.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: resolved.apiKey });
      const response = await client.messages.create({
        model: resolved.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'anthropic', model: resolved.model,
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        });
      }
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      parsed = JSON.parse(text);
    } else {
      throw new Error(`Unsupported provider: ${resolved.provider}`);
    }

    log.app.info('Auto-answer result', { canAnswer: parsed.canAnswer, reasoning: parsed.reasoning });

    return {
      canAnswer: parsed.canAnswer === true,
      answer: parsed.answer || undefined,
      reasoning: parsed.reasoning || '',
      usedProvider: resolved.provider,
    };
  } catch (error) {
    log.sys.warn('LLM auto-answer failed', { error: error instanceof Error ? error.message : String(error) });
    return { canAnswer: false, reasoning: `LLM error: ${error instanceof Error ? error.message : String(error)}` };
  }
}


// ============================================================
// LLM Relay: Meta Prompt Generation + Output QA Evaluation
// ============================================================

/**
 * Result of meta prompt generation
 */
export interface MetaPromptResult {
  /** The enhanced prompt for Claude Code */
  metaPrompt: string;
  /** What the LLM added/clarified */
  enhancements: string;
  /** Provider used */
  usedProvider?: string;
  /** Whether the task should be split into subtasks */
  shouldSplit: boolean;
  /** Subtask prompts if splitting is recommended */
  subtasks?: Array<{
    prompt: string;
    type: 'implementation' | 'test' | 'review' | 'research';
    /** Specific, verifiable conditions that must be true when the subtask is complete */
    acceptance_criteria?: string[];
  }>;
  /** Reason for splitting (or not splitting) */
  splitReason?: string;
}

/**
 * Result of output QA evaluation
 */
export interface OutputQAResult {
  /** Whether the output passes QA */
  passed: boolean;
  /** Issues found (empty if passed) */
  issues: string[];
  /** Rework instructions for Claude Code (if failed) */
  reworkInstructions?: string;
  /** Provider used */
  usedProvider?: string;
}

/**
 * Generate a meta prompt from user's raw input.
 * The LLM transforms a vague user request into structured, actionable instructions
 * for Claude Code.
 *
 * This is the PRE-PROCESSING step of the LLM relay loop.
 */
export async function generateMetaPrompt(
  userPrompt: string,
  projectContext?: string,
  config?: LlmProviderConfig,
  stateDir?: string,
): Promise<MetaPromptResult> {
  if (!userPrompt || userPrompt.trim() === '') {
    return { metaPrompt: userPrompt, enhancements: 'Empty prompt, no enhancement', shouldSplit: false };
  }

  try {
    const resolved = await resolveProvider(config, stateDir);
    if (!resolved) {
      log.sys.warn('No LLM provider available, using raw prompt');
      return { metaPrompt: userPrompt, enhancements: 'No LLM provider, passed through', shouldSplit: false };
    }

    const prompt = `You are an AI project manager. A user has submitted a task for an AI coding assistant (Claude Code). Your job is to:
1. Transform the user's raw request into a clear, structured, actionable prompt
2. Determine if the task should be split into subtasks

User's raw request:
"""
${userPrompt}
"""

${projectContext ? `Project context:\n${projectContext}\n` : ''}
Instructions for meta prompt:
1. Preserve the user's INTENT exactly — do not add features they didn't ask for
2. Clarify ambiguities by making reasonable decisions (file paths, naming, structure)
3. Add concrete acceptance criteria so Claude Code knows when it's "done"
4. Specify that tests must pass after implementation
5. Keep it concise — do not write an essay
6. CRITICAL: Always write the meta prompt in the SAME LANGUAGE as the user's input. If the user writes in Japanese, the meta prompt must be in Japanese. If in English, write in English. Never translate or switch languages.

ANTI-HALLUCINATION GUARDS (absolute, must be followed):
- NEVER invent component names, class names, function names, API names, file names, or acronyms that are not present in the user's raw request above.
- NEVER reference systems, libraries, or features the user did not mention.
- If the user's request is vague, use generic placeholders like "the target feature" / "the mentioned component" instead of inventing specifics.
- When building subtasks, each subtask prompt MUST quote the user's actual words and scope — do not substitute invented names.
- If you cannot make a subtask concrete without inventing, SET shouldSplit=false instead. A single well-scoped task is always better than multiple invented ones.

Instructions for split judgment:
Split the task into subtasks if:
1. Multiple independent changes are requested (e.g., "Add A and also fix B")
2. Multiple explicit steps are described (e.g., "1. ... 2. ... 3. ...")
3. Different files/components need changes that can be done independently
4. Test creation and implementation are requested together — always split (test isolation)

Do NOT split if:
1. Single question or information request
2. One small fix in one file
3. Simple configuration change

Respond in this exact JSON format (no markdown):
{"metaPrompt":"the enhanced prompt for Claude Code","enhancements":"brief list of what you clarified/added","shouldSplit":true/false,"subtasks":[{"prompt":"subtask 1 prompt","type":"implementation","acceptance_criteria":["verifiable condition 1","verifiable condition 2"]},{"prompt":"subtask 2 prompt","type":"test","acceptance_criteria":["all tests pass","coverage >= 80%"]}],"splitReason":"why splitting is or is not needed"}

If shouldSplit is false, subtasks should be an empty array [].
Valid subtask types: "implementation", "test", "review", "research".

CRITICAL: Every subtask MUST include acceptance_criteria — a list of specific, verifiable conditions that prove the subtask is complete. Examples:
- For UI implementation: ["Delete button appears in task detail page", "Clicking delete shows confirmation dialog", "Confirmed delete calls DELETE /api/tasks/:id and redirects"]
- For API implementation: ["GET /api/endpoint returns 200 with {field: value}", "POST with invalid data returns 400 with error message"]
- For test tasks: ["All new tests pass", "Tests cover the happy path and at least one error case"]
- For refactoring: ["Existing tests still pass", "No new TypeScript errors"]
DO NOT write vague criteria like "works correctly" or "is implemented". Each criterion must be independently verifiable.`;

    log.app.info('Meta prompt generation using LLM', { provider: resolved.provider, model: resolved.model });

    let parsed: {
      metaPrompt: string;
      enhancements: string;
      shouldSplit?: boolean;
      subtasks?: Array<{ prompt: string; type?: string; acceptance_criteria?: string[] }>;
      splitReason?: string;
    };

    if (resolved.provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: resolved.apiKey });
      const response = await client.chat.completions.create({
        model: resolved.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'openai', model: resolved.model,
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
        });
      }
      const text = response.choices[0]?.message?.content || '';
      parsed = JSON.parse(text);
    } else if (resolved.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: resolved.apiKey });
      const response = await client.messages.create({
        model: resolved.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'anthropic', model: resolved.model,
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        });
      }
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      parsed = JSON.parse(text);
    } else {
      throw new Error(`Unsupported provider: ${resolved.provider}`);
    }

    log.app.info('Meta prompt enhancements applied', { enhancements: parsed.enhancements });
    if (parsed.shouldSplit) {
      log.app.info('Task split recommended', { splitReason: parsed.splitReason, subtaskCount: parsed.subtasks?.length || 0 });
    }

    // Normalize subtask types to valid values and preserve acceptance_criteria
    const validTypes = ['implementation', 'test', 'review', 'research'] as const;
    const normalizedSubtasks = parsed.shouldSplit && parsed.subtasks
      ? parsed.subtasks.map(st => ({
          prompt: st.prompt,
          type: (validTypes.includes(st.type as typeof validTypes[number]) ? st.type : 'implementation') as 'implementation' | 'test' | 'review' | 'research',
          acceptance_criteria: Array.isArray((st as { acceptance_criteria?: unknown }).acceptance_criteria)
            ? (st as { acceptance_criteria: string[] }).acceptance_criteria
            : undefined,
        }))
      : undefined;

    return {
      metaPrompt: parsed.metaPrompt || userPrompt,
      enhancements: parsed.enhancements || '',
      usedProvider: resolved.provider,
      shouldSplit: parsed.shouldSplit === true,
      subtasks: normalizedSubtasks,
      splitReason: parsed.splitReason || undefined,
    };
  } catch (error) {
    log.sys.warn('Meta prompt generation failed, using raw prompt', { error: error instanceof Error ? error.message : String(error) });
    return { metaPrompt: userPrompt, enhancements: `Failed: ${error instanceof Error ? error.message : String(error)}`, shouldSplit: false };
  }
}

/**
 * Evaluate Claude Code's output quality using LLM.
 * Determines if the output satisfactorily completes the user's request,
 * and generates rework instructions if not.
 *
 * This is the POST-PROCESSING QA step of the LLM relay loop.
 */
export async function evaluateOutputQuality(
  claudeOutput: string,
  userPrompt: string,
  config?: LlmProviderConfig,
  stateDir?: string,
): Promise<OutputQAResult> {
  if (!claudeOutput || claudeOutput.trim() === '') {
    return { passed: false, issues: ['No output produced'], reworkInstructions: 'The task produced no output. Please complete the task.' };
  }

  try {
    const resolved = await resolveProvider(config, stateDir);
    if (!resolved) {
      // No LLM → skip QA, assume passed
      return { passed: true, issues: [] };
    }

    const truncatedOutput = claudeOutput.length > 3000
      ? claudeOutput.substring(0, 3000) + '...'
      : claudeOutput;

    const prompt = `You are a strict but fair QA reviewer. An AI coding assistant (Claude Code) was given a task and produced the following output. Evaluate whether the task was completed FULLY and CORRECTLY.

User's original request:
"""
${userPrompt}
"""

Claude Code's output:
"""
${truncatedOutput}
"""

Evaluation criteria (check ALL):
1. COMPLETENESS: Were ALL items in the user's request addressed? If the user asked for 3 things, all 3 must be done.
2. CODE CREATION: If code was requested, was it actually created (not just planned or described)?
3. TESTS: If tests were requested, were they created AND do they pass? Look for "passing" or "✓" in output.
4. FILE LOCATIONS: If specific file paths were requested, were files created at those exact paths?
5. FUNCTIONALITY: Does the implementation cover all requested functionality, not just a subset?
6. ERRORS: Did Claude Code report any errors, warnings, or issues?
7. EXECUTION: Did Claude Code actually execute (run tests, create files) or just describe what to do?

Mark as FAILED (passed=false) if ANY of these are true:
- Not all requested items were implemented
- Tests were requested but no test results shown in output
- Code was only described/planned but not created
- Specific requirements from the user were missed
- Errors were reported and not resolved
- Output ends with "I'll do X next" without actually doing it

Mark as PASSED (passed=true) only when:
- ALL requested items are verifiably completed
- Tests (if requested) show passing results
- No unresolved errors

Respond in this exact JSON format (no markdown):
{"passed":true/false,"issues":["issue1","issue2"],"reworkInstructions":"concrete instructions for what to fix, or empty if passed"}`;

    log.app.info('Output QA evaluation using LLM', { provider: resolved.provider, model: resolved.model });

    let parsed: { passed: boolean; issues: string[]; reworkInstructions: string };

    if (resolved.provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: resolved.apiKey });
      const response = await client.chat.completions.create({
        model: resolved.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'openai', model: resolved.model,
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
        });
      }
      const text = response.choices[0]?.message?.content || '';
      parsed = JSON.parse(text);
    } else if (resolved.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: resolved.apiKey });
      const response = await client.messages.create({
        model: resolved.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'anthropic', model: resolved.model,
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        });
      }
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      parsed = JSON.parse(text);
    } else {
      throw new Error(`Unsupported provider: ${resolved.provider}`);
    }

    log.app.info('Output QA result', { passed: parsed.passed, issues: parsed.issues });

    return {
      passed: parsed.passed === true,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      reworkInstructions: parsed.reworkInstructions || undefined,
      usedProvider: resolved.provider,
    };
  } catch (error) {
    log.sys.warn('QA evaluation failed, assuming passed', { error: error instanceof Error ? error.message : String(error) });
    return { passed: true, issues: [] };
  }
}


// ============================================================
// Claim Verification: Detect unverified technical claims
// ============================================================

/**
 * Result of claim verification
 */
export interface ClaimVerificationResult {
  /** Whether unverified claims were detected */
  hasUnverifiedClaims: boolean;
  /** List of detected unverified claims */
  claims: Array<{
    claim: string;
    reason: string;
  }>;
}

/**
 * Build the system prompt for claim verification
 */
function buildClaimVerificationSystemPrompt(): string {
  return `You are a fact-checker for AI-generated technical responses.

Analyze the assistant's output and identify UNVERIFIED TECHNICAL CLAIMS.

An unverified claim is a statement that:
1. States a technical limitation or capability without evidence (e.g. "X does not support Y")
2. Proposes a cause/diagnosis without having checked (e.g. "The reason is X" without running a diagnostic command)
3. Recommends an action based on assumption (e.g. "Clear your browser cache" without checking HTTP headers)

Do NOT flag:
- Code explanations (explaining what code does is fine)
- General programming knowledge (well-known facts)
- Statements with evidence (showed a command output, read a file, etc.)
- Opinions clearly marked as uncertain ("I think", "probably", "might be")

Respond in JSON format:
{
  "claims": [
    { "claim": "the exact claim text", "reason": "why it's unverified" }
  ]
}

If no unverified claims are found, respond with: { "claims": [] }`;
}

/**
 * Verify claims in Claude Code output.
 * Detects unverified technical claims (statements not backed by evidence).
 *
 * Returns a list of unverified claims detected in the output.
 * This is a best-effort check: failures are silently swallowed.
 *
 * @param output - Claude Code's output text
 * @param originalPrompt - The user's original prompt for context
 * @param config - Optional provider/model override
 * @param stateDir - Optional state directory for reading api-keys.json
 * @returns Claim verification result
 */
export async function verifyClaimsWithLlm(
  output: string,
  originalPrompt: string,
  config?: LlmProviderConfig,
  stateDir?: string,
): Promise<ClaimVerificationResult> {
  // Only check outputs longer than 200 chars (short outputs unlikely to have claims)
  if (!output || output.length <= 200) {
    return { hasUnverifiedClaims: false, claims: [] };
  }

  try {
    const resolved = await resolveProvider(config, stateDir);
    if (!resolved) {
      return { hasUnverifiedClaims: false, claims: [] };
    }

    // Truncate output if very long to save API costs
    const truncatedOutput = output.length > 3000
      ? output.substring(0, 3000) + '\n...(truncated)'
      : output;

    const systemPrompt = buildClaimVerificationSystemPrompt();
    const userPrompt = `Original task: ${originalPrompt.substring(0, 500)}\n\nAssistant's output to verify:\n${truncatedOutput}`;

    log.app.info('Claim verification using LLM', { provider: resolved.provider, model: resolved.model });

    let parsed: { claims: Array<{ claim: string; reason: string }> };

    if (resolved.provider === 'openai') {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: resolved.apiKey });
      const response = await client.chat.completions.create({
        model: resolved.model,
        max_tokens: 512,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'openai', model: resolved.model,
          prompt_tokens: response.usage.prompt_tokens || 0,
          completion_tokens: response.usage.completion_tokens || 0,
          total_tokens: response.usage.total_tokens || 0,
        });
      }
      const text = response.choices[0]?.message?.content || '{"claims":[]}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { claims: [] };
    } else if (resolved.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: resolved.apiKey });
      const response = await client.messages.create({
        model: resolved.model,
        max_tokens: 512,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      if (response.usage) {
        _pendingUsage.push({
          provider: 'anthropic', model: resolved.model,
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          total_tokens: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
        });
      }
      const text = response.content[0].type === 'text' ? response.content[0].text : '{"claims":[]}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { claims: [] };
    } else {
      throw new Error(`Unsupported provider: ${resolved.provider}`);
    }

    const claims = Array.isArray(parsed.claims) ? parsed.claims.slice(0, 5) : [];

    return {
      hasUnverifiedClaims: claims.length > 0,
      claims,
    };
  } catch (error) {
    // Silently fail - claim verification is best-effort
    log.sys.warn('Claim verification failed', { error: error instanceof Error ? error.message : String(error) });
    return { hasUnverifiedClaims: false, claims: [] };
  }
}


// ============================================================
// RED Blast Radius Operation Detection
// ============================================================

/**
 * Result of RED operation detection
 */
export interface RedOperationDetectionResult {
  /** Whether destructive operations were detected */
  detected: boolean;
  /** List of detected destructive operations */
  operations: string[];
}

/**
 * Detect RED blast radius operations in Claude Code output.
 * Returns true if output contains indicators of destructive operations.
 *
 * Checks for:
 * 1. [RED OPERATION] markers (injected by safety rules prompt)
 * 2. Actual destructive command execution patterns (executing:/running:/executed:)
 *
 * @param output - Claude Code output text to scan
 * @returns Detection result with list of destructive operations found
 */
export function detectRedOperation(output: string): RedOperationDetectionResult {
  if (!output || typeof output !== 'string') {
    return { detected: false, operations: [] };
  }

  const operations: string[] = [];

  // Check for [RED OPERATION] markers (injected by safety rules)
  const redMarkerRegex = /\[RED OPERATION\]\s*(.+)/gi;
  let match;
  while ((match = redMarkerRegex.exec(output)) !== null) {
    operations.push(match[1].trim());
  }

  // Also check for actual destructive command execution patterns
  const destructivePatterns = [
    /(?:executing|running|executed):\s*(rm\s+-rf\s+[^$\n]+)/gi,
    /(?:executing|running|executed):\s*(aws\s+\S+\s+delete\S*[^$\n]+)/gi,
    /(?:executing|running|executed):\s*(gcloud\s+\S+\s+delete[^$\n]+)/gi,
    /(?:executing|running|executed):\s*(drop\s+(?:table|database)[^$\n]+)/gi,
    /(?:executing|running|executed):\s*(git\s+push\s+--force[^$\n]+)/gi,
  ];

  for (const pattern of destructivePatterns) {
    while ((match = pattern.exec(output)) !== null) {
      operations.push(match[1].trim());
    }
  }

  return { detected: operations.length > 0, operations };
}
