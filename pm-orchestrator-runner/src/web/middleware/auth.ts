/**
 * API Key Authentication Middleware
 *
 * Validates API keys from x-api-key header or apiKey query parameter.
 * When --api-key is not set (local dev mode), authentication is skipped
 * and userId defaults to 'local'.
 */

import type { Request, Response, NextFunction } from 'express';
import { ApiKeyManager } from '../../auth/api-key-manager';

/**
 * Extended Request with userId and deviceName
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  deviceName?: string;
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
      next();
    } catch (error) {
      console.error('[Auth] API key validation error:', error);
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
