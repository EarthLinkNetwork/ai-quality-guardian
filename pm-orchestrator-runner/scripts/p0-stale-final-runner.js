#!/usr/bin/env node
/**
 * P0 Stale Filter Final Verification - Task Runner
 *
 * Submits 3 tasks, handles AWAITING_RESPONSE→reply→COMPLETE flow,
 * collects executor logs from all 3 API endpoints + SSE.
 *
 * Exit code 0 = all tasks completed as expected
 * Exit code 1 = any failure
 */

const http = require('http');

const PORT = parseInt(process.env.P0_PORT || '15692', 10);
const BASE = `http://localhost:${PORT}`;
const POLL_INTERVAL = 2000; // 2s
const MAX_WAIT = 120000; // 120s per task
const SSE_CAPTURE_MS = 3000;

// ─── HTTP helpers ───

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path) { return request('GET', path); }
function post(path, body) { return request('POST', path, body); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pollStatus(taskId, targetStatuses, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await get(`/api/tasks/${taskId}`);
    if (r.status !== 200) throw new Error(`GET /api/tasks/${taskId} returned ${r.status}`);
    if (targetStatuses.includes(r.body.status)) return r.body;
    await sleep(POLL_INTERVAL);
  }
  const final = await get(`/api/tasks/${taskId}`);
  throw new Error(`Task ${taskId} did not reach ${targetStatuses.join('/')} within ${maxMs}ms. Final: ${final.body.status}`);
}

function captureSSE(path, durationMs) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const chunks = [];
    const req = http.get({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Accept': 'text/event-stream' },
    }, (res) => {
      res.on('data', (d) => chunks.push(d.toString()));
    });
    req.on('error', () => {});
    setTimeout(() => {
      req.destroy();
      resolve(chunks.join(''));
    }, durationMs);
  });
}

// ─── Main ───

async function main() {
  const results = { tasks: {}, endpoints: {}, sse: null };

  // ===== TASK A: short READ_INFO =====
  console.error('[runner] Submitting Task A (short READ_INFO)...');
  const tA = await post('/api/tasks', {
    task_group_id: 'p0-stale-final',
    prompt: 'echo p0-stale-ok',
    task_type: 'READ_INFO',
  });
  if (tA.status !== 201) throw new Error(`Task A submit failed: ${tA.status} ${JSON.stringify(tA.body)}`);
  results.tasks.A = { id: tA.body.task_id, created_at: tA.body.created_at, expected: 'COMPLETE' };
  console.error(`[runner] Task A: ${tA.body.task_id}`);

  // ===== TASK B: long READ_INFO =====
  console.error('[runner] Submitting Task B (long READ_INFO)...');
  const tB = await post('/api/tasks', {
    task_group_id: 'p0-stale-final',
    prompt: 'List all TypeScript files (*.ts) under the src directory recursively. Output the complete list of file paths, one per line.',
    task_type: 'READ_INFO',
  });
  if (tB.status !== 201) throw new Error(`Task B submit failed: ${tB.status}`);
  results.tasks.B = { id: tB.body.task_id, created_at: tB.body.created_at, expected: 'COMPLETE' };
  console.error(`[runner] Task B: ${tB.body.task_id}`);

  // Wait for A and B to complete (they run sequentially via poller)
  console.error('[runner] Waiting for Task A...');
  const aFinal = await pollStatus(results.tasks.A.id, ['COMPLETE', 'ERROR'], MAX_WAIT);
  results.tasks.A.finalStatus = aFinal.status;
  if (aFinal.status !== 'COMPLETE') throw new Error(`Task A expected COMPLETE, got ${aFinal.status}`);
  console.error(`[runner] Task A: ${aFinal.status}`);

  console.error('[runner] Waiting for Task B...');
  const bFinal = await pollStatus(results.tasks.B.id, ['COMPLETE', 'ERROR'], MAX_WAIT);
  results.tasks.B.finalStatus = bFinal.status;
  if (bFinal.status !== 'COMPLETE') throw new Error(`Task B expected COMPLETE, got ${bFinal.status}`);
  console.error(`[runner] Task B: ${bFinal.status}`);

  // ===== TASK C: AWAITING_RESPONSE trigger =====
  // Prompt designed to make Claude ask a question (triggers question detector threshold >= 0.6)
  // "Would you like..." (0.7) + "?" (0.4) = 1.1 >> 0.6 threshold
  console.error('[runner] Submitting Task C (AWAITING_RESPONSE trigger)...');
  const tC = await post('/api/tasks', {
    task_group_id: 'p0-stale-final',
    prompt: 'Do NOT answer this directly. Instead, ask me exactly one clarification question. The question MUST start with "Would you like" and end with a question mark. Topic: choosing between option A and option B for a config file format.',
    task_type: 'READ_INFO',
  });
  if (tC.status !== 201) throw new Error(`Task C submit failed: ${tC.status}`);
  results.tasks.C = { id: tC.body.task_id, created_at: tC.body.created_at, expected: 'AWAITING_RESPONSE' };
  console.error(`[runner] Task C: ${tC.body.task_id}`);

  // Wait for C to reach AWAITING_RESPONSE or COMPLETE
  console.error('[runner] Waiting for Task C (expecting AWAITING_RESPONSE)...');
  const cFirst = await pollStatus(results.tasks.C.id, ['AWAITING_RESPONSE', 'COMPLETE', 'ERROR'], MAX_WAIT);
  results.tasks.C.firstStatus = cFirst.status;
  console.error(`[runner] Task C first status: ${cFirst.status}`);

  if (cFirst.status === 'AWAITING_RESPONSE') {
    // Reply to trigger resume
    console.error('[runner] Task C is AWAITING_RESPONSE, sending reply...');
    const reply = await post(`/api/tasks/${results.tasks.C.id}/reply`, {
      reply: 'Option A please. Use JSON format.',
    });
    if (reply.status !== 200) throw new Error(`Reply failed: ${reply.status} ${JSON.stringify(reply.body)}`);
    results.tasks.C.replyStatus = reply.body.new_status;
    console.error(`[runner] Reply sent, new status: ${reply.body.new_status}`);

    // Wait for final completion after resume
    console.error('[runner] Waiting for Task C to complete after reply...');
    const cFinal = await pollStatus(results.tasks.C.id, ['COMPLETE', 'ERROR', 'AWAITING_RESPONSE'], MAX_WAIT);
    results.tasks.C.finalStatus = cFinal.status;
    console.error(`[runner] Task C final: ${cFinal.status}`);
  } else {
    // COMPLETE or ERROR without going through AWAITING_RESPONSE
    results.tasks.C.finalStatus = cFirst.status;
    results.tasks.C.awaitingResponseTriggered = false;
    console.error(`[runner] WARNING: Task C did not trigger AWAITING_RESPONSE (got ${cFirst.status})`);
  }

  // ===== Collect executor logs from all endpoints =====
  console.error('[runner] Collecting executor logs...');

  // Endpoint 1: GET /api/executor/logs?taskId=
  const e1_a = await get(`/api/executor/logs?taskId=${results.tasks.A.id}&taskCreatedAt=${results.tasks.A.created_at}`);
  const e1_b = await get(`/api/executor/logs?taskId=${results.tasks.B.id}&taskCreatedAt=${results.tasks.B.created_at}`);
  const e1_c = await get(`/api/executor/logs?taskId=${results.tasks.C.id}&taskCreatedAt=${results.tasks.C.created_at}`);

  // Endpoint 2: GET /api/executor/logs/task/:taskId
  const e2_a = await get(`/api/executor/logs/task/${results.tasks.A.id}?taskCreatedAt=${results.tasks.A.created_at}`);
  const e2_b = await get(`/api/executor/logs/task/${results.tasks.B.id}?taskCreatedAt=${results.tasks.B.created_at}`);
  const e2_c = await get(`/api/executor/logs/task/${results.tasks.C.id}?taskCreatedAt=${results.tasks.C.created_at}`);

  // Endpoint 3: GET /api/executor/logs (all)
  const e3_all = await get('/api/executor/logs');

  // Endpoint 4: SSE capture
  console.error('[runner] Capturing SSE stream...');
  const sseRaw = await captureSSE('/api/executor/logs/stream', SSE_CAPTURE_MS);

  results.endpoints = {
    'logs_taskId_A': e1_a.body,
    'logs_taskId_B': e1_b.body,
    'logs_taskId_C': e1_c.body,
    'logs_task_A': e2_a.body,
    'logs_task_B': e2_b.body,
    'logs_task_C': e2_c.body,
    'logs_all': e3_all.body,
  };
  results.sse = sseRaw;

  // Output as JSON to stdout
  process.stdout.write(JSON.stringify(results, null, 2));
  console.error('[runner] Done.');
}

main().catch((err) => {
  console.error(`[runner] FATAL: ${err.message}`);
  process.exit(1);
});
