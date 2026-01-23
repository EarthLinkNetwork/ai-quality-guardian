/**
 * Model Policy Module
 *
 * Per spec 31_PROVIDER_MODEL_POLICY.md
 *
 * Exports:
 * - ModelPolicyManager class
 * - Phase-based model selection functions
 * - Model profiles and configurations
 * - Usage tracking and cost calculation
 */

export {
  // Types - Provider and Category
  type Provider,
  type ModelCategory,
  type TaskPhase,
  type SelectionReason,

  // Types - Model Reference and Selection
  type ModelReference,
  type ModelSelection,
  type ModelCapabilities,

  // Types - Configuration
  type ModelConfig,
  type EscalationConfig,
  type ModelProfile,

  // Types - Usage Tracking
  type ModelUsage,
  type UsageSummary,
  type CostLimitCheck,

  // Types - Context and Events
  type SelectionContext,
  type ModelPolicyEvent,
  type ModelPolicyEventCallback,

  // Types - Manager Config
  type ModelPolicyManagerConfig,

  // Constants - Model Configurations
  MODEL_CONFIGS,

  // Constants - Preset Profiles
  STABLE_PROFILE,
  CHEAP_PROFILE,
  FAST_PROFILE,
  PRESET_PROFILES,

  // Constants - Default Config
  DEFAULT_MODEL_POLICY_CONFIG,

  // Functions - Category and Model Lookup
  getDefaultCategory,
  getModelConfig,
  getModelByCategory,
  getProviderForModel,

  // Functions - Escalation and Selection
  escalateModel,
  findLargerContextModel,
  selectModel,

  // Functions - Cost Calculation
  calculateCost,

  // Class
  ModelPolicyManager,
} from './model-policy-manager';
