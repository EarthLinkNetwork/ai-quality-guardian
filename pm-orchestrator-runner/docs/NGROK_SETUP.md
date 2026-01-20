# ngrok Setup Guide

PM Orchestrator Runner の Web UI を外部からアクセス可能にするための ngrok セットアップガイド。

## 前提条件

- ngrok がインストール済みであること
- PM Orchestrator Runner が起動していること（デフォルト: localhost:3000）

## ngrok のインストール

### macOS (Homebrew)

```bash
brew install ngrok
```

### その他のプラットフォーム

https://ngrok.com/download からダウンロード

## 基本的な使い方

### 1. PM Orchestrator Runner を起動

```bash
# DynamoDB Local を起動
docker run -d -p 8000:8000 amazon/dynamodb-local

# テーブルを初期化
npm run dynamodb:local:init

# Runner を起動（Web UI 込み）
npm start
```

### 2. ngrok でトンネルを作成

```bash
# デフォルトポート 3000 の場合
ngrok http 3000

# ポートを指定する場合
ngrok http 8080
```

### 3. 生成された URL にアクセス

ngrok は以下のような URL を生成します：

```
Forwarding    https://xxxx-xxxx-xxxx.ngrok-free.app -> http://localhost:3000
```

この URL（`https://xxxx-xxxx-xxxx.ngrok-free.app`）をスマートフォンや他のデバイスからアクセスできます。

## ngrok 認証（推奨）

無料版の ngrok はセッション制限があります。
アカウント登録して認証トークンを設定することで、安定して使用できます。

```bash
# 認証トークンを設定
ngrok config add-authtoken YOUR_AUTHTOKEN
```

## セキュリティに関する注意事項

### 1. 認証なしで公開されます

現在の Web UI は認証機能がありません。
ngrok URL を知っている人は誰でもアクセスできます。

**推奨対策：**
- ngrok URL を信頼できる人にのみ共有
- 使用しない時は ngrok を停止
- 本番環境では認証を実装

### 2. ngrok の基本認証を使用

ngrok の基本認証機能を使用できます：

```bash
ngrok http 3000 --basic-auth="username:password"
```

### 3. IP 制限（有料版）

ngrok の有料版では IP 制限が可能です。

## トラブルシューティング

### ngrok が接続できない

1. PM Orchestrator Runner が起動しているか確認
   ```bash
   curl http://localhost:3000/api/health
   ```

2. ポート番号が正しいか確認

3. ファイアウォールの設定を確認

### セッションが切断される

無料版の ngrok はセッション時間制限があります。
認証トークンを設定するか、有料版を検討してください。

### 遅延が大きい

- ngrok サーバーは海外にある場合があります
- 日本のユーザーは `ngrok http 3000 --region=ap` で Asia Pacific リージョンを指定できます（有料版）

## 推奨ワークフロー

1. 開発マシンで PM Orchestrator Runner を起動
2. ngrok でトンネルを作成
3. スマートフォンから ngrok URL にアクセス
4. Web UI でタスクを投入
5. タスクの進捗を確認
6. 作業完了後、ngrok を停止

## API エンドポイント一覧

ngrok 経由でアクセスできる API：

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/health | ヘルスチェック |
| GET | /api/task-groups | タスクグループ一覧 |
| POST | /api/task-groups | タスクグループ作成 |
| GET | /api/task-groups/:id/tasks | タスク一覧 |
| GET | /api/tasks/:id | タスク詳細 |
| POST | /api/tasks | タスクをキューに追加 |

## 関連ドキュメント

- [spec/19_WEB_UI.md](../spec/19_WEB_UI.md) - Web UI 仕様
- [spec/20_QUEUE_STORE.md](../spec/20_QUEUE_STORE.md) - Queue Store 仕様
