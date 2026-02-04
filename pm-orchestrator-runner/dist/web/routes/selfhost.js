"use strict";
/**
 * Self-Hosting Routes - Dev/Prod promotion protocol
 *
 * Provides:
 * - Status check for runner-dev projects
 * - Apply plan generation and validation
 * - Artifact persistence for audit trail
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
exports.createSelfhostRoutes = createSelfhostRoutes;
const express_1 = require("express");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const no_dynamo_1 = require("../dal/no-dynamo");
/**
 * Get git HEAD for a directory
 */
function getGitHead(dir) {
    try {
        const result = (0, child_process_1.execSync)("git rev-parse HEAD", {
            cwd: dir,
            encoding: "utf-8",
            timeout: 5000,
        });
        return result.trim().substring(0, 12);
    }
    catch {
        return null;
    }
}
/**
 * Check if gate:all passed by looking for log files
 */
function checkGateAllPass(devDir) {
    // Look for gate log files in common locations
    const possiblePaths = [
        path.join(devDir, ".tmp", "gate-all.log"),
        path.join(devDir, ".tmp", "final-evidence", "gate-all.log"),
        path.join(devDir, ".tmp", "gate-settings-ui.log"),
    ];
    for (const logPath of possiblePaths) {
        if (fs.existsSync(logPath)) {
            try {
                const content = fs.readFileSync(logPath, "utf-8");
                // Check for ALL PASS markers
                const hasPass = content.includes("ALL PASS") || content.includes("Overall: ALL PASS");
                const hasFail = content.includes("FAIL") && !content.includes("[PASS]");
                if (hasPass && !hasFail) {
                    return { passed: true, logPath };
                }
            }
            catch {
                // Ignore read errors
            }
        }
    }
    // Also check if package.json exists and try to detect recent successful gate run
    const packageJsonPath = path.join(devDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
        // Look for any gate log that indicates success
        const tmpDir = path.join(devDir, ".tmp");
        if (fs.existsSync(tmpDir)) {
            try {
                const files = fs.readdirSync(tmpDir);
                for (const file of files) {
                    if (file.endsWith(".log") && file.includes("gate")) {
                        const logPath = path.join(tmpDir, file);
                        const content = fs.readFileSync(logPath, "utf-8");
                        if (content.includes("ALL PASS")) {
                            return { passed: true, logPath };
                        }
                    }
                }
            }
            catch {
                // Ignore
            }
        }
    }
    return { passed: false, logPath: null };
}
/**
 * Check if EVIDENCE.md exists and has content
 */
function checkEvidencePresent(devDir) {
    const evidencePath = path.join(devDir, "docs", "EVIDENCE.md");
    if (fs.existsSync(evidencePath)) {
        try {
            const stat = fs.statSync(evidencePath);
            if (stat.size > 100) {
                return { present: true, path: evidencePath };
            }
        }
        catch {
            // Ignore
        }
    }
    return { present: false, path: null };
}
/**
 * Create selfhost routes
 */
function createSelfhostRoutes(stateDir) {
    const router = (0, express_1.Router)();
    // Ensure NoDynamoExtended is initialized
    if (!(0, no_dynamo_1.isNoDynamoExtendedInitialized)()) {
        (0, no_dynamo_1.initNoDynamoExtended)(stateDir);
    }
    /**
     * GET /api/projects/:projectId/selfhost/status
     * Get self-hosting status for a runner-dev project
     */
    router.get("/projects/:projectId/selfhost/status", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            // Get project
            const project = await dal.getProjectIndex(projectId);
            if (!project) {
                res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Project not found: " + projectId,
                });
                return;
            }
            // Check if this is a runner-dev project
            const extendedProject = project;
            const isRunnerDev = extendedProject.projectType === "runner-dev";
            // Get directories from environment or defaults
            const prodDir = process.env.PM_RUNNER_PROD_DIR || process.cwd();
            const devDir = process.env.PM_RUNNER_DEV_DIR || null;
            // For non-runner-dev projects, return minimal status
            if (!isRunnerDev) {
                res.json({
                    isRunnerDev: false,
                    prodDir,
                    devDir: null,
                    devHead: null,
                    checks: {
                        devDirExists: false,
                        gateAllPass: false,
                        evidencePresent: false,
                    },
                    artifacts: {
                        gateLogPath: null,
                        evidencePath: null,
                    },
                    applyPlan: [],
                    canApply: false,
                    blockReason: "Project is not marked as runner-dev",
                });
                return;
            }
            // Check dev directory
            const devDirExists = devDir !== null && fs.existsSync(devDir);
            const devHead = devDirExists && devDir ? getGitHead(devDir) : null;
            // Check gate:all status
            const gateCheck = devDirExists && devDir
                ? checkGateAllPass(devDir)
                : { passed: false, logPath: null };
            // Check evidence
            const evidenceCheck = devDirExists && devDir
                ? checkEvidencePresent(devDir)
                : { present: false, path: null };
            // Build apply plan
            const applyPlan = devDirExists && devDir ? [
                "Step 1: cd " + prodDir,
                "Step 2: git fetch origin",
                "Step 3: git reset --hard " + (devHead || "<devHead>"),
                "Step 4: npm ci",
                "Step 5: npm run build",
                "Step 6: Restart pm-orchestrator-runner server",
            ] : [];
            // Determine if apply is possible
            const canApply = devDirExists && gateCheck.passed && evidenceCheck.present;
            let blockReason = null;
            if (!devDirExists) {
                blockReason = "PM_RUNNER_DEV_DIR not set or directory does not exist";
            }
            else if (!gateCheck.passed) {
                blockReason = "gate:all has not passed (no successful gate log found)";
            }
            else if (!evidenceCheck.present) {
                blockReason = "docs/EVIDENCE.md not found or empty";
            }
            res.json({
                isRunnerDev: true,
                prodDir,
                devDir,
                devHead,
                checks: {
                    devDirExists,
                    gateAllPass: gateCheck.passed,
                    evidencePresent: evidenceCheck.present,
                },
                artifacts: {
                    gateLogPath: gateCheck.logPath,
                    evidencePath: evidenceCheck.path,
                },
                applyPlan,
                canApply,
                blockReason,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    /**
     * POST /api/projects/:projectId/selfhost/apply
     * Create apply plan artifacts (does not execute git commands)
     */
    router.post("/projects/:projectId/selfhost/apply", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            // Get project
            const project = await dal.getProjectIndex(projectId);
            if (!project) {
                res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Project not found: " + projectId,
                });
                return;
            }
            // Check if this is a runner-dev project
            const extendedProject = project;
            const isRunnerDev = extendedProject.projectType === "runner-dev";
            if (!isRunnerDev) {
                res.status(409).json({
                    error: "NOT_RUNNER_DEV",
                    message: "Project is not marked as runner-dev",
                });
                return;
            }
            // Get directories
            const prodDir = process.env.PM_RUNNER_PROD_DIR || process.cwd();
            const devDir = process.env.PM_RUNNER_DEV_DIR || null;
            // Validate preconditions
            const devDirExists = devDir !== null && fs.existsSync(devDir);
            if (!devDirExists || !devDir) {
                res.status(409).json({
                    error: "DEV_DIR_MISSING",
                    message: "PM_RUNNER_DEV_DIR not set or directory does not exist",
                    checks: {
                        devDirExists: false,
                        gateAllPass: false,
                        evidencePresent: false,
                    },
                });
                return;
            }
            const gateCheck = checkGateAllPass(devDir);
            if (!gateCheck.passed) {
                res.status(409).json({
                    error: "GATE_NOT_PASSED",
                    message: "gate:all has not passed (no successful gate log found)",
                    checks: {
                        devDirExists: true,
                        gateAllPass: false,
                        evidencePresent: false,
                    },
                });
                return;
            }
            const evidenceCheck = checkEvidencePresent(devDir);
            if (!evidenceCheck.present) {
                res.status(409).json({
                    error: "EVIDENCE_MISSING",
                    message: "docs/EVIDENCE.md not found or empty",
                    checks: {
                        devDirExists: true,
                        gateAllPass: true,
                        evidencePresent: false,
                    },
                });
                return;
            }
            // All checks passed - create artifacts
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const applyId = `apply-${timestamp}`;
            const artifactDir = path.join(stateDir, "selfhost-apply", timestamp);
            fs.mkdirSync(artifactDir, { recursive: true });
            const devHead = getGitHead(devDir);
            const applyPlan = [
                "Step 1: cd " + prodDir,
                "Step 2: git fetch origin",
                "Step 3: git reset --hard " + (devHead || "<devHead>"),
                "Step 4: npm ci",
                "Step 5: npm run build",
                "Step 6: Restart pm-orchestrator-runner server",
            ];
            const createdAt = new Date().toISOString();
            // Save apply-plan.json
            const applyPlanPath = path.join(artifactDir, "apply-plan.json");
            fs.writeFileSync(applyPlanPath, JSON.stringify({
                timestamp,
                applyId,
                projectId,
                prodDir,
                devDir,
                devHead,
                applyPlan,
                createdAt,
            }, null, 2));
            // Save status.json
            const statusPath = path.join(artifactDir, "status.json");
            fs.writeFileSync(statusPath, JSON.stringify({
                timestamp,
                applyId,
                projectId,
                checks: {
                    devDirExists: true,
                    gateAllPass: true,
                    evidencePresent: true,
                },
                artifacts: {
                    gateLogPath: gateCheck.logPath,
                    evidencePath: evidenceCheck.path,
                },
                applyReady: true,
                createdAt,
            }, null, 2));
            // Get current state for resume artifact
            // Check for AWAITING_RESPONSE tasks
            let latestPlanId = null;
            let latestRunId = null;
            let awaitingResponse = false;
            try {
                // Try to get sessions to find AWAITING_RESPONSE state
                const sessions = await dal.listSessions();
                for (const session of sessions) {
                    // Check if any runs have AWAITING_RESPONSE
                    for (const thread of session.threads || []) {
                        for (const run of thread.runs || []) {
                            if (run.status === "AWAITING_RESPONSE") {
                                awaitingResponse = true;
                                latestRunId = run.runId;
                            }
                        }
                    }
                }
            }
            catch {
                // Ignore errors - state detection is best-effort
            }
            // Generate resumeUrl
            const resumeUrl = `/projects/${projectId}?resume=${encodeURIComponent(applyId)}`;
            // Save resume.json
            const resumePath = path.join(artifactDir, "resume.json");
            const resumeArtifact = {
                projectId,
                applyId,
                createdAt,
                resumeUrl,
                expectedState: {
                    latestPlanId,
                    latestRunId,
                    awaitingResponse,
                },
            };
            fs.writeFileSync(resumePath, JSON.stringify(resumeArtifact, null, 2));
            res.status(200).json({
                success: true,
                timestamp,
                applyId,
                artifactDir,
                applyPlanPath,
                statusPath,
                resumePath,
                applyPlan,
                resumeUrl,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    /**
     * GET /api/projects/:projectId/selfhost/resume/:applyId
     * Get resume artifact for a specific apply
     */
    router.get("/projects/:projectId/selfhost/resume/:applyId", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            const applyId = req.params.applyId;
            // Get project
            const project = await dal.getProjectIndex(projectId);
            if (!project) {
                res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Project not found: " + projectId,
                });
                return;
            }
            // Extract timestamp from applyId (format: apply-YYYY-MM-DDTHH-MM-SS-MMMZ)
            const timestamp = applyId.replace(/^apply-/, "");
            const artifactDir = path.join(stateDir, "selfhost-apply", timestamp);
            // Check if artifact directory exists
            if (!fs.existsSync(artifactDir)) {
                res.status(404).json({
                    error: "APPLY_NOT_FOUND",
                    message: "Apply artifact not found: " + applyId,
                });
                return;
            }
            // Read resume.json
            const resumePath = path.join(artifactDir, "resume.json");
            if (!fs.existsSync(resumePath)) {
                res.status(404).json({
                    error: "RESUME_NOT_FOUND",
                    message: "Resume artifact not found for apply: " + applyId,
                });
                return;
            }
            const resumeContent = fs.readFileSync(resumePath, "utf-8");
            const resumeArtifact = JSON.parse(resumeContent);
            // Verify project matches
            if (resumeArtifact.projectId !== projectId) {
                res.status(403).json({
                    error: "PROJECT_MISMATCH",
                    message: "Resume artifact belongs to different project",
                });
                return;
            }
            // Get current state to compare with expected state
            let currentAwaitingResponse = false;
            let currentLatestRunId = null;
            try {
                const sessions = await dal.listSessions();
                for (const session of sessions) {
                    for (const thread of session.threads || []) {
                        for (const run of thread.runs || []) {
                            if (run.status === "AWAITING_RESPONSE") {
                                currentAwaitingResponse = true;
                                currentLatestRunId = run.runId;
                            }
                        }
                    }
                }
            }
            catch {
                // Ignore errors
            }
            // Return resume info with current state comparison
            res.json({
                ...resumeArtifact,
                currentState: {
                    awaitingResponse: currentAwaitingResponse,
                    latestRunId: currentLatestRunId,
                },
                stateMatch: {
                    awaitingResponseMatch: resumeArtifact.expectedState.awaitingResponse === currentAwaitingResponse,
                },
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    return router;
}
//# sourceMappingURL=selfhost.js.map