# 12_LLM_PROVIDER_AND_MODELS.md

# LLM Provider and Models

本章は、PM Orchestrator Runner が対応する LLM Provider およびモデルの管理仕様を定義する。

本仕様は Correctness Property 23 (Provider and Model Configuration Control) を実装する際の詳細規則である。

---

## 1. Provider Registry

### 1.1 対応 Provider 一覧

| Provider ID   | 表示名          | 説明                                   | API Key 必要性 |
| ------------- | --------------- | -------------------------------------- | -------------- |
| `claude-code` | Claude Code     | Claude Code を Executor として使用     | 不要           |
| `openai`      | OpenAI          | OpenAI API を直接呼び出し              | 必要           |
| `anthropic`   | Anthropic       | Anthropic API を直接呼び出し           | 必要           |

### 1.2 Provider 識別子の制約

- Provider ID は小文字英数字とハイフンのみ使用可能: `[a-z0-9-]+`
- 上記一覧にない Provider ID は不正として ERROR

### 1.3 既定 Provider

- 明示的な選択がない場合、`claude-code` を既定値とする
- 既定値の解決は Runner 起動時に行われる

---

## 2. Model Registry

### 2.1 Provider 別モデル一覧

#### claude-code

Claude Code 経由の場合、モデル選択は Claude Code 側の設定に委譲される。
Runner は `claude-code` provider 選択時、モデル名を保持しない（null として扱う）。

#### openai

| Model ID              | 表示名                | Input (1M tokens) | Output (1M tokens) | Context   |
| --------------------- | --------------------- | ----------------- | ------------------ | --------- |
| `gpt-4o`              | GPT-4o                | $2.50             | $10.00             | 128K      |
| `gpt-4o-mini`         | GPT-4o Mini           | $0.15             | $0.60              | 128K      |
| `gpt-4-turbo`         | GPT-4 Turbo           | $10.00            | $30.00             | 128K      |
| `gpt-4`               | GPT-4                 | $30.00            | $60.00             | 8K        |
| `gpt-3.5-turbo`       | GPT-3.5 Turbo         | $0.50             | $1.50              | 16K       |
| `o1`                  | o1                    | $15.00            | $60.00             | 200K      |
| `o1-mini`             | o1 Mini               | $3.00             | $12.00             | 128K      |
| `o1-preview`          | o1 Preview            | $15.00            | $60.00             | 128K      |

#### anthropic

| Model ID                      | 表示名              | Input (1M tokens) | Output (1M tokens) | Context   |
| ----------------------------- | ------------------- | ----------------- | ------------------ | --------- |
| `claude-opus-4-20250514`      | Claude Opus 4       | $15.00            | $75.00             | 200K      |
| `claude-sonnet-4-20250514`    | Claude Sonnet 4     | $3.00             | $15.00             | 200K      |
| `claude-3-5-sonnet-20241022`  | Claude 3.5 Sonnet   | $3.00             | $15.00             | 200K      |
| `claude-3-5-haiku-20241022`   | Claude 3.5 Haiku    | $0.80             | $4.00              | 200K      |
| `claude-3-opus-20240229`      | Claude 3 Opus       | $15.00            | $75.00             | 200K      |
| `claude-3-sonnet-20240229`    | Claude 3 Sonnet     | $3.00             | $15.00             | 200K      |
| `claude-3-haiku-20240307`     | Claude 3 Haiku      | $0.25             | $1.25              | 200K      |

### 2.2 料金情報の出典

- OpenAI: https://openai.com/pricing
- Anthropic: https://www.anthropic.com/pricing

### 2.3 料金情報の更新

- 料金情報はハードコードされた静的データとして保持する
- Runner は料金の正確性を保証しない（参考情報として表示）
- 最新の正確な料金は各 Provider の公式サイトを参照すること

---

## 3. Model Selection UI

### 3.1 表示フォーマット

モデル選択時、以下のフォーマットで一覧を表示する:

```
Available models for [Provider名]:

  [選択インジケータ] Model名
    Input: $X.XX/1M tokens | Output: $X.XX/1M tokens | Context: XXXK

例:
Available models for OpenAI:

> gpt-4o
    Input: $2.50/1M tokens | Output: $10.00/1M tokens | Context: 128K
  gpt-4o-mini
    Input: $0.15/1M tokens | Output: $0.60/1M tokens | Context: 128K
  gpt-4-turbo
    Input: $10.00/1M tokens | Output: $30.00/1M tokens | Context: 128K
```

### 3.2 選択インジケータ

- `>` : 現在カーソル位置のモデル（矢印キーで移動）
- `*` : 現在選択中のモデル（既存設定）
- ` ` (空白) : 未選択のモデル

### 3.3 キーバインド

| キー        | 動作                                   |
| ----------- | -------------------------------------- |
| `↑` / `k`   | カーソルを上に移動                     |
| `↓` / `j`   | カーソルを下に移動                     |
| `Enter`     | カーソル位置のモデルを選択・確定       |
| `q` / `Esc` | 選択をキャンセルして戻る               |

### 3.4 選択確定時の動作

1. `.claude/repl.json` の `selected_model` を更新
2. `updated_at` を現在時刻で更新
3. Evidence を生成（model_change イベント）
4. 確認メッセージを表示: `Model changed to: [Model名]`

---

## 4. Provider Selection UI

### 4.1 表示フォーマット

```
Available providers:

> claude-code (Default)
    Uses Claude Code as executor. No API key required.
  openai
    Direct OpenAI API calls. Requires OPENAI_API_KEY.
  anthropic
    Direct Anthropic API calls. Requires ANTHROPIC_API_KEY.
```

### 4.2 選択確定時の動作

1. `.claude/repl.json` の `selected_provider` を更新
2. `selected_model` を null にリセット（provider 変更時）
3. `updated_at` を現在時刻で更新
4. Evidence を生成（provider_change イベント）
5. 確認メッセージを表示: `Provider changed to: [Provider名]`
6. API キーが必要な provider の場合、キー状態を確認・表示

---

## 5. Validation Rules

### 5.1 Provider Validation

```
function validateProvider(providerId: string): ValidationResult {
  const validProviders = ['claude-code', 'openai', 'anthropic'];

  if (!providerId || providerId.trim() === '') {
    return { valid: false, error: 'Provider ID is required' };
  }

  if (!validProviders.includes(providerId)) {
    return { valid: false, error: `Unknown provider: ${providerId}` };
  }

  return { valid: true };
}
```

### 5.2 Model Validation

```
function validateModel(providerId: string, modelId: string | null): ValidationResult {
  // claude-code の場合、model は null でもよい
  if (providerId === 'claude-code') {
    return { valid: true };
  }

  // その他の provider の場合、model は必須
  if (!modelId || modelId.trim() === '') {
    return { valid: false, error: 'Model selection is required for this provider' };
  }

  // モデルの存在確認はしない（Provider 側で検証される）
  return { valid: true };
}
```

### 5.3 API Key Validation

```
function validateApiKey(providerId: string): ValidationResult {
  const keyMapping = {
    'claude-code': null,  // 不要
    'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY'
  };

  const envVar = keyMapping[providerId];

  if (envVar === null) {
    return { valid: true };  // API キー不要
  }

  const keyValue = process.env[envVar];

  if (!keyValue || keyValue.trim() === '') {
    return { valid: false, error: `${envVar} is not set` };
  }

  return { valid: true };
}
```

---

## 6. Configuration Persistence

### 6.1 ReplState ファイル

保存先: `.claude/repl.json`

```json
{
  "selected_provider": "openai",
  "selected_model": "gpt-4o",
  "updated_at": "2025-01-12T10:30:00Z"
}
```

### 6.2 読み込み時の動作

1. ファイルが存在しない場合 → 既定値を使用 (`claude-code`, null)
2. ファイルが破損している場合 → ERROR として停止（推測補完禁止）
3. `selected_provider` が不正な場合 → ERROR として停止
4. `selected_model` が空文字列の場合 → null として扱う

### 6.3 書き込み時の動作

1. 書き込み前に排他ロックを取得
2. JSON として整形して書き込み
3. 書き込み完了後にロックを解放
4. 書き込み失敗時は ERROR として停止

---

## 7. Cross-References

- Property 23: Provider and Model Configuration Control (spec/06_CORRECTNESS_PROPERTIES.md)
- Property 24: API Key Secrecy (spec/06_CORRECTNESS_PROPERTIES.md)
- ReplState Data Model (spec/05_DATA_MODELS.md)
- /provider, /models Commands (spec/10_REPL_UX.md)
