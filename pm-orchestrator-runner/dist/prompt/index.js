"use strict";
/**
 * Prompt Module
 * Per spec/17_PROMPT_TEMPLATE.md
 *
 * Exports PromptAssembler for prompt template assembly
 * Includes Mandatory Rules Auto-Injection and Modification Prompt support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODIFICATION_TEMPLATE = exports.DEFAULT_MANDATORY_RULES = exports.PromptAssemblerError = exports.PromptAssembler = void 0;
var prompt_assembler_1 = require("./prompt-assembler");
Object.defineProperty(exports, "PromptAssembler", { enumerable: true, get: function () { return prompt_assembler_1.PromptAssembler; } });
Object.defineProperty(exports, "PromptAssemblerError", { enumerable: true, get: function () { return prompt_assembler_1.PromptAssemblerError; } });
Object.defineProperty(exports, "DEFAULT_MANDATORY_RULES", { enumerable: true, get: function () { return prompt_assembler_1.DEFAULT_MANDATORY_RULES; } });
Object.defineProperty(exports, "DEFAULT_MODIFICATION_TEMPLATE", { enumerable: true, get: function () { return prompt_assembler_1.DEFAULT_MODIFICATION_TEMPLATE; } });
//# sourceMappingURL=index.js.map