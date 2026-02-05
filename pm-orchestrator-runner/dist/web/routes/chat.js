"use strict";
/**
 * Chat Routes - Conversation management API
 * Per MVP Chat Feature requirements
 *
 * Provides:
 * - Conversation history retrieval
 * - Message sending (new chat / respond)
 * - AWAITING_RESPONSE status detection
 * - bootstrapPrompt injection
 * - Activity tracking for chat submissions
 * - TaskGroup creation for execution pipeline
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatRoutes = createChatRoutes;
const express_1 = require("express");
const no_dynamo_1 = require("../dal/no-dynamo");
const uuid_1 = require("uuid");
const task_type_detector_1 = require("../../utils/task-type-detector");
/**
 * Create chat routes
 * @param stateDirOrConfig - Either a stateDir string (legacy) or full config object
 */
function createChatRoutes(stateDirOrConfig) {
    const router = (0, express_1.Router)();
    // Handle both legacy (string) and new (config object) signatures
    const config = typeof stateDirOrConfig === "string"
        ? { stateDir: stateDirOrConfig }
        : stateDirOrConfig;
    const { stateDir, queueStore, sessionId } = config;
    // Ensure NoDynamoExtended is initialized
    if (!(0, no_dynamo_1.isNoDynamoExtendedInitialized)()) {
        (0, no_dynamo_1.initNoDynamoExtended)(stateDir);
    }
    /**
     * GET /api/projects/:projectId/conversation
     * Get conversation history for a project
     */
    router.get("/projects/:projectId/conversation", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            const limit = parseInt(req.query.limit) || 50;
            const messages = await dal.listConversationMessages(projectId, limit);
            // Check for awaiting response
            const awaitingMessage = await dal.getAwaitingResponseMessage(projectId);
            res.json({
                projectId,
                messages,
                awaitingResponse: awaitingMessage !== null,
                awaitingMessage: awaitingMessage,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    /**
     * GET /api/projects/:projectId/conversation/status
     * Get conversation status (awaiting response check)
     */
    router.get("/projects/:projectId/conversation/status", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            const awaitingMessage = await dal.getAwaitingResponseMessage(projectId);
            res.json({
                projectId,
                awaitingResponse: awaitingMessage !== null,
                awaitingMessage: awaitingMessage,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    /**
     * POST /api/projects/:projectId/chat
     * Send a new chat message
     * Body: { content: string }
     *
     * This creates a user message and triggers Plan creation + Dispatch
     * Also records Activity and creates TaskGroup for execution pipeline
     */
    router.post("/projects/:projectId/chat", async (req, res) => {
        const dal = (0, no_dynamo_1.getNoDynamoExtended)();
        const projectId = req.params.projectId;
        const orgId = "default"; // Default org for single-tenant mode
        let activityId;
        let taskGroupId;
        try {
            const { content } = req.body;
            // Record chat_received Activity at handler start (always)
            try {
                const activity = await dal.createActivityEvent({
                    orgId,
                    type: "chat_received",
                    projectId,
                    sessionId: sessionId || "sess_" + projectId,
                    summary: "Chat message received: " + (content?.substring(0, 50) || "(empty)") + (content?.length > 50 ? "..." : ""),
                    importance: "normal",
                    details: {
                        contentLength: content?.length || 0,
                        timestamp: new Date().toISOString(),
                    },
                });
                activityId = activity.id;
            }
            catch (actError) {
                // Log but don't fail the request if Activity creation fails
                console.error("[chat] Failed to create activity event:", actError);
            }
            if (!content || typeof content !== "string" || content.trim() === "") {
                // Record error Activity
                await dal.createActivityEvent({
                    orgId,
                    type: "chat_error",
                    projectId,
                    sessionId: sessionId || "sess_" + projectId,
                    summary: "Chat validation failed: empty content",
                    importance: "high",
                    details: { error: "INVALID_INPUT", activityId },
                }).catch(() => { }); // Best effort
                res.status(400).json({
                    error: "INVALID_INPUT",
                    message: "content is required and must be a non-empty string",
                });
                return;
            }
            // Get project to check for bootstrapPrompt
            const project = await dal.getProjectIndex(projectId);
            if (!project) {
                // Record error Activity
                await dal.createActivityEvent({
                    orgId,
                    type: "chat_error",
                    projectId,
                    sessionId: sessionId || "sess_" + projectId,
                    summary: "Chat failed: project not found",
                    importance: "high",
                    details: { error: "NOT_FOUND", projectId, activityId },
                }).catch(() => { }); // Best effort
                res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Project not found: " + projectId,
                });
                return;
            }
            // Inject bootstrapPrompt if exists
            const extendedProject = project;
            const bootstrapPrompt = extendedProject.bootstrapPrompt;
            const finalContent = bootstrapPrompt
                ? bootstrapPrompt + "\n\n---\n\n" + content.trim()
                : content.trim();
            // Create user message
            const userMessage = await dal.createConversationMessage({
                projectId,
                role: "user",
                content: content.trim(), // Store original content for display
                status: "pending",
            });
            // Create a new run for this message
            const runId = "run_" + (0, uuid_1.v4)();
            const taskRunId = "task_" + (0, uuid_1.v4)();
            await dal.createRun({
                sessionId: sessionId || "sess_" + projectId,
                projectId,
                taskRunId,
                prompt: finalContent, // Include bootstrapPrompt in run
            });
            // Create TaskGroup via queueStore if available (connects to execution pipeline)
            if (queueStore) {
                try {
                    taskGroupId = "tg_chat_" + (0, uuid_1.v4)();
                    // Detect task type from prompt content for proper execution handling
                    // READ_INFO/REPORT tasks don't require file evidence
                    const taskType = (0, task_type_detector_1.detectTaskType)(finalContent);
                    await queueStore.enqueue(sessionId || "sess_" + projectId, taskGroupId, finalContent, taskRunId, taskType);
                }
                catch (queueError) {
                    // Log but don't fail the request if TaskGroup creation fails
                    console.error("[chat] Failed to create TaskGroup:", queueError);
                }
            }
            // Create assistant placeholder message
            const assistantMessage = await dal.createConversationMessage({
                projectId,
                role: "assistant",
                content: "Processing...",
                runId,
                status: "processing",
            });
            // Update user message with runId
            await dal.updateConversationMessage(projectId, userMessage.messageId, {
                runId,
                status: "processing",
            });
            res.status(201).json({
                userMessage,
                assistantMessage,
                runId,
                taskGroupId,
                activityId,
                bootstrapInjected: !!bootstrapPrompt,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            // Record error Activity
            await dal.createActivityEvent({
                orgId,
                type: "chat_error",
                projectId,
                sessionId: sessionId || "sess_" + projectId,
                summary: "Chat internal error: " + message.substring(0, 100),
                importance: "high",
                details: {
                    error: "INTERNAL_ERROR",
                    message,
                    activityId,
                    stack: error instanceof Error ? error.stack : undefined,
                },
            }).catch(() => { }); // Best effort
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    /**
     * POST /api/projects/:projectId/respond
     * Respond to an AWAITING_RESPONSE message
     * Body: { content: string, messageId?: string }
     */
    router.post("/projects/:projectId/respond", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            const { content, messageId } = req.body;
            if (!content || typeof content !== "string" || content.trim() === "") {
                res.status(400).json({
                    error: "INVALID_INPUT",
                    message: "content is required and must be a non-empty string",
                });
                return;
            }
            // Find awaiting message
            let awaitingMessage;
            if (messageId) {
                awaitingMessage = await dal.getConversationMessage(projectId, messageId);
            }
            else {
                awaitingMessage = await dal.getAwaitingResponseMessage(projectId);
            }
            if (!awaitingMessage) {
                res.status(404).json({
                    error: "NOT_FOUND",
                    message: "No awaiting response message found",
                });
                return;
            }
            // Update awaiting message status to responded
            await dal.updateConversationMessage(projectId, awaitingMessage.messageId, {
                status: "responded",
            });
            // Create user response message
            const responseMessage = await dal.createConversationMessage({
                projectId,
                role: "user",
                content: content.trim(),
                runId: awaitingMessage.runId,
                status: "processing",
                metadata: {
                    clarificationQuestion: awaitingMessage.metadata?.clarificationQuestion,
                },
            });
            // Create new assistant placeholder
            const assistantMessage = await dal.createConversationMessage({
                projectId,
                role: "assistant",
                content: "Processing response...",
                runId: awaitingMessage.runId,
                status: "processing",
            });
            res.status(201).json({
                responseMessage,
                assistantMessage,
                runId: awaitingMessage.runId,
                originalQuestion: awaitingMessage.metadata?.clarificationQuestion,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    /**
     * DELETE /api/projects/:projectId/conversation
     * Clear conversation history
     */
    router.delete("/projects/:projectId/conversation", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            await dal.clearConversationHistory(projectId);
            res.json({
                success: true,
                projectId,
                message: "Conversation history cleared",
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    /**
     * PATCH /api/projects/:projectId/conversation/:messageId
     * Update a conversation message (e.g., mark as complete, error, awaiting)
     * Body: { status?: string, content?: string, metadata?: object }
     */
    router.patch("/projects/:projectId/conversation/:messageId", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            const messageId = req.params.messageId;
            const { status, content, metadata } = req.body;
            const updated = await dal.updateConversationMessage(projectId, messageId, { status, content, metadata });
            if (!updated) {
                res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Message not found: " + messageId,
                });
                return;
            }
            res.json(updated);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            res.status(500).json({ error: "INTERNAL_ERROR", message });
        }
    });
    return router;
}
//# sourceMappingURL=chat.js.map