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

```bash
npm install -g pm-orchestrator-enhancement
```

Or use without installation:

```bash
npx pm-orchestrator-enhancement install
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

## Related Packages

- **[quality-guardian](https://www.npmjs.com/package/quality-guardian)**: AI Quality Management System (complementary tool in same repository)

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
