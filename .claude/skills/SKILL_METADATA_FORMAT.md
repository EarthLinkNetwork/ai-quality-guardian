# Skill Metadata Format Specification v1.0.0

## Purpose

Define standardized metadata for Skills including:
- Category classification
- Risk level assessment
- Color tagging for visual identification
- TaskType mapping

## Metadata Fields

### Required Metadata (YAML Frontmatter Extension)

Add the following fields to existing SKILL.md frontmatter:

```yaml
---
skill: <skill-name>
version: <semver>
category: <category>
description: <description>

# === NEW METADATA FIELDS ===
metadata:
  id: <unique-skill-id>
  display_name: <human-readable-name>
  risk_level: <low|medium|high>
  color_tag: <color-tag>
  task_types:
    - <TaskType1>
    - <TaskType2>

capabilities:
  - ...
tools:
  - ...
priority: <priority>
activation: <activation>
---
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| metadata.id | string | Yes | Unique identifier (same as skill name) |
| metadata.display_name | string | Yes | Human-readable display name |
| metadata.risk_level | enum | Yes | low \| medium \| high |
| metadata.color_tag | enum | Yes | Color code for visual identification |
| metadata.task_types | list | Yes | List of TaskTypes this skill handles |

## Color Tag Specification

### Standard Color Tags

| Color Tag | Hex Code | Usage | Meaning |
|-----------|----------|-------|---------|
| BLUE | #3B82F6 | Design/Planning | Planning, design, analysis phase |
| GREEN | #22C55E | Quality/Safe | Quality assurance, low risk |
| YELLOW | #EAB308 | Orchestration/Caution | Coordination, moderate attention |
| ORANGE | #F97316 | Implementation | Active changes, moderate risk |
| RED | #EF4444 | Strict Quality | Strict validation, high attention |
| RED_DANGER | #DC2626 | Dangerous | Destructive operations, requires confirmation |

### Color Assignment Guidelines

| Category | Default Color | Rationale |
|----------|---------------|-----------|
| orchestration | YELLOW | Central coordination requires attention |
| planning | BLUE | Planning is preparatory, low immediate risk |
| analysis | BLUE | Analysis is read-only, exploratory |
| design | BLUE | Design is preparatory phase |
| execution/implementation | ORANGE | Active changes to codebase |
| quality | GREEN | Verification improves safety |
| quality (strict) | RED | Strict checks may block progress |
| review | GREEN | Review improves code quality |
| reporting | YELLOW | Summary/output phase |
| verification | GREEN | Verification is protective |
| dangerous | RED_DANGER | Requires explicit user approval |

## Risk Level Specification

### Risk Level Definitions

| Level | Description | Examples |
|-------|-------------|----------|
| low | Read-only operations, no state changes | requirement-analyzer, reporter |
| medium | Code changes with safety checks | implementer, qa, technical-designer |
| high | Destructive potential, requires review | code-reviewer (blocking), dangerous-op-handler |

### Risk Level Assignment Guidelines

| Category | Default Risk | Rationale |
|----------|--------------|-----------|
| orchestration | medium | Coordinates other agents, indirect impact |
| planning | low | Planning doesn't modify files |
| analysis | low | Read-only analysis |
| design | low | Design documents, not code changes |
| execution | medium | Direct code modifications |
| quality | medium | May flag issues, block merges |
| review | medium | Can request changes |
| reporting | low | Output generation only |
| dangerous | high | Destructive operations |

## TaskType Mapping

### TaskType Reference

| TaskType | Description | Associated Skills |
|----------|-------------|-------------------|
| READ_INFO | Information retrieval | requirement-analyzer, reporter |
| LIGHT_EDIT | Single file, minor change | implementer, qa |
| IMPLEMENTATION | Multi-file implementation | All skills in full pipeline |
| REVIEW_RESPONSE | PR review response | rule-checker, implementer, qa, reporter |
| CONFIG_CI_CHANGE | Configuration/CI changes | technical-designer, implementer, qa |
| DANGEROUS_OP | Destructive operations | rule-checker, dangerous-op-handler, implementer |

## Standard Skill Metadata Reference

### pm-orchestrator

| Key | Value |
|-----|-------|
| id | pm-orchestrator |
| display_name | PM Orchestrator |
| category | orchestration |
| risk_level | medium |
| color_tag | YELLOW |
| task_types | [ALL] |

### task-decomposer

| Key | Value |
|-----|-------|
| id | task-decomposer |
| display_name | Task Decomposer |
| category | planning |
| risk_level | low |
| color_tag | BLUE |
| task_types | [IMPLEMENTATION, CONFIG_CI_CHANGE] |

### requirement-analyzer

| Key | Value |
|-----|-------|
| id | requirement-analyzer |
| display_name | Requirement Analyzer |
| category | analysis |
| risk_level | low |
| color_tag | BLUE |
| task_types | [READ_INFO, IMPLEMENTATION, CONFIG_CI_CHANGE] |

### work-planner

| Key | Value |
|-----|-------|
| id | work-planner |
| display_name | Work Planner |
| category | planning |
| risk_level | low |
| color_tag | BLUE |
| task_types | [IMPLEMENTATION, CONFIG_CI_CHANGE] |

### technical-designer

| Key | Value |
|-----|-------|
| id | technical-designer |
| display_name | Technical Designer |
| category | design |
| risk_level | low |
| color_tag | BLUE |
| task_types | [IMPLEMENTATION, CONFIG_CI_CHANGE] |

### implementer

| Key | Value |
|-----|-------|
| id | implementer |
| display_name | Implementer |
| category | execution |
| risk_level | medium |
| color_tag | ORANGE |
| task_types | [LIGHT_EDIT, IMPLEMENTATION, REVIEW_RESPONSE, CONFIG_CI_CHANGE, DANGEROUS_OP] |

### qa

| Key | Value |
|-----|-------|
| id | qa |
| display_name | QA |
| category | quality |
| risk_level | medium |
| color_tag | GREEN |
| task_types | [LIGHT_EDIT, IMPLEMENTATION, REVIEW_RESPONSE, CONFIG_CI_CHANGE] |

### code-reviewer

| Key | Value |
|-----|-------|
| id | code-reviewer |
| display_name | Code Reviewer |
| category | review |
| risk_level | medium |
| color_tag | GREEN |
| task_types | [IMPLEMENTATION, CONFIG_CI_CHANGE] |

### reporter

| Key | Value |
|-----|-------|
| id | reporter |
| display_name | Reporter |
| category | reporting |
| risk_level | low |
| color_tag | YELLOW |
| task_types | [READ_INFO, IMPLEMENTATION, REVIEW_RESPONSE, CONFIG_CI_CHANGE] |

## Visual Reference

### Color Tag Visual Guide

```
┌─────────────────────────────────────────────────────────┐
│  BLUE     │ Planning/Design/Analysis                    │
│  🔵       │ task-decomposer, requirement-analyzer,      │
│           │ work-planner, technical-designer            │
├─────────────────────────────────────────────────────────┤
│  GREEN    │ Quality/Review                              │
│  🟢       │ qa, code-reviewer                           │
├─────────────────────────────────────────────────────────┤
│  YELLOW   │ Orchestration/Reporting                     │
│  🟡       │ pm-orchestrator, reporter                   │
├─────────────────────────────────────────────────────────┤
│  ORANGE   │ Implementation/Execution                    │
│  🟠       │ implementer                                 │
├─────────────────────────────────────────────────────────┤
│  RED      │ Strict Quality (blocking)                   │
│  🔴       │ (future: strict-qa, blocking-reviewer)      │
├─────────────────────────────────────────────────────────┤
│  RED_DANGER │ Dangerous Operations                      │
│  ⛔        │ (future: dangerous-op-handler)             │
└─────────────────────────────────────────────────────────┘
```

### Risk Level Visual Guide

```
┌─────────────────────────────────────────────────────────┐
│  LOW      │ Read-only, no state changes                 │
│  ●○○      │ requirement-analyzer, work-planner,         │
│           │ task-decomposer, technical-designer,        │
│           │ reporter                                    │
├─────────────────────────────────────────────────────────┤
│  MEDIUM   │ Code changes with safety checks             │
│  ●●○      │ pm-orchestrator, implementer, qa,           │
│           │ code-reviewer                               │
├─────────────────────────────────────────────────────────┤
│  HIGH     │ Destructive potential                       │
│  ●●●      │ (future: dangerous-op-handler)              │
└─────────────────────────────────────────────────────────┘
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-08 | Initial metadata specification |

## References

- SKILL_FORMAT_SPEC.md - Base SKILL.md format
- pm-orchestrator.md - Orchestration patterns
- WORKFLOWS.md - TaskType workflow definitions
