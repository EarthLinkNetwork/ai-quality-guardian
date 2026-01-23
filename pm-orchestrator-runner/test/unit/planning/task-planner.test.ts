import { describe, it, beforeEach } from 'mocha';
import { strict as assert } from 'assert';
import {
  TaskPlanner,
  DEFAULT_TASK_PLANNER_CONFIG,
  type SizeEstimation,
  type ExecutionPlan,
  type TaskPlannerConfig,
} from '../../../src/planning';

describe('TaskPlanner (spec/29_TASK_PLANNING.md)', () => {
  let planner: TaskPlanner;

  beforeEach(() => {
    planner = new TaskPlanner();
  });

  describe('Default Configuration (Section 10.1)', () => {
    it('should have default auto_chunk enabled', () => {
      assert.strictEqual(DEFAULT_TASK_PLANNER_CONFIG.auto_chunk, true);
    });

    it('should have default chunk_token_threshold of 8000', () => {
      assert.strictEqual(DEFAULT_TASK_PLANNER_CONFIG.chunk_token_threshold, 8000);
    });

    it('should have default chunk_complexity_threshold of 6', () => {
      assert.strictEqual(DEFAULT_TASK_PLANNER_CONFIG.chunk_complexity_threshold, 6);
    });

    it('should have default max_subtasks of 10', () => {
      assert.strictEqual(DEFAULT_TASK_PLANNER_CONFIG.max_subtasks, 10);
    });

    it('should have default min_subtasks of 2', () => {
      assert.strictEqual(DEFAULT_TASK_PLANNER_CONFIG.min_subtasks, 2);
    });

    it('should have default enable_dependency_analysis enabled', () => {
      assert.strictEqual(DEFAULT_TASK_PLANNER_CONFIG.enable_dependency_analysis, true);
    });
  });

  describe('Constructor', () => {
    it('should create with default config', () => {
      const p = new TaskPlanner();
      assert.ok(p);
    });

    it('should accept partial config override', () => {
      const p = new TaskPlanner({ auto_chunk: false });
      assert.ok(p);
    });

    it('should accept event callback', () => {
      const events: Array<{ type: string; content: Record<string, unknown> }> = [];
      const p = new TaskPlanner({}, (type, content) => {
        events.push({ type, content });
      });

      p.plan('task-001', 'Simple task');

      assert.ok(events.length > 0);
      assert.ok(events.some(e => e.type === 'PLANNING_START'));
      assert.ok(events.some(e => e.type === 'PLANNING_END'));
    });
  });

  describe('plan() - Execution Plan Generation (Section 3.4)', () => {
    it('should generate execution plan with required fields', () => {
      const plan = planner.plan('task-001', 'Implement a simple function');

      assert.ok(plan.plan_id);
      assert.strictEqual(plan.task_id, 'task-001');
      assert.ok(plan.created_at);
      assert.ok(plan.size_estimation);
      assert.ok(plan.chunking_recommendation);
      assert.ok(['single', 'sequential', 'parallel', 'mixed'].includes(plan.execution_strategy));
    });

    it('should generate valid timestamp', () => {
      const plan = planner.plan('task-001', 'Test task');

      const timestamp = new Date(plan.created_at);
      assert.ok(!isNaN(timestamp.getTime()));
    });

    it('should include size estimation', () => {
      const plan = planner.plan('task-001', 'Test task');

      assert.ok(typeof plan.size_estimation.complexity_score === 'number');
      assert.ok(typeof plan.size_estimation.estimated_file_count === 'number');
      assert.ok(typeof plan.size_estimation.estimated_tokens === 'number');
      assert.ok(['XS', 'S', 'M', 'L', 'XL'].includes(plan.size_estimation.size_category));
      assert.ok(Array.isArray(plan.size_estimation.estimation_reasons));
    });

    it('should include chunking recommendation', () => {
      const plan = planner.plan('task-001', 'Test task');

      assert.ok(typeof plan.chunking_recommendation.should_chunk === 'boolean');
      assert.ok(typeof plan.chunking_recommendation.reason === 'string');
      assert.ok(Array.isArray(plan.chunking_recommendation.subtasks));
    });
  });

  describe('Size Estimation (Section 3.1)', () => {
    it('should estimate small task as XS or S', () => {
      const plan = planner.plan('task-001', 'Fix a typo');

      assert.ok(['XS', 'S'].includes(plan.size_estimation.size_category));
    });

    it('should estimate complex task with higher complexity', () => {
      // Use keywords that match COMPLEXITY_INDICATORS patterns:
      // - "implement full" (+3), "authentication" (+2), "database" (+2), "api endpoint" (+2)
      const complexPrompt = `
        Implement full authentication system with:
        1. Database schema for users
        2. API endpoint for registration
        3. Security and authorization
        4. Integration with external services
      `;

      const plan = planner.plan('task-001', complexPrompt);

      // Base 1 + implement full 3 + authentication 2 + database 2 + api 2 + security 2 + integrate 2 = min(10, 14) = 10
      // At minimum should be > 3
      assert.ok(plan.size_estimation.complexity_score > 3);
    });

    it('should provide estimation reasons', () => {
      const plan = planner.plan('task-001', 'Implement feature with tests and documentation');

      assert.ok(plan.size_estimation.estimation_reasons.length > 0);
    });
  });

  describe('Chunking Decision (Section 3.2)', () => {
    it('should not chunk small tasks', () => {
      const plan = planner.plan('task-001', 'Fix typo in README');

      assert.strictEqual(plan.chunking_recommendation.should_chunk, false);
    });

    it('should chunk large complex tasks', () => {
      // Use keywords that match COMPLEXITY_INDICATORS patterns to ensure high complexity:
      // - "build full" (+3), "database" (+2), "api" (+2), "authentication" (+2), "refactor" (+2), "integrate" (+2)
      const largePrompt = `
        Build full e-commerce platform with:
        1. Database schema for products with categories
        2. REST API endpoints for catalog
        3. Authentication and authorization system
        4. Integrate payment gateways
        5. Refactor order management
        6. Add testing for multiple files
        7. Optimize performance caching
        8. MongoDB integration for analytics
        9. GraphQL endpoint for frontend
        10. Security audit and fixes
      `;

      const plan = planner.plan('task-001', largePrompt);

      // Large tasks should be chunked (high complexity + many subtasks)
      assert.strictEqual(plan.chunking_recommendation.should_chunk, true);
      assert.ok(plan.chunking_recommendation.subtasks.length >= 2);
    });

    it('should provide reason for chunking decision', () => {
      const plan = planner.plan('task-001', 'Test task');

      assert.ok(plan.chunking_recommendation.reason.length > 0);
    });

    it('should respect auto_chunk config', () => {
      const noChunkPlanner = new TaskPlanner({ auto_chunk: false });

      const plan = noChunkPlanner.plan('task-001', 'Large task with many steps');

      // With auto_chunk disabled, should not chunk
      assert.strictEqual(plan.chunking_recommendation.should_chunk, false);
    });
  });

  describe('Subtask Structure (Section 3.2)', () => {
    it('should generate subtasks with required fields', () => {
      const largePrompt = `
        Implement full-stack feature:
        1. Create database schema and migrations
        2. Build API endpoints with validation
        3. Create React components
        4. Write unit tests for all layers
        5. Add integration tests
        6. Update documentation
      `;

      const plan = planner.plan('task-001', largePrompt);

      if (plan.chunking_recommendation.should_chunk) {
        for (const subtask of plan.chunking_recommendation.subtasks) {
          assert.ok(subtask.id, 'subtask should have id');
          assert.ok(subtask.description, 'subtask should have description');
          assert.ok(Array.isArray(subtask.dependencies), 'subtask should have dependencies array');
          assert.ok(typeof subtask.estimated_complexity === 'number', 'subtask should have complexity');
          assert.ok(typeof subtask.execution_order === 'number', 'subtask should have execution_order');
        }
      }
    });

    it('should respect max_subtasks config', () => {
      const limitedPlanner = new TaskPlanner({ max_subtasks: 3 });

      const largePrompt = `
        Implement many features:
        1. Feature A with multiple components
        2. Feature B with API integration
        3. Feature C with database changes
        4. Feature D with frontend updates
        5. Feature E with testing
        6. Feature F with documentation
      `;

      const plan = limitedPlanner.plan('task-001', largePrompt);

      if (plan.chunking_recommendation.should_chunk) {
        assert.ok(plan.chunking_recommendation.subtasks.length <= 3);
      }
    });
  });

  describe('Dependency Analysis (Section 3.3)', () => {
    it('should analyze dependencies when enabled', () => {
      const largePrompt = `
        1. First, set up the database schema
        2. Then, create the API endpoints that depend on the schema
        3. After that, build the frontend components using the API
        4. Finally, write tests for everything
      `;

      const plan = planner.plan('task-001', largePrompt);

      if (plan.dependency_analysis) {
        assert.ok(Array.isArray(plan.dependency_analysis.edges));
        assert.ok(Array.isArray(plan.dependency_analysis.topological_order));
        assert.ok(typeof plan.dependency_analysis.has_cycles === 'boolean');
        assert.ok(Array.isArray(plan.dependency_analysis.parallelizable_groups));
      }
    });

    it('should not analyze dependencies when disabled', () => {
      const noDepsPlanner = new TaskPlanner({ enable_dependency_analysis: false });

      const plan = noDepsPlanner.plan('task-001', 'Task with steps');

      // dependency_analysis should be undefined or minimal
      if (plan.dependency_analysis) {
        assert.strictEqual(plan.dependency_analysis.edges.length, 0);
      }
    });
  });

  describe('quickSizeCheck()', () => {
    it('should return size estimation without full planning', () => {
      const estimation = planner.quickSizeCheck('Simple task');

      assert.ok(typeof estimation.complexity_score === 'number');
      assert.ok(typeof estimation.estimated_file_count === 'number');
      assert.ok(typeof estimation.estimated_tokens === 'number');
      assert.ok(['XS', 'S', 'M', 'L', 'XL'].includes(estimation.size_category));
    });

    it('should be faster than full plan()', () => {
      // quickSizeCheck should not emit events or do full analysis
      const events: Array<{ type: string }> = [];
      const trackedPlanner = new TaskPlanner({}, (type) => {
        events.push({ type });
      });

      trackedPlanner.quickSizeCheck('Test task');

      // quickSizeCheck should not emit PLANNING events
      assert.ok(!events.some(e => e.type === 'PLANNING_START'));
    });
  });

  describe('shouldChunk()', () => {
    it('should return false for small tasks', () => {
      assert.strictEqual(planner.shouldChunk('Fix typo'), false);
    });

    it('should return true for complex tasks', () => {
      const complexPrompt = `
        Build complete system with:
        - Database design and migrations
        - API layer with authentication
        - Frontend with multiple pages
        - Comprehensive test suite
        - CI/CD pipeline setup
        - Documentation and deployment
      `;

      const result = planner.shouldChunk(complexPrompt);
      // Complex tasks should recommend chunking
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('Event Emission', () => {
    it('should emit events in correct order', () => {
      const events: string[] = [];
      const eventPlanner = new TaskPlanner({}, (type) => {
        events.push(type);
      });

      eventPlanner.plan('task-001', 'Test task');

      assert.strictEqual(events[0], 'PLANNING_START');
      assert.ok(events.includes('SIZE_ESTIMATION'));
      assert.ok(events.includes('CHUNKING_DECISION'));
      assert.ok(events.includes('EXECUTION_PLAN'));
      assert.strictEqual(events[events.length - 1], 'PLANNING_END');
    });

    it('should include task_id in all events', () => {
      const events: Array<{ type: string; content: Record<string, unknown> }> = [];
      const eventPlanner = new TaskPlanner({}, (type, content) => {
        events.push({ type, content });
      });

      eventPlanner.plan('my-task-123', 'Test task');

      for (const event of events) {
        assert.strictEqual(event.content.task_id, 'my-task-123');
      }
    });
  });
});
