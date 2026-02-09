# Supervisor & Template System Specification

## Overview

This specification defines the Supervisor system that ensures all LLM interactions go through a controlled pipeline with input/output templates, preventing direct LLM execution and ensuring consistency.

---

## SUP-1: Supervisor Mandatory Intervention

**Definition:** All tasks MUST pass through the Supervisor. Direct LLM execution is prohibited.

**Requirements:**
1. Every task execution flows through Supervisor
2. Runner cannot call LLM directly
3. Supervisor validates input before LLM call
4. Supervisor validates output after LLM response

**Flow:**
```
Runner → Supervisor → LLM → Supervisor → Queue
```

**Verification:** E2E test confirms no direct LLM calls exist

---

## SUP-2: Input Template Composition

**Definition:** LLM prompts MUST be composed in strict order.

**Composition Order (immutable):**
```
[GLOBAL_INPUT_TEMPLATE]
[PROJECT_INPUT_TEMPLATE]
[USER_PROMPT]
```

**Requirements:**
1. Global template always prepended first
2. Project template prepended second
3. User prompt appended last
4. Empty templates are allowed but order preserved
5. No other ordering permitted

**Interface:**
```typescript
interface ComposedPrompt {
  globalTemplate: string;
  projectTemplate: string;
  userPrompt: string;
  composed: string;  // Final merged prompt
}
```

**Verification:** E2E test verifies template order in composed prompt

---

## SUP-3: Output Template Enforcement

**Definition:** LLM output MUST pass through output template formatter.

**Flow:**
```
[RAW_OUTPUT]
    ↓
[FORMATTER]
    ↓
[FINAL_OUTPUT]
```

**Requirements:**
1. Raw LLM output is captured
2. Output template applied (if defined)
3. Formatted output stored in queue
4. Original raw output preserved for debugging

**Interface:**
```typescript
interface FormattedOutput {
  raw: string;
  formatted: string;
  templateApplied: boolean;
}
```

**Verification:** E2E test confirms output formatting applied

---

## SUP-4: Project-Specific Templates

**Definition:** Each project maintains its own template configuration.

**Location:** `.claude/project-config.json`

**Schema:**
```typescript
interface ProjectConfig {
  projectId: string;
  input_template: string;
  output_template: string;
  supervisor_rules: {
    timeout_profile: 'standard' | 'long' | 'extended';
    allow_raw_output: boolean;
    require_format_validation: boolean;
  };
}
```

**Requirements:**
1. Project config loaded on task start
2. Missing config uses empty templates
3. Config changes take effect on next task
4. Config validation on load

**Verification:** E2E test with project-specific templates

---

## SUP-5: Global Templates

**Definition:** Global templates apply to ALL projects.

**Location:** `.claude/global-config.json`

**Schema:**
```typescript
interface GlobalConfig {
  global_input_template: string;
  global_output_template: string;
  supervisor_rules: {
    enabled: boolean;
    timeout_default_ms: number;
    max_retries: number;
    fail_on_violation: boolean;
  };
}
```

**Requirements:**
1. Global config loaded at startup
2. Global templates prepended to all projects
3. Global rules apply as baseline
4. Project rules can override (where allowed)

**Verification:** E2E test confirms global template in all outputs

---

## SUP-6: Restart Resilience

**Definition:** System handles Web UI restart gracefully.

**State Transitions:**
```
RUNNING + no_pid → stale → rollback → re-execute
RUNNING + resume_possible → resume (attempt + 1)
AWAITING_RESPONSE → continue (no change)
orphan_process → kill
```

**Requirements:**
1. Detect stale RUNNING tasks (no heartbeat > 30s)
2. Rollback uncommitted changes before replay
3. Resume only if artifacts complete
4. Kill orphan executor processes
5. AWAITING_RESPONSE preserved across restart

**Detection Logic:**
```typescript
function detectRestartState(task: Task): RestartAction {
  if (task.status === 'RUNNING') {
    if (!hasRecentProgress(task, 30000)) {
      return hasCompleteArtifacts(task) ? 'resume' : 'rollback_replay';
    }
  }
  if (task.status === 'AWAITING_RESPONSE') {
    return 'continue';
  }
  return 'none';
}
```

**Verification:** E2E test simulates restart and verifies behavior

---

## SUP-7: Violation Prevention (Forgetting Prevention)

**Definition:** LLM output violating spec triggers automatic correction or failure.

**Violation Types:**
1. Missing required sections
2. Incorrect format
3. Skipped validation
4. Direct execution attempt

**Response:**
```
if (isViolation(output)) {
  if (canAutoCorrect(violation)) {
    output = autoCorrect(output, violation);
    revalidate(output);
  } else {
    task.status = 'ERROR';
    task.error_message = `Supervisor violation: ${violation.type}`;
  }
}
```

**Requirements:**
1. All outputs checked against rules
2. Auto-correct for minor violations
3. FAIL for major violations
4. Violation logged for debugging

**Verification:** E2E test with intentional violations

---

## Implementation Components

### 1. Supervisor Core (`src/supervisor/supervisor.ts`)

**Responsibilities:**
- Prompt composition
- Output inspection
- Timeout management
- Resume decision
- Rollback control

**Interface:**
```typescript
interface Supervisor {
  compose(userPrompt: string, projectId: string): ComposedPrompt;
  execute(composed: ComposedPrompt): Promise<SupervisedResult>;
  validate(output: string): ValidationResult;
  format(output: string, projectId: string): FormattedOutput;
}
```

### 2. Template Engine (`src/supervisor/template-engine.ts`)

**Functions:**
```typescript
function mergePrompt(
  globalTemplate: string,
  projectTemplate: string,
  userPrompt: string
): string;

function applyOutputTemplate(
  rawOutput: string,
  outputTemplate: string
): FormattedOutput;
```

### 3. Config Loader (`src/supervisor/config-loader.ts`)

**Locations:**
- `.claude/global-config.json`
- `.claude/projects/{projectId}.json`

**Functions:**
```typescript
function loadGlobalConfig(): GlobalConfig;
function loadProjectConfig(projectId: string): ProjectConfig;
function mergeConfigs(global: GlobalConfig, project: ProjectConfig): MergedConfig;
```

### 4. Web UI Settings

**New Settings Panel:**
- Global Template Editor
- Project Template Editor
- Supervisor ON/OFF toggle
- Timeout profile selector
- Restart mode selector

---

## E2E Test Requirements

| Test File | Description | AC |
|-----------|-------------|-----|
| supervisor-template.e2e.test.ts | Template composition | SUP-2, SUP-3 |
| output-format.e2e.test.ts | Output formatting | SUP-3, SUP-7 |
| restart-resume.e2e.test.ts | Restart handling | SUP-6 |
| no-user-debug.e2e.test.ts | No manual intervention | SUP-1 |
| web-self-dev.e2e.test.ts | Web-only self-development | All |

---

## Completion Criteria

All must pass:
- [ ] Supervisor always intervenes (SUP-1)
- [ ] Templates auto-composed (SUP-2)
- [ ] Output always formatted (SUP-3)
- [ ] Project templates work (SUP-4)
- [ ] Global templates work (SUP-5)
- [ ] Restart resume/rollback works (SUP-6)
- [ ] Violations prevented (SUP-7)
- [ ] Web-only modification possible
- [ ] All E2E tests pass
- [ ] gate:all passes

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-07 | Initial specification |
