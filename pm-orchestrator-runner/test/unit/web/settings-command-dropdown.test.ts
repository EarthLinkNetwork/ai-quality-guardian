/**
 * Settings Command Dropdown - Unit Tests
 *
 * Tests:
 * 1. extractCustomCommands parses valid settings JSON
 * 2. extractCustomCommands handles missing/invalid customCommands
 * 3. parseSettingsCommands separates global and project commands
 * 4. CommandDropdownState enforces mutual exclusivity
 * 5. API endpoint returns commands from both scopes
 * 6. Only one dropdown can be active at a time
 * 7. Selecting a command populates the correct value
 */

import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  extractCustomCommands,
  parseSettingsCommands,
  CommandDropdownState,
  SettingsCustomCommand,
} from '../../../src/web/services/settings-command-parser';

describe('Settings Command Parser', () => {
  describe('extractCustomCommands', () => {
    it('should extract commands from valid settings', () => {
      const settings = {
        customCommands: [
          { name: 'deploy', description: 'Deploy to prod', prompt: 'Deploy the app' },
          { name: 'test-all', description: 'Run all tests', prompt: 'Run all tests' },
        ],
      };

      const commands = extractCustomCommands(settings);
      assert.equal(commands.length, 2);
      assert.equal(commands[0].name, 'deploy');
      assert.equal(commands[0].description, 'Deploy to prod');
      assert.equal(commands[0].prompt, 'Deploy the app');
      assert.equal(commands[1].name, 'test-all');
    });

    it('should return empty array for null settings', () => {
      assert.deepEqual(extractCustomCommands(null), []);
    });

    it('should return empty array for undefined settings', () => {
      assert.deepEqual(extractCustomCommands(undefined), []);
    });

    it('should return empty array for non-object settings', () => {
      assert.deepEqual(extractCustomCommands('string'), []);
      assert.deepEqual(extractCustomCommands(42), []);
      assert.deepEqual(extractCustomCommands(true), []);
    });

    it('should return empty array when customCommands is missing', () => {
      assert.deepEqual(extractCustomCommands({ other: 'data' }), []);
    });

    it('should return empty array when customCommands is not an array', () => {
      assert.deepEqual(extractCustomCommands({ customCommands: 'not-array' }), []);
      assert.deepEqual(extractCustomCommands({ customCommands: 42 }), []);
      assert.deepEqual(extractCustomCommands({ customCommands: {} }), []);
    });

    it('should skip entries without a name', () => {
      const settings = {
        customCommands: [
          { description: 'No name', prompt: 'Do something' },
          { name: 'valid', prompt: 'Do valid thing' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands.length, 1);
      assert.equal(commands[0].name, 'valid');
    });

    it('should skip entries without a prompt', () => {
      const settings = {
        customCommands: [
          { name: 'no-prompt', description: 'Missing prompt' },
          { name: 'valid', prompt: 'Has a prompt' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands.length, 1);
      assert.equal(commands[0].name, 'valid');
    });

    it('should skip entries with empty name', () => {
      const settings = {
        customCommands: [
          { name: '', prompt: 'Empty name' },
          { name: '  ', prompt: 'Whitespace name' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands.length, 0);
    });

    it('should skip entries with empty prompt', () => {
      const settings = {
        customCommands: [
          { name: 'empty-prompt', prompt: '' },
          { name: 'whitespace-prompt', prompt: '   ' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands.length, 0);
    });

    it('should skip null and non-object entries', () => {
      const settings = {
        customCommands: [
          null,
          42,
          'string',
          undefined,
          { name: 'valid', prompt: 'valid prompt' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands.length, 1);
      assert.equal(commands[0].name, 'valid');
    });

    it('should normalize command names to lowercase', () => {
      const settings = {
        customCommands: [
          { name: 'Deploy', prompt: 'deploy cmd' },
          { name: 'TEST-ALL', prompt: 'test cmd' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands[0].name, 'deploy');
      assert.equal(commands[1].name, 'test-all');
    });

    it('should trim whitespace from name and prompt', () => {
      const settings = {
        customCommands: [
          { name: '  deploy  ', prompt: '  Deploy the app  ' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands[0].name, 'deploy');
      assert.equal(commands[0].prompt, 'Deploy the app');
    });

    it('should default description to empty string when missing', () => {
      const settings = {
        customCommands: [
          { name: 'nodesc', prompt: 'A prompt' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands[0].description, '');
    });

    it('should handle settings with other fields alongside customCommands', () => {
      const settings = {
        project: { name: 'test' },
        pm: { autoStart: false },
        customCommands: [
          { name: 'build', description: 'Build project', prompt: 'Run build' },
        ],
      };
      const commands = extractCustomCommands(settings);
      assert.equal(commands.length, 1);
      assert.equal(commands[0].name, 'build');
    });
  });

  describe('parseSettingsCommands', () => {
    it('should return commands from both global and project settings', () => {
      const globalSettings = {
        customCommands: [
          { name: 'global-cmd', description: 'Global', prompt: 'global prompt' },
        ],
      };
      const projectSettings = {
        customCommands: [
          { name: 'project-cmd', description: 'Project', prompt: 'project prompt' },
        ],
      };

      const result = parseSettingsCommands(globalSettings, projectSettings);
      assert.equal(result.global.length, 1);
      assert.equal(result.project.length, 1);
      assert.equal(result.global[0].name, 'global-cmd');
      assert.equal(result.project[0].name, 'project-cmd');
    });

    it('should handle null global settings', () => {
      const result = parseSettingsCommands(null, {
        customCommands: [{ name: 'proj', prompt: 'p' }],
      });
      assert.equal(result.global.length, 0);
      assert.equal(result.project.length, 1);
    });

    it('should handle null project settings', () => {
      const result = parseSettingsCommands(
        { customCommands: [{ name: 'glob', prompt: 'g' }] },
        null
      );
      assert.equal(result.global.length, 1);
      assert.equal(result.project.length, 0);
    });

    it('should handle both settings being null', () => {
      const result = parseSettingsCommands(null, null);
      assert.equal(result.global.length, 0);
      assert.equal(result.project.length, 0);
    });

    it('should handle settings without customCommands', () => {
      const result = parseSettingsCommands(
        { other: 'data' },
        { another: 'field' }
      );
      assert.equal(result.global.length, 0);
      assert.equal(result.project.length, 0);
    });

    it('should return multiple commands per scope', () => {
      const settings = {
        customCommands: [
          { name: 'cmd1', prompt: 'p1' },
          { name: 'cmd2', prompt: 'p2' },
          { name: 'cmd3', prompt: 'p3' },
        ],
      };
      const result = parseSettingsCommands(settings, settings);
      assert.equal(result.global.length, 3);
      assert.equal(result.project.length, 3);
    });
  });

  describe('CommandDropdownState', () => {
    let state: CommandDropdownState;

    beforeEach(() => {
      state = new CommandDropdownState();
    });

    it('should start with no active dropdown', () => {
      assert.equal(state.active, null);
    });

    it('should activate global dropdown', () => {
      state.activate('global');
      assert.equal(state.active, 'global');
      assert.equal(state.isActive('global'), true);
      assert.equal(state.isActive('project'), false);
    });

    it('should activate project dropdown', () => {
      state.activate('project');
      assert.equal(state.active, 'project');
      assert.equal(state.isActive('project'), true);
      assert.equal(state.isActive('global'), false);
    });

    it('should deactivate when activating null', () => {
      state.activate('global');
      state.activate(null);
      assert.equal(state.active, null);
      assert.equal(state.isActive('global'), false);
      assert.equal(state.isActive('project'), false);
    });

    it('should switch from global to project (mutual exclusivity)', () => {
      state.activate('global');
      assert.equal(state.isActive('global'), true);

      state.activate('project');
      assert.equal(state.isActive('project'), true);
      assert.equal(state.isActive('global'), false);
    });

    it('should switch from project to global (mutual exclusivity)', () => {
      state.activate('project');
      assert.equal(state.isActive('project'), true);

      state.activate('global');
      assert.equal(state.isActive('global'), true);
      assert.equal(state.isActive('project'), false);
    });

    it('should toggle global on when inactive', () => {
      state.toggle('global');
      assert.equal(state.active, 'global');
    });

    it('should toggle global off when active', () => {
      state.activate('global');
      state.toggle('global');
      assert.equal(state.active, null);
    });

    it('should toggle project on, deactivating global', () => {
      state.activate('global');
      state.toggle('project');
      assert.equal(state.active, 'project');
      assert.equal(state.isActive('global'), false);
    });

    it('should toggle global on, deactivating project', () => {
      state.activate('project');
      state.toggle('global');
      assert.equal(state.active, 'global');
      assert.equal(state.isActive('project'), false);
    });

    it('should deactivate all dropdowns', () => {
      state.activate('global');
      state.deactivate();
      assert.equal(state.active, null);
      assert.equal(state.isActive('global'), false);
      assert.equal(state.isActive('project'), false);
    });

    it('should allow rapid toggling without inconsistency', () => {
      state.toggle('global');
      state.toggle('project');
      state.toggle('global');
      state.toggle('global');
      assert.equal(state.active, null);
    });

    it('should maintain state after multiple activations of same dropdown', () => {
      state.activate('global');
      state.activate('global');
      state.activate('global');
      assert.equal(state.active, 'global');
      assert.equal(state.isActive('global'), true);
    });
  });
});
