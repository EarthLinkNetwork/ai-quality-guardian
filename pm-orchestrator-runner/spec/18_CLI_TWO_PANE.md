# 18_CLI_TWO_PANE.md

# CLI 2ペイン UI 仕様

本章は CLI の 2ペイン構成を定義する。

本仕様は 10_REPL_UX.md の表示制御を具体化する。


## レイアウト（必須）

CLI は常に 2ペイン構成とする。


## 上部ペイン

- ログ表示専用
- スクロール可能
- 実行中ログはここにのみ出力
- 入力を妨げない


## 下部ペイン

- 入力専用
- 常に1行
- ログが割り込むことは禁止


## 入力中のログ割り込み禁止

下部ペインでユーザーが入力中に、上部ペインにログが流れても、
下部ペインの入力状態は絶対に乱れてはならない。

- カーソル位置を維持
- 入力中の文字列を維持
- プロンプト表示を維持


## 実行中の表示

- 詳細ログは出さない
- 進捗は 1行のみ表示

表示例:
```
RUNNING task-1234 | 12.3s | processing
```


## 完了時の表示

- 結果サマリー
- 変更ファイル一覧
- 次に可能な操作

表示例:
```
COMPLETE task-1234 | 45.2s

Files modified:
  - src/index.ts
  - src/utils.ts

Next: /tasks, /logs task-1234, or enter next task
```


## Cross-References

- 05_CLI.md (CLI コマンド仕様)
- 10_REPL_UX.md (REPL UX 仕様)
- 13_LOGGING_AND_OBSERVABILITY.md (ログ表示仕様)
