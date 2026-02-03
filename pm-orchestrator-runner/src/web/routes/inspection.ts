/**
 * Inspection Packet Routes
 * Per spec/05_INSPECTION_PACKET.md
 */

import { Router, Request, Response } from 'express';
import {
  InspectionPacket,
  getNoDynamo,
  initNoDynamo,
  isNoDynamoInitialized,
} from '../dal/no-dynamo';

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Create inspection routes
 */
export function createInspectionRoutes(stateDir: string): Router {
  const router = Router();

  // Ensure NoDynamo is initialized
  if (!isNoDynamoInitialized()) {
    initNoDynamo(stateDir);
  }

  /**
   * POST /api/inspection/run/:runId
   * Generate inspection packet for a run
   */
  router.post('/run/:runId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const runId = req.params.runId as string;
      const { generatedBy, includeAllLogs } = req.body;

      const packet = await dal.generateInspectionPacket({
        runId,
        generatedBy: generatedBy || 'user',
        includeAllLogs: includeAllLogs === true,
      });

      res.status(201).json(packet);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message,
        } as ErrorResponse);
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
      }
    }
  });

  /**
   * GET /api/inspection/:packetId
   * Get inspection packet by ID
   */
  router.get('/:packetId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const packet = await dal.getInspectionPacket(req.params.packetId as string);

      if (!packet) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Inspection packet not found',
        } as ErrorResponse);
        return;
      }

      res.json(packet);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/inspection/:packetId/markdown
   * Get inspection packet as markdown
   */
  router.get('/:packetId/markdown', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const packet = await dal.getInspectionPacket(req.params.packetId as string);

      if (!packet) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Inspection packet not found',
        } as ErrorResponse);
        return;
      }

      const markdown = dal.formatPacketAsMarkdown(packet);
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      res.send(markdown);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/inspection/:packetId/clipboard
   * Get inspection packet in clipboard-ready format (for ChatGPT)
   */
  router.get('/:packetId/clipboard', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const packet = await dal.getInspectionPacket(req.params.packetId as string);

      if (!packet) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Inspection packet not found',
        } as ErrorResponse);
        return;
      }

      const clipboard = dal.formatPacketForClipboard(packet);
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(clipboard);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/inspection
   * List all inspection packets
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const runId = req.query.runId as string | undefined;
      const packets = await dal.listInspectionPackets(runId);

      res.json({ packets });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  return router;
}
