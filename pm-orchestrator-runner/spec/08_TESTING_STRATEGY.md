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

