/**
 * Supervisor Template Engine
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md SUP-2, SUP-3
 *
 * Composition Order (immutable):
 * [GLOBAL_INPUT_TEMPLATE]
 * [PROJECT_INPUT_TEMPLATE]
 * [USER_PROMPT]
 */

import { ComposedPrompt, FormattedOutput } from './types';

// =============================================================================
// Template Markers
// =============================================================================

const TEMPLATE_MARKERS = {
  GLOBAL_START: '<!-- GLOBAL_TEMPLATE_START -->',
  GLOBAL_END: '<!-- GLOBAL_TEMPLATE_END -->',
  PROJECT_START: '<!-- PROJECT_TEMPLATE_START -->',
  PROJECT_END: '<!-- PROJECT_TEMPLATE_END -->',
  USER_START: '<!-- USER_PROMPT_START -->',
  USER_END: '<!-- USER_PROMPT_END -->',
  OUTPUT_START: '<!-- FORMATTED_OUTPUT_START -->',
  OUTPUT_END: '<!-- FORMATTED_OUTPUT_END -->',
};

// =============================================================================
// Input Template Composition (SUP-2)
// =============================================================================

/**
 * Merge prompts in strict order: global → project → user
 *
 * @param globalTemplate - Global input template (always first)
 * @param projectTemplate - Project input template (second)
 * @param userPrompt - User's actual prompt (last)
 * @returns Composed prompt with all parts
 */
export function mergePrompt(
  globalTemplate: string,
  projectTemplate: string,
  userPrompt: string
): ComposedPrompt {
  const parts: string[] = [];

  // 1. Global template (always first)
  if (globalTemplate && globalTemplate.trim()) {
    parts.push(globalTemplate.trim());
  }

  // 2. Project template (second)
  if (projectTemplate && projectTemplate.trim()) {
    parts.push(projectTemplate.trim());
  }

  // 3. User prompt (always last)
  if (userPrompt && userPrompt.trim()) {
    parts.push(userPrompt.trim());
  }

  // Compose with double newline separation
  const composed = parts.join('\n\n');

  return {
    globalTemplate: globalTemplate || '',
    projectTemplate: projectTemplate || '',
    userPrompt: userPrompt || '',
    composed,
  };
}

/**
 * Merge prompts with explicit markers for debugging/inspection
 */
export function mergePromptWithMarkers(
  globalTemplate: string,
  projectTemplate: string,
  userPrompt: string
): ComposedPrompt {
  const parts: string[] = [];

  // 1. Global template with markers
  if (globalTemplate && globalTemplate.trim()) {
    parts.push(TEMPLATE_MARKERS.GLOBAL_START);
    parts.push(globalTemplate.trim());
    parts.push(TEMPLATE_MARKERS.GLOBAL_END);
  }

  // 2. Project template with markers
  if (projectTemplate && projectTemplate.trim()) {
    parts.push(TEMPLATE_MARKERS.PROJECT_START);
    parts.push(projectTemplate.trim());
    parts.push(TEMPLATE_MARKERS.PROJECT_END);
  }

  // 3. User prompt with markers
  if (userPrompt && userPrompt.trim()) {
    parts.push(TEMPLATE_MARKERS.USER_START);
    parts.push(userPrompt.trim());
    parts.push(TEMPLATE_MARKERS.USER_END);
  }

  const composed = parts.join('\n');

  return {
    globalTemplate: globalTemplate || '',
    projectTemplate: projectTemplate || '',
    userPrompt: userPrompt || '',
    composed,
  };
}

// =============================================================================
// Output Template Application (SUP-3)
// =============================================================================

/**
 * Apply output template to raw LLM output
 *
 * @param rawOutput - Raw output from LLM
 * @param outputTemplate - Template to apply (can contain {{OUTPUT}} placeholder)
 * @returns Formatted output
 */
export function applyOutputTemplate(
  rawOutput: string,
  outputTemplate: string
): FormattedOutput {
  // No template = pass through
  if (!outputTemplate || !outputTemplate.trim()) {
    return {
      raw: rawOutput,
      formatted: rawOutput,
      templateApplied: false,
    };
  }

  // Check for placeholder
  const placeholder = '{{OUTPUT}}';
  let formatted: string;

  if (outputTemplate.includes(placeholder)) {
    // Replace placeholder with actual output
    formatted = outputTemplate.replace(placeholder, rawOutput);
  } else {
    // Append raw output to template
    formatted = `${outputTemplate.trim()}\n\n${rawOutput}`;
  }

  return {
    raw: rawOutput,
    formatted,
    templateApplied: true,
  };
}

/**
 * Apply output template with markers for debugging
 */
export function applyOutputTemplateWithMarkers(
  rawOutput: string,
  outputTemplate: string
): FormattedOutput {
  const result = applyOutputTemplate(rawOutput, outputTemplate);

  if (result.templateApplied) {
    result.formatted = [
      TEMPLATE_MARKERS.OUTPUT_START,
      result.formatted,
      TEMPLATE_MARKERS.OUTPUT_END,
    ].join('\n');
  }

  return result;
}

// =============================================================================
// Template Variable Substitution
// =============================================================================

interface TemplateVariables {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Substitute variables in template ({{VAR_NAME}} format)
 */
export function substituteVariables(
  template: string,
  variables: TemplateVariables
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      const placeholder = `{{${key}}}`;
      result = result.split(placeholder).join(String(value));
    }
  }

  return result;
}

// =============================================================================
// Template Validation
// =============================================================================

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate template syntax
 */
export function validateTemplate(template: string): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for unclosed placeholders
  const openBraces = (template.match(/\{\{/g) || []).length;
  const closeBraces = (template.match(/\}\}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push(`Unmatched braces: ${openBraces} open, ${closeBraces} close`);
  }

  // Check for common issues
  if (template.includes('{{OUTPUT}}') && template.split('{{OUTPUT}}').length > 2) {
    warnings.push('Multiple {{OUTPUT}} placeholders found - only first will be used');
  }

  // Check for empty template
  if (!template.trim()) {
    warnings.push('Template is empty');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// Extract Components from Composed Prompt
// =============================================================================

export interface ExtractedComponents {
  globalTemplate: string | null;
  projectTemplate: string | null;
  userPrompt: string | null;
}

/**
 * Extract components from a prompt that was composed with markers
 */
export function extractComponents(composedPrompt: string): ExtractedComponents {
  const result: ExtractedComponents = {
    globalTemplate: null,
    projectTemplate: null,
    userPrompt: null,
  };

  // Extract global template
  const globalMatch = composedPrompt.match(
    new RegExp(`${escapeRegex(TEMPLATE_MARKERS.GLOBAL_START)}\\n([\\s\\S]*?)\\n${escapeRegex(TEMPLATE_MARKERS.GLOBAL_END)}`)
  );
  if (globalMatch) {
    result.globalTemplate = globalMatch[1];
  }

  // Extract project template
  const projectMatch = composedPrompt.match(
    new RegExp(`${escapeRegex(TEMPLATE_MARKERS.PROJECT_START)}\\n([\\s\\S]*?)\\n${escapeRegex(TEMPLATE_MARKERS.PROJECT_END)}`)
  );
  if (projectMatch) {
    result.projectTemplate = projectMatch[1];
  }

  // Extract user prompt
  const userMatch = composedPrompt.match(
    new RegExp(`${escapeRegex(TEMPLATE_MARKERS.USER_START)}\\n([\\s\\S]*?)\\n${escapeRegex(TEMPLATE_MARKERS.USER_END)}`)
  );
  if (userMatch) {
    result.userPrompt = userMatch[1];
  }

  return result;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// Exports
// =============================================================================

export { TEMPLATE_MARKERS };
