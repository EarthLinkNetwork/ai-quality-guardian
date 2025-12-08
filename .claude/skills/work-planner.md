---
skill: work-planner
version: 1.1.0
category: planning
description: 作業計画書を作成し、実装タスクを構造化して進捗追跡可能な実行計画を立案する
metadata:
  id: work-planner
  display_name: Work Planner
  risk_level: low
  color_tag: BLUE
  task_types:
    - IMPLEMENTATION
    - CONFIG_CI_CHANGE
capabilities:
  - task_assignment
  - phase_structuring
  - dependency_management
  - progress_tracking
tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - LS
  - TodoWrite
  - Task
priority: high
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: task-decomposer
    relationship: receives_input_from
---

# Work Planner - 作業計画スキル

## Activation Conditions

pm-orchestrator から以下の TaskType で起動される:
- IMPLEMENTATION
- CONFIG_CI_CHANGE

## Processing Flow

```
1. タスクリスト（task-decomposerの出力）を受け取る
2. 各タスクに担当エージェントを割り当て
3. フェーズ構成を決定
4. 依存関係に基づく実行順序を設計
5. 成果物を明確化
6. 結果をフォーマットして返却
```

## Input Format

```
タスクリスト（task-decomposerの出力）:
1. [タスク1]
2. [タスク2]
...

各タスクに担当者と成果物を割り当ててください。
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 Work Planner - 担当割り当て結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: BLUE | Risk: LOW | Category: planning

| タスク | 担当エージェント | 成果物 |
|--------|------------------|--------|
| タスク1 | implementer | src/feature.ts |
| タスク2 | implementer | tests/feature.test.ts |
| タスク3 | qa | テストレポート |

【フェーズ構成】
Phase 1: タスク1, タスク2（基盤実装）
Phase 2: タスク3（品質検証）

Status: completed
```

## Responsibilities

1. 実装タスクの洗い出しと構造化
2. タスクの依存関係の明確化
3. フェーズ分けと優先順位付け
4. 各タスクの完了条件の定義
5. 各フェーズのE2E確認手順の定義
6. リスクと対策の具体化
7. 進捗追跡可能な形式での文書化

## Agent Assignment Rules

| タスク種別 | 担当エージェント |
|-----------|-----------------|
| コード実装 | implementer |
| テスト作成 | implementer |
| 品質検証 | qa |
| レビュー | code-reviewer |
| 設計 | technical-designer |

## Integration Points

- **入力元**: task-decomposer
- **出力先**: requirement-analyzer（次のステップ）

## Error Handling

- タスクが割り当て不能な場合: 手動割り当てを提案
- フェーズ設計が複雑すぎる場合: 分割を提案

## Examples

### Example 1: 機能追加の計画

**入力:**
```
タスクリスト:
1. ログインフォームコンポーネント作成
2. 認証APIエンドポイント実装
3. セッション管理ロジック追加
4. 単体テスト作成
```

**出力:**
```
📝 Work Planner - 担当割り当て結果

| タスク | 担当エージェント | 成果物 |
|--------|------------------|--------|
| ログインフォーム | implementer | src/components/LoginForm.tsx |
| 認証API | implementer | src/api/auth.ts |
| セッション管理 | implementer | src/lib/session.ts |
| 単体テスト | implementer | tests/*.test.ts |

【フェーズ構成】
Phase 1: 認証API, セッション管理（バックエンド）
Phase 2: ログインフォーム（フロントエンド）
Phase 3: 単体テスト（品質保証）

Status: completed
```
