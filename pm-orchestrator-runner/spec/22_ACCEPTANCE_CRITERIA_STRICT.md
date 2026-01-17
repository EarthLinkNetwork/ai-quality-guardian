# 22_ACCEPTANCE_CRITERIA_STRICT.md

# 受入基準（STRICT）

本章は pm-orchestrator-runner の完了を判定する受入基準を定義する。

以下をすべて満たした場合のみ「完了」とする。

**各基準には検証コマンド/手順を明記する。自動テストで検証可能な形式とする。**


## 受入基準一覧

| # | 基準 | 検証方法 |
|---|------|----------|
| 1 | API Key 未設定でも起動する | 自動テスト |
| 2 | env から API Key が漏れない | 自動テスト |
| 3 | CLI 入力中にログ割り込みがない | 自動テスト + 手動確認 |
| 4 | Task Group で文脈が維持される | 自動テスト |
| 5 | Task 完了後も会話が継続できる | 自動テスト |
| 6 | Web UI から命令投入可能 | E2E テスト |
| 7 | Runner 再起動後も状態復元 | 自動テスト |
| 8 | stable が dev を開発できる | 統合テスト |


## AC-1: API Key 未設定でも起動する

### 要件

- OPENAI_API_KEY 環境変数がなくても Runner は起動する
- ANTHROPIC_API_KEY 環境変数がなくても Runner は起動する
- Claude Code CLI のログイン状態のみで動作する

### 検証コマンド

```bash
# テスト: API Key なしで起動できること
unset OPENAI_API_KEY
unset ANTHROPIC_API_KEY
pm-orchestrator repl --project-mode cwd <<EOF
/help
/exit
EOF

# 期待結果: 終了コード 0、エラーなし
echo "Exit code: $?"
# 期待: Exit code: 0
```

### 自動テスト

```typescript
// tests/acceptance/ac-1-api-key.test.ts
describe('AC-1: API Key 未設定でも起動する', () => {
  it('OPENAI_API_KEY なしで起動できる', async () => {
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.ANTHROPIC_API_KEY;

    const result = await spawn('pm-orchestrator', ['repl', '--project-mode', 'temp'], {
      env,
      input: '/help\n/exit\n'
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('API key required');
  });
});
```


## AC-2: env から API Key が漏れない

### 要件

- child_process に process.env をそのまま渡していない
- ALLOWLIST 以外の環境変数が Executor に渡っていない

### 検証コマンド

```bash
# テスト: 子プロセスの env をダンプ
OPENAI_API_KEY="test-secret-key" \
pm-orchestrator repl --project-mode temp <<EOF
"環境変数をダンプしてください"
/exit
EOF

# 期待結果: "test-secret-key" が出力に含まれない
```

### 自動テスト

```typescript
// tests/acceptance/ac-2-env-leak.test.ts
describe('AC-2: env から API Key が漏れない', () => {
  it('OPENAI_API_KEY が子プロセスに渡らない', async () => {
    const testKey = 'sk-test-secret-12345';
    const env = { ...buildSanitizedEnv(), OPENAI_API_KEY: testKey };

    // 内部の buildSanitizedEnv() を直接テスト
    const sanitized = buildSanitizedEnv();
    expect(sanitized.OPENAI_API_KEY).toBeUndefined();
    expect(sanitized.ANTHROPIC_API_KEY).toBeUndefined();
    expect(sanitized.PATH).toBeDefined();
  });

  it('ALLOWLIST の環境変数のみが渡される', async () => {
    const sanitized = buildSanitizedEnv();
    const allowlist = ['PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL',
                       'LC_CTYPE', 'TERM', 'TMPDIR', 'XDG_CONFIG_HOME',
                       'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'NODE_ENV', 'DEBUG'];

    for (const key of Object.keys(sanitized)) {
      expect(allowlist).toContain(key);
    }
  });
});
```


## AC-3: CLI 入力中にログ割り込みがない

### 要件

- 上部ペインにログが流れても下部ペインの入力は乱れない
- カーソル位置が維持される
- 入力中の文字列が維持される

### 検証手順（手動）

```
1. pm-orchestrator repl を起動
2. 下部ペインで文字入力を開始（Enter は押さない）
3. 別ターミナルから長時間タスクを投入
4. ログが上部ペインに流れる
5. 下部ペインの入力文字列・カーソル位置が維持されていることを確認
```

### 自動テスト

```typescript
// tests/acceptance/ac-3-log-interrupt.test.ts
describe('AC-3: CLI 入力中にログ割り込みがない', () => {
  it('ログ出力が入力バッファに影響しない', async () => {
    const repl = new ReplSession();

    // 入力バッファに文字を追加
    repl.inputBuffer.write('test input');
    const beforeInput = repl.inputBuffer.toString();
    const beforeCursor = repl.cursorPosition;

    // ログを出力
    repl.log('Background log message');

    // 入力バッファが変更されていないことを確認
    expect(repl.inputBuffer.toString()).toBe(beforeInput);
    expect(repl.cursorPosition).toBe(beforeCursor);
  });
});
```


## AC-4: Task Group で文脈が維持される

### 要件

- 同一 Task Group 内で前のタスクの結果を参照できる
- 会話履歴が保持されている

### 検証コマンド

```bash
# テスト: Task Group 内で文脈が維持される
pm-orchestrator repl --project-mode temp <<EOF
/start
"変数 x に 42 を設定してください"
"x の値を教えてください"
/exit
EOF

# 期待結果: 2つ目のタスクで x=42 を参照できる
```

### 自動テスト

```typescript
// tests/acceptance/ac-4-task-group-context.test.ts
describe('AC-4: Task Group で文脈が維持される', () => {
  it('前のタスクの結果を参照できる', async () => {
    const session = await startSession();
    const taskGroup = await session.createTaskGroup();

    // Task 1: 変数を設定
    const task1 = await taskGroup.execute('変数 x に 42 を設定してください');
    expect(task1.status).toBe('COMPLETE');

    // Task 2: 変数を参照
    const task2 = await taskGroup.execute('x の値を教えてください');
    expect(task2.output).toContain('42');

    // 会話履歴が保持されている
    expect(taskGroup.conversationHistory.length).toBe(2);
  });
});
```


## AC-5: Task 完了後も会話が継続できる

### 要件

- Task 完了後に Task Group は終了しない
- 次のタスクを同一 Task Group で実行できる

### 検証コマンド

```bash
# テスト: Task 完了後も会話継続
pm-orchestrator repl --project-mode temp <<EOF
/start
"hello"
"world"
"goodbye"
/status
/exit
EOF

# 期待結果: /status で Task Group が active のまま
# 期待結果: 3つのタスクが同一 Task Group に属する
```

### 自動テスト

```typescript
// tests/acceptance/ac-5-task-continuation.test.ts
describe('AC-5: Task 完了後も会話が継続できる', () => {
  it('Task 完了後も Task Group は終了しない', async () => {
    const session = await startSession();
    const taskGroup = await session.createTaskGroup();

    // Task 1
    await taskGroup.execute('hello');
    expect(taskGroup.state).toBe('active');

    // Task 2
    await taskGroup.execute('world');
    expect(taskGroup.state).toBe('active');

    // Task 3
    await taskGroup.execute('goodbye');
    expect(taskGroup.state).toBe('active');

    // 全て同一 Task Group
    const tasks = await taskGroup.getTasks();
    expect(tasks.length).toBe(3);
    expect(tasks.every(t => t.task_group_id === taskGroup.id)).toBe(true);
  });
});
```


## AC-6: Web UI から命令投入可能

### 要件

- Web UI の新規命令投入フォームが動作する
- 投入した命令が Queue Store に追加される
- Runner が polling して実行する

### 検証手順

```bash
# 1. Runner を起動（Web UI 有効）
pm-orchestrator repl --project-mode temp --web-ui --port 3000 &

# 2. ngrok でトンネル作成
ngrok http 3000

# 3. Web UI から命令投入
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"input": "hello world"}'

# 期待結果: { "task_id": "task_xxx", "status": "queued" }

# 4. Queue Store を確認
curl http://localhost:3000/api/queue

# 期待結果: 投入したタスクが一覧に含まれる
```

### E2E テスト

```typescript
// tests/acceptance/ac-6-web-ui.test.ts
describe('AC-6: Web UI から命令投入可能', () => {
  it('命令投入フォームが動作する', async () => {
    const runner = await startRunner({ webUi: true, port: 3000 });

    // 命令を投入
    const response = await fetch('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'hello world' })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.task_id).toBeDefined();
    expect(data.status).toBe('queued');

    // Queue Store に追加されていることを確認
    const queue = await fetch('http://localhost:3000/api/queue');
    const queueData = await queue.json();
    expect(queueData.items.some(i => i.task_id === data.task_id)).toBe(true);

    await runner.stop();
  });
});
```


## AC-7: Runner 再起動後も状態復元

### 要件

- Session が復元される
- Task Group が復元される
- Queue Store の状態が維持される

### 検証コマンド

```bash
# 1. Session を作成してタスクを実行
pm-orchestrator repl --project-mode fixed --project-root /tmp/test-restore <<EOF
/start
"hello"
/status
/exit
EOF

# 2. session_id を記録
SESSION_ID=$(cat /tmp/test-restore/.claude/session.json | jq -r '.session_id')

# 3. Runner を再起動して継続
pm-orchestrator repl --project-mode fixed --project-root /tmp/test-restore <<EOF
/continue $SESSION_ID
/status
/exit
EOF

# 期待結果: 前回の Session / Task Group が復元される
```

### 自動テスト

```typescript
// tests/acceptance/ac-7-state-restore.test.ts
describe('AC-7: Runner 再起動後も状態復元', () => {
  it('Session と Task Group が復元される', async () => {
    const projectRoot = '/tmp/test-restore-' + Date.now();
    fs.mkdirSync(projectRoot, { recursive: true });

    // 最初のセッション
    const runner1 = await startRunner({ projectRoot, projectMode: 'fixed' });
    const session1 = await runner1.startSession();
    const taskGroup1 = await session1.createTaskGroup();
    await taskGroup1.execute('hello');
    const sessionId = session1.id;
    const taskGroupId = taskGroup1.id;
    await runner1.stop();

    // 再起動
    const runner2 = await startRunner({ projectRoot, projectMode: 'fixed' });
    const session2 = await runner2.continueSession(sessionId);

    // 復元の確認
    expect(session2.id).toBe(sessionId);
    const taskGroups = await session2.getTaskGroups();
    expect(taskGroups.some(tg => tg.id === taskGroupId)).toBe(true);

    await runner2.stop();
    fs.rmSync(projectRoot, { recursive: true });
  });
});
```


## AC-8: stable が dev を開発できる

### 要件

- stable runner で dev runner のコードを変更できる
- stable runner でテストを実行できる
- stable runner でビルドできる

### 検証手順

```bash
# 1. stable と dev を準備
mkdir -p /tmp/runners/stable /tmp/runners/dev
cp -r /path/to/pm-orchestrator-runner /tmp/runners/stable/
cp -r /path/to/pm-orchestrator-runner /tmp/runners/dev/

# 2. stable から dev を開発
cd /tmp/runners/stable/pm-orchestrator-runner
pm-orchestrator repl --project-mode cwd <<EOF
"../dev/pm-orchestrator-runner/src/index.ts にコメントを追加してください"
/exit
EOF

# 3. stable から dev のテストを実行
pm-orchestrator repl --project-mode cwd <<EOF
"../dev/pm-orchestrator-runner でテストを実行してください"
/exit
EOF

# 期待結果: テストが実行される

# 4. stable から dev のビルドを実行
pm-orchestrator repl --project-mode cwd <<EOF
"../dev/pm-orchestrator-runner をビルドしてください"
/exit
EOF

# 期待結果: ビルドが成功する
```

### 統合テスト

```typescript
// tests/acceptance/ac-8-stable-dev.test.ts
describe('AC-8: stable が dev を開発できる', () => {
  it('stable から dev のコードを変更できる', async () => {
    // セットアップ
    const stableRoot = '/tmp/stable-' + Date.now();
    const devRoot = '/tmp/dev-' + Date.now();
    // ... コピー処理

    const stableRunner = await startRunner({
      projectRoot: stableRoot,
      projectMode: 'fixed'
    });

    // dev のファイルを変更
    const result = await stableRunner.execute(
      `${devRoot}/src/index.ts にコメントを追加してください`
    );
    expect(result.status).toBe('COMPLETE');

    // ファイルが変更されたことを確認
    const content = fs.readFileSync(`${devRoot}/src/index.ts`, 'utf-8');
    expect(content).toContain('//'); // コメントが追加された

    await stableRunner.stop();
  });
});
```


## 検証スクリプト

全受入基準を一括検証するスクリプト:

```bash
#!/bin/bash
# scripts/verify-acceptance-criteria.sh

set -e

echo "=== AC-1: API Key 未設定でも起動する ==="
npm run test:acceptance -- --grep "AC-1"

echo "=== AC-2: env から API Key が漏れない ==="
npm run test:acceptance -- --grep "AC-2"

echo "=== AC-3: CLI 入力中にログ割り込みがない ==="
npm run test:acceptance -- --grep "AC-3"

echo "=== AC-4: Task Group で文脈が維持される ==="
npm run test:acceptance -- --grep "AC-4"

echo "=== AC-5: Task 完了後も会話が継続できる ==="
npm run test:acceptance -- --grep "AC-5"

echo "=== AC-6: Web UI から命令投入可能 ==="
npm run test:acceptance -- --grep "AC-6"

echo "=== AC-7: Runner 再起動後も状態復元 ==="
npm run test:acceptance -- --grep "AC-7"

echo "=== AC-8: stable が dev を開発できる ==="
npm run test:acceptance -- --grep "AC-8"

echo "=== 全受入基準クリア ==="
```


## Cross-References

- 11_VIBE_CODING_ACCEPTANCE.md (REPL 受入基準)
- 15_API_KEY_ENV_SANITIZE.md (API Key 仕様)
- 18_CLI_TWO_PANE.md (2ペイン仕様)
- 16_TASK_GROUP.md (Task Group 仕様)
- 19_WEB_UI.md (Web UI 仕様)
- 21_STABLE_DEV.md (stable/dev 構成)
- 20_QUEUE_STORE.md (Queue Store 仕様)
