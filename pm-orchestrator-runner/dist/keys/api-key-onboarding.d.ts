/**
 * API Key Onboarding Module
 *
 * Handles the API key input flow on first launch.
 * Requirements:
 * - Must enter API Key Input Flow before .claude initialization
 * - No immediate exit on error - allow interactive input
 * - Validate keys against provider APIs
 * - Re-prompt on invalid keys (unlimited retries)
 * - Save valid keys and transition to normal flow
 */
/**
 * Result of the onboarding process
 */
export interface OnboardingResult {
    success: boolean;
    provider?: 'openai' | 'anthropic';
    skipped?: boolean;
    error?: string;
}
/**
 * Run the API key onboarding flow
 *
 * @param skipIfKeyExists - If true, skip onboarding if any API key is already configured
 * @returns OnboardingResult indicating success/failure
 */
export declare function runApiKeyOnboarding(skipIfKeyExists?: boolean): Promise<OnboardingResult>;
/**
 * Check if onboarding is required
 * Returns true if no API key is configured and --no-auth is not specified
 */
export declare function isOnboardingRequired(noAuthOption?: boolean): boolean;
//# sourceMappingURL=api-key-onboarding.d.ts.map