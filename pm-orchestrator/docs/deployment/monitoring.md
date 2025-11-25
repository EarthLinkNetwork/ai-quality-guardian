# PM Orchestrator Enhancement - モニタリング設定

PM Orchestrator Enhancementの本番環境監視設定を説明します。

## 目次

- [モニタリング概要](#モニタリング概要)
- [メトリクス収集](#メトリクス収集)
- [アラート設定](#アラート設定)
- [ダッシュボード構築](#ダッシュボード構築)
- [ログ分析](#ログ分析)

---

## モニタリング概要

### 監視対象

以下の項目を監視します：

1. **実行メトリクス**
   - タスク成功率
   - 平均実行時間
   - エラー発生率
   - サブエージェント使用統計

2. **システムメトリクス**
   - CPU使用率
   - メモリ使用率
   - ディスク使用率
   - ネットワークトラフィック

3. **ビジネスメトリクス**
   - PRレビュー対応時間
   - 品質チェック実行回数
   - 自動修正成功率
   - ユーザー満足度

---

## メトリクス収集

### 1. 実行ログの収集

PM Orchestratorは実行ごとにログを記録します。

**ログファイル構造:**
```
.pm-orchestrator/
├── logs/
│   ├── task-{taskId}.json      # 個別タスクログ
│   ├── daily-{date}.json       # 日次サマリー
│   └── weekly-{date}.json      # 週次トレンド
└── metrics/
    ├── hourly-{timestamp}.json
    ├── daily-{date}.json
    └── weekly-{date}.json
```

**メトリクス収集スクリプト:**

```bash
#!/bin/bash
# collect-metrics.sh

BASE_DIR="${1:-.}"
OUTPUT_DIR="$BASE_DIR/.pm-orchestrator/metrics"
DATE=$(date +%Y-%m-%d)

mkdir -p "$OUTPUT_DIR"

# 今日の実行ログを収集
LOG_FILES=$(find "$BASE_DIR/.pm-orchestrator/logs" -name "task-*.json" -newermt "$DATE" 2>/dev/null)

if [ -z "$LOG_FILES" ]; then
  echo "No logs found for today"
  exit 0
fi

# メトリクス集計
TOTAL_TASKS=$(echo "$LOG_FILES" | wc -l)
SUCCESS_TASKS=$(echo "$LOG_FILES" | xargs cat | jq -r 'select(.status == "success") | .taskId' | wc -l)
ERROR_TASKS=$(echo "$LOG_FILES" | xargs cat | jq -r 'select(.status == "error") | .taskId' | wc -l)
AVG_TIME=$(echo "$LOG_FILES" | xargs cat | jq -r '.executionTime' | awk '{sum+=$1; count++} END {print sum/count}')

# JSON形式で出力
cat > "$OUTPUT_DIR/daily-$DATE.json" << EOF
{
  "date": "$DATE",
  "totalTasks": $TOTAL_TASKS,
  "successTasks": $SUCCESS_TASKS,
  "errorTasks": $ERROR_TASKS,
  "successRate": $(echo "scale=2; $SUCCESS_TASKS * 100 / $TOTAL_TASKS" | bc),
  "avgExecutionTime": $AVG_TIME,
  "subagentUsage": $(echo "$LOG_FILES" | xargs cat | jq -s '[.[].subagentResults[].name] | group_by(.) | map({(.[0]): length}) | add')
}
EOF

echo "Metrics collected: $OUTPUT_DIR/daily-$DATE.json"
```

**cron設定（毎日0時に実行）:**
```bash
0 0 * * * /path/to/pm-orchestrator/scripts/collect-metrics.sh /path/to/project
```

### 2. Prometheusエクスポーター

Prometheusでメトリクスを収集する場合、以下のエクスポーターを実装：

**pm-orchestrator-exporter.js:**

```javascript
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9100;
const BASE_DIR = process.env.PM_ORCHESTRATOR_BASE_DIR || '.';

app.get('/metrics', async (req, res) => {
  const metricsDir = path.join(BASE_DIR, '.pm-orchestrator', 'metrics');
  const latestFile = fs.readdirSync(metricsDir)
    .filter(f => f.startsWith('daily-'))
    .sort()
    .reverse()[0];

  if (!latestFile) {
    res.status(404).send('No metrics found');
    return;
  }

  const metrics = JSON.parse(
    fs.readFileSync(path.join(metricsDir, latestFile), 'utf8')
  );

  // Prometheus形式で出力
  res.set('Content-Type', 'text/plain');
  res.send(`
# HELP pm_orchestrator_total_tasks Total number of tasks
# TYPE pm_orchestrator_total_tasks gauge
pm_orchestrator_total_tasks ${metrics.totalTasks}

# HELP pm_orchestrator_success_tasks Number of successful tasks
# TYPE pm_orchestrator_success_tasks gauge
pm_orchestrator_success_tasks ${metrics.successTasks}

# HELP pm_orchestrator_error_tasks Number of failed tasks
# TYPE pm_orchestrator_error_tasks gauge
pm_orchestrator_error_tasks ${metrics.errorTasks}

# HELP pm_orchestrator_success_rate Success rate percentage
# TYPE pm_orchestrator_success_rate gauge
pm_orchestrator_success_rate ${metrics.successRate}

# HELP pm_orchestrator_avg_execution_time Average execution time in ms
# TYPE pm_orchestrator_avg_execution_time gauge
pm_orchestrator_avg_execution_time ${metrics.avgExecutionTime}
  `.trim());
});

app.listen(PORT, () => {
  console.log(`PM Orchestrator exporter listening on port ${PORT}`);
});
```

**Prometheus設定（prometheus.yml）:**

```yaml
scrape_configs:
  - job_name: 'pm-orchestrator'
    static_configs:
      - targets: ['localhost:9100']
    scrape_interval: 60s
```

---

## アラート設定

### 1. 成功率アラート

**条件:**
- 成功率が80%を下回った場合

**Prometheus Alert Rule:**

```yaml
groups:
  - name: pm_orchestrator_alerts
    interval: 5m
    rules:
      - alert: PMOrchestratorSuccessRateLow
        expr: pm_orchestrator_success_rate < 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "PM Orchestrator success rate is low"
          description: "Success rate is {{ $value }}% (threshold: 80%)"

      - alert: PMOrchestratorSuccessRateCritical
        expr: pm_orchestrator_success_rate < 50
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "PM Orchestrator success rate is critically low"
          description: "Success rate is {{ $value }}% (threshold: 50%)"
```

### 2. 実行時間アラート

**条件:**
- 平均実行時間が通常の2倍を超えた場合

**Prometheus Alert Rule:**

```yaml
      - alert: PMOrchestratorSlowExecution
        expr: pm_orchestrator_avg_execution_time > 10000
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "PM Orchestrator execution is slow"
          description: "Average execution time is {{ $value }}ms (threshold: 10000ms)"
```

### 3. エラー率アラート

**条件:**
- エラー率が20%を超えた場合

**Prometheus Alert Rule:**

```yaml
      - alert: PMOrchestratorHighErrorRate
        expr: (pm_orchestrator_error_tasks / pm_orchestrator_total_tasks) > 0.2
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "PM Orchestrator error rate is high"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold: 20%)"
```

### 4. Alertmanager設定

**alertmanager.yml:**

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'slack-notifications'
  routes:
    - match:
        severity: critical
      receiver: 'pager-duty'

receivers:
  - name: 'slack-notifications'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#pm-orchestrator-alerts'
        title: 'PM Orchestrator Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}\n{{ .Annotations.description }}\n{{ end }}'

  - name: 'pager-duty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
```

---

## ダッシュボード構築

### Grafanaダッシュボード

**ダッシュボードJSON:**

```json
{
  "dashboard": {
    "title": "PM Orchestrator Monitoring",
    "panels": [
      {
        "id": 1,
        "title": "Success Rate",
        "type": "gauge",
        "targets": [
          {
            "expr": "pm_orchestrator_success_rate"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "max": 100,
            "min": 0,
            "thresholds": {
              "steps": [
                { "color": "red", "value": 0 },
                { "color": "yellow", "value": 80 },
                { "color": "green", "value": 95 }
              ]
            }
          }
        }
      },
      {
        "id": 2,
        "title": "Task Execution Trend",
        "type": "graph",
        "targets": [
          {
            "expr": "pm_orchestrator_total_tasks",
            "legendFormat": "Total Tasks"
          },
          {
            "expr": "pm_orchestrator_success_tasks",
            "legendFormat": "Success"
          },
          {
            "expr": "pm_orchestrator_error_tasks",
            "legendFormat": "Errors"
          }
        ]
      },
      {
        "id": 3,
        "title": "Average Execution Time",
        "type": "graph",
        "targets": [
          {
            "expr": "pm_orchestrator_avg_execution_time"
          }
        ]
      },
      {
        "id": 4,
        "title": "Subagent Usage",
        "type": "piechart",
        "targets": [
          {
            "expr": "sum by (subagent) (pm_orchestrator_subagent_usage)"
          }
        ]
      }
    ]
  }
}
```

**主要なパネル:**

1. **成功率ゲージ**
   - 現在の成功率を表示
   - 閾値: 緑（95%以上）、黄（80-95%）、赤（80%未満）

2. **タスク実行トレンド**
   - 総タスク数、成功数、エラー数の時系列グラフ
   - 過去24時間のデータを表示

3. **平均実行時間**
   - 平均実行時間の時系列グラフ
   - パフォーマンス劣化を早期検出

4. **サブエージェント使用状況**
   - 各サブエージェントの使用頻度を円グラフで表示

---

## ログ分析

### 1. エラーログの集計

```bash
#!/bin/bash
# analyze-errors.sh

BASE_DIR="${1:-.}"
LOG_DIR="$BASE_DIR/.pm-orchestrator/logs"
DATE="${2:-$(date +%Y-%m-%d)}"

echo "Analyzing errors for $DATE..."

# エラーログを抽出
find "$LOG_DIR" -name "task-*.json" -newermt "$DATE" -exec cat {} \; | \
  jq -r 'select(.status == "error") | {taskId, error: .error, subagent: .subagentResults[-1].name}' | \
  jq -s 'group_by(.subagent) | map({subagent: .[0].subagent, count: length, errors: map(.error)})' | \
  jq -r '.[] | "\(.subagent): \(.count) errors"'

echo ""
echo "Most common errors:"

find "$LOG_DIR" -name "task-*.json" -newermt "$DATE" -exec cat {} \; | \
  jq -r 'select(.status == "error") | .error' | \
  sort | uniq -c | sort -rn | head -10
```

### 2. パフォーマンス分析

```bash
#!/bin/bash
# analyze-performance.sh

BASE_DIR="${1:-.}"
LOG_DIR="$BASE_DIR/.pm-orchestrator/logs"
DATE="${2:-$(date +%Y-%m-%d)}"

echo "Performance analysis for $DATE..."

# サブエージェント別の平均実行時間
find "$LOG_DIR" -name "task-*.json" -newermt "$DATE" -exec cat {} \; | \
  jq -r '.subagentResults[] | "\(.name) \(.executionTime)"' | \
  awk '{sum[$1]+=$2; count[$1]++} END {for (name in sum) print name, sum[name]/count[name]}' | \
  sort -k2 -rn

echo ""
echo "Slowest tasks:"

find "$LOG_DIR" -name "task-*.json" -newermt "$DATE" -exec cat {} \; | \
  jq -r '"\(.executionTime) \(.taskId) \(.userInput)"' | \
  sort -rn | head -10
```

### 3. トレンド分析

```bash
#!/bin/bash
# analyze-trends.sh

BASE_DIR="${1:-.}"
DAYS="${2:-7}"

echo "Trend analysis for last $DAYS days..."

for i in $(seq 0 $((DAYS-1))); do
  DATE=$(date -d "$i days ago" +%Y-%m-%d)
  METRICS_FILE="$BASE_DIR/.pm-orchestrator/metrics/daily-$DATE.json"

  if [ -f "$METRICS_FILE" ]; then
    SUCCESS_RATE=$(jq -r '.successRate' "$METRICS_FILE")
    AVG_TIME=$(jq -r '.avgExecutionTime' "$METRICS_FILE")
    echo "$DATE: Success Rate: $SUCCESS_RATE%, Avg Time: ${AVG_TIME}ms"
  fi
done
```

---

## 自動化

### Systemd Service（Linux）

**pm-orchestrator-monitor.service:**

```ini
[Unit]
Description=PM Orchestrator Monitoring Service
After=network.target

[Service]
Type=simple
User=pm-orchestrator
WorkingDirectory=/path/to/pm-orchestrator
ExecStart=/usr/bin/node /path/to/pm-orchestrator-exporter.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**有効化:**
```bash
sudo systemctl enable pm-orchestrator-monitor
sudo systemctl start pm-orchestrator-monitor
sudo systemctl status pm-orchestrator-monitor
```

### Docker Compose

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana-data:/var/lib/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

  pm-orchestrator-exporter:
    build: .
    ports:
      - "9100:9100"
    volumes:
      - /path/to/project:/app/project
    environment:
      - PM_ORCHESTRATOR_BASE_DIR=/app/project

volumes:
  prometheus-data:
  grafana-data:
```

**起動:**
```bash
docker-compose up -d
```

---

## まとめ

モニタリング設定を適切に行うことで：

1. **早期問題検出**: エラー率や実行時間の異常を即座に検出
2. **パフォーマンス最適化**: ボトルネックを特定して改善
3. **ビジネスインサイト**: サブエージェント使用傾向を分析
4. **信頼性向上**: アラートによる迅速な対応

---

## 関連ドキュメント

- [ユーザーガイド](../user-guide.md)
- [開発者ガイド](../developer-guide.md)
- [ロールバックプラン](./rollback.md)
- [マイグレーションスクリプト](../../scripts/migrate.sh)
