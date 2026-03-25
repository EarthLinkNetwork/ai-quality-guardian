/**
 * Settings Command Parser
 *
 * Parses Claude Code settings.json files (both global and project-level)
 * to extract custom commands defined in the `customCommands` array.
 *
 * Claude Code settings.json format:
 * {
 *   "customCommands": [
 *     { "name": "deploy", "description": "Deploy to prod", "prompt": "..." }
 *   ]
 * }
 *
 * Returns separate lists for global and project-level custom commands.
 */

/**
 * A custom command extracted from settings.json
 */
export interface SettingsCustomCommand {
  /** Command name (without "/" prefix) */
  name: string;
  /** Brief description */
  description: string;
  /** Prompt template to use when the command is invoked */
  prompt: string;
}

/**
 * Result of parsing settings for custom commands
 */
export interface SettingsCommandsResult {
  /** Commands from global ~/.claude/settings.json */
  global: SettingsCustomCommand[];
  /** Commands from project-level .claude/settings.json */
  project: SettingsCustomCommand[];
}

/**
 * Validate and normalize a single custom command entry.
 * Returns null if the entry is invalid.
 */
function validateCommand(entry: unknown): SettingsCustomCommand | null {
  if (!entry || typeof entry !== 'object') return null;

  const obj = entry as Record<string, unknown>;
  const name = obj.name;
  const prompt = obj.prompt;

  // name and prompt are required
  if (typeof name !== 'string' || name.trim() === '') return null;
  if (typeof prompt !== 'string' || prompt.trim() === '') return null;

  // description is optional, defaults to empty string
  const description = typeof obj.description === 'string' ? obj.description : '';

  return {
    name: name.trim().toLowerCase(),
    description,
    prompt: prompt.trim(),
  };
}

/**
 * Extract custom commands from a parsed settings JSON object.
 * Returns an empty array if the settings don't contain valid customCommands.
 */
export function extractCustomCommands(settings: unknown): SettingsCustomCommand[] {
  if (!settings || typeof settings !== 'object') return [];

  const obj = settings as Record<string, unknown>;
  const commands = obj.customCommands;

  if (!Array.isArray(commands)) return [];

  const result: SettingsCustomCommand[] = [];
  for (const entry of commands) {
    const validated = validateCommand(entry);
    if (validated) {
      result.push(validated);
    }
  }

  return result;
}

/**
 * Parse both global and project settings to extract custom commands.
 *
 * @param globalSettings - Parsed global ~/.claude/settings.json content
 * @param projectSettings - Parsed project .claude/settings.json content
 */
export function parseSettingsCommands(
  globalSettings: unknown,
  projectSettings: unknown
): SettingsCommandsResult {
  return {
    global: extractCustomCommands(globalSettings),
    project: extractCustomCommands(projectSettings),
  };
}

/**
 * Active dropdown state tracker.
 * Ensures only one dropdown (global or project) can be active at a time.
 */
export type ActiveDropdown = 'global' | 'project' | null;

/**
 * Manages the mutual exclusivity of the two command dropdowns.
 */
export class CommandDropdownState {
  private _active: ActiveDropdown = null;

  /** Get which dropdown is currently active */
  get active(): ActiveDropdown {
    return this._active;
  }

  /**
   * Activate a dropdown. Deactivates the other one.
   * Passing null deactivates both.
   */
  activate(dropdown: ActiveDropdown): void {
    this._active = dropdown;
  }

  /**
   * Toggle a dropdown. If it's already active, deactivate it.
   * If the other one is active, switch to this one.
   */
  toggle(dropdown: 'global' | 'project'): void {
    if (this._active === dropdown) {
      this._active = null;
    } else {
      this._active = dropdown;
    }
  }

  /** Check if a specific dropdown is active */
  isActive(dropdown: 'global' | 'project'): boolean {
    return this._active === dropdown;
  }

  /** Deactivate all dropdowns */
  deactivate(): void {
    this._active = null;
  }
}
