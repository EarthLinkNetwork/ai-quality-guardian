/**
 * /init Command Handler
 * Creates .claude/ scaffold in target project
 */
/**
 * Result of init command
 */
export interface InitResult {
    success: boolean;
    message: string;
    createdPaths?: string[];
    existingFiles?: string[];
}
/**
 * Init command handler
 */
export declare class InitCommand {
    /**
     * Execute init command
     * Per spec 10_REPL_UX.md L96-99:
     * - Check ALL files BEFORE creating any
     * - If ANY exist, return ERROR with list of existing files
     * - Only create if NONE exist
     */
    execute(targetPath: string): Promise<InitResult>;
    /**
     * Check if a directory is already initialized
     */
    isInitialized(targetPath: string): boolean;
}
//# sourceMappingURL=init.d.ts.map