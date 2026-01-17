# 21_STABLE_DEV.md

# stable / dev 構成

本章は stable runner と dev runner の構成を定義する。


## 概念

### stable

- 自分自身を開発するために使う実行環境
- 壊れない（常に動作可能）
- 常に安定（リリース品質）
- **dev の開発作業を行う主体**

### dev

- 開発対象（変更されるコード）
- 壊れてよい（実験可能）
- 実験場（新機能の試験）


## 構造

stable runner が dev runner を開発する構造を前提とする。

```
stable runner (実行環境)
  |
  +-- develops --> dev runner (開発対象)
  |
  +-- tests --> dev runner
  |
  +-- builds --> dev runner
```

**重要**: stable が dev を開発する。逆ではない。


## ディレクトリ構成

```
/path/to/runners/
  stable/
    pm-orchestrator-runner/  (安定版 - ここから開発作業を実行)
      src/
      package.json
      ...
  dev/
    pm-orchestrator-runner/  (開発版 - 変更対象)
      src/
      package.json
      ...
```


## 運用ルール

### 基本原則

1. stable は常に動作する状態を維持
2. dev への変更は stable から行う
3. dev が壊れても stable に影響しない
4. dev が安定したら stable にマージ

### 開発ワークフロー

```
1. stable runner を起動
   $ cd /path/to/runners/stable/pm-orchestrator-runner
   $ pm-orchestrator repl --project-mode cwd

2. stable から dev のコードを編集
   > "dev/pm-orchestrator-runner/src/xxx.ts を編集してください"

3. stable から dev のテストを実行
   > "dev/pm-orchestrator-runner でテストを実行してください"

4. stable から dev のビルドを実行
   > "dev/pm-orchestrator-runner をビルドしてください"

5. dev が安定したら stable にコピー
   $ cp -r dev/pm-orchestrator-runner/* stable/pm-orchestrator-runner/
```

### 禁止事項

- dev runner で stable を編集してはならない
- stable と dev を同時に編集してはならない
- stable のコードを直接編集してはならない（dev 経由で更新）


## バージョン管理

### stable

- リリースタグ付きバージョン（例: v1.0.0）
- npm publish 可能な品質
- 全テスト通過済み

### dev

- 開発中バージョン（例: v1.0.1-dev）
- `-dev` サフィックス付き
- テスト失敗があってもよい


## マージ手順

dev が安定したら stable にマージする手順:

```
1. dev の全テストが通過することを確認
   $ cd /path/to/runners/dev/pm-orchestrator-runner
   $ npm test

2. dev のビルドが成功することを確認
   $ npm run build

3. stable にコピー
   $ cd /path/to/runners
   $ cp -r dev/pm-orchestrator-runner/* stable/pm-orchestrator-runner/

4. stable でテスト実行（確認）
   $ cd stable/pm-orchestrator-runner
   $ npm test

5. バージョンタグ更新
   $ npm version patch  # or minor / major

6. stable をリリース
   $ npm publish
```


## 状態管理

stable と dev は独立した状態を持つ:

| 項目 | stable | dev |
|------|--------|-----|
| Session | 独自 | 独自 |
| Queue Store | 独自 | 独自 |
| Task Group | 独自 | 独自 |
| settings.json | 独自 | 独自 |

**注意**: ファイルシステム（開発対象のコード）は共有される。


## Cross-References

- 14_GOAL_AND_SCOPE.md (自分自身を開発できるゴール)
- 22_ACCEPTANCE_CRITERIA_STRICT.md (stable が dev を開発できる受入基準)
