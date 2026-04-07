# Task Pipeline Specification

## Overview

PM Orchestrator Runner のタスク実行パイプライン仕様。
LLM Layer がユーザー入力を分析し、タスク分割・テスト・レビューを自動的に管理する。

## Architecture

```
User Input
  ↓
[Chat UI] ── ☑Test ☑Review チェックボックス
  ↓
[Chat API] ── addTest, addReview フラグ保存
  ↓
[LLM Layer: Meta Prompt + 分割判定]
  ├─ shouldSplit: false → 単一タスクとして enqueue
  └─ shouldSplit: true  → サブタスクに分割して enqueue
  ↓
[Queue Poller] ── タスク実行
  ↓
[Claude Code Executor] ── 実装タスク実行
  ↓ 完了時
[Post-Execution Pipeline]
  ├─ addTest=true  → テストタスクを別セッションで enqueue
  │   └─ [TEST ISOLATION MODE] 実装コード読み取り禁止
  ├─ addReview=true → レビュータスクを別セッションで enqueue
  │   └─ 品質チェック (Q1-Q12)
  └─ 親タスクに統合レポート追加
```

## 1. LLM ベースのタスク分割

### 1.1 Meta Prompt 生成時の分割判定

`generateMetaPrompt` のレスポンスを拡張:

```typescript
interface MetaPromptResult {
  metaPrompt: string;
  enhancements: string;
  usedProvider: string;
  // 新規追加
  shouldSplit: boolean;
  subtasks?: Array<{
    prompt: string;
    type: 'implementation' | 'test' | 'review' | 'research';
  }>;
  splitReason?: string;
}
```

### 1.2 分割判定の基準 (LLM に指示)

```
以下の場合にタスクを分割せよ:
1. 複数の独立した変更が含まれる場合 (例: "Aを追加し、Bも修正して")
2. 明示的に複数ステップが記述されている場合 (例: "1. ... 2. ... 3. ...")
3. 異なるファイル/コンポーネントに対する変更が含まれる場合
4. テスト作成と実装が同時に要求されている場合 → 必ず分割 (テスト分離)

以下の場合は分割しない:
1. 単一の質問や調査タスク
2. 1つのファイルの小さな修正
3. 情報確認のみのタスク
```

### 1.3 既存の regex ベース分割との共存

- LLM 分割が最優先 (Meta Prompt と同時に判定)
- LLM が分割不要と判断した場合のみ、regex ベースの `analyzeTaskForChunking` がフォールバック
- テスト分離 (`detectTestIsolationNeed`) は引き続き regex で検出

## 2. テスト・レビューの別セッション実行

### 2.1 Chat UI チェックボックス

チャット入力エリアの上部に:

```
☑ Add Test (別セッションでテスト生成)
☑ Add Review (別セッションでレビュー)
```

デフォルト: 両方 OFF (コスト考慮)

### 2.2 API フラグ

`POST /api/projects/:projectId/chat` のリクエストボディに追加:

```typescript
{
  content: string;
  taskGroupId?: string;
  addTest?: boolean;   // テスト追加
  addReview?: boolean; // レビュー追加
}
```

### 2.3 フラグの保存

Queue Item に `pipeline_options` を追加:

```typescript
interface QueueItem {
  // 既存フィールド...
  pipeline_options?: {
    addTest: boolean;
    addReview: boolean;
  };
}
```

### 2.4 Post-Execution Pipeline

タスク完了後 (status = COMPLETE) に、`pipeline_options` に基づいてサブタスクを enqueue:

```typescript
// cli/index.ts の COMPLETE 処理後
if (item.pipeline_options?.addTest) {
  await queueStore.enqueue(
    item.session_id,
    item.task_group_id,
    `[TEST ISOLATION MODE]\n\nWrite tests for the changes made by parent task ${item.task_id}.\nDO NOT read implementation source code.\nBase tests on specifications and public interfaces only.\n\nOriginal task: ${item.prompt}`,
    `${item.task_id}-test`,
    'IMPLEMENTATION',
    item.project_path,
    item.task_id  // parent_task_id
  );
}

if (item.pipeline_options?.addReview) {
  await queueStore.enqueue(
    item.session_id,
    item.task_group_id,
    `[CODE REVIEW MODE]\n\nReview the changes made by parent task ${item.task_id}.\nCheck for: correctness, security, code quality, test coverage.\nProvide a structured report with PASS/WARN/FAIL for each criterion.\n\nOriginal task: ${item.prompt}`,
    `${item.task_id}-review`,
    'READ_INFO',
    item.project_path,
    item.task_id
  );
}
```

### 2.5 統合レポート

親タスクの Task Detail に、子タスク (テスト・レビュー) の結果を表示:

```
┌─ 実装: COMPLETE ✓
├─ テスト: COMPLETE ✓ (3 tests passed)
└─ レビュー: COMPLETE ✓ (7/7 PASS)
```

## 3. Data Model 変更

### QueueItem 拡張

```typescript
interface QueueItem {
  // 既存...
  pipeline_options?: {
    addTest: boolean;
    addReview: boolean;
  };
}
```

### enqueue() パラメータ

`pipeline_options` はメタデータとして保存。`enqueue` の signature は変更せず、
`QueueItem` の追加フィールドとして直接設定。

## 4. 実装順序

1. **仕様書作成** (このドキュメント)
2. **Meta Prompt に分割判定を追加** (`question-detector.ts`)
3. **Chat UI にチェックボックス追加** (`index.html`)
4. **Chat API に addTest/addReview フラグ追加** (`chat.ts`)
5. **QueueItem に pipeline_options 追加** (`queue-store.ts`)
6. **Post-Execution Pipeline 実装** (`cli/index.ts`)
7. **Task Detail に統合レポート表示** (`index.html`)
8. **テスト追加**
