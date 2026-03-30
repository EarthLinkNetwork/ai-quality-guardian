# 35. PR Review Automation (CodeRabbit Auto-Response with LLM Oversight)

## 1. 概要

### 1.1 目的

PR 作成後に到着する CodeRabbit 等の自動レビュー指摘を、LLM レイヤーで分析・判断し、
Claude Code で修正を実行する自動対応サイクルを実現する。
ユーザーはダッシュボードで判断結果を確認・承認するだけで、レビュー対応が完了する。

### 1.2 背景

- PR 作成後、CodeRabbit が自動レビューを実行する
- 修正を push するたびに CodeRabbit が再レビューを行う
- 現状、各指摘の対応判断と修正はユーザーが手動で行っている
- LLM レイヤーによる判断 + Claude Code による実行で、このサイクルを自動化する

### 1.3 設計原則

- **LLM = 上位設計管理者・オブザーバー**: Claude Code より正確な判断ができる品質担保レイヤー（コスト削減ではない）
- **Claude Code = 実行者**: ファイル操作・Git 操作を行うが、判断は LLM に委譲
- **Human-in-the-Loop**: ユーザーがダッシュボードで最終確認・承認してから修正を実行
- **サイクル管理**: CodeRabbit の再レビューを含む反復サイクルをLLMが終了判定するまで継続
- **無限ループ防止**: 重複検出・サイクル上限・ユーザーエスカレーションで安全に停止
- **Single-Table Design**: 既存 `pm-project-indexes` テーブルに統合
- **DAL パターン準拠**: `IDataAccessLayer` インターフェースに追加
- **Hybrid DAL**: DynamoDAL + NoDynamo フォールバック踏襲

---

## 2. Single-Table 設計

### 2.1 テーブル: `pm-project-indexes`（既存テーブルを拡張）

**新規追加エンティティ:**

| PK | SK | エンティティ | 説明 |
|----|-----|-------------|------|
| `ORG#<orgId>` | `PR#<projectId>#<prNumber>` | PRReviewState | PR のレビュー対応状態 |
| `ORG#<orgId>` | `PRCOMMENT#<projectId>#<prNumber>#<commentId>` | PRReviewComment | 個別の指摘とその判断結果 |
| `ORG#<orgId>` | `PRCYCLE#<projectId>#<prNumber>#<cycle>` | PRReviewCycle | サイクルごとの実行記録 |

### 2.2 なぜ `pm-project-indexes` に統合するか

1. **ProjectIndex と PR は N:1 対応** — 同じ projectId で紐づく
2. **Query で PR 関連データを一括取得可能** — `PK=ORG#xxx, SK begins_with PR#projId#prNum`
3. **テーブル数削減** — 新テーブル作成不要
4. **既存の DAL パターンに自然に統合** — DynamoDAL の `orgId` PK パターンを踏襲
5. **TaskTracker (spec/34) と同じ統合パターン**

---

## 3. データモデル

### 3.1 PRReviewState エンティティ（メイン）

PR ごとに 1 レコード。レビュー対応の全体状態を管理する。

```typescript
interface PRReviewState {
  // DynamoDB Keys
  PK: string;                          // ORG#<orgId>
  SK: string;                          // PR#<projectId>#<prNumber>

  // Identifiers
  projectId: string;
  orgId: string;
  prNumber: number;

  // PR Metadata
  prTitle: string;
  prUrl: string;
  baseBranch: string;
  headBranch: string;
  repository: string;                  // owner/repo

  // Review State
  status: PRReviewStatus;
  currentCycle: number;                // 現在のサイクル番号（1-based）
  maxCycles: number;                   // サイクル上限（デフォルト: 5）

  // Comment Summary
  totalComments: number;               // 全コメント数（累計）
  pendingComments: number;             // 未対応コメント数
  acceptedComments: number;            // 取り入れたコメント数
  rejectedComments: number;            // 取り入れないコメント数
  escalatedComments: number;           // ユーザー確認が必要なコメント数

  // Cycle History
  lastReviewArrivedAt: string | null;  // 最新レビュー到着時刻（ISO8601）
  lastFixPushedAt: string | null;      // 最新修正 push 時刻（ISO8601）

  // Metadata
  version: number;                     // 楽観的ロック用バージョン
  createdAt: string;                   // ISO8601
  updatedAt: string;                   // ISO8601
  ttl?: number;                        // 自動クリーンアップ（90日）
}

type PRReviewStatus =
  | 'REVIEW_PENDING'      // PR 作成直後、レビュー待ち
  | 'REVIEW_ARRIVED'      // CodeRabbit レビュー到着
  | 'ANALYZING'           // LLM が各指摘を分析中
  | 'AWAITING_APPROVAL'   // ユーザー承認待ち（判断結果のレビュー）
  | 'FIXING'              // Claude Code が修正を実行中
  | 'FIX_PUSHED'          // 修正 push 完了、再レビュー待ち
  | 'REVIEW_COMPLETE'     // 全サイクル完了
  | 'ESCALATED'           // ユーザー手動対応が必要
  | 'CYCLE_LIMIT_REACHED' // サイクル上限到達
  | 'ERROR';              // エラー発生
```

### 3.2 PRReviewComment エンティティ（個別指摘）

CodeRabbit の各指摘とその LLM 判断結果を保持する。

```typescript
interface PRReviewComment {
  // DynamoDB Keys
  PK: string;                          // ORG#<orgId>
  SK: string;                          // PRCOMMENT#<projectId>#<prNumber>#<commentId>

  // Identifiers
  commentId: string;                   // GitHub comment ID
  projectId: string;
  orgId: string;
  prNumber: number;

  // Comment Content
  filePath: string;                    // 指摘対象ファイル
  lineRange?: { start: number; end: number };  // 指摘対象行
  body: string;                        // 指摘本文
  category: CommentCategory;           // LLM が分類したカテゴリ
  severity: CommentSeverity;           // LLM が判定した重要度

  // LLM Judgment
  judgment: CommentJudgment;
  judgmentReason: string;              // 判断理由（ユーザー向け説明）
  judgmentConfidence: number;          // 判断の確信度（0.0-1.0）
  suggestedFix?: string;              // LLM が提案する修正方針
  llmModel: string;                   // 判断に使用した LLM モデル

  // Execution
  fixApplied: boolean;                // 修正が適用されたか
  fixCommitHash?: string;             // 修正コミットハッシュ
  fixDescription?: string;            // 修正内容の説明

  // Cycle Tracking
  detectedInCycle: number;            // 最初に検出されたサイクル
  lastSeenInCycle: number;            // 最後に検出されたサイクル
  isDuplicate: boolean;               // 重複指摘か
  duplicateOfCommentId?: string;      // 重複元の commentId

  // User Override
  userOverride?: UserOverride;        // ユーザーによる判断の上書き

  // Metadata
  createdAt: string;                  // ISO8601
  updatedAt: string;                  // ISO8601
}

type CommentCategory =
  | 'BUG'                 // バグ・ロジックエラー
  | 'SECURITY'            // セキュリティ問題
  | 'PERFORMANCE'         // パフォーマンス問題
  | 'TYPE_SAFETY'         // 型安全性
  | 'ERROR_HANDLING'      // エラーハンドリング
  | 'STYLE'              // コードスタイル・フォーマット
  | 'NAMING'             // 命名規則
  | 'DOCUMENTATION'      // ドキュメント・コメント
  | 'BEST_PRACTICE'      // ベストプラクティス
  | 'ARCHITECTURE'       // アーキテクチャ・設計
  | 'TEST'               // テスト関連
  | 'OTHER';             // その他

type CommentSeverity =
  | 'CRITICAL'           // 必ず修正すべき
  | 'HIGH'               // 修正推奨
  | 'MEDIUM'             // 検討推奨
  | 'LOW'                // 好み・スタイルレベル
  | 'INFO';              // 情報提供のみ

type CommentJudgment =
  | 'ACCEPT'             // 取り入れる（修正する）
  | 'REJECT'             // 取り入れない（理由あり）
  | 'ESCALATE'           // ユーザーに判断を委ねる
  | 'ALREADY_FIXED'      // 既に修正済み
  | 'DUPLICATE';         // 重複指摘

interface UserOverride {
  action: 'ACCEPT' | 'REJECT' | 'DEFER';
  reason?: string;
  overriddenAt: string;               // ISO8601
}
```

### 3.3 PRReviewCycle エンティティ（サイクル記録）

各サイクルの実行結果を記録する。サイクル間の差分分析に使用。

```typescript
interface PRReviewCycle {
  // DynamoDB Keys
  PK: string;                          // ORG#<orgId>
  SK: string;                          // PRCYCLE#<projectId>#<prNumber>#<cycle>

  // Identifiers
  projectId: string;
  orgId: string;
  prNumber: number;
  cycleNumber: number;                 // 1-based

  // Cycle Content
  reviewCommentIds: string[];          // このサイクルで検出されたコメント ID 一覧
  newCommentCount: number;             // 新規指摘数
  resolvedCommentCount: number;        // このサイクルで解決された指摘数
  duplicateCommentCount: number;       // 重複指摘数

  // LLM Decision
  llmCycleSummary: string;             // LLM によるサイクルの要約
  llmContinueDecision: CycleDecision;  // 続行判断
  llmDecisionReason: string;           // 判断理由

  // Execution
  fixCommitHash?: string;              // このサイクルの修正コミット
  filesModified: string[];             // 修正されたファイル一覧

  // Timing
  reviewArrivedAt: string;             // レビュー到着時刻
  analysisCompletedAt?: string;        // LLM 分析完了時刻
  userApprovedAt?: string;             // ユーザー承認時刻
  fixPushedAt?: string;                // 修正 push 時刻

  // Metadata
  createdAt: string;                   // ISO8601
}

type CycleDecision =
  | 'CONTINUE'            // 新しい有効な指摘があり、修正して再レビュー
  | 'COMPLETE'            // 全指摘対応済みまたは残りは取り入れ不要
  | 'ESCALATE'            // ユーザー判断が必要な指摘がある
  | 'CYCLE_LIMIT';        // サイクル上限到達
```

---

## 4. GitHub API アダプター

### 4.1 インターフェース

GitHub API との通信を抽象化する。`octokit` または `gh` CLI のどちらでも実装可能。

```typescript
interface IGitHubAdapter {
  // PR Information
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestInfo>;
  listPRReviewComments(owner: string, repo: string, prNumber: number): Promise<GitHubReviewComment[]>;
  listPRIssueComments(owner: string, repo: string, prNumber: number): Promise<GitHubIssueComment[]>;

  // Comment Interaction
  replyToComment(owner: string, repo: string, prNumber: number, commentId: number, body: string): Promise<void>;
  createIssueComment(owner: string, repo: string, prNumber: number, body: string): Promise<void>;

  // PR Status
  getPRChecks(owner: string, repo: string, prNumber: number): Promise<CheckRunInfo[]>;
  getPRReviewStatus(owner: string, repo: string, prNumber: number): Promise<ReviewStatusInfo>;
}

interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  state: 'open' | 'closed' | 'merged';
  repository: string;
  author: string;
  createdAt: string;
}

interface GitHubReviewComment {
  id: number;
  body: string;
  path: string;
  line?: number;
  startLine?: number;
  user: string;
  createdAt: string;
  updatedAt: string;
  inReplyToId?: number;
}

interface GitHubIssueComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}
```

### 4.2 実装方針

Phase 1 では `gh` CLI ベースの実装を採用する:
- 追加依存パッケージなし（`gh` は開発環境に既存）
- `child_process.execFile` で `gh api` を呼び出す
- JSON 出力をパース

Phase 2 で `@octokit/rest` への移行を検討（レート制限対応、型安全性向上）。

```typescript
class GhCliGitHubAdapter implements IGitHubAdapter {
  async listPRReviewComments(owner: string, repo: string, prNumber: number): Promise<GitHubReviewComment[]> {
    const result = await execFile('gh', [
      'api',
      `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      '--paginate',
      '--jq', '.[].{id:.id,body:.body,path:.path,line:.line,startLine:.start_line,user:.user.login,createdAt:.created_at,updatedAt:.updated_at,inReplyToId:.in_reply_to_id}'
    ]);
    return JSON.parse(`[${result.stdout.trim().split('\n').join(',')}]`);
  }
}
```

---

## 5. LLM 判断レイヤー

### 5.1 役割分担

```
┌──────────────────────────────────────────────────────┐
│ LLM レイヤー（上位設計管理者・オブザーバー）               │
│                                                      │
│ - 各指摘の分類（カテゴリ・重要度）                       │
│ - 取り入れ判断（ACCEPT / REJECT / ESCALATE）           │
│ - 修正方針の策定                                       │
│ - サイクル終了判定                                     │
│ - 重複検出                                            │
│                                                      │
│ 使用モデル: claude-sonnet / gpt-4o（精度優先）          │
├──────────────────────────────────────────────────────┤
│ Claude Code（実行者）                                  │
│                                                      │
│ - ファイルの読み取り・修正                              │
│ - テスト実行                                          │
│ - Git commit / push                                  │
│ - PR 操作                                            │
└──────────────────────────────────────────────────────┘
```

### 5.2 指摘分析プロンプト

```typescript
const COMMENT_ANALYSIS_SYSTEM_PROMPT = `You are a senior code reviewer analyzing automated review comments on a pull request.

For each comment, you must determine:
1. Category: What type of issue is this? (BUG, SECURITY, PERFORMANCE, TYPE_SAFETY, ERROR_HANDLING, STYLE, NAMING, DOCUMENTATION, BEST_PRACTICE, ARCHITECTURE, TEST, OTHER)
2. Severity: How critical is this? (CRITICAL, HIGH, MEDIUM, LOW, INFO)
3. Judgment: Should we fix this? (ACCEPT, REJECT, ESCALATE)
4. Reason: Why this judgment? (Clear explanation for the human reviewer)
5. Suggested fix: If ACCEPT, what should be done? (Brief description of the fix)

Judgment guidelines:
- ACCEPT: The comment identifies a real issue that should be fixed. This includes bugs, security issues, type safety problems, missing error handling.
- REJECT: The comment is about style preference, subjective naming, or the suggestion would introduce unnecessary complexity. Always provide a clear reason.
- ESCALATE: The comment touches on architecture decisions, trade-offs, or business logic that requires human judgment.

Be strict about ACCEPT - only accept comments that genuinely improve code quality.
Be honest about REJECT - stylistic preferences from automated tools are not worth fixing.

Output JSON array:
[{
  "commentId": "string",
  "category": "BUG|SECURITY|...",
  "severity": "CRITICAL|HIGH|...",
  "judgment": "ACCEPT|REJECT|ESCALATE",
  "judgmentReason": "string (100 chars max)",
  "judgmentConfidence": 0.0-1.0,
  "suggestedFix": "string or null"
}]`;
```

### 5.3 サイクル終了判定プロンプト

```typescript
const CYCLE_DECISION_SYSTEM_PROMPT = `You are deciding whether another review cycle is needed for a pull request.

You are given:
- The current cycle number and max cycles
- New comments from the latest review
- History of previous cycles
- Which comments are duplicates of previous cycles

Decision criteria:
- CONTINUE: There are new, valid comments that should be addressed (not duplicates, not style-only)
- COMPLETE: All new comments are either: zero comments, style/preference only, or duplicates of previously addressed/rejected comments
- ESCALATE: There are new comments that require human judgment (architecture, business logic)
- CYCLE_LIMIT: Current cycle equals max cycles

Output JSON:
{
  "decision": "CONTINUE|COMPLETE|ESCALATE|CYCLE_LIMIT",
  "reason": "string (200 chars max)",
  "summary": "string (500 chars max) - Summary of this cycle for the dashboard",
  "newValidCommentCount": number,
  "duplicateCommentCount": number,
  "styleOnlyCommentCount": number
}`;
```

### 5.4 重複検出ロジック

サイクル間で同じファイル・同じ行・類似内容の指摘を検出する。

```typescript
interface DuplicateDetectionInput {
  newComment: GitHubReviewComment;
  previousComments: PRReviewComment[];
}

async function detectDuplicate(
  input: DuplicateDetectionInput,
  llm: LLMClient
): Promise<{ isDuplicate: boolean; duplicateOfCommentId?: string; confidence: number }> {
  // Step 1: 高速フィルタ（同一ファイル + 近接行）
  const sameFileComments = input.previousComments.filter(
    prev => prev.filePath === input.newComment.path
  );

  if (sameFileComments.length === 0) {
    return { isDuplicate: false, confidence: 1.0 };
  }

  // Step 2: 行範囲の重なり検出
  const nearbyComments = sameFileComments.filter(prev => {
    if (!prev.lineRange || !input.newComment.line) return false;
    const distance = Math.abs(prev.lineRange.start - (input.newComment.startLine ?? input.newComment.line!));
    return distance <= 5; // 5行以内は近接とみなす
  });

  if (nearbyComments.length === 0) {
    return { isDuplicate: false, confidence: 0.9 };
  }

  // Step 3: LLM で内容の類似性を判定（コスト節約のため haiku/mini を使用）
  const result = await llm.generate({
    systemPrompt: 'Compare two review comments. Are they pointing out the same issue? Output JSON: { "isDuplicate": boolean, "confidence": 0.0-1.0, "reason": "string" }',
    userPrompt: `New comment: ${input.newComment.body}\n\nPrevious comment: ${nearbyComments[0].body}`,
    maxTokens: 200,
    temperature: 0,
    model: 'low-cost', // haiku / gpt-4o-mini
  });

  return JSON.parse(result);
}
```

---

## 6. メインフロー

### 6.1 全体フロー図

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: PR 作成 → 登録                                             │
│                                                                     │
│ Claude Code が PR 作成                                              │
│   → PRReviewState 作成（status: REVIEW_PENDING, cycle: 0）          │
│   → DynamoDB に保存                                                 │
│   → ダッシュボードに「レビュー待ち」表示                               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 2: レビュー到着 → 分析                                         │
│                                                                     │
│ ユーザーがダッシュボードで「レビュー到着」を確認                        │
│   → 「レビュー対応」ボタンを押す                                      │
│   → GitHub API でコメント取得                                        │
│   → cycle++ → PRReviewCycle 作成                                     │
│   → LLM が各指摘を分析（カテゴリ・重要度・判断）                       │
│   → 重複検出（cycle >= 2 の場合）                                    │
│   → PRReviewComment 一括保存                                        │
│   → status: AWAITING_APPROVAL                                       │
│   → ダッシュボードに判断結果を表示                                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 3: ユーザー承認 → 修正実行                                     │
│                                                                     │
│ ユーザーがダッシュボードで判断結果を確認                               │
│   ├─ 全て OK → 「承認して修正実行」ボタン                             │
│   ├─ 一部変更 → ユーザーが判断を上書き → 「承認して修正実行」          │
│   └─ 全て却下 → 「修正不要で完了」ボタン → REVIEW_COMPLETE            │
│                                                                     │
│ 承認後:                                                              │
│   → status: FIXING                                                  │
│   → Claude Code が ACCEPT 判定のコメントを順に修正                    │
│   → テスト実行                                                      │
│   → commit → push                                                   │
│   → PRReviewCycle.fixCommitHash 記録                                │
│   → status: FIX_PUSHED                                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 4: 再レビュー → サイクル判定                                    │
│                                                                     │
│ CodeRabbit が再レビュー → status: REVIEW_ARRIVED                    │
│   → ダッシュボードに「再レビュー到着」表示                             │
│   → ユーザーが「レビュー対応」ボタン                                  │
│   → Phase 2 に戻る                                                   │
│                                                                     │
│ LLM サイクル終了判定:                                                │
│   ├─ CONTINUE → Phase 2 に戻る                                      │
│   ├─ COMPLETE → status: REVIEW_COMPLETE → 終了                       │
│   ├─ ESCALATE → status: ESCALATED → ユーザー手動対応                 │
│   └─ CYCLE_LIMIT → status: CYCLE_LIMIT_REACHED → ユーザー通知        │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 状態遷移図

```
REVIEW_PENDING ─── レビュー到着 ──→ REVIEW_ARRIVED
                                        │
                                ユーザーが「レビュー対応」
                                        │
                                        ▼
                                    ANALYZING
                                        │
                                   LLM 分析完了
                                        │
                                        ▼
                                AWAITING_APPROVAL
                                   │    │    │
                    ┌──────────────┘    │    └──────────────┐
                    ▼                   ▼                   ▼
             「修正不要」で完了    ユーザー承認        「エスカレート」
                    │                   │                   │
                    ▼                   ▼                   ▼
             REVIEW_COMPLETE        FIXING              ESCALATED
                                        │
                                   修正 push 完了
                                        │
                                        ▼
                                    FIX_PUSHED
                                        │
                                  再レビュー到着
                                        │
                                        ▼
                                  REVIEW_ARRIVED ─── (サイクル反復)
                                        │
                              LLM サイクル終了判定
                                        │
                          ┌─────────────┼─────────────┐
                          ▼             ▼             ▼
                   REVIEW_COMPLETE  ESCALATED  CYCLE_LIMIT_REACHED
```

---

## 7. 無限ループ防止

### 7.1 防止メカニズム一覧

| メカニズム | 説明 | デフォルト値 |
|-----------|------|-------------|
| サイクル上限 | 最大サイクル数の制限 | 5 回 |
| 重複検出 | 同じ指摘の繰り返しを検出 | ファイル+行+内容 |
| 判断理由記録 | 全判断を記録し矛盾を検出 | 全コメント |
| ユーザーエスカレーション | 不確実な場合はユーザーに委ねる | confidence < 0.7 |
| タイムアウト | サイクル全体のタイムアウト | 30 分/サイクル |
| スタイル指摘のみ判定 | 全新規指摘がスタイル系なら終了 | LLM 判定 |

### 7.2 サイクル上限到達時の処理

```typescript
async function handleCycleLimitReached(
  state: PRReviewState,
  cycle: PRReviewCycle,
  dal: IDataAccessLayer
): Promise<void> {
  // 1. 状態を CYCLE_LIMIT_REACHED に更新
  await dal.updatePRReviewState(state.projectId, state.prNumber, {
    status: 'CYCLE_LIMIT_REACHED',
    version: state.version,
  });

  // 2. 未対応コメントの一覧を生成
  const pendingComments = await dal.listPRReviewComments(
    state.projectId, state.prNumber,
    { judgment: 'ACCEPT', fixApplied: false }
  );

  // 3. ダッシュボードに通知
  // 「サイクル上限に達しました。未対応の指摘が N 件あります。手動対応してください。」

  // 4. PR にコメント投稿
  await github.createIssueComment(
    owner, repo, state.prNumber,
    `## Review Automation: Cycle Limit Reached\n\n` +
    `${state.maxCycles} review cycles completed. ` +
    `${pendingComments.length} comment(s) remain unresolved.\n\n` +
    `Please review manually.`
  );
}
```

### 7.3 重複検出の段階的判定

```
Step 1: ファイル名の一致 → 不一致なら新規
Step 2: 行番号の近接（±5行） → 遠ければ新規
Step 3: LLM による内容比較（低コストモデル） → 類似なら重複
Step 4: 重複率がサイクル全体の 80% 以上 → サイクル終了推奨
```

---

## 8. DAL インターフェース拡張

### 8.1 IDataAccessLayer への追加メソッド

```typescript
interface IDataAccessLayer {
  // ... 既存メソッド ...

  // ==================== PR Review State ====================

  createPRReviewState(input: CreatePRReviewStateInput): Promise<PRReviewState>;
  getPRReviewState(projectId: string, prNumber: number): Promise<PRReviewState | null>;
  updatePRReviewState(
    projectId: string,
    prNumber: number,
    updates: UpdatePRReviewStateInput & { version: number }
  ): Promise<PRReviewState>;
  listPRReviewStates(
    projectId: string,
    options?: { status?: PRReviewStatus; limit?: number }
  ): Promise<PRReviewState[]>;
  deletePRReviewState(projectId: string, prNumber: number): Promise<void>;

  // ==================== PR Review Comments ====================

  batchCreatePRReviewComments(comments: PRReviewComment[]): Promise<void>;
  getPRReviewComment(
    projectId: string, prNumber: number, commentId: string
  ): Promise<PRReviewComment | null>;
  listPRReviewComments(
    projectId: string, prNumber: number,
    filter?: { judgment?: CommentJudgment; fixApplied?: boolean; cycle?: number }
  ): Promise<PRReviewComment[]>;
  updatePRReviewComment(
    projectId: string, prNumber: number, commentId: string,
    updates: Partial<Pick<PRReviewComment, 'judgment' | 'judgmentReason' | 'fixApplied' | 'fixCommitHash' | 'fixDescription' | 'userOverride'>>
  ): Promise<PRReviewComment>;

  // ==================== PR Review Cycles ====================

  createPRReviewCycle(input: PRReviewCycle): Promise<PRReviewCycle>;
  getPRReviewCycle(
    projectId: string, prNumber: number, cycleNumber: number
  ): Promise<PRReviewCycle | null>;
  listPRReviewCycles(projectId: string, prNumber: number): Promise<PRReviewCycle[]>;
  updatePRReviewCycle(
    projectId: string, prNumber: number, cycleNumber: number,
    updates: Partial<PRReviewCycle>
  ): Promise<PRReviewCycle>;
}
```

### 8.2 Input Types

```typescript
interface CreatePRReviewStateInput {
  projectId: string;
  orgId: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  baseBranch: string;
  headBranch: string;
  repository: string;
  maxCycles?: number;  // デフォルト: 5
}

interface UpdatePRReviewStateInput {
  status?: PRReviewStatus;
  currentCycle?: number;
  totalComments?: number;
  pendingComments?: number;
  acceptedComments?: number;
  rejectedComments?: number;
  escalatedComments?: number;
  lastReviewArrivedAt?: string;
  lastFixPushedAt?: string;
}
```

---

## 9. PRReviewService（アプリケーション層）

### 9.1 クラス設計

```typescript
class PRReviewService {
  private dal: IDataAccessLayer;
  private github: IGitHubAdapter;
  private llm: LLMClient;
  private orgId: string;

  constructor(dal: IDataAccessLayer, github: IGitHubAdapter, llm: LLMClient, orgId: string);

  // PR Registration
  async registerPR(input: CreatePRReviewStateInput): Promise<PRReviewState>;

  // Review Cycle
  async startReviewCycle(projectId: string, prNumber: number): Promise<PRReviewCycle>;
  async analyzeComments(projectId: string, prNumber: number, cycle: number): Promise<PRReviewComment[]>;
  async getCycleDecision(projectId: string, prNumber: number, cycle: number): Promise<CycleDecision>;

  // User Interaction
  async getReviewSummary(projectId: string, prNumber: number): Promise<ReviewSummaryForDashboard>;
  async applyUserOverride(
    projectId: string, prNumber: number, commentId: string, override: UserOverride
  ): Promise<void>;
  async approveAndFix(projectId: string, prNumber: number): Promise<FixResult>;
  async completeWithoutFix(projectId: string, prNumber: number): Promise<void>;

  // Fix Execution
  async executeAcceptedFixes(projectId: string, prNumber: number, cycle: number): Promise<FixResult>;

  // Status
  async markReviewArrived(projectId: string, prNumber: number): Promise<void>;
  async getFullState(projectId: string, prNumber: number): Promise<FullPRReviewInfo>;
}

interface ReviewSummaryForDashboard {
  state: PRReviewState;
  comments: PRReviewComment[];
  cycles: PRReviewCycle[];
  acceptCount: number;
  rejectCount: number;
  escalateCount: number;
  pendingUserAction: 'APPROVE_FIXES' | 'REVIEW_ESCALATIONS' | 'NONE';
}

interface FixResult {
  success: boolean;
  commitHash?: string;
  filesModified: string[];
  fixedCommentIds: string[];
  errors: Array<{ commentId: string; error: string }>;
  testsPassed: boolean;
}

interface FullPRReviewInfo {
  state: PRReviewState;
  comments: PRReviewComment[];
  cycles: PRReviewCycle[];
}
```

---

## 10. Web API エンドポイント

### 10.1 REST API

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/projects/:projectId/pr-reviews` | PR レビュー状態を登録 |
| GET | `/api/projects/:projectId/pr-reviews` | PR レビュー一覧取得 |
| GET | `/api/projects/:projectId/pr-reviews/:prNumber` | PR レビュー詳細取得 |
| POST | `/api/projects/:projectId/pr-reviews/:prNumber/start-cycle` | レビュー対応サイクル開始 |
| GET | `/api/projects/:projectId/pr-reviews/:prNumber/comments` | コメント一覧取得 |
| PATCH | `/api/projects/:projectId/pr-reviews/:prNumber/comments/:commentId` | コメント判断の上書き |
| POST | `/api/projects/:projectId/pr-reviews/:prNumber/approve-and-fix` | 承認して修正実行 |
| POST | `/api/projects/:projectId/pr-reviews/:prNumber/complete` | 修正不要で完了 |
| GET | `/api/projects/:projectId/pr-reviews/:prNumber/cycles` | サイクル一覧取得 |
| POST | `/api/projects/:projectId/pr-reviews/:prNumber/mark-review-arrived` | レビュー到着を記録 |

### 10.2 レスポンス例

**GET `/api/projects/:projectId/pr-reviews/:prNumber`**

```json
{
  "state": {
    "prNumber": 42,
    "prTitle": "feat: Add user authentication",
    "status": "AWAITING_APPROVAL",
    "currentCycle": 2,
    "maxCycles": 5,
    "totalComments": 8,
    "pendingComments": 2,
    "acceptedComments": 4,
    "rejectedComments": 1,
    "escalatedComments": 1
  },
  "comments": [
    {
      "commentId": "12345",
      "filePath": "src/auth/login.ts",
      "body": "Missing null check for user object",
      "category": "BUG",
      "severity": "HIGH",
      "judgment": "ACCEPT",
      "judgmentReason": "Valid bug: user could be null after failed lookup",
      "judgmentConfidence": 0.95,
      "suggestedFix": "Add null check before accessing user.id",
      "fixApplied": false
    }
  ],
  "pendingUserAction": "APPROVE_FIXES"
}
```

---

## 11. ダッシュボード UI

### 11.1 PR レビュー一覧ビュー

```
╭─────────────────────────────────────────────────────────────────╮
│ PR Reviews                                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ #42  feat: Add user authentication       AWAITING_APPROVAL  C:2 │
│      4 accepted / 1 rejected / 1 escalated / 2 pending          │
│      [承認して修正実行]  [詳細を見る]                              │
│                                                                  │
│ #38  fix: Login redirect issue           REVIEW_COMPLETE    C:1 │
│      2 accepted / 0 rejected / 0 escalated                       │
│      完了: 2026-03-29                                            │
│                                                                  │
╰─────────────────────────────────────────────────────────────────╯
```

### 11.2 PR レビュー詳細ビュー

```
╭─────────────────────────────────────────────────────────────────╮
│ PR #42: feat: Add user authentication                           │
│ Status: AWAITING_APPROVAL  |  Cycle: 2/5                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ■ ACCEPT (4)                                                     │
│   ├ [BUG/HIGH] src/auth/login.ts:42                             │
│   │  Missing null check for user object                          │
│   │  → Add null check before accessing user.id                   │
│   │  Confidence: 0.95                                            │
│   │                                                              │
│   ├ [ERROR_HANDLING/HIGH] src/auth/middleware.ts:15              │
│   │  Unhandled promise rejection                                 │
│   │  → Wrap in try-catch with proper error response              │
│   │  Confidence: 0.92                                            │
│   │  ...                                                         │
│                                                                  │
│ ■ REJECT (1)                                                     │
│   ├ [STYLE/LOW] src/auth/login.ts:10                            │
│   │  Consider using optional chaining                            │
│   │  理由: 既にnullチェック済み。optional chainingは冗長           │
│   │  [上書き: 取り入れる]                                         │
│                                                                  │
│ ■ ESCALATE (1)                                                   │
│   ├ [ARCHITECTURE/MEDIUM] src/auth/session.ts:5                 │
│   │  Consider using Redis for session storage                    │
│   │  理由: アーキテクチャ判断はユーザーに委ねる                     │
│   │  [取り入れる]  [取り入れない]  [保留]                          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ [承認して修正実行]   [修正不要で完了]   [全て却下]                  │
╰─────────────────────────────────────────────────────────────────╯
```

---

## 12. NoDynamo フォールバック

DynamoDB 未使用環境では、ファイルベースでフォールバック:

```
~/.pm-orchestrator/pr-reviews/
├── <project-hash>/
│   ├── pr-42/
│   │   ├── state.json            # PRReviewState
│   │   ├── comments/
│   │   │   ├── 12345.json        # PRReviewComment
│   │   │   └── 12346.json
│   │   └── cycles/
│   │       ├── cycle-1.json      # PRReviewCycle
│   │       └── cycle-2.json
│   └── pr-38/
│       └── ...
```

NoDynamo 実装は既存の `NoDynamoDALWithConversations` パターンに準拠:
- JSON ファイルへの同期書き込み
- メモリキャッシュ
- fail-closed（破損時はデフォルト状態で起動）

---

## 13. エラーハンドリング

### 13.1 DynamoDB エラー

| エラー | 対応 |
|--------|------|
| ConditionalCheckFailedException | 楽観的ロック失敗 → リトライ（最大3回） |
| ProvisionedThroughputExceededException | 指数バックオフリトライ |
| 接続エラー | NoDynamo フォールバック |

### 13.2 GitHub API エラー

| エラー | 対応 |
|--------|------|
| 401 Unauthorized | ユーザーに認証設定を案内 |
| 403 Rate Limit | Retry-After ヘッダーに従いリトライ |
| 404 Not Found | PR 番号またはリポジトリが不正 → エラー報告 |
| 422 Unprocessable | リクエストパラメータ修正 → リトライ |
| ネットワークエラー | 指数バックオフリトライ（最大3回） |

### 13.3 LLM エラー

| エラー | 対応 |
|--------|------|
| JSON パース失敗 | リトライ（temperature 微調整） |
| タイムアウト | リトライ（最大2回） |
| レート制限 | 指数バックオフ |
| モデル不可用 | フォールバックモデルに切り替え |

### 13.4 修正実行エラー

| エラー | 対応 |
|--------|------|
| テスト失敗 | 修正をロールバック → コメントの judgment を ESCALATE に変更 |
| コンフリクト | ユーザーに通知 → ESCALATED |
| push 失敗 | リトライ（最大2回） → 失敗時 ESCALATED |

---

## 14. 容量見積もり

### 14.1 アイテムサイズ

| エンティティ | 平均サイズ | 上限 |
|-------------|-----------|------|
| PRReviewState | 1-3 KB | 10 KB |
| PRReviewComment | 1-2 KB | 5 KB |
| PRReviewCycle | 2-5 KB | 20 KB |

### 14.2 保持量

| エンティティ | PR あたり | TTL |
|-------------|----------|-----|
| PRReviewState | 1 | 90日（非アクティブ時） |
| PRReviewComment | 5-50 | 90日 |
| PRReviewCycle | 1-5 | 90日 |

### 14.3 LLM コスト見積もり

| 操作 | モデル | 入力トークン | 出力トークン | サイクルあたりコスト |
|------|--------|-------------|-------------|-------------------|
| 指摘分析（10件） | claude-sonnet / gpt-4o | ~3,000 | ~1,500 | ~$0.02 |
| サイクル終了判定 | claude-sonnet / gpt-4o | ~2,000 | ~500 | ~$0.01 |
| 重複検出（5件） | haiku / gpt-4o-mini | ~500 x 5 | ~100 x 5 | ~$0.001 |
| **合計/サイクル** | | | | **~$0.03** |
| **合計/PR（5サイクル）** | | | | **~$0.15** |

---

## 15. コンフィグレーション

### 15.1 プロジェクト設定

`project-config.json` に以下を追加:

```json
{
  "prReviewAutomation": {
    "enabled": true,
    "maxCycles": 5,
    "cycleTimeoutMinutes": 30,
    "autoStartCycle": false,
    "llm": {
      "analysisModel": "auto",
      "duplicateDetectionModel": "low-cost"
    },
    "judgmentThresholds": {
      "escalateConfidenceBelow": 0.7,
      "autoRejectStyleComments": false
    },
    "github": {
      "adapter": "gh-cli",
      "replyToComments": true,
      "postCycleSummary": true
    }
  }
}
```

---

## 16. テスト戦略

### 16.1 ユニットテスト

- PRReviewService の各メソッド
- LLM プロンプト → JSON パース（モック LLM）
- 重複検出ロジック
- サイクル終了判定ロジック
- 状態遷移の妥当性
- 楽観的ロックの競合シナリオ

### 16.2 統合テスト

- DynamoDB Local での CRUD
- NoDynamo フォールバック動作
- GitHub API アダプター（モックサーバー）
- LLM 判断 → DAL 保存 → 状態遷移の一貫性
- サイクル全体フロー（2-3 サイクル）

### 16.3 E2E テスト

- PR 作成 → レビュー到着 → 分析 → 承認 → 修正 → 再レビュー → 完了
- サイクル上限到達シナリオ
- ユーザー上書きシナリオ
- エスカレーションシナリオ

### 16.4 LLM 判断品質テスト

- 既知の指摘パターン（バグ、スタイル、アーキテクチャ）に対する判断精度
- エッジケース: 曖昧な指摘、複合的な指摘
- 重複検出の精度（同一指摘、類似指摘、無関係指摘）

---

## 17. 実装フェーズ

### Phase 1: 基盤（データモデル + DAL）

1. データモデル定義（TypeScript types）
2. DAL インターフェース拡張
3. DynamoDB 実装（CRUD + 楽観的ロック）
4. NoDynamo フォールバック実装
5. テスト

### Phase 2: GitHub API + LLM 判断

1. IGitHubAdapter インターフェース定義
2. GhCliGitHubAdapter 実装
3. LLM 指摘分析プロンプト実装
4. 重複検出ロジック実装
5. サイクル終了判定ロジック実装
6. テスト

### Phase 3: PRReviewService

1. PRReviewService 基本実装
2. レビューサイクル管理
3. 修正実行フロー（Claude Code 連携）
4. 無限ループ防止メカニズム
5. テスト

### Phase 4: Web API + ダッシュボード

1. REST API エンドポイント追加
2. ダッシュボード PR レビュー一覧ビュー
3. ダッシュボード PR レビュー詳細ビュー
4. ユーザー上書き UI
5. 「承認して修正実行」フロー
6. テスト

### Phase 5: 運用・改善

1. gh CLI → octokit 移行（オプション）
2. Webhook 受信による自動レビュー到着検出
3. Slack 通知連携
4. 判断精度のモニタリング・チューニング

---

## 18. 制約事項

- DynamoDB アイテムサイズ上限: 400 KB（PRReviewComment の body が長い場合は切り詰め）
- GitHub API レート制限: 5,000 requests/hour（認証済み）
- LLM コスト: 1 PR あたり最大 ~$0.15（5 サイクル時）
- CodeRabbit の再レビュー遅延: push 後数分〜数十分の待機が必要
- Phase 1 では Webhook 未対応のため、レビュー到着はダッシュボードからの手動トリガー

---

## 19. TaskTracker (spec/34) との統合

### 19.1 関連ポイント

- PRReviewState は TaskTracker の `currentPlan` のサブタスクとして扱える
- PR レビュー対応中のコンテキスト消失時、PRReviewState から復元可能
- TaskSnapshot に PRReviewState の参照を含めることで、復元時にレビュー対応状態も復元

### 19.2 統合インターフェース

```typescript
// TaskTracker の PlannedSubtask に prReviewRef を追加
interface PlannedSubtask {
  // ... 既存フィールド ...
  prReviewRef?: {
    prNumber: number;
    status: PRReviewStatus;
  };
}
```

---

## 20. 関連仕様

- spec/05_DATA_MODELS.md — Core Data Structures
- spec/19_WEB_UI.md — Web UI 仕様
- spec/25_REVIEW_LOOP.md — レビューループ基本設計
- spec/34_TASK_TRACKER_PERSISTENCE.md — Task Tracker 永続化
- docs/specs/dynamodb.md — DynamoDB スキーマ仕様

---

## 21. マイグレーション

既存の `pm-project-indexes` テーブルへの変更は **追加のみ（非破壊的）**:

- 既存エンティティ（ProjectIndex, Session, ActivityEvent, Plan, TaskTracker）に影響なし
- 新しい SK パターン（`PR#`, `PRCOMMENT#`, `PRCYCLE#`）を追加するのみ
- テーブルスキーマ変更不要（PK + SK は String 型で汎用的に利用済み）
- GSI 追加も Phase 1 では不要

---

## 22. 用語集

| 用語 | 説明 |
|------|------|
| サイクル | レビュー到着 → LLM 分析 → ユーザー承認 → 修正 push → 再レビューの 1 反復 |
| 判断 (Judgment) | LLM が各指摘に対して下す ACCEPT / REJECT / ESCALATE の決定 |
| エスカレーション | LLM が判断できない指摘をユーザーに委ねること |
| 重複検出 | 前サイクルと同じ指摘が再度出てきたことの検出 |
| サイクル上限 | 無限ループ防止のための最大反復回数（デフォルト 5） |
| ユーザー上書き | LLM の判断をユーザーが変更すること |
