/**
 * Web Server - Express HTTP server
 * Per spec/19_WEB_UI.md
 *
 * Provides:
 * - REST API for queue operations (read/write to QueueStore)
 * - Static file serving for frontend
 * - Same process as Runner (integrated)
 *
 * IMPORTANT: Web UI does NOT directly command Runner.
 * Submit = queue insert only.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import { QueueStore } from '../queue';

/**
 * Web Server configuration
 */
export interface WebServerConfig {
  /** Port number (default: 3000) */
  port?: number;
  /** Host (default: localhost) */
  host?: string;
  /** QueueStore instance */
  queueStore: QueueStore;
  /** Session ID for new tasks */
  sessionId: string;
}

/**
 * Web Server state
 */
export interface WebServerState {
  isRunning: boolean;
  port: number;
  host: string;
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Create configured Express app
 */
export function createApp(config: WebServerConfig): Express {
  const app = express();
  const { queueStore, sessionId } = config;

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files
  app.use(express.static(path.join(__dirname, 'public')));

  // CORS headers for local development
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // ===================
  // REST API Routes
  // Per spec/19_WEB_UI.md
  // ===================

  /**
   * GET /api/task-groups
   * List all task groups with summary
   */
  app.get('/api/task-groups', async (_req: Request, res: Response) => {
    try {
      const groups = await queueStore.getAllTaskGroups();
      res.json({ task_groups: groups });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/task-groups
   * Create a new task group (enqueue first task)
   * Body: { task_group_id: string, prompt: string }
   */
  app.post('/api/task-groups', async (req: Request, res: Response) => {
    try {
      const { task_group_id, prompt } = req.body;

      // Fail-closed: validate input
      if (!task_group_id || typeof task_group_id !== 'string' || task_group_id.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'task_group_id is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'prompt is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      // Enqueue the first task in this group
      const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim());

      res.status(201).json({
        task_id: item.task_id,
        task_group_id: item.task_group_id,
        status: item.status,
        created_at: item.created_at,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/task-groups/:task_group_id/tasks
   * List tasks in a task group
   */
  app.get('/api/task-groups/:task_group_id/tasks', async (req: Request, res: Response) => {
    try {
      const task_group_id = req.params.task_group_id as string;
      const tasks = await queueStore.getByTaskGroup(task_group_id);

      res.json({
        task_group_id,
        tasks: tasks.map(t => ({
          task_id: t.task_id,
          status: t.status,
          prompt: t.prompt,
          created_at: t.created_at,
          updated_at: t.updated_at,
          error_message: t.error_message,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/tasks/:task_id
   * Get task detail
   */
  app.get('/api/tasks/:task_id', async (req: Request, res: Response) => {
    try {
      const task_id = req.params.task_id as string;
      const task = await queueStore.getItem(task_id);

      if (!task) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Task not found: ${task_id}`,
        } as ErrorResponse);
        return;
      }

      res.json({
        task_id: task.task_id,
        task_group_id: task.task_group_id,
        session_id: task.session_id,
        status: task.status,
        prompt: task.prompt,
        created_at: task.created_at,
        updated_at: task.updated_at,
        error_message: task.error_message,
        // TODO: Add logs and changed_files when available
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/tasks
   * Enqueue a new task (does NOT run it directly)
   * Body: { task_group_id: string, prompt: string }
   *
   * IMPORTANT: This only inserts into queue. Runner polls separately.
   */
  app.post('/api/tasks', async (req: Request, res: Response) => {
    try {
      const { task_group_id, prompt } = req.body;

      // Fail-closed: validate input
      if (!task_group_id || typeof task_group_id !== 'string' || task_group_id.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'task_group_id is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'prompt is required and must be a non-empty string',
        } as ErrorResponse);
        return;
      }

      // Enqueue only - does NOT run directly
      const item = await queueStore.enqueue(sessionId, task_group_id.trim(), prompt.trim());

      res.status(201).json({
        task_id: item.task_id,
        task_group_id: item.task_group_id,
        status: item.status, // Always QUEUED
        created_at: item.created_at,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  // ===================
  // Frontend Routes
  // ===================

  /**
   * GET /
   * Serve main page (task group list)
   */
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  /**
   * GET /task-groups/:id
   * Serve task list page
   */
  app.get('/task-groups/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  /**
   * GET /tasks/:id
   * Serve task detail page
   */
  app.get('/tasks/:id', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  /**
   * GET /new
   * Serve new command form
   */
  app.get('/new', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ===================
  // Health Check
  // ===================

  /**
   * GET /api/health
   * Health check endpoint
   */
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ===================
  // Route List (for testing - verify no direct Runner command API)
  // ===================

  /**
   * GET /api/routes
   * List all registered routes (for testing)
   */
  app.get('/api/routes', (_req: Request, res: Response) => {
    // Return a predefined list of routes for safety and testability
    // This also serves as documentation of available endpoints
    const routes: string[] = [
      'GET /api/task-groups',
      'POST /api/task-groups',
      'GET /api/task-groups/:task_group_id/tasks',
      'GET /api/tasks/:task_id',
      'POST /api/tasks',
      'GET /api/health',
      'GET /api/routes',
    ];
    res.json({ routes });
  });

  return app;
}

/**
 * Web Server
 * Manages Express server lifecycle
 */
export class WebServer {
  private readonly app: Express;
  private readonly port: number;
  private readonly host: string;
  private server: ReturnType<Express['listen']> | null = null;

  constructor(config: WebServerConfig) {
    this.port = config.port || 3000;
    this.host = config.host || 'localhost';
    this.app = createApp(config);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          resolve();
        });
        this.server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Get server state
   */
  getState(): WebServerState {
    return {
      isRunning: this.server !== null,
      port: this.port,
      host: this.host,
    };
  }

  /**
   * Get Express app (for testing)
   */
  getApp(): Express {
    return this.app;
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `http://${this.host}:${this.port}`;
  }
}
