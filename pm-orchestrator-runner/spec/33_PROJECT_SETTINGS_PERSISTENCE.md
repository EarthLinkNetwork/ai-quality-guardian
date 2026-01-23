# 33. Project Settings Persistence

## 1. 概要

プロジェクト固有の設定（選択テンプレート、LLMプロバイダー、モデル等）を永続化し、起動時に復元する機能。

### 1.1 目的
- `/exit` やプロセス終了後も設定を保持
- プロジェクトごとに異なる設定を管理
- 起動時に前回の設定を自動復元

### 1.2 設計原則
- **プロジェクト識別**: プロジェクトパスのハッシュで識別
- **fail-closed**: 破損時はデフォルト設定で起動、警告表示
- **遅延書き込み**: 設定変更時に即座に保存

## 2. データモデル

### 2.1 ProjectSettings

```typescript
interface ProjectSettings {
  version: number;                    // スキーマバージョン
  projectPath: string;                // プロジェクトパス（参照用）
  projectHash: string;                // プロジェクトパスのハッシュ（ファイル名に使用）

  // テンプレート設定
  template: {
    selectedId: string | null;        // 選択中のテンプレートID
    enabled: boolean;                 // テンプレート注入が有効か
  };

  // LLM設定
  llm: {
    provider: string | null;          // 選択プロバイダー（anthropic, openai等）
    model: string | null;             // 選択モデル（claude-3-opus等）
    customEndpoint: string | null;    // カスタムエンドポイント（オプション）
  };

  // その他の設定
  preferences: {
    autoChunking: boolean;            // 自動チャンク分割
    costWarningEnabled: boolean;      // コスト警告の有効/無効
    costWarningThreshold: number;     // コスト警告閾値（USD）
  };

  // メタデータ
  createdAt: string;                  // ISO 8601
  updatedAt: string;                  // ISO 8601
  lastAccessedAt: string;             // ISO 8601
}
```

### 2.2 デフォルト設定

```typescript
const DEFAULT_PROJECT_SETTINGS: Omit<ProjectSettings, 'projectPath' | 'projectHash' | 'createdAt' | 'updatedAt' | 'lastAccessedAt'> = {
  version: 1,
  template: {
    selectedId: null,
    enabled: false,
  },
  llm: {
    provider: null,
    model: null,
    customEndpoint: null,
  },
  preferences: {
    autoChunking: true,
    costWarningEnabled: true,
    costWarningThreshold: 0.5,
  },
};
```

## 3. ストレージ

### 3.1 保存場所

```
~/.pm-orchestrator/
├── templates/                # テンプレート（spec/32参照）
│   ├── index.json
│   └── {id}.json
└── projects/
    ├── index.json           # プロジェクト一覧（軽量）
    └── {project-hash}.json  # 各プロジェクト設定
```

### 3.2 プロジェクトハッシュ生成

```typescript
function generateProjectHash(projectPath: string): string {
  // プロジェクトパスの正規化
  const normalized = path.resolve(projectPath).toLowerCase();

  // SHA-256ハッシュの先頭16文字を使用
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return hash.substring(0, 16);
}
```

### 3.3 index.json 形式

```json
{
  "version": 1,
  "projects": [
    {
      "hash": "abc123def456789",
      "path": "/Users/user/project",
      "lastAccessedAt": "2026-01-23T10:00:00Z"
    }
  ]
}
```

### 3.4 プロジェクト設定ファイル形式

```json
{
  "version": 1,
  "projectPath": "/Users/user/project",
  "projectHash": "abc123def456789",
  "template": {
    "selectedId": "uuid-abc-123",
    "enabled": true
  },
  "llm": {
    "provider": "anthropic",
    "model": "claude-3-opus",
    "customEndpoint": null
  },
  "preferences": {
    "autoChunking": true,
    "costWarningEnabled": true,
    "costWarningThreshold": 0.5
  },
  "createdAt": "2026-01-20T09:00:00Z",
  "updatedAt": "2026-01-23T10:00:00Z",
  "lastAccessedAt": "2026-01-23T10:00:00Z"
}
```

## 4. ライフサイクル

### 4.1 起動時の復元フロー

```
Runner起動
    │
    ▼
ProjectSettingsStore.load(projectPath)
    │
    ├── プロジェクトハッシュ生成
    │
    ├── ~/.pm-orchestrator/projects/{hash}.json 読み込み
    │   │
    │   ├── [存在しない] → デフォルト設定で新規作成
    │   │
    │   ├── [読み込み成功] → 設定を復元
    │   │   │
    │   │   ├── template.enabled && template.selectedId
    │   │   │   └── TemplateStore.get(selectedId)
    │   │   │       ├── [存在] → テンプレート適用
    │   │   │       └── [不存在] → 選択解除、警告
    │   │   │
    │   │   └── llm.provider && llm.model
    │   │       └── ModelPolicyManager.setProvider(provider, model)
    │   │
    │   └── [破損] → デフォルト設定、警告表示
    │
    ▼
設定をREPL/Runnerに反映
```

### 4.2 設定変更時の保存フロー

```
設定変更操作
    │
    ├── /template use <name>
    ├── /template on
    ├── /template off
    ├── /provider <name>
    ├── /model <name>
    └── /config set <key> <value>
    │
    ▼
ProjectSettingsStore.update(changes)
    │
    ├── メモリ上の設定を更新
    ├── updatedAt を更新
    └── ファイルに書き込み（同期）
```

### 4.3 終了時

```
/exit または プロセス終了
    │
    ▼
ProjectSettingsStore.save()
    │
    ├── lastAccessedAt を更新
    └── ファイルに書き込み
```

## 5. API

### 5.1 ProjectSettingsStore

```typescript
class ProjectSettingsStore {
  // 初期化（起動時に呼び出し）
  async initialize(projectPath: string): Promise<ProjectSettings>;

  // 設定取得
  get(): ProjectSettings;

  // 設定更新（部分更新可能）
  async update(changes: Partial<ProjectSettings>): Promise<ProjectSettings>;

  // テンプレート設定
  async setTemplate(templateId: string | null): Promise<void>;
  async enableTemplate(enabled: boolean): Promise<void>;

  // LLM設定
  async setLLM(provider: string, model: string): Promise<void>;

  // プリファレンス設定
  async setPreference<K extends keyof ProjectSettings['preferences']>(
    key: K,
    value: ProjectSettings['preferences'][K]
  ): Promise<void>;

  // 保存（通常は自動保存だが、明示的に呼び出し可能）
  async save(): Promise<void>;

  // リセット（デフォルト設定に戻す）
  async reset(): Promise<ProjectSettings>;
}
```

### 5.2 グローバル設定との関係

```typescript
// GlobalConfig（既存）: 全プロジェクト共通のデフォルト設定
// ProjectSettings（新規）: プロジェクト固有の設定

// 優先順位:
// 1. ProjectSettings（プロジェクト固有）
// 2. GlobalConfig（グローバルデフォルト）
// 3. DEFAULT_*（ハードコード）

function getEffectiveSetting<T>(key: string): T {
  const projectValue = projectSettings[key];
  if (projectValue !== null && projectValue !== undefined) {
    return projectValue;
  }

  const globalValue = globalConfig[key];
  if (globalValue !== null && globalValue !== undefined) {
    return globalValue;
  }

  return DEFAULT_SETTINGS[key];
}
```

## 6. REPLコマンド

### 6.1 /config コマンド

```
/config show                    # 現在の設定を表示
/config set <key> <value>       # 設定を変更
/config reset                   # デフォルトに戻す
```

### 6.2 /config show 出力例

```
╭─────────────────────────────────────────────────────╮
│ Project Settings                                     │
├─────────────────────────────────────────────────────┤
│ Project: /Users/user/my-project                      │
│ Hash: abc123def456789                                │
│                                                     │
│ Template:                                           │
│   Selected: Standard (builtin-standard)              │
│   Enabled: Yes                                      │
│                                                     │
│ LLM:                                                │
│   Provider: anthropic                               │
│   Model: claude-3-opus                              │
│                                                     │
│ Preferences:                                        │
│   Auto Chunking: Yes                                │
│   Cost Warning: Yes (threshold: $0.50)              │
│                                                     │
│ Last Updated: 2026-01-23 10:00:00                   │
╰─────────────────────────────────────────────────────╯
```

## 7. エラーハンドリング

### 7.1 破損時の挙動（fail-closed）

| 状態 | 挙動 |
|------|------|
| index.json 破損 | 警告表示、空のインデックスで起動 |
| プロジェクト設定ファイル破損 | 警告表示、デフォルト設定で起動 |
| 書き込み失敗 | エラー表示、メモリ上の設定は維持 |
| ディレクトリ作成失敗 | エラー表示、永続化を無効化 |

### 7.2 警告メッセージ

```
[WARN] Project settings corrupted: abc123.json - using defaults
[WARN] Selected template not found: xyz-456 - template disabled
[WARN] Failed to save settings: Permission denied
```

### 7.3 マイグレーション

```typescript
function migrateSettings(settings: unknown): ProjectSettings {
  const version = (settings as { version?: number })?.version ?? 0;

  switch (version) {
    case 0:
      // v0 → v1: 初期フォーマットから現在のフォーマットへ
      return migrateV0ToV1(settings);
    case 1:
      // 現在のバージョン
      return settings as ProjectSettings;
    default:
      // 未知のバージョン → デフォルトで初期化
      console.warn(`Unknown settings version: ${version}`);
      return createDefaultSettings();
  }
}
```

## 8. イベント

```typescript
type ProjectSettingsEvent =
  | { type: 'SETTINGS_LOADED'; projectHash: string }
  | { type: 'SETTINGS_UPDATED'; changes: Partial<ProjectSettings> }
  | { type: 'SETTINGS_SAVED'; projectHash: string }
  | { type: 'SETTINGS_RESET'; projectHash: string }
  | { type: 'SETTINGS_MIGRATION'; fromVersion: number; toVersion: number }
  | { type: 'SETTINGS_ERROR'; error: string };
```

## 9. 制約

- プロジェクトパス: 最大4096文字
- 設定ファイルサイズ: 最大64KB
- プロジェクト数上限: 1000個（古いものから自動削除）
- 保存間隔: 変更時即座（debounce 100ms）

## 10. セキュリティ

- 設定ファイルはプレーンJSONとして保存
- APIキー等の機密情報は含めない（環境変数を使用）
- ファイルパーミッション: 0600（ユーザーのみ読み書き可）
- ディレクトリパーミッション: 0700（ユーザーのみアクセス可）

## 11. 関連仕様

- spec/32_TEMPLATE_INJECTION.md - テンプレート管理
- spec/31_PROVIDER_MODEL_POLICY.md - LLMプロバイダー・モデル管理
- spec/12_LLM_PROVIDER_AND_MODELS.md - LLMプロバイダー設定
