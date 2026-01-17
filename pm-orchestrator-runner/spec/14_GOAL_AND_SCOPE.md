# 14_GOAL_AND_SCOPE.md

# 目的とスコープ

本章は pm-orchestrator-runner の目的とスコープを定義する。


## 目的

pm-orchestrator-runner を、自分自身を開発できる Claude Code Wrapper として完成させる。


## 最初のゴール

- 自分自身（runner）を runner で開発できる
- CLI と Web UI の両方から操作できる
- セッション・タスク・ログが割り込みなく安全に管理される
- API Key 周りで事故らない
- Claude Code に「考えさせない」仕様とする


## スコープ

- ローカル + ngrok 前提までを実装対象とする


## スコープ外

- AWS 本番化は対象外
