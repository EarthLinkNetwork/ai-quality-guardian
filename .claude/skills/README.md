# Skills Directory

This directory contains Claude Code Skills in the new SKILL.md format.

## Skills-First with Fallback Architecture v2.1.0

1. **Skills (.claude/skills/)**: Primary location for agent definitions
2. **Agents (.claude/agents/)**: Fallback location for backward compatibility

## Core Skills (v2.x)

All Skills migrated with metadata (category, risk_level, color_tag):

| Skill | Version | Category | Risk | Color | Status |
|-------|---------|----------|------|-------|--------|
| pm-orchestrator | v2.1.0 | orchestration | medium | 🟡 YELLOW | ✅ |
| task-decomposer | v1.1.0 | planning | low | 🔵 BLUE | ✅ |
| work-planner | v1.1.0 | planning | low | 🔵 BLUE | ✅ |
| requirement-analyzer | v1.1.0 | analysis | low | 🔵 BLUE | ✅ |
| technical-designer | v1.1.0 | design | low | 🔵 BLUE | ✅ |
| implementer | v1.1.0 | execution | medium | 🟠 ORANGE | ✅ |
| qa | v1.1.0 | quality | medium | 🟢 GREEN | ✅ |
| code-reviewer | v1.1.0 | review | medium | 🟢 GREEN | ✅ |
| reporter | v1.1.0 | reporting | low | 🟡 YELLOW | ✅ |

## v2.1.0 New Skills

| Skill | Version | Category | Risk | Color | Description |
|-------|---------|----------|------|-------|-------------|
| session-manager | v1.0.0 | session | low | 🟡 YELLOW | sessionId/taskRunId管理、継続判定 |
| task-tracker-sync | v1.0.0 | integration | low | 🟡 YELLOW | ClickUp/Asana連携 (MCP) |
| task-run-monitor | v1.0.0 | monitoring | low | 🟡 YELLOW | 停止タスク検知・警告 |
| e2e-test-runner | v1.0.0 | quality | medium | 🟢 GREEN | Playwright E2Eテスト |
| code-review-manager | v1.0.0 | review | medium | 🟢 GREEN | PR/レビューワークフロー |
| project-config-manager | v1.0.0 | configuration | low | 🟡 YELLOW | プロジェクト設定管理 |

## Documentation

| Document | Description |
|----------|-------------|
| SKILL_FORMAT_SPEC.md | SKILL.md format specification |
| SKILL_METADATA_FORMAT.md | Metadata (color, risk, category) specification |
| WORKFLOWS.md | TaskType workflow definitions |
| MIGRATION_GUIDE.md | Migration guide from agents |
| ARCHITECTURE_V3_DESIGN.md | v2.1.0 Architecture design document |

## Color Legend

| Color | Emoji | Category | Risk Level |
|-------|-------|----------|------------|
| BLUE | 🔵 | Planning/Analysis/Design | Low |
| GREEN | 🟢 | Quality/Review | Medium |
| YELLOW | 🟡 | Orchestration/Reporting/Config | Low-Medium |
| ORANGE | 🟠 | Implementation/Execution | Medium |
| RED_DANGER | ⛔ | Dangerous Operations | High |

## v2.1.0 Feature Summary

### Session Management
- `sessionId`: Claude Code 会話単位
- `taskRunId`: 実際の作業単位
- 継続判定: same_task / new_task / unknown

### Task Tracker Integration
- Provider: ClickUp, Asana (via MCP)
- 自動タスク作成・コメント追加

### Task Monitoring
- バックグラウンドウォッチャー
- 停止タスク検知
- Slack 通知（オプション）

### E2E Testing
- Playwright (headless)
- 複数ブラウザ対応

### Code Review Workflows
- Pattern A: local_pr (通常PR)
- Pattern B: review_remote (レビュー専用リポジトリ)

### Project Configuration
- `/pm-config` コマンド
- `.claude/project-config.json`

## SKILL.md Format

See `SKILL_FORMAT_SPEC.md` for the complete specification.
