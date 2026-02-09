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
export declare class MockGenerator implements ISelftestGenerator {
    generate(scenario: SelftestScenario): Promise<GeneratedPrompt>;
}
/**
 * AI Generator - uses LLM to generate varied prompts
 * Produces dynamic variations while maintaining test intent
 */
export declare class AIGenerator implements ISelftestGenerator {
    private config;
    constructor(config: GeneratorConfig);
    generate(scenario: SelftestScenario): Promise<GeneratedPrompt>;
    /**
     * Build the generator system prompt
     */
    private buildSystemPrompt;
}
/**
 * Create a generator based on config
 */
export declare function createGenerator(config: GeneratorConfig): ISelftestGenerator;
/**
 * Generate prompts for all scenarios
 */
export declare function generateAllPrompts(generator: ISelftestGenerator, scenarios: SelftestScenario[]): Promise<GeneratedPrompt[]>;
//# sourceMappingURL=generator.d.ts.map