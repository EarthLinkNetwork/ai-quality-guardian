# Seven-Phase Lifecycle

## Phase 1 Requirement Analysis

Input is the task description provided to the Runner.

Runner invokes L1 Subagents to analyze the requirements.
L1 Subagents perform read-only analysis and do not modify any files or system state.

Output is a validated requirements document.
This document represents the complete and explicit set of requirements derived from the input.

Validation is performed by the Runner.
Validation consists of a requirements completeness check.
If requirements are incomplete, ambiguous, or unverifiable, execution halts immediately.

## Phase 2 Task Decomposition

Input is the validated requirements document produced in Phase 1.

Runner invokes L1 Subagents to propose a task breakdown.
L1 Subagents may suggest subtasks but have no authority to define final task boundaries.

Output is an approved subtask list.
Subtasks exist only after explicit approval by the Runner.

Validation is performed by the Runner.
Validation consists of confirming that all task boundaries are explicitly approved by the Runner.
Any autonomous task creation or modification causes immediate execution halt.

## Phase 3 Planning

Input is the approved subtask list.

Runner invokes L1 Subagents to create an execution plan.
L1 Subagents produce a detailed plan describing implementation order, dependencies, and constraints.

Output is a detailed implementation plan.

Validation is performed by the Runner.
Validation consists of plan feasibility and resource allocation checks.
If the plan exceeds defined limits or contains ambiguous execution steps, execution halts.

## Phase 4 Execution

Input is the validated implementation plan including Test-Driven Development requirements.

Runner invokes L2 Executors.
Parallel execution is permitted but the number of concurrently active L2 Executors must not exceed four.

L2 Executors perform implementation tasks only.
L2 Executors may modify files only after required tests are confirmed to exist.

Test-Driven Development enforcement is mandatory.
Tests must exist before any implementation begins.
If tests are missing, execution halts immediately.

Output consists of implementation artifacts, execution evidence, and test results.

Validation is performed by the Runner.
Validation includes evidence collection verification, file lock management verification, and test passage verification.
Failure in any validation step causes immediate execution halt.

## Phase 5 QA

Input is the implementation artifacts produced in Phase 4.

Runner invokes L1 Subagents to validate the implementation.
L1 Subagents perform read-only verification and quality assessment.

Output is quality assessment results.

Validation is performed by the Runner.
Validation consists of test execution verification and coverage verification.
If quality criteria are not met, execution halts.

## Phase 6 Completion Validation

Input is the complete set of artifacts produced by all previous phases.

Runner validates completion criteria.
Completion criteria include task completion status, test success, evidence existence, and requirement satisfaction.

Output is a completion status determination.

Validation is performed exclusively by the Runner.
Validation includes evidence integrity verification and requirement satisfaction verification.

As the final step of this phase, the Runner generates evidence_index.sha256.
Once generated, evidence_index.sha256 is immutable.
Any failure during completion validation causes immediate execution halt.

## Phase 7 Report

Input is the complete output of all previous phases.

Runner generates the final report.
The report summarizes executed tasks, completion status, evidence inventory, and continuation eligibility.

Output is the final status report.

Validation is performed by the Runner.
Validation consists of report completeness verification and next action determination.
Only the Runner determines whether continuation is permitted.

At no point may L1 Subagents or L2 Executors determine phase transitions, completion status, or execution continuation.
