# Open Defects

## Status: No Known Defects

This document tracks known defects in the Web UI centralization implementation.

## Defect Template

```markdown
### DEF-XXX: [Title]

**Severity:** Critical / High / Medium / Low
**Status:** Open / In Progress / Fixed / Won't Fix
**Component:** Web UI / Agent / DynamoDB / API

**Description:**
[Description of the defect]

**Steps to Reproduce:**
1. ...
2. ...
3. ...

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Root Cause:**
[If known]

**Fix:**
[If known]

**Related:**
- Issue: #XXX
- PR: #XXX
```

## Open Defects

### DEF-001: タスク分解がテンプレート注入テキストに引っ張られる

**Severity:** High
**Status:** Partially Fixed (2026-03-30)
**Component:** Task Chunking / CLI

**Description:**
ユーザーの質問（例:「APIはきちんとそこを叩くのか?」）が自動タスク分解で全く無関係なサブタスクに変換される。原因は `enrichedPrompt`（テンプレート注入済み）を分解ロジックに渡していたこと。

**Root Cause:**
1. `cli/index.ts` で `enrichedPrompt` を `analyzeTaskForChunking()` に渡していた
2. 質問/調査系プロンプトに対するガードがなかった
3. `extractSubtasksFromPrompt()` がテンプレート内のリスト構造をサブタスクとして抽出

**Fix (Applied):**
- `cli/index.ts`: `enrichedPrompt` → `item.prompt` に変更
- `task-chunking.ts`: `isQuestionOrInvestigationPrompt()` ガード追加
- テスト: 12ケース追加（68 passing）

**Remaining:**
- `extractSubtasksFromPrompt()` 内のテンプレートセクションフィルタリング（B-016参照）

**Related:**
- Backlog: B-016

## Fixed Defects

(None yet)

## Deferred Defects

(None yet)
