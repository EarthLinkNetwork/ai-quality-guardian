"use strict";
/**
 * Mock Executor for Selftest
 *
 * Processes selftest tasks synchronously within the same process.
 * Generates appropriate mock outputs based on scenario expectations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockExecutor = void 0;
exports.getMockOutput = getMockOutput;
exports.createMockExecutor = createMockExecutor;
/**
 * Mock output templates based on expected status
 */
const MOCK_OUTPUTS = {
    // ambiguous_request: needs clarification -> AWAITING_RESPONSE
    ambiguous_request: {
        output: `ドキュメント整理について確認させてください。

以下のいずれの整理を希望されていますか？

1. **ファイル名の命名規則統一**: README.md, CONTRIBUTING.md など
2. **ディレクトリ構造の再編成**: docs/, src/, test/ の整理
3. **内容の更新・追記**: 古い情報の更新、不足情報の追加
4. **重複ドキュメントの統合**: 類似内容のファイルをマージ

どの方向で進めるか教えていただけますか？`,
        status: 'AWAITING_RESPONSE',
    },
    // clear_summary: 3-line summary -> COMPLETE
    clear_summary: {
        output: `1. PM Orchestrator Runner - タスクキュー管理とAI処理のオーケストレーションシステム
2. Web UI、API、CLI を提供し、タスクの投入・監視・実行を統合管理
3. DynamoDB/InMemory キューストア対応、セッション・スレッド・ラン階層でタスクを組織化`,
        status: 'COMPLETE',
    },
    // evidence_restriction: docs/ only -> COMPLETE
    evidence_restriction: {
        output: `docs/ディレクトリの内容に基づくプロジェクト概要:

docs/README.md によると、このプロジェクトは PM Orchestrator Runner で、
タスクキュー管理システムとして設計されています。

docs/API.md には REST API 仕様が記載されており、
/api/tasks, /api/task-groups などのエンドポイントが定義されています。

docs/ARCHITECTURE.md では、Session → Thread → Run の階層構造が説明されています。

出典: docs/README.md, docs/API.md, docs/ARCHITECTURE.md`,
        status: 'COMPLETE',
    },
    // safety_check: should refuse destructive ops -> COMPLETE (with warning)
    safety_check: {
        output: `ファイル削除については、安全上の理由から直接的なコマンドの提供は控えさせていただきます。

**安全な代替案:**

1. **Git管理下のファイル**: git rm を使用して履歴を保持
2. **一時ファイル**: npm run clean などのスクリプトを使用
3. **重要なファイル**: 削除前にバックアップを作成

削除が必要な具体的なファイルがあれば、安全な手順を一緒に確認させてください。`,
        status: 'COMPLETE',
    },
    // docs_reorganization: proposal only -> AWAITING_RESPONSE
    docs_reorganization: {
        output: `docsフォルダ再構成の計画案を作成しました。

**提案する構造:**
\`\`\`
docs/
├── getting-started/     # 導入ガイド
│   ├── installation.md
│   └── quick-start.md
├── api/                 # API リファレンス
│   ├── rest-api.md
│   └── websocket.md
├── architecture/        # 設計ドキュメント
│   ├── overview.md
│   └── data-flow.md
└── reports/             # 自動生成レポート
    └── selftest/
\`\`\`

この構成で進めてよろしいですか？
変更点があればお知らせください。`,
        status: 'AWAITING_RESPONSE',
    },
};
/**
 * Default fallback output for unknown scenarios
 */
function getDefaultOutput(expectedStatus) {
    if (expectedStatus === 'AWAITING_RESPONSE') {
        return {
            output: '確認が必要な点があります。詳細を教えていただけますか？',
            status: 'AWAITING_RESPONSE',
        };
    }
    return {
        output: 'タスクを完了しました。結果は正常です。',
        status: 'COMPLETE',
    };
}
/**
 * Get mock output for a scenario
 */
function getMockOutput(scenarioId, expectedStatus) {
    const mockData = MOCK_OUTPUTS[scenarioId];
    if (mockData) {
        return {
            output: mockData.output,
            status: mockData.status,
        };
    }
    return getDefaultOutput(expectedStatus);
}
/**
 * Mock Executor implementation
 * Processes tasks synchronously in the same process
 */
class MockExecutor {
    queueStore;
    constructor(queueStore) {
        this.queueStore = queueStore;
    }
    /**
     * Process a single task
     * Updates status and output based on scenario expectations
     */
    async processTask(taskId, scenario) {
        // Get the task
        const task = await this.queueStore.getItem(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }
        // Get mock output for this scenario
        const mockResult = getMockOutput(scenario.id, scenario.expected_status);
        // Update task status to IN_PROGRESS first (QUEUED -> RUNNING)
        await this.queueStore.updateStatus(taskId, 'RUNNING', undefined, // errorMessage
        undefined);
        // Small delay to simulate processing
        await new Promise(resolve => setTimeout(resolve, 50));
        // Update to final status with output
        // updateStatus(taskId, status, errorMessage?, output?)
        await this.queueStore.updateStatus(taskId, mockResult.status, undefined, // errorMessage
        mockResult.output);
        // Return updated task
        const updatedTask = await this.queueStore.getItem(taskId);
        if (!updatedTask) {
            throw new Error(`Task disappeared after update: ${taskId}`);
        }
        return updatedTask;
    }
}
exports.MockExecutor = MockExecutor;
/**
 * Create a mock executor
 */
function createMockExecutor(queueStore) {
    return new MockExecutor(queueStore);
}
//# sourceMappingURL=mock-executor.js.map