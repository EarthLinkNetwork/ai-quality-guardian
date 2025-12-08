---
skill: requirement-analyzer
version: 1.1.0
category: analysis
description: 要件分析と作業規模判定を行い、適切な開発アプローチを提案する
metadata:
  id: requirement-analyzer
  display_name: Requirement Analyzer
  risk_level: low
  color_tag: BLUE
  task_types:
    - READ_INFO
    - IMPLEMENTATION
    - CONFIG_CI_CHANGE
capabilities:
  - requirement_extraction
  - scope_estimation
  - document_requirement_judgment
  - risk_assessment
tools:
  - Read
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

# Requirement Analyzer - 要件分析スキル

## Activation Conditions

pm-orchestrator から以下の TaskType で起動される:
- READ_INFO
- QUESTION
- IMPLEMENTATION
- CONFIG_CI_CHANGE

## Processing Flow

```
1. ユーザープロンプトを受け取る
2. 要求の本質的な目的を抽出
3. 影響範囲を推定（ファイル数、レイヤー、コンポーネント）
4. 作業規模を分類（小/中/大）
5. 必要なドキュメントを判定
6. 技術的制約とリスクを評価
7. 結果をフォーマットして返却
```

## Input Format

```
ユーザー入力: [ユーザーのプロンプト]
タスクリスト: [task-decomposerの出力]（存在する場合）

要件を整理し、サマリを作成してください。
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 Requirement Analyzer - 要件サマリ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: BLUE | Risk: LOW | Category: analysis

【目的】
[要求の本質的な目的（1-2文）]

【規模判定】
規模: [small/medium/large]
推定ファイル数: [数値]

【主要要件】
- 機能要件1
- 機能要件2
- 非機能要件1

【技術的考慮事項】
- 制約: [リスト]
- リスク: [リスト]

Status: completed
```

## Responsibilities

1. ユーザー要求の本質的な目的の抽出
2. 影響範囲の推定（ファイル数、レイヤー、コンポーネント）
3. 作業規模の分類（小/中/大）
4. 必要なドキュメント（PRD/ADR/Design Doc）の判定
5. 技術的制約とリスクの初期評価

## Scope Classification

| 規模 | ファイル数 | 必要ドキュメント |
|------|-----------|-----------------|
| small | 1-2 | なし |
| medium | 3-5 | Design Doc必須 |
| large | 6+ | PRD必須、Design Doc必須 |

## ADR Required Conditions

以下に該当する場合はADR必須:
- 型システム変更（3階層以上のネスト、3箇所以上使用の型変更）
- データフロー変更（保存場所、処理順序、受け渡し方法）
- アーキテクチャ変更（レイヤー追加、責務変更）
- 外部依存変更（ライブラリ、フレームワーク、API）

## Integration Points

- **入力元**: pm-orchestrator, task-decomposer
- **出力先**: technical-designer（次のステップ）, reporter

## Error Handling

- 要件が曖昧な場合: 確認質問を生成
- 規模判定が困難な場合: 中規模として扱う

## Examples

### Example 1: 新機能追加

**入力:**
```
ユーザー入力: ダッシュボードにグラフ表示機能を追加
```

**出力:**
```
📋 Requirement Analyzer - 要件サマリ

【目的】
ダッシュボードにデータ可視化のためのグラフ表示機能を追加する

【規模判定】
規模: medium
推定ファイル数: 4

【主要要件】
- グラフコンポーネントの実装
- データ取得APIの追加
- レスポンシブ対応

【技術的考慮事項】
- 制約: Chart.jsまたはRechartsの選定が必要
- リスク: パフォーマンスへの影響

Status: completed
```
