#!/usr/bin/env node
/*
 * Demo Web Seed Script
 *
 * Creates demo project folders (gitignored) and seeds multiple chat prompts
 * so the Web UI shows projects + conversation/task history.
 *
 * Usage:
 *   PM_WEB_BASE_URL=http://localhost:5678 node scripts/demo-web-seed.js
 *
 * Optional:
 *   PM_DEMO_ROOT=/absolute/path/to/demo-projects
 *   PM_DEMO_WAIT_SECONDS=0|N   (if >0, waits N seconds and snapshots tasks)
 */

const fs = require('fs');
const path = require('path');

if (typeof fetch !== 'function') {
  console.error('This script requires Node 18+ (global fetch).');
  process.exit(1);
}

const baseUrl = (process.env.PM_WEB_BASE_URL || 'http://localhost:5678').replace(/\/$/, '');
const demoRoot = path.resolve(process.env.PM_DEMO_ROOT || path.join(__dirname, '..', 'demo-projects'));
const waitSeconds = Number(process.env.PM_DEMO_WAIT_SECONDS || '0');

const projects = [
  {
    slug: 'alpha-othello',
    alias: 'Demo: Othello Web',
    tags: ['demo', 'othello', 'web'],
    prompts: [
      'オセロのWebアプリを作ってください。ファイル名・保存先は未指定なので、必要なら確認してください。UIは8x8の盤面で、クリックで石を置けること。',
      'READMEを追加して、起動方法とルールを簡潔に書いてください。',
    ],
  },
  {
    slug: 'bravo-spec',
    alias: 'Demo: API Spec',
    tags: ['demo', 'spec', 'docs'],
    prompts: [
      'タスク管理APIの簡単な仕様書を作ってください。保存先が不明なら質問してください。',
      '上の仕様書に、エラーハンドリング方針（例: 4xx/5xx）を追記してください。',
    ],
  },
  {
    slug: 'charlie-cli',
    alias: 'Demo: CLI Design',
    tags: ['demo', 'cli', 'design'],
    prompts: [
      'シンプルなCLIツールの設計メモを書いてください。保存先が不明なら質問してください。',
      'CLIのコマンド一覧（案）と引数の説明を追記してください。',
    ],
  },
];

async function api(pathname, options = {}) {
  const url = baseUrl + pathname;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${options.method || 'GET'} ${url} failed: ${res.status} ${text}`);
  }
  return res.json();
}

function ensureProjectDir(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const readmePath = path.join(dir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# ${name}\n\nDemo project for PM Orchestrator Runner.\n`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[demo-seed] Base URL: ${baseUrl}`);
  console.log(`[demo-seed] Demo root: ${demoRoot}`);
  fs.mkdirSync(demoRoot, { recursive: true });

  // Health check
  try {
    await api('/api/health');
  } catch (error) {
    console.error(`[demo-seed] Health check failed: ${error.message}`);
    process.exit(1);
  }

  const report = {
    baseUrl,
    demoRoot,
    createdAt: new Date().toISOString(),
    projects: [],
  };

  for (const project of projects) {
    const projectPath = path.join(demoRoot, project.slug);
    ensureProjectDir(projectPath, project.alias);

    const created = await api('/api/projects', {
      method: 'POST',
      body: {
        projectPath,
        alias: project.alias,
        tags: project.tags,
      },
    });

    console.log(`[demo-seed] Created project: ${created.projectId} (${project.alias})`);

    const projectRecord = {
      projectId: created.projectId,
      alias: project.alias,
      projectPath,
      prompts: [],
    };

    for (const prompt of project.prompts) {
      const chatRes = await api(`/api/projects/${created.projectId}/chat`, {
        method: 'POST',
        body: { content: prompt },
      });

      projectRecord.prompts.push({
        content: prompt,
        runId: chatRes.runId,
        taskGroupId: chatRes.taskGroupId,
      });

      console.log(`[demo-seed]   queued prompt (runId=${chatRes.runId})`);
      await sleep(250);
    }

    report.projects.push(projectRecord);
  }

  if (waitSeconds > 0) {
    console.log(`[demo-seed] Waiting ${waitSeconds}s before snapshot...`);
    await sleep(waitSeconds * 1000);
    try {
      const groups = await api('/api/task-groups');
      report.taskGroups = groups.task_groups || [];
    } catch (error) {
      report.taskGroups = [];
      report.taskGroupsError = error.message;
    }
  }

  const reportPath = path.join(demoRoot, 'seed-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[demo-seed] Report written: ${reportPath}`);
  console.log('[demo-seed] Done. Refresh the Web UI to see new projects and chat history.');
}

main().catch((error) => {
  console.error(`[demo-seed] Failed: ${error.message}`);
  process.exit(1);
});
