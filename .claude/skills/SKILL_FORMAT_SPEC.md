# SKILL.md Format Specification v1.0.0

## Purpose

Define a standardized format for Claude Code Skills that provides:
- Clear metadata in YAML frontmatter
- Structured content in Markdown body
- Backward compatibility with existing agent definitions
- Forward compatibility with Claude Code's native Skills system

## Format Structure

### YAML Frontmatter (Required)

```yaml
---
skill: <skill-name>                    # Lowercase, hyphenated identifier
version: <semver>                      # Semantic version (e.g., 1.0.0)
category: <category-name>              # Category for organization
description: <one-line-description>    # Brief description (<100 chars)
capabilities:                          # List of what this skill can do
  - capability_1
  - capability_2
tools:                                 # Claude Code tools this skill uses
  - Task
  - Read
  - Write
priority: <priority-level>             # critical | high | medium | low
activation: <activation-mode>          # always | on_demand | conditional
---
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| skill | string | Yes | Unique identifier (lowercase, hyphenated) |
| version | string | Yes | Semantic version (MAJOR.MINOR.PATCH) |
| category | string | Yes | Organizational category |
| description | string | Yes | One-line description |
| capabilities | list | Yes | List of skill capabilities |
| tools | list | Yes | List of Claude Code tools used |
| priority | enum | Yes | critical \| high \| medium \| low |
| activation | enum | Yes | always \| on_demand \| conditional |

### Markdown Body (Required)

Following the frontmatter, structure content as:

```markdown
# Skill Name - Brief Title

## Activation Conditions
[When/how this skill is activated]

## Processing Flow
[Step-by-step process]

## Input Format
[Expected input structure]

## Output Format
[Expected output structure]

## Responsibilities
[What this skill is responsible for]

## Integration Points
[How this skill integrates with other skills/agents]

## Error Handling
[How errors are handled]

## Examples
[Usage examples]
```

## Naming Conventions

### Skill Identifier
- **Format**: lowercase-with-hyphens
- **Examples**: `pm-orchestrator`, `task-decomposer`, `code-reviewer`
- **Rule**: Must match filename without `.md` extension

### File Naming
- **Location**: `.claude/skills/`
- **Format**: `<skill-identifier>.md`
- **Examples**: `pm-orchestrator.md`, `task-decomposer.md`

### Version Numbering
- **Format**: Semantic Versioning (semver)
- **Pattern**: `MAJOR.MINOR.PATCH`
- **Examples**: `1.0.0`, `2.1.3`
- **Rules**:
  - MAJOR: Breaking changes
  - MINOR: New features, backward compatible
  - PATCH: Bug fixes, backward compatible

## Category Taxonomy

### Standard Categories

| Category | Description | Examples |
|----------|-------------|----------|
| orchestration | Coordination and management | pm-orchestrator |
| decomposition | Breaking down tasks | task-decomposer |
| planning | Planning and strategy | work-planner |
| analysis | Analysis and investigation | requirement-analyzer |
| design | Technical design | technical-designer |
| implementation | Code implementation | implementer |
| quality | Quality assurance | qa, code-reviewer |
| reporting | Reporting and documentation | reporter |
| verification | Verification and validation | rule-checker |

## Priority Levels

| Priority | Use Case | Examples |
|----------|----------|----------|
| critical | Must execute first, blocking | pm-orchestrator |
| high | Important, should execute early | task-decomposer, requirement-analyzer |
| medium | Standard priority | implementer, qa |
| low | Can be deferred | reporter |

## Activation Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| always | Activated on every user input | pm-orchestrator |
| on_demand | Activated when explicitly requested | code-reviewer, reporter |
| conditional | Activated based on conditions | qa (only when code changes) |

## Capability Naming

### Format
- **Pattern**: `lowercase_with_underscores`
- **Examples**: `task_type_classification`, `write_permission_control`

### Standard Capabilities

| Capability | Description |
|------------|-------------|
| task_type_classification | Determine type of task |
| write_permission_control | Control write access |
| subagent_orchestration | Coordinate subagents |
| risk_assessment | Assess operation risks |
| task_breakdown | Break tasks into subtasks |
| requirement_extraction | Extract requirements |
| design_synthesis | Synthesize technical designs |
| code_generation | Generate code |
| quality_verification | Verify quality |
| test_generation | Generate tests |
| code_review | Review code changes |
| report_generation | Generate reports |

## Tool Reference

### Standard Tool List

```yaml
tools:
  - Task        # Launch subagents
  - Read        # Read files
  - Write       # Write files
  - Edit        # Edit files in-place
  - Bash        # Execute bash commands
  - Grep        # Search file contents
  - Glob        # Find files by pattern
  - LS          # List directory contents
  - TodoWrite   # Manage todo lists
```

## Backward Compatibility

### Fallback Mechanism

When a skill is not found in `.claude/skills/`, the system falls back to `.claude/agents/`:

1. Check `.claude/skills/<skill-name>.md`
2. If not found, check `.claude/agents/<skill-name>.md`
3. If neither found, report error

### Migration Path

1. **Phase 1**: Create skill in `.claude/skills/`
2. **Phase 2**: Keep agent in `.claude/agents/` for compatibility
3. **Phase 3**: After all projects updated, remove from `.claude/agents/`

## Validation Rules

### YAML Frontmatter Validation

1. Must be valid YAML
2. Must start and end with `---`
3. All required fields must be present
4. skill identifier must match filename
5. version must be valid semver
6. priority must be one of: critical, high, medium, low
7. activation must be one of: always, on_demand, conditional
8. capabilities must be a non-empty list
9. tools must be a non-empty list

### Content Validation

1. Must have at least one H1 heading
2. Must include "Activation Conditions" section
3. Must include "Processing Flow" section
4. Must include "Responsibilities" section

## Example: Complete Skill Definition

```markdown
---
skill: example-skill
version: 1.0.0
category: implementation
description: Example skill demonstrating the SKILL.md format
capabilities:
  - example_capability_1
  - example_capability_2
tools:
  - Task
  - Read
  - Write
priority: medium
activation: on_demand
---

# Example Skill - Demonstration

## Activation Conditions

This skill is activated when...

## Processing Flow

1. Step 1
2. Step 2
3. Step 3

## Input Format

```json
{
  "input": "value"
}
```

## Output Format

```json
{
  "output": "value"
}
```

## Responsibilities

- Responsibility 1
- Responsibility 2

## Integration Points

- Integrates with skill A
- Calls skill B

## Error Handling

- Error type 1: Action
- Error type 2: Action

## Examples

### Example 1

Input:
```
Example input
```

Output:
```
Example output
```
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-08 | Initial specification |

## References

- Claude Code Skills Documentation
- PM Orchestrator Architecture v2.0.0
