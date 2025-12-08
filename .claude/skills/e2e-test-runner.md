---
skill: e2e-test-runner
version: 1.0.0
category: quality
description: Playwright を使用してE2Eテストを headless モードで実行し、結果をQAスキルに報告する
metadata:
  id: e2e-test-runner
  display_name: E2E Test Runner
  risk_level: medium
  color_tag: GREEN
  task_types:
    - IMPLEMENTATION
    - CONFIG_CI_CHANGE
capabilities:
  - playwright_execution
  - headless_testing
  - result_parsing
  - failure_reporting
tools:
  - Read
  - Bash
  - Grep
  - Glob
priority: medium
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: qa
    relationship: called_by
---

# E2E Test Runner - E2Eテスト実行スキル

## Activation Conditions

qa Skill から以下の条件で起動される:
1. project-config.json で e2eTest.enabled = true
2. TaskType が IMPLEMENTATION または CONFIG_CI_CHANGE
3. 変更がフロントエンドに影響する場合

## Purpose

- Playwright を使用した E2E テストの自動実行
- デフォルトで headless モード（ユーザー作業を阻害しない）
- テスト結果の解析と QA スキルへの報告

## Configuration

```json
{
  "e2eTest": {
    "enabled": true,
    "browser": "chrome",
    "headless": true,
    "extraBrowsers": []
  }
}
```

### Browser Options

| Browser | Value | Description |
|---------|-------|-------------|
| Chrome | `chrome` | Chromium ベース（デフォルト） |
| Firefox | `firefox` | Firefox |
| WebKit | `webkit` | Safari エンジン |

### extraBrowsers

追加でテストするブラウザを配列で指定:

```json
{
  "extraBrowsers": ["firefox", "webkit"]
}
```

## Processing Flow

```
1. project-config.json から E2E 設定を読み込み
2. enabled が false の場合はスキップ
3. Playwright テストを実行
   - npx playwright test --headless
   - --project=<browser>
4. テスト結果を解析
5. 結果を QA スキルに返却
```

## Execution Commands

### Basic Execution

```bash
# Default (Chrome, headless)
npx playwright test --project=chromium

# With headless flag
PLAYWRIGHT_HEADLESS=1 npx playwright test
```

### Multiple Browsers

```bash
# Chrome + Firefox
npx playwright test --project=chromium --project=firefox

# All browsers
npx playwright test
```

### Specific Test File

```bash
npx playwright test tests/e2e/login.spec.ts
```

## Output Format

### Success

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 E2E Test Runner - テスト結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【設定】
Browser: chrome (headless)
Extra Browsers: なし

【テスト結果】
✅ 全テスト合格

【サマリ】
- 合計: 15 テスト
- 成功: 15
- 失敗: 0
- スキップ: 0

【実行時間】
45.2秒

Status: pass
```

### Failure

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 E2E Test Runner - テスト結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【設定】
Browser: chrome (headless)
Extra Browsers: なし

【テスト結果】
❌ テスト失敗あり

【サマリ】
- 合計: 15 テスト
- 成功: 13
- 失敗: 2
- スキップ: 0

【失敗テスト詳細】

1. tests/e2e/login.spec.ts:42
   テスト名: ログインフォームのバリデーション
   エラー: Timeout waiting for selector '#error-message'
   期待: エラーメッセージが表示される
   実際: タイムアウト (30秒)

2. tests/e2e/dashboard.spec.ts:28
   テスト名: ダッシュボードのグラフ表示
   エラー: expect(received).toBeVisible()
   期待: グラフが表示される
   実際: 要素が見つからない

【スクリーンショット】
- test-results/login-spec-42.png
- test-results/dashboard-spec-28.png

【実行時間】
62.8秒

Status: fail
```

### Disabled

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 E2E Test Runner - スキップ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

E2E テストは無効です。
有効にするには /pm-config edit で e2eTest.enabled を true に設定してください。

Status: skipped
```

## Playwright Configuration

推奨される `playwright.config.ts` 設定:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    headless: true,  // Always headless by default
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
```

## Integration Points

- **入力元**: qa Skill
- **出力先**: qa Skill, reporter Skill

## Error Handling

### Playwright Not Installed

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 E2E Test Runner - エラー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【エラー】
Playwright がインストールされていません。

【対処方法】
npm install -D @playwright/test
npx playwright install

Status: error
```

### No Test Files Found

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 E2E Test Runner - スキップ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

E2E テストファイルが見つかりません。
テストディレクトリ: tests/e2e/

Status: skipped
```

### Browser Not Available

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 E2E Test Runner - エラー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【エラー】
ブラウザ 'firefox' がインストールされていません。

【対処方法】
npx playwright install firefox

Status: error
```

## Examples

### Example 1: 全テスト成功

**入力:**
```
qa Skill から呼び出し
変更ファイル: src/components/LoginForm.tsx
```

**実行コマンド:**
```bash
npx playwright test --project=chromium
```

**出力:**
```
🧪 E2E Test Runner - テスト結果

【テスト結果】
✅ 全テスト合格

【サマリ】
- 合計: 15 テスト
- 成功: 15
- 失敗: 0

Status: pass
```

### Example 2: 複数ブラウザでテスト

**設定:**
```json
{
  "e2eTest": {
    "enabled": true,
    "browser": "chrome",
    "extraBrowsers": ["firefox"]
  }
}
```

**出力:**
```
🧪 E2E Test Runner - テスト結果

【設定】
Browser: chrome (headless)
Extra Browsers: firefox

【テスト結果 - Chrome】
✅ 15/15 合格

【テスト結果 - Firefox】
✅ 15/15 合格

Status: pass
```
