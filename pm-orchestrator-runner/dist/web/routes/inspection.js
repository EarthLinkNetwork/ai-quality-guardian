"use strict";
/**
 * Inspection Packet Routes
 * Per spec/05_INSPECTION_PACKET.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInspectionRoutes = createInspectionRoutes;
const express_1 = require("express");
const no_dynamo_1 = require("../dal/no-dynamo");
/**
 * Create inspection routes
 */
function createInspectionRoutes(stateDir) {
    const router = (0, express_1.Router)();
    // Ensure NoDynamo is initialized
    if (!(0, no_dynamo_1.isNoDynamoInitialized)()) {
        (0, no_dynamo_1.initNoDynamo)(stateDir);
    }
    /**
     * POST /api/inspection/run/:runId
     * Generate inspection packet for a run
     */
    router.post('/run/:runId', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const runId = req.params.runId;
            const { generatedBy, includeAllLogs } = req.body;
            const packet = await dal.generateInspectionPacket({
                runId,
                generatedBy: generatedBy || 'user',
                includeAllLogs: includeAllLogs === true,
            });
            res.status(201).json(packet);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            if (message.includes('not found')) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message,
                });
            }
            else {
                res.status(500).json({ error: 'INTERNAL_ERROR', message });
            }
        }
    });
    /**
     * GET /api/inspection/:packetId
     * Get inspection packet by ID
     */
    router.get('/:packetId', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const packet = await dal.getInspectionPacket(req.params.packetId);
            if (!packet) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Inspection packet not found',
                });
                return;
            }
            res.json(packet);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/inspection/:packetId/markdown
     * Get inspection packet as markdown
     */
    router.get('/:packetId/markdown', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const packet = await dal.getInspectionPacket(req.params.packetId);
            if (!packet) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Inspection packet not found',
                });
                return;
            }
            const markdown = dal.formatPacketAsMarkdown(packet);
            res.set('Content-Type', 'text/markdown; charset=utf-8');
            res.send(markdown);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/inspection/:packetId/clipboard
     * Get inspection packet in clipboard-ready format (for ChatGPT)
     */
    router.get('/:packetId/clipboard', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const packet = await dal.getInspectionPacket(req.params.packetId);
            if (!packet) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Inspection packet not found',
                });
                return;
            }
            const clipboard = dal.formatPacketForClipboard(packet);
            res.set('Content-Type', 'text/plain; charset=utf-8');
            res.send(clipboard);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    /**
     * GET /api/inspection
     * List all inspection packets
     */
    router.get('/', async (req, res) => {
        try {
            const dal = (0, no_dynamo_1.getNoDynamo)();
            const runId = req.query.runId;
            const packets = await dal.listInspectionPackets(runId);
            res.json({ packets });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: 'INTERNAL_ERROR', message });
        }
    });
    return router;
}
//# sourceMappingURL=inspection.js.map