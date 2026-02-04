/**
 * Settings Routes
 *
 * Provides API endpoints for settings management including API keys
 * and project settings (LLM config, preferences, etc.)
 * Uses file-based persistence for API keys (STATE_DIR/api-keys.json).
 */
import { Router } from "express";
/**
 * Create settings routes
 */
export declare function createSettingsRoutes(stateDir: string): Router;
//# sourceMappingURL=settings.d.ts.map