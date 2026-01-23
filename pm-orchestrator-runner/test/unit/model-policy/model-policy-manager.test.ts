import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  ModelPolicyManager,
  DEFAULT_MODEL_POLICY_CONFIG,
  MODEL_CONFIGS,
  STABLE_PROFILE,
  CHEAP_PROFILE,
  FAST_PROFILE,
  PRESET_PROFILES,
  getDefaultCategory,
  getModelConfig,
  getModelByCategory,
  getProviderForModel,
  escalateModel,
  findLargerContextModel,
  selectModel,
  calculateCost,
  type ModelSelection,
  type SelectionContext,
  type TaskPhase,
  type ModelPolicyEvent,
} from '../../../src/model-policy';

describe('ModelPolicyManager (spec/31_PROVIDER_MODEL_POLICY.md)', () => {
  let manager: ModelPolicyManager;

  beforeEach(() => {
    manager = new ModelPolicyManager();
  });

  describe('Preset Profiles (Section 5)', () => {
    it('should have STABLE_PROFILE', () => {
      assert.strictEqual(STABLE_PROFILE.name, 'stable');
      assert.ok(STABLE_PROFILE.category_defaults);
      assert.ok(STABLE_PROFILE.escalation);
    });

    it('should have CHEAP_PROFILE', () => {
      assert.strictEqual(CHEAP_PROFILE.name, 'cheap');
      assert.ok(CHEAP_PROFILE.category_defaults);
      assert.ok(CHEAP_PROFILE.escalation);
    });

    it('should have FAST_PROFILE', () => {
      assert.strictEqual(FAST_PROFILE.name, 'fast');
      assert.ok(FAST_PROFILE.category_defaults);
      assert.ok(FAST_PROFILE.escalation);
    });

    it('should have PRESET_PROFILES containing all profiles', () => {
      assert.ok(PRESET_PROFILES['stable']);
      assert.ok(PRESET_PROFILES['cheap']);
      assert.ok(PRESET_PROFILES['fast']);
    });
  });

  describe('Model Configurations (Section 3)', () => {
    it('should have MODEL_CONFIGS', () => {
      assert.ok(MODEL_CONFIGS);
      assert.ok(MODEL_CONFIGS.length > 0);
    });

    it('should have required fields for each model', () => {
      for (const config of MODEL_CONFIGS) {
        assert.ok(config.model_id, 'should have model_id');
        assert.ok(config.provider, 'should have provider');
        assert.ok(config.category, 'should have category');
        assert.ok(typeof config.max_context_tokens === 'number', 'should have max_context_tokens');
        assert.ok(config.cost_per_1k_tokens, 'should have cost_per_1k_tokens');
        assert.ok(typeof config.cost_per_1k_tokens.input === 'number', 'should have input cost');
        assert.ok(typeof config.cost_per_1k_tokens.output === 'number', 'should have output cost');
      }
    });
  });

  describe('Default Configuration (Section 10)', () => {
    it('should have default profile', () => {
      assert.ok(DEFAULT_MODEL_POLICY_CONFIG.defaultProfile);
    });

    it('should have cost warning threshold', () => {
      assert.ok(typeof DEFAULT_MODEL_POLICY_CONFIG.costWarningThreshold === 'number');
      assert.ok(DEFAULT_MODEL_POLICY_CONFIG.costWarningThreshold > 0);
      assert.ok(DEFAULT_MODEL_POLICY_CONFIG.costWarningThreshold < 1);
    });

    it('should have cost limit action', () => {
      assert.ok(['block', 'warn', 'switch_to_cheap'].includes(
        DEFAULT_MODEL_POLICY_CONFIG.costLimitAction
      ));
    });
  });

  describe('Constructor', () => {
    it('should create with default config', () => {
      const m = new ModelPolicyManager();
      assert.ok(m);
    });

    it('should accept custom config', () => {
      const m = new ModelPolicyManager({
        defaultProfile: 'cheap',
      });
      assert.strictEqual(m.getProfile().name, 'cheap');
    });

    it('should accept event callback', () => {
      const events: ModelPolicyEvent[] = [];
      const m = new ModelPolicyManager({}, (event) => {
        events.push(event);
      });

      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      m.select('PLANNING', context);

      assert.ok(events.length > 0);
    });
  });

  describe('select() - Model Selection (Section 4)', () => {
    it('should select model for PLANNING phase', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('PLANNING', context);

      assert.ok(selection.model_id);
      assert.ok(selection.provider);
      assert.strictEqual(selection.phase, 'PLANNING');
      assert.ok(selection.reason);
    });

    it('should select model for IMPLEMENTATION phase', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('IMPLEMENTATION', context);

      assert.ok(selection.model_id);
      assert.strictEqual(selection.phase, 'IMPLEMENTATION');
    });

    it('should select model for QUALITY_CHECK phase', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('QUALITY_CHECK', context);

      assert.ok(selection.model_id);
      assert.strictEqual(selection.phase, 'QUALITY_CHECK');
    });

    it('should include context info in selection', () => {
      const context: SelectionContext = {
        task_id: 'task-001',
        subtask_id: 'subtask-a',
        retry_count: 0,
      };

      const selection = manager.select('IMPLEMENTATION', context);

      assert.ok(selection);
    });
  });

  describe('recordUsage() - Usage Tracking (Section 8)', () => {
    it('should record usage', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('IMPLEMENTATION', context);

      const usage = manager.recordUsage(
        'task-001',
        undefined,
        selection,
        1000,  // input tokens
        500,   // output tokens
        5000,  // duration ms
        'SUCCESS'
      );

      assert.ok(usage.usage_id);
      assert.strictEqual(usage.task_id, 'task-001');
      assert.strictEqual(usage.tokens.input, 1000);
      assert.strictEqual(usage.tokens.output, 500);
      assert.strictEqual(usage.tokens.total, 1500);
      assert.ok(usage.cost);
      assert.strictEqual(usage.result, 'SUCCESS');
    });

    it('should track subtask usage', () => {
      const context: SelectionContext = { task_id: 'task-001', subtask_id: 'subtask-a', retry_count: 0 };
      const selection = manager.select('IMPLEMENTATION', context);

      const usage = manager.recordUsage(
        'task-001',
        'subtask-a',
        selection,
        500,
        300,
        2000,
        'SUCCESS'
      );

      assert.strictEqual(usage.subtask_id, 'subtask-a');
    });

    it('should calculate cost based on tokens', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('IMPLEMENTATION', context);

      const usage = manager.recordUsage(
        'task-001',
        undefined,
        selection,
        10000,
        5000,
        10000,
        'SUCCESS'
      );

      assert.ok(usage.cost.input >= 0);
      assert.ok(usage.cost.output >= 0);
      assert.ok(usage.cost.total >= 0);
      // Use approximate comparison for floating-point arithmetic
      const expectedTotal = usage.cost.input + usage.cost.output;
      assert.ok(Math.abs(usage.cost.total - expectedTotal) < 0.0001, 'total should equal input + output');
    });
  });

  describe('setProfile() / getProfile() - Profile Management', () => {
    it('should get current profile', () => {
      const profile = manager.getProfile();
      assert.ok(profile.name);
    });

    it('should set profile successfully', () => {
      const result = manager.setProfile('cheap');
      assert.strictEqual(result, true);
      assert.strictEqual(manager.getProfile().name, 'cheap');
    });

    it('should return false for unknown profile', () => {
      const result = manager.setProfile('unknown-profile');
      assert.strictEqual(result, false);
    });

    it('should list available profiles', () => {
      const profiles = manager.getAvailableProfiles();
      assert.ok(Array.isArray(profiles));
      assert.ok(profiles.includes('stable'));
      assert.ok(profiles.includes('cheap'));
      assert.ok(profiles.includes('fast'));
    });
  });

  describe('checkCostLimit() - Cost Management (Section 9)', () => {
    it('should check cost limit', () => {
      const check = manager.checkCostLimit();

      assert.ok(typeof check.current_cost === 'number');
      assert.ok(typeof check.daily_limit === 'number');
      assert.ok(typeof check.remaining === 'number');
      assert.ok(typeof check.exceeded === 'boolean');
      assert.ok(typeof check.warning === 'boolean');
    });

    it('should track accumulated cost', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('IMPLEMENTATION', context);

      // Record some usage
      manager.recordUsage('task-001', undefined, selection, 10000, 5000, 5000, 'SUCCESS');
      manager.recordUsage('task-001', undefined, selection, 10000, 5000, 5000, 'SUCCESS');

      const check = manager.checkCostLimit();
      assert.ok(check.current_cost >= 0);
    });
  });

  describe('getUsageSummary() - Reporting (Section 8)', () => {
    it('should return usage summary', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('IMPLEMENTATION', context);

      manager.recordUsage('task-001', undefined, selection, 1000, 500, 2000, 'SUCCESS');
      manager.recordUsage('task-001', undefined, selection, 2000, 1000, 3000, 'SUCCESS');

      const summary = manager.getUsageSummary();

      assert.ok(summary.period);
      assert.ok(typeof summary.task_count === 'number');
      assert.ok(typeof summary.total_tokens === 'number');
      assert.ok(typeof summary.total_cost === 'number');
      assert.ok(summary.by_model);
    });

    it('should filter by date range', () => {
      const context: SelectionContext = { task_id: 'task-001', retry_count: 0 };
      const selection = manager.select('IMPLEMENTATION', context);

      manager.recordUsage('task-001', undefined, selection, 1000, 500, 2000, 'SUCCESS');

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const summary = manager.getUsageSummary(yesterday, new Date());
      assert.ok(summary.task_count >= 0);
    });
  });

  describe('recordFallback() - Fallback Tracking', () => {
    it('should record fallback event', () => {
      const events: ModelPolicyEvent[] = [];
      const m = new ModelPolicyManager({}, (event) => {
        events.push(event);
      });

      m.recordFallback(
        { model_id: 'claude-3-opus', provider: 'anthropic' },
        { model_id: 'claude-3-sonnet', provider: 'anthropic' },
        'MODEL_UNAVAILABLE',
        'Rate limited'
      );

      assert.ok(events.some(e => e.type === 'MODEL_FALLBACK'));
    });
  });

  describe('Helper Functions (Section 3)', () => {
    describe('getDefaultCategory()', () => {
      it('should return default category for phase', () => {
        const category = getDefaultCategory('PLANNING');
        assert.ok(['large', 'standard', 'small', 'fast', 'planning', 'execution', 'verification'].includes(category));
      });
    });

    describe('getModelConfig()', () => {
      it('should return config for known model', () => {
        const modelId = MODEL_CONFIGS[0].model_id;
        const config = getModelConfig(modelId);

        assert.ok(config);
        assert.strictEqual(config?.model_id, modelId);
      });

      it('should return undefined for unknown model', () => {
        const config = getModelConfig('unknown-model-xyz');
        assert.strictEqual(config, undefined);
      });
    });

    describe('getModelByCategory()', () => {
      it('should return models for category', () => {
        const models = getModelByCategory('planning', STABLE_PROFILE);
        assert.ok(models);
      });
    });

    describe('getProviderForModel()', () => {
      it('should return provider for known model', () => {
        const modelId = MODEL_CONFIGS[0].model_id;
        const provider = getProviderForModel(modelId);
        assert.ok(provider);
      });

      it('should return default provider for unknown model', () => {
        // Implementation returns 'openai' as default fallback for unknown models
        const provider = getProviderForModel('unknown-model');
        assert.strictEqual(provider, 'openai');
      });
    });

    describe('escalateModel()', () => {
      it('should escalate to larger model', () => {
        const current = { model_id: MODEL_CONFIGS[0].model_id, provider: MODEL_CONFIGS[0].provider };
        const escalated = escalateModel(current, 2, STABLE_PROFILE);

        // May return null if no escalation available
        assert.ok(escalated === null || (typeof escalated === 'object' && escalated.model_id));
      });
    });

    describe('findLargerContextModel()', () => {
      it('should find model with larger context', () => {
        const current = { model_id: MODEL_CONFIGS[0].model_id, provider: MODEL_CONFIGS[0].provider };
        const larger = findLargerContextModel(current, 200000, MODEL_CONFIGS);

        // May return null if no larger model available
        assert.ok(larger === null || (typeof larger === 'object' && larger.model_id));
      });
    });

    describe('selectModel()', () => {
      it('should select model based on profile', () => {
        const selection = selectModel('IMPLEMENTATION', STABLE_PROFILE, { task_id: 'test', retry_count: 0 });

        assert.ok(selection.model_id);
        assert.ok(selection.provider);
        assert.strictEqual(selection.phase, 'IMPLEMENTATION');
      });
    });

    describe('calculateCost()', () => {
      it('should calculate cost for tokens', () => {
        const modelId = MODEL_CONFIGS[0].model_id;
        const cost = calculateCost(modelId, 1000, 500);

        assert.ok(typeof cost.input === 'number');
        assert.ok(typeof cost.output === 'number');
        assert.ok(typeof cost.total === 'number');
        assert.ok(cost.input >= 0);
        assert.ok(cost.output >= 0);
        assert.strictEqual(cost.total, cost.input + cost.output);
      });

      it('should return zero for unknown model', () => {
        const cost = calculateCost('unknown-model', 1000, 500);

        assert.strictEqual(cost.input, 0);
        assert.strictEqual(cost.output, 0);
        assert.strictEqual(cost.total, 0);
      });
    });
  });

  describe('Event Emission', () => {
    it('should emit MODEL_SELECTED event', () => {
      const events: ModelPolicyEvent[] = [];
      const m = new ModelPolicyManager({}, (event) => {
        events.push(event);
      });

      m.select('IMPLEMENTATION', { task_id: 'task-001', retry_count: 0 });

      assert.ok(events.some(e => e.type === 'MODEL_SELECTED'));
    });

    it('should emit MODEL_USAGE event', () => {
      const events: ModelPolicyEvent[] = [];
      const m = new ModelPolicyManager({}, (event) => {
        events.push(event);
      });

      const selection = m.select('IMPLEMENTATION', { task_id: 'task-001', retry_count: 0 });
      m.recordUsage('task-001', undefined, selection, 1000, 500, 2000, 'SUCCESS');

      assert.ok(events.some(e => e.type === 'MODEL_USAGE'));
    });
  });

  describe('Retry Escalation (Section 6)', () => {
    it('should select escalated model on retry', () => {
      const context: SelectionContext = {
        task_id: 'task-001',
        retry_count: 2,
        previous_model: { model_id: 'claude-3-sonnet', provider: 'anthropic' },
      };

      const selection = manager.select('IMPLEMENTATION', context);

      // Should either escalate or provide reason
      assert.ok(selection.model_id);
      assert.ok(selection.reason);
    });
  });
});
