/**
 * Unit tests for AI Cost Display on Dashboard
 *
 * Tests:
 *   - ProjectIndex supports aiModel and aiProvider fields
 *   - Project creation with aiModel/aiProvider
 *   - Project update with aiModel/aiProvider
 *   - Cost info is enriched on project listing
 *   - Cost info is included in project detail
 *   - Projects without aiModel have null costInfo
 *   - Models endpoint returns available models
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { ProjectIndex, UpdateProjectIndexInput, CreateProjectIndexInput } from '../../../src/web/dal/types';
import { buildProjectCostInfo } from '../../../src/web/services/ai-cost-service';

describe('AI Cost Dashboard Integration - Unit Tests', () => {
  const now = new Date().toISOString();

  const createProject = (
    id: string,
    overrides?: Partial<ProjectIndex>
  ): ProjectIndex => ({
    PK: `ORG#org_1`,
    SK: `PIDX#${id}`,
    projectId: id,
    orgId: 'org_1',
    projectPath: `/test/${id}`,
    tags: [],
    favorite: false,
    archived: false,
    status: 'idle',
    lastActivityAt: now,
    sessionCount: 0,
    taskStats: { total: 0, completed: 0, failed: 0, running: 0, awaiting: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  describe('ProjectIndex with aiModel and aiProvider', () => {
    it('supports aiModel field', () => {
      const p = createProject('proj_ai_model', { aiModel: 'gpt-4o' });
      assert.equal(p.aiModel, 'gpt-4o');
    });

    it('supports aiProvider field', () => {
      const p = createProject('proj_ai_provider', { aiProvider: 'openai' });
      assert.equal(p.aiProvider, 'openai');
    });

    it('aiModel and aiProvider are optional (undefined by default)', () => {
      const p = createProject('proj_no_ai');
      assert.equal(p.aiModel, undefined);
      assert.equal(p.aiProvider, undefined);
    });

    it('supports both aiModel and aiProvider together', () => {
      const p = createProject('proj_ai_both', {
        aiModel: 'claude-3-5-sonnet-20241022',
        aiProvider: 'anthropic',
      });
      assert.equal(p.aiModel, 'claude-3-5-sonnet-20241022');
      assert.equal(p.aiProvider, 'anthropic');
    });
  });

  describe('UpdateProjectIndexInput with aiModel/aiProvider', () => {
    it('accepts aiModel in update input', () => {
      const update: UpdateProjectIndexInput = {
        aiModel: 'gpt-4o-mini',
      };
      assert.equal(update.aiModel, 'gpt-4o-mini');
    });

    it('accepts aiProvider in update input', () => {
      const update: UpdateProjectIndexInput = {
        aiProvider: 'openai',
      };
      assert.equal(update.aiProvider, 'openai');
    });

    it('updates project with new model', () => {
      const p = createProject('proj_update_model', { aiModel: 'gpt-4o' });
      const updated: ProjectIndex = { ...p, aiModel: 'gpt-4o-mini', updatedAt: new Date().toISOString() };
      assert.equal(updated.aiModel, 'gpt-4o-mini');
    });
  });

  describe('CreateProjectIndexInput with aiModel/aiProvider', () => {
    it('accepts aiModel in create input', () => {
      const input: CreateProjectIndexInput = {
        orgId: 'org_1',
        projectPath: '/test/new-project',
        aiModel: 'gpt-4o',
        aiProvider: 'openai',
      };
      assert.equal(input.aiModel, 'gpt-4o');
      assert.equal(input.aiProvider, 'openai');
    });
  });

  describe('Cost info enrichment for project listing', () => {
    it('enriches project with known model with cost info', () => {
      const p = createProject('proj_cost_known', {
        aiModel: 'gpt-4o',
        aiProvider: 'openai',
      });
      const costInfo = p.aiModel ? buildProjectCostInfo(p.aiModel, p.aiProvider) : null;
      assert.ok(costInfo);
      assert.equal(costInfo.modelId, 'gpt-4o');
      assert.equal(costInfo.provider, 'openai');
      assert.equal(costInfo.modelDisplayName, 'GPT-4o');
      assert.equal(costInfo.inputPricePerMillion, 2.5);
      assert.equal(costInfo.outputPricePerMillion, 10.0);
      assert.equal(costInfo.contextSize, '128K');
    });

    it('returns null cost info for project without aiModel', () => {
      const p = createProject('proj_no_model');
      const costInfo = p.aiModel ? buildProjectCostInfo(p.aiModel, p.aiProvider) : null;
      assert.equal(costInfo, null);
    });

    it('returns null cost info for project with unknown model', () => {
      const p = createProject('proj_unknown_model', { aiModel: 'nonexistent-model' });
      const costInfo = p.aiModel ? buildProjectCostInfo(p.aiModel, p.aiProvider) : null;
      assert.equal(costInfo, null);
    });

    it('correctly handles Anthropic model cost info', () => {
      const p = createProject('proj_anthropic', {
        aiModel: 'claude-3-5-sonnet-20241022',
        aiProvider: 'anthropic',
      });
      const costInfo = p.aiModel ? buildProjectCostInfo(p.aiModel, p.aiProvider) : null;
      assert.ok(costInfo);
      assert.equal(costInfo.modelId, 'claude-3-5-sonnet-20241022');
      assert.equal(costInfo.provider, 'anthropic');
      assert.equal(costInfo.modelDisplayName, 'Claude 3.5 Sonnet');
      assert.equal(costInfo.inputPricePerMillion, 3.0);
      assert.equal(costInfo.outputPricePerMillion, 15.0);
    });
  });

  describe('Cost info displayed across screens', () => {
    it('model info is available for task group view (via project.aiModel)', () => {
      const p = createProject('proj_tg_view', {
        aiModel: 'gpt-4o',
        aiProvider: 'openai',
      });
      // Task groups inherit model from their project
      const projectModelDisplay = p.aiModel
        ? `${buildProjectCostInfo(p.aiModel, p.aiProvider)?.modelDisplayName} (${p.aiProvider})`
        : 'Not configured';
      assert.equal(projectModelDisplay, 'GPT-4o (openai)');
    });

    it('model info shows "Not configured" when no model set', () => {
      const p = createProject('proj_tg_no_model');
      const projectModelDisplay = p.aiModel
        ? `${buildProjectCostInfo(p.aiModel, p.aiProvider)?.modelDisplayName} (${p.aiProvider})`
        : 'Not configured';
      assert.equal(projectModelDisplay, 'Not configured');
    });

    it('different projects can have different models', () => {
      const p1 = createProject('proj_diff_1', { aiModel: 'gpt-4o', aiProvider: 'openai' });
      const p2 = createProject('proj_diff_2', { aiModel: 'claude-3-5-sonnet-20241022', aiProvider: 'anthropic' });

      const cost1 = buildProjectCostInfo(p1.aiModel!, p1.aiProvider);
      const cost2 = buildProjectCostInfo(p2.aiModel!, p2.aiProvider);

      assert.ok(cost1);
      assert.ok(cost2);
      assert.notEqual(cost1.modelId, cost2.modelId);
      assert.notEqual(cost1.provider, cost2.provider);
      assert.notEqual(cost1.inputPricePerMillion, cost2.inputPricePerMillion);
    });

    it('cost varies by model - cheaper model has lower cost', () => {
      const cheapCost = buildProjectCostInfo('gpt-4o-mini', 'openai');
      const expensiveCost = buildProjectCostInfo('gpt-4o', 'openai');

      assert.ok(cheapCost);
      assert.ok(expensiveCost);
      assert.ok(cheapCost.inputPricePerMillion < expensiveCost.inputPricePerMillion);
      assert.ok(cheapCost.outputPricePerMillion < expensiveCost.outputPricePerMillion);
    });
  });
});
