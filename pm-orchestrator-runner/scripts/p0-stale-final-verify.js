#!/usr/bin/env node
/**
 * P0 Stale Filter Final Verification - Verify & Report
 *
 * Reads runner output from stdin, validates all stale filter conditions,
 * saves evidence to /tmp/p0-stale-final.json, prints fixed-format report.
 *
 * Exit code 0 = PASS
 * Exit code 1 = FAIL
 */

const fs = require('fs');

const STALE_TERMS = [
  'previous session',
  'cleaned up',
  'stale output',
  'background task finished earlier',
];

const EVIDENCE_PATH = '/tmp/p0-stale-final.json';

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(raw);
      verify(data);
    } catch (e) {
      console.error(`[verify] FATAL: Failed to parse runner output: ${e.message}`);
      printReport('FAIL', [{ code: 'PARSE_ERROR', detail: e.message }], 0, 0, 0);
      process.exit(1);
    }
  });
}

function verify(data) {
  const violations = [];
  let totalChunks = 0;
  let staleFilteredCount = 0;
  const allSessions = new Set();

  // Validate tasks
  const tasks = data.tasks || {};
  const taskIds = {};
  for (const [label, t] of Object.entries(tasks)) {
    taskIds[label] = t.id;
    if (label === 'A' && t.finalStatus !== 'COMPLETE') {
      violations.push({ code: 'TASK_STATUS', detail: `Task A expected COMPLETE, got ${t.finalStatus}` });
    }
    if (label === 'B' && t.finalStatus !== 'COMPLETE') {
      violations.push({ code: 'TASK_STATUS', detail: `Task B expected COMPLETE, got ${t.finalStatus}` });
    }
    if (label === 'C') {
      if (t.firstStatus !== 'AWAITING_RESPONSE' && t.awaitingResponseTriggered === false) {
        violations.push({ code: 'AWAITING_RESPONSE', detail: `Task C never reached AWAITING_RESPONSE (first: ${t.firstStatus})` });
      }
    }
  }

  // Validate each endpoint response
  const endpoints = data.endpoints || {};
  for (const [epName, epData] of Object.entries(endpoints)) {
    if (!epData || typeof epData !== 'object') {
      violations.push({ code: 'ENDPOINT_ERROR', detail: `${epName}: no data` });
      continue;
    }

    const chunks = epData.chunks || [];
    totalChunks += chunks.length;

    if (epData.staleFiltered) {
      staleFilteredCount++;
    }

    const sessionId = epData.sessionId;
    if (sessionId) allSessions.add(sessionId);

    for (const chunk of chunks) {
      // Check sessionId present
      const csid = chunk.sessionId;
      if (csid) {
        allSessions.add(csid);
      }
      if (!csid) {
        violations.push({ code: 'MISSING_SESSION', detail: `${epName}: seq=${chunk.sequence} missing sessionId` });
      }

      // Check session mismatch within endpoint
      if (sessionId && csid && csid !== sessionId) {
        violations.push({ code: 'SESSION_MISMATCH', detail: `${epName}: seq=${chunk.sequence} chunk.sessionId=${csid} != endpoint.sessionId=${sessionId}` });
      }

      // Check taskId consistency for task-specific endpoints
      if (epName.includes('_A') && chunk.taskId !== taskIds.A) {
        violations.push({ code: 'TASKID_MISMATCH', detail: `${epName}: seq=${chunk.sequence} taskId=${chunk.taskId} != ${taskIds.A}` });
      }
      if (epName.includes('_B') && chunk.taskId !== taskIds.B) {
        violations.push({ code: 'TASKID_MISMATCH', detail: `${epName}: seq=${chunk.sequence} taskId=${chunk.taskId} != ${taskIds.B}` });
      }
      if (epName.includes('_C') && chunk.taskId !== taskIds.C) {
        violations.push({ code: 'TASKID_MISMATCH', detail: `${epName}: seq=${chunk.sequence} taskId=${chunk.taskId} != ${taskIds.C}` });
      }

      // Check timestamp vs task created_at for task-specific endpoints
      for (const [label, t] of Object.entries(tasks)) {
        if (epName.includes(`_${label}`) && chunk.timestamp < t.created_at) {
          violations.push({ code: 'TIMESTAMP_STALE', detail: `${epName}: seq=${chunk.sequence} timestamp=${chunk.timestamp} < created_at=${t.created_at}` });
        }
      }

      // Check stale text patterns
      const textLower = (chunk.text || '').toLowerCase();
      for (const term of STALE_TERMS) {
        if (textLower.includes(term)) {
          violations.push({ code: 'STALE_TEXT', detail: `${epName}: seq=${chunk.sequence} contains "${term}"` });
        }
      }
    }
  }

  // Check SSE for stale content
  const sseRaw = data.sse || '';
  for (const term of STALE_TERMS) {
    if (sseRaw.toLowerCase().includes(term)) {
      violations.push({ code: 'SSE_STALE', detail: `SSE stream contains "${term}"` });
    }
  }

  // Multi-session detection
  if (allSessions.size > 1) {
    violations.push({ code: 'MULTI_SESSION', detail: `Multiple sessions detected: ${[...allSessions].join(', ')}` });
  }

  // staleFiltered must be present on task-specific endpoints (6 of them)
  if (staleFilteredCount < 6) {
    violations.push({ code: 'STALE_FILTER_MISSING', detail: `staleFiltered present on ${staleFilteredCount}/6 task-specific endpoints` });
  }

  const verdict = violations.length === 0 ? 'PASS' : 'FAIL';
  const sessionCount = allSessions.size;

  // Save evidence
  const evidence = {
    namespace: 'p0-stale-final',
    sessionId: allSessions.size === 1 ? [...allSessions][0] : [...allSessions],
    tasks: Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, { id: v.id, status: v.finalStatus, firstStatus: v.firstStatus }])),
    totalChunks,
    staleFiltered: staleFilteredCount,
    sessionCount,
    violations: violations.map(v => `${v.code}: ${v.detail}`),
    verdict,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));

  printReport(verdict, violations, sessionCount, staleFilteredCount, totalChunks);
  process.exit(verdict === 'PASS' ? 0 : 1);
}

function printReport(verdict, violations, sessionCount, staleFiltered, totalChunks) {
  console.log('');
  console.log('P0 STALE FINAL REPORT');
  console.log(`verdict: ${verdict}`);
  console.log(`violations: ${violations.length}`);
  console.log(`sessionCount: ${sessionCount}`);
  console.log(`staleFiltered: ${staleFiltered}`);
  console.log(`totalChunks: ${totalChunks}`);
  console.log(`evidencePath: ${EVIDENCE_PATH}`);

  if (violations.length > 0) {
    console.log('');
    for (const v of violations) {
      console.log(`  [FAIL] ${v.code || v}: ${v.detail || ''}`);
    }
  }
}

main();
