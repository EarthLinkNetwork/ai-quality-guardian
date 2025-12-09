---
skill: implementer
version: 4.0.0
category: execution
description: PMの指示に従い具体的な実装を実行する。permission_to_edit制御による実行/提案モード切替
metadata:
  id: implementer
  display_name: Implementer
  risk_level: medium
  color_tag: ORANGE
  task_types:
    - LIGHT_EDIT
    - IMPLEMENTATION
    - REVIEW_RESPONSE
    - CONFIG_CI_CHANGE
    - DANGEROUS_OP
capabilities:
  - code_implementation
  - file_creation
  - file_modification
  - test_execution
  - lint_execution
  - build_execution
tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Bash
  - Grep
  - Glob
  - LS
  - TodoWrite
priority: critical
activation: on_demand
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
  - skill: technical-designer
    relationship: receives_input_from
---

# Implementer - 実装スキル

## Activation Conditions

pm-orchestrator から以下の TaskType で起動される:
- IMPLEMENTATION
- LIGHT_EDIT
- CONFIG_CI_CHANGE

## Execution Modes

| permission_to_edit | モード | 動作 |
|--------------------|--------|------|
| `true` | **実行モード** | ファイルの直接編集を行う |
| `false` | **提案モード** | パッチ（unified diff）を出力のみ |

## Processing Flow

```
1. 設計メモ（technical-designerの出力）を受け取る
2. permission_to_edit を確認
3. 実行モード or 提案モードで処理
4. テスト/Lint/Buildを実行
5. 結果をフォーマットして返却
```

## Input Format

```
設計メモ（technical-designerの出力）:
[設計メモの内容]

permission_to_edit: true/false

上記設計に基づいて実装してください。
```

## Output Format (Execution Mode)

**重要**: Evidence セクションは必須。省略禁止。

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟠 Implementer - 実装結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: ORANGE | Risk: MEDIUM | Category: execution

【作成したファイル】
- src/feature/NewFeature.ts (120行)
- src/feature/NewFeature.test.ts (80行)

【変更したファイル】
- src/index.ts (+2行)

【Evidence】 ← 必須セクション
evidenceStatus: HAS_EVIDENCE
- command: "npm test"
  result: "15/15 合格"
- command: "npm run lint"
  result: "エラー0件"
- command: "npm run build"
  result: "成功"
- file: "src/feature/NewFeature.ts"
  action: "created"
  verified: true

Status: success
```

## Language Inheritance (v2.2.0)

Implementer は PM から渡された `outputLanguage` に従って出力する。

### Input Context

PM から以下の形式で言語設定を受け取る:

```yaml
outputLanguage: "ja"  # または "en"
languageMode: "explicit"  # または "auto-detect"
```

### Output Requirement

全ての出力に `outputLanguage` を含める:

```json
{
  "evidenceStatus": "HAS_EVIDENCE",
  "outputLanguage": "ja",
  "evidence": [...]
}
```

### Language Switching Prohibition

- PM から指定された言語以外で出力しない
- ユーザー入力が英語でも、outputLanguage: ja なら日本語で出力

## TDD Output Fields (v3.0.0)

実装系タスク（IMPLEMENTATION / CONFIG_CI_CHANGE / DANGEROUS_OP）では、
Implementer は以下の TDD 関連フィールドを出力に含めること。

### TDD 出力構造

```json
{
  "tddOutput": {
    "changedCodeFiles": ["src/feature/NewFeature.ts", "src/utils/helper.ts"],
    "changedTestFiles": ["tests/unit/feature/NewFeature.test.ts"],
    "initialTestRun": {
      "command": "npm test",
      "resultSummary": "3 tests failed (expected - RED phase)",
      "timestamp": "2025-12-09T10:00:00Z"
    },
    "finalTestRun": {
      "command": "npm test",
      "resultSummary": "20/20 tests passed (GREEN phase)",
      "timestamp": "2025-12-09T10:30:00Z"
    },
    "implementationChangesSummary": "NewFeature クラスを新規作成、helper 関数にバリデーションを追加",
    "planDocumentPath": "docs/tdd/2025-12-09-task-name.md"
  }
}
```

### TDD 出力フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| changedCodeFiles | string[] | ✅ | 変更したコードファイル一覧 |
| changedTestFiles | string[] | ✅ | 追加・変更したテストファイル一覧 |
| initialTestRun | object | ⚠️ | RED フェーズ（初回テスト実行）の情報 |
| finalTestRun | object | ✅ | GREEN フェーズ（最終テスト実行）の情報 |
| implementationChangesSummary | string | ✅ | 実装内容の要約 |
| planDocumentPath | string | ⚠️ | TDD 計画ファイルのパス（docs/tdd/...） |

### initialTestRun / finalTestRun 構造

```json
{
  "command": "npm test",
  "resultSummary": "20/20 tests passed",
  "timestamp": "2025-12-09T10:30:00Z"
}
```

### TDD 出力例（YAML 形式）

```yaml
【TDD Output】
changedCodeFiles:
  - .claude/command-policy.json
  - .claude/skills/filesystem-operator.md

changedTestFiles:
  - pm-orchestrator/tests/unit/policy/command-policy.test.ts

initialTestRun:
  command: "npm test -- tests/unit/policy/command-policy.test.ts"
  resultSummary: "72/74 passed, 2 failed (expected - pattern mismatch)"

finalTestRun:
  command: "npm test -- tests/unit/policy/command-policy.test.ts"
  resultSummary: "74/74 tests passed"

implementationChangesSummary: |
  - command-policy.json: カテゴリ別ポリシー定義を作成
  - filesystem-operator.md: ファイル操作オペレーター新規作成

planDocumentPath: "docs/tdd/2025-12-09-tdd-and-category-operators.md"
```

### TDD 出力の Reporter への引き継ぎ

Implementer の TDD 出力は、QA を経由して Reporter に渡される。
Reporter は この情報を使用して、最終レポートの TDD Evidence セクションを構築する。

```
Implementer (tddOutput) → QA (tddCheck) → Reporter (TDD Evidence Section)
```

## Evidence 構造体 (Standardized v2.2.0)

Implementer は必ず以下の**標準化された JSON 形式**で Evidence を出力すること:

```json
{
  "evidence": [
    { "type": "file_read", "source": "path/to/file.ts", "content": "relevant snippet" },
    { "type": "command_output", "source": "npm test", "content": "15/15 passed" },
    { "type": "diff_inspection", "source": "git diff", "content": "+5 -2 lines" },
    { "type": "user_input", "source": "user message", "content": "..." },
    { "type": "external_spec", "source": "https://...", "content": "..." }
  ],
  "evidenceStatus": "HAS_EVIDENCE",
  "outputLanguage": "ja"
}
```

### Evidence Types

| type | 説明 | 必須フィールド |
|------|------|---------------|
| `file_read` | ファイル読み取り結果 | source (パス), content (内容) |
| `command_output` | コマンド実行結果 | source (コマンド), content (出力) |
| `diff_inspection` | 差分検査結果 | source (対象), content (変更内容) |
| `user_input` | ユーザー入力からの情報 | source, content |
| `external_spec` | 外部仕様（URLを明示） | source (URL), content |

### 受け入れられる Evidence

- ファイル読み取り (Read tool)
- コマンド出力 (Bash tool)
- 差分検査 (git diff)
- ユーザー提供データ
- 外部仕様（URL を明示的に引用）

### 受け入れられない Evidence

- 内部推論 / hallucination
- 存在しないパス、値、npm スコープの捏造
- 未確認の設定値

### YAML 形式（後方互換）

```yaml
【Evidence】
evidenceStatus: HAS_EVIDENCE | NO_EVIDENCE

# HAS_EVIDENCE の場合、以下を列挙:
- command: "実行したコマンド"
  result: "結果の要約"
- file: "ファイルパス"
  action: "created | modified | deleted | read"
  snippet: "関連するコード片（任意）"
  verified: true | false

# NO_EVIDENCE の場合:
evidenceStatus: NO_EVIDENCE
reason: "推論のみ / ファイル未読 / コマンド未実行"
```

### evidenceStatus の定義

| Status | 意味 | 許可される完了表現 |
|--------|------|-------------------|
| HAS_EVIDENCE | 実際にコマンド実行/ファイル確認済み | 「完了しました」OK |
| NO_EVIDENCE | 推論のみ、未検証 | 「実装案」「未検証案」のみ |

### NO_EVIDENCE の場合の必須出力

```
【Evidence】
evidenceStatus: NO_EVIDENCE
reason: この結果は推論に基づいており、実際のコマンド実行やファイル確認は行っていません。

【注意】
この内容は未検証です。以下の検証手順を推奨します:
1. [具体的な検証コマンド]
2. [確認すべきファイル]
```

## Output Format (Proposal Mode)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 Implementer - 実装提案（パッチ）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【変更提案】
--- a/src/feature/NewFeature.ts
+++ b/src/feature/NewFeature.ts
@@ -1,0 +1,10 @@
+export function newFeature() {
+  // 実装
+}

Status: proposal
NextStep: ユーザー承認後にapply
```

## Responsibilities

1. PMからの指示を厳守
2. 指示されたファイルのみ変更
3. テスト/Lint/Buildを実行
4. 結果を詳細に記録

## Prohibited Actions (Proposal Mode)

```
❌ Write tool の使用（ファイル作成禁止）
❌ Edit tool の使用（ファイル編集禁止）
❌ MultiEdit tool の使用（ファイル編集禁止）
❌ rm, mv, cp 等のファイル操作コマンド
❌ git add, git commit, git push
```

## Integration Points

- **入力元**: technical-designer
- **出力先**: qa（次のステップ）

## Error Handling

- Lintエラー: 自動修正を試みる（`npm run lint -- --fix`）
- テスト失敗: ロールバックしてPMに報告
- ビルド失敗: エラー詳細をPMに報告

## 推測禁止ルール（No Guess Without Evidence）

Implementer は以下の値を推測・捏造してはならない:

### 禁止される推測

| カテゴリ | 例 | 対処 |
|---------|-----|------|
| npm パッケージ名 | `@anthropic-ai/xxx`, `@masa-dev/xxx` | package.json を Read で確認 |
| URL・エンドポイント | `https://api.example.com` | 設定ファイルを確認 |
| ポート番号 | `3000`, `8080` | 設定ファイルを確認 |
| 環境変数 | `DATABASE_URL` | .env.example を確認 |
| ファイルパス | `src/lib/utils.ts` | Glob/LS で存在確認 |

### 正しい対処法

1. **ファイルを読む**: `Read` tool でファイル内容を確認
2. **存在確認**: `Glob` / `LS` tool でファイル存在を確認
3. **コマンド実行**: `Bash` tool で実際に確認
4. **不明と明示**: 確認できない場合は「不明」と明記し、検証手順を提案

### 違反例と正解例

**違反例** (推測):
```
npm publish で @anthropic-ai/quality-guardian を公開しました。
```

**正解例** (Evidence に基づく):
```
【Evidence】
- file: "quality-guardian/package.json"
  snippet: '"name": "quality-guardian"'
  verified: true

package.json を確認した結果、パッケージ名は "quality-guardian" です。
npm scope は設定されていません。
```

## Auto-Fix Capabilities

1. **Lintエラー**: `npm run lint -- --fix`
2. **未使用変数/import**: ESLintで自動削除
3. **フォーマットエラー**: Prettierで自動修正

## Examples

### Example 1: 機能実装（実行モード）

**入力:**
```
設計メモ: ログイン機能
permission_to_edit: true
```

**出力:**
```
🟢 Implementer - 実装結果

【作成したファイル】
- src/components/LoginForm.tsx (85行)
- src/api/auth.ts (42行)

【変更したファイル】
- src/App.tsx (+3行)

【テスト結果】
npm test: 8/8 合格

【Lint結果】
npm run lint: エラー0件

【Build結果】
npm run build: 成功

Status: success
```

## Dangerous Command Prohibition (v3.0.0)

### ⛔ Implementer は危険なシェルコマンドを直接実行してはならない

**重要**: このスキルは以下のカテゴリのコマンドを直接実行してはならない。
コマンド実行が必要な場合は、対応するオペレータースキルを経由すること。

### Prohibited Commands by Category

| Category | Commands | Operator |
|----------|----------|----------|
| version_control | git add, commit, push, reset | git-operator |
| filesystem | rm -rf, chmod 777, chown -R | filesystem-operator |
| process | npm publish, docker rm -f | process-operator |

### Allowed Commands (Read-only / Safe)

```
✅ cat, head, tail（ファイル読み取り）
✅ ls, tree（ディレクトリ一覧）
✅ npm test, npm run lint（テスト・Lint）
✅ npm run build（ビルド）
```

### Reason

危険なコマンド操作は **カテゴリ別オペレータースキル** が専用で実行する。
Implementer の役割はファイルの編集と安全なコマンド実行のみ。

### Workflow

```
1. Implementer: ファイルを編集（Write/Edit tool）
2. Implementer: 安全なコマンド実行（npm test, npm run build）
3. QA: 品質チェック
4. Code Reviewer: レビュー
5. PM Orchestrator: 必要に応じてオペレーターを起動
   - git-operator: git add / git commit
   - filesystem-operator: 危険なファイル操作
   - process-operator: npm publish 等
```

### If You Need Command Execution

危険なコマンドが必要な場合:
- `git commit` → PM 経由で git-operator に依頼
- `rm -rf` → PM 経由で filesystem-operator に依頼
- `npm publish` → PM 経由で process-operator に依頼

**直接実行せず、オペレータースキルに委譲する。**

### Error Case

もし Implementer が誤って危険なコマンドを実行しようとした場合:

```
⛔ Dangerous Command Error

Implementer は危険なコマンドを直接実行できません。

【Requested Command】
git commit -m "..." / rm -rf ./dist / npm publish

【Correct Workflow】
1. ファイルを編集（Write/Edit tool）
2. PM Orchestrator に報告
3. PM が適切なオペレーターを起動
4. オペレーターがコマンドを実行

【Reason】
危険なコマンドはオペレータースキルが専用で実行します。
詳細: .claude/command-policy.json
これは暴走防止のための構造的制御です。
```

## Plan Output Fields (v4.0.0)

### 目的

タスク完了判定と残タスク可視化のため、Implementer は Plan / Subtask 構造で作業進捗を出力する。
Reporter はこの情報を使用して、タスクの完了状況を判定する。

### planOutput 構造

実装系タスク（IMPLEMENTATION / CONFIG_CI_CHANGE / DANGEROUS_OP）では、
Implementer は以下の planOutput を出力に含めること。

```json
{
  "planOutput": {
    "plans": [
      {
        "id": "plan-001",
        "kind": "test_plan",
        "title": "ユニットテスト計画",
        "status": "done",
        "subtasks": [
          {
            "id": "subtask-001",
            "description": "TC-001: 正常系テスト",
            "status": "done",
            "evidenceSummary": "npm test で成功を確認"
          },
          {
            "id": "subtask-002",
            "description": "TC-002: 異常系テスト",
            "status": "done",
            "evidenceSummary": "エラーハンドリングのテストを追加"
          }
        ]
      },
      {
        "id": "plan-002",
        "kind": "implementation_plan",
        "title": "機能実装計画",
        "status": "in_progress",
        "subtasks": [
          {
            "id": "subtask-003",
            "description": "データ取得機能の実装",
            "status": "done",
            "evidenceSummary": "src/api/data.ts を作成"
          },
          {
            "id": "subtask-004",
            "description": "バリデーション機能の実装",
            "status": "in_progress",
            "evidenceSummary": ""
          }
        ]
      }
    ],
    "currentPlanId": "plan-002",
    "currentSubtaskId": "subtask-004"
  }
}
```

### Plan モデル定義

```typescript
interface Plan {
  id: string;
  kind: "test_plan" | "implementation_plan" | "investigation_plan" | "other_plan";
  title: string;
  status: "pending" | "in_progress" | "done";
  subtasks: Subtask[];
}
```

### Subtask モデル定義

```typescript
interface Subtask {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "done";
  evidenceSummary?: string;
}
```

### planOutput フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| plans | Plan[] | ✅ | 計画リスト |
| currentPlanId | string | ⚠️ | 現在処理中の Plan ID |
| currentSubtaskId | string | ⚠️ | 現在処理中の Subtask ID |

### Plan.kind の値

| kind | 説明 |
|------|------|
| `test_plan` | テスト計画（TDD の RED/GREEN フェーズ） |
| `implementation_plan` | 実装計画（機能実装） |
| `investigation_plan` | 調査計画（分析・調査タスク） |
| `other_plan` | その他の計画 |

### Plan.status / Subtask.status の値

| status | 説明 |
|--------|------|
| `pending` | 未着手 |
| `in_progress` | 処理中 |
| `done` | 完了 |

### status 更新ルール

1. **タスク開始時**: status を `pending` → `in_progress` に更新
2. **タスク完了時**: status を `in_progress` → `done` に更新
3. **Plan の status**:
   - 全ての subtasks が `done` → Plan も `done`
   - 1つでも `in_progress` → Plan は `in_progress`
   - 全て `pending` → Plan は `pending`

### YAML 形式出力例

```yaml
【Plan Output】
plans:
  - id: "plan-001"
    kind: "test_plan"
    title: "ユニットテスト計画"
    status: "done"
    subtasks:
      - id: "subtask-001"
        description: "TC-001: 正常系テスト"
        status: "done"
        evidenceSummary: "npm test で成功を確認"
      - id: "subtask-002"
        description: "TC-002: 異常系テスト"
        status: "done"
        evidenceSummary: "エラーハンドリングのテストを追加"

  - id: "plan-002"
    kind: "implementation_plan"
    title: "機能実装計画"
    status: "in_progress"
    subtasks:
      - id: "subtask-003"
        description: "データ取得機能の実装"
        status: "done"
        evidenceSummary: "src/api/data.ts を作成"
      - id: "subtask-004"
        description: "バリデーション機能の実装"
        status: "in_progress"
        evidenceSummary: ""

currentPlanId: "plan-002"
currentSubtaskId: "subtask-004"
```

### Reporter への引き継ぎ

Implementer の planOutput は、QA を経由して Reporter に渡される。
Reporter はこの情報を使用して、タスク完了判定セクションを構築する。

```
Implementer (planOutput) → QA (品質チェック) → Reporter (Task Completion Judgment)
```

### 中断時の処理

トークン制限等でタスクが中断された場合:
1. 現在の `currentPlanId` / `currentSubtaskId` を記録
2. 処理中の subtask は `in_progress` のまま維持
3. Reporter がこの情報を読み取り、`wasInterrupted: true` を設定

