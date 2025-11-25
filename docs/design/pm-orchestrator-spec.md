# PM Orchestrator 仕様書 v1.0

**作成日**: 2025-01-24
**目的**: PM Orchestratorの「あるべき姿」を定義し、実装の方向性を明確化する
**ステータス**: Draft

---

## 1. 目的と背景

### 1.1 なぜPM Orchestratorが必要か

**現状の問題:**
- Main AIが複雑なタスクを受けると、ルール違反（MUST Rule 1, 4, 16等）を起こしやすい
- 一人で全部やろうとして、品質チェックが漏れる
- エラー時の対策が不十分（MUST Rule 5違反）
- 動作確認せずに「完了」報告（MUST Rule 2, 10違反）

**PM Orchestratorの役割:**
- 複雑なタスクを適切なサブエージェントに委譲
- 各サブエージェントの結果を統合
- 品質保証（lint, test, typecheck, build）を確実に実行
- MUST Rulesを守った開発フローを強制

### 1.2 ユーザーの要望（過去の指摘から）

1. **「何がなんでも動くようにしろ」** (v1.3.80-81で指摘)
   - 設計・ドキュメント化だけでは意味がない
   - 実際に動作する状態が完成の条件

2. **「サブエージェントが複数動いて、今何をしているかも出ている」** (Image #2)
   - どのサブエージェントが何をしているか視覚的に分かる
   - 進捗状況がリアルタイムで表示される
   - ツール呼び出し（Read, Bash等）が見える

3. **「色付き表示」**
   - 各サブエージェントが色で識別できる
   - PM Orchestrator: 黄色 (`\033[33m`)
   - Rule Checker: 赤色 (`\033[31m`)
   - Implementer: 緑色 (`\033[32m`)
   - Reporter: 青色 (`\033[34m`)
   - Designer: 紫色 (`\033[35m`)
   - QA: シアン色 (`\033[36m`)

4. **「reporterが結果をまとめて、Main AIに返す」**
   - 各サブエージェントの結果をReporterが統合
   - Main AIは統合結果をユーザーに報告

---

## 2. 参照実装の分析（Image #2から）

### 2.1 理想的な動作フロー

**Image #2に表示されている内容:**

```
[紫] code-analyzer: 同質診断と原因特定
  → Read tool呼び出し（複数ファイル）
  → Listed 23 paths

[緑] coder: Component modifications
  → Listed 25 paths
  → Read tool呼び出し

[赤] tester: E2E test creation
  → Read tool呼び出し
  → 66 lines read

[オレンジ] cicd-engineer: Headless test setup
  → Read tool呼び出し

[紫] procurement-validator: Integration confirmation
  → Listed 1160 paths
```

**キーポイント:**
1. **サブエージェント名と色**: 各サブエージェントが色付きで識別される
2. **実行内容の表示**: 「何をしているか」が明確に表示される
3. **ツール呼び出しの可視化**: Read, List, Bash等のツール呼び出しが見える
4. **進捗の可視化**: 「同質診断中...」「Component modifications...」等
5. **結果の表示**: 「Listed 23 paths」「66 lines read」等

### 2.2 現状の問題（Image #1から）

**現在の出力:**
```
[33m🎯 **PM Orchestrator**[0m (Yellow)
[31m🔴 RuleChecker[0m (Red)
...

（ANSI色コードが生テキストとして表示）
```

**問題点:**
1. PM Orchestratorが起動していない（Main AIがTask toolを呼んでいない）
2. サブエージェントが実行されていない
3. 色が表示されていない（ANSI色コードが生テキスト）
4. 進捗が表示されていない
5. ツール呼び出しが見えない

---

## 3. システムアーキテクチャ

### 3.1 全体構成

```
┌─────────────────────────────────────────────────────────┐
│                      ユーザー入力                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│           UserPromptSubmit Hook                          │
│  - パターン検出（CODERABBIT_RESOLVE等）                   │
│  - system-reminderに起動指示を表示                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    Main AI                               │
│  1. system-reminderを受信                                │
│  2. CRITICAL Rules表示                                   │
│  3. Task toolでpm-orchestratorを起動 ←【現在ここで止まる】│
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│            🎯 PM Orchestrator (Yellow)                   │
│  - タスク分析                                            │
│  - サブエージェント選択                                   │
│  - 順次起動・結果統合                                     │
└─────────────────────────────────────────────────────────┘
         ↓              ↓              ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 🔴 Rule      │  │ 🟢 Implementer│  │ 🔵 Reporter  │
│   Checker    │  │              │  │              │
│   (Red)      │  │   (Green)    │  │   (Blue)     │
└─────────────┘  └─────────────┘  └─────────────┘
         ↓              ↓              ↓
    ルールチェック   実装実行         結果統合
         ↓              ↓              ↓
┌─────────────────────────────────────────────────────────┐
│                   🔵 Reporter                            │
│  - 全サブエージェントの結果を統合                         │
│  - JSON形式でMain AIに返却                               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    Main AI                               │
│  - Reporterの結果を受信                                  │
│  - ユーザーに分かりやすく報告                             │
└─────────────────────────────────────────────────────────┘
```

### 3.2 起動フロー（詳細）

**Step 1: パターン検出（UserPromptSubmit Hook）**

```bash
# user-prompt-submit.sh
if [[ "$user_input" =~ "PRのレビュー指摘に対応" ]]; then
  echo "[system-reminder]"
  echo "🎯 PM Orchestrator 起動"
  echo "Main AIへ: Task tool で pm-orchestrator を起動してください"
  echo ""
  echo "検出パターン: PR_REVIEW_RESPONSE"
  echo "[/system-reminder]"
fi
```

**Step 2: Main AIによるTask tool呼び出し（必須）**

```
Main AI応答:

🔴 CRITICAL Rules表示（省略）

🎯 PM Orchestratorを起動します

[Task tool呼び出し]
  subagent_type: pm-orchestrator
  description: PRレビュー指摘への対応
  prompt: ユーザー入力: 「PRのレビュー指摘に対応してください」
          検出パターン: PR_REVIEW_RESPONSE
```

**重要な変更点（ユーザー指摘）:**
- ❌ 「複雑なタスクを検出しました」は不正確
- ✅ hookが起動した時点で、PM Orchestratorは必ず起動する
- ✅ 複雑度は事前にはわからない
- ✅ PM Orchestratorが起動してから複雑度を分析する

**Step 3: PM Orchestrator起動（Phase 8実装）**

```markdown
\033[33m🎯 **PM Orchestrator**\033[0m - タスク分析・サブエージェント起動

## 複雑度分析中...

ユーザー入力: 「PRのレビュー指摘に対応してください」

分析結果:
- タスクタイプ: pr_review
- 影響範囲: 複数ファイル（PR全体）
- 必要なサブエージェント: rule-checker, implementer, qa, reporter
- 複雑度: **medium**（PRレビュー対応は中程度の複雑さ）

理由: PRレビュー指摘は複数の変更が必要で、品質チェックも必須のため

## サブエージェント起動

このタスクは中程度の複雑さです。適切なサブエージェントを順次起動します。

### 1. Rule Checker起動中...
```

**Step 4: Rule Checker実行**

```markdown
\033[31m🔴 **Rule Checker**\033[0m - MUST Rules検証

## Rule 1: ユーザー指示の厳守
✅ チェック: ユーザー指示に従った実装か？

## Rule 4: Git操作前の確認
✅ チェック: 現在のブランチは？重要ブランチではないか？

[Read tool]
  file: .git/HEAD
  result: ref: refs/heads/feature/fix-pr-review

✅ 全ルールチェック合格

[JSON出力]
{
  "agent": { "name": "rule-checker", "status": "completed" },
  "result": { "status": "success", "violations": [] }
}
```

**Step 5: Implementer実行**

```markdown
\033[32m🟢 **Implementer**\033[0m - 実装実行

## 実装内容
PR #123のレビュー指摘に対応します。

[Read tool]
  file: src/components/Button.tsx
  lines: 120

[Edit tool]
  file: src/components/Button.tsx
  old: const Button = () => { ... }
  new: const Button: React.FC<ButtonProps> = () => { ... }

✅ 実装完了

[JSON出力]
{
  "agent": { "name": "implementer", "status": "completed" },
  "result": { "status": "success", "filesChanged": 1 }
}
```

**Step 6: QA実行**

```markdown
\033[36m🔵 **QA**\033[0m - 品質検証

## Lint実行
[Bash tool]
  command: pnpm lint
  result: ✅ No errors

## Test実行
[Bash tool]
  command: pnpm test
  result: ✅ All tests passed

## TypeCheck実行
[Bash tool]
  command: pnpm typecheck
  result: ✅ No type errors

## Build実行
[Bash tool]
  command: pnpm build
  result: ✅ Build successful

[JSON出力]
{
  "agent": { "name": "qa", "status": "completed" },
  "result": { "status": "success", "allChecksPassed": true }
}
```

**Step 7: Reporter統合**

```markdown
\033[34m🔵 **Reporter**\033[0m - 結果統合

## 全サブエージェント結果

1. Rule Checker: ✅ 全ルール合格
2. Implementer: ✅ 1ファイル変更
3. QA: ✅ 全品質チェック合格

## 最終判定
✅ タスク完了

[JSON出力]
{
  "agent": { "name": "reporter", "status": "completed" },
  "result": {
    "status": "success",
    "summary": "PRレビュー指摘への対応が完了しました",
    "subagentResults": [ ... ]
  }
}
```

**Step 8: Main AIがユーザーに報告**

```
Main AI応答:

PRレビュー指摘への対応が完了しました。

【実施内容】
- src/components/Button.tsx: 型定義を追加

【品質チェック】
- Lint: ✅ 合格
- Test: ✅ 合格
- TypeCheck: ✅ 合格
- Build: ✅ 合格

全ての品質チェックに合格しています。
```

---

## 4. 技術仕様

### 4.1 ANSI色コード

各サブエージェントは以下の色で識別される：

| サブエージェント | 色 | ANSIコード | 表示例 |
|-----------------|---|-----------|--------|
| PM Orchestrator | 黄色 | `\033[33m` | `\033[33m🎯 **PM Orchestrator**\033[0m` |
| Rule Checker | 赤色 | `\033[31m` | `\033[31m🔴 **Rule Checker**\033[0m` |
| Implementer | 緑色 | `\033[32m` | `\033[32m🟢 **Implementer**\033[0m` |
| QA | シアン | `\033[36m` | `\033[36m🔵 **QA**\033[0m` |
| Reporter | 青色 | `\033[34m` | `\033[34m🔵 **Reporter**\033[0m` |
| Designer | 紫色 | `\033[35m` | `\033[35m🟣 **Designer**\033[0m` |

**重要**: これらの色は、Task toolで起動されたサブエージェントの応答内で表示される。system-reminder内では色は表示されない。

### 4.2 JSON出力形式

全サブエージェントは統一JSON形式で結果を返す：

```json
{
  "agent": {
    "name": "agent-name",
    "type": "専門サブエージェント",
    "role": "責務",
    "status": "completed|failed"
  },
  "execution": {
    "phase": "完了|エラー",
    "toolsUsed": ["Read", "Edit", "Bash"],
    "findings": [
      { "type": "info|warning|error", "message": "説明" }
    ]
  },
  "result": {
    "status": "success|error",
    "summary": "要約",
    "details": { ... },
    "recommendations": ["推奨事項1", "推奨事項2"]
  },
  "nextStep": "次のステップ"
}
```

### 4.3 応答テンプレート（各サブエージェント）

**pm-orchestrator.md (line 12):**

```markdown
# 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭に以下の識別子を表示すること：**

\033[33m🎯 **PM Orchestrator**\033[0m - タスク分析・サブエージェント起動
```

**rule-checker.md:**

```markdown
# 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭に以下の識別子を表示すること：**

\033[31m🔴 **Rule Checker**\033[0m - MUST Rules検証
```

**implementer.md:**

```markdown
# 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭に以下の識別子を表示すること：**

\033[32m🟢 **Implementer**\033[0m - 実装実行
```

**qa.md:**

```markdown
# 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭に以下の識別子を表示すること：**

\033[36m🔵 **QA**\033[0m - 品質検証
```

**reporter.md:**

```markdown
# 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭に以下の識別子を表示すること：**

\033[34m🔵 **Reporter**\033[0m - 結果統合
```

**designer.md:**

```markdown
# 応答テンプレート（必須・毎回実行）

**全ての応答の冒頭に以下の識別子を表示すること：**

\033[35m🟣 **Designer**\033[0m - 設計・計画
```

---

## 5. 起動パターン

### 5.1 自動起動すべきパターン

UserPromptSubmit hookは以下のパターンを検出した場合、PM Orchestratorの起動を指示する：

| パターン名 | 検出条件 | 例 |
|-----------|---------|---|
| CODERABBIT_RESOLVE | CodeRabbitコメントの解決 | 「CodeRabbitの指摘に対応」 |
| LIST_MODIFICATION | 複数箇所の一括修正 | 「バージョンを5箇所更新」 |
| PR_REVIEW_RESPONSE | PRレビュー指摘への対応 | 「PRのレビュー指摘に対応」 |
| COMPLEX_IMPLEMENTATION | 複雑な実装要求 | 「新機能を追加」 |
| QUALITY_CHECK | 品質チェック要求 | 「全品質チェックを実行」 |

### 5.2 起動不要なパターン

以下の場合は、Main AIが直接対応し、PM Orchestratorは起動しない：

- 単純な質問（「このファイルはどこ?」）
- 単一ファイルの小規模修正（「このtypoを修正」）
- 情報確認のみ（「現在のブランチは?」）

---

## 6. 必須要件

### 6.1 動作確認（MUST Rule 2）

**全ての実装は、実際に動作確認してから「完了」とすること：**

1. ✅ Main AIがTask toolを呼ぶ
2. ✅ PM Orchestratorが起動する
3. ✅ サブエージェントが順次実行される
4. ✅ 色付き表示が正しく出る
5. ✅ ツール呼び出しが見える
6. ✅ 進捗が表示される
7. ✅ Reporterが結果を統合する
8. ✅ Main AIがユーザーに報告する

**「設計書を書いた」≠「動作する」**
**「ドキュメント化した」≠「完了」**
**実際に動作する状態 = 完了**

### 6.2 品質保証（MUST Rule 19）

**全てのサブエージェント実装は、以下を実行してから完了：**

```bash
pnpm lint       # Lint
pnpm test       # Test
pnpm typecheck  # TypeCheck
pnpm build      # Build
```

**実行せずに「テストした」と報告することは嘘（MUST Rule 10違反）**

### 6.3 テンプレート同期（MUST Rule 16）

**`.claude/hooks/` を修正したら、必ず `templates/hooks/` も同期すること：**

```bash
# 同期確認
diff .claude/hooks/user-prompt-submit.sh templates/hooks/user-prompt-submit.sh

# 同期実行
cp .claude/hooks/user-prompt-submit.sh templates/hooks/user-prompt-submit.sh
```

---

## 7. 開発計画への移行

この仕様書を基に、以下の開発計画を作成する：

1. **Phase 1: Main AIのTask tool自動呼び出し実装**
   - UserPromptSubmit hookからの指示を受けて、Task toolを呼ぶ

2. **Phase 2: PM Orchestratorの実行フロー実装**
   - Phase 8定義に従ったサブエージェント起動

3. **Phase 3: 各サブエージェントの応答テンプレート検証**
   - 色付き表示が正しく動作するか確認

4. **Phase 4: 統合テスト**
   - ユーザー入力 → hook検出 → PM起動 → サブエージェント実行 → Reporter統合 → Main AI報告

5. **Phase 5: Image #2と同じ動作の実現**
   - 参照実装と同じレベルの可視化

---

## 8. 成功基準

**以下の全てを満たして、初めて「PM Orchestrator v1.0完成」とする：**

- [ ] Main AIがTask toolを自動で呼ぶ
- [ ] PM Orchestratorが実際に起動する
- [ ] サブエージェントが順次実行される
- [ ] 各サブエージェントが色付きで識別できる
- [ ] ツール呼び出し（Read, Edit, Bash等）が表示される
- [ ] 進捗状況がリアルタイムで表示される
- [ ] Reporterが全結果を統合する
- [ ] Main AIがユーザーに分かりやすく報告する
- [ ] Image #2と同等の可視化レベル
- [ ] 全品質チェック（lint/test/typecheck/build）合格
- [ ] `.claude/hooks/` と `templates/hooks/` が同期済み

---

## 9. 参考資料

- **pm-orchestrator.md**: Phase 8実装定義（line 975-1193）
- **Image #2**: 参照実装の理想的な動作
- **CLAUDE.md**: MUST Rules、PM Orchestrator自動起動ガイドライン
- **README.md**: PM Orchestrator アーキテクチャ（Hub-and-Spoke）

---

**次のステップ**: この仕様書を基に、開発計画（Implementation Plan）を作成してください。
