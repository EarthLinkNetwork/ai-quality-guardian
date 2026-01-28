# System UI Specification

## Tier-0 Rules: A-F

### Rule A: Input Fixed at Bottom
The user input line MUST always remain at the bottom row of the terminal.
No log output, task status, or error message may push the input line upward.

**Testable**: After 1000 rapid log lines, cursor row for input === terminal rows - 1.

### Rule B: Scrollable Upper Area
All log output, task status, and diagnostics render in the upper pane.
The upper pane scrolls independently; the input line does not scroll.

**Testable**: Upper pane content length > terminal rows does not affect input line position.

### Rule C: No Output Corruption on Concurrent Writes
Concurrent log writes from multiple agents MUST NOT produce garbled output.
The two-pane renderer batches writes (16ms debounce) and serialises ANSI sequences.

**Testable**: 50 parallel log writes produce 50 distinct, non-interleaved lines.

### Rule D: Separator Integrity
A visual separator line divides the upper pane from the input area.
The separator MUST remain visible at all times.

**Testable**: After any render cycle, separator line exists at (terminal rows - 2).

### Rule E: Keyboard-Selectable Picker (Selection Lists)
When the system presents a list of options (e.g. /tasks, /logs, /inspect),
the user MUST be able to navigate with arrow keys (Up/Down) or j/k,
select with Enter, and cancel with Esc or q.

Numbered input MAY also be accepted as a fallback.

**Testable**: Simulated keypress sequences (down, down, enter) select item index 2.

### Rule F: Keyboard-Selectable Clarification Picker
When a task requires user clarification with discrete choices,
the picker MUST use the same keyboard-selectable UI as Rule E.

FREE_TEXT clarifications use the standard readline input instead.

**Testable**: A clarification with 3 options renders InteractivePicker; arrow+enter selects.

---

## Implementation References
- Two-pane renderer: `src/repl/two-pane-renderer.ts`
- Interactive picker: `src/repl/interactive-picker.ts` (Phase 0-B deliverable)
- Keypress handling: `src/repl/repl-interface.ts` (keypress listener)
