# PM Orchestrator Enhancement - ロールバックプラン

本番環境でPM Orchestrator Enhancementに問題が発生した場合のロールバック手順を説明します。

## 目次

- [ロールバックの判断基準](#ロールバックの判断基準)
- [ロールバック手順](#ロールバック手順)
- [検証ステップ](#検証ステップ)
- [トラブルシューティング](#トラブルシューティング)

---

## ロールバックの判断基準

以下の状況でロールバックを検討してください：

### 即座にロールバックすべき状況（Critical）

1. **データ損失が発生**
   - ログファイルが削除された
   - 設定ファイルが破損した
   - 実行履歴が消失した

2. **システムが起動しない**
   - PM Orchestratorが起動しない
   - サブエージェントが全て失敗する
   - エラーログが大量に出力される

3. **本番環境への影響**
   - CI/CDパイプラインが停止
   - デプロイが失敗し続ける
   - 開発チーム全体の作業が停止

### ロールバックを検討すべき状況（High）

1. **パフォーマンス劣化**
   - 実行時間が2倍以上に増加
   - メモリ使用量が異常に増加
   - タイムアウトが頻発

2. **機能不全**
   - 特定のサブエージェントが常に失敗
   - ワークフローが正しく動作しない
   - エラーハンドリングが機能しない

### 様子見すべき状況（Medium）

1. **軽微な問題**
   - 一部のテストが失敗する
   - ログフォーマットが変わった
   - UI表示が一部崩れる

→ これらは修正パッチで対応可能。ロールバックは不要。

---

## ロールバック手順

### 前提条件

- マイグレーション実行時にバックアップが作成されていること
- バックアップディレクトリの場所を確認していること
- 実行権限があること

### Step 1: バックアップの確認

```bash
# バックアップディレクトリの確認
ls -la .pm-orchestrator-backup-*

# 最新のバックアップを特定
BACKUP_DIR=$(ls -td .pm-orchestrator-backup-* | head -1)
echo "Using backup: $BACKUP_DIR"

# バックアップの内容を確認
ls -la "$BACKUP_DIR"
```

**期待される出力:**
```
.pm-orchestrator/
├── logs/
├── config.json
└── (その他の設定ファイル)
```

### Step 2: 現在の状態をバックアップ

```bash
# 現在の状態を保存（ロールバック失敗時の保険）
ROLLBACK_BACKUP_DIR=".pm-orchestrator-rollback-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p "$ROLLBACK_BACKUP_DIR"
cp -r .pm-orchestrator "$ROLLBACK_BACKUP_DIR/"

echo "Current state backed up to: $ROLLBACK_BACKUP_DIR"
```

### Step 3: PM Orchestrator の停止

```bash
# 実行中のプロセスを確認
ps aux | grep pm-orchestrator

# プロセスを停止（該当する場合）
pkill -f pm-orchestrator

# 確認
ps aux | grep pm-orchestrator
```

### Step 4: 新システムの削除

```bash
# 新しい .pm-orchestrator を削除
rm -rf .pm-orchestrator

# 確認
ls -la | grep pm-orchestrator
```

### Step 5: 旧システムの復元

```bash
# バックアップから復元
BACKUP_DIR=$(ls -td .pm-orchestrator-backup-* | head -1)
cp -r "$BACKUP_DIR/.pm-orchestrator" .

# 旧設定ファイルの復元（該当する場合）
if [ -f "$BACKUP_DIR/.pm-orchestrator-config.json" ]; then
  cp "$BACKUP_DIR/.pm-orchestrator-config.json" .
fi

# 確認
ls -la .pm-orchestrator/
```

### Step 6: パーミッションの復元

```bash
# パーミッション設定
chmod -R 755 .pm-orchestrator
chmod 644 .pm-orchestrator/config.json 2>/dev/null || true

# 確認
ls -la .pm-orchestrator/
```

### Step 7: システムの起動確認

```bash
# PM Orchestrator の動作確認
pm-orchestrator --version

# テスト実行
pm-orchestrator "Run quality checks"

# ログ確認
tail -n 50 .pm-orchestrator/logs/*.json
```

---

## 検証ステップ

ロールバック後、以下を順番に検証してください。

### 1. ディレクトリ構造の確認

```bash
# 必要なディレクトリが存在するか確認
[ -d .pm-orchestrator ] && echo "✓ .pm-orchestrator exists" || echo "✗ .pm-orchestrator missing"
[ -d .pm-orchestrator/logs ] && echo "✓ logs/ exists" || echo "✗ logs/ missing"
```

**期待される結果:**
```
✓ .pm-orchestrator exists
✓ logs/ exists
```

### 2. 設定ファイルの確認

```bash
# 設定ファイルが存在するか確認
[ -f .pm-orchestrator/config.json ] && echo "✓ config.json exists" || echo "✗ config.json missing"

# 設定ファイルの内容を確認
cat .pm-orchestrator/config.json | head -10
```

**期待される結果:**
- 設定ファイルが存在する
- JSON形式が正しい
- 必要な設定項目が含まれている

### 3. ログファイルの確認

```bash
# ログファイルの存在確認
ls -la .pm-orchestrator/logs/ | head -10

# 最新のログを確認
LATEST_LOG=$(ls -t .pm-orchestrator/logs/*.json | head -1)
cat "$LATEST_LOG" | head -20
```

**期待される結果:**
- ログファイルが存在する
- JSON形式が正しい
- タイムスタンプが正しい

### 4. 機能テスト

```bash
# 基本的な機能テスト
echo "Testing basic functionality..."

# Test 1: バージョン確認
pm-orchestrator --version
echo "✓ Version check passed"

# Test 2: ヘルプ表示
pm-orchestrator --help
echo "✓ Help display passed"

# Test 3: 簡単なタスク実行
pm-orchestrator "Show current status"
echo "✓ Simple task execution passed"
```

**期待される結果:**
- 全てのテストが成功する
- エラーが出力されない

### 5. パフォーマンステスト

```bash
# 実行時間の測定
echo "Performance test..."

time pm-orchestrator "Run quality checks"

# メモリ使用量の確認（実行中）
ps aux | grep pm-orchestrator | awk '{print $6}'
```

**期待される結果:**
- 実行時間が正常範囲内（以前のバージョンと同等）
- メモリ使用量が正常範囲内

---

## トラブルシューティング

### 問題1: ロールバック後も起動しない

**症状:**
```bash
$ pm-orchestrator --version
-bash: pm-orchestrator: command not found
```

**原因:**
- npm/pnpmのグローバルインストールが削除された
- PATHが正しく設定されていない

**解決方法:**
```bash
# 再インストール
cd /path/to/pm-orchestrator
pnpm install
pnpm build
npm link

# 確認
pm-orchestrator --version
```

### 問題2: ログファイルが見つからない

**症状:**
```bash
$ ls .pm-orchestrator/logs/
ls: .pm-orchestrator/logs/: No such file or directory
```

**原因:**
- バックアップが不完全
- ログディレクトリが削除された

**解決方法:**
```bash
# ログディレクトリを再作成
mkdir -p .pm-orchestrator/logs

# 別のバックアップから復元
BACKUP_DIR=$(ls -td .pm-orchestrator-backup-* | head -2 | tail -1)
cp -r "$BACKUP_DIR/.pm-orchestrator/logs/"* .pm-orchestrator/logs/ 2>/dev/null || true
```

### 問題3: 設定ファイルが壊れている

**症状:**
```bash
$ pm-orchestrator "Run quality checks"
Error: Invalid configuration file
```

**原因:**
- JSON形式が壊れている
- 必須項目が欠落している

**解決方法:**
```bash
# 設定ファイルの検証
cat .pm-orchestrator/config.json | jq .

# エラーが出る場合、デフォルト設定を復元
cat > .pm-orchestrator/config.json << 'EOF'
{
  "version": "1.0.0",
  "baseDir": ".",
  "logging": {
    "enabled": true,
    "level": "info"
  }
}
EOF

# 確認
cat .pm-orchestrator/config.json | jq .
```

### 問題4: パーミッションエラー

**症状:**
```bash
$ pm-orchestrator "Run quality checks"
Error: EACCES: permission denied
```

**原因:**
- ファイル・ディレクトリのパーミッションが不正

**解決方法:**
```bash
# パーミッション修正
chmod -R 755 .pm-orchestrator
chmod 644 .pm-orchestrator/config.json
chmod 644 .pm-orchestrator/logs/*.json

# 所有者確認
ls -la .pm-orchestrator/

# 所有者修正（必要な場合）
chown -R $USER .pm-orchestrator
```

### 問題5: ロールバック自体が失敗する

**症状:**
```bash
$ cp -r "$BACKUP_DIR/.pm-orchestrator" .
cp: cannot create directory '.pm-orchestrator': File exists
```

**原因:**
- .pm-orchestrator が削除されていない
- 権限がない

**解決方法:**
```bash
# 強制削除してから復元
rm -rf .pm-orchestrator
cp -r "$BACKUP_DIR/.pm-orchestrator" .

# または、バックアップ名を変更
mv .pm-orchestrator .pm-orchestrator-broken
cp -r "$BACKUP_DIR/.pm-orchestrator" .
```

---

## ロールバック後の対応

### 1. チームへの通知

ロールバックを実施したら、必ずチームに通知してください：

**通知テンプレート:**
```
[重要] PM Orchestrator Enhancement ロールバック実施

実施日時: 2025-01-25 14:30
理由: [具体的な理由]
影響範囲: [影響を受けるプロジェクト・チーム]
現在の状態: 旧バージョンに復元済み、正常動作確認済み

今後の対応:
1. 問題の原因調査
2. 修正パッチの作成
3. テスト環境での検証
4. 再デプロイのスケジュール調整

質問・懸念事項がある場合は、[担当者]までご連絡ください。
```

### 2. 原因調査

```bash
# エラーログの収集
mkdir -p rollback-investigation
cp -r "$ROLLBACK_BACKUP_DIR" rollback-investigation/
cp -r .pm-orchestrator/logs rollback-investigation/logs-after-rollback

# システム情報の記録
uname -a > rollback-investigation/system-info.txt
npm --version >> rollback-investigation/system-info.txt
node --version >> rollback-investigation/system-info.txt

# アーカイブ作成
tar -czf rollback-investigation-$(date +%Y%m%d%H%M%S).tar.gz rollback-investigation/
```

### 3. 修正パッチの作成

問題を修正したら、再度以下の手順でテスト：

1. **開発環境でテスト**
2. **ステージング環境でテスト**
3. **小規模な本番環境でテスト**
4. **全体展開**

---

## 緊急連絡先

問題が解決しない場合の連絡先：

- **技術サポート**: [メールアドレス]
- **GitHub Issues**: https://github.com/pm-orchestrator/pm-orchestrator-enhancement/issues
- **Slack**: #pm-orchestrator-support

---

## 関連ドキュメント

- [マイグレーションスクリプト](../../scripts/migrate.sh)
- [ユーザーガイド](../user-guide.md)
- [開発者ガイド](../developer-guide.md)
- [API リファレンス](../api-reference.md)
