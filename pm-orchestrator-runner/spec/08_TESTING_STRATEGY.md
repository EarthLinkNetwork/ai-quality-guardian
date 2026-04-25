# Testing Strategy

本章は PM Orchestrator Runner の実装および変更に対して必須となるテスト要件を定義する。
本章に記載されたテストが満たされない場合、当該実装は仕様違反とみなされる。

テスト未実施、テスト失敗、カバレッジ未達の状態での実装完了判定は禁止される。

## Dual Testing Approach

Runner は単体テストとプロパティベーステストの両方を必ず実装しなければならない。
いずれか一方のみの実施は認められない。

## Unit Testing

単体テストは以下の観点を必ず網羅しなければならない。

正しい挙動を示す具体例  
境界条件および異常系  
コンポーネント間の統合ポイント  
設定ファイル検証シナリオ  
CLI インターフェースの挙動

単体テストは仕様書の各章に対応付けられていなければならない。

## Property Based Testing

プロパティベーステストは fast-check を用いて実装しなければならない。

各プロパティテストは、すべての入力に対して成り立つ性質を検証しなければならない。
各テストは最低 100 回以上の試行を行わなければならない。
各テストは対応する Correctness Property 番号を明示しなければならない。
並列実行および競合状態を含めなければならない。
証跡破損および証跡欠損時の挙動を含めなければならない。

## Property Test Execution Rules

各 Property テストは Feature 名を pm-orchestrator-runner として実装しなければならない。
対象 Property 番号をコメントとして明示しなければならない。
テスト失敗時は即座に失敗と判定されなければならない。

試行回数を減らすことは禁止される。

## Coverage Requirements

Runner のテストカバレッジは以下を必ず満たさなければならない。

P0 要件については行カバレッジ 90 パーセント以上、分岐カバレッジ 85 パーセント以上とする。
P1 要件については行カバレッジ 80 パーセント以上、分岐カバレッジ 75 パーセント以上とする。

カバレッジ測定には nyc または istanbul を使用する。
測定対象は pm-orchestrator-runner/src のみとする。

テストコードおよび自動生成コードは測定対象外とする。

CI パイプラインは、カバレッジ未達時に必ず失敗しなければならない。

## Integration Testing

以下の統合テストは必須である。

Claude Code CLI と executor-only mode の統合  
並列実行下でのファイルシステム操作  
失敗ケースを含む証跡収集処理  
不正または破損した設定ファイルの検証  
セッション再起動および再開シナリオ

統合テストが失敗した場合、実装は完了とみなしてはならない。

## Test Data Management

テストデータは現実的な入力を生成するジェネレータを使用しなければならない。
境界値を生成するジェネレータを含めなければならない。
失敗条件を意図的に生成するジェネレータを含めなければならない。
設定ファイル検証用ジェネレータを含めなければならない。
証跡整合性検証用ジェネレータを含めなければならない。

手書きの固定データのみに依存するテストは禁止される。

## Testing Discipline

Runner 自身は、Runner が強制する TDD 規律を必ず自己適用しなければならない。

テストが失敗している状態での実装継続は禁止される。
テストが存在しない機能の実装は禁止される。

## AI Generate JSON Parse Robustness

`/api/assistant/propose` の LLM 応答パーサ (`parseProposalResponse`) は以下のテストケースを必ず網羅しなければならない。

### 必須テストケース

1. **bracket-balanced 抽出 - prose 付き応答**
   `"noise before {...} trailing prose }"` 形式で、最初の balanced JSON のみを抽出すること。
2. **bracket-balanced 抽出 - 文字列内の `{`/`}` を無視**
   JSON 文字列リテラルに含まれる `}` で誤って深さを更新しないこと。
3. **bracket-balanced 抽出 - エスケープシーケンス処理**
   `\"` が文字列終端と誤認されないこと。
4. **truncated JSON - 未閉オブジェクト**
   `extractBalancedJson` は `null` を返し、`repairTruncatedJson` が修復すること。
5. **REGRESSION: greedy regex 過剰捕捉の防止**
   `'{"k":"v"} extra }'` で `'{"k":"v"}'` のみを返すこと（旧 `/\{[\s\S]*\}/` 動作との明確な差分テスト）。
6. **markdown code block 内の JSON**
   ` ```json ... ``` ` 形式から正しく抽出できること。
7. **構造化出力スキーマ整合性**
   `PROPOSAL_RESPONSE_JSON_SCHEMA.properties.choices[].artifacts[].kind.enum` が `VALID_KINDS` と完全一致すること。
8. **構造化出力ファクトリ**
   `buildOpenAIResponseFormat()` が `type: "json_schema"`, `json_schema.strict: true`, `json_schema.name: "AIGenerateProposal"` を返すこと。

### テストファイル

`test/unit/web/routes/assistant-json-parse.test.ts`

これらのテストが失敗する状態でのリリースは禁止される。

## AI Generate Model Selector & Quality (Batch 3)

AI Generate（`/ai-generate`）の生成品質を左右する 3 つの要素（デフォルトモデル / システムプロンプト / UI からの model override）は以下のテストで担保しなければならない。

### 必須テストケース

1. **Server defaults (`assistant-defaults.test.ts`)**
   - `generateProposal` の内部で選ばれるデフォルトは、openai: `gpt-4o`、anthropic: `claude-sonnet-4-20250514`。
   - 旧デフォルト（`gpt-4o-mini`, `claude-3-haiku-20240307`）が残っていないこと。

2. **System prompt structure (`assistant-system-prompt.test.ts`)**
   - `buildSystemPrompt(scope)` の返り値に以下のセクション見出し相当文字列が含まれる:
     - Role / 役割
     - Output Format（JSON schema 案内）
     - Artifact kinds（skill / agent / command 等のガイド）
     - Quality Guidelines
     - Examples（few-shot）
     - Constraints
   - プロジェクトに対する scope が prompt に埋め込まれている（既存仕様の維持）。
   - プロンプト全長が 150 行相当の水準（文字数で 2500 文字以上）。

3. **Model override (`assistant-model-override.test.ts`)**
   - POST `/api/assistant/propose` で `{provider, model}` を省略した場合は新デフォルトが使われる。
   - 有効な `{provider, model}` を渡した場合はそれが使われる。
   - 無効な provider/model を渡した場合は 400 を返す。

4. **UI selector presence (`ai-generate-model-selector.test.ts`)**
   - `index.html` に `<select id="ai-generate-provider">` と `<select id="ai-generate-model" data-dynamic="true">` が存在する。
   - `renderProposeTab` から `populateModelDropdown('ai-generate-model', ...)` が呼ばれている。
   - `localStorage.setItem('pm-runner-ai-generate-provider', ...)` と `...-model` の書き込み JS が存在する。
   - `assistantSend` が POST body に `provider` / `model` を含めて送信する。

5. **E2E (`ai-generate-model-selector.spec.ts`)**
   - `/ai-generate` を開き、provider を変えるとモデル一覧が再描画される。
   - モデルを選択して再読込しても選択が保持される（localStorage 確認）。

### テストファイル

- `test/unit/web/routes/assistant-defaults.test.ts`
- `test/unit/web/routes/assistant-system-prompt.test.ts`
- `test/unit/web/routes/assistant-model-override.test.ts`
- `test/unit/web/ai-generate-model-selector.test.ts`
- `test/playwright/ai-generate-model-selector.spec.ts`

これらのテストが失敗する状態でのリリースは禁止される。

## Project README Preview (marked + DOMPurify)

`renderProjectDetail` の README タブは、自前 Markdown parser を `marked` (UMD) + `DOMPurify` (min) に置換した。
以下のテストが失敗する状態でのリリースは禁止される。

### 必須テストケース（Playwright）

1. **README タブが表示される**
   Project Detail を開き、`data-testid="project-detail-tab-readme"` が表示されること。
2. **README タブクリックで Markdown が描画される**
   タブクリックで `data-testid="project-readme-body"` が visible になり、Markdown 由来の HTML 要素（`<h1>`, `<a>`, `<code>`, `<ul>` など）が含まれること。
3. **XSS サニタイズ（marked + DOMPurify）**
   `[click](javascript:alert(1))` を含む README で、レンダリングされた `<a>` の `href` に `javascript:` が含まれないこと（既存 `tier-a-critical.spec.ts` と同等の保証）。
4. **Overview タブが既定で選択される**
   初期表示時は `data-testid="project-detail-tab-overview"` が active であり、既存カード（`project-details-card`, `default-command-section` 等）が visible であること。
5. **README なしプロジェクトの挙動**
   `README.md` が存在しないプロジェクトでも README タブは表示され、本体に「No README」相当のメッセージが出ること（500 を返さない）。

### テストファイル

- `test/playwright/project-readme-preview.spec.ts`
- `test/playwright/tier-a-critical.spec.ts`（XSS リグレッション）

### 単体テスト（バックエンド）

- `test/unit/web/routes/projects-readme.test.ts`
  - 既存ファイルがあれば追記、無ければ新規作成
  - 200/404/path-traversal/未認証 401 を網羅


## Model Registry Refresh Strategy (Task E follow-up)

Provider model registries (`OPENAI_MODELS`, `ANTHROPIC_MODELS`) are
refreshed **additively** — new model IDs are appended, existing IDs
are retained. Removal is governed by an explicit cleanup task tracked
in `docs/BACKLOG.md` ("Legacy Model Cleanup").

### Required tests on refresh

Any PR that adds/removes a registry entry MUST keep the following
tests green:

- `test/unit/models/repl/model-registry.test.ts`
  - Task E: additive OpenAI refresh
  - Task E: additive Anthropic refresh
- `test/unit/legacy-backlog.test.ts` (forget-proof guard)

### Live verification for new provider IDs

When adding new OpenAI IDs, run:

```
curl -sS -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models | jq -r '.data[].id'
```

Record the verification date in `spec/12_LLM_PROVIDER_AND_MODELS.md`
section 2.4. Do **not** register IDs that are absent from the API
response.

### Pricing placeholder rule

Newly added IDs may carry `TBD` pricing (input/output both `0`).
Actual pricing must be backfilled in a separate commit that also
updates `spec/12` section 2.1.

## Skills page tests

Skills are now a first-class sidebar entry separate from Agents (see
`spec/19_WEB_UI.md` section 2). Because Skills and Agents share the
`/api/claude-files/agents/:scope` backend route but are split at the UI
layer, tests must cover both the server-side route and the client-side
page separation.

### Unit tests

- `test/unit/web/sidebar-skills.test.ts` — asserts that
  `src/web/public/index.html` contains a sidebar `<a>` targeting
  `/skills` with `data-testid="nav-skills"`. Prevents the Agents-only
  regression from Task B.
- `test/unit/web/routes/skills-page.test.ts` — asserts that
  `src/web/public/index.html` defines a `renderSkillsPage` function
  and that the SPA dispatcher routes `/skills` to it. Prevents
  accidental removal during refactors.
- `test/unit/web/web-server.test.ts` — the SPA-shell sweep already
  includes `/skills` (guarantees the Express route returns the HTML
  shell so the client-side router can pick up the page).

### Playwright tests

- `test/playwright/skills-sidebar.spec.ts` — clicking the Skills entry
  in the sidebar navigates to `/skills` and renders the Skills page.
- `test/playwright/skills-crud.spec.ts` — create / edit / delete a
  skill on the `/skills` page. Migrated from the old
  `commands-agents-crud.spec.ts` skill block. The original cross-page
  assertion (`agent-item-*` and `skill-item-*` visible on the same
  page) is no longer valid after the split and is removed.

### Scope rules

- Skills CRUD still uses the shared `/api/claude-files/agents/:scope`
  endpoints (Q2=c). Tests must not exercise `/api/skills/generate` —
  that route is reserved for the AI-Generate workflow and is not
  touched by the Skills page.
- Independent-page design (Q1=α) means Agents page must not list
  skills and Skills page must not list agents. The client-side filter
  is applied after the shared API call.
