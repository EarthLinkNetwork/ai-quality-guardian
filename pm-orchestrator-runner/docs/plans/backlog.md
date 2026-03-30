# Backlog

## Out of Scope for Phase 1

These features are intentionally excluded from the initial implementation but planned for future phases.

## Priority: Critical (Immediate)

### B-016: タスク分解時の注入テキストフィルタリング（残存タスク）

**Description:** `extractSubtasksFromPrompt()` で acceptance criteria や OutputRules のような注入テキストをサブタスクとして抽出しないフィルタリングを追加する。

**背景:**
- 2026-03-30 にタスク分解の根本原因分析を実施
- 即効修正（生プロンプトを分解に渡す）と中期修正（質問系ガード）は実装済み
- 本項目は「長期修正」として残存

**実装済み（参考）:**
- `cli/index.ts`: `enrichedPrompt` → `item.prompt` に変更済み
- `task-chunking.ts`: `isQuestionOrInvestigationPrompt()` ガード追加済み
- テスト: 12ケース追加済み（68 passing）

**残作業:**
- `extractSubtasksFromPrompt()` 内で `[TaskContext]`, `[OutputRules]`, `[InputRules]` 等のテンプレートセクションを検出し、その中のリスト構造をサブタスクとして抽出しない
- metaPrompt が生成した acceptance criteria をサブタスクと誤認しないフィルタ

**Estimated Effort:** 1-2 days

---

### B-017: プロジェクト単位のタスク管理永続化（DynamoDB）

**Description:** コンテキスト消失時にタスク情報が失われないよう、プロジェクトごとのタスク管理をDynamoDBに永続化する仕組みを追加する。

**背景:**
- 現在のタスク管理はClaude Codeのセッション内コンテキストに依存
- セッションが終了・コンテキストが圧縮されると残存タスク情報が消失
- ユーザーから「コンテキストがなくなったら記録が消える。DynamoDBで保存できないか」と要望

**設計方針案:**
1. **既存QueueStoreの拡張** — QueueItem に `remaining_tasks`, `session_notes` フィールドを追加
2. **専用TaskTracker テーブル** — `pm-runner-task-tracker` テーブルを新設、プロジェクト×セッション単位で残存タスク・決定事項を保存
3. **LLMによる自動記録** — タスク完了時にLLMが残存タスク・コンテキストをサマリ化してDynamoDBに保存。次セッション開始時に自動ロード

**関連仕様:**
- namespace: プロジェクト単位の分離は既存
- QueueStore: DynamoDB実装済み（`pm-runner-queue` テーブル）
- DAL: DynamoDB/ファイルベースのハイブリッド実装済み

**依存:**
- B-012: Single-Table DynamoDB Design（統合設計時に考慮）

**Estimated Effort:** 1-2 weeks

---

## Priority: High (Phase 2)

### B-001: WebSocket Real-time Updates

**Description:** Replace polling with WebSocket for real-time log streaming and status updates.

**Benefits:**
- Reduced server load (no polling)
- Lower latency for log updates
- Better UX

**Estimated Effort:** 3-5 days

---

### B-002: Email Notifications

**Description:** Send email notifications for critical events (task errors, awaiting response).

**Dependencies:**
- Email service (SendGrid, SES)
- User email verification

**Estimated Effort:** 2-3 days

---

### B-003: Slack Integration

**Description:** Send notifications to Slack channels.

**Dependencies:**
- Slack OAuth app
- Webhook configuration UI

**Estimated Effort:** 2-3 days

## Priority: Medium (Phase 3)

### B-004: Multi-Org Support

**Description:** Full multi-tenant support with org switching.

**Features:**
- User can belong to multiple orgs
- Org switcher in UI
- Billing per org

**Estimated Effort:** 1-2 weeks

---

### B-005: Agent Spawn from Web

**Description:** Start new agent processes from Web UI.

**Challenges:**
- Security (remote code execution)
- Process management
- SSH/tunneling

**Estimated Effort:** 1 week

---

### B-006: Full-text Log Search

**Description:** Search across all task logs with full-text search.

**Options:**
- OpenSearch
- Algolia
- DynamoDB streams + custom indexing

**Estimated Effort:** 1 week

---

### B-007: Task Dependencies/Workflows

**Description:** Define task dependencies and workflows.

**Features:**
- Task A must complete before Task B
- Parallel task execution
- Workflow templates

**Estimated Effort:** 2 weeks

## Priority: Low (Future)

### B-008: Custom RBAC Roles

**Description:** Define custom roles beyond owner/admin/member/viewer.

**Features:**
- Custom permission sets
- Role inheritance
- Fine-grained permissions

**Estimated Effort:** 1 week

---

### B-009: OAuth Providers

**Description:** Login with Google, GitHub, etc.

**Dependencies:**
- OAuth library
- Provider configuration

**Estimated Effort:** 3-5 days

---

### B-010: 2FA Support

**Description:** Two-factor authentication.

**Options:**
- TOTP (authenticator app)
- SMS
- Email

**Estimated Effort:** 3-5 days

---

### B-011: Audit Log Export

**Description:** Export audit logs for compliance.

**Formats:**
- CSV
- JSON
- SIEM integration

**Estimated Effort:** 2-3 days

---

### B-012: Single-Table DynamoDB Design

**Description:** Consolidate multiple tables into single-table design for cost/performance.

**Benefits:**
- Reduced costs
- Atomic operations
- Better query patterns

**Estimated Effort:** 1-2 weeks (migration)

---

### B-013: Mobile App

**Description:** iOS/Android app for monitoring and responding.

**Features:**
- Push notifications
- Task monitoring
- Respond to clarifications

**Estimated Effort:** 2-4 weeks

---

### B-014: API Rate Limiting

**Description:** Implement rate limiting on API endpoints.

**Implementation:**
- Token bucket algorithm
- Per-user limits
- DynamoDB-based tracking

**Estimated Effort:** 2-3 days

---

### B-015: Metrics Dashboard

**Description:** Analytics dashboard for task metrics.

**Metrics:**
- Tasks per day
- Average completion time
- Error rate
- Agent utilization

**Estimated Effort:** 1 week

## Completed

(None yet - implementation not started)
