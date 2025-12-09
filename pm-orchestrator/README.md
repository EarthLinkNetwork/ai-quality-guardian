# PM Orchestrator Enhancement

Multi-agent parallel execution system for Claude Code projects.

[日本語版 README](./README.ja.md)

## Overview

PM Orchestrator Enhancement is a TypeScript-based multi-agent orchestration system that manages Claude Code sub-agents for complex task execution. It provides structured workflows, parallel execution, and quality management.

### Key Features

- **Multi-agent Orchestration**: Coordinate multiple specialized sub-agents
- **Parallel Execution**: Run independent tasks concurrently for efficiency
- **Skills-First Architecture**: Prioritize `.claude/skills/` over `.claude/agents/`
- **Evidence-Based Completion**: Prevent false "done" claims without verification
- **Workflow Management**: Define and execute complex task workflows
- **Quality Integration**: Built-in quality checks via QA sub-agent

## Installation

This package is published under two names with identical content:

```bash
# Either of these will install the same package:
npm install -g pm-orchestrator-enhancement
npm install -g quality-guardian
```

Or use without installation:

```bash
npx pm-orchestrator-enhancement install
# or
npx quality-guardian install
```

## Architecture

### Hub-and-Spoke Model

```
                    ┌─────────────────────┐
                    │   PM Orchestrator   │ ◄── Central Hub
                    │     (Decision)      │
                    └──────────┬──────────┘
                               │
       ┌───────────┬───────────┼───────────┬───────────┐
       │           │           │           │           │
       ▼           ▼           ▼           ▼           ▼
┌───────────┐┌───────────┐┌───────────┐┌───────────┐┌───────────┐
│  Designer ││Implementer││    QA     ││  Reporter ││Rule Checker│
└───────────┘└───────────┘└───────────┘└───────────┘└───────────┘
```

### Task Types

| TaskType | Description | Sub-agents Used |
|----------|-------------|-----------------|
| READ_INFO | Information retrieval | Reporter |
| LIGHT_EDIT | Simple file changes | Implementer → QA → Reporter |
| IMPLEMENTATION | Feature implementation | Designer → Implementer → QA → Reporter |
| REVIEW_RESPONSE | PR review handling | Rule Checker → Implementer → QA → Reporter |
| CONFIG_CI_CHANGE | CI/Config changes | Implementer → QA → Reporter |
| DANGEROUS_OP | Risky operations | Rule Checker → (User Confirmation) |

### Skills-First with Fallback

```
Lookup Order:
1. .claude/skills/<skill-name>.md  (Primary)
2. .claude/agents/<skill-name>.md  (Fallback)
```

## Usage

### With Claude Code

PM Orchestrator is automatically triggered via the `user-prompt-submit` hook when you interact with Claude Code in a configured project.

### Programmatic Usage

```typescript
import { PMOrchestrator } from 'pm-orchestrator-enhancement';

const pm = new PMOrchestrator({
  skillsDir: '.claude/skills',
  agentsDir: '.claude/agents',
});

const result = await pm.execute({
  input: 'Implement user authentication',
  taskType: 'IMPLEMENTATION',
});
```

## Evidence-Based Completion

PM Orchestrator enforces evidence-based reporting to prevent false completion claims:

### evidenceStatus

| Status | Meaning | Allowed Expressions |
|--------|---------|---------------------|
| HAS_EVIDENCE | Verified with commands/file reads | "Completed", "Done" |
| NO_EVIDENCE | Inference only, unverified | "Proposal", "Unverified" |

### Example Output

```yaml
【Evidence】
evidenceStatus: HAS_EVIDENCE
- command: "npm test"
  result: "15/15 passed"
- file: "src/feature.ts"
  action: "created"
  verified: true

Status: success
```

## Configuration

### Project Setup

Run the install command to set up PM Orchestrator in your project:

```bash
npx pm-orchestrator-enhancement install
```

This creates:
- `.claude/skills/` - Skill definitions
- `.claude/agents/` - Agent definitions (fallback)
- `.claude/hooks/user-prompt-submit.sh` - Auto-trigger hook
- `.claude/settings.json` - Configuration

### settings.json

```json
{
  "skills": {
    "directory": ".claude/skills",
    "fallbackDirectory": ".claude/agents",
    "enableFallback": true,
    "priority": "skills-first"
  }
}
```

## Publishing (for maintainers)

This package is published under two npm names simultaneously. Always use the dual-publish script:

```bash
# Dry run (test without publishing)
npm run publish:dry-run

# Actual publish (publishes both pm-orchestrator-enhancement and quality-guardian)
npm run publish:dual
```

**Important**: Do NOT use `npm publish` directly. Always use `npm run publish:dual` to ensure both packages are updated.

## Repository Structure

This package is part of the [ai-quality-guardian](https://github.com/EarthLinkNetwork/ai-quality-guardian) monorepo:

```
ai-quality-guardian/
├── .claude/                  # Shared configuration
│   ├── skills/              # Skill definitions
│   ├── agents/              # Agent definitions
│   └── hooks/               # Git/Claude hooks
├── pm-orchestrator/         # This package (pm-orchestrator-enhancement)
└── quality-guardian/        # quality-guardian package
```


## ⚠️ For Contributors: Repository Protection

This repository distributes Claude Code skills via npm. **DO NOT** implement new skills in `.claude/skills/`. Use `pm-orchestrator/templates/.claude/skills/` instead.

**Test your changes:**
```bash
./scripts/test-external-install.sh
```

See the main README for details.
## License

MIT

## Author

Quality Guardian Team / chooser

## Version

Current: 2.1.0

### Changelog

- **2.1.0**: Evidence-Based Completion safeguards, Skills-First Architecture
- **2.0.0**: Complete architecture rewrite with parallel execution
- **1.0.0**: Initial release

## Git Operation Control (v2.3.0)

PM Orchestrator now includes **structural control** for git operations to prevent unintended commits, force pushes, and other dangerous git actions.

### Design Philosophy: Structure First, Rules Second

Instead of relying solely on written rules ("don't use git"), PM Orchestrator uses **structural permission control**:

```
Option A (Old): Rules only
  → "Don't execute git commands"
  → AI might ignore the rule

Option B (New): Structure + Rules
  → allow_git flag controls execution permission
  → git-operator skill is the only executor
  → Other skills have explicit prohibitions
```

### Architecture

```
                    ┌─────────────────────┐
                    │   PM Orchestrator   │
                    │  (TaskType → allow_git)│
                    └──────────┬──────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │Implementer│  │    QA     │  │git-operator│
        │allow_git:×│  │allow_git:×│  │allow_git:○│
        └───────────┘  └───────────┘  └───────────┘
```

### TaskType → allow_git Mapping

| TaskType | allow_git | git-operator | Reason |
|----------|-----------|--------------|--------|
| READ_INFO | false | Not launched | Read-only task |
| LIGHT_EDIT | false | Not launched | Minor edit (no commit) |
| REVIEW_RESPONSE | false | Not launched | Review response (separate commit) |
| IMPLEMENTATION | true | Launched | Commit after implementation |
| CONFIG_CI_CHANGE | true | Launched | Commit after config change |
| DANGEROUS_OP | false | Not launched | Dangerous (requires user confirmation) |

### git-operator Skill

The **git-operator** skill is the only skill allowed to execute git commands.

Features:
- **Permission check**: Blocks all git operations if `allow_git: false`
- **Safety checks**: Validates commit size, Claude signatures, sensitive files
- **Dangerous operation blocking**: Blocks force push, reset --hard, etc.
- **Structured logging**: Records all git operations

Example:
```yaml
allow_git: true
operation: "commit"
options:
  files: ["src/feature.ts"]
  message: "feat: add new feature"
```

### Safety Checks

Before executing git commit/push, git-operator runs these checks:

1. **Large commit check**: Blocks if >100 files staged
2. **Claude artifacts check**: Warns if Claude signatures detected
3. **Sensitive files check**: Blocks if .env, credentials.json, etc. detected
4. **Dangerous pattern check**: Blocks force push, reset --hard, etc.

### Integration with validate-commit.sh

PM Orchestrator's git control works alongside the existing `validate-commit.sh`:

- **validate-commit.sh**: Physical blocking via pre-commit hook
- **git-operator**: Structural blocking during AI execution

Both provide redundant safety layers.

### Skill Prohibitions

All skills except git-operator are prohibited from executing git:

- **Implementer**: File editing only
- **QA**: Quality verification only
- **Code Reviewer**: Review only
- **Reporter**: Reporting only

Each skill explicitly states: "⛔ This skill must not execute git commands"

### Configuration

Enable git control in your project:

```json
{
  "skills": {
    "directory": ".claude/skills",
    "enableGitControl": true
  }
}
```

### For More Details

See:
- `.claude/skills/git-operator.md` - Git operator skill definition
- `.claude/skills/pm-orchestrator.md` - Git control section
- `pm-orchestrator/scripts/validate-commit.sh` - Pre-commit validation

