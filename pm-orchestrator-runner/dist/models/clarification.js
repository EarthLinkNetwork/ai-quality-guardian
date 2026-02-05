"use strict";
/**
 * Clarification Type System
 *
 * Typed clarifications for Tier-0 Rule F and I compliance.
 * Each clarification has a type that determines the UI component used.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClarificationType = void 0;
exports.reasonToType = reasonToType;
/**
 * ClarificationType - determines which UI to present.
 *
 * TARGET_FILE: File selection (InteractivePicker with file list)
 * SELECT_ONE:  Choose one option (InteractivePicker with options)
 * CONFIRM:     Yes/No confirmation (InteractivePicker with 2 options)
 * FREE_TEXT:   Open-ended input (readline)
 */
var ClarificationType;
(function (ClarificationType) {
    ClarificationType["TARGET_FILE"] = "TARGET_FILE";
    ClarificationType["SELECT_ONE"] = "SELECT_ONE";
    ClarificationType["CONFIRM"] = "CONFIRM";
    ClarificationType["FREE_TEXT"] = "FREE_TEXT";
})(ClarificationType || (exports.ClarificationType = ClarificationType = {}));
/**
 * Map from ClarificationReason to ClarificationType.
 *
 * ClarificationReason is the existing reason-based system.
 * ClarificationType is the new type-based system for UI routing.
 */
function reasonToType(reason) {
    switch (reason) {
        case 'target_file_exists':
            return ClarificationType.CONFIRM;
        case 'target_file_ambiguous':
            return ClarificationType.TARGET_FILE;
        case 'target_action_ambiguous':
            return ClarificationType.SELECT_ONE;
        case 'missing_required_info':
            return ClarificationType.FREE_TEXT;
        // auto-resolve-executor types
        case 'scope_unclear':
            return ClarificationType.SELECT_ONE;
        case 'action_ambiguous':
            return ClarificationType.SELECT_ONE;
        case 'missing_context':
            return ClarificationType.FREE_TEXT;
        default:
            return ClarificationType.FREE_TEXT;
    }
}
//# sourceMappingURL=clarification.js.map