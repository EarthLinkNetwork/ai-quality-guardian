"use strict";
/**
 * Trace Module
 *
 * Exports:
 * - TracePack: Session/task state transition logging (per spec/10_TRACE_PACK.md)
 * - ConversationTracer: LLM round-trip logging (per spec/28_CONVERSATION_TRACE.md)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyConversationTrace = exports.ConversationTracer = exports.readTraceFile = exports.verifyTraceFile = exports.TracePack = void 0;
var trace_pack_1 = require("./trace-pack");
Object.defineProperty(exports, "TracePack", { enumerable: true, get: function () { return trace_pack_1.TracePack; } });
Object.defineProperty(exports, "verifyTraceFile", { enumerable: true, get: function () { return trace_pack_1.verifyTraceFile; } });
Object.defineProperty(exports, "readTraceFile", { enumerable: true, get: function () { return trace_pack_1.readTraceFile; } });
var conversation_tracer_1 = require("./conversation-tracer");
Object.defineProperty(exports, "ConversationTracer", { enumerable: true, get: function () { return conversation_tracer_1.ConversationTracer; } });
Object.defineProperty(exports, "verifyConversationTrace", { enumerable: true, get: function () { return conversation_tracer_1.verifyConversationTrace; } });
//# sourceMappingURL=index.js.map