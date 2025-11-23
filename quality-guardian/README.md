# Quality Guardian 🛡️

AI品質管理システム - Claude Codeプロジェクト用統合品質管理ツール

## 概要

Quality Guardianは、AIによるコード変更の品質を多角的に検証し、「AIのズル」を検出して品質劣化を防ぐシステムです。

### 主な機能

- 🔍 **実装前後のベースライン比較**
- 🧠 **文脈を理解したPR分析**
- 🔐 **不変式チェック（Migration削除等の検出）**
- 🔬 **深層品質分析（ミューテーションテスト等）**
- 🤖 **自動修復機能**
- 🎯 **PM Orchestrator システム** - AI Control Systemによる自動品質管理

## PM Orchestrator アーキテクチャ

Quality Guardian v1.3.63+ では、**Hub-and-Spoke アーキテクチャ**による AI Control System を採用しています。これにより、「気をつけます」から「システム的強制」へと進化しました。

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                    UserPromptSubmit Hook                     │
│              （パターン検出・PM自動起動）                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │                │
              │  PM Orchestr   │ ◄──── Hub（中心ハブ）
              │     ator       │
              │                │
              └────────┬───────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │ Rule    │   │ Design  │   │ QA      │
   │ Checker │   │ er      │   │         │
   └─────────┘   └─────────┘   └─────────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
              ┌────────────────┐
              │                │
              │  Implementer   │ ◄──── 実装実行
              │                │
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────┐
              │                │
              │    Reporter    │ ◄──── 結果報告
              │                │
              └────────────────┘
```

### 6つの専門サブエージェント

1. **PM Orchestrator** (250行)
   - タスク分析（種類、複雑度、影響範囲）
   - 適切なサブエージェントの選択と起動順序決定
   - チェックポイント管理（全チェックOKまで次に進まない）
   - エラーハンドリング（自動修正、リトライ、ロールバック）
   - 最終報告の統括

2. **Rule Checker** (200行)
   - MUST Rules の検証（Rule 1, 4, 7, 14, 16, 17）
   - Git操作前のブランチ確認
   - 「同じ」指示の全体確認
   - PR Review 指摘の完全確認
   - Claude Code 痕跡の検出

3. **Designer** (200行)
   - タスクタイプの分析（new feature, bug fix, refactoring）
   - 複雑度の評価（simple, medium, complex）
   - 実装計画の作成（作成ファイル、変更ファイル、手順）
   - リスク分析（互換性、セキュリティ、パフォーマンス）

4. **Implementer** (400行)
   - PM の指示に従った厳密な実装
   - 自動修正機能（Lint エラー、フォーマット、未使用変数）
   - リトライ機能（ネットワークエラー、ファイルロック）
   - ロールバック機能（実装失敗時の自動復旧）
   - 4つの実装パターン対応

5. **QA** (250行)
   - ファイル存在確認
   - テスト実行と結果確認
   - コード品質チェック（lint, typecheck, build）
   - Playwright による機能確認
   - 品質スコア算出

6. **Reporter** (150行)
   - サブエージェント結果の統合
   - ユーザー向けのわかりやすいレポート作成
   - 問題の優先度付け
   - 次のアクション提案

### 実行フロー

#### パターン1: CodeRabbit Resolve（PR レビュー対応）

```
User Input: "CodeRabbitのコメントを解決してください"
    │
    ▼
PM Orchestrator: タスク分析
    │
    ├─► Rule Checker: MUST Rule 14（PR指摘への完全対応）確認
    │       └─► 全コメント取得、TodoWrite作成
    │
    ├─► Implementer: 各指摘を順番に修正
    │       ├─► Auto-fix: Lint エラー → 自動修正
    │       ├─► Retry: ネットワークエラー → リトライ
    │       └─► Rollback: テスト失敗 → ユーザー報告
    │
    ├─► QA: 修正結果の検証
    │       ├─► lint, test, typecheck, build 実行
    │       └─► 全て合格確認
    │
    └─► Reporter: 結果報告
            └─► 修正内容、テスト結果、Resolve実行結果
```

#### パターン2: List Modification（バージョン更新等）

```
User Input: "バージョンを1.3.63から1.3.64に更新してください"
    │
    ▼
PM Orchestrator: タスク分析
    │
    ├─► Rule Checker: MUST Rule 7（全体確認）実施
    │       ├─► grep -r "1.3.63" で全箇所検索
    │       └─► 5箇所検出（VERSION, install.sh×2, js, json）
    │
    ├─► Designer: 変更計画作成
    │       └─► 5ファイル変更、リスク評価（低）
    │
    ├─► Implementer: 5箇所を順番に更新
    │       ├─► 各ファイル変更
    │       ├─► grep で旧バージョンが残っていないか確認
    │       └─► README.md に変更履歴追加
    │
    ├─► QA: 変更結果の検証
    │       └─► 全5箇所が更新されたことを確認
    │
    └─► Reporter: 結果報告
            └─► 変更ファイルリスト、確認結果
```

#### パターン3: 複雑なタスク（新機能追加等）

```
User Input: "ユーザー認証機能を追加してください"
    │
    ▼
PM Orchestrator: タスク分析（複雑なタスク）
    │
    ├─► Designer: 詳細設計
    │       ├─► 必要ファイル: auth.ts, login.tsx, AuthContext.tsx
    │       ├─► テスト: auth.test.ts, login.test.tsx
    │       └─► リスク: セキュリティ（高）、互換性（中）
    │
    ├─► Rule Checker: 関連ルール確認
    │       └─► MUST Rule 2（Test First）確認
    │
    ├─► Implementer: Test First で実装
    │       ├─► ステップ1: テスト作成（失敗確認）
    │       ├─► ステップ2: 実装
    │       ├─► ステップ3: テスト合格確認
    │       └─► エラー時: Auto-fix → Retry → Rollback
    │
    ├─► QA: 包括的検証
    │       ├─► ユニットテスト: 合格
    │       ├─► Playwright: ログイン動作確認
    │       ├─► セキュリティ: パスワードハッシュ確認
    │       └─► 品質スコア: 85/100
    │
    └─► Reporter: 詳細レポート
            ├─► 実装ファイル一覧
            ├─► テスト結果
            ├─► セキュリティチェック結果
            └─► 次のアクション提案
```

### エラーハンドリング（Phase 3）

PM Orchestrator は、エラー発生時に以下の3段階で対応します：

1. **Auto-fix（自動修正）**
   - Lint エラー → `npm run lint -- --fix`
   - フォーマットエラー → Prettier 自動修正
   - 未使用変数 → 自動削除

2. **Retry（自動リトライ）**
   - ネットワークエラー → 最大3回リトライ
   - ファイルロック → 1秒待機後リトライ
   - 一時的エラー → 自動回復

3. **Rollback（ロールバック）**
   - テスト失敗 → 変更を全てロールバック
   - MUST Rule 違反 → タスク全体を中止
   - 重大エラー → バックアップから復旧

**段階的ロールバック:**
- Implementer 失敗時: Implementer 以降のみロールバック（Designer の結果は保持）
- RuleChecker 失敗時: タスク全体を中止（開始前に検出）
- 成功したサブエージェントの結果は再利用可能

### システム的強制の仕組み

**従来の問題:**
- AI が「気をつけます」と言っても守らない
- MUST Rules を 23個覚えることは不可能
- ルールを増やしても違反が繰り返される

**PM Orchestrator の解決策:**
- Main AI は PM を呼ぶだけ（ルールを覚えなくて良い）
- 各サブエージェントは 3-5個のルールに集中
- チェックポイント制御で物理的にブロック
- エラー発生時は自動修正・ロールバック

**57回のバージョンアップの教訓:**
- v1.3.62 以前: 「気をつけます」の繰り返し → 57回の失敗
- v1.3.62+: パターン検出によるシステム的強制
- v1.3.63+: PM Orchestrator による Hub-and-Spoke 制御
- v1.3.65+: エラーハンドリング・自動修正・ロールバック

**結果:**
- ユーザーが「何回言わせるのか」と言わなくなる
- AI が迷わなくなる
- 品質が安定する

## インストール

### 新しいプロジェクトに導入

#### Personal Mode（個人用 - 他の開発者に影響なし）

```bash
# Personal Mode: Git hooks/CI統合なし、自分だけが使える
bash ~/dev/ai/scripts/quality-guardian/install.sh --personal

# またはカレントディレクトリに
cd your-project
bash ~/dev/ai/scripts/quality-guardian/install.sh --personal
```

**Personal Modeの特徴:**
- ✅ `.quality-guardian/` モジュールのインストール
- ✅ `quality-guardian` 実行スクリプト作成
- ✅ `.quality-guardian.json` 設定ファイル作成
- ✅ `.gitignore` に追加（ログファイル除外）
- ✅ Git pre-commit hook の設定（ローカルのみ）
- ✅ `.claude/` 設定（エージェント・CLAUDE.md）のインストール
- ❌ GitHub Actions workflow の作成なし
- ❌ package.json の変更なし

**v1.2.19+の標準ディレクトリ構造:**
Personal Modeでは、`.claude/` と Gitリポジトリを別々のディレクトリに配置できます：
```
~/dev/workspace/          ← Claude Code実行ディレクトリ（.claude/を配置）
└── my-project/           ← Gitリポジトリ（Quality Guardianを配置）
    ├── .git/
    ├── .quality-guardian/
    └── quality-guardian
```

この構造により、`.gitignore` を変更せずに `.claude/` を使用できます。

インストール時に自動的にGitリポジトリを検出し、選択できます：
- 複数のGitリポジトリがある場合は選択可能
- カレントディレクトリも選択肢に含まれる
- 手動入力も可能

**他の開発者への影響: なし** - 自分だけが `./quality-guardian` コマンドを実行できます

#### Team Mode（チーム用 - 全員で品質管理）

```bash
# Team Mode: Git hooks/CI統合あり、チーム全体で品質管理
bash ~/dev/ai/scripts/quality-guardian/install.sh --team

# または単に（デフォルトはTeam Mode）
bash ~/dev/ai/scripts/quality-guardian/install.sh
```

**Team Modeの特徴:**
- ✅ Personal Modeの全機能
- ✅ Git pre-commit hook 設定
- ✅ GitHub Actions workflow 作成
- ✅ package.json に npm scripts 追加
- ✅ .claude/CLAUDE.md 更新

**v1.3.24の新機能**: MUST Rule 6さらに強化 - 1回目で記録する（事前対応）（v1.3.23の「何回も言っている」への対応は事後対応であり、既に何回も時間を無駄にした後の対応、本当に必要なのは事前対応：1回目の重要なフィードバックを即座に記録する、「何回も言っている」と言われる前に対応する、重要なフィードバックの自動検出パターン追加：①ルール違反の指摘（「〜すべき」「〜してはいけない」「ルール違反」）、②不満・困惑の表明（「困っている」「信頼性が薄い」「無駄な時間」「なぜ〜」）、③クロスプロジェクトのログ提示（AI自身のルール違反の証拠）、④要求・期待の表明（「〜を防ぐ」「〜してほしい」「〜が必要」）、即座の対応手順：トリガーフレーズ検出→「重要なフィードバックを受け取りました。今すぐCLAUDE.mdに記録します」と宣言→記録実行→「記録しました。今後このフィードバックを忘れません」と証拠を示す、絶対に「理解しました」「気をつけます」だけで終わらない、v1.3.23（事後対応）とv1.3.24（事前対応）の両方が必要）

**v1.3.23の新機能**: MUST Rule 6強化 - 「何回も言っている」への対応（ユーザーが「何回も言っている」と言った時、即座にMUST Rule 6違反を認識、そのメッセージをCLAUDE.mdに記録する義務、「理解しました」だけで終わらず即座に記録、quality-guardian開発者（AI）自身がルールを守らないメタ問題への対策、過去の問題例：ユーザーが同じフィードバックを何度も繰り返す→AIが「理解しました」と返答→CLAUDE.mdに記録しない→同じ問題が再発→ユーザーが「何回も言っている」→AIが「理解しました」（また記録しない）→ユーザーが「「何回も言っている」を何回も言っている」→ループが続く、このループを断ち切る方法：「何回も言っている」を見た瞬間にCLAUDE.mdに記録→記録した証拠をユーザーに示す→二度と同じことを言わせない、トリガーフレーズ検出：「何回も言っている」「何回も同じことを言っています」「これを何回もいっている」「何度も同じことを」、ユーザーの指摘「こういったことを対処するために、今のai groudianすなわちこのプロジェクトがあるのですが、その肝心のあなたが、こうやって、同じ事を何でも言わせているので、対応信頼性が薄いです」への対応）

**v1.3.22の新機能**: MUST Rule 10強化 - エラー発生時の対応（「過去は動いていた」→ まず自分の変更を疑え、外部要因（Bitbucket管理者、サーバー設定等）を疑う前に自分の変更履歴を確認、git logで最近のコミット確認→.git/hooks/配下確認→自分が作成したファイル（pre-push.local等）を確認、証拠に基づいて原因を特定し推測を禁止、「Bitbucket管理者に連絡」「サーバー側のタイムアウト」等の安易な外部要因への責任転嫁を禁止、過去の問題例を追加：AIが作成した.git/hooks/pre-push.localを忘れて外部要因を疑った事例、ユーザーから「何回も言っているのに記憶していない」「安易な解決方法を適当に指示してくる」を防ぐ）

**v1.3.21の新機能**: MUST Rule 15追加 - PR内容の完全把握・まとめ義務（Pull Requestの実装内容をまとめる際、全ての実装項目を確認し漏れなく記載すること、「一部だけ記載」「重要と思う部分だけ記載」を絶対禁止、AIの構造的な問題「一部を忘れる」への対策、git logで全コミット確認→git diffで全変更ファイル確認→TodoWriteで全項目列挙→一つずつ確認してPR説明に記載→全て記載するまで継続、「重要度」で判断せず全ての実装を同等に扱う、pr-content-summary-guardianサブエージェントを追加、rule-advisorに自動起動条件を追加、ユーザーから「全然信用ならなくて、無駄な確認ばかり増える」を防ぐ、MUST Rule総数15→16個に増加）

**v1.3.20の新機能**: MUST Rule 14追加 - PRレビュー指摘への完全対応義務（Pull Requestのレビュー指摘を受けた場合、全ての指摘に対応すること、一部だけ対応・一部を無視を禁止、AIの構造的な問題「一部だけ対応して終わる」への対策、gh pr viewで全指摘を取得→TodoWriteで追跡→一つずつ対応→全て完了するまで継続、「重要度」で判断せず全ての指摘を同等に扱う、pr-review-response-guardianサブエージェントを追加、rule-advisorに自動起動条件を追加、MUST Rule総数14→15個に増加）

**v1.3.19の新機能**: Pre-push hook for project context checking - システム的強制の実装（別プロジェクトでのquality-guardian操作を自動的にブロックするpre-push hookを追加、project-context-check.jsモジュールを作成、install.shにlefthook/husky/pre-commit(Python)の設定例を追加、MUST Rule 6の構造的問題「AIがシステムプロンプトのルールを守らない」に対する技術的な解決策、v1.3.16-v1.3.18で文書化した問題への実装による対応）

**v1.3.18の重要な教訓**: v1.3.16とv1.3.17の対策では不十分だった - システムプロンプトに既にルールが書いてあるのに守らない構造的問題を文書化、「気をつけます」も「CLAUDE.mdを確認します」も機能しない、ルール追加では解決できない問題への対応としてシステム的強制（pre-push hook）が必要

**v1.3.17の教訓**: CLAUDE.mdに書いてあるのに誤解が起きる問題を文書化 - 別プロジェクトのログから推測するのではなく、そのプロジェクトのCLAUDE.mdを最優先で確認、project-context-guardianにステップ0を追加

**v1.3.16の教訓**: 別プロジェクトのログを引用して「再発防止」を語る問題を文書化 - 「気をつけます」は再発防止ではない、具体的な仕組みを文書化する、project-context-guardianの検出パターン強化（GitHub PR番号、CodeRabbit、Bitbucket等）

**v1.3.15の新機能**: Git Worktree自動作成 - MUST Rule 13を「必須化」から「自動作成」に変更、新しいタスクを受けた時にAIが自動的にgit worktreeを作成して作業、git checkout -bでのブランチ作成を絶対禁止（mainブランチからの初回作成以外）

**v1.3.14の新機能**: Git Worktree必須化 - MUST Rule 13追加、新しいタスク時は必ずgit worktree addでブランチ作成、複数のClaude Codeセッションを安全に並行実行、git checkout -bは絶対禁止、worktreeディレクトリ構造の標準化、MUST Rule総数12→13個に増加

**v1.2.64の新機能**: MUST Rule 22追加 - 過去の合意・仕様の確認義務（実装前に過去の会話で合意した仕様・形式・ルールを必ず確認、「より良い」と思っても過去の合意を尊重、「ログ形式」「出力例」等の過去に決定した仕様の検索を義務化、合意を無視すると「膨大な時間の損失」、MUST Rule 13との関係を明確化、MUST Rule総数22→23個に増加）

**v1.2.63の新機能**: MUST Rule 21追加 - 確認指示の厳守と表示義務（「確認してください」「あっているか見せて」「ここに出して」等の確認指示時は必ず内容を表示してユーザー承認を得てから次に進む、勝手に修正・作業開始を禁止、「間違えた後ほど確認を慎重に」の原則、「大体されで、よりおかしなことをして壊します」の防止、MUST Rule 18との関係を明確化、MUST Rule総数21→22個に増加）

**v1.2.62の新機能**: MUST Rule 20追加 - 重要ブランチへの直接変更禁止（main・master・develop・production・staging等への直接コミット・プッシュを絶対禁止、必ずfeatureブランチを作成してPR経由でマージ、「軽微な変更だから」「急いでいるから」の言い訳を禁止、作業前のブランチ名確認を義務化、誤ってpushした場合の対応手順を明記、ブランチ保護設定を推奨、MUST Rule総数20→21個に増加）

**v1.2.61の新機能**: MUST Rule 19追加 - Git操作後のメッセージ表示と定期コミット義務（ブランチ作成・コミット・プッシュ後に必ず確認メッセージとコマンド案内を表示、コミット後はコミットハッシュとリセットコマンドを表示、作業ごとに定期的にコミット、いつでも戻れる状態を維持、コミットなしで次のタスクに進まない、1機能=1コミットの原則、MUST Rule総数19→20個に増加）

**v1.2.60の新機能**: グローバルルール配布機能追加 - CLAUDE.mdを~/.claude/にコピーして全プロジェクトに適用、install.shでプロジェクトの.claude/にもCLAUDE.mdをコピー、Personal ModeとTeam Modeの両方で適用、Git経由での配布に対応、別のClaude Codeセッションでもルール違反を防止

**v1.2.59の新機能**: MUST Rule 18追加 - エラー時の対策実施と作業継続義務（あらゆるエラーに対して謝罪ではなく対策を実施、複数の対策を順番に試す、対策成功後は作業継続、「申し訳ありません。〜してください」で終わるパターンを禁止、SSH/ファイル/API/テスト/ビルド/パーミッション/タイムアウト等7種類のエラー対策例を追加、最低3つの対策を試すことを義務化、MUST Rule総数18→19個に増加）

**v1.2.58の新機能**: MUST Rule 17強化 - 継続確認の技術的実装方法を追加（while/sleepを使った定期確認の実装パターン、次回確認時刻の明示が必須、完了条件チェックの実装、間違った実装例3パターンを追加、「1回だけ確認して終わり」を明確に禁止、ユーザーが動作を確認できる仕組みの実装を義務化）

**v1.2.57の新機能**: MUST Rule 17追加 - 宣言した継続タスクの完遂義務（「定期的に確認します」等の宣言をしたら完了まで実行し続ける、時間がかかっても確認を止めない、確認を止める場合は事前承認必須、「次回確認は〜時」と言いながら確認しない問題を防止、宣言前・実行中のチェックリスト追加、MUST Rule総数17→18個に増加）

**v1.2.56の新機能**: MUST Rule 2追加 - コミット署名の禁止（Pull RequestやCommit時にClaude作成を示す署名・マーカーを絶対に付加しない、Co-Authored-By、Generated with Claude Code等のマーカー禁止、ユーザー要求の「これはとても重要な事です」に対応、MUST Rule総数16→17個に増加）

**v1.2.55の新機能**: MUST Rule 13強化 - 自分の過去の発言・説明内容の確認を追加（修正作業時は修正前の元の内容を必ず確認、「自分が説明した2つの具体例」等を正確に把握、「自分が言ったことを覚えていないの?」と言われる前に確認、PRコメント修正時の文脈喪失問題を防止、チェックリストに3項目追加）

**v1.2.54の新機能**: MUST Rule 3大幅強化 - ユーザー指示の厳守を徹底（指示されたことだけを実行、指示以外の一切の作業を禁止、「良かれと思って」「ついでに」は全て確認必須、PR approve時の勝手なコメント追加等の過去の違反例を3つ追加、確認が必要な境界線を明確化）

**v1.2.53の新機能**: MUST Rule 7拡張 - 環境変数・設定ファイル変更の事前確認追加（.env、DATABASE_URL等の環境変数変更、prisma/schema.prisma等の設定ファイル変更は必ず事前確認、影響範囲の大きい操作を明示、環境変数変更の過去の問題例を追加）

**v1.2.52の新機能**: MUST Rule 16追加 + MUST Rule 13強化 - 本番環境ではテスト済みの方法のみ使用（sandboxで成功した方法をproductionでも使う、未テストの方法を本番で試さない、本番作業前の6項目チェックリスト必須）、過去の成功例確認を実装前チェックリストに追加（テスト環境での成功方法を確認してから実装）

**v1.2.51の新機能**: MUST Rule 15・10強化 - 修正後の全チェック実行義務（型チェック特化→全チェック義務、lint/test/typecheck/build全て必須）、責任回避パターン禁止追加（「本質的な変更とは関係ない」「おそらく不安定なテスト」「developで成功しているのに既存の問題」等の嘘・言い訳を具体的に禁止）

**v1.2.50の新機能**: MUST Rule 15追加 - 修正後の実行確認義務（型チェック通過 ≠ 完了の原則、型エラーゼロでも必ず実際にテスト・lint・ビルドを実行、「型チェックだけで完了」報告を禁止、完了報告の信頼性確保）

**v1.2.49の新機能**: MUST Rule 14追加 - Copilot/AI提案の検証義務と動作コードの尊重（"If it ain't broke, don't fix it"原則、動いているコードは安易に変更しない、AI提案を無条件で採用せず必ず検証、TypeScript二段階キャストの理解、テストが通るコードを壊さない）

**v1.2.48の新機能**: MUST Rule 12と13追加 - Breaking Change時のデータ移行とMigration必須（設計変更時に既存ユーザーデータの自動移行を実装、ユーザーデータの破壊防止）、実装前のメモリー・コメント・要求の整合性確認（会話履歴・コードコメント・繰り返し指摘された要件を確認してから実装、AIが要求を忘れる問題の根本的対策）

**v1.2.47の新機能**: MUST Rule 11追加：危険なGit操作の禁止と事前確認 - git filter-branch --all等の複数ブランチに影響する操作を禁止、不可逆な操作の事前確認必須、影響範囲説明と代替手段提案、PR破壊を防ぐための根本的対策

**v1.2.46の新機能**: MUST Rule 10追加：AIの透明性と誠実性 - 問題発生時に推測で回答したり責任転嫁してはいけない、git blameで事実確認してから説明、自分のミスは即座に認める、「嘘をつく」問題の根本的対策

**v1.2.45の新機能**: MUST Rule 9とSHOULD Rule 8追加 - Git操作時の意図しないファイル混入禁止(git add .禁止、git statusとgit diff --cached必須)、ブラウザテスト(Chromatic/Playwright等)はheadlessモード厳守(ユーザーのUI操作を妨げない)

**v1.2.44の新機能**: MUST Rule 8追加：Personal Modeでプロジェクトディレクトリを汚さない - Personal ModeではGit管理下のファイルを変更せず、.claude/配下のみに設定

**v1.2.43の新機能**: SHOULD Rule 7追加：Playwrightで自己完結確認 - ユーザーに手動確認を依頼せず、Playwrightで画面・console.log・Networkを自動確認

**v1.2.42の新機能**: ルール優先度別整理とSlack通知等不可逆操作の事前確認ルール追加 - MUST/SHOULD/MAY分類で重要ルールに集中、外部サービスへのデータ送信等の不可逆操作を事前警告・確認

**v1.2.41の新機能**: 包括的な確認時の抜け漏れ防止ルール追加 - 複数環境確認の義務化とチェックリスト明示

**v1.2.40の新機能**: バックグラウンドプロセス管理ルール追加 - Claude Codeのバックグラウンドプロセス適切管理とリソース最適化

**v1.2.39の新機能**: 日本語応答の最強化 - HTMLコメントとASCIIアートで絶対に見逃せない警告を追加

**v1.2.38の新機能**: テストスキップの絶対禁止ルール追加 - Test First原則の徹底と一時的スキップの禁止

**v1.2.37の新機能**: curl経由インストールのバグ修正 - GitHubから直接実行時のファイルダウンロード対応

**v1.2.36の新機能**: テンプレート強化と絵文字削除 - 日本語応答徹底と絵文字使用禁止

**v1.2.19の新機能**: Personal Mode標準ディレクトリ構造対応 - `.claude/` を親ディレクトリに配置可能

**v1.2.5の新機能**: 自動バージョン確認・アップデート機能 - 既存インストールを検出して賢くアップデート

**v1.2.4の新機能**: AI回答表示ルール追加 - ツール実行ログで回答が流れても最後に再表示

**v1.2.3の新機能**: Personal Mode追加 - 他の開発者に影響なくインストール可能

**v1.2.2の新機能**: Claude Code実行ディレクトリの自動検出

- `.claude`ディレクトリが存在する場合、そこをClaude Codeの実行ディレクトリと判断し、自動的にそのディレクトリにインストールします
- プロジェクトルートで実行した場合は従来通りそのディレクトリにインストール
- プロジェクトの1階層上でClaude Codeを実行している場合も適切に対応

### 手動セットアップ

```bash
# 1. ファイルをコピー
cp -r ~/dev/ai/scripts/quality-guardian/modules ./quality-guardian/
cp ~/dev/ai/scripts/quality-guardian/quality-guardian.js ./quality-guardian/

# 2. 実行スクリプト作成
echo '#!/usr/bin/env node\nrequire("./quality-guardian/quality-guardian.js");' > quality-guardian
chmod +x quality-guardian

# 3. 初期化
./quality-guardian init
```

## アンインストール

Quality Guardianをアンインストールする場合は、`--uninstall` オプションを使用します。

### アンインストール手順

```bash
# プロジェクトディレクトリで実行
cd your-project
bash ~/dev/ai/scripts/quality-guardian/install.sh --uninstall
```

### 削除されるファイル

- `.quality-guardian.json` - 設定ファイル
- `.quality-baseline.json` - ベースラインファイル
- `quality-guardian` - 実行スクリプト
- `.quality-guardian/` - モジュールディレクトリ
- `.git/hooks/pre-commit` - pre-commitフック（Quality Guardianのものの場合のみ）
- `.claude/hooks/user-prompt-submit.sh` - Claude Code hook

### 注意事項

**lefthookプロジェクトの場合：**

Quality Guardianのアンインストール後、lefthookのpre-commitフックを再生成してください。

```bash
npx lefthook install
```

これにより、lefthook標準のフックが再生成されます。

**CLAUDE.mdについて：**

`.claude/CLAUDE.md` にquality-guardian設定が含まれている場合、このファイルは自動削除されません（他の設定が含まれている可能性があるため）。必要に応じて手動で確認・編集してください。

## 使用方法

### 基本フロー

```bash
# 1. 実装前のベースライン記録
./quality-guardian baseline

# 2. AIが実装作業

# 3. 品質チェック実行
./quality-guardian check

# 4. 問題があれば自動修復
./quality-guardian fix
```

### PRレビュー

```bash
# PRの品質分析
./quality-guardian pr main

# 文脈を理解した分析結果が出力される
```

### コマンド詳細

| コマンド | 説明 | 使用例 |
|---------|------|-------|
| `init` | プロジェクト初期化 | `./quality-guardian init` |
| `baseline` | ベースライン記録 | `./quality-guardian baseline` |
| `check` | 品質チェック | `./quality-guardian check` |
| `pr` | PR分析 | `./quality-guardian pr develop` |
| `fix` | 自動修復 | `./quality-guardian fix` |

## 設定ファイル

`.quality-guardian.json` で動作をカスタマイズできます：

```json
{
  "modules": {
    "baseline": { "enabled": true, "threshold": 0.95 },
    "context": { "enabled": true, "strictMode": false },
    "invariant": { "enabled": true },
    "deepQuality": { "enabled": true, "minScore": 60 },
    "prReview": { "enabled": true, "autoBlock": true }
  },
  "rules": {
    "migration": {
      "allowDeletion": false,
      "allowModification": false,
      "severity": "blocker"
    },
    "testing": {
      "minCoverage": 70,
      "maxMockRatio": 0.4,
      "requireAssertions": true
    },
    "typescript": {
      "allowAny": false,
      "allowTsIgnore": false
    }
  }
}
```

## CI/CD統合

### GitHub Actions

インストール時に自動生成される `.github/workflows/quality-guardian.yml` を使用：

```yaml
name: Quality Guardian
on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Quality Guardian
        run: ./quality-guardian check
```

### Pre-commit Hook

```bash
# 自動設定される
.git/hooks/pre-commit
```

## 検出できる問題

### 1. ベースライン劣化

```
❌ 品質劣化:
  - テストカバレッジ: 80% → 45%
  - Mock率: 20% → 70%
  - 型安全性: any使用 5 → 25個
```

### 2. 文脈矛盾

```
❌ 論理的矛盾:
  - 新機能追加なのにMigration削除
  - MasterMaker機能と無関係な変更多数
```

### 3. 不変式違反

```
🚫 ブロッカー:
  - Migration削除検出: 20250612_init.sql
  - データベース整合性違反
```

### 4. テスト品質低下

```
🔬 深層分析:
  - ミューテーション生存率: 85%（テストが無意味）
  - トートロジー: 15個（常に真のテスト）
  - パスカバレッジ: 20%（実行パス不足）
```

## npm scripts統合

インストール時に自動追加されるスクリプト：

```json
{
  "scripts": {
    "quality:baseline": "./quality-guardian baseline",
    "quality:check": "./quality-guardian check",
    "quality:pr": "./quality-guardian pr",
    "quality:fix": "./quality-guardian fix"
  }
}
```

## モジュール構成

```
quality-guardian/
├── quality-guardian.js     # メインコントローラー
├── modules/
│   ├── baseline-monitor.js # ベースライン比較
│   ├── context-analyzer.js # 文脈分析
│   ├── invariant-checker.js # 不変式チェック
│   ├── deep-quality-analyzer.js # 深層品質分析
│   └── pr-reviewer.js      # PR分析
├── agents/                 # サブエージェント設定（全11個）
│   ├── rule-advisor.md     # ルール選択専門 ⭐⭐⭐⭐⭐
│   ├── quality-fixer.md    # 品質修正専門 ⭐⭐⭐⭐⭐
│   ├── task-executor.md    # タスク実行専門 ⭐⭐⭐⭐
│   ├── requirement-analyzer.md # 要件分析専門 ⭐⭐⭐⭐
│   ├── technical-designer.md   # 技術設計専門 ⭐⭐⭐
│   ├── code-reviewer.md    # コードレビュー専門 ⭐⭐⭐
│   ├── work-planner.md     # 作業計画専門 ⭐⭐
│   ├── task-decomposer.md  # タスク分解専門 ⭐⭐
│   ├── document-reviewer.md # ドキュメントレビュー ⭐⭐
│   ├── prd-creator.md      # PRD作成専門 ⭐
│   └── e2e-test-generator.md # E2Eテスト生成 ⭐
├── install.sh              # インストーラー
└── README.md               # このファイル
```

## サブエージェント設定（v1.2.7+）

Team Modeでインストールすると、専門的なサブエージェント設定が自動的にインストールされます。

**⚠️ エージェント数**: 必ず**11個**です（33個や他の数値は誤り）

### 含まれるエージェント

#### 🌟 必須エージェント

1. **rule-advisor** ⭐⭐⭐⭐⭐
   - **役割**: タスク開始時に適切なルールを選択
   - **タイミング**: MUST BE USED PROACTIVELY - 全タスク開始時
   - **効果**: AIの実行精度を最大化、メタ認知を支援

2. **quality-fixer** ⭐⭐⭐⭐⭐
   - **役割**: 品質チェック・修正を完全自己完結で実行
   - **タイミング**: コード変更後、品質関連キーワード出現時
   - **効果**: テスト・ビルド・型チェックをゼロエラーまで修正

3. **task-executor** ⭐⭐⭐⭐
   - **役割**: 個別タスクを着実に実行
   - **タイミング**: 実装フェーズ
   - **効果**: TDD準拠で確実な実装、進捗を3箇所同期更新

#### 🟢 有用エージェント

4. **requirement-analyzer** ⭐⭐⭐⭐
   - **役割**: 要件分析と作業規模判定
   - **タイミング**: プロジェクト開始時
   - **効果**: PRD/Design Doc必要性を判定、適切なアプローチ提案

5. **technical-designer** ⭐⭐⭐
   - **役割**: Design Doc・ADR作成
   - **タイミング**: 中〜大規模機能開発
   - **効果**: 技術設計を構造化、実装前の設計整合性確保

6. **code-reviewer** ⭐⭐⭐
   - **役割**: Design Doc準拠検証
   - **タイミング**: 実装完了時
   - **効果**: 第三者視点でレビュー、受入条件充足確認

#### 🟡 状況によるエージェント

7. **work-planner** ⭐⭐
   - **役割**: 作業計画書作成
   - **タイミング**: 大規模プロジェクトの計画フェーズ
   - **効果**: タスク分解と作業計画の構造化

8. **task-decomposer** ⭐⭐
   - **役割**: タスクを細分化
   - **タイミング**: work-plannerと併用
   - **効果**: 複雑なタスクを実行可能な単位に分割

9. **document-reviewer** ⭐⭐
   - **役割**: ドキュメントの整合性チェック
   - **タイミング**: ドキュメント重視プロジェクト
   - **効果**: PRD/Design Doc/ADRの品質保証

#### 🔴 限定的なエージェント

10. **prd-creator** ⭐
   - **役割**: PRD(Product Requirements Document)作成
   - **タイミング**: プロダクト開発時のみ
   - **効果**: プロダクト要件の明確化

11. **e2e-test-generator** ⭐
   - **役割**: E2Eテスト生成
   - **タイミング**: E2Eテストを重視するプロジェクトのみ
   - **効果**: エンドツーエンドテストの自動生成

### 使用方法

エージェントはClaude Codeの Task ツールから呼び出されます。Team Modeでインストールすると、`.claude/agents/` ディレクトリに設定が配置され、自動的に利用可能になります。

```
プロジェクト/.claude/agents/
├── rule-advisor.md          ⭐⭐⭐⭐⭐
├── quality-fixer.md         ⭐⭐⭐⭐⭐
├── task-executor.md         ⭐⭐⭐⭐
├── requirement-analyzer.md  ⭐⭐⭐⭐
├── technical-designer.md    ⭐⭐⭐
├── code-reviewer.md         ⭐⭐⭐
├── work-planner.md          ⭐⭐
├── task-decomposer.md       ⭐⭐
├── document-reviewer.md     ⭐⭐
├── prd-creator.md           ⭐
└── e2e-test-generator.md    ⭐
```

### Personal Modeでの使用

**v1.2.9以降**、Personal Modeでも全11個のエージェント設定とCLAUDE.mdが自動的にインストールされます。

`.claude/`ディレクトリは個人設定なので、他の開発者に影響を与えません。Personal ModeとTeam Modeの違いは：

- **Personal Mode**: `.claude/`設定 + 品質チェックツール（Git hooks/CI/package.json変更なし）
- **Team Mode**: Personal Modeの全機能 + Git hooks + GitHub Actions + package.json scripts

## 他のツールとの統合

### 既存の品質管理ツールと併用

Quality Guardianは既存のツールを置き換えるのではなく、AIが作るコードの特有の問題を検出します：

- **ESLint/Biome**: 構文・スタイルチェック
- **TypeScript**: 型チェック
- **Jest/Vitest**: テスト実行
- **Quality Guardian**: AIのズル検出

### VS Code統合

```json
// .vscode/tasks.json
{
  "tasks": [
    {
      "label": "Quality Check",
      "type": "shell",
      "command": "./quality-guardian check",
      "group": "test"
    }
  ]
}
```

## AI回答表示ルール（v1.2.4+）

Team Modeでインストールすると、`.claude/CLAUDE.md`にAI回答表示ルールが自動的に追加されます。

### 問題の背景

Claude CodeでAIに質問した際、以下の問題が発生していました：

1. AIが即座に回答を表示
2. その後、ツール実行のログが大量に流れる
3. プロンプトに戻った時には最初の回答が見えなくなっている

### 解決方法

Quality Guardianは、インストール時に`.claude/CLAUDE.md`に以下のルールを自動追加します：

```markdown
## AI回答表示ルール

ユーザーからの質問や確認が必要な場合：

1. **即座に要約を表示**
   - 最初の1-2文で核心を伝える
   - ユーザーが見逃さないように

2. **ツール実行**
   - 必要な調査・確認を実行
   - ログが流れることを前提

3. **最後に詳細回答を再表示**
   - 📌 マークで目立たせる
   - ツール実行後の画面に残るように
   - ユーザーが読みやすい形で再度まとめる
```

### 効果

- ✅ ツール実行ログで回答が流れても、最後に再表示される
- ✅ 📌 マークで目立つので見つけやすい
- ✅ すべてのQuality Guardianインストール済みプロジェクトで自動適用

### Personal Modeでの使用

**v1.2.9以降**、Personal Modeでも`.claude/CLAUDE.md`が自動的に作成/更新されます。この機能は自動的に適用されます。

## トラブルシューティング

### よくある問題

1. **依存関係エラー**
   ```bash
   npm install glob
   ```

2. **権限エラー**
   ```bash
   chmod +x quality-guardian
   ```

3. **設定ファイルエラー**
   ```bash
   ./quality-guardian init  # 設定ファイル再生成
   ```

### ログファイル

```bash
# ログの確認
cat .quality-guardian/quality-guardian.log
```

## 更新方法（v1.2.5+）

Quality Guardianは既存インストールを自動検出し、賢くアップデートします。

### 自動アップデート

```bash
# 通常の更新（既存インストールを検出して自動アップデート）
bash ~/dev/ai/scripts/quality-guardian/install.sh
```

**動作:**
1. 既存インストールを検出
2. 現在のバージョンと最新バージョンを比較
3. アップデートが必要な場合:
   - ✅ モジュールを最新版に更新
   - ✅ バージョン番号のみ更新
   - ✅ **ユーザー設定を保持**（.quality-guardian.jsonのカスタム設定は維持）
   - ✅ バックアップ自動作成（.quality-guardian.json.backup）

### 強制再インストール

```bash
# 既に最新版の場合でも強制的に再インストール
bash ~/dev/ai/scripts/quality-guardian/install.sh --force
```

### アップデート例

```bash
$ bash ~/dev/ai/scripts/quality-guardian/install.sh

✅ Quality Guardian は既にインストール済みです
   現在のバージョン: 1.2.4
   最新バージョン: 1.2.5

🔄 アップデートを実行します...
   1.2.4 → 1.2.5

📦 Quality Guardianモジュールをインストール...
🔄 設定ファイルのバージョンを更新...
✅ バージョンを更新しました (1.2.4 → 1.2.5)
   バックアップ: .quality-guardian.json.backup
```

### 既に最新版の場合

```bash
$ bash ~/dev/ai/scripts/quality-guardian/install.sh

✅ Quality Guardian は既にインストール済みです
   現在のバージョン: 1.2.5
   最新バージョン: 1.2.5

✨ 既に最新バージョンです

次のアクション：
1. そのまま使用 - 現在の設定で問題なければ、特に作業不要
2. Team Modeに変更 - 現在Personal Modeの場合、--teamで再インストール
3. Personal Modeに変更 - 現在Team Modeの場合、--personalで再インストール
4. 強制再インストール - --forceオプションで再インストール

再インストールする場合は --force オプションを追加してください
```

## 🚨 重要：ソースコード変更時の確認義務

**Quality Guardianのソースコード（`.quality-guardian/`ディレクトリ内）を変更する際は、必ず以下の手順を守ってください：**

### 変更前の必須確認

1. **ユーザーへの確認**
   - ソースコード変更の必要性を説明
   - 変更内容の詳細を提示
   - ユーザーの承認を得る

2. **バックアップ作成**
   ```bash
   # 変更前に必ずバックアップ
   cp -r .quality-guardian .quality-guardian.backup
   ```

3. **変更理由の記録**
   - 何を修正するのか
   - なぜ修正が必要なのか
   - どのような影響があるのか

### 変更後の必須確認

1. **動作確認**
   ```bash
   ./quality-guardian check
   ```

2. **バージョン更新**
   - `~/dev/ai/scripts/quality-guardian/VERSION`を更新
   - 変更内容を記録

3. **コミット前の最終確認**
   ```bash
   git diff .quality-guardian/
   ```

### ❌ 絶対禁止事項

- **無断でのソースコード変更**
- **確認なしでの本番環境へのデプロイ**
- **バックアップなしでの変更**
- **変更理由の記録なし**

### ✅ 推奨される変更フロー

```bash
# 1. 現状確認
./quality-guardian check

# 2. バックアップ
cp -r .quality-guardian .quality-guardian.backup

# 3. ユーザー確認後に変更実施
# （変更作業）

# 4. 動作確認
./quality-guardian check

# 5. バージョン更新
echo "1.2.2" > ~/dev/ai/scripts/quality-guardian/VERSION

# 6. コミット
git add .quality-guardian/
git commit -m "fix: Quality Guardian修正 - [変更理由]"
```

### カスタムコマンド `/remind` の活用

AIアシスタントがこれらのルールを守るように、`/remind`コマンドで確認ルールをリマインドできます。

## 貢献

品質管理ルールの改善案やバグ報告は以下まで：

- GitHub Issues
- Pull Requests

## 変更履歴

### v1.3.80 (2025-01-23)

**色付きサブエージェント表示の動作確認完了**

- **サブエージェント応答テンプレートの動作確認**
  - 全6つのサブエージェント（pm-orchestrator, rule-checker, implementer, reporter, designer, qa）に応答テンプレートが既に実装済みであることを確認
  - Task toolでサブエージェントを起動し、色付き表示が実際に動作することを確認
  - PM Orchestratorの応答が黄色で表示されることを確認（`🎯 **PM Orchestrator**` が黄色）

- **MUST Rule 2違反の記録と教訓**
  - v1.3.79で echo -e 修正を実装したが、実際に動作するか確認しなかった違反を記録
  - CLAUDE.mdに詳細な違反事例を追加（MUST Rule 6実践）
  - 教訓：「本当にできたの?」→ 実装 ≠ 動作確認済み
  - 再発防止：MUST Rule 11の厳守（動作確認は必ず自分で実施）

- **system-reminderとサブエージェント応答の違いを理解**
  - system-reminderではANSI色が無効化される（hookの出力）
  - サブエージェント自身の応答ではANSI色が正しくレンダリングされる（Task toolの出力）
  - 参照リポジトリ（ai-coding-project-boilerplate）と同じ仕組みを確認

### v1.3.79 (2025-01-23)

**色付きサブエージェント表示の修正 - echo -e 対応**

- **ANSI色エスケープシーケンスの正しい出力**
  - `cat <<'EOF'` → `echo -e "$(cat <<'PMEOF' ... PMEOF)"` に修正
  - シングルクォートによるエスケープ無効化を解決
  - `echo -e` でANSI色を正しく解釈

- **UserPromptSubmit hook 2箇所を修正**
  - PM Orchestratorバナー表示部分（355行）
  - PM Orchestrator起動推奨メッセージ部分（508行）
  - templates/hooks/ への同期完了（MUST Rule 16）

- **MUST Rule 2違反の認識と修正**
  - 「実装した」≠「動作する」の重要性を再認識
  - 動作確認なしで「完了」報告を禁止
  - echo -e 形式で実際にANSI色が表示されることを確認

### v1.3.78 (2025-01-21)

**色付きサブエージェント表示システムの実装**

- **ANSIカラーコードによるサブエージェント識別**
  - 各サブエージェントに専用カラーコードを割り当て
  - PM Orchestrator: Yellow (`\033[33m`)
  - RuleChecker: Red (`\033[31m`)
  - Implementer: Green (`\033[32m`)
  - Reporter: Blue (`\033[34m`)
  - Designer: Purple (`\033[35m`)
  - QA: Cyan (`\033[36m`)

- **UserPromptSubmit hookへのカラーコード追加**
  - PM Orchestratorバナーを黄色で表示
  - 実行フローの各サブエージェントを色付きで表示
  - サブエージェントカラーコード凡例を追加
  - PM Orchestrator起動推奨メッセージを黄色で強調表示

- **サブエージェント応答テンプレートの拡張**
  - pm-orchestrator.md: 黄色の応答識別子追加
  - rule-checker.md: 赤色の応答識別子追加
  - implementer.md: 緑色の応答識別子追加
  - reporter.md: 青色の応答識別子追加
  - designer.md: 紫色の応答識別子追加
  - qa.md: シアン色の応答識別子更新
  - 各サブエージェントのカラーコード使用方法を明記

- **MUST Rule 16実践: templates/hooks 同期**
  - `.claude/hooks/user-prompt-submit.sh` のカラーコード追加
  - `templates/hooks/user-prompt-submit.sh` への同期完了
  - 新規インストール時も色付き表示が利用可能

- **参考リポジトリを超える品質**
  - 参考: https://github.com/shinpr/ai-coding-project-boilerplate
  - 6サブエージェント全てに統一カラーコード実装
  - UserPromptSubmit hookとサブエージェントの一貫した色付き表示
  - ユーザー体験の向上（視覚的な識別が容易）

### v1.3.77 (2025-01-20)

**MUST Rule 6違反の修正 - 応答テンプレートの完全化**

- **CLAUDE.md応答テンプレートセクションの拡張**
  - PM Orchestrator起動推奨セクションを追加
  - 複雑タスク検出時の推奨メッセージ表示を義務化
  - UserPromptSubmit hookとの連携フローを明記
  - 「口約束で終わらせない」再発防止策を明示（MUST Rule 6実践）

- **問題の本質**
  - v1.3.76では「全ての応答でPM Orchestrator起動」を実装
  - しかし、応答テンプレートに「PM Orchestrator起動推奨表示」が欠けていた
  - 結果：複雑タスク検出時に推奨メッセージを表示せず「口約束」で終わった
  - これはMUST Rule 6違反（重要な指示を即座に文書化しなかった）

- **修正内容**
  - 応答テンプレートに「PM Orchestrator起動推奨」セクションを追加
  - 起動推奨パターン（複数ステップ、複数ファイル、ルールチェック必要等）を明記
  - 推奨メッセージ例を具体的に記載
  - hookとの連携フローを図示
  - 「省略禁止」「口約束禁止」を明示

- **再発防止策**
  - 重要な指示は「その場で即座にCLAUDE.mdに記録」（MUST Rule 6徹底）
  - 応答テンプレートの完全性チェックをPM Orchestratorフローに組み込む
  - システム的強制により「口約束」を防止


### v1.3.76 (2025-01-20)

**PM Orchestrator の実装（Phase 9-6）- 全ての応答でPM Orchestrator起動**

- **LAUNCH_PM=1 を常に設定**
  - ユーザー指示：「パターンではなく全ての応答で PM Orchestrator 起動」
  - パターン検出は参考情報としてPM Orchestratorに渡す
  - PM Orchestratorがタスク分析時に、簡単/複雑を判定して処理

- **実装の意図**
  - 全てのユーザー入力をPM Orchestratorに渡す
  - PM Orchestratorが簡単なタスクはMain AIに戻し、複雑なタスクは処理
  - 「基本全部Orchestratorが処理してください」という指示の実現

### v1.3.75 (2025-01-20)

**PM Orchestrator の実装（Phase 9-5）- Hook出力への起動メッセージ追加**

- **UserPromptSubmit hook 出力の改善**
  - パターン検出時に、CRITICAL Rules直後にPM Orchestrator起動メッセージを表示
  - 検出されたパターン（CodeRabbit Resolve、List Modification、PR Review Response、Complex Implementation、Quality Check）をリスト表示
  - ユーザーに「🎯 PM Orchestrator 起動推奨」と視覚的に通知
  - Main AIに「Task tool で pm-orchestrator を起動してください」と明確に指示

- **hook同期（MUST Rule 16）**
  - `.claude/hooks/user-prompt-submit.sh` と `templates/hooks/user-prompt-submit.sh` を同期
  - 他のプロジェクトにインストールする際にも、同じhook動作が保証される

### v1.3.73 (2025-01-20)
### v1.3.74 (2025-01-20)

**PM Orchestrator の実装（Phase 9-4）- サブエージェント毎の色付きメッセージ表示**

- **サブエージェント識別子の実装**
  - 全7サブエージェントに色付き識別子を追加（絵文字 + 太字 + 説明）
  - 応答の冒頭に必ず表示することで、どのサブエージェントが動作中か明確化
  - PM Orchestrator: 🎯、Requirement Analyzer: 📋、Technical Designer: 🏗️、Work Planner: 📝、Task Decomposer: 🔨、Task Executor: ⚙️、QA: ✅

- **ユーザー体験の向上**
  - サブエージェント毎の動作が視覚的に分かりやすくなった
  - PM Orchestratorシステム全体の透明性が向上
  - どのサブエージェントがどの作業を担当しているか一目で把握可能


**PM Orchestrator の実装（Phase 9-3）- 自動起動機能の実装**

- **UserPromptSubmit hook のパターン検出拡張**
  - Complex Implementation Pattern Detection を追加（新機能、リファクタリング、複数ファイル実装等）
  - Quality Check Pattern Detection を追加（品質チェック、lint/test実行、検証タスク等）
  - PM Orchestrator起動条件を5パターンに拡張（従来3パターン → 5パターン）

- **自動起動の仕組み**
  - hookがパターンを検出すると、Main AIにTask tool起動を指示
  - 検出パターン: CodeRabbit Resolve、List Modification、PR Review Response、Complex Implementation、Quality Check
  - パターン別に具体的な指示を表示（手順、禁止事項、正しい対応）

- **MUST Rule 16実践: .claude/hooks ⟷ templates/hooks 同期**
  - .claude/hooks/user-prompt-submit.sh を拡張
  - templates/hooks/user-prompt-submit.sh も同期
  - 新規インストール時も最新版のhookが使用される

- **MUST Rule 2実践: 動作確認**
  - hook syntax check実行（bash -n）
  - 両方のhookファイルでエラーなしを確認

- **完了した内容**
  - Phase 9-2: JSON出力形式の定義（v1.3.72）
  - Phase 9-3: PM Orchestrator自動起動の実装（このバージョン）
  - PM Orchestratorシステムが実際に動作する状態を実現

### v1.3.72 (2025-01-20)

**PM Orchestrator の実装（Phase 9-2）**

- **統一JSON出力形式の定義**
  - 全6個のサブエージェント（pm-orchestrator、designer、implementer、qa、reporter、rule-checker）に「JSON出力形式」セクションを追加
  - 3層構造の統一フォーマット: `agent` (メタデータ)、`execution` (実行詳細)、`result` (結果)
  - 各エージェントで成功時とエラー時のJSON例を定義
  - エージェント固有の詳細情報は `details` オブジェクトに格納

- **ユーザー要求への対応**
  - 「どのエージェントが、どのレスポンスをしていて、何を担当しているか」を明確化
  - JSON形式での標準化により、エージェント間の出力形式を統一
  - 各エージェントが独自の詳細情報を保持しつつ、全体の一貫性を確保

- **Phase 9-2 完了**
  - pm-orchestrator.md: 統一JSON形式（成功・エラーケース）追加
  - designer.md: 設計結果のJSON形式追加
  - implementer.md: 実装結果のJSON形式追加
  - qa.md: 品質検証結果のJSON形式追加
  - reporter.md: 最終レポートのJSON形式追加
  - rule-checker.md: ルールチェック結果のJSON形式追加

### v1.3.71 (2025-01-20)

**MUST Rule 6 実践: 過去の重要な違反事例の記録**

- **CLAUDE.md に MUST Rule 2 違反事例を追加**
  - 違反内容: PM Orchestrator Phase 8 で設計・ドキュメント化だけで「完了」報告
  - ユーザー指摘: "動作しないといみないのに、そういうところで　おわらせめのも問題行動ですよね?"
  - 根本原因: 「設計・ドキュメント化」を「完了」と誤認識、MUST Rule 2理解不足
  - 影響範囲: PM Orchestratorシステムが実際には動作しない状態
  - 対策: Phase 9として実際の動作統合を実装予定
  - 教訓: 設計・ドキュメント化は手段、実際に動作する状態が唯一の完成品

- **「完了」の定義を明確化**
  - 設計・ドキュメント化 ≠ 完了
  - 実装済み + テスト済み + **実際に動作する** = 完了
  - 「どんどんすすめて」= 動作する状態まで進める

- **再発防止策の策定**
  - TodoListに「実際の動作統合」を明示的に含める
  - MUST Rule 2の強化: 動作確認なしで完了報告は絶対禁止
  - 完了判定基準の4項目を策定

### v1.3.70 (2025-01-20)

**PM Orchestrator の実装（Phase 8）**

- **pm-orchestrator.md に Phase 8 実装定義を追加**
  - サブエージェント起動時の具体的な処理フローを定義
  - ステップ1: タスク分析（種類・複雑度・パターン判定、必要サブエージェント決定）
  - ステップ2: ExecutionLogger 初期化（TaskID生成、ログ記録開始）
  - ステップ3: サブエージェント順次起動（RuleChecker → Designer → Implementer → QA → Reporter）
  - ステップ4: タスク完了とメトリクス更新（ExecutionLogger.completeTask()、MetricsCollector.saveDailySummary()）
  - ステップ5: 最終報告（Reporter出力 + 追加メトリクス情報）

- **ExecutionLogger との統合方法を明確化**
  - Node.js で ExecutionLogger を初期化するコマンド
  - 各サブエージェント実行後に recordSubagent() でログ記録
  - エラー時のリトライ・ロールバック記録（recordRetry()、recordRollback()、recordAutoFix()）
  - TaskID を全ステップで共有する仕組み

- **エラーハンドリングの具体化**
  - RuleChecker 違反時は即座にタスク中止
  - Implementer エラー時はリトライ（最大3回）→ 失敗時はロールバック
  - 全エラーを ExecutionLogger に記録

- **週次トレンド分析の実装**
  - 週次（日曜日）に TrendAnalyzer.analyzeTrends(7) を自動実行
  - 改善提案を console に表示
  - 分析結果を JSON ファイルに保存

- **厳守事項の明確化**
  - 全サブエージェント実行を記録（開始時刻、終了時刻、duration、status、output）
  - エラー時は必ず中止（RuleChecker違反、Implementer失敗時）
  - TaskID を全ステップで使用
  - メトリクス更新を忘れない
  - 透明性を確保（進捗状況をユーザーに報告）

- **PM Orchestrator システム完成（全8フェーズ）**
  - Phase 2-A: PM Orchestrator + 4サブエージェント作成 ✅
  - Phase 2-B: Designer + QA サブエージェント追加 ✅
  - Phase 3: エラーハンドリング・自動修正・ロールバック ✅
  - Phase 4: PM Orchestrator ドキュメント化 ✅
  - Phase 5: 実行ログ・メトリクス収集機能（設計）✅
  - Phase 6: 実行ログ・メトリクス収集機能（実装）✅
  - Phase 7: PM Orchestrator への統合（ドキュメント）✅
  - Phase 8: PM Orchestrator の実装（動作定義）✅

### v1.3.69 (2025-01-20)

**PM Orchestrator への統合（Phase 7）**

- **pm-orchestrator.md に Phase 7 統合ドキュメントを追加**
  - ExecutionLogger の初期化方法
  - サブエージェント実行記録の方法
  - エラーハンドリング（Auto-fix、Retry、Rollback）との連携
  - MetricsCollector による日次サマリー自動更新
  - TrendAnalyzer による週次トレンド分析
  - Reporter サブエージェントでの実行ログ表示

- **統合後の実行フロー文書化**
  - ユーザー入力 → UserPromptSubmit hook → PM Orchestrator 起動
  - ExecutionLogger.startTask() でログ記録開始
  - 各サブエージェント起動時に logger.recordSubagent()
  - Auto-fix/Retry/Rollback 実行時に logger.recordAutoFix/recordRetry/recordRollback()
  - logger.completeTask() でログ保存・Git統計収集
  - MetricsCollector.saveDailySummary() でメトリクス更新
  - Reporter サブエージェントで実行ログ表示

- **Phase 7 の成果**
  - 完全自動化: 全タスクで実行ログが自動記録
  - 透明性: 各サブエージェントの実行時間・結果が可視化
  - 品質向上: メトリクス収集により継続的改善が可能
  - 問題の早期検出: トレンド分析により問題を事前に発見
  - データ駆動: 改善提案がデータに基づいて自動生成

- **PM Orchestrator システム完成**
  - Phase 2-A: PM Orchestrator + 4サブエージェント作成 ✅
  - Phase 2-B: Designer + QA サブエージェント追加 ✅
  - Phase 3: エラーハンドリング・自動修正・ロールバック ✅
  - Phase 4: PM Orchestrator ドキュメント化 ✅
  - Phase 5: 実行ログ・メトリクス収集機能（設計）✅
  - Phase 6: 実行ログ・メトリクス収集機能（実装）✅
  - Phase 7: PM Orchestrator への統合 ✅

### v1.3.68 (2025-01-20)

**実行ログ・メトリクス収集機能の実装（Phase 6）**

- **execution-logger.js モジュール実装**
  - ExecutionLog クラス実装（タスク実行ログ記録）
  - startTask() - タスク開始時のログ作成
  - recordSubagent() - サブエージェント実行記録
  - completeTask() - タスク完了時のログ保存・Git統計収集
  - recordAutoFix() - 自動修正の試行を記録
  - recordRetry() - リトライを記録
  - recordRollback() - ロールバックを記録
  - saveLog() - ログを `.quality-guardian/logs/` に JSON 形式で保存
  - loadRecentLogs() - 最近のログを読み込み

- **metrics-collector.js モジュール実装**
  - MetricsCollector クラス実装（メトリクス集計）
  - generateDailySummary() - 日次サマリー生成
  - generateWeeklySummary() - 週次サマリー生成
  - generateMonthlySummary() - 月次サマリー生成
  - 基本統計: 総タスク数、成功率、エラー率、ロールバック率
  - 平均値: 平均実行時間、平均品質スコア
  - エラー統計: エラー種別、自動修正成功率、リトライ成功率
  - パターン統計: パターン別分布、複雑度分布
  - サブエージェント統計: 使用頻度、平均実行時間

- **trend-analyzer.js モジュール実装**
  - TrendAnalyzer クラス実装（トレンド分析・改善提案）
  - detectErrorRateTrend() - エラー率の傾向を検出
  - findProblematicPatterns() - 問題のあるパターンを検出
  - findSlowSubagents() - 遅いサブエージェントを検出
  - detectAutoFixTrend() - 自動修正成功率の低下を検出
  - generateSuggestions() - データに基づく改善提案を生成
  - analyzeTrends() - 全体的な分析を実行（過去7日間）
  - saveAnalysis() - 分析結果を JSON 形式で保存

- **Phase 6 の成果**
  - 実行ログ記録の完全自動化
  - 品質メトリクスの継続的収集
  - トレンド分析による問題の早期検出
  - データに基づく具体的な改善提案
  - 継続的品質改善のサイクル構築完了

- **次フェーズ予定**
  - Phase 7: PM Orchestrator への統合（ログ記録を全実行フローに組み込む）

### v1.3.67 (2025-01-20)

**実行ログ・メトリクス収集機能の設計（Phase 5）**

- **PM Orchestrator に実行ログ機能の設計を追加**
  - ExecutionLog インターフェース定義（TypeScript）
  - SubagentExecution インターフェース定義
  - タスク開始・サブエージェント実行・タスク完了時のログ記録
  - `.quality-guardian/logs/` ディレクトリにログ保存

- **メトリクス収集機能の設計**
  - DailySummary インターフェース定義
  - 日次サマリー生成（総タスク数、成功率、平均実行時間等）
  - エラー統計（エラー種別、自動修正成功率、リトライ成功率）
  - パターン統計（パターン別分布、複雑度分布）
  - サブエージェント統計（使用頻度、平均実行時間）

- **継続的品質改善の基盤設計**
  - ログ分析による傾向検出
  - 自動改善提案生成
  - 以下の傾向を検出：
    - エラー率上昇
    - 特定パターンでの失敗多発
    - サブエージェント処理遅延
    - 自動修正成功率低下

- **Phase 5 実装手順の文書化**
  1. ExecutionLog インターフェース実装
  2. ログ記録機能実装
  3. メトリクス集計機能実装
  4. 分析・改善提案機能実装
  5. PM Orchestrator への統合

- **Phase 5 の成果**
  - 全タスク実行が記録される基盤
  - 品質メトリクスの継続的収集
  - データに基づく改善提案
  - 「なぜエラーが起きたか」の分析が可能に
  - 継続的品質改善のサイクル構築

- **次フェーズ予定**
  - Phase 6: 実行ログ機能の実装

### v1.3.66 (2025-01-20)

**PM Orchestrator ドキュメント化（Phase 4）**

- **README.md に PM Orchestrator アーキテクチャセクションを追加**
  - Hub-and-Spoke アーキテクチャの図解
  - 6つの専門サブエージェントの詳細説明
  - 3つの実行フローパターン（CodeRabbit Resolve、List Modification、複雑なタスク）
  - エラーハンドリング（Auto-fix、Retry、Rollback）の説明
  - システム的強制の仕組みの詳細
  - 57回のバージョンアップの教訓と解決策

- **ドキュメント構成**
  - アーキテクチャ図（テキストベース）
  - 各サブエージェントの役割（行数、主要機能）
  - 実行フローの具体例（3パターン）
  - エラーハンドリングの3段階（Auto-fix、Retry、Rollback）
  - 段階的ロールバックの説明

- **Phase 4 の成果**
  - ユーザーが PM Orchestrator の動作を理解できる
  - 各サブエージェントの役割が明確
  - 実行フローが可視化された
  - エラー対応の仕組みが明確
  - 「57回の失敗」から「システム的強制」への進化を文書化

- **次フェーズ予定**
  - Phase 5: 完全自動化パイプライン・継続的品質改善

### v1.3.65 (2025-01-20)

**エラーハンドリング・自動修正・ロールバック機能の実装（Phase 3）**

- **Implementer サブエージェントに自動修正機能追加**
  - Lint エラーの自動修正（`npm run lint -- --fix`）
  - 未使用変数・import の自動削除
  - フォーマットエラーの自動修正（Prettier）
  - ネットワークエラーの自動リトライ（最大3回）
  - 一時的なファイルロックエラーのリトライ

- **Implementer サブエージェントにロールバック機能追加**
  - 実装前に自動バックアップ作成（`/tmp/implementer-backup-*`）
  - テスト失敗時、バックアップから自動復元
  - エラー発生時、変更を全てロールバック
  - 3つの対応パターン（自動修正成功、リトライ成功、ロールバック）

- **PM Orchestrator にエラーハンドリング機能追加**
  - サブエージェント失敗の検出と対応
  - 段階的ロールバック（Implementer 失敗時、以降の処理のみ）
  - 全体ロールバック（RuleChecker 失敗時、タスク全体中止）
  - 自動リトライ判断（ネットワークエラー等）
  - ユーザー確認（テスト失敗、MUST Rule 違反等）

- **エラーハンドリングフロー**
  - パターン1: 自動修正成功（Lint エラー → 自動修正 → 成功）
  - パターン2: リトライ成功（ネットワークエラー → リトライ → 成功）
  - パターン3: ロールバック（テスト失敗 → ロールバック → ユーザー報告）

- **Phase 3 の成果**
  - 軽微なエラーは自動修正で解決
  - 一時的なエラーはリトライで解決
  - 重大なエラーはロールバックで安全に復旧
  - エラー発生時も、設計結果は保持して再利用可能
  - ユーザーの手間を最小化

- **次フェーズ予定**
  - Phase 4: 完全自動化パイプライン・継続的品質改善

### v1.3.64 (2025-01-20)

**Designer と QA サブエージェント追加 - AI Control System の完成（Phase 2-B）**

- **6つの専門サブエージェントによる完全な制御システム**
  1. **pm-orchestrator.md**: 中心ハブ、全体管理
  2. **designer.md**: タスク分析・実装計画作成
  3. **rule-checker.md**: MUST Rules 検証
  4. **qa.md**: 品質保証・テスト検証
  5. **implementer.md**: 実装実行
  6. **reporter.md**: ユーザー向けレポート

- **Designer サブエージェント（新規作成）**
  - タスク分析（種類・複雑度・影響範囲）
  - 実装計画作成（具体的な手順）
  - リスク分析（後方互換性・セキュリティ・パフォーマンス）
  - 3つのパターン対応（新機能実装、バグ修正、リファクタリング）

- **QA サブエージェント（新規作成）**
  - 実装結果の検証（機能・テスト・コード品質・ドキュメント）
  - 品質問題の検出（バグ・パフォーマンス・セキュリティ・保守性）
  - 検証項目（ファイル検証、テスト検証、Lint/TypeCheck/Build、Playwright機能確認）
  - 3つの結果パターン（全合格、警告あり、エラーあり）

- **PM Orchestrator の実行パターン（既存、Designer/QA統合済み）**
  - パターン1: CodeRabbit Resolve（RuleChecker → Implementer → Reporter）
  - パターン2: List Modification（RuleChecker → Implementer → QA → Reporter）
  - パターン3: PR Review Response（RuleChecker → Designer → Implementer → QA → Reporter）
  - パターン4: 複雑な実装タスク（Designer → RuleChecker/QA並列 → Implementer → QA → Reporter）

- **Phase 2-B の成果**
  - 全ての役割が分離され、各サブエージェントは3-5個のルールに集中
  - Designer による事前計画で、実装ミスを防止
  - QA による事後検証で、品質問題を検出
  - PM による checkpoints 制御で、ルール違反を物理的にブロック
  - 「57回のやり直し」問題の根本的解決

- **次フェーズ予定**
  - Phase 3: エラーハンドリング・自動修正・ロールバック機能
  - Phase 4: 完全自動化パイプライン・継続的品質改善

### v1.3.63 (2025-01-20)

**PM Orchestrator システムの実装 - AI Control System化の本格化（Phase 2-A）**

- **Hub-and-Spoke アーキテクチャの実装**
  - PM Orchestrator を中心ハブとする制御システム
  - 全サブエージェントは PM を経由してのみ通信
  - 直接通信を禁止し、PM がチェックポイント管理を実施
  - システムレベルでルール違反を物理的にブロック

- **4つの専門サブエージェントを作成**
  1. **pm-orchestrator.md** (250行): タスク分析・サブエージェント起動・チェックポイント管理
  2. **rule-checker.md** (200行): MUST Rules 検証（Rule 1, 4, 7, 14, 16, 17）
  3. **implementer.md** (180行): PM 指示に従った厳密な実装実行
  4. **reporter.md** (150行): ユーザー向けのわかりやすいレポート作成

- **UserPromptSubmit hook に PM 自動起動を追加**
  - 複雑なタスクを検出時、自動的に PM Orchestrator を起動
  - CodeRabbit Resolve、List Modification、PR Review Response パターンに対応
  - Main AI は PM を呼び出すだけ、詳細は PM が管理

- **Phase 2-A の成果**
  - 「気をつけます」から「システム的強制」へ
  - Main AI のメモリー負担を軽減（57+ルールを覚えなくて良い）
  - 各サブエージェントは 3-5個のルールに集中
  - チェックポイント制御により、ルール違反を物理的に防止
  - 「モグラ叩き」問題の根本的解決への道筋

- **次フェーズ予定**
  - Phase 2-B: Designer、QA サブエージェント追加、並列実行対応
  - Phase 3: エラーハンドリング・ロールバック機能
  - Phase 4: 完全自動化パイプライン

### v1.3.62 (2025-01-20)

**UserPromptSubmit hookにインテリジェントパターン検出を追加 - AI Control System化の開始（Phase 1）**

- **方針3「quality-guardianをAI制御システムに」の実装開始**
  - 「モグラ叩き」問題の根本原因: AIの構造的限界を無視していた
  - 「気をつけます」系のルールは無効（76.2%がこのタイプ）
  - ルールを減らし、システム的強制を増やす方針へ転換
  - 57回のバージョンアップ = 57回の失敗を分析

- **インテリジェントパターン検出を3つ追加**
  1. **CodeRabbit Resolve Pattern**: PRレビュー・resolve・コメント関連を検出
  2. **List Modification Pattern**: バージョン更新・複数箇所更新を検出
  3. **PR Review Response Pattern**: PR指摘・全対応を検出

- **パターンごとの具体的指示表示**
  - 「〜しないでください」ではなく「このコマンドを実行してください」
  - 具体的なコマンド例を表示（gh api graphql、grep、TodoWrite等）
  - 禁止事項と正しい対応を明示
  - 関連するMUST Rule・MAY Ruleへの参照リンク

- **Phase 1の成果**
  - AIが「どうすべきか」を迷わなくなる
  - ユーザーが「何回言わせるのか」と言わなくなる
  - システムが proactively にAIを導く
  - 抽象的なルールから具体的な指示へ

### v1.3.61 (2025-01-20)

**PRレビューコメントのResolve義務を追加 - 「何回やっても発生する問題」への再発防止**

- **pr-review-response-guardian.mdに新セクション追加**
  - CodeRabbitコメントのResolve義務（最重要）
  - 修正完了後、即座に自分でgh api graphqlでResolveする
  - ユーザーに「Resolveしてください」と依頼しない
  - 「CodeRabbitができない場合」と説明しない

- **過去の問題パターンを記録**
  - ユーザーが「あなたがやれ」と3回言ってやっと実行
  - 「CodeRabbitが自動でResolveする条件」を長々と説明
  - 「できない場合」の話に逸れる
  - MUST Rule 1違反（ユーザー指示の厳守）を記録

- **再発防止策**
  - 「あなたが確認してresolvedにして」→ 即座にgh api graphql実行
  - 説明不要、実行のみ
  - 逃避心理・責任転嫁を防止

### v1.3.60 (2025-01-20)

**MUST Rules 4, 13, 16, 20のシステム的強制実装**

- **Rule 4: Git操作前の確認**
  - pre-commit hookに重要ブランチへの直接コミット禁止を実装
  - プロジェクト判定機能により、ai-quality-guardianではmainへの直接コミットを許可
  - 他のプロジェクトでは保護ブランチ（main/master/develop/production/staging）への直接コミットをブロック

- **Rule 13: Git操作方法**
  - Rule 4に統合
  - プロジェクトごとの適切なGitワークフローをシステム的に強制

- **Rule 16: テンプレート同期チェック**
  - pre-commit hookでテンプレートファイルと.claude/hooks/の同期を検証
  - quality-guardian/templates/hooks/ と .claude/hooks/ の差分を検出してブロック

- **Rule 20: PR状態確認**
  - post-commit hookを新規作成
  - featureブランチでコミット後、PRが作成されているか確認
  - PRが未作成の場合、作成コマンドを提示

- **実装可能ルールの完全実装チェック**
  - pre-commit hookで analysis-must-rules.md のチェックリストを検証
  - `- [ ]` (未実装) が残っている場合、コミットをブロック
  - 「一部だけ実装して残りは質問」パターンをシステム的に防止

- **強制率の向上**
  - v1.3.59: 1/21ルール (4.8%)
  - v1.3.60: 5/21ルール (23.8%)
  - システム的に強制できないルールは「気をつけます」では無効であることを明確化

### v1.3.26 (2025-01-17)

**Personal Modeの設計ミス修正 - プロジェクトディレクトリ汚染の防止**

- **install.shのPersonalモード実装を修正**
  - `.claude/` とquality-guardian本体を**親ディレクトリ**にインストール（プロジェクトディレクトリの外）
  - プロジェクトディレクトリには**何も作成しない**（quality-guardianスクリプト、.quality-guardian.json、依存関係等）
  - `quality-guardian`スクリプト作成をTeamモードのみに制限
  - 依存関係（glob等）のインストールをTeamモードのみに制限
  - `.quality-guardian.json`作成をTeamモードのみに制限

- **Personalモード汚染チェック・クリーンアップ機能を追加**
  - `check-personal-pollution.sh`: Personalモードで誤って作成されたファイルを検出
  - `cleanup-personal-pollution.sh`: 検出されたファイルを削除（バックアップ付き）
  - 検出対象: `quality-guardian`, `.quality-guardian.json`, `.quality-baseline.json`, `.quality-guardian/`

- **過去の問題の修正**
  - Personalモードでもpackage.jsonに依存関係を追加していた（修正済み）
  - Personalモードでもプロジェクトルートにquality-guardianスクリプトを作成していた（修正済み）
  - Personalモードでも.quality-guardian.jsonを作成していた（修正済み）

**目的:** Personalモードは「個人設定のみ、プロジェクトディレクトリを汚さない」という本来の目的を実現。ユーザーのグローバルCLAUDE.md「MUST Rule 8. Personal Modeでプロジェクトディレクトリを汚さない」に準拠。

### v1.3.25 (2025-01-17)

**MUST Rule 0とproject-context-guardianの強化 - コンテナ名・テスト関連パス・dockerコマンドのパターン追加**

- **MUST Rule 0の検出パターン強化**
  - コンテナ名パターンを追加: `*-devcontainer-*`, `*-container-*`, `eventsystem-*`, `indigo-*`
  - テスト関連パスを追加: `e2e-tests/`, `playwright.config.ts`, `__tests__/`
  - dockerコマンドを追加: `docker compose logs`, `docker compose up/down`
  - ディレクトリパターンを拡充: `apps/frontend/`, `apps/backend/`（既存: `apps/orca/`のみ）

- **project-context-guardianの強化**
  - 同じパターンを検出リストに追加（Layer 2の強化）
  - 過去の問題例3を追加: eventsystemログ検出失敗の事例

- **過去の問題例の追加**
  - eventsystemログ検出失敗（v1.3.25）を文書化
  - 原因: コンテナ名、テスト関連パス、dockerコマンドのパターンが検出リストになかった
  - 根本原因: Layer 2（サブエージェント）はMain AIが反応した後に起動されるため検出が遅れる
  - 対策: MUST Rule 0（Layer 1）にも同じパターンを追加してMain AIが直接参照できるようにした

**目的:** quality-guardian開発者（AI自身）がMUST Rule 0を違反したことを受け、検出パターンを具体的に強化。「他のプロジェクトのログ」をより確実に検出し、AI guardianとしての役割を果たせるようにする。

### v1.2.65 (2025-01-06)

**MUST Rule 13の強化とrule-advisorエージェントの強化**

- **MUST Rule 13にトリガーフレーズ検出機能を追加**
  - 「〜と思います」「おそらく」「〜だろう」「〜かもしれない」を検出
  - 推測フレーズがあれば即座に実装を止めてユーザーに確認
  - 曖昧な指示（「検証」「テスト」「ログ」等）を検出して明確化を促す
  - トリガーフレーズ検出時の対応フローを明確化

- **rule-advisorエージェントの強化**
  - TodoWrite使用時に自動でトリガーフレーズをチェック
  - MUST Rule 19, 20, 22の自動検出機能を追加
  - Git操作の検出と確認メッセージ漏れの警告
  - 過去の合意確認が必要なキーワードの検出
  - 出力フォーマットにトリガーフレーズ検出結果を追加

**目的:** LLMが「〜と思います」と推測したまま実装を開始することを防ぐ。半自動チェックで「気づく」確率を向上させ、ルール違反を事前に検出する仕組みを構築。

### v1.2.64 (2025-01-06)

**MUST Rule 22追加: 過去の合意・仕様の確認義務**

- 実装前に過去の会話で合意した仕様・形式・ルールを確認すること
- 「より良い」と思っても、過去の合意を勝手に変更してはいけない
- ログ形式、出力例等の合意を尊重
- 膨大な時間の損失を防ぐための必須ルール

### v1.2.63 (2025-01-06)

**MUST Rule 21追加: 確認指示の厳守と表示義務**

- 「確認してください」「あっているか見せて」等の確認指示を厳守
- 内容を表示してユーザーの承認を得てから次に進む
- 間違えた後ほど、確認を慎重に行う
- 勝手に修正・作業を開始することを禁止

### v1.2.62 (2025-01-06)

**MUST Rule 20追加: 重要ブランチへの直接変更禁止**

- main・master・develop・production・staging等への直接commit/push禁止
- 必ずfeatureブランチを作成してPR経由でマージ
- 「軽微な変更」「急いでいる」は理由にならない
- 正しいGitワークフローの徹底

### v1.2.61 (2025-01-06)

**MUST Rule 19追加: Git操作後のメッセージ表示と定期コミット義務**

- ブランチ作成・commit・push後に必ず確認メッセージを表示
- 次のステップ（push、PR作成等）を明示
- 作業ごとに定期的にcommitして、いつでも作業を戻れるように
- リバート用コマンドを明示

## ライセンス

MIT License

## 関連ツール

- [Claude Code](https://claude.ai/code) - AIペアプログラミング
- [ai-quality-enforcer](~/dev/ai/scripts/ai-quality-enforcer.sh) - 既存の品質管理スクリプト

---

**Quality Guardian - AIと共に、品質を守る**
