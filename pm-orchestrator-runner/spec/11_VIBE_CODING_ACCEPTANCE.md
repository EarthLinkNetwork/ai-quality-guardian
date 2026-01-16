# 11_VIBE_CODING_ACCEPTANCE.md

本ファイルは、REPL を「vibe coding に耐える」状態として受け入れるための合格基準を定義する。
本ファイルは UX 追加仕様であり、Runner Core の権限や 7 フェーズを変更しない。

本ファイルに記載のない挙動は仕様外であり fail-closed とする。

---

## A. REPL 起動 fail-closed（必須）

REPL は起動時点で validate 相当の検証を行わなければならない。

- 対象 projectPath に `.claude/` が存在しない場合、REPL は即 ERROR として終了する。
- 親ディレクトリ探索は禁止（Project Resolution Rules に準拠）。
- 終了時の exit code は 0 ではならない。
- エラーメッセージは不足パス（例: `<project>/.claude`）を明示し、解決手順を 1〜3 行で提示する。

NOTE:

- `/init` は `.claude/` を生成するコマンドである。
- しかし `.claude/` 不在のまま REPL が通常動作することは禁止である。

---

## B. 自然言語タスクの実行成立条件（必須）

REPL においてスラッシュコマンド以外の入力（自然言語入力）が与えられた場合、
Runner はタスクを実行し、その結果を Evidence と実体成果物で証明しなければならない。

以下を満たさない場合、TaskStatus を COMPLETE としてはならない。

成立条件（すべて必須）:

1. Evidence が記録されている（EvidenceManager の規約に従う）
2. files_modified が空配列ではない（変更ファイルが 0 件なら COMPLETE 禁止）
3. 実行した tests_run が要求に従って記録されている（テスト実行が必要な場合）
4. 完了報告は推測を含まず、evidence_path の参照を含む

不成立の場合の扱い:

- Evidence が欠落: NO_EVIDENCE
- Evidence はあるが成果物が 0 件: INCOMPLETE
- 例外・実行失敗: ERROR
- 仕様違反が検出: INVALID

---

## C. 最小受け入れシナリオ（必須）

デモプロジェクトに対して以下が全て満たされること。

1. `.claude/` 不在で REPL 起動 -> ERROR 終了
2. `/init` 実行 -> `.claude/` 雛形生成
3. `/start` 実行 -> session_id 発行
4. 自然言語入力: "Create README.md" -> README.md が実際に生成される
5. `/tasks` で該当タスクが COMPLETE になっている
6. Evidence の保存先に session.json 等が存在する
