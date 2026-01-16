# Requirements to Properties Traceability Matrix

## Property Consolidation Rationale

Multiple related requirements were consolidated into comprehensive properties to eliminate redundancy and ensure complete coverage.

## Property 1: Execution Authority Enforcement

Requirements 1.1: Runner SHALL reject any artifact lacking a Runner-generated session_id  
Requirements 1.2: Claude Code SHALL NOT determine completion or continuation  
Requirements 1.3: All user input SHALL pass through Runner before Claude Code access  
Requirements 1.4: Autonomous task progression SHALL be blocked  
Requirements 1.5: Non-orchestrated execution SHALL be marked INVALID

## Property 2: Project Resolution Validation

Requirements 2.1: --project flag SHALL override all inference  
Requirements 2.2: Without --project, cwd SHALL be used  
Requirements 2.3: Missing .claude/ SHALL result in ERROR  
Requirements 2.4: Parent traversal SHALL NOT occur  
Requirements 2.5: Inference outside Project_Directory SHALL be rejected  
Requirements 2.6: Errors SHALL clearly state missing paths

## Property 3: Configuration Strict Validation

Requirements 3.1: Required paths validation  
Requirements 3.2: Missing files SHALL fail immediately  
Requirements 3.3: No inference or defaults for malformed config  
Requirements 3.4: settings.json SHALL be schema-validated  
Requirements 3.5: Executable hooks SHALL be validated  
Requirements 22.1: Schema-enforced limits  
Requirements 22.2: Precise error messages  
Requirements 22.3: Defaults documented  
Requirements 22.4: Unknown fields warned  
Requirements 22.5: Corruption fails execution

## Property 4: Seven-Phase Lifecycle Enforcement

Requirements 4.1: All phases SHALL execute sequentially  
Requirements 4.2: No phase skipping allowed  
Requirements 4.3: Parallelism allowed ONLY in Execution phase  
Requirements 4.4: Failure SHALL halt progression  
Requirements 4.5: Success SHALL proceed to Report

## Property 5: Parallel Execution Limits

Requirements 5.1: Subagents max 9 parallel  
Requirements 5.2: Executors max 4 parallel  
Requirements 5.3: Subagents SHALL NOT write files  
Requirements 5.4: Executors SHALL be semaphore-controlled  
Requirements 5.5: Excess tasks SHALL be queued

## Property 6: File Lock Management

Requirements 6.1: File lock required before write  
Requirements 6.2: Lock failure SHALL wait or fail  
Requirements 6.3: Concurrent writes SHALL serialize  
Requirements 6.4: Locks SHALL release on exit  
Requirements 6.5: Unauthorized retries SHALL be blocked

## Property 7: Evidence Collection Completeness

Requirements 7.1: All tool usage SHALL be logged  
Requirements 7.2: Executor stdout/stderr SHALL be captured  
Requirements 7.3: File diffs SHALL be recorded  
Requirements 7.4: Test runs SHALL be logged  
Requirements 7.5: Missing evidence SHALL force NO_EVIDENCE

## Property 8: Completion Validation Authority

Requirements 8.1: All tasks complete  
Requirements 8.2: All tests pass  
Requirements 8.3: Evidence exists  
Requirements 8.4: No speculative language allowed  
Requirements 8.5: Clear failure reasons required

## Property 9: Fail-Safe Error Handling

Requirements 9.1: Unknown state SHALL halt  
Requirements 9.2: Missing info SHALL halt  
Requirements 9.3: Runner alone decides continuation  
Requirements 9.4: Errors SHALL be explicit  
Requirements 9.5: Uncertainty SHALL stop execution

## Property 10: Comprehensive Final Reporting

Requirements 10.1: Task list with status  
Requirements 10.2: Incomplete reasons  
Requirements 10.3: Evidence inventory  
Requirements 10.4: Explicit next_action YES/NO  
Requirements 10.5: No placeholders allowed

## Property 11: Test-Driven Development Enforcement

Requirements 11.1: Tests required before implementation  
Requirements 11.2: Missing tests SHALL block execution  
Requirements 11.3: Failing tests block completion  
Requirements 11.4: Property tests required where applicable  
Requirements 11.5: Passing tests required to proceed

## Property 12: Semaphore Resource Control

Requirements 12.1: Semaphore enforced on shared resources  
Requirements 12.2: Queue on limit  
Requirements 12.3: Release on failure  
Requirements 12.4: Deadlock timeout enforced  
Requirements 12.5: Retry only if explicitly idempotent

## Property 13: Task Decomposition Authority

Requirements 13.1: Runner defines tasks  
Requirements 13.2: Subagent proposals require approval  
Requirements 13.3: Autonomous task creation blocked  
Requirements 13.4: Changes logged as evidence  
Requirements 13.5: Ambiguity causes ERROR

## Property 14: Task Granularity Enforcement

Requirements 14.1: File test time limits enforced  
Requirements 14.2: Oversized tasks split or rejected  
Requirements 14.3: Unsafe splits rejected  
Requirements 14.4: No implicit continuation  
Requirements 14.5: Explicit INCOMPLETE required

## Property 15: Output Control and Validation

Requirements 15.1: All output intercepted  
Requirements 15.2: No evidence blocks output  
Requirements 15.3: Speculative language rejected  
Requirements 15.4: Multiple runs reconciled  
Requirements 15.5: Only Runner outputs user-facing text

## Property 16: Explicit Continuation Control

Requirements 16.1: Partial execution SHALL stop  
Requirements 16.2: Explicit approval required  
Requirements 16.3: Continue only if unfinished tasks exist  
Requirements 16.4: No-op continue rejected  
Requirements 16.5: Ambiguity halts execution

## Property 17: Numerical Limits Enforcement

Requirements 17.1: Defaults enforced bounded overrides only  
Requirements 17.2: Subagents 9 Executors 4 fixed  
Requirements 17.3: Token proxy limits enforced  
Requirements 17.4: Memory limit enforced  
Requirements 17.5: Violations block continuation

## Property 18: Atomic Evidence Recording

Requirements 18.1: One action per evidence entry  
Requirements 18.2: Concurrent actions logged separately  
Requirements 18.3: Aggregation forbidden  
Requirements 18.4: Independent validation required  
Requirements 18.5: Missing evidence fails task

## Property 19: Communication Mediation

Requirements 19.1: Direct Claude Code output blocked  
Requirements 19.2: User input validated first  
Requirements 19.3: Responses validated  
Requirements 19.4: Speculation rejected  
Requirements 19.5: Evidence failure invalidates session

## Property 20: Hard Limit Enforcement

Requirements 20.1: Time output tool count proxies used  
Requirements 20.2: Limit reached stops execution  
Requirements 20.3: Resume requires approval  
Requirements 20.4: Repeated overflow reduces chunk size  
Requirements 20.5: Unenforceable limits fail closed

## Property 21: Evidence Integrity Management

Requirements 21.1: Batch logs preserved raw  
Requirements 21.2: Derived evidence references raw  
Requirements 21.3: Hash validation first  
Requirements 21.4: Missing raw evidence fails task  
Requirements 21.5: Unknown format rejected

## Property 22: Test Coverage and Quality Assurance

Requirements 23.1: Coverage thresholds enforced  
Requirements 23.2: Concurrency property tests required  
Requirements 23.3: Evidence integrity tests required  
Requirements 23.4: Integration tests required  
Requirements 23.5: Failing tests block development
