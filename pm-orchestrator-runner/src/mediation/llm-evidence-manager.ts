/**
 * LLM Evidence Manager
 *
 * Tracks and verifies evidence of real LLM API calls.
 * This is the fail-closed mechanism that ensures:
 * 1. Every LLM call generates a proof file
 * 2. COMPLETE status can only be asserted with evidence
 * 3. Evidence files are tamper-resistant (hash verification)
 *
 * ARCHITECTURAL RULES:
 * - No evidence file = LLM call did not happen
 * - Evidence must exist BEFORE asserting COMPLETE
 * - Failed calls are also recorded (to prove attempt)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * LLM Evidence structure
 * Records proof of a real LLM API call
 */
export interface LLMEvidence {
  /** Unique identifier for this call */
  call_id: string;
  /** LLM provider (openai, anthropic) */
  provider: string;
  /** Model used */
  model: string;
  /** Hash of the request payload */
  request_hash: string;
  /** Hash of the response (null if failed) */
  response_hash: string | null;
  /** ISO timestamp of the call */
  timestamp: string;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Whether the call succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Evidence file with integrity hash
 */
interface EvidenceFile {
  evidence: LLMEvidence;
  integrity_hash: string;
}

/**
 * Evidence statistics
 */
export interface EvidenceStats {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
}

/**
 * LLM Evidence Manager
 *
 * Manages evidence files for LLM API calls.
 * Uses file-based storage for durability and auditability.
 */
export class LLMEvidenceManager {
  private readonly evidenceDir: string;
  private readonly evidenceMap: Map<string, LLMEvidence> = new Map();

  constructor(baseDir: string) {
    this.evidenceDir = path.join(baseDir, 'llm');

    // Ensure evidence directory exists
    if (!fs.existsSync(this.evidenceDir)) {
      fs.mkdirSync(this.evidenceDir, { recursive: true });
    }

    // Load existing evidence files
    this.loadExistingEvidence();
  }

  /**
   * Load existing evidence files from disk
   */
  private loadExistingEvidence(): void {
    if (!fs.existsSync(this.evidenceDir)) {
      return;
    }

    const files = fs.readdirSync(this.evidenceDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(this.evidenceDir, file), 'utf-8');
          const evidenceFile = JSON.parse(content) as EvidenceFile;
          if (evidenceFile.evidence && evidenceFile.evidence.call_id) {
            this.evidenceMap.set(evidenceFile.evidence.call_id, evidenceFile.evidence);
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  }

  /**
   * Record evidence for an LLM call
   * @returns Path to the evidence file
   */
  recordEvidence(evidence: LLMEvidence): string {
    // Calculate integrity hash of the evidence
    const evidenceJson = JSON.stringify(evidence);
    const integrityHash = crypto.createHash('sha256').update(evidenceJson).digest('hex');

    const evidenceFile: EvidenceFile = {
      evidence,
      integrity_hash: integrityHash,
    };

    // Write to file
    const filename = `${evidence.call_id}.json`;
    const filepath = path.join(this.evidenceDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(evidenceFile, null, 2), 'utf-8');

    // Update in-memory map
    this.evidenceMap.set(evidence.call_id, evidence);

    return filepath;
  }

  /**
   * Check if evidence exists for a call
   */
  hasEvidence(callId: string): boolean {
    // First check in-memory
    if (this.evidenceMap.has(callId)) {
      return true;
    }

    // Then check on disk
    const filepath = path.join(this.evidenceDir, `${callId}.json`);
    return fs.existsSync(filepath);
  }

  /**
   * Get evidence by call ID
   */
  getEvidence(callId: string): LLMEvidence | null {
    // First check in-memory
    if (this.evidenceMap.has(callId)) {
      return this.evidenceMap.get(callId)!;
    }

    // Then check on disk
    const filepath = path.join(this.evidenceDir, `${callId}.json`);
    if (!fs.existsSync(filepath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const evidenceFile = JSON.parse(content) as EvidenceFile;
      // Cache in memory
      this.evidenceMap.set(callId, evidenceFile.evidence);
      return evidenceFile.evidence;
    } catch {
      return null;
    }
  }

  /**
   * List all evidence
   */
  listEvidence(): LLMEvidence[] {
    // Reload from disk to ensure we have all evidence
    this.loadExistingEvidence();
    return Array.from(this.evidenceMap.values());
  }

  /**
   * Get evidence statistics
   */
  getStats(): EvidenceStats {
    const allEvidence = this.listEvidence();
    const successful = allEvidence.filter(e => e.success);
    const failed = allEvidence.filter(e => !e.success);

    return {
      total_calls: allEvidence.length,
      successful_calls: successful.length,
      failed_calls: failed.length,
    };
  }

  /**
   * Check if we can assert COMPLETE status
   * Requires at least one successful LLM call with evidence
   */
  canAssertComplete(): boolean {
    const allEvidence = this.listEvidence();

    // No evidence at all = cannot assert COMPLETE
    if (allEvidence.length === 0) {
      return false;
    }

    // At least one successful call required
    return allEvidence.some(e => e.success);
  }

  /**
   * Verify integrity of an evidence file
   * Detects tampering by comparing stored hash with recalculated hash
   */
  verifyIntegrity(callId: string): boolean {
    const filepath = path.join(this.evidenceDir, `${callId}.json`);
    if (!fs.existsSync(filepath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const evidenceFile = JSON.parse(content) as EvidenceFile;

      // Recalculate hash
      const evidenceJson = JSON.stringify(evidenceFile.evidence);
      const calculatedHash = crypto.createHash('sha256').update(evidenceJson).digest('hex');

      // Compare with stored hash
      return calculatedHash === evidenceFile.integrity_hash;
    } catch {
      return false;
    }
  }

  /**
   * Get evidence directory path
   */
  getEvidenceDir(): string {
    return this.evidenceDir;
  }
}

/**
 * Create hash for request payload
 */
export function hashRequest(messages: Array<{ role: string; content: string }>): string {
  const content = JSON.stringify(messages);
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Create hash for response content
 */
export function hashResponse(content: string): string {
  return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
}
