/**
 * PM Orchestrator Enhancement - CICDEngineer Unit Tests
 */

import { CICDEngineer } from '../../../src/subagents/cicd-engineer';
import { PipelineConfig } from '../../../src/types';

describe('CICDEngineer', () => {
  let engineer: CICDEngineer;
  let mockPipeline: PipelineConfig;

  beforeEach(() => {
    engineer = new CICDEngineer();
    mockPipeline = {
      stages: [
        {
          name: 'build',
          steps: [
            { name: 'Install', command: 'npm install' },
            { name: 'Build', command: 'npm run build' }
          ]
        },
        {
          name: 'test',
          steps: [{ name: 'Test', command: 'npm test' }]
        }
      ],
      triggers: [{ type: 'push', branches: ['main', 'develop'] }],
      environment: { NODE_ENV: 'production' }
    };
  });

  describe('buildPipeline', () => {
    it('should build GitHub Actions pipeline', async () => {
      const result = await engineer.buildPipeline('github', mockPipeline);

      expect(result.status).toBe('completed');
      expect(result.configFiles.length).toBeGreaterThan(0);
      expect(result.workflows.length).toBeGreaterThan(0);
      expect(result.validationResult).toBeDefined();
    });

    it('should build GitLab CI pipeline', async () => {
      const result = await engineer.buildPipeline('gitlab', mockPipeline);

      expect(result.status).toBe('completed');
      expect(result.configFiles.length).toBeGreaterThan(0);
      expect(result.workflows.length).toBeGreaterThan(0);
    });

    it('should build Jenkins pipeline', async () => {
      const result = await engineer.buildPipeline('jenkins', mockPipeline);

      expect(result.status).toBe('completed');
      expect(result.configFiles.length).toBeGreaterThan(0);
      expect(result.workflows.length).toBeGreaterThan(0);
    });

    it('should generate correct config file names for GitHub', async () => {
      const result = await engineer.buildPipeline('github', mockPipeline);

      expect(result.configFiles).toContain('.github/workflows/ci.yml');
    });

    it('should generate correct config file names for GitLab', async () => {
      const result = await engineer.buildPipeline('gitlab', mockPipeline);

      expect(result.configFiles).toContain('.gitlab-ci.yml');
    });

    it('should generate correct config file names for Jenkins', async () => {
      const result = await engineer.buildPipeline('jenkins', mockPipeline);

      expect(result.configFiles).toContain('Jenkinsfile');
    });

    it('should include workflow details', async () => {
      const result = await engineer.buildPipeline('github', mockPipeline);

      const workflow = result.workflows[0];
      expect(workflow.name).toBeDefined();
      expect(workflow.file).toBeDefined();
    });

    it('should validate pipeline configuration', async () => {
      const result = await engineer.buildPipeline('github', mockPipeline);

      expect(result.validationResult.valid).toBeDefined();
      expect(result.validationResult.errors).toBeDefined();
    });

    it('should pass validation for complete pipeline', async () => {
      const result = await engineer.buildPipeline('github', mockPipeline);

      expect(result.validationResult.valid).toBe(true);
      expect(result.validationResult.errors).toHaveLength(0);
    });
  });
});
