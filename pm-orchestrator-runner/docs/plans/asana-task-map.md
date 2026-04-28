# Asana Task Map

このファイルは Asana で管理しているタスクとリポジトリ内ドキュメント・実装の対応表です。
ローカル進捗 (spec/ADR/コード変更) と Asana 上のタスク状態を同期するために参照します。

## Project

- Project name: `pm-runner`
- Project URL: https://app.asana.com/1/81767308277002/project/1214289977522742/list
- Project gid: `1214289977522742`
- Workspace gid: `81767308277002` (eln.ne.jp)
- MCP: `@roychri/mcp-server-asana` (project `.mcp.json` で恒久登録、グローバル `claude mcp` でも接続済み)
- Created at: 2026-04-28

## Sections (eln-spec-process 標準 8 構造)

`/eln-pm-orchestrator:eln-asana-setup` で構築 (2026-04-28)。

| # | Name | gid |
|---|---|---|
| 0 | Untitled section (既存・touch せず保持) | `1214289977522743` |
| 1 | Phase A: 即時対応 | `1214338125692623` |
| 2 | Phase B: 設計基盤 | `1214344784396324` |
| 3 | Phase C: 主要機能実装 | `1214338125749479` |
| 4 | Phase D: 既存機能の改善 | `1214342302941887` |
| 5 | Phase E: アーキテクチャ改善 | `1214344784588480` |
| 6 | Phase F: 将来対応 | `1214340333901982` |
| 7 | Backlog | `1214344784084921` |
| 8 | Done | `1214344784545305` |

### Section 配置 (2026-04-28 更新)

Plan 制限フォールバックの一環として、Epic + 12 サブタスクを以下の通り Phase 別に配置済み:

- **Phase B: 設計基盤** (Epic + #0〜#6 = 8 タスク)
  - Epic, #0 Docs統合, #1〜#3 ADR, #4〜#6 Spec
- **Phase C: 主要機能実装** (#7〜#11 = 5 タスク)
  - #7 Adapter Impl, #8 Validator Impl, #9 Migration CLI Impl, #10 Web UI, #11 E2E

Priority タグ (P0/P1/P2/P3) と Spec Ref (notes 冒頭の `Spec:` 行) も同時に付与。
詳細は下記「Tasks」セクションの想定アウトプット列を参照。

## Custom Fields

**Plan: Personal (Free)** → Asana のカスタムフィールド機能は利用不可。
これは workspace 管理者権限ではなく、Asana の **プラン契約レベルの制限**。

一次情報: https://asana.com/pricing
- Custom fields availability: `[Personal=❌, Starter=✅, Advanced=✅, Enterprise=✅, Enterprise+=✅]`

### Free プラン下での代替運用 (eln-asana-setup スキルのフォールバック規約)

| 当初フィールド | 代替手段 |
|--------------|---------|
| Type | タスク名 prefix (`[Spec]`, `[Impl]`, `[Bug]`, `[Docs]`, `[Test]`, `[DevOps]`, `[Refactor]`, `[Process]`) |
| Priority | タグ (`P0` / `P1` / `P2` / `P3`) |
| Phase | セクション (Phase A-F) で既に表現済み (重複につき省略) |
| Spec Ref | description 冒頭に `Spec: ADR-NNNN` 行 |
| PR Link | description 末尾に `PR: <url>` 行 |
| Status | セクション移動 (`Backlog` → `Phase X` → `Done`) |

## Tasks

### Epic

| Title | gid | URL |
|---|---|---|
| [Epic] Plugin: 公式形式 + x-pm-runner 拡張への移行 | `1214317020969251` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214317020969251 |

### Subtasks (#0〜#11)

| # | Title | gid | URL | 想定アウトプット |
|---|---|---|---|---|
| 0 | [Refactor] Docs統合: 散らばったmdを docs/ 配下に集約 | `1214330824618140` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214330824618140 | docs/spec/, docs/adr/, docs/plans/ への統合 |
| 1 | [Doc] ADR-0001: x-pm-runner 拡張採用の決定 | `1214316893845621` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214316893845621 | docs/adr/0001-x-pm-runner-extension-namespace.md |
| 2 | [Doc] ADR-0002: 二層ディレクトリ構造の採択 | `1214317021090778` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214317021090778 | docs/adr/0002-two-layer-plugin-directory.md |
| 3 | [Doc] ADR-0003: 公式 schema 正本化方針 | `1214320952910320` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214320952910320 | docs/adr/0003-official-schema-as-source-of-truth.md |
| 4 | [Doc] Spec: PluginDefinition ↔ plugin.json アダプタ仕様 | `1214317165613923` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214317165613923 | docs/spec/38_PLUGIN_ADAPTER.md |
| 5 | [Doc] Spec: x-pm-runner JSON Schema | `1214317165676453` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214317165676453 | docs/spec/39_X_PM_RUNNER_SCHEMA.md + docs/spec/schemas/x-pm-runner.schema.json |
| 6 | [Doc] Spec: migration CLI 仕様 | `1214317165720451` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214317165720451 | docs/spec/40_PLUGIN_MIGRATION_CLI.md |
| 7 | [Impl] アダプタ層実装 | `1214317021298305` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214317021298305 | pm-orchestrator-runner/src/web/plugins/adapter.ts |
| 8 | [Impl] JSON Schema validator 組み込み | `1214317165733237` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214317165733237 | pm-orchestrator-runner/src/web/plugins/schema-validator.ts |
| 9 | [Impl] migration CLI 実装 | `1214330824850724` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214330824850724 | pm-orchestrator-runner/src/cli/commands/plugin-migrate.ts |
| 10 | [Impl] Web UI 修正 | `1214320953240616` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214320953240616 | pm-orchestrator-runner/src/web/public/index.html, routes/assistant.ts |
| 11 | [QA] E2E: install→migrate→run 一連の検証 | `1214320953323808` | https://app.asana.com/1/81767308277002/project/1214289977522742/task/1214320953323808 | pm-orchestrator-runner/tests/e2e/ |

### 棚卸し起票 (2026-04-29)

backlog.md / open-defects.md / 実コード走査による棚卸しを Asana に登録 (22 件)。

#### Phase A: 即時対応 (P0)

| Title | gid |
|---|---|
| [Bug] B-016: タスク分解時の注入テキストフィルタリング | `1214356816544961` |

#### Phase B: 設計基盤 (進捗 hook 設計タスク, P1)

| Title | gid |
|---|---|
| [Spec] eln-pm-orchestrator: Asana 進捗 hook 設計 | `1214357040442052` |
| [Spec] session-manager: Asana bootstrap 設計 | `1214356975323412` |

#### Phase C: 主要機能実装

| Title | Prio | gid |
|---|---|---|
| [Impl] B-001: WebSocket Real-time Updates | P2 | `1214356671571194` |
| [Impl] B-002: Email Notifications | P3 | `1214356672166854` |
| [Impl] B-003: Slack Integration | P3 | `1214356816117195` |

#### Phase D: 既存機能の改善 (skipped tests 解消)

| Title | Prio | gid |
|---|---|---|
| [Test] task-log-lifecycle: 3 historical bug reproductions の再活性化または削除判断 | P2 | `1214356797183330` |
| [Test] self-heal-tiny-cli: 4 self-heal integration tests の再活性化 | P1 | `1214357154123008` |

#### Phase E: アーキテクチャ改善

| Title | Prio | gid |
|---|---|---|
| [Impl] B-017: プロジェクト単位のタスク管理永続化 (DynamoDB) | P1 | `1214356975323424` |
| [Refactor] dynamo-dal: 11 TODO migration markers の解消 | P1 | `1214356816243510` |
| [Refactor] B-012: Single-Table DynamoDB Design | P2 | `1214357122194555` |
| [Impl] B-004: Multi-Org Support | P3 | `1214356988238274` |

#### Phase F: 将来対応 (P3)

| Title | gid |
|---|---|
| [Impl] B-005: Agent Spawn from Web | `1214356988275050` |
| [Impl] B-006: Full-text Log Search | `1214357040583992` |
| [Impl] B-007: Task Dependencies/Workflows | `1214356988438272` |
| [Impl] B-008: Custom RBAC Roles | `1214357040438485` |
| [Impl] B-009: OAuth Providers | `1214356988482193` |
| [Impl] B-010: 2FA Support | `1214356988385971` |
| [Impl] B-011: Audit Log Export | `1214356975489098` |
| [Impl] B-013: Mobile App | `1214356988258115` |
| [Impl] B-014: API Rate Limiting | `1214356988462355` |
| [Impl] B-015: Metrics Dashboard | `1214356975658258` |

#### 棚卸し対象外 (重複扱い)

- **DEF-001**: B-016 と同一根因のため [Bug] B-016 に統合 (notes に DEF-001 参照を記載)

#### Workspace Tags (Free プランフォールバック)

| Priority | gid |
|---|---|
| P0 | `1214340344434307` |
| P1 | `1214338136030617` |
| P2 | `1214344794652240` |
| P3 | `1214344794765538` |

## 依存関係グラフ

```
#0 (Docs統合)
 ├─ #1 ADR-0001 ──┐
 ├─ #2 ADR-0002 ──┤
 └─ #3 ADR-0003 ──┤
                  ├─ #4 Adapter Spec ──┐
                  └─ #5 x-pm-runner Schema ──┐
                                            ├─ #6 Migration CLI Spec ──┐
                                            ├─ #7 Adapter Impl ────────┤
                                            └─ #8 Validator Impl ──────┤
                                                                       ├─ #9 Migration CLI Impl ──┐
                                                                       └─ #10 Web UI 修正 ─────────┤
                                                                                                 └─ #11 E2E (Final Gate)
```

## 進捗同期ルール

1. ローカルで spec/ADR/コードを変更したら、対応する Asana タスクにコメントで進捗を残す (`asana_create_task_story`)
2. タスクを完了したら Asana 側を `completed: true` に更新する
3. 受入条件を変更する場合は Asana タスクの `notes` を更新し、本ファイルにも反映する
4. 新規タスクを追加する場合は本ファイルの表と依存関係グラフを更新

## 設計成果物 (2026-04-29)

### 進捗 hook 設計タスク (Asana gid `1214357040442052`) — Spec-41 関連

| 種別 | パス | 状態 |
|------|------|------|
| ADR | [docs/adr/0006-asana-progress-sync-on-free-plan.md](../adr/0006-asana-progress-sync-on-free-plan.md) | Accepted |
| Spec | [docs/spec/41_ASANA_PROGRESS_HOOK.md](../spec/41_ASANA_PROGRESS_HOOK.md) | Design |
| Skill | `eln-pm-orchestrator/skills/task-tracker-sync/SKILL.md` v0.2.0 | Updated (実装フェーズ) |

### session-manager bootstrap 設計タスク (Asana gid `1214356975323412`) — Spec-42 関連

| 種別 | パス | 状態 |
|------|------|------|
| ADR | [docs/adr/0007-session-manager-asana-bootstrap.md](../adr/0007-session-manager-asana-bootstrap.md) | Accepted |
| Spec | [docs/spec/42_SESSION_MANAGER_ASANA_BOOTSTRAP.md](../spec/42_SESSION_MANAGER_ASANA_BOOTSTRAP.md) | Design |
| Skill (実装先) | `pm-orchestrator/templates/.claude/skills/session-manager.md` v0.2.0 | Pending (Phase C-Asana-2 で新規作成、Rule 15 配布対象パス) |

### 設計タスク完了状況

- Spec-41 (Asana Progress Hook): 設計完了 — 実装は Phase C-Asana-1 で着手
- Spec-42 (session-manager Asana Bootstrap): 設計完了 — 実装は Phase C-Asana-2 で着手
- Spec-41 AC-41-9 (resume での前回履歴復元) は Spec-42 bootstrap に依存

注: 現存する `.claude/skills/session-manager.md` (v1.0.0) は **ローカル開発用** であり配布対象ではない (Rule 15)。Spec-42 の実装は `pm-orchestrator/templates/.claude/skills/` 配下に新規 template を作成して反映する。

## 参照

- 比較レポート (本セッション PM Orchestrator 出力): 独自 PluginDefinition vs 公式 Anthropic Plugin
- `.claude/project-config.json` (taskTracker.provider=asana)
- `.mcp.json` (project-level Asana MCP 登録)
