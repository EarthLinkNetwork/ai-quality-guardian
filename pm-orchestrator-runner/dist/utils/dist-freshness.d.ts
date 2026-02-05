/**
 * Dist Freshness Check Utility
 *
 * Ensures dist/ is up-to-date with src/ before web server starts.
 * Auto-builds if src is newer than dist.
 *
 * Per PM Orchestrator design: no manual user intervention required.
 */
export interface FreshnessResult {
    fresh: boolean;
    srcLatest?: number;
    distLatest?: number;
    rebuilt: boolean;
    error?: string;
}
/**
 * Check if dist is fresh (up-to-date with src)
 *
 * Returns true if dist exists and is newer than all src files.
 */
export declare function checkDistFreshness(projectRoot: string): {
    fresh: boolean;
    srcLatest: number;
    distLatest: number;
};
/**
 * Ensure dist is fresh before web server starts.
 * If not fresh, automatically rebuild.
 *
 * @param projectRoot - Project root directory
 * @param options - Options for rebuild behavior
 * @returns FreshnessResult with rebuild status
 */
export declare function ensureDistFresh(projectRoot: string, options?: {
    silent?: boolean;
    copyPublic?: boolean;
}): FreshnessResult;
/**
 * Quick check if public files are copied to dist
 */
export declare function checkPublicFilesCopied(projectRoot: string): boolean;
//# sourceMappingURL=dist-freshness.d.ts.map