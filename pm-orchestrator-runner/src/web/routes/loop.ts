/**
 * Self-Running Loop Routes - Plan, Dispatch, Verify APIs
 * Implements Inspect→Plan→Dispatch→Verify→Record cycle
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import {
  getNoDynamo,
  isNoDynamoInitialized,
  initNoDynamo,
  NoDynamoRun,
  InspectionPacket,
} from '../dal/no-dynamo';
import { TaskState, PlanStatus, PlanTask, LogLevel, TaskEventType } from '../dal/types';

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Generate dummy plan from inspection packet
 * In future, this will call LLM to generate real plan
 */
function generateDummyPlan(packet: InspectionPacket): Omit<PlanTask, 'taskId'>[] {
  const tasks: Omit<PlanTask, 'taskId'>[] = [];

  // Create analysis task
  tasks.push({
    description: 'Analyze codebase structure and identify key components',
    priority: 1,
    dependencies: [],
    status: 'CREATED' as TaskState,
  });

  // Create implementation tasks based on events count
  if (packet.events && packet.events.length > 0) {
    tasks.push({
      description: 'Review and process pending events',
      priority: 2,
      dependencies: [], // Will be filled with actual taskId after creation
      status: 'CREATED' as TaskState,
    });
  }

  // Create verification task
  tasks.push({
    description: 'Run quality gates and verify implementation',
    priority: 3,
    dependencies: [], // Will be filled with actual taskIds after creation
    status: 'CREATED' as TaskState,
  });

  return tasks;
}

/**
 * Run a command and capture output
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  onLog: (line: string, stream: 'stdout' | 'stderr') => void
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env },
    });

    let output = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          output += line + '\n';
          onLog(line, 'stdout');
        }
      });
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          output += line + '\n';
          onLog(line, 'stderr');
        }
      });
    });

    proc.on('close', (code) => {
      resolve({ exitCode: code ?? 1, output });
    });

    proc.on('error', (err) => {
      output += `Error: ${err.message}\n`;
      onLog(`Error: ${err.message}`, 'stderr');
      resolve({ exitCode: 1, output });
    });
  });
}

/**
 * Create loop routes
 */
export function createLoopRoutes(stateDir: string): Router {
  const router = Router();

  // Ensure NoDynamo is initialized
  if (!isNoDynamoInitialized()) {
    initNoDynamo(stateDir);
  }

  /**
   * POST /api/plan/:projectId
   * Generate a plan from the latest inspection packet
   */
  router.post('/plan/:projectId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const projectId = String(req.params.projectId);

      // Get project
      const project = await dal.getProjectIndex(projectId);
      if (!project) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Project not found',
        } as ErrorResponse);
        return;
      }

      // Get latest inspection packet for this project
      const packets = await dal.listInspectionPackets({ projectId, limit: 1 });
      if (packets.length === 0) {
        res.status(400).json({
          error: 'NO_INSPECTION',
          message: 'No inspection packet found. Run Inspect first.',
        } as ErrorResponse);
        return;
      }

      const packet = packets[0];

      // Generate plan tasks (dummy for now, LLM integration later)
      const taskInputs = generateDummyPlan(packet);

      // Create plan
      const plan = await dal.createPlan({
        orgId: 'default',
        projectId,
        packetId: packet.packetId,
        tasks: taskInputs.map(t => ({
          description: t.description,
          priority: t.priority,
          dependencies: t.dependencies,
        })),
      });

      // Record activity event
      await dal.recordEvent({
        type: 'PROGRESS' as TaskEventType,
        projectId,
        message: `Plan created with ${plan.tasks.length} tasks`,
        level: 'info' as LogLevel,
        payload: { planId: plan.planId, taskCount: plan.tasks.length },
      });

      res.status(201).json(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/plan/:planId
   * Get plan details
   */
  router.get('/plan/:planId', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const plan = await dal.getPlan(String(req.params.planId));

      if (!plan) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Plan not found',
        } as ErrorResponse);
        return;
      }

      res.json(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/plans
   * List plans for a project
   */
  router.get('/plans', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const projectId = req.query.projectId as string | undefined;
      const plans = await dal.listPlans(projectId);

      res.json({ plans });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/plan/:planId/dispatch
   * Dispatch plan tasks as parallel Runs
   */
  router.post('/plan/:planId/dispatch', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const plan = await dal.getPlan(String(req.params.planId));

      if (!plan) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Plan not found',
        } as ErrorResponse);
        return;
      }

      if (plan.status !== 'DRAFT') {
        res.status(400).json({
          error: 'INVALID_STATE',
          message: `Plan is already ${plan.status}`,
        } as ErrorResponse);
        return;
      }

      // Update plan status
      await dal.updatePlan(plan.planId, { status: 'DISPATCHING' });

      // Get or create session for this project
      const sessions = await dal.listSessions(plan.projectId);
      let sessionId: string;
      if (sessions.length === 0) {
        const session = await dal.createSession({
          orgId: 'default',
          projectPath: plan.projectId,
          projectId: plan.projectId,
        });
        sessionId = session.sessionId;
      } else {
        sessionId = sessions[0].sessionId;
      }

      // Create runs for each task (respect dependencies for ordering)
      const createdRuns: NoDynamoRun[] = [];
      const taskRunMap: Record<string, string> = {};

      // Sort tasks by priority
      const sortedTasks = [...plan.tasks].sort((a, b) => a.priority - b.priority);

      for (const task of sortedTasks) {
        const run = await dal.createRun({
          sessionId,
          projectId: plan.projectId,
          prompt: task.description,
          planId: plan.planId,
          planTaskId: task.taskId,
        });

        taskRunMap[task.taskId] = run.runId;
        createdRuns.push(run);

        // Update task with runId
        task.runId = run.runId;
        task.status = 'QUEUED';
      }

      // Update plan with task runIds and status
      await dal.updatePlan(plan.planId, {
        status: 'RUNNING',
        tasks: sortedTasks,
      });

      // Record activity
      await dal.recordEvent({
        type: 'PROGRESS' as TaskEventType,
        projectId: plan.projectId,
        message: `Dispatched ${createdRuns.length} runs from plan`,
        level: 'info' as LogLevel,
        payload: { planId: plan.planId, runIds: createdRuns.map(r => r.runId) },
      });

      // Start executing runs (simulate for now)
      // In production, this would trigger actual task execution
      for (const run of createdRuns) {
        await dal.updateRun(run.runId, { status: 'RUNNING' });

        // Add progress events
        await dal.recordEvent({
          runId: run.runId,
          projectId: plan.projectId,
          type: 'PROGRESS' as TaskEventType,
          message: `Started: ${run.prompt}`,
          level: 'info' as LogLevel,
        });

        // Simulate completion (in real implementation, actual task runs here)
        setTimeout(async () => {
          try {
            await dal.updateRun(run.runId, {
              status: 'COMPLETE',
              endedAt: new Date().toISOString(),
            });
            await dal.recordEvent({
              runId: run.runId,
              projectId: plan.projectId,
              type: 'COMPLETED' as TaskEventType,
              message: `Completed: ${run.prompt}`,
              level: 'info' as LogLevel,
            });
          } catch (_e) {
            // Ignore errors in async completion
          }
        }, 1000 + Math.random() * 2000);
      }

      res.json({
        plan: await dal.getPlan(plan.planId),
        runs: createdRuns,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/plan/:planId/verify
   * Run gate:all and store results
   */
  router.post('/plan/:planId/verify', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const plan = await dal.getPlan(String(req.params.planId));

      if (!plan) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Plan not found',
        } as ErrorResponse);
        return;
      }

      if (plan.status !== 'RUNNING' && plan.status !== 'DRAFT') {
        res.status(400).json({
          error: 'INVALID_STATE',
          message: `Plan must be RUNNING or DRAFT to verify, got ${plan.status}`,
        } as ErrorResponse);
        return;
      }

      // Update status to VERIFYING
      await dal.updatePlan(plan.planId, { status: 'VERIFYING' });

      // Get or create session
      const sessions = await dal.listSessions(plan.projectId);
      let sessionId: string;
      if (sessions.length === 0) {
        const session = await dal.createSession({
          orgId: 'default',
          projectPath: plan.projectId,
          projectId: plan.projectId,
        });
        sessionId = session.sessionId;
      } else {
        sessionId = sessions[0].sessionId;
      }

      // Create verify run
      const verifyRun = await dal.createRun({
        sessionId,
        projectId: plan.projectId,
        prompt: 'gate:all verification',
        planId: plan.planId,
      });

      await dal.updatePlan(plan.planId, { verifyRunId: verifyRun.runId });
      await dal.updateRun(verifyRun.runId, { status: 'RUNNING' });

      // Record start event
      await dal.recordEvent({
        runId: verifyRun.runId,
        projectId: plan.projectId,
        type: 'PROGRESS' as TaskEventType,
        message: 'Starting gate:all verification',
        level: 'info' as LogLevel,
      });

      // Find project root (use cwd for now)
      const projectRoot = process.cwd();

      // Execute gate:all
      const checks: Array<{ name: string; passed: boolean; message: string }> = [];
      let allPassed = true;

      const { exitCode } = await runCommand(
        'npm',
        ['run', 'gate:all'],
        projectRoot,
        async (line, stream) => {
          // Record log event
          const logLevel: LogLevel = stream === 'stderr' ? 'warn' : 'info';
          await dal.recordEvent({
            runId: verifyRun.runId,
            projectId: plan.projectId,
            type: 'LOG_BATCH' as TaskEventType,
            message: line,
            level: logLevel,
          });

          // Parse PASS/FAIL from output
          const passMatch = line.match(/\[PASS\]\s+(.+)/);
          const failMatch = line.match(/\[FAIL\]\s+(.+)/);

          if (passMatch) {
            checks.push({ name: passMatch[1], passed: true, message: 'Passed' });
          } else if (failMatch) {
            checks.push({ name: failMatch[1], passed: false, message: 'Failed' });
            allPassed = false;
          }
        }
      );

      // If exit code is non-zero, mark as failed
      if (exitCode !== 0) {
        allPassed = false;
      }

      // Update plan with results
      const finalStatus: PlanStatus = allPassed ? 'VERIFIED' : 'FAILED';
      await dal.updatePlan(plan.planId, {
        status: finalStatus,
        gateResult: { passed: allPassed, checks },
      });

      // Update verify run
      await dal.updateRun(verifyRun.runId, {
        status: allPassed ? 'COMPLETE' : 'ERROR',
        endedAt: new Date().toISOString(),
        summary: allPassed ? 'All gates passed' : 'Some gates failed',
      });

      // Record completion event
      const completionLevel: LogLevel = allPassed ? 'info' : 'error';
      const completionType: TaskEventType = allPassed ? 'COMPLETED' : 'ERROR';
      await dal.recordEvent({
        runId: verifyRun.runId,
        projectId: plan.projectId,
        type: completionType,
        message: allPassed ? 'gate:all passed' : 'gate:all failed',
        level: completionLevel,
        payload: { exitCode, checkCount: checks.length, passedCount: checks.filter(c => c.passed).length },
      });

      // Record activity
      await dal.recordEvent({
        type: 'PROGRESS' as TaskEventType,
        projectId: plan.projectId,
        message: `Verification ${allPassed ? 'passed' : 'failed'}: ${checks.filter(c => c.passed).length}/${checks.length} checks`,
        level: completionLevel,
        payload: { planId: plan.planId, passed: allPassed },
      });

      res.json({
        plan: await dal.getPlan(plan.planId),
        verifyRun: await dal.getRun(verifyRun.runId),
        gateResult: { passed: allPassed, checks },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * GET /api/needs-response
   * Get all runs in AWAITING_RESPONSE state
   */
  router.get('/needs-response', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const projectId = req.query.projectId as string | undefined;

      // Get all runs and filter by AWAITING_RESPONSE
      const runs = await dal.listRuns();
      const needsResponse = runs.filter(r =>
        r.status === 'AWAITING_RESPONSE' &&
        (!projectId || r.projectId === projectId)
      );

      res.json({
        count: needsResponse.length,
        runs: needsResponse,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/runs/:runId/respond
   * Respond to a run in AWAITING_RESPONSE state
   */
  router.post('/runs/:runId/respond', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const run = await dal.getRun(String(req.params.runId));

      if (!run) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Run not found',
        } as ErrorResponse);
        return;
      }

      if (run.status !== 'AWAITING_RESPONSE') {
        res.status(400).json({
          error: 'INVALID_STATE',
          message: `Run is not awaiting response, current state: ${run.status}`,
        } as ErrorResponse);
        return;
      }

      const { response } = req.body;
      if (!response || typeof response !== 'string') {
        res.status(400).json({
          error: 'INVALID_INPUT',
          message: 'response is required',
        } as ErrorResponse);
        return;
      }

      // Record response event
      await dal.recordEvent({
        runId: run.runId,
        projectId: run.projectId,
        type: 'RESPONSE_RECEIVED' as TaskEventType,
        message: `User response: ${response.substring(0, 100)}${response.length > 100 ? '...' : ''}`,
        level: 'info' as LogLevel,
        payload: { response },
      });

      // Update run status back to RUNNING
      const updatedRun = await dal.updateRun(run.runId, { status: 'RUNNING' });

      // Record activity
      await dal.recordEvent({
        type: 'PROGRESS' as TaskEventType,
        projectId: run.projectId,
        message: `Response provided for run ${run.runId}`,
        level: 'info' as LogLevel,
        payload: { runId: run.runId },
      });

      res.json(updatedRun);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  /**
   * POST /api/runs/:runId/set-awaiting
   * Set a run to AWAITING_RESPONSE state (for testing/simulation)
   */
  router.post('/runs/:runId/set-awaiting', async (req: Request, res: Response) => {
    try {
      const dal = getNoDynamo();
      const run = await dal.getRun(String(req.params.runId));

      if (!run) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Run not found',
        } as ErrorResponse);
        return;
      }

      const { question } = req.body;

      // Update run status
      const updatedRun = await dal.updateRun(run.runId, { status: 'AWAITING_RESPONSE' });

      // Record event
      await dal.recordEvent({
        runId: run.runId,
        projectId: run.projectId,
        type: 'AWAITING_RESPONSE' as TaskEventType,
        message: question || 'Awaiting user response',
        level: 'warn' as LogLevel,
        payload: { question },
      });

      // Record activity
      await dal.recordEvent({
        type: 'PROGRESS' as TaskEventType,
        projectId: run.projectId,
        message: `Run ${run.runId} needs response: ${question || 'Input required'}`,
        level: 'warn' as LogLevel,
        payload: { runId: run.runId, question },
      });

      res.json(updatedRun);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message } as ErrorResponse);
    }
  });

  return router;
}
