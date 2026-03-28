/**
 * DAL Factory - Centralized DAL initialization and access
 *
 * Replaces direct usage of initNoDynamo()/getNoDynamo() with a unified
 * factory that selects the appropriate DAL implementation based on config.
 *
 * Usage:
 *   initDAL({ useDynamoDB: false, stateDir: '/path/to/state' });
 *   const dal = getDAL();
 *   const projects = await dal.listProjectIndexes();
 */

import type { IDataAccessLayer } from "./dal-interface";
import { NoDynamoDALWithConversations } from "./no-dynamo";
import { DynamoDAL } from "./dynamo-dal";
import { initDocClient, resetDocClient } from "./client";

export interface DALConfig {
  /** Whether to use DynamoDB for supported operations */
  useDynamoDB: boolean;
  /** State directory for file-based storage */
  stateDir: string;
  /** Organization ID */
  orgId?: string;
  /** Use DynamoDB Local (localhost:8000) instead of AWS */
  localDynamodb?: boolean;
}

let globalDAL: IDataAccessLayer | null = null;

/**
 * Initialize the global DAL instance
 *
 * @param config - DAL configuration
 * @returns The initialized DAL instance
 */
export function initDAL(config: DALConfig): IDataAccessLayer {
  if (globalDAL) {
    return globalDAL;
  }

  if (config.useDynamoDB) {
    // Initialize the DynamoDB client first
    initDocClient({ localDynamodb: config.localDynamodb });

    // DynamoDB DAL: uses DynamoDB for ProjectIndex, NoDynamo fallback for rest
    globalDAL = new DynamoDAL({
      stateDir: config.stateDir,
      orgId: config.orgId,
    });
  } else {
    // File-only DAL: all operations use local JSON files
    globalDAL = new NoDynamoDALWithConversations({
      stateDir: config.stateDir,
      orgId: config.orgId,
    });
  }

  return globalDAL;
}

/**
 * Get the global DAL instance
 *
 * @throws Error if DAL is not initialized
 */
export function getDAL(): IDataAccessLayer {
  if (!globalDAL) {
    throw new Error("DAL not initialized. Call initDAL() first.");
  }
  return globalDAL;
}

/**
 * Check if DAL is initialized
 */
export function isDALInitialized(): boolean {
  return globalDAL !== null;
}

/**
 * Reset the global DAL (for testing)
 */
export function resetDAL(): void {
  globalDAL = null;
  resetDocClient();
}
