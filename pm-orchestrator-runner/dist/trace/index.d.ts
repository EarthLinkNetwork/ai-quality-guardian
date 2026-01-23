/**
 * Trace Module
 *
 * Exports:
 * - TracePack: Session/task state transition logging (per spec/10_TRACE_PACK.md)
 * - ConversationTracer: LLM round-trip logging (per spec/28_CONVERSATION_TRACE.md)
 */
export { TracePack, TracePackConfig, TraceEntry, TraceEventType, VerifyResult, verifyTraceFile, readTraceFile, } from './trace-pack';
export { ConversationTracer, ConversationTracerConfig, ConversationTraceEntry, ConversationTraceEventType, CriteriaResult, SubtaskPlan, ConversationTraceVerifyResult, verifyConversationTrace, } from './conversation-tracer';
//# sourceMappingURL=index.d.ts.map