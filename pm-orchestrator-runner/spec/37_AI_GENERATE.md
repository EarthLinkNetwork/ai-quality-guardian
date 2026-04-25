# 37. AI Generate (Skill / Agent / Command Proposal Generation)

**ステータス**: v3.x (Batch 3 追加)

## 1. Overview

AI Generate は Web UI の `/ai-generate` ページから実行される、自然言語指示 → Claude Code 設定アーティファクト（`skill` / `agent` / `command` / `hook` / `script` / `spec` / `test` / `claudeMdPatch` / `settingsJsonPatch`）への変換機能である。バックエンドは `POST /api/assistant/propose` で、`src/web/routes/assistant.ts` の `generateProposal()` が LLM を呼び出し、構造化された `ProposalPlanSet` を返す。

このセクションは、生成品質を左右する 3 つの要素を規定する:

1. **デフォルトモデル** — 品質要求に見合う tier で初期化する
2. **システムプロンプト構造** — role / format / guidelines / examples / constraints を明示
3. **モデルオーバーライド UI** — ユーザが 1 リクエスト単位で provider / model を選べる

## 2. Why This Spec Exists

ユーザから「スキル作成とかの generate でやっている AI の quality がどうも低い気がします。モデルのせいなんでしょうか」というフィードバックがあった。根本原因の調査で以下の 2 点が判明:

- 既定モデルが openai=`gpt-4o-mini`、anthropic=`claude-3-haiku-20240307`（いずれも Batch 2 で定義した `basic` tier）
- `buildSystemPrompt()` が ~50 行と薄く、role / quality guidelines / few-shot examples が未記述

Batch 3 はこの 2 点を直接修正し、かつ UI から都度モデルを切替できるようにすることで、品質問題を恒久的にユーザコントロール下に置く。

## 3. Default Models

### 3.1 新デフォルト

| Provider | デフォルト model id | 旧デフォルト | Tier |
|---|---|---|---|
| openai | `gpt-4o` | `gpt-4o-mini` | flagship |
| anthropic | `claude-sonnet-4-20250514` | `claude-3-haiku-20240307` | advanced |

### 3.2 解決順序（`generateProposal`）

1. リクエスト body に `provider` / `model` が存在し、かつ registry に実在すれば採用
2. `config.defaultModels[provider]` があれば採用（Settings 画面のデフォルト）
3. いずれも未設定なら上表の新デフォルトにフォールバック

`provider` は同様に `body.provider` → `config.defaultProvider` → `"openai"` の順で解決される。

## 4. System Prompt Structure

`buildSystemPrompt(scope)` は以下 6 セクションをこの順番で構築する。各セクションは明確な見出し（`### Role:` など）で区切り、LLM が指示階層を認識しやすい形にする。

1. **Role** — 「You are an expert Claude Code configuration author …」という役割定義
2. **Output Format** — 厳密な JSON schema、`choices[].artifacts[]` の kind 別規約、`patch` フィールドが JSON-encoded string である点、全フィールドを null 可で埋める点（OpenAI strict mode 要件）
3. **Artifact Kind Guidelines** — skill / agent / command / hook / script / spec / test / claudeMdPatch / settingsJsonPatch それぞれの慣例（spec/test は §10 参照）（配置先、frontmatter、章立て）
4. **Quality Guidelines** — 既存の project 慣習を尊重する、具体的な使用例を含める、hallucinated flag/API を使わない、secrets を含めない、artifact 名の衝突を避ける
5. **Examples (Few-shot)** — skill と agent について、高品質な入力 → 出力 JSON のペアを 2 件提示
6. **Constraints** — scope と targetPathHint の整合、禁止拡張子、absolute path / `..` の禁止、既存 files を上書きする場合の明記

実装は 1 枚のテンプレート文字列で返す。length は 2500 文字以上、構造的には 150 行前後を目標とする。

## 5. Model Override Flow (UI)

### 5.1 HTML 要素

`renderProposeTab()`（`src/web/public/index.html`）内、`assistant-input-area` の上に以下を配置する:

```html
<div class="assistant-model-bar" style="...">
  <label>Provider:
    <select id="ai-generate-provider" data-testid="ai-generate-provider">
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
    </select>
  </label>
  <label>Model:
    <select id="ai-generate-model" data-testid="ai-generate-model" data-dynamic="true">
      <option value="">Loading...</option>
    </select>
  </label>
</div>
```

### 5.2 JS 挙動

- ページ表示時:
  1. `localStorage.getItem('pm-runner-ai-generate-provider')` → なければ `'openai'`
  2. `localStorage.getItem('pm-runner-ai-generate-model')` → provider 既定値
  3. `populateModelDropdown('ai-generate-model', provider, model)` を呼び出し
- Provider select を change した時: model select を再描画し、`pm-runner-ai-generate-provider` を localStorage に保存
- Model select を change した時: `pm-runner-ai-generate-model` を localStorage に保存
- Send ボタン押下時: POST body に `{prompt, scope, provider, model, repoProfile?}` を含める

### 5.3 POST Body 拡張

```json
{
  "prompt": "...",
  "scope": "project",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514"
}
```

provider / model は optional。渡された場合は registry で検証、不正値は `400 VALIDATION_ERROR` を返す。

## 6. Testing

以下のテストが通ることが Batch 3 完了の条件である（詳細は spec/08_TESTING_STRATEGY.md の "AI Generate Model Selector & Quality (Batch 3)" 節を参照）:

- `test/unit/web/routes/assistant-defaults.test.ts` — 新デフォルトの検証
- `test/unit/web/routes/assistant-system-prompt.test.ts` — プロンプト 6 セクションの存在確認
- `test/unit/web/routes/assistant-model-override.test.ts` — override 動作とバリデーション
- `test/unit/web/ai-generate-model-selector.test.ts` — HTML 要素 / JS ロジックの存在確認
- `test/playwright/ai-generate-model-selector.spec.ts` — E2E 確認

## 7. Implementation Checklist

- [ ] `src/web/routes/assistant.ts`
  - [ ] デフォルト model を `gpt-4o` / `claude-sonnet-4-20250514` に変更
  - [ ] POST `/api/assistant/propose` に `{provider, model}` を受け取る引数を追加
  - [ ] `buildSystemPrompt()` を 6 セクション構成で書き直す（≥2500 文字）
  - [ ] レスポンス `meta.selectedProvider` / `selectedModel` を付与
- [ ] `src/web/public/index.html`
  - [ ] `renderProposeTab()` に provider / model selector を追加
  - [ ] localStorage 読み書き JS を追加
  - [ ] `assistantSend()` が POST body に provider / model を含める
- [ ] Tests (Red → Green)
- [ ] `spec/19_WEB_UI.md` に「AI Generate Model Selector」節を追記（済）
- [ ] `spec/08_TESTING_STRATEGY.md` に「AI Generate Model Selector & Quality」節を追記（済）

## 8. Not to be confused with `POST /api/skills/generate` (Batch 4)

`POST /api/skills/generate`（`src/web/routes/skills.ts`）は名前が似ているが **完全に別物** である。混同を避けるため明示する:

| 観点 | `POST /api/assistant/propose` (本仕様) | `POST /api/skills/generate` |
|---|---|---|
| 仕組み | LLM 呼び出し（OpenAI / Anthropic） | テンプレートベースのスキャフォールド（プログラム的生成） |
| LLM 使用 | あり | **なし** |
| コスト | モデルに応じた API 料金が発生 | ¥0 |
| モデル選択 | UI / body で provider / model を指定可 | N/A（LLM を使わない） |
| 出力 | 自然言語入力に応じた `ProposalPlanSet`（非決定的） | プロジェクト scan 結果に応じた固定スキル一覧（決定的）。レスポンスに `template: true` を含む |
| UI | `/ai-generate` ページの Send ボタン | 現状、UI からは呼ばれない（CLI / 外部 API 用途） |
| ユースケース | 「Tailwind の設定を読んで適切な skill を作って」のような自由形式の指示 | プロジェクト初期化時に project-conventions / test / deploy 等のテンプレを一括生成 |

つまり、「品質の低さ」「モデル選択がない」といった懸念が `/api/skills/generate` のレスポンスに対して向けられた場合、それはそもそも LLM の出力ではなく、`src/skills/skill-generator.ts` の固定テンプレ出力であることを思い出す必要がある。詳細は `spec/19_WEB_UI.md` の「Skills: Template Scaffold vs AI Generate」節を参照。

## 9. Backward Compatibility

- `POST /api/assistant/propose` は `provider` / `model` が省略されていれば従来通り動く（デフォルトのみ差し替わる）。
- localStorage キーが未設定のユーザは、初回ロード時に provider=Settings default / model=Settings default で初期化される。
- Settings ページの `defaultProvider` / `defaultModels` には影響しない。AI Generate 独自の選択状態は localStorage に閉じる。

## 10. Workflow Plan Kinds (v3.x — Batch 5 / Phase 1)

### 10.1 Why

`/ai-generate` の現状の system prompt は「単一の skill / agent / command を作る」前提の few-shot しか持たず、ユーザが (a) 仕様 → RED テスト → 実装の TDD ワークフロー、(b) 配布可能な plugin bundle、を要求した時に kind=skill 単発で返してしまう。Batch 5 はリクエスト時に **planKind** を選べるようにし、選択値に応じて few-shot を切り替える。

### 10.2 planKind enum

| value | 意味 | few-shot |
|---|---|---|
| `auto`              | 既存挙動（後方互換）。1〜2 choice、kind 自由。 | Example A (slash command), Example B (skill) |
| `spec-first-tdd`    | 仕様 → RED test → 実装の 3 artifact を 1 choice で返す。`applySteps` に「Run npm test and verify GREEN」を含める。 | + Example C (spec-first TDD) |
| `plugin-bundle`     | 複数 artifact + `installPlan` を含む PluginDefinition 互換形式を返す。 | + Example D (plugin bundle) |

`auto` がデフォルト。後方互換は厳守 — `auto` 時の Examples / Quality Guidelines は v3.x 既存と完全一致する。

### 10.3 新 artifact kinds: `spec`, `test`

`spec-first-tdd` ワークフローを表現するため、artifact kind に 2 つ追加する:

| kind   | 配置先              | 拡張子 | 用途 |
|--------|--------------------|-------|----|
| `spec` | `spec/{name}.md`   | `.md` | 仕様書（要件 / 受入基準 / 不変条件） |
| `test` | `test/**/{name}.test.{ts,js}` | `.ts`, `.js` | RED フェーズの単体 / 結合テスト |

`VALID_KINDS` / `ALLOWED_EXTENSIONS` / `targetPathHint` validator もこれに合わせて拡張する。`spec` / `test` は `auto` 時にも valid（後方互換のため）だが、few-shot で誘導されるのは `spec-first-tdd` 時のみ。

### 10.4 POST /api/assistant/propose 入力契約拡張

```jsonc
{
  "prompt": "...",
  "scope": "project",
  "provider": "openai",        // optional (Batch 3)
  "model": "gpt-4o",           // optional (Batch 3)
  "planKind": "spec-first-tdd" // optional (Batch 5), default "auto"
}
```

検証:
- `planKind` は `"auto" | "spec-first-tdd" | "plugin-bundle"` 以外なら 400 `VALIDATION_ERROR`
- 省略 / `null` / `""` は `"auto"` として扱う
- レスポンスの `meta.selectedPlanKind` に解決値を返す（デバッグ用 / e2e 確認用）

### 10.5 system prompt の差分

`buildSystemPrompt(scope, planKind = 'auto')` に拡張する。planKind ごとに以下を後段に挿入する:

- `auto`           : 既存 Examples (A/B) のみ。Quality Guidelines #8 も既存通り。
- `spec-first-tdd` : Example A/B に加えて Example C を追加。Quality Guidelines #8 に "When `planKind=spec-first-tdd`, return exactly one choice with at least one spec, one test, and one implementation artifact, and include 'Run npm test and verify GREEN' as an applySteps entry." を追記。
- `plugin-bundle`  : Example A/B に加えて Example D を追加。Quality Guidelines #8 に "When `planKind=plugin-bundle`, group all artifacts into a single PluginDefinition-compatible bundle and use applySteps to describe `pm-orchestrator install`-style installation." を追記。

`auto` 時の出力は v3.x と完全に同一であること（差分 0）。

## 11. Plugin Bundle Output Contract (v3.x — Batch 5)

`planKind=plugin-bundle` の choice は、将来 `pm-orchestrator install` で 1 コマンド配布可能な形を目指す。最小契約は以下:

- `choice.title` … plugin の人間向け名称
- `choice.summary` … 1〜2 文の説明（後の plugin manifest の `description` 候補）
- `choice.artifacts[]` … 同梱する skill / agent / command / hook / script / spec / test
  - すべて project-relative path（`.claude/...`, `spec/...`, `test/...`）
  - 既存 file を上書きする場合は `riskNotes` に明記
- `choice.applySteps[]` … 「`npm pack && pm-orchestrator install <tarball>` のような 1 コマンドで全 artifact を配置できる手順」を人間語で記述
- `choice.rollbackSteps[]` … apply の完全な逆操作

将来拡張（このバッチでは未実装）:
- `installPlan` ブロックを自動生成 → `pm-orchestrator install` に直接渡せる JSON にする
- `manifest.json` artifact を bundle に含める
