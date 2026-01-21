"use strict";
/**
 * Decision Classifier
 *
 * Classifies clarification requests into categories:
 * - BEST_PRACTICE: Can be auto-resolved using established conventions
 * - CASE_BY_CASE: Requires user input (product direction, preference)
 *
 * The key insight: Not all clarifications are equal.
 * Some have "correct" answers (docs go in docs/), while others
 * depend on user preference (feature A vs feature B).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionClassifier = exports.DEFAULT_BEST_PRACTICE_RULES = void 0;
/**
 * Built-in best practice rules
 * These can be auto-resolved without asking the user
 */
exports.DEFAULT_BEST_PRACTICE_RULES = [
    // File location rules
    {
        id: 'docs-location',
        pattern: /(?:documentation|spec|specification|readme|guide|tutorial)/i,
        category: 'file_location',
        resolution: 'docs/',
        reasoning: 'Documentation files should be stored in the docs/ directory',
    },
    {
        id: 'test-location',
        pattern: /(?:test|spec|\.test\.|\.spec\.)/i,
        category: 'file_location',
        resolution: 'test/ or __tests__/',
        reasoning: 'Test files should be co-located with source or in test/ directory',
    },
    {
        id: 'config-location',
        pattern: /(?:config|configuration|settings|\.config\.)/i,
        category: 'file_location',
        resolution: 'Project root or config/',
        reasoning: 'Configuration files typically reside in project root or config/',
    },
    // Naming convention rules
    {
        id: 'kebab-case-files',
        pattern: /(?:file.*name|filename|naming)/i,
        category: 'naming_convention',
        resolution: 'kebab-case (e.g., my-component.ts)',
        reasoning: 'Kebab-case is widely used for file names in modern projects',
    },
    {
        id: 'md-extension',
        pattern: /(?:markdown|documentation|readme)/i,
        category: 'file_extension',
        resolution: '.md extension',
        reasoning: 'Markdown files use .md extension by convention',
    },
    // Code organization rules
    {
        id: 'export-from-index',
        pattern: /(?:export|public.*api|module.*entry)/i,
        category: 'code_organization',
        resolution: 'Export from index.ts',
        reasoning: 'Public APIs should be exported from index.ts for clean imports',
    },
    {
        id: 'types-location',
        pattern: /(?:type|interface|typing)/i,
        category: 'file_location',
        resolution: 'types.ts or types/ directory',
        reasoning: 'Type definitions should be in types.ts or types/ directory',
    },
    // Git conventions
    {
        id: 'feature-branch',
        pattern: /(?:branch.*name|git.*branch|feature)/i,
        category: 'git_convention',
        resolution: 'feature/description-of-change',
        reasoning: 'Feature branches follow feature/description pattern',
    },
    {
        id: 'commit-message',
        pattern: /(?:commit.*message|git.*commit)/i,
        category: 'git_convention',
        resolution: 'Conventional Commits format (feat:, fix:, etc.)',
        reasoning: 'Conventional Commits provide clear change history',
    },
];
/**
 * Keywords that indicate case-by-case decisions
 * These require user input as they depend on preference/direction
 */
const CASE_BY_CASE_INDICATORS = [
    // Product direction
    /(?:which.*feature|priorit|roadmap|product.*direction)/i,
    /(?:should.*implement|implement.*first|focus.*on)/i,
    /(?:prefer|preference|choice|decide.*between)/i,
    // Design decisions
    /(?:architecture|design.*pattern|approach)/i,
    /(?:library|framework|tool).*(?:use|choose|pick)/i,
    /(?:style|aesthetic|look.*and.*feel)/i,
    // Business logic
    /(?:business.*rule|requirement|stakeholder)/i,
    /(?:user.*experience|ux|workflow)/i,
    /(?:pricing|billing|payment)/i,
    // Scope decisions
    /(?:scope|include|exclude|mvp|phase)/i,
    /(?:now.*or.*later|defer|postpone)/i,
];
/**
 * Decision Classifier
 * Determines whether a clarification can be auto-resolved
 * or requires user input
 */
class DecisionClassifier {
    rules;
    llmClient;
    constructor(customRules, llmClient) {
        this.rules = [...exports.DEFAULT_BEST_PRACTICE_RULES, ...(customRules || [])];
        this.llmClient = llmClient;
    }
    /**
     * Classify a clarification question
     */
    classify(question, context) {
        // First, check for case-by-case indicators
        for (const indicator of CASE_BY_CASE_INDICATORS) {
            if (indicator.test(question)) {
                return {
                    category: 'case_by_case',
                    confidence: 0.8,
                    reasoning: 'Question contains case-by-case indicator pattern',
                };
            }
        }
        // Check against best practice rules
        for (const rule of this.rules) {
            const pattern = typeof rule.pattern === 'string'
                ? new RegExp(rule.pattern, 'i')
                : rule.pattern;
            if (pattern.test(question) || (context && pattern.test(context))) {
                return {
                    category: 'best_practice',
                    confidence: 0.9,
                    matchedRule: rule,
                    reasoning: rule.reasoning,
                    suggestedResolution: rule.resolution,
                };
            }
        }
        // Default to unknown if no match
        return {
            category: 'unknown',
            confidence: 0.5,
            reasoning: 'No matching rule found, requires further analysis',
        };
    }
    /**
     * Classify using LLM for complex cases
     * Only called when rule-based classification returns 'unknown'
     */
    async classifyWithLLM(question, context) {
        if (!this.llmClient) {
            return {
                category: 'case_by_case', // Fail-safe: ask user when uncertain
                confidence: 0.3,
                reasoning: 'No LLM client available, defaulting to user input',
            };
        }
        try {
            const systemPrompt = `You are a decision classifier for software development tasks.

Classify the following question into one of two categories:

1. BEST_PRACTICE: The question has a generally accepted "correct" answer based on:
   - Industry conventions (e.g., docs go in docs/)
   - Coding standards (e.g., kebab-case file names)
   - Project structure norms (e.g., tests near source)
   - Common tooling conventions

2. CASE_BY_CASE: The question requires user input because it depends on:
   - Product direction or roadmap
   - Personal/team preference
   - Business requirements
   - Design decisions that could go either way
   - Scope or prioritization

Respond with ONLY a JSON object:
{
  "category": "best_practice" | "case_by_case",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "suggested_resolution": "if best_practice, provide the standard answer"
}`;
            const userPrompt = context
                ? `Question: ${question}\nContext: ${context}\n\nClassify this question.`
                : `Question: ${question}\n\nClassify this question.`;
            const response = await this.llmClient.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ]);
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON in response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                category: parsed.category,
                confidence: parsed.confidence,
                reasoning: parsed.reasoning,
                suggestedResolution: parsed.suggested_resolution,
            };
        }
        catch (error) {
            console.error('[DecisionClassifier] LLM classification failed:', error);
            return {
                category: 'case_by_case', // Fail-safe
                confidence: 0.3,
                reasoning: 'LLM classification failed, defaulting to user input',
            };
        }
    }
    /**
     * Full classification with fallback to LLM
     */
    async classifyFull(question, context) {
        // First try rule-based classification
        const ruleResult = this.classify(question, context);
        // If confident or case_by_case, return immediately
        if (ruleResult.confidence >= 0.7 || ruleResult.category === 'case_by_case') {
            return ruleResult;
        }
        // For unknown or low-confidence best_practice, try LLM
        if (this.llmClient && ruleResult.category === 'unknown') {
            return this.classifyWithLLM(question, context);
        }
        return ruleResult;
    }
    /**
     * Add a custom rule
     */
    addRule(rule) {
        this.rules.push(rule);
    }
    /**
     * Get all rules
     */
    getRules() {
        return [...this.rules];
    }
}
exports.DecisionClassifier = DecisionClassifier;
//# sourceMappingURL=decision-classifier.js.map