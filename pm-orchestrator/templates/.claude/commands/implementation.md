# Implementation Command

IMPLEMENTATION_MULTI_AGENT モードを明示的に起動するコマンド。

## Usage

```
/implementation <description>
```

## Description

このコマンドは大規模な実装タスクを並列実行モードで開始します。
タスクは独立したチャンクに分割され、最大4つの Task Agent が並列実行します。

## When to Use

- 複数の機能/モジュール/エンドポイントを含む大規模実装
- 10ファイル以上の変更が予想されるタスク
- 3時間以上かかると推定されるタスク
- 独立性の高い複数のサブタスクに分割可能なタスク

## Examples

### Example 1: API Implementation
```
/implementation ユーザー管理機能を実装してください。認証、プロフィール編集、権限管理を含む。
```

### Example 2: Multi-Module Refactoring
```
/implementation レガシーコードをモジュール化してください。共通ロジックを抽出し、各モジュールに分離。
```

### Example 3: Full Feature Development
```
/implementation ECサイトのショッピングカート機能を実装。商品追加、数量変更、削除、合計金額計算、クーポン適用を含む。
```

## Workflow

1. **Planner**: ユーザーインテント確認と制約収集
2. **Chunk Planner**: タスクを完遂可能なチャンクに分割
3. **Task Agents (parallel)**: 各チャンクを並列実行（最大4並列）
4. **Integrator**: 結果を統合
5. **Reporter**: 最終レポート作成

## Output

IMPLEMENTATION_MULTI_AGENT モードでは、以下の情報を含む詳細レポートが出力されます:

- 実行サマリ（総チャンク数、完了/部分完了/ブロック/未実行）
- Wave 別の詳細（各チャンクの状態）
- 次のアクション
- Completion Status（タスク完了判定）

## Notes

- デフォルトで最大4並列で実行されます
- チャンク間の依存関係は自動的に解決されます（Wave実行）
- 各チャンクは Definition of Done (DoD) に基づいて完了判定されます
- いずれかのチャンクが失敗しても、独立したチャンクは継続実行されます

## Related

- `/pm` - 標準の PM Orchestrator コマンド
- `.claude/agents/pm-orchestrator.md` - IMPLEMENTATION_MULTI_AGENT モード仕様
- `.claude/categories/task-categories.json` - カテゴリ定義
