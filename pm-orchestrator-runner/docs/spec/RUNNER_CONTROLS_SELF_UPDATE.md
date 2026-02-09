# Runner Controls Self-Update Specification

## Overview

This specification defines the requirements for "Web-only Self-Update" - the ability to update, build, restart, and verify the pm-orchestrator-runner entirely through the Web UI without requiring terminal access.

## Goal

**Goal**: "Web だけで自己更新 -> build -> restart -> 反映確認" が手動介入なしで回る状態を、E2E で強制し、二度と壊れないようにすること。

---

## Acceptance Criteria

### AC-RC-UI-1: Runner Controls UI Visibility

**Definition:** Web UI に Runner Controls (Build/Restart/Stop ボタン + 状態表示) が Settings/専用ページで表示される

**Requirements:**
1. Settings ページまたは専用ページに Runner Controls セクション
2. ボタン:
   - Build: npm run build を実行
   - Restart: stop -> build -> start シーケンス
   - Stop: 安全なシャットダウン
3. 状態表示:
   - Runner status (running/stopped/error)
   - Current PID
   - Build SHA (現在のビルドバージョン)
   - Last build timestamp
4. 操作結果表示:
   - Success/Failure 明確表示
   - Failure 時: 原因と次のアクション (Retry/Back)

**Verification:**
- E2E: `runner-controls-ui.e2e.test.ts`
- ブラウザで UI が表示され、ボタンがクリック可能

---

### AC-RC-API-1: Runner Controls API

**Definition:** POST /api/runner/build, restart, stop API が正常動作

**Requirements:**
1. POST /api/runner/build
   - npm run build 実行
   - build-meta.json 生成
   - 成功時: `{ success: true, build_sha, build_timestamp }`
   - 失敗時: `{ success: false, error, output, nextActions }`

2. POST /api/runner/restart
   - Stop -> Build -> Start シーケンス
   - PID が変わる (AC-OPS-2)
   - 成功時: `{ success: true, old_pid, new_pid, build_sha }`
   - Build 失敗時: 古いプロセス維持 (AC-SUP-2)

3. POST /api/runner/stop
   - Graceful shutdown (SIGTERM -> SIGKILL fallback)
   - 成功時: `{ success: true }`

**Verification:**
- Unit tests + API E2E tests

---

### AC-PROGRESS-TIMEOUT-1: Progress-Aware Timeout Integration

**Definition:** タスク実行中、出力がある間はタイムアウトしない

**Requirements:**
1. Executor が progress events を emit:
   - heartbeat: 定期的な生存確認
   - tool_progress: ツール実行中の進捗
   - log_chunk: 出力ログの断片

2. Timeout 判定:
   - idle_timeout: progress event がない場合のみトリガー
   - hard_timeout: 絶対的な上限
   - progress event がある限り idle_timeout はリセット

3. タイムアウト時:
   - AWAITING_RESPONSE にセット (BLOCKED ではなく)
   - Resume オプションを提供

4. Profile:
   - standard: idle=60s, hard=10m
   - extended: idle=5m, hard=60m (auto-dev loop)

**Verification:**
- E2E: `progress-aware-timeout.e2e.test.ts`
- 長時間出力がある場合にタイムアウトしないことを確認

---

### AC-YES-RESUME-1: AWAITING_RESPONSE YES Resume

**Definition:** AWAITING_RESPONSE 状態で YES を返すと、タスクが再開する

**Requirements:**
1. POST /api/tasks/:task_id/reply with `{ reply: "YES" }`:
   - status: AWAITING_RESPONSE -> RUNNING
   - conversation_history に YES を追加
   - Executor が再開を検知して続行

2. YES バリエーション (case-insensitive):
   - "YES", "yes", "Yes"
   - "y", "Y"
   - "はい", "進めて", "OK"

3. 再開後の挙動:
   - task.status = RUNNING
   - Executor が queue から pick up
   - 処理続行

**Verification:**
- E2E: `awaiting-response-yes-resume.e2e.test.ts`

---

### AC-BUILD-SHA-1: Build SHA in /api/health

**Definition:** /api/health に build_sha が含まれる

**Requirements:**
1. npm run build 時に dist/build-meta.json 生成:
   ```json
   {
     "build_sha": "abc1234",
     "build_timestamp": "2026-02-09T...",
     "git_sha": "abc1234",
     "git_branch": "main"
   }
   ```

2. /api/health レスポンス:
   ```json
   {
     "status": "ok",
     "web_pid": 12345,
     "build_sha": "abc1234",
     "build_timestamp": "2026-02-09T..."
   }
   ```

3. Restart 後に build_sha が更新される

**Verification:**
- E2E: `build-and-restart-reflection.e2e.test.ts`

---

## E2E Test Mapping

| AC | E2E Test File | Description |
|----|---------------|-------------|
| AC-RC-UI-1 | runner-controls-ui.e2e.test.ts | Runner Controls UI 表示 |
| AC-RC-API-1 | runner-controls-api.e2e.test.ts | API 動作確認 |
| AC-PROGRESS-TIMEOUT-1 | progress-aware-timeout.e2e.test.ts | Progress timeout 動作 |
| AC-YES-RESUME-1 | awaiting-response-yes-resume.e2e.test.ts | YES で再開 |
| AC-BUILD-SHA-1 | build-and-restart-reflection.e2e.test.ts | Build SHA 反映 |

---

## Implementation Checklist

### 1. Runner Controls UI (Frontend)
- [ ] Settings ページに Runner Controls セクション追加
- [ ] Build/Restart/Stop ボタン
- [ ] 状態表示 (status, pid, build_sha, timestamp)
- [ ] 操作結果表示 (success/failure)

### 2. Progress-Aware Timeout
- [ ] Executor に progress event emit 追加
- [ ] QueuePoller で progress event を task に記録
- [ ] Timeout check で progress event を考慮
- [ ] 2分固定 -> progress-aware に変更

### 3. YES Resume
- [ ] resumeWithResponse で YES パターン検出
- [ ] Executor の再開ロジック確認
- [ ] conversation_history に YES 追加

### 4. Build SHA
- [ ] scripts/generate-build-meta.js 確認
- [ ] postbuild hook 動作確認
- [ ] /api/health で build_sha 返却確認

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-02-09 | Initial specification |
