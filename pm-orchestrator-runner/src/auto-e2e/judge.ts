/**
 * AI Judge
 *
 * Evaluates test responses dynamically using AI.
 * No fixed expected values - AI determines pass/fail based on context.
 */

import { JudgeInput, JudgeResult, AITestConfig } from './types';
import { getApiKey } from '../config/global-config';

/**
 * Default judge prompt template
 */
const JUDGE_SYSTEM_PROMPT = `You are an AI test judge. Your task is to evaluate whether a response adequately addresses the given prompt.

Evaluation criteria:
1. Does the response directly address the prompt?
2. Is the response complete and not truncated?
3. Does it follow any specified format requirements?
4. Is the content factually reasonable (if applicable)?
5. Does it avoid asking unnecessary questions when a direct answer is expected?

You MUST respond in valid JSON format only:
{
  "pass": true/false,
  "score": 0.0-1.0,
  "reason": "brief explanation"
}

Score guidelines:
- 0.9-1.0: Excellent response, fully addresses the prompt
- 0.7-0.89: Good response, minor issues
- 0.5-0.69: Partial response, significant gaps
- 0.3-0.49: Poor response, major issues
- 0.0-0.29: Failed to address prompt`;

/**
 * Create judge prompt from input
 */
function createJudgePrompt(input: JudgeInput): string {
  let prompt = `Evaluate this interaction:

PROMPT: ${input.prompt}

RESPONSE: ${input.response}`;

  if (input.context) {
    prompt += `\n\nCONTEXT: ${input.context}`;
  }

  if (input.expectedBehavior) {
    prompt += `\n\nEXPECTED BEHAVIOR: ${input.expectedBehavior}`;
  }

  prompt += '\n\nProvide your evaluation as JSON.';

  return prompt;
}

/**
 * Parse judge response into structured result
 */
function parseJudgeResponse(responseText: string): JudgeResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in the response
    const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      jsonStr = jsonObjMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    return {
      pass: Boolean(parsed.pass),
      score: typeof parsed.score === 'number' ? parsed.score : (parsed.pass ? 0.8 : 0.3),
      reason: parsed.reason || 'No reason provided',
      suggestions: parsed.suggestions,
    };
  } catch {
    // Fallback: try to infer from text
    const lowerText = responseText.toLowerCase();
    const pass = lowerText.includes('pass') && !lowerText.includes('fail');
    return {
      pass,
      score: pass ? 0.6 : 0.3,
      reason: 'Failed to parse JSON response, inferred from text',
    };
  }
}

/**
 * Call OpenAI API for judge evaluation
 */
async function callOpenAI(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const apiKey = getApiKey('openai');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '';
}

/**
 * AI Judge - Evaluates a response against a prompt
 */
export async function judge(input: JudgeInput, config: AITestConfig): Promise<JudgeResult> {
  const judgePrompt = createJudgePrompt(input);

  try {
    const responseText = await callOpenAI(
      JUDGE_SYSTEM_PROMPT,
      judgePrompt,
      config.judgeModel
    );

    const result = parseJudgeResponse(responseText);

    // Apply threshold
    result.pass = result.score >= config.passThreshold;

    return result;
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Judge error: ${(error as Error).message}`,
    };
  }
}

/**
 * Batch judge multiple test results
 */
export async function judgeBatch(
  inputs: JudgeInput[],
  config: AITestConfig
): Promise<JudgeResult[]> {
  const results: JudgeResult[] = [];

  for (const input of inputs) {
    const result = await judge(input, config);
    results.push(result);

    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Quick check if response likely contains questions (heuristic)
 */
export function containsQuestions(text: string): boolean {
  const questionPatterns = [
    /\?/,
    /ですか[?？]?/,
    /ましょうか[?？]?/,
    /でしょうか[?？]?/,
    /いかがですか/,
    /どうですか/,
    /確認.*ください/,
    /教えて.*ください/,
    /would you/i,
    /could you/i,
    /can you/i,
    /do you want/i,
    /shall I/i,
    /should I/i,
  ];

  return questionPatterns.some(pattern => pattern.test(text));
}

export { JUDGE_SYSTEM_PROMPT };
