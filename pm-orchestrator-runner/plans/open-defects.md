# Open Defects

## Tier-0 Violations (Phase 0 Scope)

### DEF-001: No Keyboard-Selectable Picker (Rules E, F)
- **Severity**: BLOCKER
- **Status**: FIXED (Phase 0-B)
- **Description**: GenericPicker (`src/diagnostics/picker.ts`) only accepts numbered text input. No arrow key / j/k navigation, no Enter to select, no Esc to cancel via keypress.
- **Fix**: Phase 0-B - Implement InteractivePicker with raw stdin keypress handling.
- **Affected Rules**: E, F, J

### DEF-002: No Typed Clarification System (Rule F, Clarification Design)
- **Severity**: BLOCKER
- **Status**: FIXED (Phase 0-C)
- **Description**: ClarificationReason is reason-based, not type-based. No ClarificationType enum (TARGET_FILE, SELECT_ONE, CONFIRM, FREE_TEXT). No mapping from reason to UI component.
- **Fix**: Phase 0-C - Add ClarificationType, map reasons to types, route to appropriate UI.
- **Affected Rules**: F, I

### DEF-003: No Repeat-Clarification Guard (Rule I)
- **Severity**: BLOCKER
- **Status**: FIXED (Phase 0-C)
- **Description**: No history tracking of answered clarifications. Same question can be asked repeatedly. No auto-apply of previous answers.
- **Fix**: Phase 0-C - Implement ClarificationHistory with question hashing and auto-resolve.
- **Affected Rules**: I, J

### DEF-004: No Semantic Resolver (Clarification Design)
- **Severity**: MAJOR
- **Status**: FIXED (Phase 0-C)
- **Description**: No semantic interpretation of user input before presenting clarification. Patterns like "root直下", ".", "ここ" are not recognised as project root.
- **Fix**: Phase 0-C - Implement semantic resolver with built-in patterns.
- **Affected Rules**: I (reduces unnecessary clarifications)

### DEF-005: Governance Artifacts Missing
- **Severity**: BLOCKER
- **Status**: FIXED (Phase 0-A)
- **Description**: specs/, plans/, diagnostics/ directories and their 7 required files did not exist.
- **Fix**: Phase 0-A - Create directories and files.
- **Affected Rules**: J (self-development gate)

---

## Resolved Defects

All 5 defects resolved in Phase 0 (2026-01-28).
