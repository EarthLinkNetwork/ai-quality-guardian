/**
 * API Key Authentication Middleware
 *
 * Validates API keys from x-api-key header or apiKey query parameter.
 * When --api-key is not set (local dev mode), authentication is skipped
 * and userId defaults to 'local'.
 */

import type { Request, Response, NextFunction } from 'express';
import { ApiKeyManager } from '../../auth/api-key-manager';
import { log } from '../../logging/app-logger';

/**
 * User roles for access control
 */
export type UserRole = 'admin' | 'viewer' | 'guest';

/**
 * Extended Request with userId, deviceName, and role
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  deviceName?: string;
  role?: UserRole;
  /** Organization ID for tenant isolation (derived from userId) */
  orgId?: string;
}

/**
 * Auth mode configuration
 */
export interface AuthConfig {
  /** Whether authentication is enabled */
  enabled: boolean;
  /** API key manager instance (required when enabled) */
  apiKeyManager?: ApiKeyManager;
}

/**
 * Create API key authentication middleware
 *
 * When auth is disabled (local dev mode), all requests pass with userId='local'.
 * When auth is enabled, validates x-api-key header or apiKey query parameter.
 */
export function createApiKeyAuth(config: AuthConfig) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!config.enabled) {
      // Local dev mode: skip authentication
      req.userId = 'local';
      req.deviceName = 'local';
      req.orgId = process.env.ORG_ID || 'local';
      return next();
    }

    if (!config.apiKeyManager) {
      return res.status(500).json({ error: 'Auth misconfigured: no API key manager' });
    }

    const key = (req.headers['x-api-key'] as string) || (req.query.apiKey as string);

    if (!key) {
      return res.status(401).json({ error: 'API key required. Set x-api-key header or apiKey query parameter.' });
    }

    try {
      const apiKeyData = await config.apiKeyManager.validateApiKey(key);

      if (!apiKeyData) {
        return res.status(403).json({ error: 'Invalid or revoked API key.' });
      }

      req.userId = apiKeyData.userId;
      req.deviceName = apiKeyData.deviceName;
      req.orgId = apiKeyData.userId + ':' + apiKeyData.deviceName; // orgId = userId:device for machine-level isolation
      next();
    } catch (error) {
      log.sys.error('API key validation error', { error: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ error: 'Authentication service error' });
    }
  };
}

/**
 * List of paths that bypass authentication
 */
const PUBLIC_PATHS = [
  '/api/health',
];

/**
 * Create middleware that skips auth for public paths
 */
export function createPublicPathBypass(authMiddleware: ReturnType<typeof createApiKeyAuth>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (PUBLIC_PATHS.includes(req.path)) {
      req.userId = 'anonymous';
      return next();
    }
    return authMiddleware(req, res, next);
  };
}

/**
 * Executor log directory path constant
 */
export const EXECUTOR_LOGS_DIR = 'logs/executor/';

/**
 * Role-based access control middleware
 *
 * Returns 403 if the user's role is not in the allowed list.
 * In local dev mode (role undefined), defaults to 'admin'.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.role ?? (req.userId === 'local' ? 'admin' : 'guest');

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${role}' does not have access to executor logs. Required: ${allowedRoles.join(', ')}`,
        requiredRoles: allowedRoles,
        currentRole: role,
      });
    }

    next();
  };
}
