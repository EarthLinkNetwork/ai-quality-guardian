# 06_CORRECTNESS_PROPERTIES.md

# Correctness Properties

本章に定義される Property は、PM Orchestrator Runner の正確性を保証するための必須条件である。
すべての Property は検証可能でなければならず、1 つでも満たされない場合、その実装は仕様違反とみなされる。

Property は Requirements の要約ではない。
Property は Requirements を上位から拘束する実装必須条件であり、Property を満たさない実装は不正である。

各 Property に違反した場合、Runner は COMPLETE を返してはならない。

---

## Property 1 Execution Authority Enforcement

あらゆる実行セッションにおいて、Runner は以下すべての権限を単独で保持しなければならない。

・タスク進行の制御
・完了判定の決定
・セッション検証の決定

Runner 以外が生成した完了判定、進行判断、検証結果はすべて無効とする。
Runner 生成の証跡を欠く成果物は INVALID と判定されなければならない。

---

## Property 2 Project Resolution Validation

指定された、または既定のプロジェクトパスに対して、Runner は必須の .claude 構造および設定ファイルの存在を検証しなければならない。

不足がある場合、Runner は即座に ERROR として停止し、推測や補完を行ってはならない。
検証失敗時に実行が継続された場合、仕様違反とする。

注記:

- CLI はプロジェクトパス解決のみを責務とし、.claude 検証の最終責任は Runner にある。
- REPL は .claude 有無により init-only mode 等へ分岐してよいが、分岐規則は検証可能でなければならない。

---

## Property 3 Configuration Strict Validation

すべての設定入力に対し、Runner は厳格なスキーマ検証を行わなければならない。

未指定の任意項目には明示された既定値のみを使用できる。
破損、欠落、形式不正な設定が検出された場合、Runner は即座に ERROR として停止しなければならない。

設定の推測、補完、部分的許容は一切認められない。

---

## Property 4 Seven-Phase Lifecycle Enforcement

Runner は 7 フェーズのライフサイクルを必ず順序通りに実行しなければならない。

フェーズの省略、順序変更、暗黙的移行はすべて禁止される。
不正なフェーズ遷移が発生した場合、Runner は INVALID と判定しなければならない。

---

## Property 5 Parallel Execution Limits

Runner は同時実行数の上限を常に強制しなければならない。

L1 Subagent は最大 9、L2 Executor は最大 4 とする。
上限超過時はキューイングされなければならず、無制限実行は禁止される。

L1 Subagent に書き込み権限が付与された場合、仕様違反とする。

---

## Property 6 File Lock Management

すべての書き込み操作において、Runner は事前に適切なファイルロックを取得しなければならない。

同一ファイルへの並行書き込みは常に直列化されなければならない。
Executor の失敗時も含め、ロックは必ず解放されなければならない。

---

## Property 7 Evidence Collection Completeness

すべての操作は対応する Evidence を必ず生成しなければならない。

証跡が欠落した操作は NO_EVIDENCE として扱われる。
証跡欠落にもかかわらず COMPLETE と判定された場合、仕様違反とする。

---

## Property 8 Completion Validation Authority

完了判定は Runner のみが行うことができる。

Runner は、Executor の出力を完了根拠として採用してはならない。
完了判定は以下の「Runner 自身の検証可能な事実」によってのみ決定されなければならない。

- 変更ファイルが実ディスク上に存在し、Runner が存在確認できること
- 証跡（Evidence）が 1 論理操作につき 1 件で整合していること
- 仕様上必要な QA/テストが満たされていること（必要な場合）

上記が満たされない場合、Runner は COMPLETE を返してはならない。

---

## Property 9 Fail-Safe Error Handling

不明確な状態、情報欠落、不確実性が存在する場合、Runner は即座に停止しなければならない。

推測による継続、暫定完了、仮成功は一切禁止される。

---

## Property 10 Comprehensive Final Reporting

Runner はすべての実行結果を完全なレポートとして生成しなければならない。

タスク状態、未完理由、証跡一覧、次操作判定を欠いたレポートは不正とする。

---

## Property 11 Test-Driven Development Enforcement

すべての実装は事前に対応するテストの存在が確認されなければならない。

テスト不在または失敗時に実装が行われた場合、仕様違反とする。
単体テストおよびプロパティベーステストの両方が必須である。

---

## Property 12 Semaphore Resource Control

Runner はセマフォにより Executor 資源を制御しなければならない。

制限超過時は待機させ、デッドロック検出時は停止しなければならない。

---

## Property 13 Task Decomposition Authority

タスク分解の最終決定権は Runner のみに属する。

Subagent が自律的にタスクを生成、変更した場合は INVALID とする。
すべての変更は Evidence として記録されなければならない。

---

## Property 14 Task Granularity Enforcement

Runner は設定された粒度制限を必ず強制しなければならない。

分割可能なタスクは分割され、分割不可能で制限超過のタスクは拒否されなければならない。

---

## Property 15 Output Control and Validation

すべての Executor 出力は Runner により検証されなければならない。

- 証跡なき出力は採用禁止
- 推測的表現を含む「完了主張」は採用禁止
- Runner は、必要最小限の構造化結果のみをユーザーへ返すこと
- 生出力の垂れ流しは禁止（必要なら evidence 参照として提示）

検証不能な場合は fail-closed とし、NO_EVIDENCE / ERROR / INVALID のいずれかで停止しなければならない。

---

## Property 16 Explicit Continuation Control

部分完了後の自動継続は禁止される。

明示的承認がない継続、または未完タスク不在での継続は INVALID とする。

---

## Property 17 Numerical Limits Enforcement

すべての数値制限は必ず強制されなければならない。

制限違反後の自動再開は禁止される。

---

## Property 18 Atomic Evidence Recording

各論理操作に対し Evidence は必ず 1 件のみ生成されなければならない。

集約、結合、暗黙的証跡生成は禁止される。

---

## Property 19 Communication Mediation

Executor とユーザー間の直接通信は禁止される。

Runner は、ユーザー入力と Executor 出力の間に必ず介在し、通信を媒介（mediation）しなければならない。

この媒介には以下を必ず含む：

1. Clarification（質問返し）の権限

- 入力が曖昧で検証可能なタスク定義にならない場合、Runner は Executor を呼び出してはならない。
- Runner は 1〜2 行の明確な質問を返し、INCOMPLETE として停止しなければならない。
- 質問文は推測語を含んではならない（例：「どのファイル名/パスですか？」）。

2. Executor Output Gate（出力ゲート）

- Executor が「完了」と主張しても、Runner の検証が通らない限り COMPLETE にしてはならない。
- 検証不能な出力は NO_EVIDENCE / ERROR として扱う。

3. Model Selection Mediation（モデル選択の媒介）

- Runner は「選択されたモデル名」を保持してよいが、課金確認・存在確認・推測補完をしてはならない。
- モデル選択は Runner の core settings を改変してはならない（REPL 専用の保持に限る）。
- モデル変更は Evidence として記録されなければならない。
- 実行時、Runner は保持したモデル名を Executor 呼び出しへ引き渡してよい（引き渡しは検証可能であること）。

---

## Property 20 Hard Limit Enforcement

トークン計測不能時は必ず代理指標による制限を適用しなければならない。

制限不能な場合、Runner は fail-closed で停止しなければならない。

---

## Property 21 Evidence Integrity Management

生証跡の欠落、整合性不一致が検出された場合、該当操作は NO_EVIDENCE とする。

未知形式の証跡は拒否されなければならない。

---

## Property 22 Test Coverage and Quality Assurance

Runner 自身の開発においても本 Property 群は必須である。

テスト未達成、失敗状態でのリリースは禁止される。

---

## Property 23 Provider and Model Configuration Control

Runner は provider および model の設定を厳格に管理しなければならない。

1. Provider Validation

- Runner が認識可能な provider は以下のみとする: `claude-code`, `openai`, `anthropic`
- 不明な provider 名が指定された場合、Runner は即座に ERROR として停止しなければならない
- provider 未設定時は `claude-code` を既定値として使用しなければならない

2. Model Validation

- 選択された provider に対応するモデル一覧の取得は、Runner の責務ではない（外部提供を前提とする）
- Runner は「ユーザーが選択したモデル名」を保持し、Executor へ引き渡すのみ
- モデル名の妥当性検証は Runner の責務ではないが、空文字列・null は拒否しなければならない

3. Fail-Closed Conditions

- provider が不正な場合 → ERROR
- provider が未設定かつ既定値解決に失敗した場合 → ERROR
- model が空文字列または null の場合 → ERROR

4. Evidence Requirement

- provider または model の変更は必ず Evidence として記録されなければならない

参照: spec/05_DATA_MODELS.md (ReplState), spec/10_REPL_UX.md (/provider, /models)

---

## Property 24 API Key Secrecy

Runner は API キーの機密性を常に保証しなければならない。

1. 取得方法の制限

- API キーは環境変数からのみ取得可能とする
- Runner が直接キー値を保存、キャッシュ、ログ出力することは禁止される

2. 表示禁止

- API キー値をユーザーに表示することは禁止される
- 表示可能なのは「SET」または「NOT SET」の状態のみ
- マスク表示（例: `sk-...xxxx`）も禁止される（部分情報も漏洩となる）

3. Evidence / Log への記録禁止

- Evidence に API キー値を含めることは禁止される
- TaskLog に API キー値を含めることは禁止される
- API キー値を含むログエントリは自動的にマスキングされなければならない

4. Fail-Closed Conditions

- 必要な API キーが NOT SET の場合 → Runner は Executor を呼び出してはならない
- API キー値がログ/Evidence に漏洩した場合 → 仕様違反（セキュリティインシデント）

5. 環境変数マッピング

| Provider   | Environment Variable  |
| ---------- | --------------------- |
| openai     | OPENAI_API_KEY        |
| anthropic  | ANTHROPIC_API_KEY     |
| claude-code| (不要 - Claude Code 経由) |

参照: spec/05_DATA_MODELS.md (Sensitive Data Handling), spec/10_REPL_UX.md (/keys)

---

## Property 25 Log Visibility Control

Runner は TaskLog の可視性を厳格に制御しなければならない。

1. Visibility Levels

- `summary`: ユーザー入力と LLM Mediation Layer の出力のみを表示
- `full`: Executor/claude-code の内部動作を含む全情報を表示

2. Default Behavior（見えすぎ防止原則）

- 既定の可視性は `summary` でなければならない
- `full` への切り替えは明示的なユーザー操作（`--full` オプション等）を必要とする
- 暗黙的な `full` 表示への切り替えは禁止される
- **見えすぎ防止原則**: 既定では最小限の情報のみを表示し、詳細は明示的な要求があった場合のみ表示する

3. Sensitive Data Masking（優先度順）

- いかなる可視性レベルでも、以下のパターンは自動マスキングされなければならない:

| Priority | パターン | マスク形式 |
|---|---|---|
| 1 | OpenAI API Key | `[MASKED:OPENAI_KEY]` |
| 1 | Anthropic API Key | `[MASKED:ANTHROPIC_KEY]` |
| 1 | Private Key | `[MASKED:PRIVATE_KEY]` |
| 2 | JWT Token | `[MASKED:JWT]` |
| 2 | Authorization Header | `[MASKED:AUTH_HEADER]` |
| 2 | Cookie | `[MASKED:COOKIE]` |
| 2 | Set-Cookie | `[MASKED:SET_COOKIE]` |
| 3 | JSON Credential | `[MASKED:JSON_CREDENTIAL]` |
| 3 | Environment Credential | `[MASKED:ENV_CREDENTIAL]` |
| 3 | Bearer Token | `[MASKED:BEARER_TOKEN]` |
| 4 | Generic Secret | `[MASKED:GENERIC_SECRET]` |

- 詳細なパターン正規表現は spec/05_DATA_MODELS.md を参照

4. Fail-Closed Conditions

- 不明な可視性レベルが指定された場合 → `summary` として扱う（より制限的な方向へ）
- マスキング処理に失敗した場合 → 該当ログエントリは非表示とする
- マスキングパターンにマッチしたがマスキングに失敗した場合 → ERROR とし停止

5. Evidence Integrity

- 可視性レベルは表示制御のみであり、Evidence の内容を改変してはならない
- マスキングは表示時にのみ適用され、保存された Evidence は元のまま保持される
- ただし、Property 24 に基づき API キー値は Evidence に含めてはならない

6. Thread/Run Hierarchy Support

- `/logs --tree` はThread/Run/Task階層をツリー形式で表示する
- 階層表示においても可視性制御は適用される（summary/full）
- 親子関係（parent_task_id）に基づいてタスクをグループ化して表示する

参照: spec/05_DATA_MODELS.md (TaskLog, VisibilityLevel, Thread, Run), spec/10_REPL_UX.md (/logs), spec/13_LOGGING_AND_OBSERVABILITY.md

---

## Property 26 TaskLog Lifecycle Recording

Runner はすべてのタスクの終端状態において TaskLog を必ず保存しなければならない。

1. Fail-Closed Logging 原則

- タスクが終端状態（`complete`, `incomplete`, `error`）に達した場合、TaskLog の保存は必須である
- TaskLog の保存に失敗した場合、Runner は ERROR として停止しなければならない
- TaskLog が保存されていないタスクの存在は仕様違反とする

2. 必須記録タイミング

- タスク開始時: `status: queued` または `status: running` で記録開始
- タスク終了時: 終端状態（`complete` / `incomplete` / `error`）で必ず保存

3. INCOMPLETE 状態での必須記録

以下の場合、タスクは `incomplete` として TaskLog を保存しなければならない：

- Executor が完了を主張したが、Evidence 検証に失敗した場合
- 期待されるファイルが実ディスク上に存在しない場合
- Evidence が不足している場合
- 検証不能な状態で処理が終了した場合

4. TaskLog 必須フィールド（終端状態時）

- `task_id`: タスク識別子
- `session_id`: セッション識別子
- `status`: `complete` | `incomplete` | `error`
- `started_at`: 開始時刻
- `ended_at`: 終了時刻
- `error_reason`: `incomplete` / `error` の場合は必須
- `artifacts`: 操作対象ファイル一覧
- `events`: ログイベント配列（最低1件）

5. Fail-Closed Conditions

- TaskLog 保存に失敗した場合 → ERROR
- 終端状態に達したが TaskLog が存在しない場合 → 仕様違反
- `incomplete` / `error` 状態で `error_reason` が空の場合 → 仕様違反

参照: spec/05_DATA_MODELS.md (TaskLog, TaskLogStatus), spec/13_LOGGING_AND_OBSERVABILITY.md (Fail-Closed Logging)

---

## Property 27 /tasks-/logs Consistency

Runner は `/tasks` コマンドと `/logs` コマンドの表示内容の整合性を保証しなければならない。

1. 整合性原則

- `/tasks` で表示されるタスクは、必ず `/logs` でも表示されなければならない
- セッション内にタスクが存在する場合、`/logs` は "No tasks logged for this session." を返してはならない

2. 禁止される不整合

以下の状態は仕様違反とする：

- `/tasks` にタスクが存在するのに `/logs` が空を返す
- タスクが終端状態（`complete` / `incomplete` / `error`）に達しているのに TaskLog が存在しない
- `/tasks` の件数と `/logs` の件数が一致しない

3. 同期タイミング

- タスクが作成された時点で TaskLogIndex に登録されなければならない
- タスクが終端状態に達した時点で TaskLog が保存されなければならない
- TaskLogIndex と TaskLog の同期は即時でなければならない

4. Fail-Closed Conditions

- `/tasks` と `/logs` の件数が不一致の場合 → ERROR
- TaskLogIndex への登録に失敗した場合 → ERROR
- 同期に失敗した場合 → Runner は処理を継続してはならない

5. 検証方法

Runner は以下の検証を実行時に行わなければならない：

```
tasks_count = /tasks で表示されるタスク数
logs_count = /logs で表示されるログ数

if tasks_count != logs_count:
    raise ConsistencyError("tasks-logs mismatch")
```

参照: spec/05_DATA_MODELS.md (TaskLogIndex, TaskLogEntry), spec/10_REPL_UX.md (/tasks, /logs)

---

## Property 28 Non-Interactive REPL Output Integrity

非対話モード（stdin script / heredoc / pipe）において、Runner は入力されたコマンドに対する出力の完全性を保証しなければならない。

1. 出力完全性原則

- 各入力コマンドに対して、処理が完全に終了してから出力を生成すること
- 出力は必ず stdout にフラッシュされてから次のコマンド処理に移ること
- 並行処理による出力の混在・欠落は許容されない

2. Sequential Processing Guarantee

非対話モードでは以下の順序を厳守すること：

```
入力コマンド N を受信
  ↓
コマンド N の処理を完了まで await
  ↓
コマンド N の出力を stdout に書き込み
  ↓
stdout のフラッシュ完了を await
  ↓
入力コマンド N+1 を受信
```

3. TaskLog/RawLog の保存保証

- 非対話モードでタスクが終了した場合、TaskLog は必ずファイルに保存されること
- 保存はファイルシステムへの sync を含むこと
- REPL 終了前に全ての保留中のログ書き込みが完了すること

4. Fail-Closed Conditions

以下の状態は仕様違反とする：

- コマンド処理中に次のコマンドの処理が開始される
- 出力がフラッシュされる前に次のコマンドが処理される
- EOF 到達時に保留中のログ書き込みが残っている
- TaskLog が保存される前に REPL が終了する

5. 検証方法

```
入力: ["/start", "readmeを作って", "/tasks", "/logs"]

期待される出力順序:
  1. /start の出力（セッション情報）
  2. "readmeを作って" の出力（タスク実行結果）
  3. /tasks の出力（タスク一覧）
  4. /logs の出力（ログ一覧）

検証:
  - 出力 1-4 が全て stdout に出現すること
  - 出力の順序が入力の順序と一致すること
  - 出力間に欠落がないこと
```

参照: spec/10_REPL_UX.md (Non-Interactive Mode), spec/13_LOGGING_AND_OBSERVABILITY.md (Non-Interactive Mode Logging Guarantees)

---

## Property 29 Deterministic Exit Code in Non-Interactive Mode

非対話モードにおいて、Runner は終了コードを決定論的に設定しなければならない。

1. 終了コード定義

| Exit Code | 条件                                                       |
| --------- | ---------------------------------------------------------- |
| 0         | 全てのコマンドが正常完了（タスクが COMPLETE）               |
| 1         | エラー発生（構文エラー、設定エラー、タスクが ERROR）        |
| 2         | 未完了（タスクが INCOMPLETE、または明示的な中断）          |

2. 終了コード決定規則

```
全タスクの状態を集計:
  - 1つでも ERROR がある → exit code 1
  - ERROR がなく、1つでも INCOMPLETE がある → exit code 2
  - 全て COMPLETE → exit code 0
```

3. 優先順位

複数の状態が混在する場合：

```
ERROR > INCOMPLETE > COMPLETE

例:
  task-001: COMPLETE
  task-002: ERROR
  task-003: INCOMPLETE

  → exit code 1 (ERROR が優先)
```

4. タスク未実行時

- セッション開始のみで終了した場合 → exit code 0
- コマンドエラー（未知コマンド等）で即座に終了した場合 → exit code 1

5. Fail-Closed Conditions

以下の状態は仕様違反とする：

- 終了コードが設定されずに終了する
- 終了コードが上記の定義と異なる
- 同一入力に対して異なる終了コードが返る（非決定論的）

6. 検証方法

```
テストケース 1: 全て COMPLETE
  入力: /start, "readmeを作って", /exit
  タスク状態: COMPLETE
  期待: exit code 0

テストケース 2: ERROR 発生
  入力: /start, "存在しないコマンドを実行", /exit
  タスク状態: ERROR
  期待: exit code 1

テストケース 3: INCOMPLETE
  入力: /start, "途中で中断されるタスク", /exit
  タスク状態: INCOMPLETE
  期待: exit code 2
```

参照: spec/10_REPL_UX.md (Non-Interactive Mode, Exit Code)

---

## Property 30 Task ID Cross-Reference Display

Runner は `/tasks` と `/logs` コマンドにおいて、両方のタスク ID を表示し、ユーザーがタスクを追跡可能にしなければならない。

1. 2 種類のタスク ID

- **External Task ID**: RunnerCore が生成するタスク識別子（例: `task-1768282936521`）
- **Internal Log Task ID**: TaskLogManager が生成するログ識別子（例: `task-001`）

2. 表示要件

- `/tasks` コマンド: External Task ID を主表示とし、対応する Log ID を `[log: task-NNN]` 形式で付記
- `/logs` コマンド: Log ID と External Task ID の両方を表示

3. ID マッピング

- TaskLogManager は External Task ID を受け取り、index.json に `external_task_id` として保存
- External ID と Log ID は 1:1 対応でなければならない
- マッピングの重複は仕様違反

4. 検索可能性

- `/logs <id>` コマンドは External ID と Log ID の両方で検索可能であること
- どちらの ID で指定しても同一のログ詳細を表示すること

5. Fail-Closed Conditions

- External Task ID が TaskLogEntry に記録されていない場合 → ERROR
- 同一 External ID が複数の Log ID にマッピングされている場合 → ERROR
- ID マッピングに失敗した場合 → タスク登録を ERROR として停止

参照: spec/05_DATA_MODELS.md (TaskLogEntry), spec/10_REPL_UX.md (Task ID 相互参照表示), spec/13_LOGGING_AND_OBSERVABILITY.md (Section 2.7)

---

## Property 31 Verified Files Detection

Runner はタスク完了判定において、Executor が主張する変更ファイルを実ディスク上で検証しなければならない。

1. 検証対象（Verified Files）

Runner は以下の方法で変更ファイルを検出する:

- **Diff Detection**: タスク実行前後のファイル一覧を比較し、新規作成・更新されたファイルを検出
- **Disk Verification**: 検出されたファイルが実ディスク上に存在するか `fs.existsSync()` で検証

2. ファイルスキャン対象

| 対象 | 説明 |
|------|------|
| プロジェクトルート | `projectPath` 直下のファイル |
| サブディレクトリ | 再帰的にスキャン（深さ制限あり） |

3. スキャン除外対象

| 除外パターン | 説明 |
|--------------|------|
| `.*` | ドットで始まるファイル/ディレクトリ |
| `node_modules` | npm パッケージディレクトリ |

4. 検証結果

```typescript
interface VerifiedFile {
  path: string;        // ファイルパス
  exists: boolean;     // 実ディスク上の存在確認結果
  detected_at: string; // 検出時刻
}
```

5. ステータス決定規則

```
verified_files.some(vf => vf.exists === true) → COMPLETE 候補
verified_files.length === 0 または全て exists === false → NO_EVIDENCE
```

6. files_modified_count 計算

```
files_modified_count = verified_files.filter(vf => vf.exists).length
```

7. Fail-Closed 原則（重要）

- Executor が「ファイルを作成した」と主張しても、Runner の検証で存在が確認できなければ COMPLETE としない
- Property 8（Completion Validation Authority）と組み合わせて、Runner のディスク検証を最終権限とする

8. 既知の問題と対策

| 問題 | 原因 | 対策 |
|------|------|------|
| projectPath 不一致 | Executor が異なるディレクトリで作業 | Executor に projectPath を明示的に渡す |
| タイミング問題 | ファイルシステム同期の遅延 | sync 後にスキャン実行 |
| 除外パターン過剰 | `.` で始まるファイルが対象外 | `.claude/` 以外の dotfile は対象化を検討 |

参照: spec/05_DATA_MODELS.md (VerifiedFile), spec/13_LOGGING_AND_OBSERVABILITY.md (Section 2.7)

---

## Property 32 Non-Volatile Project Root

Runner は `--project-mode fixed` オプション使用時、プロジェクトルートが揮発しないことを保証しなければならない。

1. 揮発性問題の定義

- `/var/folders/...` などのテンポラリディレクトリは OS によって自動削除される可能性がある
- プロセス終了後に DEMO_DIR が消失すると、後続プロセスでの検証が不可能になる
- これは「偽陰性」（実際には成功したが検証できない）の原因となる

2. Fixed Mode の保証

- `--project-mode fixed` + `--project-root <path>` 指定時:
  - 指定されたパスは Runner 自身による削除対象外
  - ディレクトリは Runner 起動時に存在確認のみ行い、自動作成しない
  - ディレクトリが存在しない場合は即座に ERROR
  - タスク実行後もディレクトリは保持される

3. Temp Mode（デフォルト）の挙動

- `--project-mode temp`（または未指定）時:
  - OS 標準のテンポラリディレクトリを使用
  - Runner はディレクトリの永続性を保証しない
  - 後続プロセスでの検証には不向きであることをユーザーに明示

4. --print-project-path 出力保証

- 解決された projectPath を `PROJECT_PATH=<path>` 形式で出力
- 出力は REPL 初期化直後、他の出力より前に行う
- 後続プロセスがこの値を使用して同じディレクトリにアクセス可能

5. Fail-Closed Conditions

以下の状態は仕様違反とする：

- fixed モードで `--project-root` が指定されていない
- 指定された `--project-root` が存在しない
- fixed モードでテンポラリディレクトリが使用される
- `--print-project-path` 指定時に PROJECT_PATH= 出力がない

6. 検証方法

```bash
# テストケース: fixed モードでの後続プロセス検証
DEMO_DIR=/tmp/test-fixed-$$
mkdir -p "$DEMO_DIR"

# Process 1: タスク実行
pm-orchestrator repl --project-mode fixed --project-root "$DEMO_DIR" --non-interactive <<'EOF'
/start
README.mdを作成
/exit
EOF

# Process 2: 後続検証（DEMO_DIR が存在し、ファイルが残っていること）
ls "$DEMO_DIR/README.md"  # 期待: ファイルが存在
```

参照: spec/10_REPL_UX.md (プロジェクトモード), spec/05_DATA_MODELS.md (ReplConfig)

---

## Property 33 Verified Files Traceability

Runner は TaskLog において、検証済みファイルの追跡情報を完全に記録しなければならない。

1. 追跡情報の定義

TaskLog は以下のフィールドを必須で含む：

```typescript
interface TaskLogVerificationInfo {
  verification_root: string;    // 検証実行時のプロジェクトルート（絶対パス）
  verified_files: VerifiedFile[]; // 検証済みファイル一覧
}

interface VerifiedFile {
  path: string;                 // ファイルパス（verification_root からの相対パス）
  exists: boolean;              // 検証時点での存在確認結果
  detected_at: string;          // 検出時刻（ISO 8601 形式）
  detection_method: 'diff' | 'executor_claim'; // 検出方法
}
```

2. verification_root の要件

- 絶対パスで記録すること
- タスク実行時に使用された実際のプロジェクトルートであること
- fixed モード時は `--project-root` で指定されたパスと一致すること
- temp モード時は実際に使用されたテンポラリパスであること

3. verified_files の要件

- タスク完了時に Runner が検証した全ファイルを記録
- 各ファイルの `path` は `verification_root` からの相対パスで記録
- 後続プロセスが `verification_root + path` で同じファイルにアクセス可能であること
- `detection_method` により、検出経緯を追跡可能にすること

4. 後続プロセスでの検証サポート

```typescript
// 後続プロセスでの検証例
const taskLog = JSON.parse(fs.readFileSync('session/logs/task-001.json'));
for (const vf of taskLog.verified_files) {
  const fullPath = path.join(taskLog.verification_root, vf.path);
  const stillExists = fs.existsSync(fullPath);
  console.log(`${vf.path}: was ${vf.exists}, now ${stillExists}`);
}
```

5. Fail-Closed Conditions

以下の状態は仕様違反とする：

- TaskLog に `verification_root` が欠落
- TaskLog に `verified_files` が欠落
- `verified_files` の `path` が絶対パス（相対パスであるべき）
- `verification_root` が相対パス（絶対パスであるべき）
- `detection_method` が `'diff'` または `'executor_claim'` 以外

6. Property 31 との関係

- Property 31（Verified Files Detection）は「検証の実行」を規定
- Property 33（Verified Files Traceability）は「検証結果の記録と追跡」を規定
- 両方を満たすことで、後続プロセスでの検証再現が可能になる

7. 検証方法

```bash
# テストケース: TaskLog から検証情報を抽出
DEMO_DIR=/tmp/test-trace-$$
mkdir -p "$DEMO_DIR"

pm-orchestrator repl --project-mode fixed --project-root "$DEMO_DIR" --non-interactive <<'EOF'
/start
README.mdを作成
/exit
EOF

# TaskLog から verification_root と verified_files を抽出
TASK_LOG=$(ls "$DEMO_DIR/.pm-orchestrator/session/logs/task-*.json" | head -1)
jq '.verification_root' "$TASK_LOG"       # 期待: "$DEMO_DIR" と一致
jq '.verified_files[].path' "$TASK_LOG"   # 期待: "README.md" を含む
jq '.verified_files[].exists' "$TASK_LOG" # 期待: true
```

参照: spec/05_DATA_MODELS.md (TaskLog, VerifiedFile), spec/10_REPL_UX.md (非対話モード), spec/13_LOGGING_AND_OBSERVABILITY.md (Section 2.7)

---

## Property 34 Executor stdin Blocking in Non-Interactive Mode

非対話モードにおいて、Runner は Executor が stdin を要求することを防止しなければならない。

1. stdin 遮断原則

- 非対話モードで Executor を spawn する際、stdin は `'ignore'` または即座に close する `'pipe'` で設定すること
- Executor が stdin からの入力を待機することは禁止される
- stdin ブロックを検出した場合、Runner は即座に Executor を終了させること

2. stdio 設定要件

```typescript
// 非対話モードでの Executor spawn 設定
const child = spawn(command, args, {
  stdio: ['ignore', 'pipe', 'pipe'],  // stdin: ignore
  // または
  stdio: ['pipe', 'pipe', 'pipe'],    // stdin: pipe → 即座に close
});

// stdin を pipe で開いた場合は即座に close
if (child.stdin) {
  child.stdin.end();
}
```

3. 対話待ちプロンプト検出

Runner は以下のパターンを Executor の stdout/stderr から検出し、即座にブロック状態と判定すること：

| パターン | 例 |
|----------|-----|
| `? ` で始まる行 | `? Select an option` (inquirer) |
| `Enter ` で始まる行 | `Enter your choice:` |
| `Press ` で始まる行 | `Press any key to continue` |
| `[Y/n]`, `[y/N]` を含む | `Continue? [Y/n]` |
| `(yes/no)` を含む | `Proceed? (yes/no)` |

4. ブロック検出時の動作

```
Executor stdout/stderr から対話待ちパターンを検出
  ↓
即座に SIGTERM を送信（graceful shutdown 試行）
  ↓
3秒後も終了しない場合は SIGKILL を送信
  ↓
TaskLog に executor_blocked: true, blocked_reason: 'INTERACTIVE_PROMPT' を記録
  ↓
タスクを ERROR 状態で終了
```

5. Fail-Closed Conditions

以下の状態は仕様違反とする：

- 非対話モードで Executor が stdin 入力を待機している
- 対話待ちプロンプトを検出したが Executor を終了させていない
- ブロック状態が TaskLog に記録されていない

参照: spec/10_REPL_UX.md (Executor 入出力規約), spec/13_LOGGING_AND_OBSERVABILITY.md (Executor Blocking Detection)

---

## Property 35 Task Terminal State Guarantee in Non-Interactive Mode

非対話モードにおいて、Runner は全てのタスクが必ず終端状態に到達することを保証しなければならない。

1. 終端状態の定義

タスクは以下のいずれかの状態で終了しなければならない：

| 状態 | 説明 |
|------|------|
| `complete` | 正常完了（Evidence 検証済み） |
| `incomplete` | 不完全（Evidence 不足または検証失敗） |
| `error` | エラー（ブロック検出、タイムアウト、例外等） |

2. タイムアウト保証

非対話モードでは以下のタイムアウトを適用すること：

| タイムアウト | デフォルト値 | 説明 |
|--------------|--------------|------|
| `executor_timeout_ms` | 60000 (60秒) | Executor 実行の最大許容時間 |
| `progress_timeout_ms` | 30000 (30秒) | stdout/stderr 出力なし状態の最大許容時間 |

3. タイムアウト発動時の動作

```
タイムアウト条件を満たす
  ↓
SIGTERM を送信（graceful shutdown 試行）
  ↓
3秒後も終了しない場合は SIGKILL を送信
  ↓
TaskLog に executor_blocked: true, blocked_reason: 'TIMEOUT', timeout_ms を記録
  ↓
タスクを ERROR 状態で終了
```

4. 無限ループ防止

- Executor が無限ループに陥っても、タイムアウトにより必ず終了させること
- stdout/stderr への出力がある場合でも、executor_timeout_ms で打ち切ること

5. Fail-Closed Conditions

以下の状態は仕様違反とする：

- タスクが終端状態（complete/incomplete/error）に到達せず REPL が終了する
- タイムアウト時間を超えても Executor が実行中である
- タイムアウト発動が TaskLog に記録されていない

6. 検証方法

```bash
# テストケース: タイムアウト検証
pm-orchestrator repl --non-interactive <<'EOF'
/start
無限ループするコードを書いて
/exit
EOF

# 期待: 60秒後にタイムアウトで終了
# TaskLog: executor_blocked: true, blocked_reason: 'TIMEOUT'
# Exit Code: 1 (ERROR)
```

参照: spec/10_REPL_UX.md (Executor タイムアウト), spec/13_LOGGING_AND_OBSERVABILITY.md (Section 2.6.1)

---

## Property 36 Subsequent Command Processing Guarantee in Non-Interactive Mode

非対話モードにおいて、Runner は Executor がブロックした場合でも、後続コマンド（`/tasks`, `/logs`, `/exit` 等）を必ず処理しなければならない。

1. 後続コマンド処理保証

Executor ブロック検出後、以下のコマンドは必ず処理されること：

| コマンド | 処理内容 |
|----------|----------|
| `/tasks` | タスク一覧の表示（ブロックしたタスクを含む） |
| `/logs` | ログ一覧の表示（ブロック情報を含む） |
| `/exit` | REPL の正常終了（終了コード設定を含む） |
| `/status` | 現在のセッション状態表示 |

2. Fail-Closed 後の状態遷移

```
Executor ブロック検出
  ↓
Executor を強制終了（SIGTERM → SIGKILL）
  ↓
タスクを ERROR 状態で終了
  ↓
TaskLog を保存
  ↓
REPL は入力待ち状態に復帰（後続コマンド処理可能）
  ↓
後続コマンドを順次処理
```

3. 処理順序保証

非対話モードでは入力順序に従って処理すること（Property 28 Sequential Processing Guarantee）：

```
入力: ["タスク指示", "/tasks", "/logs", "/exit"]

処理順序:
1. タスク指示 → Executor 実行 → ブロック検出 → ERROR 終了
2. /tasks → タスク一覧表示（ブロックしたタスク含む）
3. /logs → ログ一覧表示（ブロック情報含む）
4. /exit → REPL 終了
```

4. stdout 出力保証

- ブロックしたタスクの情報も `/tasks` 出力に含めること
- ブロック情報（blocked_reason, timeout_ms 等）も `/logs` 出力に含めること
- 全ての出力は stdout にフラッシュされてから次のコマンドへ移ること

5. Fail-Closed Conditions

以下の状態は仕様違反とする：

- Executor ブロック後に `/tasks` が実行されない
- Executor ブロック後に `/logs` が実行されない
- Executor ブロック後に `/exit` が実行されず REPL がハングする
- ブロック情報が `/logs` 出力に含まれていない

6. 検証方法

```bash
# テストケース: ブロック後の後続コマンド処理
pm-orchestrator repl --non-interactive <<'EOF'
/start
対話入力を要求するコードを書いて
/tasks
/logs
/exit
EOF

# 期待される出力:
# 1. タスク実行開始
# 2. ブロック検出メッセージ
# 3. /tasks 出力（ブロックしたタスクを表示）
# 4. /logs 出力（ブロック情報を表示）
# 5. 正常終了
# Exit Code: 1 (ERROR)

# 禁止される動作:
# - /tasks, /logs, /exit が実行されずにハング
# - ブロック情報が出力に含まれない
```

参照: spec/10_REPL_UX.md (Fail-Closed 保証), spec/13_LOGGING_AND_OBSERVABILITY.md (Executor Blocking Detection)

---

## Property 37 Deterministic Integration Testing

Runner の統合テストは外部 Claude Code CLI に依存せず、決定論的に動作しなければならない。

1. 外部依存排除原則

- 統合テストは外部 Claude Code CLI の可用性に依存してはならない
- 統合テストはネットワーク遅延やタイムアウトによる不安定性を排除すること
- CI 環境での安定した実行を保証すること

2. FakeExecutor による決定論的テスト

統合テストでは `IExecutor` インターフェースを実装した FakeExecutor を使用すること：

```typescript
interface IExecutor {
  execute(task: ExecutorTask): Promise<ExecutorResult>;
  isClaudeCodeAvailable(): Promise<boolean>;
}
```

3. FakeExecutor の種類

| 種類 | 用途 | 動作 |
|------|------|------|
| SuccessFake | 正常系テスト | 即座に COMPLETE を返す |
| BlockedFake | Fail-Closed テスト | executor_blocked: true を返す |
| ErrorFake | エラー系テスト | status: 'ERROR' を返す |

4. DI による Executor 差し替え

RunnerCore / REPLInterface は ExecutorFactory を受け取り、テスト時に FakeExecutor を注入：

```typescript
interface ExecutorFactory {
  create(config: ExecutorConfig): IExecutor;
}

// 本番
const runner = new RunnerCore({ executorFactory: { create: (c) => new ClaudeCodeExecutor(c) } });

// テスト
const runner = new RunnerCore({ executorFactory: { create: () => new SuccessFakeExecutor() } });
```

5. テスト分類

| テスト種類 | Executor | CI 対象 |
|------------|----------|---------|
| Unit Test | FakeExecutor | Yes |
| Integration Test | FakeExecutor | Yes |
| E2E Test (Manual) | Real Executor | No |

6. Fail-Closed Conditions

以下の状態は仕様違反とする：

- 統合テストが外部 Claude Code CLI に依存している
- 統合テストがタイムアウトにより不安定である
- CI で FakeExecutor を使用せずに Real Executor を使用している

7. 検証方法

```typescript
// テストケース: FakeExecutor による決定論的テスト
describe('Integration Test', () => {
  it('should complete task with FakeExecutor', async () => {
    const fakeExecutor = new SuccessFakeExecutor();
    const runner = new RunnerCore({
      executorFactory: { create: () => fakeExecutor }
    });

    const result = await runner.executeTask('create README.md');

    expect(result.status).toBe('COMPLETE');
    // タイムアウトなし、決定論的に動作
  });
});
```

参照: spec/10_REPL_UX.md (統合テスト要件), spec/08_TESTING_STRATEGY.md

---

## Property 38 Current Task ID Clearing on Terminal State

Runner は ReplState の `current_task_id` をタスク終端状態到達時に必ず null にクリアしなければならない。

1. 終端状態の定義

タスクが以下のいずれかの状態に達した場合、終端状態とみなす：

| 状態 | 説明 |
|------|------|
| `complete` | 正常完了 |
| `incomplete` | 不完全（NO_EVIDENCE 含む） |
| `error` | エラー発生 |

2. 状態遷移規則

```
タスク開始時:
  current_task_id = <新タスクID>
  last_task_id = 変更なし

タスク終端状態到達時:
  last_task_id = current_task_id   // 先に保存
  current_task_id = null           // その後クリア
```

3. 制約条件

- `current_task_id` が非 null の場合、対応タスクは running 状態でなければならない
- `last_task_id` が非 null の場合、対応タスクは終端状態（complete/incomplete/error）でなければならない
- タスク終端状態で `current_task_id` が非 null のまま残っている場合は仕様違反

4. ReplState 永続化タイミング

- `current_task_id` / `last_task_id` の変更は即座に `.claude/repl.json` に永続化すること
- クラッシュリカバリ時に不整合が発生しないよう、状態遷移は原子的に記録すること

5. Fail-Closed Conditions

以下の状態は仕様違反とする：

- タスク終端状態到達後も `current_task_id` が null にならない
- `current_task_id` と `last_task_id` が同時に同じタスク ID を指している
- 終端状態のタスクが `current_task_id` に設定されている

6. 検証方法

```typescript
// テストケース: 終端状態でのクリア検証
describe('current_task_id clearing', () => {
  it('should clear current_task_id on COMPLETE', async () => {
    // タスク実行開始
    expect(replState.current_task_id).toBe('task-001');

    // タスク完了
    await taskComplete('task-001', 'complete');

    // current_task_id がクリアされている
    expect(replState.current_task_id).toBeNull();
    expect(replState.last_task_id).toBe('task-001');
  });

  it('should clear current_task_id on ERROR', async () => {
    expect(replState.current_task_id).toBe('task-002');

    await taskComplete('task-002', 'error');

    expect(replState.current_task_id).toBeNull();
    expect(replState.last_task_id).toBe('task-002');
  });
});
```

参照: spec/05_DATA_MODELS.md (ReplState, current_task_id, last_task_id), spec/10_REPL_UX.md

---

## Property 39 Immediate Summary Output on Terminal State

Runner はタスク終端状態到達時に、即時サマリブロックを必ず出力しなければならない。

1. 出力タイミング

- タスクが終端状態（complete/incomplete/error）に到達した直後
- 次のプロンプト表示前
- `/tasks` コマンドの実行を待たずに即時出力

2. 出力フォーマット（必須）

```
=== TASK SUMMARY ===
[RESULT]  <status>
[TASK]    <task_id>
[NEXT]    <next_action_hint>
[WHY]     <reason>
[HINT]    <user_guidance>
====================
```

3. 各フィールドの要件

| フィールド | 必須 | 説明 |
|------------|------|------|
| RESULT | Yes | `COMPLETE` / `INCOMPLETE` / `ERROR` のいずれか |
| TASK | Yes | タスク ID（External Task ID 形式） |
| NEXT | Yes | ユーザーが次に取るべきアクションの提案 |
| WHY | Yes | 終端状態に至った理由（1行、50文字以内推奨） |
| HINT | Yes | 問題解決のためのヒント（ERROR/INCOMPLETE 時に特に重要） |

4. 状態別の出力例

**COMPLETE:**
```
=== TASK SUMMARY ===
[RESULT]  COMPLETE
[TASK]    task-1768282936521
[NEXT]    続けてタスクを入力
[WHY]     README.md を作成しました (1 files modified)
[HINT]    /logs task-1768282936521 で実行ログを確認できます
====================
```

**INCOMPLETE (NO_EVIDENCE):**
```
=== TASK SUMMARY ===
[RESULT]  INCOMPLETE
[TASK]    task-1768319005471
[NEXT]    /logs task-1768319005471 で詳細確認
[WHY]     ファイル作成は実行されましたが、ディスク上で検証できませんでした
[HINT]    ファイルパスを明示して再試行してください
====================
```

**ERROR:**
```
=== TASK SUMMARY ===
[RESULT]  ERROR
[TASK]    task-1768350000000
[NEXT]    /logs task-1768350000000 --full でエラー詳細確認
[WHY]     Executor がタイムアウトしました
[HINT]    タスクをより具体的に記述するか、--executor-timeout を延長してください
====================
```

5. 実装要件

- 共通関数 `printImmediateSummary(taskId, status, reason, hint)` として実装
- Property 38 と連携し、サマリ出力時に `current_task_id` をクリア
- 非対話モードでも対話モードでも同一のサマリ形式を出力

6. Fail-Closed Conditions

以下の状態は仕様違反とする：

- 終端状態到達後にサマリが出力されない
- サマリの必須フィールドが欠落している
- WHY フィールドに推測的表現（「おそらく」「かもしれない」）を含む
- RESULT が `COMPLETE` / `INCOMPLETE` / `ERROR` 以外

7. `/tasks` コマンドとの関係

- 即時サマリは `/tasks` コマンドを代替するものではない
- `/tasks` は全タスク一覧を表示、即時サマリは単一タスクの結果を即時表示
- 両者は補完関係にあり、どちらも実装必須

8. 検証方法

```bash
# テストケース: COMPLETE 時のサマリ出力
pm-orchestrator repl --non-interactive <<'EOF'
/start
README.mdを作成してください
/exit
EOF

# 期待される出力に以下を含む:
# === TASK SUMMARY ===
# [RESULT]  COMPLETE
# [TASK]    task-xxx
# [NEXT]    ...
# [WHY]     ...
# [HINT]    ...
# ====================
```

参照: spec/10_REPL_UX.md (即時サマリ出力), spec/05_DATA_MODELS.md (TaskLogStatus)

---

## Property 40 Test Executor Production Safety

Runner はテスト用 Executor（recovery-stub 等）が本番環境で有効化されることを絶対に許容してはならない。

1. 環境検出

本番環境は以下の条件で判定する：

```
NODE_ENV === 'production'
```

2. テスト用 Executor の定義

テスト用 Executor とは、E2E テストやリカバリテスト専用に設計された Executor であり、以下の環境変数で有効化される：

| 環境変数 | 値 | 用途 |
|----------|-----|------|
| `PM_EXECUTOR_MODE` | `recovery-stub` | リカバリシナリオテスト用 |

3. 本番安全ガード（必須）

```
if (NODE_ENV === 'production' && PM_EXECUTOR_MODE === 'recovery-stub'):
    即座に process.exit(1) で終了
    stderr に "[FATAL] recovery-stub is forbidden in production" を出力
```

4. 警告出力（必須）

テスト用 Executor が有効化された場合、以下の警告を stdout に出力すること：

```
WARNING: recovery-stub enabled (test-only)
```

5. Evidence マーカー（必須）

テスト用 Executor による実行結果には以下のマーカーを含めること：

```
mode=recovery-stub
```

6. Fail-Closed Conditions

以下の状態は仕様違反とする：

- 本番環境でテスト用 Executor が有効化される
- 本番環境で `PM_EXECUTOR_MODE=recovery-stub` が黙認される
- テスト用 Executor 有効化時に警告が出力されない
- Evidence に `mode=recovery-stub` マーカーが含まれない

7. 検証方法

```bash
# テストケース: 本番環境での拒否検証
NODE_ENV=production PM_EXECUTOR_MODE=recovery-stub node dist/cli/index.js repl
# 期待: exit code 1, stderr に FATAL メッセージ

# テストケース: 非本番環境での警告出力
PM_EXECUTOR_MODE=recovery-stub PM_RECOVERY_SCENARIO=blocked node dist/cli/index.js repl
# 期待: stdout に "WARNING: recovery-stub enabled (test-only)"
# 期待: stdout に "mode=recovery-stub"
```

参照: src/executor/recovery-executor.ts, scripts/e2e-recovery.ts
