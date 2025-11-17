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