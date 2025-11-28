# PM Orchestrator - 100% Always-On（毎回起動）

このプロジェクトでは、PM Orchestratorは**100%常時起動**です。

---

## 設計原則

- **全てのユーザー入力でPM Orchestratorを起動する**
- TaskType判定・writeガード・サブエージェントチェーンはPM側で決定
- Main AIは判断せず、PMに全てを委譲する
- hookは「PMを起動せよ」というトリガーのみを出力

---

## Main AIの義務

1. **ユーザー入力を受け取ったら、即座にTask toolでpm-orchestratorを起動**
2. 自分で応答を作成しない
3. PMの判定結果に従う
4. PMの結果をユーザーに報告

---

## Task tool 呼び出し形式

```
subagent_type: "pm-orchestrator"
description: "タスク分析と実行"
prompt: |
  ユーザー入力:
  $ARGUMENTS

  このタスクを分析し、以下を実行してください:
  1. TaskType判定（READ_INFO/LIGHT_EDIT/IMPLEMENTATION/REVIEW_RESPONSE/CONFIG_CI_CHANGE/DANGEROUS_OP）
  2. write許可判定
  3. 必要なサブエージェントチェーン決定
  4. サブエージェント起動または直接実行
  5. 結果をJSON形式で報告
```

---

## 絶対禁止

Main AIは以下を絶対にしてはいけない:

- PM Orchestratorを起動せずに回答する
- 「今後は起動します」と言う（口約束）
- 自分でTaskType判定をする
- 「hookからは起動できない」と言う
- 「制約でできない」と言う

---

## 入力

$ARGUMENTS
