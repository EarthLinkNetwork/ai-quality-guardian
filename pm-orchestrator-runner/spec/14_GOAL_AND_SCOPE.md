# 14_GOAL_AND_SCOPE.md

# 目的とスコープ

本章は pm-orchestrator-runner の目的、製品アイデンティティ、およびスコープを定義する。

---

## 1. 製品アイデンティティ

### 1.1 LLM Layer としての本質

**pm-orchestrator-runner は「Claude Code を包む LLM レイヤー」である。**

```
User
  │
  v
pm-orchestrator-runner (LLM Layer)
  │
  ├── Review Loop: PASS/REJECT/RETRY 自動判定
  ├── Task Chunking: 自動タスク分割
  ├── Mandatory Rules: 省略禁止・証跡必須等の自動注入
  ├── Persistent Logging: 全履歴の永続化
  │
  v
Claude Code (Executor)
  │
  v
File System / External APIs
```

### 1.2 Claude Code 単体との違い

| 観点 | Claude Code 単体 | pm-orchestrator-runner |
|------|------------------|------------------------|
| 完了判定 | Claude Code が宣言 | **Runner が判定**（Evidence ベース） |
| 省略検出 | なし | **自動検出 + REJECT** |
| リトライ | 手動 | **自動（Review Loop）** |
| タスク分割 | 手動 | **自動（Task Chunking）** |
| ログ永続化 | 一時的 | **永続（再起動後も参照可）** |
| ルール注入 | 手動 | **自動（Mandatory Rules）** |

### 1.3 製品の価値

1. **品質保証の自動化**
   - 省略・不完全・TODO残りを自動検出
   - REJECT → 修正指示 → 再実行の自動ループ
   - ユーザーには「1タスク」として見える

2. **大規模タスクの効率化**
   - 大きなタスクを自動分割
   - 並列/逐次実行の自動選択
   - サブタスク毎の自動リトライ

3. **トレーサビリティ**
   - 全ての PASS/REJECT/RETRY 履歴を永続化
   - Web UI で過去タスクを閲覧可能
   - 監査・デバッグに対応

---

## 2. 目的

### 2.1 主目的

pm-orchestrator-runner を、**Claude Code の品質を自動保証する LLM レイヤー**として完成させる。

### 2.2 最初のゴール

- 自分自身（runner）を runner で開発できる（自己開発）
- CLI と Web UI の両方から操作できる
- セッション・タスク・ログが割り込みなく安全に管理される
- API Key 周りで事故らない
- **Claude Code に「完了」を勝手に宣言させない**
- **REJECT → 修正 → PASS の自動ループが機能する**

---

## 3. 設計原則

### 3.1 Claude Code に「考えさせない」

- Runner が唯一の完了判定者
- Claude Code は「作業者」であり「設計者」ではない
- 仕様に書いていない判断を Claude Code にさせない
- 曖昧な場合は REJECT（Fail-Closed）

### 3.2 Evidence-Based Completion

- 「完了」と判定するには Evidence が必須
- ファイルが実際にディスク上に存在することを検証
- 省略マーカー（`...`、`// etc.`）が残っていないことを検証
- TODO/FIXME が残っていないことを検証

### 3.3 Fail-Closed

- 判定不能な場合は REJECT
- エラー時は安全側に倒す
- 不明な状態でタスクを COMPLETE にしない

---

## 4. スコープ

### 4.1 実装対象

- ローカル + ngrok 前提までを実装対象とする
- CLI（REPL）インターフェース
- Web UI（ローカル + ngrok）
- Review Loop（PASS/REJECT/RETRY）
- Task Chunking（自動タスク分割）
- Mandatory Rules 自動注入
- 永続ログ（再起動後も参照可能）

### 4.2 スコープ外

- AWS 本番化は対象外
- マルチテナント対応は対象外
- 課金・認証基盤は対象外

---

## 5. 典型的なフロー

### 5.1 Review Loop による品質保証

```
User: 「README.md を作成して」
  │
  v
Runner: Claude Code に投入（Mandatory Rules 注入済み）
  │
  v
Claude Code: README.md を作成
  │
  v
Review Loop: 品質判定
  ├── ✓ ファイル存在
  ├── ✗ 「// 後で追記」が残っている → REJECT
  │
  v
Runner: 修正指示を生成して再投入
  │
  v
Claude Code: 修正して再出力
  │
  v
Review Loop: 品質判定
  ├── ✓ ファイル存在
  ├── ✓ 省略マーカーなし
  ├── ✓ TODO なし
  └── → PASS
  │
  v
Runner: COMPLETE（ユーザーには「1タスク」として見える）
```

### 5.2 Task Chunking による自動分割

```
User: 「ログイン、ログアウト、セッション管理を実装して」
  │
  v
Runner: タスク分析 → 3つのサブタスクに分割
  ├── Subtask 1: ログイン機能
  ├── Subtask 2: ログアウト機能
  └── Subtask 3: セッション管理
  │
  v
Runner: 各サブタスクを並列実行（各サブタスクは Review Loop を通過）
  │
  v
全サブタスク完了
  │
  v
Runner: 親タスクを COMPLETE
```

---

## 6. Cross-References

- spec/25_REVIEW_LOOP.md（Review Loop 仕様）
- spec/26_TASK_CHUNKING.md（Task Chunking 仕様）
- spec/17_PROMPT_TEMPLATE.md（Mandatory Rules 注入）
- spec/13_LOGGING_AND_OBSERVABILITY.md（永続ログ）
- spec/24_BASIC_PRINCIPLES.md（基本原則）
