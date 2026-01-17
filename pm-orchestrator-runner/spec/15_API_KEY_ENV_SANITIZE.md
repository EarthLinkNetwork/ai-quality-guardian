# 15_API_KEY_ENV_SANITIZE.md

# API KEY / 認証仕様（環境変数制御）

本章は Runner が child_process を起動する際の環境変数制御仕様を定義する。

本仕様は Property 24 (API Key Secrecy) を実装する際の詳細規則である。


## 大原則

- pm-orchestrator-runner は API Key を一切扱わない
- OpenAI / Anthropic API を直接呼ばない
- Claude Code CLI の「ログイン済み状態」のみを利用する
- npm global install された runner から API Key が読めてはならない


## child_process 実行時の env 制御（ALLOWLIST 方式）

Runner が Claude Code CLI を起動する際は **ALLOWLIST 方式** を厳守する。

### 基本原則

- process.env をそのまま渡してはならない
- 明示的に env オブジェクトを **ALLOWLIST から再構築** すること
- **ALLOWLIST に含まれる環境変数のみを子プロセスに渡す**
- ALLOWLIST に存在しない環境変数は一切渡さない

### ALLOWLIST（許可する環境変数）

以下の環境変数 **のみ** を子プロセスに渡すことを許可する。

```
PATH                    # 実行パス（必須）
HOME                    # ホームディレクトリ
USER                    # ユーザー名
SHELL                   # シェル
LANG                    # 言語設定
LC_ALL                  # ロケール
LC_CTYPE                # 文字タイプ
TERM                    # ターミナル種別
TMPDIR                  # 一時ディレクトリ
XDG_CONFIG_HOME         # XDG設定ディレクトリ
XDG_DATA_HOME           # XDGデータディレクトリ
XDG_CACHE_HOME          # XDGキャッシュディレクトリ
NODE_ENV                # Node.js環境（development/production/test）
DEBUG                   # デバッグフラグ（オプション）
```

### 実装例

```typescript
const ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'SHELL',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'TMPDIR',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
  'NODE_ENV', 'DEBUG'
];

function buildSanitizedEnv(): Record<string, string> {
  const sanitizedEnv: Record<string, string> = {};
  for (const key of ALLOWLIST) {
    if (process.env[key] !== undefined) {
      sanitizedEnv[key] = process.env[key];
    }
  }
  return sanitizedEnv;
}

// child_process 起動時
spawn('claude', args, {
  env: buildSanitizedEnv()
});
```

### 禁止される環境変数（暗黙的に除外）

ALLOWLIST 方式により、以下を含む全ての API Key / 認証情報は自動的に除外される。

- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- AZURE_OPENAI_KEY
- OPENAI_ORG_ID
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- GCP_SERVICE_ACCOUNT_KEY
- その他全ての機密環境変数


## 起動時チェック

Runner 起動時に必ず以下を行う。

- Claude Code CLI が存在するか確認
- Claude Code CLI がログイン済みか確認
- 未ログイン時は即エラーで終了


## 起動時の必須表示

以下を必ず表示する。

```
Executor: Claude Code CLI
Auth: Uses Claude subscription (no API key required)
Env: ALLOWLIST mode (only PATH, HOME, etc. passed to subprocess)
```


## 禁止事項

- process.env をそのまま child_process に渡すこと
- ALLOWLIST 以外の環境変数を子プロセスに渡すこと
- DELETELIST（削除リスト）方式を採用すること（新規追加の API Key を見逃すリスク）
- OPENAI_API_KEY 等を runner 内で参照すること


## ALLOWLIST vs DELETELIST の根拠

| 方式 | 安全性 | リスク |
|------|--------|--------|
| **ALLOWLIST**（採用） | 高い | 必要な環境変数の見落とし（動作しない→即座に検出可能） |
| DELETELIST | 低い | 新規追加された API Key を見落とす（漏洩→検出困難） |

**ALLOWLIST 方式を採用する理由:**
- Fail-closed 原則に合致（不足は動作失敗として検出可能）
- 新しい API Key が追加されても自動的に除外される
- セキュリティ監査が容易（許可リストを確認するだけ）


## Cross-References

- Property 24: API Key Secrecy (spec/06_CORRECTNESS_PROPERTIES.md)
- 12_LLM_PROVIDER_AND_MODELS.md (Provider 別 API Key 要件)
