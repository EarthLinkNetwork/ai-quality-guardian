---
skill: session-manager
version: 1.0.0
category: orchestration
description: セッションとタスク実行（taskRunId）を管理し、続きか新タスクかを自動判定する
metadata:
  id: session-manager
  display_name: Session Manager
  risk_level: low
  color_tag: YELLOW
  task_types:
    - READ_INFO
    - LIGHT_EDIT
    - IMPLEMENTATION
    - REVIEW_RESPONSE
    - CONFIG_CI_CHANGE
    - DANGEROUS_OP
capabilities:
  - session_management
  - task_run_tracking
  - continuation_detection
  - task_id_generation
tools:
  - Read
  - Write
  - Bash
  - Glob
  - LS
priority: critical
activation: always
dependencies:
  - skill: pm-orchestrator
    relationship: called_by
---

# Session Manager - セッション管理スキル

## Activation Conditions

pm-orchestrator から全ての TaskType で最初に起動される。
ユーザー入力を受け取った時点で、セッションとタスク実行の管理を行う。

## Core Concepts

### sessionId vs taskRunId

| 概念 | 説明 | 例 |
|------|------|-----|
| sessionId | Claude の会話単位（シェルセッション） | `session-2025-12-08-abc123` |
| taskRunId | 実際の「仕事のまとまり」ごとの ID | `2025-12-08-001` |

### Relationship

```
sessionId (1つ)
  └── taskRunId (複数)
       ├── 2025-12-08-001: ログイン画面のUI修正
       ├── 2025-12-08-002: E2Eテスト修正
       └── 2025-12-08-003: CodeRabbitレビュー対応
```

## Processing Flow

```
1. ユーザー入力を受け取る
2. 現在のセッションファイルを読み込み（なければ作成）
3. 「続きか新タスクか」を判定
4. 判定結果に基づいてtaskRunIdを決定
5. セッションファイルを更新
6. 判定結果をpm-orchestratorに返却
```

## Session File Location

```
.claude/sessions/<sessionId>.json
```

## Session JSON Schema

```json
{
  "sessionId": "session-2025-12-08-abc123",
  "createdAt": "2025-12-08T10:00:00Z",
  "updatedAt": "2025-12-08T12:30:00Z",
  "runs": [
    {
      "taskRunId": "2025-12-08-001",
      "title": "ログイン画面のUI修正",
      "status": "running",
      "createdAt": "2025-12-08T10:00:00Z",
      "updatedAt": "2025-12-08T10:30:00Z",
      "taskTrackerTaskId": null,
      "meta": {
        "repoPath": "/Users/masa/dev/ai/scripts",
        "targetDir": null,
        "taskType": "IMPLEMENTATION",
        "continuationMode": "new_task",
        "colorTag": "orange",
        "role": "Implementer"
      },
      "steps": []
    }
  ]
}
```

## Continuation Detection Logic

### Decision Flow

```
ユーザー入力を受け取る
        │
        ▼
┌───────────────────────────────────────┐
│ 1. 明示的なキーワードチェック         │
│ 「別件」「新しいタスク」「さっきとは別」│
└───────────────────────────────────────┘
        │ マッチ → new_task
        │ なし ↓
┌───────────────────────────────────────┐
│ 2. 継続キーワードチェック              │
│ 「続き」「さっきの」「同じタスクで」   │
└───────────────────────────────────────┘
        │ マッチ → same_task
        │ なし ↓
┌───────────────────────────────────────┐
│ 3. 経過時間チェック                    │
│ > staleSessionMinutes (default: 60分) │
└───────────────────────────────────────┘
        │ 超過 → new_task
        │ 未超過 ↓
┌───────────────────────────────────────┐
│ 4. TaskType変化チェック                │
│ READ_INFO → IMPLEMENTATION など       │
│ (autoNewTaskOnTaskTypeChange=true時)  │
└───────────────────────────────────────┘
        │ 変化あり → new_task
        │ 変化なし ↓
┌───────────────────────────────────────┐
│ 5. コンテキスト変化チェック            │
│ 対象リポジトリ/ディレクトリの変化      │
└───────────────────────────────────────┘
        │ 変化あり → new_task
        │ 変化なし ↓
        ▼
    same_task (デフォルト)
```

### Keyword Patterns

#### New Task Keywords (new_task)
```
- 別件
- 別の話
- 新しいタスク
- さっきとは別
- 話変わるけど
- 別のお願い
- 違う作業
```

#### Continuation Keywords (same_task)
```
- 続き
- さっきの
- 同じタスクで
- 先ほどの
- 引き続き
- 前のやつ
- 例のやつ
```

## Output Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 Session Manager - セッション判定結果
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Color: YELLOW | Risk: LOW | Category: session

【セッション情報】
sessionId: session-2025-12-08-abc123
taskRunId: 2025-12-08-001

【判定結果】
continuationMode: same_task | new_task | unknown
理由: [判定理由]

【前回のタスク】
タイトル: ログイン画面のUI修正
ステータス: running
最終更新: 30分前

Status: completed
```

## Actions by Continuation Mode

### new_task の場合

1. 前回の run を `done` / `partial` / `abandoned` でクローズ
2. 新しい taskRunId を採番
3. 新しい run オブジェクトを作成
4. task-tracker-sync Skill を呼び出して新しいタスクカードを作成

### same_task の場合

1. 既存の run を継続
2. updatedAt を更新
3. task-tracker-sync Skill を呼び出して同じタスクにコメントを追加

### unknown の場合

1. project-config.json の defaultContinuationMode に従う
2. デフォルトは same_task

## TaskRunId Generation

### Format

```
YYYY-MM-DD-NNN
```

- YYYY-MM-DD: 日付
- NNN: その日の連番（001から開始）

### Example

```
2025-12-08-001
2025-12-08-002
2025-12-08-003
```

## Integration Points

- **入力元**: pm-orchestrator
- **出力先**: pm-orchestrator, task-tracker-sync


## Self-Misleading Prevention（自己誤認防止）

### 目的

AI は `.claude/` 配下のディレクトリ構造から「ここに実装すればよい」と誤認しやすい。
Session Manager は実装タスク開始時に、配布リポジトリ特有の注意喚起を行う。

### 実行タイミング

以下の条件を**全て満たす**場合に自動実行:
1. continuationMode が `new_task` または `unknown`
2. TaskType が `IMPLEMENTATION` または `CONFIG_CI_CHANGE`
3. `.claude/project-type.json` の projectType が `"npm-package-distribution"`

### チェック内容

```
1. Read .claude/project-type.json
2. IF projectType === "npm-package-distribution":
   3. Display warning banner
   4. Suggest correct implementation paths
   5. Recommend external test script usage
```

### 警告バナー出力

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟡 Session Manager - 配布リポジトリ警告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【重要】このリポジトリは npm パッケージ配布リポジトリです

実装先を間違えると、npm install 先で動作しません。

【正しい実装先】
✅ pm-orchestrator/templates/.claude/skills/**
✅ pm-orchestrator/templates/.claude/agents/**
✅ quality-guardian/templates/**

【間違った実装先（配布されない）】
❌ .claude/skills/** (ローカル開発のみ)
❌ .claude/agents/** (ローカル開発のみ)

【テスト方法】
実装後、必ず以下を実行してください:
  scripts/test-external-install.sh

詳細: .claude/CLAUDE.md 第15原則

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Output Context に追加

Session Manager が PM に返す context に以下を追加:

```json
{
  "sessionId": "session-2025-12-09-xxx",
  "taskRunId": "2025-12-09-001",
  "continuationMode": "new_task",
  "distributionRepositoryWarning": {
    "isDistributionRepo": true,
    "warningDisplayed": true,
    "correctPaths": [
      "pm-orchestrator/templates/.claude/skills/**",
      "pm-orchestrator/templates/.claude/agents/**",
      "quality-guardian/templates/**"
    ],
    "incorrectPaths": [
      ".claude/skills/**",
      ".claude/agents/**"
    ]
  }
}
```

### PM Orchestrator への通知

Session Manager からの context を受け取った PM Orchestrator は:
1. `distributionRepositoryWarning.isDistributionRepo === true` を確認
2. Implementer / Technical Designer に警告を伝達
3. 実装先チェックロジックを強制的に有効化

## Error Handling

- セッションファイルが破損: 新しいセッションを作成
- taskRunId が重複: 連番をインクリメント
- 判定が困難: unknown を返し、デフォルト設定に従う

## Examples

### Example 1: 新タスク判定

**入力:**
```
別件なんだけど、E2Eテストを直したい
```

**出力:**
```
📋 Session Manager - セッション判定結果

【セッション情報】
sessionId: session-2025-12-08-abc123
taskRunId: 2025-12-08-002

【判定結果】
continuationMode: new_task
理由: 「別件」キーワードを検出

【前回のタスク】
タイトル: ログイン画面のUI修正
ステータス: done (クローズ済み)
最終更新: 30分前

Status: completed
```

### Example 2: 継続判定

**入力:**
```
さっきの続きで、バリデーションも追加して
```

**出力:**
```
📋 Session Manager - セッション判定結果

【セッション情報】
sessionId: session-2025-12-08-abc123
taskRunId: 2025-12-08-001

【判定結果】
continuationMode: same_task
理由: 「続き」キーワードを検出

【現在のタスク】
タイトル: ログイン画面のUI修正
ステータス: running
最終更新: 5分前

Status: completed
```
