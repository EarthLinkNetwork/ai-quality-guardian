"use strict";
/**
 * Dist Freshness Check Utility
 *
 * Ensures dist/ is up-to-date with src/ before web server starts.
 * Auto-builds if src is newer than dist.
 *
 * Per PM Orchestrator design: no manual user intervention required.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDistFreshness = checkDistFreshness;
exports.ensureDistFresh = ensureDistFresh;
exports.checkPublicFilesCopied = checkPublicFilesCopied;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
/**
 * Get the latest modification time of all TypeScript files in a directory
 */
function getLatestMtime(dir, extensions) {
    let latest = 0;
    function walk(currentDir) {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                // Skip node_modules, .git, dist, etc.
                if (entry.isDirectory()) {
                    if (!['node_modules', '.git', 'dist', '.tmp', 'coverage'].includes(entry.name)) {
                        walk(fullPath);
                    }
                }
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        const stat = fs.statSync(fullPath);
                        if (stat.mtimeMs > latest) {
                            latest = stat.mtimeMs;
                        }
                    }
                }
            }
        }
        catch (e) {
            // Ignore permission errors, etc.
        }
    }
    walk(dir);
    return latest;
}
/**
 * Check if dist is fresh (up-to-date with src)
 *
 * Returns true if dist exists and is newer than all src files.
 */
function checkDistFreshness(projectRoot) {
    const srcDir = path.join(projectRoot, 'src');
    const distDir = path.join(projectRoot, 'dist');
    // If dist doesn't exist, not fresh
    if (!fs.existsSync(distDir)) {
        return { fresh: false, srcLatest: Date.now(), distLatest: 0 };
    }
    // Get latest mtime from src (TypeScript files)
    const srcLatest = getLatestMtime(srcDir, ['.ts', '.tsx']);
    // Get latest mtime from dist (JavaScript files)
    const distLatest = getLatestMtime(distDir, ['.js', '.d.ts']);
    // Fresh if dist is newer than src
    return {
        fresh: distLatest >= srcLatest,
        srcLatest,
        distLatest,
    };
}
/**
 * Ensure dist is fresh before web server starts.
 * If not fresh, automatically rebuild.
 *
 * @param projectRoot - Project root directory
 * @param options - Options for rebuild behavior
 * @returns FreshnessResult with rebuild status
 */
function ensureDistFresh(projectRoot, options = {}) {
    const { silent = false, copyPublic = true } = options;
    const freshness = checkDistFreshness(projectRoot);
    if (freshness.fresh) {
        return {
            fresh: true,
            srcLatest: freshness.srcLatest,
            distLatest: freshness.distLatest,
            rebuilt: false,
        };
    }
    // Auto-rebuild
    if (!silent) {
        console.log('[dist-freshness] src is newer than dist, rebuilding...');
        console.log(`[dist-freshness] src latest: ${new Date(freshness.srcLatest).toISOString()}`);
        console.log(`[dist-freshness] dist latest: ${new Date(freshness.distLatest).toISOString()}`);
    }
    try {
        // Run build
        (0, child_process_1.execSync)('npm run build', {
            cwd: projectRoot,
            stdio: silent ? 'pipe' : 'inherit',
        });
        // Copy public files if needed
        if (copyPublic) {
            const publicSrc = path.join(projectRoot, 'src/web/public');
            const publicDest = path.join(projectRoot, 'dist/web/public');
            if (fs.existsSync(publicSrc)) {
                // Ensure parent directory exists
                fs.mkdirSync(path.dirname(publicDest), { recursive: true });
                // Use cp -r for simplicity
                (0, child_process_1.execSync)(`cp -r "${publicSrc}" "${path.dirname(publicDest)}/"`, {
                    cwd: projectRoot,
                    stdio: 'pipe',
                });
                if (!silent) {
                    console.log('[dist-freshness] Copied public files to dist/web/');
                }
            }
        }
        if (!silent) {
            console.log('[dist-freshness] Rebuild complete');
        }
        // Verify rebuild succeeded
        const postBuildFreshness = checkDistFreshness(projectRoot);
        return {
            fresh: postBuildFreshness.fresh,
            srcLatest: postBuildFreshness.srcLatest,
            distLatest: postBuildFreshness.distLatest,
            rebuilt: true,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!silent) {
            console.error('[dist-freshness] Rebuild failed:', errorMessage);
        }
        return {
            fresh: false,
            srcLatest: freshness.srcLatest,
            distLatest: freshness.distLatest,
            rebuilt: false,
            error: errorMessage,
        };
    }
}
/**
 * Quick check if public files are copied to dist
 */
function checkPublicFilesCopied(projectRoot) {
    const indexHtml = path.join(projectRoot, 'dist/web/public/index.html');
    return fs.existsSync(indexHtml);
}
//# sourceMappingURL=dist-freshness.js.map