"use strict";
/**
 * Supervisor Logs Routes
 *
 * AC A.1: Supervisor Log: TaskType判定、write許可、ガード判定、再試行/再開理由、採用したテンプレ
 *
 * Provides API endpoints for:
 * - Retrieving supervisor decision logs
 * - Real-time streaming via SSE
 * - Filtering by task, category, or time range
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupervisorLogsRoutes = createSupervisorLogsRoutes;
const express_1 = require("express");
const supervisor_logger_1 = require("../../supervisor/supervisor-logger");
/**
 * Creates router for supervisor log endpoints
 *
 * @returns Express router
 */
function createSupervisorLogsRoutes() {
    const router = (0, express_1.Router)();
    const logger = (0, supervisor_logger_1.getSupervisorLogger)();
    // ===================
    // GET /api/supervisor/logs
    // Get all logs with optional filtering
    // ===================
    router.get('/logs', (req, res) => {
        const { taskId, category, since, limit, } = req.query;
        let logs;
        // Apply filters
        if (taskId && typeof taskId === 'string') {
            logs = logger.getByTaskId(taskId);
        }
        else if (category && typeof category === 'string') {
            logs = logger.getByCategory(category);
        }
        else if (since && typeof since === 'string') {
            logs = logger.getSince(since);
        }
        else {
            logs = logger.getAll();
        }
        // Apply limit
        const limitNum = limit ? parseInt(limit, 10) : 100;
        if (limitNum > 0 && logs.length > limitNum) {
            logs = logs.slice(-limitNum);
        }
        res.json({
            count: logs.length,
            logs,
        });
    });
    // ===================
    // GET /api/supervisor/logs/recent
    // Get recent logs (default: last 50)
    // ===================
    router.get('/logs/recent', (req, res) => {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const logs = logger.getRecent(limit);
        res.json({
            count: logs.length,
            logs,
        });
    });
    // ===================
    // GET /api/supervisor/logs/task/:taskId
    // Get logs for a specific task
    // ===================
    router.get('/logs/task/:taskId', (req, res) => {
        const taskId = req.params.taskId;
        const logs = logger.getByTaskId(taskId);
        res.json({
            taskId,
            count: logs.length,
            logs,
        });
    });
    // ===================
    // GET /api/supervisor/logs/stream
    // Real-time log streaming via Server-Sent Events (SSE)
    // ===================
    router.get('/logs/stream', (req, res) => {
        const taskId = req.query.taskId;
        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        // Send initial connection message
        res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, timestamp: new Date().toISOString() })}\n\n`);
        // Create subscriber
        const subscriber = {
            onLog(entry) {
                // Filter by taskId if specified
                if (taskId && entry.taskId !== taskId) {
                    return;
                }
                // Send log entry as SSE event
                res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
            },
        };
        // Subscribe
        const unsubscribe = logger.subscribe(subscriber);
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
    // GET /api/supervisor/logs/categories
    // Get available log categories with counts
    // ===================
    router.get('/logs/categories', (_req, res) => {
        const categories = [
            'TASK_TYPE_DETECTION',
            'WRITE_PERMISSION',
            'GUARD_DECISION',
            'RETRY_RESUME',
            'TEMPLATE_SELECTION',
            'EXECUTION_START',
            'EXECUTION_END',
            'VALIDATION',
            'ERROR',
        ];
        const categoryCounts = {};
        for (const category of categories) {
            categoryCounts[category] = logger.getByCategory(category).length;
        }
        res.json({
            categories,
            counts: categoryCounts,
            total: logger.getAll().length,
        });
    });
    // ===================
    // DELETE /api/supervisor/logs
    // Clear all logs (admin operation)
    // ===================
    router.delete('/logs', (_req, res) => {
        logger.clear();
        res.json({
            success: true,
            message: 'All supervisor logs cleared',
        });
    });
    // ===================
    // GET /api/supervisor/logs/summary
    // Get summary statistics for logs
    // ===================
    router.get('/logs/summary', (_req, res) => {
        const logs = logger.getAll();
        // Count by level
        const levelCounts = {
            info: 0,
            warn: 0,
            error: 0,
            debug: 0,
        };
        for (const log of logs) {
            levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
        }
        // Count by category
        const categoryCounts = {};
        for (const log of logs) {
            categoryCounts[log.category] = (categoryCounts[log.category] || 0) + 1;
        }
        // Get time range
        const timestamps = logs.map(l => new Date(l.timestamp).getTime());
        const earliest = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null;
        const latest = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;
        // Count unique tasks
        const uniqueTasks = new Set(logs.map(l => l.taskId).filter(Boolean));
        res.json({
            total: logs.length,
            byLevel: levelCounts,
            byCategory: categoryCounts,
            uniqueTasks: uniqueTasks.size,
            timeRange: {
                earliest,
                latest,
            },
            subscriberCount: logger.getSubscriberCount(),
        });
    });
    return router;
}
//# sourceMappingURL=supervisor-logs.js.map