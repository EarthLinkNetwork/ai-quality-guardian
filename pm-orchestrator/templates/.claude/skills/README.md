# PM Orchestrator Skills

PM Orchestrator で使用されるスキル定義ファイル。

## スキル一覧

| スキル | 説明 |
|--------|------|
| pm-orchestrator | 中央ハブ。全ユーザー入力を処理 |

## Skills-First with Fallback Architecture

```
Lookup Flow:
1. Check .claude/skills/<skill-name>.md (Primary)
2. If not found → .claude/agents/<skill-name>.md (Fallback)
3. If neither found → Error
```

## スキルフォーマット

スキルは YAML frontmatter + Markdown body 形式:

```yaml
---
skill: skill-name
version: 1.0.0
category: orchestration
description: Brief description
capabilities:
  - capability_1
  - capability_2
tools:
  - Task
  - Read
priority: critical
activation: always
---

# Skill Content in Markdown...
```

## カテゴリ

| カテゴリ | 説明 |
|----------|------|
| orchestration | オーケストレーション・調整 |
| planning | 計画・分解 |
| analysis | 分析・要件整理 |
| design | 設計 |
| execution | 実装・実行 |
| quality | 品質保証・検証 |
| review | レビュー |
| reporting | レポート・報告 |
