/**
 * Selftest Generator
 * Generates test prompts dynamically (mock or AI-powered)
 * Per SELFTEST_AI_JUDGE.md specification
 */

import { GeneratorConfig, SelftestScenario, GeneratedPrompt } from './types';

/**
 * Generator interface for test prompt generation
 */
export interface ISelftestGenerator {
  /**
   * Generate a test prompt from a scenario
   */
  generate(scenario: SelftestScenario): Promise<GeneratedPrompt>;
}

/**
 * Mock Generator - uses scenario templates directly
 * Used for testing without API calls
 */
export class MockGenerator implements ISelftestGenerator {
  async generate(scenario: SelftestScenario): Promise<GeneratedPrompt> {
    // Use the template directly with minor variations
    const prompt = scenario.prompt_template.trim();

    return {
      prompt,
      hints: scenario.hints,
      scenario_id: scenario.id,
    };
  }
}

/**
 * AI Generator - uses LLM to generate varied prompts
 * Produces dynamic variations while maintaining test intent
 */
export class AIGenerator implements ISelftestGenerator {
  constructor(private config: GeneratorConfig) {}

  async generate(scenario: SelftestScenario): Promise<GeneratedPrompt> {
    // For now, fall back to mock behavior
    // Real implementation would call OpenAI/Anthropic API
    console.log(`[generator] AI generation for: ${scenario.id} (mock fallback)`);

    const mockGen = new MockGenerator();
    return mockGen.generate(scenario);
  }

  /**
   * Build the generator system prompt
   */
  private buildSystemPrompt(scenario: SelftestScenario): string {
    return `You are a test prompt generator. Generate a user request that:
- Matches this description: ${scenario.description}
- Should result in status: ${scenario.expected_status}
- Is safe (no file modifications, no external calls)
- Includes "※コード変更禁止" constraint

Template for reference:
${scenario.prompt_template}

Generate a varied version that tests the same behavior.

Output format:
PROMPT: <the generated prompt>
HINTS: <what judge should look for, one per line>`;
  }
}

/**
 * Create a generator based on config
 */
export function createGenerator(config: GeneratorConfig): ISelftestGenerator {
  if (config.use_mock) {
    console.log('[generator] Using MockGenerator');
    return new MockGenerator();
  }

  console.log('[generator] Using AIGenerator');
  return new AIGenerator(config);
}

/**
 * Generate prompts for all scenarios
 */
export async function generateAllPrompts(
  generator: ISelftestGenerator,
  scenarios: SelftestScenario[],
): Promise<GeneratedPrompt[]> {
  const prompts: GeneratedPrompt[] = [];

  for (const scenario of scenarios) {
    const prompt = await generator.generate(scenario);
    prompts.push(prompt);
  }

  return prompts;
}
