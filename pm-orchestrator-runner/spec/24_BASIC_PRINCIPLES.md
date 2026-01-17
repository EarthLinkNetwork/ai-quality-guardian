# 24_BASIC_PRINCIPLES.md

# 基本原則と禁止事項

本章は pm-orchestrator-runner の実装における基本原則と禁止事項を定義する。


## 基本原則（絶対）

- Claude Code は「設計者」ではない
- Claude Code は「作業者」である
- 仕様に書いていない判断をしてはならない
- 曖昧な場合は FAIL とする（勝手に補完しない）
- 既存実装があっても、仕様が優先される


## 禁止事項

- 仕様の簡略化
- 勝手な設計変更
- 「とりあえず」実装
- Claude Code に考えさせる行為


## 実装時の原則

- 仕様に書かれていることだけを実装する
- 仕様に書かれていないことは実装しない
- 不明な点は FAIL とする
- 推測で補完しない


## Cross-References

- 01_OVERVIEW.md (fail-closed モデル)
- 06_CORRECTNESS_PROPERTIES.md (正当性プロパティ)
