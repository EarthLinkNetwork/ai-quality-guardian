# 32. Template Injection

## 1. 概要

タスク投入時に自動差し込みされる「ルール（Rules）」と「出力形式（Output Format）」をテンプレートとして管理する機能。

### 1.1 目的
- 毎回同じルールを手入力する手間を削減
- プロジェクト固有のルールを永続化
- チーム間でテンプレートを共有可能にする

### 1.2 設計原則
- **明示的ON/USE時のみ注入**: デフォルトでは巨大文字列を注入しない
- **context肥大化回避**: テンプレートIDで参照し、必要時のみ本文を展開
- **永続化**: `/exit`やプロセス終了後も設定を保持

## 2. データモデル

### 2.1 Template

```typescript
interface Template {
  id: string;                    // UUID v4
  name: string;                  // 表示名（例: "default", "strict", "eln-pm"）
  rulesText: string;             // 差し込むルール本文
  outputFormatText: string;      // 出力形式指定本文
  enabled: boolean;              // 有効/無効
  isBuiltIn: boolean;            // 組み込みテンプレートか
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

### 2.2 組み込みテンプレート

以下の組み込みテンプレートを提供（ユーザーは編集不可、コピーして使用可）:

| ID | 名前 | 内容 |
|----|------|------|
| `builtin-minimal` | Minimal | 最小限のルール（品質チェックのみ） |
| `builtin-standard` | Standard | 標準ルール（UI/UX破綻=未完了含む） |
| `builtin-strict` | Strict | 厳格ルール（全チェック有効） |
| `goal_drift_guard` | Goal_Drift_Guard | ゴールドリフト防止（完了条件厳守） |

### 2.3 Standard テンプレート例

```yaml
# builtin-standard
rules: |
  ## 完了条件
  - UI/UX破綻（白画面、クラッシュ、操作不能）は完了条件未達とする
  - テスト失敗は完了条件未達とする
  - lint/typecheck エラーは完了条件未達とする

  ## 品質基準
  - TODO/FIXME を残さない
  - 省略マーカー（...、// etc.）を残さない

outputFormat: |
  ## 出力形式
  - 変更ファイル一覧（パス）
  - 実行したテスト結果
  - 残課題（あれば）
```

### 2.4 Goal_Drift_Guard テンプレート例

```yaml
# id: goal_drift_guard
# 選択時のみ注入（デフォルトOFF）
# プロジェクト非依存（サンプルプロジェクト固有の文言を含まない）
rules: |
  ## Goal Drift Prevention Rules

  ### Completion Criteria
  - A task is ONLY complete when ALL user-specified requirements are fulfilled
  - "Task not complete from user's perspective" = completion condition NOT met
  - Partial completion is NOT completion
  - If any requirement remains unaddressed, the task is INCOMPLETE

  ### Prohibited Language (Escape Phrases)
  The following phrases are PROHIBITED in completion reports:
  - "if needed"
  - "if required"
  - "optional"
  - "as needed"
  - "when necessary"
  - "could be added later"
  - "might need"
  - "consider adding"
  - "you may want to"

  ### Premature Completion Prevention
  The following are PROHIBITED:
  - Declaring completion before all requirements are verified
  - Suggesting user "verify" or "check" instead of doing verification yourself
  - Leaving implementation decisions to user when instructions were explicit
  - Claiming "basic implementation complete" when full implementation was requested
  - Using words like "skeleton", "scaffold", "starter" for what should be complete

  ### Goal Drift Detection
  Before completing, verify:
  1. Original user request is re-read
  2. Each explicit requirement is checked off
  3. No implicit "scope reduction" has occurred
  4. No requirements were "interpreted away"
  5. Output matches what user actually asked for, not what seemed easier

outputFormat: |
  ## Required Completion Report

  ### Requirement Checklist
  For each requirement in the original request:
  - [ ] Requirement 1: [status]
  - [ ] Requirement 2: [status]
  - (continue for all requirements)

  ### Verification Evidence
  - What was done to verify each requirement is met
  - Actual output/behavior observed

  ### Completion Statement
  Only use ONE of:
  - "COMPLETE: All N requirements fulfilled" (if truly complete)
  - "INCOMPLETE: Requirements X, Y, Z remain" (if not complete)

  Do NOT use ambiguous completion language.
```

## 3. ストレージ

### 3.1 保存場所

```
~/.pm-orchestrator/
├── templates/
│   ├── index.json          # テンプレート一覧（メタデータのみ）
│   └── {id}.json           # 各テンプレート本文
└── projects/
    └── {project-hash}.json # プロジェクト設定（選択テンプレートID含む）
```

### 3.2 index.json 形式

```json
{
  "version": 1,
  "templates": [
    {
      "id": "abc-123",
      "name": "my-rules",
      "enabled": true,
      "isBuiltIn": false,
      "createdAt": "2026-01-23T...",
      "updatedAt": "2026-01-23T..."
    }
  ]
}
```

### 3.3 テンプレート本文ファイル形式

```json
{
  "id": "abc-123",
  "name": "my-rules",
  "rulesText": "## Rules\n...",
  "outputFormatText": "## Output\n...",
  "enabled": true,
  "isBuiltIn": false,
  "createdAt": "2026-01-23T...",
  "updatedAt": "2026-01-23T..."
}
```

## 4. 注入メカニズム

### 4.1 注入タイミング

```
タスク投入
    │
    ▼
PromptAssembler.assemble()
    │
    ├── ProjectSettingsStore.get(projectPath)
    │   └── selectedTemplateId, templateEnabled
    │
    ├── [templateEnabled && selectedTemplateId]
    │   │
    │   ▼
    │   TemplateStore.get(selectedTemplateId)
    │   └── rulesText, outputFormatText
    │
    ▼
プロンプト組み立て
    │
    ├── システムプロンプト
    ├── [注入] rulesText
    ├── ユーザータスク
    └── [注入] outputFormatText
```

### 4.2 注入位置

```
[System Prompt]
...existing system instructions...

[Injected Rules - if enabled]
---
## Injected Rules (Template: {name})
{rulesText}
---

[User Task]
{userTask}

[Injected Output Format - if enabled]
---
## Required Output Format (Template: {name})
{outputFormatText}
---
```

### 4.3 context肥大化回避

1. **メタデータのみロード**: 起動時は `index.json` のみ読み込み
2. **遅延ロード**: テンプレート本文は使用時のみ読み込み
3. **キャッシュ**: 同一セッション内では本文をキャッシュ
4. **無効時スキップ**: `enabled: false` または未選択時は注入しない

## 5. API

### 5.1 TemplateStore

```typescript
class TemplateStore {
  // 一覧取得（メタデータのみ）
  list(): TemplateMetadata[];

  // 詳細取得（本文含む）
  get(id: string): Template | null;

  // 作成
  create(input: CreateTemplateInput): Template;

  // 更新
  update(id: string, input: UpdateTemplateInput): Template;

  // 削除（組み込みは削除不可）
  delete(id: string): boolean;

  // 組み込みテンプレート初期化
  initBuiltIn(): void;
}

interface CreateTemplateInput {
  name: string;
  rulesText: string;
  outputFormatText: string;
}

interface UpdateTemplateInput {
  name?: string;
  rulesText?: string;
  outputFormatText?: string;
  enabled?: boolean;
}
```

### 5.2 注入ヘルパー

```typescript
// PromptAssembler 内で使用
function injectTemplate(
  prompt: string,
  template: Template | null,
  position: 'rules' | 'output'
): string;
```

### 5.3 テンプレート選択フロー（Settings経由）

```typescript
// 1. ProjectSettingsStore でテンプレートを選択
const settingsStore = new ProjectSettingsStore();
await settingsStore.initialize('/path/to/project');
await settingsStore.setTemplate('goal_drift_guard');  // ID で指定

// 2. 選択状態を確認
const settings = settingsStore.get();
// settings.template.selectedId === 'goal_drift_guard'
// settings.template.enabled === true

// 3. TemplateStore からテンプレート取得
const templateStore = new TemplateStore();
await templateStore.initialize();
const activeTemplate = templateStore.get(settings.template.selectedId);

// 4. PromptAssembler で注入
const result = assembler.assemble(userInput, undefined, activeTemplate);
// result.sections.templateRules に Goal Drift Guard ルールが含まれる
// result.sections.templateOutputFormat に完了報告形式が含まれる
```

## 6. エラーハンドリング

### 6.1 破損時の挙動（fail-closed）

| 状態 | 挙動 |
|------|------|
| index.json 破損 | 警告表示、組み込みのみで起動 |
| テンプレートファイル破損 | 該当テンプレート無効化、警告表示 |
| 選択テンプレートが存在しない | 選択解除、警告表示 |

### 6.2 警告メッセージ

```
[WARN] Template file corrupted: abc-123.json - template disabled
[WARN] Selected template not found: xyz-456 - selection cleared
```

## 7. イベント

```typescript
type TemplateEvent =
  | { type: 'TEMPLATE_CREATED'; template: TemplateMetadata }
  | { type: 'TEMPLATE_UPDATED'; template: TemplateMetadata }
  | { type: 'TEMPLATE_DELETED'; id: string }
  | { type: 'TEMPLATE_INJECTED'; templateId: string; position: string }
  | { type: 'TEMPLATE_INJECTION_SKIPPED'; reason: string };
```

## 8. 制約

- テンプレート名: 1-50文字、英数字・ハイフン・アンダースコアのみ
- rulesText: 最大10,000文字
- outputFormatText: 最大5,000文字
- テンプレート数上限: 100個
- 組み込みテンプレートは編集・削除不可（コピーは可）

## 9. セキュリティ

- テンプレート本文はプレーンテキストとして保存
- 実行時のサニタイズは不要（LLMへのプロンプトとして使用）
- ファイルパーミッション: 0600（ユーザーのみ読み書き可）

## 10. 関連仕様

- spec/33_PROJECT_SETTINGS_PERSISTENCE.md - プロジェクト設定永続化
- spec/17_PROMPT_TEMPLATE.md - プロンプト組み立て
- spec/12_LLM_PROVIDER_AND_MODELS.md - LLMプロバイダー設定

## 11. Goal Drift Guard Enforcement Hook

### 11.1 概要

Goal_Drift_Guard テンプレートが選択されている場合、Review Loop は追加のエンフォースメントチェックを実行する。
このチェックは決定論的で、LLM呼び出しなしに出力を検証する。

### 11.2 Enforcement Criteria (GD1-GD5)

| ID | 名前 | 検出対象 | マッピング |
|----|------|----------|------------|
| GD1 | No Escape Phrases | "if needed", "optional", "consider adding" 等 | Q2相当 |
| GD2 | No Premature Completion | "basic implementation", "please verify" 等 | Q5相当 |
| GD3 | Requirement Checklist Present | チェックボックス形式の要件リスト | Q5相当 |
| GD4 | Valid Completion Statement | "COMPLETE: All N requirements fulfilled" 形式 | Q5相当 |
| GD5 | No Scope Reduction | "simplified version", "for now" 等 | Q3相当 |

### 11.3 Enforcement フロー

```
Review Loop 実行
    │
    ├── Q1-Q6 品質チェック
    │
    ├── [activeTemplateId === 'goal_drift_guard']
    │   │
    │   ▼
    │   Goal Drift Evaluator (GD1-GD5)
    │   │
    │   ├── PASS: 全GDチェック通過
    │   │
    │   └── FAIL: 構造化理由を生成
    │       │
    │       ▼
    │       Modification Prompt に GD 違反セクション追加
    │
    ▼
最終判定 (PASS/REJECT/RETRY)
```

### 11.4 構造化理由 (Structured Reasons)

違反検出時、以下の形式で機械可読な理由を提供:

```typescript
interface StructuredReason {
  criteria_id: 'GD1' | 'GD2' | 'GD3' | 'GD4' | 'GD5';
  violation_type: 'escape_phrase' | 'premature_completion' | 
                  'missing_checklist' | 'invalid_completion_statement' | 
                  'scope_reduction';
  description: string;
  evidence: string[];  // 行番号・コンテキスト
}
```

### 11.5 ゼロオーバーヘッド原則

- Goal_Drift_Guard テンプレートが選択されていない場合、エバリュエーターは実行されない
- トークン使用量の増加なし
- 既存の Q1-Q6 チェックへの影響なし

### 11.6 Fail-Closed 原則

- エバリュエーターでエラーが発生した場合、REJECT として扱う
- 不明な状態は安全側（REJECT）に倒す

### 11.7 API

```typescript
import { 
  runGoalDriftIntegration,
  generateGoalDriftModificationSection,
  GOAL_DRIFT_GUARD_TEMPLATE_ID,
} from './review-loop';

// テンプレートが goal_drift_guard の場合のみ実行
const gdResult = runGoalDriftIntegration(executorResult, activeTemplateId);

if (gdResult.ran && !gdResult.passed) {
  // 違反あり -> Modification Prompt に追加
  const modSection = generateGoalDriftModificationSection(gdResult.goalDriftResult!);
  modificationPrompt += modSection;
}
```

### 11.8 関連ファイル

- `src/review-loop/goal-drift-evaluator.ts` - エバリュエーター実装
- `src/review-loop/goal-drift-integration.ts` - Review Loop 統合
- `test/unit/review-loop/goal-drift-evaluator.test.ts` - ユニットテスト
- `test/unit/review-loop/goal-drift-integration.test.ts` - 統合テスト
