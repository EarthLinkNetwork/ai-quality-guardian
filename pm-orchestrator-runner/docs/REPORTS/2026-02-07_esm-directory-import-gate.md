# ESM Directory Import Gate - Evidence Log

## Date: 2026-02-07

## Summary
ESM ディレクトリ import エラー (`ERR_UNSUPPORTED_DIR_IMPORT`) の修正と再発防止ゲートの追加。

## Root Cause
`from '../supervisor'` のようなディレクトリ import は ESM で禁止されている。
テストファイル読み込み時にエラーが発生し、テスト自体が実行されないため "ALL PASS" になる偽陽性が発生。

## Fix Applied

### 1. Import 修正 (13 files)
```
from '../../src/supervisor' → from '../../src/supervisor/index'
from '../queue' → from '../queue/index'
```

### 2. Prevention Gates (2 new)
- `gate:import` - 静的解析でディレクトリ import を検出
- `gate:e2e-exec` - 必須 E2E テストの実行を検証

## Command Results

### npm run build
```
BUILD SUCCESS
```

### npm test
```
2988 passing (2m 5s)
102 pending
0 failing
```

### npm run gate:all
```
> gate:import
No directory imports found. ALL PASS.

> gate:tier0
ALL PASS

> gate:web
ALL PASS

> gate:agent
Agent Guard Check: 13/13 checks passed.
ALL PASS.

> gate:spec
ALL PASS

> gate:incomplete
ALL PASS

> gate:e2e-exec
E2E Files: 5/5 passed
Total Tests: 71 executed
ALL PASS
```

## AC Check Results

| AC | Description | Result |
|----|-------------|--------|
| AC1 | ESM execution of restart-resume tests PASS | PASS |
| AC2 | gate:all FAIL if directory imports exist | PASS |
| AC3 | gate:all verify restart/resume E2E ran | PASS |
| AC4 | npm test and gate:all show 0 failing | PASS |

## Files Changed

### New Files
- `diagnostics/directory-import.check.ts`
- `diagnostics/e2e-execution.check.ts`

### Modified Files
- `package.json` (scripts)
- `test/e2e/e2e-restart-resume.e2e.test.ts`
- `test/e2e/e2e-supervisor-template.e2e.test.ts`
- `test/e2e/e2e-output-format.e2e.test.ts`
- `test/e2e/e2e-web-self-dev.e2e.test.ts`
- `test/e2e/e2e-no-user-debug.e2e.test.ts`
- `src/web/routes/supervisor-config.ts`
- `src/core/runner-core.ts`
- `src/cli/index.ts`
- `src/selftest/mock-executor.ts`
- `src/selftest/selftest-runner.ts`
- `src/utils/restart-detector.ts`
- `src/web/index.ts`
- `src/web/server.ts`

### Documentation
- `docs/EVIDENCE.md` (updated)
- `docs/REPORTS/2026-02-07_esm-directory-import-gate.md` (this file)
