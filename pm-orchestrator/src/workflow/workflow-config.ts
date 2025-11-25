/**
 * Workflow Configuration Module
 *
 * YAML/JSON形式のワークフロー定義とパターンマッチングルールを提供します。
 */

export interface WorkflowStep {
  agent: string;
  description?: string;
  condition?: string;
  timeout?: number;
  retryOnError?: boolean;
}

export interface WorkflowDefinition {
  name: string;
  pattern: string | RegExp;
  description?: string;
  steps: WorkflowStep[];
  options?: {
    parallel?: boolean;
    timeout?: number;
    rollbackOnError?: boolean;
  };
}

export interface WorkflowConfig {
  workflows: WorkflowDefinition[];
  defaults?: {
    timeout?: number;
    maxConcurrency?: number;
    retryOnError?: boolean;
  };
}

/**
 * Example workflow configuration (YAML format):
 *
 * ```yaml
 * workflows:
 *   - name: "PR Review Response"
 *     pattern: "pr_review_response"
 *     description: "PRレビュー対応ワークフロー"
 *     steps:
 *       - agent: "rule-checker"
 *         description: "ルールチェック"
 *       - agent: "implementer"
 *         description: "実装"
 *       - agent: "qa"
 *         description: "品質チェック"
 *         condition: "implementer.status == 'success'"
 *       - agent: "reporter"
 *         description: "結果報告"
 *     options:
 *       parallel: false
 *       timeout: 3600000
 *
 *   - name: "Quality Check"
 *     pattern: "quality_check"
 *     description: "品質チェックワークフロー"
 *     steps:
 *       - agent: "qa"
 *       - agent: "reporter"
 *     options:
 *       parallel: true
 *       timeout: 600000
 *
 * defaults:
 *   timeout: 3600000
 *   maxConcurrency: 3
 *   retryOnError: true
 * ```
 */

export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = [
  {
    name: 'PR Review Response',
    pattern: /pr.?review|coderabbit|review.?comment/i,
    description: 'PRレビュー対応ワークフロー',
    steps: [
      { agent: 'rule-checker', description: 'MUST Rulesチェック' },
      { agent: 'implementer', description: '指摘事項の実装' },
      { agent: 'qa', description: '品質チェック', condition: 'implementer.status == "success"' },
      { agent: 'reporter', description: '結果報告' }
    ],
    options: {
      parallel: false,
      timeout: 3600000
    }
  },
  {
    name: 'Version Update',
    pattern: /version.?update|バージョン.?更新/i,
    description: 'バージョン更新ワークフロー',
    steps: [
      { agent: 'rule-checker', description: 'バージョン管理ルールチェック' },
      { agent: 'implementer', description: 'バージョン番号更新' },
      { agent: 'qa', description: '全箇所更新確認' },
      { agent: 'reporter', description: '結果報告' }
    ],
    options: {
      parallel: false,
      timeout: 1800000
    }
  },
  {
    name: 'Quality Check',
    pattern: /quality.?check|品質.?チェック|lint|test|typecheck/i,
    description: '品質チェックワークフロー',
    steps: [
      { agent: 'qa', description: 'lint/test/typecheck/build実行' },
      { agent: 'reporter', description: '結果報告' }
    ],
    options: {
      parallel: true,
      timeout: 600000
    }
  },
  {
    name: 'Complex Implementation',
    pattern: /複雑.?実装|complex.?implementation|新機能/i,
    description: '複雑な実装ワークフロー',
    steps: [
      { agent: 'rule-checker', description: 'ルールチェック' },
      { agent: 'designer', description: '設計' },
      { agent: 'implementer', description: '実装' },
      { agent: 'tester', description: 'テスト作成' },
      { agent: 'qa', description: '品質チェック' },
      { agent: 'reporter', description: '結果報告' }
    ],
    options: {
      parallel: false,
      timeout: 7200000,
      rollbackOnError: true
    }
  },
  {
    name: 'List Modification',
    pattern: /一覧.?修正|list.?modification|複数.?箇所/i,
    description: '一覧修正ワークフロー',
    steps: [
      { agent: 'rule-checker', description: 'MUST Rule 7チェック（全体確認義務）' },
      { agent: 'implementer', description: '全箇所一括修正' },
      { agent: 'qa', description: '全箇所更新確認' },
      { agent: 'reporter', description: '結果報告' }
    ],
    options: {
      parallel: false,
      timeout: 1800000
    }
  }
];
