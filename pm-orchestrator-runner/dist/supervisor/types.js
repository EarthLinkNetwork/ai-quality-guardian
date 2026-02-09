"use strict";
/**
 * Supervisor System Types
 *
 * Per docs/spec/SUPERVISOR_SYSTEM.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMEOUT_PROFILES = exports.DEFAULT_PROJECT_CONFIG = exports.DEFAULT_GLOBAL_CONFIG = void 0;
// =============================================================================
// Default Values
// =============================================================================
exports.DEFAULT_GLOBAL_CONFIG = {
    global_input_template: '',
    global_output_template: '',
    supervisor_rules: {
        enabled: true,
        timeout_default_ms: 60000,
        max_retries: 2,
        fail_on_violation: true,
    },
};
exports.DEFAULT_PROJECT_CONFIG = {
    projectId: 'default',
    input_template: '',
    output_template: '',
    supervisor_rules: {
        timeout_profile: 'standard',
        allow_raw_output: false,
        require_format_validation: true,
    },
};
exports.TIMEOUT_PROFILES = {
    standard: 60000, // 60s
    long: 120000, // 2min
    extended: 300000, // 5min
};
//# sourceMappingURL=types.js.map