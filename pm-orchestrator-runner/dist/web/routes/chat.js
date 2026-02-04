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
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatRoutes = createChatRoutes;
const express_1 = require("express");
const no_dynamo_1 = require("../dal/no-dynamo");
const uuid_1 = require("uuid");
/**
 * Create chat routes
 */
function createChatRoutes(stateDir) {
    const router = (0, express_1.Router)();
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
     */
    router.post("/projects/:projectId/chat", async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamoExtended)();
            const projectId = req.params.projectId;
            const { content } = req.body;
            if (!content || typeof content !== "string" || content.trim() === "") {
                res.status(400).json({
                    error: "INVALID_INPUT",
                    message: "content is required and must be a non-empty string",
                });
                return;
            }
            // Get project to check for bootstrapPrompt
            const project = await dal.getProjectIndex(projectId);
            if (!project) {
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
                sessionId: "sess_" + projectId,
                projectId,
                taskRunId,
                prompt: finalContent, // Include bootstrapPrompt in run
            });
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
                bootstrapInjected: !!bootstrapPrompt,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
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