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

import { Router, Request, Response } from "express";
import {
  getNoDynamoExtended,
  initNoDynamoExtended,
  isNoDynamoExtendedInitialized,
  NoDynamoDALWithConversations,
} from "../dal/no-dynamo";
import {
  ConversationMessage,
  ConversationMessageStatus,
  CreateConversationMessageInput,
} from "../dal/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Chat message response
 */
interface ChatResponse {
  message: ConversationMessage;
  runId?: string;
  awaitingResponse?: boolean;
}

/**
 * Create chat routes
 */
export function createChatRoutes(stateDir: string): Router {
  const router = Router();

  // Ensure NoDynamoExtended is initialized
  if (!isNoDynamoExtendedInitialized()) {
    initNoDynamoExtended(stateDir);
  }

  /**
   * GET /api/projects/:projectId/conversation
   * Get conversation history for a project
   */
  router.get(
    "/projects/:projectId/conversation",
    async (req: Request, res: Response) => {
      try {
        const dal = getNoDynamoExtended();
        const projectId = req.params.projectId as string;
        const limit = parseInt(req.query.limit as string) || 50;

        const messages = await dal.listConversationMessages(projectId, limit);

        // Check for awaiting response
        const awaitingMessage = await dal.getAwaitingResponseMessage(projectId);

        res.json({
          projectId,
          messages,
          awaitingResponse: awaitingMessage !== null,
          awaitingMessage: awaitingMessage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
      }
    }
  );

  /**
   * GET /api/projects/:projectId/conversation/status
   * Get conversation status (awaiting response check)
   */
  router.get(
    "/projects/:projectId/conversation/status",
    async (req: Request, res: Response) => {
      try {
        const dal = getNoDynamoExtended();
        const projectId = req.params.projectId as string;

        const awaitingMessage = await dal.getAwaitingResponseMessage(projectId);

        res.json({
          projectId,
          awaitingResponse: awaitingMessage !== null,
          awaitingMessage: awaitingMessage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
      }
    }
  );

  /**
   * POST /api/projects/:projectId/chat
   * Send a new chat message
   * Body: { content: string }
   *
   * This creates a user message and triggers Plan creation + Dispatch
   */
  router.post(
    "/projects/:projectId/chat",
    async (req: Request, res: Response) => {
      try {
        const dal = getNoDynamoExtended();
        const projectId = req.params.projectId as string;
        const { content } = req.body;

        if (!content || typeof content !== "string" || content.trim() === "") {
          res.status(400).json({
            error: "INVALID_INPUT",
            message: "content is required and must be a non-empty string",
          } as ErrorResponse);
          return;
        }

        // Get project to check for bootstrapPrompt
        const project = await dal.getProjectIndex(projectId);
        if (!project) {
          res.status(404).json({
            error: "NOT_FOUND",
            message: "Project not found: " + projectId,
          } as ErrorResponse);
          return;
        }

        // Inject bootstrapPrompt if exists
        const extendedProject = project as unknown as { bootstrapPrompt?: string };
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
        const runId = "run_" + uuidv4();
        const taskRunId = "task_" + uuidv4();

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
        } as ChatResponse & { userMessage: ConversationMessage; assistantMessage: ConversationMessage; bootstrapInjected: boolean });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
      }
    }
  );

  /**
   * POST /api/projects/:projectId/respond
   * Respond to an AWAITING_RESPONSE message
   * Body: { content: string, messageId?: string }
   */
  router.post(
    "/projects/:projectId/respond",
    async (req: Request, res: Response) => {
      try {
        const dal = getNoDynamoExtended();
        const projectId = req.params.projectId as string;
        const { content, messageId } = req.body;

        if (!content || typeof content !== "string" || content.trim() === "") {
          res.status(400).json({
            error: "INVALID_INPUT",
            message: "content is required and must be a non-empty string",
          } as ErrorResponse);
          return;
        }

        // Find awaiting message
        let awaitingMessage: ConversationMessage | null;
        if (messageId) {
          awaitingMessage = await dal.getConversationMessage(projectId, messageId);
        } else {
          awaitingMessage = await dal.getAwaitingResponseMessage(projectId);
        }

        if (!awaitingMessage) {
          res.status(404).json({
            error: "NOT_FOUND",
            message: "No awaiting response message found",
          } as ErrorResponse);
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
      }
    }
  );

  /**
   * DELETE /api/projects/:projectId/conversation
   * Clear conversation history
   */
  router.delete(
    "/projects/:projectId/conversation",
    async (req: Request, res: Response) => {
      try {
        const dal = getNoDynamoExtended();
        const projectId = req.params.projectId as string;

        await dal.clearConversationHistory(projectId);

        res.json({
          success: true,
          projectId,
          message: "Conversation history cleared",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
      }
    }
  );

  /**
   * PATCH /api/projects/:projectId/conversation/:messageId
   * Update a conversation message (e.g., mark as complete, error, awaiting)
   * Body: { status?: string, content?: string, metadata?: object }
   */
  router.patch(
    "/projects/:projectId/conversation/:messageId",
    async (req: Request, res: Response) => {
      try {
        const dal = getNoDynamoExtended();
        const projectId = req.params.projectId as string;
        const messageId = req.params.messageId as string;
        const { status, content, metadata } = req.body;

        const updated = await dal.updateConversationMessage(
          projectId,
          messageId,
          { status, content, metadata }
        );

        if (!updated) {
          res.status(404).json({
            error: "NOT_FOUND",
            message: "Message not found: " + messageId,
          } as ErrorResponse);
          return;
        }

        res.json(updated);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
      }
    }
  );

  return router;
}
