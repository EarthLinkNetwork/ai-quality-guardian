# Overview

PM Orchestrator Runner is a CLI tool that enforces controlled execution of Claude Code through mandatory orchestration, parallel execution management, and comprehensive evidence tracking.

The Runner operates as a compulsory control layer that all Claude Code executions must pass through. Any execution not mediated by the Runner is considered unauthorized and invalid.

The system implements a fail-closed security model. In this model, unauthorized or uncertain execution is not partially allowed, degraded, or conditionally accepted. Instead, such execution is detected, marked as invalid, and terminated. Only executions that fully satisfy Runner control, validation, and evidence requirements are considered valid.

All valid execution flows must originate from and be governed by the Runner. Claude Code is never permitted to operate independently, autonomously determine execution flow, or bypass orchestration mechanisms.

The architecture follows a hierarchical execution model consisting of L1 Subagents and L2 Executors.

L1 Subagents are restricted to read-only analysis and planning activities. They are explicitly prohibited from performing any file modification, execution, or completion determination.

L2 Executors are restricted to write-enabled implementation activities. They may perform file modifications and test execution only under Runner authorization, lock control, and evidence recording.

This hierarchical model is enforced through a mandatory seven-phase lifecycle. Each phase has explicitly defined inputs, outputs, validation requirements, and stopping conditions. Evidence collection and validation are mandatory at every phase boundary.

No phase may be skipped, reordered, merged, or implicitly completed.

# Design Rationale

PM Orchestrator Runner is not designed to improve convenience, speed, or autonomy of Claude Code. Its sole purpose is to prevent incorrect, speculative, uncontrolled, or unverifiable execution.

The Runner acts as the single execution authority within the system. Claude Code is never allowed to decide task boundaries, execution order, execution completion, continuation eligibility, or success status.

All such decisions are owned exclusively by the Runner and must be backed by explicit validation and recorded evidence.

The fail-closed approach is a foundational design principle. Whenever the system encounters uncertainty, missing information, incomplete evidence, ambiguous state, or validation failure, execution must halt immediately.

In no situation may the system proceed based on assumption, probability, heuristic judgment, or best-effort continuation.

Execution that halts due to uncertainty is considered correct behavior. Execution that proceeds under uncertainty is considered a specification violation.

This design ensures that every completed execution is fully controlled, fully validated, fully traceable, and unambiguously correct according to the specification.
