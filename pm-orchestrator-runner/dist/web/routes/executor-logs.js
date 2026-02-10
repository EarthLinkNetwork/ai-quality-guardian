"use strict";
/**
 * Executor Logs Routes
 *
 * AC A.2: Executor Live Log - Real-time stdout/stderr streaming for Web UI
 *
 * Provides API endpoints for:
 * - Retrieving executor output logs
 * - Real-time streaming via SSE
 * - Task-based filtering
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExecutorLogsRoutes = createExecutorLogsRoutes;
const express_1 = require("express");
const executor_output_stream_1 = require("../../executor/executor-output-stream");
/**
 * Creates router for executor log endpoints
 *
 * @returns Express router
 */
function createExecutorLogsRoutes() {
    const router = (0, express_1.Router)();
    const outputStream = (0, executor_output_stream_1.getExecutorOutputStream)();
    // ===================
    // GET /api/executor/logs
    // Get recent executor output logs
    // ===================
    router.get('/logs', (req, res) => {
        const { taskId, taskCreatedAt, since, limit, } = req.query;
        let chunks;
        // Apply filters - use stale-aware filtering when taskId provided
        if (taskId && typeof taskId === 'string') {
            chunks = outputStream.getByTaskIdFiltered(taskId, typeof taskCreatedAt === 'string' ? taskCreatedAt : undefined);
        }
        else if (since && typeof since === 'string') {
            const sequence = parseInt(since, 10);
            if (!isNaN(sequence)) {
                chunks = outputStream.getSince(sequence);
            }
            else {
                chunks = outputStream.getAll();
            }
        }
        else {
            chunks = outputStream.getAll();
        }
        // Apply limit
        const limitNum = limit ? parseInt(limit, 10) : 100;
        if (limitNum > 0 && chunks.length > limitNum) {
            chunks = chunks.slice(-limitNum);
        }
        const sessionId = outputStream.getSessionId();
        res.json({
            count: chunks.length,
            sessionId,
            staleFiltered: !!(taskId),
            chunks,
        });
    });
    // ===================
    // GET /api/executor/logs/recent
    // Get recent logs (default: last 100)
    // ===================
    router.get('/logs/recent', (req, res) => {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const chunks = outputStream.getRecent(limit);
        res.json({
            count: chunks.length,
            chunks,
        });
    });
    // ===================
    // GET /api/executor/logs/task/:taskId
    // Get logs for a specific task
    // ===================
    router.get('/logs/task/:taskId', (req, res) => {
        const taskId = req.params.taskId;
        const taskCreatedAt = req.query.taskCreatedAt;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        // Use stale-filtered retrieval
        let chunks = outputStream.getByTaskIdFiltered(taskId, taskCreatedAt);
        if (limit > 0 && chunks.length > limit) {
            chunks = chunks.slice(-limit);
        }
        res.json({
            taskId,
            count: chunks.length,
            staleFiltered: true,
            chunks,
        });
    });
    // ===================
    // GET /api/executor/logs/stream
    // Real-time log streaming via Server-Sent Events (SSE)
    // ===================
    router.get('/logs/stream', (req, res) => {
        const taskId = req.query.taskId;
        const sinceSequence = req.query.since ? parseInt(req.query.since, 10) : undefined;
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        // Send initial connection message
        res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, timestamp: new Date().toISOString() })}\n\n`);
        // Send any missed chunks since the given sequence
        if (sinceSequence !== undefined && !isNaN(sinceSequence)) {
            const missedChunks = outputStream.getSince(sinceSequence);
            for (const chunk of missedChunks) {
                if (taskId && chunk.taskId !== taskId)
                    continue;
                res.write(`event: output\ndata: ${JSON.stringify(chunk)}\n\n`);
            }
        }
        // Create subscriber with stale filtering
        const currentSessionId = outputStream.getSessionId() ?? undefined;
        const subscriber = {
            onOutput(chunk) {
                // Filter by taskId if specified
                if (taskId && chunk.taskId !== taskId) {
                    return;
                }
                // Stale notification filter (fail-closed)
                if (taskId && (0, executor_output_stream_1.isStaleNotification)(chunk, {
                    currentTaskId: taskId,
                    currentSessionId,
                })) {
                    return;
                }
                // Send output chunk as SSE event
                res.write(`event: output\ndata: ${JSON.stringify(chunk)}\n\n`);
            },
        };
        // Subscribe
        const unsubscribe = outputStream.subscribe(subscriber);
        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
            res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
        }, 30000);
        // Clean up on connection close
        req.on('close', () => {
            unsubscribe();
            clearInterval(heartbeatInterval);
        });
    });
    // ===================
    // GET /api/executor/active
    // Get active task summary
    // ===================
    router.get('/active', (_req, res) => {
        const activeTasks = outputStream.getActiveTasks();
        res.json({
            count: activeTasks.length,
            tasks: activeTasks,
            subscriberCount: outputStream.getSubscriberCount(),
        });
    });
    // ===================
    // GET /api/executor/summary
    // Get executor log summary
    // ===================
    router.get('/summary', (_req, res) => {
        const allChunks = outputStream.getAll();
        const activeTasks = outputStream.getActiveTasks();
        // Count by stream type
        const streamCounts = {
            stdout: 0,
            stderr: 0,
            system: 0,
            error: 0,
        };
        for (const chunk of allChunks) {
            streamCounts[chunk.stream] = (streamCounts[chunk.stream] || 0) + 1;
        }
        // Get unique tasks
        const uniqueTasks = new Set(allChunks.map(c => c.taskId));
        // Time range
        const timestamps = allChunks.map(c => new Date(c.timestamp).getTime());
        const earliest = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null;
        const latest = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
        res.json({
            total: allChunks.length,
            byStream: streamCounts,
            uniqueTasks: uniqueTasks.size,
            activeTasks: activeTasks.length,
            timeRange: {
                earliest,
                latest,
            },
            subscriberCount: outputStream.getSubscriberCount(),
        });
    });
    // ===================
    // DELETE /api/executor/logs
    // Clear all logs (admin operation)
    // ===================
    router.delete('/logs', (_req, res) => {
        outputStream.clear();
        res.json({
            success: true,
            message: 'All executor logs cleared',
        });
    });
    // ===================
    // DELETE /api/executor/logs/task/:taskId
    // Clear logs for a specific task
    // ===================
    router.delete('/logs/task/:taskId', (req, res) => {
        const taskId = req.params.taskId;
        outputStream.clearTask(taskId);
        res.json({
            success: true,
            message: `Logs cleared for task: ${taskId}`,
        });
    });
    return router;
}
//# sourceMappingURL=executor-logs.js.map