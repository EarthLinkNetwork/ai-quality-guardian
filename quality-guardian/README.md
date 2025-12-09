# Quality Guardian 🛡️

AI Quality Management System - Integrated quality management tool for Claude Code projects

[日本語版 README](./README.ja.md)

## Overview

Quality Guardian is a system that verifies AI code changes from multiple angles, detects "AI shortcuts", and prevents quality degradation.

### Main Features

- 🔍 **Before/After Baseline Comparison**
- 🧠 **Context-Aware PR Analysis**
- 🔐 **Invariant Checks** (Detection of migration deletion, etc.)
- 🔬 **Deep Quality Analysis** (Mutation testing, etc.)
- 🤖 **Auto-Fix Functionality**
- 🎯 **PM Orchestrator System** - Automatic quality management via AI Control System

## PM Orchestrator Architecture

Quality Guardian v1.3.63+ adopts the **Hub-and-Spoke Architecture** AI Control System. This evolution moves from "I'll be careful" to "system enforcement".

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    UserPromptSubmit Hook                     │
│         (Pattern Detection & Automatic PM Launch)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │                │
              │  PM Orchestr   │ ◄──── Hub (Central)
              │     ator       │
              │                │
              └────────┬───────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Rule    │   │ Design  │   │ QA      │
   │ Checker │   │ er      │   │         │
   └─────────┘   └─────────┘   └─────────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              ┌────────────────┐
              │                │
              │  Implementer   │ ◄──── Implementation
              │                │
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────┐
              │                │
              │    Reporter    │ ◄──── Result Reporting
              │                │
              └────────────────┘
```

### 6 Specialized Sub-agents

1. **PM Orchestrator** (250 lines)
   - Task analysis (type, complexity, impact scope)
   - Selection of appropriate sub-agents and determination of launch order
   - Checkpoint management (does not proceed until all checks pass)
   - Error handling (auto-fix, retry, rollback)
   - Final report coordination

2. **Rule Checker** (200 lines)
   - Validation of MUST Rules (Rules 1, 4, 7, 14, 16, 17)
   - Branch confirmation before git operations
   - Complete verification of "same" instructions
   - Complete verification of PR review comments
   - Detection of Claude Code traces

3. **Designer** (200 lines)
   - Task type analysis (new feature, bug fix, refactoring)
   - Complexity evaluation (simple, medium, complex)
   - Implementation plan creation (files to create, files to change, steps)
   - Risk analysis (compatibility, security, performance)

4. **Implementer** (400 lines)
   - Strict implementation following PM instructions
   - Auto-fix functionality (lint errors, formatting, unused variables)
   - Retry functionality (network errors, file locks)
   - Rollback functionality (automatic recovery on implementation failure)
   - Supports 4 implementation patterns

5. **QA** (250 lines)
   - File existence verification
   - Test execution and result verification
   - Code quality checks (lint, typecheck, build)
   - Functional verification via Playwright
   - Quality score calculation

6. **Reporter** (150 lines)
   - Integration of sub-agent results
   - User-friendly report creation
   - Problem prioritization
   - Next action suggestions

### Execution Flow

#### Pattern 1: CodeRabbit Resolve (PR Review Response)

```
User Input: "Please resolve CodeRabbit comments"
    │
    ▼
PM Orchestrator: Task analysis
    │
    ├─► Rule Checker: Verify MUST Rule 14 (complete response to PR comments)
    │       └─► Retrieve all comments, create TodoWrite
    │
    ├─► Implementer: Fix each comment in order
    │       ├─► Auto-fix: Lint errors → Auto-fix
    │       ├─► Retry: Network errors → Retry
    │       └─► Rollback: Test failure → Report to user
    │
    ├─► QA: Verify fix results
    │       ├─► Execute lint, test, typecheck, build
    │       └─► Verify all pass
    │
    └─► Reporter: Report results
            └─► Fix content, test results, resolve execution results
```

#### Pattern 2: List Modification (Version Update, etc.)

```
User Input: "Update version from 1.3.63 to 1.3.64"
    │
    ▼
PM Orchestrator: Task analysis
    │
    ├─► Rule Checker: Execute MUST Rule 7 (complete verification)
    │       ├─► Search all locations with grep -r "1.3.63"
    │       └─► Detect 5 locations (VERSION, install.sh×2, js, json)
    │
    ├─► Designer: Create change plan
    │       └─► 5 file changes, risk assessment (low)
    │
    ├─► Implementer: Update 5 locations in order
    │       ├─► Change each file
    │       ├─► Verify no old version remains with grep
    │       └─► Add change history to README.md
    │
    ├─► QA: Verify change results
    │       └─► Verify all 5 locations updated
    │
    └─► Reporter: Report results
            └─► Changed file list, verification results
```

#### Pattern 3: Complex Task (New Feature Addition, etc.)

```
User Input: "Add user authentication feature"
    │
    ▼
PM Orchestrator: Task analysis (complex task)
    │
    ├─► Designer: Detailed design
    │       ├─► Required files: auth.ts, login.tsx, AuthContext.tsx
    │       ├─► Tests: auth.test.ts, login.test.tsx
    │       └─► Risks: Security (high), Compatibility (medium)
    │
    ├─► Rule Checker: Verify related rules
    │       └─► Verify MUST Rule 2 (Test First)
    │
    ├─► Implementer: Implement with Test First
    │       ├─► Step 1: Create tests (verify failure)
    │       ├─► Step 2: Implementation
    │       ├─► Step 3: Verify test pass
    │       └─► On error: Auto-fix → Retry → Rollback
    │
    ├─► QA: Comprehensive verification
    │       ├─► Unit tests: Pass
    │       ├─► Playwright: Verify login operation
    │       ├─► Security: Verify password hashing
    │       └─► Quality score: 85/100
    │
    └─► Reporter: Detailed report
            ├─► Implementation file list
            ├─► Test results
            ├─► Security check results
            └─► Next action suggestions
```

### Error Handling (Phase 3)

PM Orchestrator responds in the following 3 stages when errors occur:

1. **Auto-fix (Automatic Correction)**
   - Lint errors → `npm run lint -- --fix`
   - Format errors → Prettier auto-fix
   - Unused variables → Automatic deletion
   - Import order → Auto-sort

2. **Retry (Retry with Exponential Backoff)**
   - Network errors → Retry with backoff (max 3 times)
   - File lock → Wait and retry
   - Temporary failures → Automatic retry

3. **Rollback (Automatic Recovery)**
   - If retry fails 3 times → Rollback
   - Report error details to user
   - Suggest recovery method

## Installation

```bash
npm install -g quality-guardian
```

Or execute without installation:

```bash
npx quality-guardian install
```

## Usage

### 1. Run Quality Check

```bash
quality-guardian check
```

### 2. Run Specific Check

```bash
# Baseline comparison
quality-guardian baseline

# PR Analysis
quality-guardian pr-check

# Invariant verification
quality-guardian invariants

# Deep analysis
quality-guardian deep-analysis
```

### 3. Enable Auto-Fix

```bash
quality-guardian check --auto-fix
```

## Configuration

Create `.quality-guardian.json` in project root:

```json
{
  "baseline": {
    "enabled": true,
    "path": ".quality-baseline"
  },
  "prAnalysis": {
    "enabled": true,
    "contextDepth": 3
  },
  "invariants": {
    "enabled": true,
    "rules": [
      "no-migration-deletion",
      "no-test-skip",
      "no-security-bypass"
    ]
  },
  "deepAnalysis": {
    "enabled": true,
    "mutationTest": true,
    "complexityCheck": true
  }
}
```

## Key Features in Detail

### 1. Before/After Baseline Comparison

Records code quality metrics before implementation and detects degradation after implementation.

**Metrics:**
- Test coverage
- Code complexity
- Number of lint warnings
- Build time
- Bundle size

**Detection Example:**
```
⚠️ Quality Degradation Detected:
  - Test coverage: 85% → 78% (-7%)
  - Code complexity: 12 → 18 (+50%)
  - Lint warnings: 3 → 7 (+4)
```

### 2. Context-Aware PR Analysis

Analyzes PR changes understanding context rather than per-line differences.

**Analysis Items:**
- Consistency of change intent
- Impact scope
- Missing tests
- Documentation updates
- Breaking changes

**Analysis Example:**
```
📊 PR Analysis Results:
  ✅ Change intent: Consistent
  ⚠️ Impact scope: Moderate (5 files affected)
  ❌ Missing tests: UserService.ts tests not added
  ⚠️ Documentation: Update needed in README.md
  ✅ Breaking changes: None
```

### 3. Invariant Checks

Detects code changes that violate project invariants.

**Check Items:**
- Migration file deletion
- Test skip addition
- Security check bypass
- Critical dependency deletion
- Environment variable deletion

**Detection Example:**
```
🚨 Invariant Violation Detected:
  ❌ Migration deletion: 20231201_add_user_table.sql deleted
  ❌ Test skip: UserService.test.ts includes .skip()
  ⚠️ Security bypass: Authentication check commented out
```

### 4. Deep Quality Analysis

Performs advanced code quality analysis.

**Analysis Items:**
- Mutation testing
- Complexity analysis
- Dead code detection
- Dependency analysis
- Performance regression

**Analysis Example:**
```
🔬 Deep Analysis Results:
  Mutation test score: 85%
  Code complexity: 12 (OK)
  Dead code: 3 functions detected
  Dependency: 2 unused packages
  Performance: No regression
```

## Auto-Fix

Automatically fixes detectable issues.

**Fixable Items:**
- Lint errors
- Format errors
- Unused imports
- Missing documentation
- Simple complexity issues

**Execution Example:**
```bash
$ quality-guardian check --auto-fix

🤖 Auto-Fix Results:
  ✅ Fixed 12 lint errors
  ✅ Formatted 8 files
  ✅ Removed 5 unused imports
  ✅ Added 3 missing documentation comments
  ⚠️ Manual fix required for 2 complexity issues
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Quality Guardian

on: [pull_request]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Quality Guardian
        run: |
          npx quality-guardian check
          npx quality-guardian pr-check
```

### GitLab CI

```yaml
quality-check:
  script:
    - npx quality-guardian check
    - npx quality-guardian pr-check
  only:
    - merge_requests
```

## Related Packages

- **[pm-orchestrator-enhancement](https://www.npmjs.com/package/pm-orchestrator-enhancement)**: Multi-agent parallel execution system (complementary tool in same repository)

## Repository Structure

This package is part of the [ai-quality-guardian](https://github.com/EarthLinkNetwork/ai-quality-guardian) monorepo:

```
ai-quality-guardian/
├── .claude/                  # Shared configuration
│   ├── skills/              # Skill definitions
│   ├── agents/              # Agent definitions
│   └── hooks/               # Git/Claude hooks
├── pm-orchestrator/         # pm-orchestrator-enhancement package
└── quality-guardian/        # This package (quality-guardian)
```

## License

MIT

## Contributors

Quality Guardian Team / chooser

## Version History

- 1.3.92: Current version - Evidence-Based Completion integration
- 1.3.91: Latest PM Orchestrator integration
- 1.3.63: PM Orchestrator Architecture adoption
- 1.0.0: Initial release

## Git Operation Control (v2.3.0)

Quality Guardian now includes **structural control** for git operations to prevent unintended commits and dangerous git actions.

### Key Points

1. **git-operator skill**: Only skill allowed to execute git commands
2. **allow_git flag**: PM Orchestrator controls git execution permission per TaskType
3. **Safety checks**: validate-commit.sh logic integrated into AI workflow
4. **Skill prohibitions**: All other skills explicitly prohibited from git execution

### Benefits

- **Prevents git暴走**: AI cannot arbitrarily execute git commands
- **Structured permission**: allow_git flag enforces execution control
- **Redundant safety**: validate-commit.sh + git-operator provide dual protection
- **Clear workflow**: Implementer edits files → git-operator commits

### For More Details

See `pm-orchestrator/README.md` for full documentation on git operation control.

