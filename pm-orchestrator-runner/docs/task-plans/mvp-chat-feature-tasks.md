# MVP Chat Feature - Task Plan

## Version: 1.0.0
## Status: Draft
## Date: 2026-02-04

---

## Overview

Web UI に Chat 画面を追加し、PM Orchestrator が Claude Code を自動実行して結果を返す。
また、runner が自分自身を安全に更新できるよう dev/prod 分離と再起動後の引き継ぎを実現する。

---

## Absolute Requirements (Task Constraints)

1. **手動 cleanup 禁止** - 全て自動化
2. **証拠は EVIDENCE + gate** - 主張だけ禁止
3. **実行中 prod を壊さない** - dev/prod 分離
4. **再起動後も継続** - 会話状態の永続化

---

## Task Breakdown

### A) Web UI Chat 画面

#### A-1: ConversationMessage モデル追加
- **File**: `src/web/dal/types.ts`
- **Content**: ConversationMessage interface

#### A-2: ConversationHistory 永続化 (NoDynamo)
- **File**: `src/web/dal/no-dynamo.ts`
- **Methods**: createConversationMessage, listConversationMessages, updateConversationMessage
- **Storage**: `stateDir/conversations/{projectId}.jsonl`

#### A-3: Chat API Routes
- **File**: `src/web/routes/chat.ts`
- **Endpoints**:
  - `GET /api/projects/:projectId/chat` - 会話履歴取得
  - `POST /api/projects/:projectId/chat` - メッセージ送信
  - `POST /api/projects/:projectId/chat/:messageId/respond` - 返信送信
  - `GET /api/projects/:projectId/chat/status` - ステータス取得

#### A-4: Chat UI Component
- **File**: `src/web/public/index.html`
- **Features**: 会話履歴表示、入力送信、返信モード

#### A-5: Chat → Run 連携
- ユーザーメッセージ→bootstrapPrompt結合→Run生成→結果保存

---

### B) Project Settings に bootstrapPrompt 追加

#### B-1: ProjectIndex モデル拡張
- **Add field**: `bootstrapPrompt?: string`

#### B-2: Settings API 拡張
- `PATCH /api/projects/:projectId` で bootstrapPrompt 保存

#### B-3: Settings UI 更新
- bootstrapPrompt テキストエリア追加

---

### C) Self-hosting dev/prod 分離

#### C-1: docs/SELF_HOSTING_DEV_PROD.md 作成
- dev/prod 分離運用手順

#### C-2: ProjectIndex に projectType 追加
- `'normal' | 'runner-dev'`

---

### D) 再起動後の引き継ぎ

#### D-1: ConversationHistory 永続化 (A-2 で実装)
#### D-2: AWAITING_RESPONSE 状態の永続化
#### D-3: サーバ再起動テスト

---

### E) E2E テスト統合

#### E-1: Chat E2E テスト
- **File**: `diagnostics/chat-e2e.check.ts`

#### E-2: gate:all 統合
- gate:chat を gate:all に追加

---

## Acceptance Criteria

- AC-CHAT-1: Chat 画面でメッセージ送信可能
- AC-CHAT-2: 送信後に Run 生成
- AC-CHAT-3: Run 結果が会話履歴に表示
- AC-CHAT-4: AWAITING_RESPONSE 時に返信モード
- AC-CHAT-5: bootstrapPrompt 自動注入
- AC-CHAT-6: サーバ再起動後に会話履歴残存
- AC-CHAT-7: gate:all に chat テスト含む
- AC-CHAT-8: dev/prod 分離ドキュメント存在
