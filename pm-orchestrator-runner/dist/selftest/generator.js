"use strict";
/**
 * Selftest Generator
 * Generates test prompts dynamically (mock or AI-powered)
 * Per SELFTEST_AI_JUDGE.md specification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIGenerator = exports.MockGenerator = void 0;
exports.createGenerator = createGenerator;
exports.generateAllPrompts = generateAllPrompts;
/**
 * Mock Generator - uses scenario templates directly
 * Used for testing without API calls
 */
class MockGenerator {
    async generate(scenario) {
        // Use the template directly with minor variations
        const prompt = scenario.prompt_template.trim();
        return {
            prompt,
            hints: scenario.hints,
            scenario_id: scenario.id,
        };
    }
}
exports.MockGenerator = MockGenerator;
/**
 * AI Generator - uses LLM to generate varied prompts
 * Produces dynamic variations while maintaining test intent
 */
class AIGenerator {
    config;
    constructor(config) {
        this.config = config;
    }
    async generate(scenario) {
        // For now, fall back to mock behavior
        // Real implementation would call OpenAI/Anthropic API
        console.log(`[generator] AI generation for: ${scenario.id} (mock fallback)`);
        const mockGen = new MockGenerator();
        return mockGen.generate(scenario);
    }
    /**
     * Build the generator system prompt
     */
    buildSystemPrompt(scenario) {
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
exports.AIGenerator = AIGenerator;
/**
 * Create a generator based on config
 */
function createGenerator(config) {
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
async function generateAllPrompts(generator, scenarios) {
    const prompts = [];
    for (const scenario of scenarios) {
        const prompt = await generator.generate(scenario);
        prompts.push(prompt);
    }
    return prompts;
}
//# sourceMappingURL=generator.js.map