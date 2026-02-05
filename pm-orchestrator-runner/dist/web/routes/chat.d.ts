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
import { Router } from "express";
import { IQueueStore } from "../../queue/queue-store";
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
export declare function createChatRoutes(stateDirOrConfig: string | ChatRoutesConfig): Router;
//# sourceMappingURL=chat.d.ts.map