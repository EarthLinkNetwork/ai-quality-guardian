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

import { Router, Request, Response } from "express";
import {
  getNoDynamoExtended,
  initNoDynamoExtended,
  isNoDynamoExtendedInitialized,
  NoDynamoDALWithConversations,
} from "../dal/no-dynamo";
import {
  ChatImageAttachment,
  ConversationMessage,
  ConversationMessageStatus,
  CreateConversationMessageInput,
} from "../dal/types";
import { v4 as uuidv4 } from "uuid";
import { IQueueStore, TaskTypeValue } from "../../queue/queue-store";
import { detectTaskType } from "../../utils/task-type-detector";
import { parseCommand, getCommandRegistry, CommandContext } from "../services/custom-command-registry";

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
 * Chat routes configuration
 */
export interface ChatRoutesConfig {
  stateDir: string;
  queueStore?: IQueueStore;
  sessionId?: string;
}

/**
 * Create chat routes
 * @param stateDirOrConfig - Either a stateDir string (legacy) or full config object
 */
export function createChatRoutes(stateDirOrConfig: string | ChatRoutesConfig): Router {
  const router = Router();

  // Handle both legacy (string) and new (config object) signatures
  const config: ChatRoutesConfig = typeof stateDirOrConfig === "string"
    ? { stateDir: stateDirOrConfig }
    : stateDirOrConfig;

  const { stateDir, queueStore, sessionId } = config;

  // Ensure NoDynamoExtended is initialized
  if (!isNoDynamoExtendedInitialized()) {
    initNoDynamoExtended(stateDir);
  }

  /**
   * GET /api/commands
   * List all available custom commands
   */
  router.get("/commands", async (_req: Request, res: Response) => {
    try {
      const registry = getCommandRegistry();
      const commands = registry.list().map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
      }));
      res.json({ commands });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "INTERNAL_ERROR", message } as ErrorResponse);
    }
  });

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
   * Also records Activity and creates TaskGroup for execution pipeline
   */
  router.post(
    "/projects/:projectId/chat",
    async (req: Request, res: Response) => {
      const dal = getNoDynamoExtended();
      const projectId = req.params.projectId as string;
      const orgId = "default"; // Default org for single-tenant mode
      let activityId: string | undefined;
      let taskGroupId: string | undefined;

      try {
        const { content, images, taskGroupId: requestedTaskGroupId } = req.body;

        if (!content || typeof content !== "string" || content.trim() === "") {
          // Record error Activity
          await dal.createActivityEvent({
            orgId,
            type: "chat_error",
            projectId,
            sessionId: sessionId || "sess_" + projectId,
            summary: "Chat validation failed: empty content",
            importance: "high",
            details: { error: "INVALID_INPUT" },
          }).catch(() => {}); // Best effort

          res.status(400).json({
            error: "INVALID_INPUT",
            message: "content is required and must be a non-empty string",
          } as ErrorResponse);
          return;
        }

        // Check for custom command (slash commands)
        const parsed = parseCommand(content);
        if (parsed.isCommand) {
          const registry = getCommandRegistry();
          const project = await dal.getProjectIndex(projectId);
          const commandContext: CommandContext = {
            projectId,
            projectPath: project?.projectPath,
            sessionId: sessionId || "sess_" + projectId,
          };
          const commandResult = await registry.execute(parsed.name, parsed.args, commandContext);

          // Store the user command message
          const userMessage = await dal.createConversationMessage({
            projectId,
            role: "user",
            content: content.trim(),
            status: "complete",
            metadata: { isCommand: true, commandName: parsed.name },
          });

          // Handle /clear action
          if (commandResult.metadata?.action === "clear_conversation") {
            await dal.clearConversationHistory(projectId);
          }

          // If passthrough, enqueue for Claude Code execution
          if (commandResult.passthrough && commandResult.passthroughPrompt && queueStore && project) {
            const taskRunId = "task_" + uuidv4();
            const effectiveSessionId = sessionId || "sess_" + projectId;
            const effectiveTaskGroupId = (typeof requestedTaskGroupId === "string" && requestedTaskGroupId.trim())
              ? requestedTaskGroupId.trim()
              : effectiveSessionId;

            const taskType = (commandResult.metadata?.taskType as TaskTypeValue) || detectTaskType(commandResult.passthroughPrompt);
            await queueStore.enqueue(
              effectiveSessionId,
              effectiveTaskGroupId,
              commandResult.passthroughPrompt,
              taskRunId,
              taskType,
              project.projectPath
            );

            const run = await dal.createRun({
              sessionId: effectiveSessionId,
              projectId,
              taskRunId,
              prompt: commandResult.passthroughPrompt,
            });

            const assistantMessage = await dal.createConversationMessage({
              projectId,
              role: "assistant",
              content: commandResult.output + "\n\nProcessing...",
              runId: run.runId,
              status: "processing",
              metadata: { isCommandResult: true, commandName: parsed.name },
            });

            res.status(201).json({
              userMessage,
              assistantMessage,
              runId: run.runId,
              taskGroupId: effectiveTaskGroupId,
              isCommand: true,
              commandName: parsed.name,
              commandResult,
            });
            return;
          }

          // Local command - create assistant response immediately
          const assistantMessage = await dal.createConversationMessage({
            projectId,
            role: "assistant",
            content: commandResult.output,
            status: "complete",
            metadata: { isCommandResult: true, commandName: parsed.name },
          });

          res.status(200).json({
            userMessage,
            assistantMessage,
            isCommand: true,
            commandName: parsed.name,
            commandResult,
          });
          return;
        }

        // Validate images if provided
        const validatedImages: ChatImageAttachment[] = [];
        if (images && Array.isArray(images)) {
          for (const img of images) {
            if (img && typeof img.data === "string" && typeof img.type === "string") {
              validatedImages.push({
                name: typeof img.name === "string" ? img.name : "image",
                type: img.type,
                data: img.data,
              });
            }
          }
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
            details: { error: "NOT_FOUND", projectId },
          }).catch(() => {}); // Best effort

          res.status(404).json({
            error: "NOT_FOUND",
            message: "Project not found: " + projectId,
          } as ErrorResponse);
          return;
        }

        // Inject bootstrapPrompt and/or templates if configured
        const extendedProject = project as unknown as {
          bootstrapPrompt?: string;
          inputTemplateId?: string | null;
          outputTemplateId?: string | null;
        };
        const bootstrapPrompt = extendedProject.bootstrapPrompt;

        // Resolve input/output template content
        let inputTemplateText = '';
        let outputTemplateText = '';
        let inputTemplateName = '';
        let outputTemplateName = '';
        if (extendedProject.inputTemplateId || extendedProject.outputTemplateId) {
          try {
            const { TemplateStore } = require('../../template');
            const templateStore = new TemplateStore();
            await templateStore.initialize();

            if (extendedProject.inputTemplateId) {
              const tpl = templateStore.get(extendedProject.inputTemplateId);
              if (tpl) {
                inputTemplateText = tpl.rulesText || '';
                inputTemplateName = tpl.name;
              }
            }
            if (extendedProject.outputTemplateId) {
              const tpl = templateStore.get(extendedProject.outputTemplateId);
              if (tpl) {
                outputTemplateText = tpl.outputFormatText || '';
                outputTemplateName = tpl.name;
              }
            }
          } catch (tplError) {
            console.warn('[chat] Failed to load templates:', tplError);
          }
        }

        // Build the final prompt:
        // [InputTemplate] + [BootstrapPrompt] + [UserContent] + [OutputTemplate]
        const promptParts: string[] = [];
        if (inputTemplateText) {
          promptParts.push('[InputRules]\n' + inputTemplateText + '\n[/InputRules]');
        }
        if (bootstrapPrompt) {
          promptParts.push(bootstrapPrompt);
        }
        promptParts.push(content.trim());
        if (outputTemplateText) {
          promptParts.push('[OutputRules]\n' + outputTemplateText + '\n[/OutputRules]');
        }
        const finalContent = promptParts.join('\n\n---\n\n');

        // Create user message (with optional image attachments in metadata)
        const userMessage = await dal.createConversationMessage({
          projectId,
          role: "user",
          content: content.trim(), // Store original content for display
          status: "pending",
          metadata: validatedImages.length > 0 ? { images: validatedImages } : undefined,
        });

        // Create a new run for this message
        const taskRunId = "task_" + uuidv4();

        // Derive taskGroupId early so it can be saved in activity and run
        // If client provides a taskGroupId, reuse it to keep tasks in the same group
        const effectiveSessionId = sessionId || "sess_" + projectId;
        taskGroupId = (typeof requestedTaskGroupId === "string" && requestedTaskGroupId.trim())
          ? requestedTaskGroupId.trim()
          : effectiveSessionId;

        const run = await dal.createRun({
          sessionId: effectiveSessionId,
          projectId,
          taskRunId,
          prompt: finalContent, // Include bootstrapPrompt in run
        });
        const runId = run.runId; // Use the same runId as the run record

        // Create TaskGroup via queueStore if available (connects to execution pipeline)
        // Per spec SESSION_MODEL.md: 1 Session = 1 TaskGroup (1:1 mapping)
        if (queueStore) {
          try {
            // Detect task type from prompt content for proper execution handling
            const taskType = detectTaskType(finalContent);
            await queueStore.enqueue(
              effectiveSessionId,
              taskGroupId,
              finalContent,
              taskRunId,
              taskType,
              project.projectPath
            );
            // Emit task_queued activity event with full identifier chain
            try {
              await dal.createActivityEvent({
                orgId,
                type: "task_queued",
                projectId,
                projectPath: project.projectPath,
                projectAlias: project.alias,
                sessionId: effectiveSessionId,
                taskGroupId,
                taskId: taskRunId,
                summary: "Task queued: " + content.substring(0, 50) + (content.length > 50 ? "..." : ""),
                importance: "normal",
                details: {
                  runId,
                  taskRunId,
                  taskGroupId,
                },
              });
            } catch {
              // Best effort
            }
          } catch (queueError) {
            // Log but don't fail the request if TaskGroup creation fails
            console.error("[chat] Failed to create TaskGroup:", queueError);
          }
        }

        // Record chat_received + task_started activities WITH full identifier chain
        // This ensures activity events link projectId <-> taskGroupId <-> taskId
        try {
          const activity = await dal.createActivityEvent({
            orgId,
            type: "chat_received",
            projectId,
            projectPath: project.projectPath,
            projectAlias: project.alias,
            sessionId: effectiveSessionId,
            taskGroupId,
            taskId: taskRunId,
            summary: "Chat message received: " + content.substring(0, 50) + (content.length > 50 ? "..." : ""),
            importance: "normal",
            details: {
              contentLength: content.length,
              runId,
              taskRunId,
              taskGroupId,
              timestamp: new Date().toISOString(),
            },
          });
          activityId = activity.id;
        } catch (actError) {
          console.error("[chat] Failed to create activity event:", actError);
        }

        // Also emit a task_started event for project detail resolution
        try {
          await dal.createActivityEvent({
            orgId,
            type: "task_started",
            projectId,
            projectPath: project.projectPath,
            projectAlias: project.alias,
            sessionId: effectiveSessionId,
            taskGroupId,
            taskId: taskRunId,
            summary: "Task started: " + content.substring(0, 50) + (content.length > 50 ? "..." : ""),
            importance: "normal",
            details: {
              runId,
              taskRunId,
              taskGroupId,
            },
          });
        } catch {
          // Best effort
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
          inputTemplateInjected: !!inputTemplateText,
          outputTemplateInjected: !!outputTemplateText,
          inputTemplateName: inputTemplateName || null,
          outputTemplateName: outputTemplateName || null,
        } as ChatResponse & {
          userMessage: ConversationMessage;
          assistantMessage: ConversationMessage;
          taskGroupId?: string;
          activityId?: string;
          bootstrapInjected: boolean;
          inputTemplateInjected: boolean;
          outputTemplateInjected: boolean;
          inputTemplateName: string | null;
          outputTemplateName: string | null;
        });
      } catch (error) {
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
        }).catch(() => {}); // Best effort

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
