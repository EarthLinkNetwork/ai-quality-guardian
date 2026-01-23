# Template Auto-Injection and Project Settings Persistence 実機証跡

## 概要

このドキュメントは pm-orchestrator-runner の Template Auto-Injection 機能と
Project Settings Persistence 機能の動作証跡を記録します。

- **作成日**: 2026-01-23
- **仕様参照**:
  - `spec/32_TEMPLATE_INJECTION.md` (Template Auto-Injection)
  - `spec/33_PROJECT_SETTINGS_PERSISTENCE.md` (Project Settings Persistence)
- **テスト実行環境**: Node.js + Mocha

## 機能概要

### Template Auto-Injection とは

プロンプトテンプレートをユーザーが定義・選択し、Runner が実行時に自動注入する機能:

1. **Built-in Templates**: Minimal / Standard / Strict / Goal_Drift_Guard の4種類のプリセット
2. **Custom Templates**: ユーザー定義のカスタムテンプレート
3. **Injection Points**: Global Prelude 後と Output Epilogue 前への自動注入

### Project Settings Persistence とは

プロジェクト単位で設定（テンプレート選択、LLM設定等）を永続化する機能:

1. **Per-Project Storage**: プロジェクトパスのハッシュをキーに保存
2. **Auto-Restore**: 起動時に前回の設定を自動復元
3. **Event System**: 設定変更時のイベント通知

## テスト結果サマリー

### TemplateStore Tests

```
TemplateStore (spec/32_TEMPLATE_INJECTION.md)
  Initialization (Section 3)
    ✔ should create storage directory if not exists
    ✔ should initialize with empty custom templates
    ✔ should create index.json on first initialize
  Built-in Templates (Section 3.2)
    ✔ should provide Minimal template
    ✔ should provide Standard template
    ✔ should provide Strict template
    ✔ should provide Goal_Drift_Guard template
    ✔ should have Minimal template with correct structure
    ✔ should have Standard template with correct structure
    ✔ should have Strict template with correct structure
    ✔ should have Goal_Drift_Guard template with correct structure
    ✔ should not allow editing built-in templates
    ✔ should not allow deleting built-in templates
  list() - Metadata Only (Section 5.1)
    ✔ should return array of TemplateIndexEntry
  get() - Full Template (Section 5.1)
    ✔ should return full template with rulesText and outputFormatText
    ✔ should return null for non-existent id
    ✔ should cache loaded templates
  getByName()
    ✔ should return template by name
    ✔ should return null for non-existent name
  create() (Section 5.1)
    ✔ should create new template with all fields
    ✔ should persist template to file system
    ✔ should update index.json
    ✔ should reject duplicate names
    ✔ should validate name format
    ✔ should validate name length
    ✔ should validate rulesText length
    ✔ should validate outputFormatText length
  update() (Section 5.1)
    ✔ should update template name
    ✔ should update rulesText
    ✔ should update outputFormatText
    ✔ should persist updates to file system
    ✔ should throw for non-existent id
  delete() (Section 5.1)
    ✔ should delete user template
    ✔ should remove file from file system
    ✔ should update index.json
    ✔ should throw for non-existent id
  Event Emission (Section 7)
    ✔ should emit TEMPLATE_CREATED event
    ✔ should emit TEMPLATE_UPDATED event
    ✔ should emit TEMPLATE_DELETED event
    ✔ should emit STORE_INITIALIZED event
    ✔ should emit BUILTIN_LOADED event
  Error Handling - Fail-Closed (Section 6)
    ✔ should handle corrupted index.json gracefully
    ✔ should handle corrupted template file gracefully
  File Permissions (Section 9)
    ✔ should create files with secure permissions
  copy() - Template Duplication
    ✔ should copy built-in template
    ✔ should copy user template
    ✔ should throw for non-existent source
  Utility Methods
    ✔ should check if template exists
    ✔ should check if name is taken
    ✔ should exclude id when checking name
    ✔ should get built-in templates
    ✔ should format template for injection
```

### ProjectSettingsStore Tests

```
ProjectSettingsStore (spec/33_PROJECT_SETTINGS_PERSISTENCE.md)
  Initialization (Section 5.1)
    ✔ should create storage directory on initialize
    ✔ should create default settings for new project
    ✔ should persist settings to file system
    ✔ should generate project hash from path
    ✔ should update lastAccessedAt on initialize
  get() (Section 5.1)
    ✔ should return current settings
    ✔ should throw if not initialized
  update() (Section 5.1)
    ✔ should update partial settings
    ✔ should deep merge nested objects
    ✔ should update updatedAt timestamp
    ✔ should persist updates to file system
    ✔ should throw if not initialized
  setTemplate() (Section 5.2)
    ✔ should set template and enable it
    ✔ should clear and disable when set to null
  enableTemplate() (Section 5.2)
    ✔ should enable template injection
    ✔ should disable template injection
  setLLM()
    ✔ should update LLM provider and model
    ✔ should preserve customEndpoint
  setPreference()
    ✔ should update individual preference
  save()
    ✔ should update lastAccessedAt
    ✔ should emit SETTINGS_SAVED event
  reset() (Section 5.3)
    ✔ should reset to defaults
    ✔ should preserve projectPath and projectHash
    ✔ should emit SETTINGS_RESET event
  Migration (Section 7.3)
    ✔ should migrate v0 settings to v1
    ✔ should handle unknown version gracefully
  Project Index (Section 4.2)
    ✔ should update project index on initialize
    ✔ should enforce max projects limit
  Event System
    ✔ should emit SETTINGS_LOADED on initialize
    ✔ should emit SETTINGS_UPDATED on update
    ✔ should emit SETTINGS_ERROR on corrupted file
```

### Template Auto-Injection Unit Tests (PromptAssembler)

```
PromptAssembler (spec/17_PROMPT_TEMPLATE.md)
  Template Auto-Injection (spec/32_TEMPLATE_INJECTION.md)
    ✔ should not inject when activeTemplate is null
    ✔ should not inject when activeTemplate is undefined
    ✔ should not inject when activeTemplate is not provided (omitted)
    ✔ should inject rules after global prelude when activeTemplate is provided
    ✔ should inject output format before epilogue when activeTemplate is provided
    ✔ should populate sections.templateRules and sections.templateOutputFormat
    ✔ should work with assembleWithModification when activeTemplate is provided
    ✔ should not inject in assembleWithModification when activeTemplate is null
  Goal Drift Guard Template Injection
    ✔ should inject Goal Drift Guard rules when selected as activeTemplate
    ✔ should inject Goal Drift Guard output format when selected
    ✔ should NOT inject Goal Drift Guard when a different template is selected
    ✔ should inject Goal Drift Guard in correct order
    ✔ should work with assembleWithModification when Goal Drift Guard is active
    ✔ should populate sections with Goal Drift Guard content
```

### Integration Tests

```
Template Injection and Settings Persistence Integration
  Template Storage
    ✔ should write and read template from file system
    ✔ should handle built-in templates with isBuiltIn flag
  Project Settings Storage
    ✔ should write and read project settings from file system
    ✔ should generate consistent hash for same project path
  Template + Settings Integration
    ✔ should persist template selection in project settings
    ✔ should handle template deletion gracefully
  Settings Restoration Simulation
    ✔ should restore settings on simulated restart
    ✔ should use defaults when settings file does not exist
    ✔ should handle corrupted settings file (fail-closed)
  Template Injection Format
    ✔ should format template injection correctly
    ✔ should construct full prompt with template injection
  File Permissions
    ✔ should create files with secure permissions
    ✔ should create directories with secure permissions
  Settings Update Scenarios
    ✔ should update template selection and persist
    ✔ should toggle template enabled state
    ✔ should update LLM settings
  Index Management
    ✔ should add project to index on first access
    ✔ should update lastAccessedAt in index
```

## 主要な実装コンポーネント

### Template 構造

```typescript
interface Template {
  id: string;              // e.g., 'builtin-standard' or 'user-xxxxxxxx'
  name: string;            // e.g., 'Standard', 'my-custom'
  rulesText: string;       // Rules to inject (Markdown)
  outputFormatText: string; // Output format to inject (Markdown)
  enabled: boolean;        // Whether this template is enabled
  isBuiltIn: boolean;      // true for Minimal/Standard/Strict
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

### Built-in Templates

| Template | Rules | Use Case |
|----------|-------|----------|
| **Minimal** | 最小限の品質基準 | 高速プロトタイピング |
| **Standard** | バランスの取れた品質基準 | 通常開発（デフォルト推奨） |
| **Strict** | 厳格な品質基準 | 本番環境・重要機能 |
| **Goal_Drift_Guard** | ゴールドリフト防止・完了条件厳守 | 要件漏れ防止・厳密な完了判定 |

### Injection Points

```
[Global Prelude]
  ↓
[Template Rules Injection] ← 注入ポイント1
  ↓
[Project Prelude]
  ↓
[Task Group Prelude]
  ↓
[User Input]
  ↓
[Template Output Format Injection] ← 注入ポイント2
  ↓
[Output Epilogue]
```

## 設定ファイル構造

### Project Settings (`~/.pm-orchestrator/projects/{hash}.json`)

```json
{
  "version": 1,
  "projectPath": "/path/to/project",
  "projectHash": "a1b2c3d4e5f6g7h8",
  "template": {
    "selectedId": "builtin-standard",
    "enabled": true
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4",
    "customEndpoint": null
  },
  "preferences": {
    "autoChunking": true,
    "costWarningEnabled": true,
    "costWarningThreshold": 0.5
  },
  "createdAt": "2026-01-23T10:00:00.000Z",
  "updatedAt": "2026-01-23T10:30:00.000Z",
  "lastAccessedAt": "2026-01-23T11:00:00.000Z"
}
```

### Template Index (`~/.pm-orchestrator/templates/index.json`)

```json
{
  "version": 1,
  "templates": [
    { "id": "builtin-minimal", "name": "Minimal", "isBuiltIn": true, "updatedAt": "..." },
    { "id": "builtin-standard", "name": "Standard", "isBuiltIn": true, "updatedAt": "..." },
    { "id": "builtin-strict", "name": "Strict", "isBuiltIn": true, "updatedAt": "..." },
    { "id": "user-abc123", "name": "my-custom", "isBuiltIn": false, "updatedAt": "..." }
  ]
}
```

## REPL コマンド

### /templates コマンド

```
/templates list       - 全テンプレート一覧（Minimal, Standard, Strict, Goal_Drift_Guard）
/templates new <name> - 新規テンプレート作成
/templates edit <id>  - テンプレート編集
/templates delete <n> - テンプレート削除
/templates copy <src> <dst> - テンプレートコピー
```

### /template コマンド

```
/template             - 現在の設定を表示
/template use <name>  - テンプレート選択・有効化
/template on          - テンプレート注入有効化
/template off         - テンプレート注入無効化
```

## セキュリティ考慮

1. **ファイルパーミッション**: 0o700 (ディレクトリ) / 0o600 (ファイル)
2. **サイズ制限**:
   - Template name: 64文字
   - rulesText: 5000文字
   - outputFormatText: 5000文字
   - Settings file: 64KB
3. **パス検証**: ディレクトリトラバーサル防止
4. **Fail-Closed**: 破損ファイルはデフォルト値にフォールバック

## 品質チェック結果

```
typecheck: PASS (tsc --noEmit)
lint: PASS (新規ファイルに警告なし)
test: 2041 passing, 88 pending, 0 failing
build: PASS (tsc)
```


## Goal Drift Guard テンプレート詳細

### 概要

Goal_Drift_Guard は、AIがタスクの本来の目的から逸脱することを防ぐための組み込みテンプレートです。

### 特徴

1. **選択時のみ注入**: デフォルトでは無効。ユーザーが明示的に選択した場合のみ注入
2. **プロジェクト非依存**: 特定のサンプルプロジェクト固有の文言を含まない
3. **完了条件の厳格化**: "Task not complete from user's perspective" を失敗と定義
4. **エスケープフレーズ禁止**: "if needed", "optional" 等の曖昧表現を禁止

### ユースケース

- 要件漏れを防ぎたい重要な実装タスク
- 「基本実装完了」で終わらせたくない場合
- 完了報告の明確さが求められる場合

### 使用方法

```
/template use Goal_Drift_Guard
```

### 禁止されるフレーズ

- "if needed" / "if required"
- "optional" / "as needed"
- "when necessary"
- "could be added later"
- "might need" / "consider adding"
- "you may want to"

### 出力形式

Goal Drift Guard が有効な場合、以下の形式での完了報告が要求されます:

```
### Requirement Checklist
- [ ] Requirement 1: [status]
- [ ] Requirement 2: [status]

### Completion Statement
- "COMPLETE: All N requirements fulfilled" (全て完了の場合)
- "INCOMPLETE: Requirements X, Y, Z remain" (未完了の場合)
```

## 結論

Template Auto-Injection と Project Settings Persistence の実装は、
仕様書に基づき以下を達成しました:

1. Built-in テンプレート（Minimal/Standard/Strict）の提供
2. カスタムテンプレートの CRUD 操作
3. プロンプトへの自動注入機能
4. プロジェクト単位の設定永続化
5. セッション間での設定復元
6. REPL コマンドインターフェース
7. Fail-closed エラーハンドリング
