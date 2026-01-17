# 16_TASK_GROUP.md

# Task Group 定義

本章は Task Group の概念と振る舞いを定義する。

Task Group は 05_DATA_MODELS.md の Thread 概念を拡張し、
「会話・思考・文脈の単位」としての役割を明確化する。


## 階層構造（Session → Task Group → Task）

```
Session
├── Task Group A (main conversation)
│   ├── Task 1 (Claude Code CLI 実行)
│   ├── Task 2 (Claude Code CLI 実行)
│   └── Task 3 (Claude Code CLI 実行)
├── Task Group B (separate context)
│   └── Task 4 (Claude Code CLI 実行)
└── Task Group C (another context)
    ├── Task 5 (Claude Code CLI 実行)
    └── Task 6 (Claude Code CLI 実行)
```


## Task Group とは

Task Group は「会話・思考・文脈の単位」である。

- Claude に渡すコンテキストの境界
- ユーザーが明示的に切り替え可能
- Task Group を跨いで文脈は共有しない


## Task Group が持つもの

- task_group_id（一意識別子）
- session_id（親 Session への参照）
- created_at（作成日時）
- description（説明）
- context_state（文脈状態: active / paused / completed）


## Task との関係

- Task は必ず Task Group に属する
- 1 Task = 1 Claude Code CLI 実行
- Task 完了後も Task Group は継続する
- Task Group 終了は明示的な操作（/endgroup 等）または Session 終了時


## コンテキスト継承規則（重要）

### Task Group 内で継承されるもの

| 項目 | 継承 | 備考 |
|------|------|------|
| 会話履歴 | YES | 前のタスクの入力・出力を参照可能 |
| 作業ファイル一覧 | YES | 変更したファイルのリスト |
| 変数・設定値 | YES | task group prelude に含まれる |
| エラー履歴 | YES | 直前のエラー情報 |
| 成功した操作 | YES | 完了したタスクの要約 |

### Task Group 間で継承されないもの

| 項目 | 継承 | 備考 |
|------|------|------|
| 会話履歴 | NO | 新しい Task Group は白紙から開始 |
| 作業途中の状態 | NO | 他の Task Group の中断状態は見えない |
| 変数・設定値 | NO | Task Group 固有の値は共有しない |

### Session レベルで共有されるもの

| 項目 | 共有 | 備考 |
|------|------|------|
| project_root | YES | プロジェクトパスは Session 共通 |
| provider / model | YES | LLM 設定は Session 共通 |
| Session ID | YES | 全 Task Group で共通 |
| ファイルシステム | YES | 実際のファイルは共有される |


## Task Group 内で文脈が維持される仕組み

### 1. Prompt 構築時の context injection

```
task_group_prelude = generateTaskGroupPrelude(task_group_id)

// task_group_prelude には以下が含まれる:
// - この会話の目的
// - これまでの会話要約
// - 直前のタスク結果
// - 作業中のファイル一覧
```

### 2. 会話履歴の保持

```typescript
interface TaskGroupContext {
  task_group_id: string;
  conversation_history: ConversationEntry[];
  working_files: string[];
  last_task_result: TaskResult | null;
  accumulated_changes: FileChange[];
}
```

### 3. タスク完了後の文脈更新

```
Task 完了時:
1. 会話履歴に Task 結果を追加
2. working_files を更新
3. last_task_result を更新
4. Task Group は active のまま（終了しない）
```


## Task Group と Thread の対応

05_DATA_MODELS.md の Thread は技術的な実装単位である。
Task Group は論理的な会話単位である。

- Thread (thread_type=main) が Task Group に対応する
- Thread (thread_type=background) は Executor 処理用
- Thread (thread_type=system) はシステム内部用


## Task Group のライフサイクル

```
[Created] → [Active] → [Completed]
              ↓ ↑
           [Paused]

状態遷移:
- Created → Active: 最初のタスク投入時
- Active → Paused: ユーザーが一時停止
- Paused → Active: ユーザーが再開
- Active → Completed: ユーザーが明示的に終了
- Completed: 読み取り専用（変更不可）
```


## Cross-References

- 05_DATA_MODELS.md (Thread / Task データ構造)
- 04_COMPONENTS.md (Session / Task 定義)
- 17_PROMPT_TEMPLATE.md (task group prelude の構築)
