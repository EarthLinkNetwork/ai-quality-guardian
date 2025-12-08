---
skill: task-decomposer
version: 1.1.0
category: planning
description: タスクを1コミット粒度の独立した小タスクに分解する
metadata:
  id: task-decomposer
  display_name: Task Decomposer
  risk_level: low
  color_tag: BLUE
  task_types:
    - IMPLEMENTATION
    - CONFIG_CI_CHANGE
capabilities:
  - task_breakdown
  - dependency_analysis
  - size_estimation
  - parallel_task_identification
tools:
  - Read
  - Write
  - LS
  - Bash
  - TodoWrite
  - Task
priority: high
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
---

# Task Decomposer - タスク分解スキル

## Activation Conditions

pm-orchestrator から以下の TaskType で起動される:
- IMPLEMENTATION
- CONFIG_CI_CHANGE

## Processing Flow

```
1. ユーザープロンプトを受け取る
2. タスクの複雑度を分析
3. 1コミット粒度でタスクを分解
4. 依存関係を特定
5. 並列実行可能なタスクを識別
6. 結果をフォーマットして返却
```

## Input Format

```
ユーザー入力: [ユーザーのプロンプト]

このタスクを実行可能な小さなタスクに分解してください。
出力形式: 箇条書きのタスクリスト（1タスク1行）
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 Task Decomposer - タスク分解結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: BLUE | Risk: LOW | Category: planning

【分解されたタスクリスト】
1. [タスク1の内容]
2. [タスク2の内容]
3. [タスク3の内容]
...

【依存関係】
- タスク2はタスク1の完了後に実行
- タスク3,4は並列実行可能

【推定規模】
- 小規模タスク: X個
- 中規模タスク: Y個

Status: completed
```

## Responsibilities

1. **作業計画書の分析**
   - `docs/plans/` から作業計画書を読み込み
   - 各フェーズとタスクの依存関係を理解
   - 完了条件と品質基準を把握

2. **タスクの分解**
   - 1コミット = 1タスクの粒度で分解（論理的変更単位）
   - 確認可能性を最優先
   - 各タスクが独立して実行可能であることを確認

3. **タスクファイルの生成**
   - `docs/plans/tasks/` に個別タスクファイルを作成
   - 実行可能な具体的な手順を記載
   - 完了条件を明確に定義

## Task Size Guidelines

| 規模 | ファイル数 | 推奨度 |
|------|-----------|--------|
| 小規模（推奨） | 1-2 | ◎ |
| 中規模（許容） | 3-5 | ○ |
| 大規模（分割必須） | 6+ | × |

## Integration Points

- **入力元**: pm-orchestrator
- **出力先**: work-planner（次のステップ）

## Error Handling

- タスクが分解不能な場合: ユーザーに確認を求める
- 依存関係が循環する場合: 警告を出力

## Examples

### Example 1: 新機能追加

**入力:**
```
ユーザー入力: ログイン機能を追加してください
```

**出力:**
```
🔨 Task Decomposer - タスク分解結果

【分解されたタスクリスト】
1. ログインフォームコンポーネント作成
2. 認証APIエンドポイント実装
3. セッション管理ロジック追加
4. ログインページルーティング設定
5. 単体テスト作成

【依存関係】
- タスク3はタスク2の完了後に実行
- タスク1,2は並列実行可能

【推定規模】
- 小規模タスク: 3個
- 中規模タスク: 2個

Status: completed
```
