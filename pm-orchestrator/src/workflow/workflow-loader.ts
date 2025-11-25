/**
 * Workflow Loader Module
 *
 * 設定ファイルの読み込み、パース、バリデーションを行います。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { WorkflowConfig, WorkflowDefinition, DEFAULT_WORKFLOWS } from './workflow-config';

export class WorkflowLoader {
  private config: WorkflowConfig | null = null;

  /**
   * ワークフロー設定ファイルを読み込む
   */
  async loadFromFile(filePath: string): Promise<WorkflowConfig> {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Workflow config file not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
      this.config = yaml.load(content) as WorkflowConfig;
    } else if (ext === '.json') {
      this.config = JSON.parse(content);
    } else {
      throw new Error(`Unsupported file format: ${ext}. Use .yaml, .yml, or .json`);
    }

    if (!this.config) {
      throw new Error('Failed to load workflow config');
    }
    this.validateConfig(this.config);
    return this.config;
  }

  /**
   * デフォルトワークフローを読み込む
   */
  loadDefault(): WorkflowConfig {
    this.config = {
      workflows: DEFAULT_WORKFLOWS,
      defaults: {
        timeout: 3600000,
        maxConcurrency: 3,
        retryOnError: true
      }
    };

    return this.config;
  }

  /**
   * 設定をバリデーション
   */
  private validateConfig(config: WorkflowConfig): void {
    if (!config.workflows || !Array.isArray(config.workflows)) {
      throw new Error('Invalid workflow config: "workflows" must be an array');
    }

    for (const workflow of config.workflows) {
      this.validateWorkflow(workflow);
    }
  }

  /**
   * 個別ワークフローをバリデーション
   */
  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.name) {
      throw new Error('Workflow must have a name');
    }

    if (!workflow.pattern) {
      throw new Error(`Workflow "${workflow.name}" must have a pattern`);
    }

    if (!workflow.steps || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      throw new Error(`Workflow "${workflow.name}" must have at least one step`);
    }

    const validAgents = [
      'pm-orchestrator',
      'rule-checker',
      'code-analyzer',
      'designer',
      'implementer',
      'tester',
      'qa',
      'cicd-engineer',
      'reporter'
    ];

    for (const step of workflow.steps) {
      if (!step.agent) {
        throw new Error(`Step in workflow "${workflow.name}" must have an agent`);
      }

      if (!validAgents.includes(step.agent)) {
        throw new Error(
          `Invalid agent "${step.agent}" in workflow "${workflow.name}". ` +
          `Valid agents: ${validAgents.join(', ')}`
        );
      }
    }
  }

  /**
   * ユーザー入力にマッチするワークフローを検索
   */
  findMatchingWorkflow(userInput: string): WorkflowDefinition | null {
    if (!this.config) {
      this.loadDefault();
    }

    for (const workflow of this.config!.workflows) {
      if (this.matchesPattern(userInput, workflow.pattern)) {
        return workflow;
      }
    }

    return null;
  }

  /**
   * パターンマッチング
   */
  private matchesPattern(input: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return input.toLowerCase().includes(pattern.toLowerCase());
    } else {
      return pattern.test(input);
    }
  }

  /**
   * 全ワークフローを取得
   */
  getAllWorkflows(): WorkflowDefinition[] {
    if (!this.config) {
      this.loadDefault();
    }

    return this.config!.workflows;
  }

  /**
   * デフォルト設定を取得
   */
  getDefaults(): WorkflowConfig['defaults'] {
    if (!this.config) {
      this.loadDefault();
    }

    return this.config!.defaults || {
      timeout: 3600000,
      maxConcurrency: 3,
      retryOnError: true
    };
  }

  /**
   * 設定をYAML形式で保存
   */
  async saveToFile(filePath: string, format: 'yaml' | 'json' = 'yaml'): Promise<void> {
    if (!this.config) {
      throw new Error('No config loaded');
    }

    const absolutePath = path.resolve(filePath);
    const dir = path.dirname(absolutePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let content: string;

    if (format === 'yaml') {
      content = yaml.dump(this.config, {
        indent: 2,
        lineWidth: 100,
        noRefs: true
      });
    } else {
      content = JSON.stringify(this.config, null, 2);
    }

    fs.writeFileSync(absolutePath, content, 'utf-8');
  }
}
