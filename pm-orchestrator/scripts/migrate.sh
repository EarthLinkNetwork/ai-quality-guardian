#!/bin/bash
set -e

# PM Orchestrator Enhancement - Migration Script
# 既存システムから新システムへの移行

echo "==========================================="
echo "PM Orchestrator Enhancement - Migration"
echo "==========================================="
echo ""

# 色の定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ベースディレクトリ
BASE_DIR="${1:-.}"
BACKUP_DIR="$BASE_DIR/.pm-orchestrator-backup-$(date +%Y%m%d%H%M%S)"

echo "${YELLOW}[INFO]${NC} Base directory: $BASE_DIR"
echo "${YELLOW}[INFO]${NC} Backup directory: $BACKUP_DIR"
echo ""

# Step 1: バックアップディレクトリ作成
echo "${YELLOW}[STEP 1]${NC} Creating backup directory..."
mkdir -p "$BACKUP_DIR"
echo "${GREEN}✓${NC} Backup directory created"
echo ""

# Step 2: 既存設定のバックアップ
echo "${YELLOW}[STEP 2]${NC} Backing up existing configuration..."

if [ -d "$BASE_DIR/.pm-orchestrator" ]; then
  echo "  Backing up .pm-orchestrator/..."
  cp -r "$BASE_DIR/.pm-orchestrator" "$BACKUP_DIR/"
  echo "${GREEN}✓${NC} Backed up .pm-orchestrator/"
fi

if [ -f "$BASE_DIR/.pm-orchestrator-config.json" ]; then
  echo "  Backing up .pm-orchestrator-config.json..."
  cp "$BASE_DIR/.pm-orchestrator-config.json" "$BACKUP_DIR/"
  echo "${GREEN}✓${NC} Backed up .pm-orchestrator-config.json"
fi

echo ""

# Step 3: 新しいディレクトリ構造の作成
echo "${YELLOW}[STEP 3]${NC} Creating new directory structure..."

mkdir -p "$BASE_DIR/.pm-orchestrator/logs"
mkdir -p "$BASE_DIR/.pm-orchestrator/metrics"
mkdir -p "$BASE_DIR/.pm-orchestrator/cache"
mkdir -p "$BASE_DIR/.pm-orchestrator/workflows"

echo "${GREEN}✓${NC} Created directory structure:"
echo "  - .pm-orchestrator/logs/"
echo "  - .pm-orchestrator/metrics/"
echo "  - .pm-orchestrator/cache/"
echo "  - .pm-orchestrator/workflows/"
echo ""

# Step 4: 既存ログの移行
echo "${YELLOW}[STEP 4]${NC} Migrating existing logs..."

if [ -d "$BACKUP_DIR/.pm-orchestrator/logs" ]; then
  echo "  Copying logs..."
  cp -r "$BACKUP_DIR/.pm-orchestrator/logs/"* "$BASE_DIR/.pm-orchestrator/logs/" 2>/dev/null || true
  echo "${GREEN}✓${NC} Logs migrated"
else
  echo "  ${YELLOW}No existing logs found${NC}"
fi

echo ""

# Step 5: 設定ファイルの移行
echo "${YELLOW}[STEP 5]${NC} Migrating configuration..."

if [ -f "$BACKUP_DIR/.pm-orchestrator-config.json" ]; then
  echo "  Converting old config format to new format..."

  # 旧形式の設定を読み込み、新形式に変換
  cat > "$BASE_DIR/.pm-orchestrator/config.json" << 'EOF'
{
  "version": "2.0.0",
  "baseDir": ".",
  "logging": {
    "enabled": true,
    "level": "info",
    "outputDir": ".pm-orchestrator/logs"
  },
  "metrics": {
    "enabled": true,
    "collectInterval": "daily",
    "outputDir": ".pm-orchestrator/metrics"
  },
  "workflow": {
    "defaultTimeout": 3600000,
    "maxConcurrency": 3,
    "retryOnError": true,
    "rollbackOnFailure": false
  },
  "subagents": {
    "rule-checker": { "enabled": true },
    "code-analyzer": { "enabled": true },
    "designer": { "enabled": true },
    "implementer": { "enabled": true },
    "tester": { "enabled": true },
    "qa": { "enabled": true },
    "cicd-engineer": { "enabled": true },
    "reporter": { "enabled": true }
  }
}
EOF

  echo "${GREEN}✓${NC} Configuration migrated"
else
  echo "  Creating default configuration..."

  cat > "$BASE_DIR/.pm-orchestrator/config.json" << 'EOF'
{
  "version": "2.0.0",
  "baseDir": ".",
  "logging": {
    "enabled": true,
    "level": "info",
    "outputDir": ".pm-orchestrator/logs"
  },
  "metrics": {
    "enabled": true,
    "collectInterval": "daily",
    "outputDir": ".pm-orchestrator/metrics"
  },
  "workflow": {
    "defaultTimeout": 3600000,
    "maxConcurrency": 3,
    "retryOnError": true,
    "rollbackOnFailure": false
  },
  "subagents": {
    "rule-checker": { "enabled": true },
    "code-analyzer": { "enabled": true },
    "designer": { "enabled": true },
    "implementer": { "enabled": true },
    "tester": { "enabled": true },
    "qa": { "enabled": true },
    "cicd-engineer": { "enabled": true },
    "reporter": { "enabled": true }
  }
}
EOF

  echo "${GREEN}✓${NC} Default configuration created"
fi

echo ""

# Step 6: ワークフロー設定の作成
echo "${YELLOW}[STEP 6]${NC} Creating default workflows..."

cat > "$BASE_DIR/.pm-orchestrator/workflows/default.yml" << 'EOF'
workflows:
  - name: "PR Review Response"
    pattern: "pr_review_response"
    description: "PRレビュー対応ワークフロー"
    subagents:
      - rule-checker
      - implementer
      - qa
      - reporter
    options:
      parallel: false
      timeout: 3600000

  - name: "Quality Check"
    pattern: "quality_check"
    description: "品質チェックワークフロー"
    subagents:
      - qa
      - reporter
    options:
      parallel: true
      timeout: 600000

  - name: "Version Update"
    pattern: "version_update"
    description: "バージョン更新ワークフロー"
    subagents:
      - rule-checker
      - implementer
      - qa
      - reporter
    options:
      parallel: false
      timeout: 1800000

  - name: "Complex Implementation"
    pattern: "complex_implementation"
    description: "複雑な実装ワークフロー"
    subagents:
      - rule-checker
      - designer
      - implementer
      - tester
      - qa
      - reporter
    options:
      parallel: false
      timeout: 7200000
EOF

echo "${GREEN}✓${NC} Default workflows created"
echo ""

# Step 7: .gitignore の更新
echo "${YELLOW}[STEP 7]${NC} Updating .gitignore..."

if [ -f "$BASE_DIR/.gitignore" ]; then
  if ! grep -q ".pm-orchestrator" "$BASE_DIR/.gitignore"; then
    echo "" >> "$BASE_DIR/.gitignore"
    echo "# PM Orchestrator Enhancement" >> "$BASE_DIR/.gitignore"
    echo ".pm-orchestrator/logs/" >> "$BASE_DIR/.gitignore"
    echo ".pm-orchestrator/metrics/" >> "$BASE_DIR/.gitignore"
    echo ".pm-orchestrator/cache/" >> "$BASE_DIR/.gitignore"
    echo "${GREEN}✓${NC} .gitignore updated"
  else
    echo "  ${YELLOW}.pm-orchestrator already in .gitignore${NC}"
  fi
else
  echo "  ${YELLOW}No .gitignore found${NC}"
fi

echo ""

# Step 8: パーミッション設定
echo "${YELLOW}[STEP 8]${NC} Setting permissions..."

chmod -R 755 "$BASE_DIR/.pm-orchestrator"
chmod -R 644 "$BASE_DIR/.pm-orchestrator/config.json"
chmod -R 644 "$BASE_DIR/.pm-orchestrator/workflows/"*

echo "${GREEN}✓${NC} Permissions set"
echo ""

# Step 9: 検証
echo "${YELLOW}[STEP 9]${NC} Validating migration..."

SUCCESS=true

if [ ! -d "$BASE_DIR/.pm-orchestrator/logs" ]; then
  echo "${RED}✗${NC} logs/ directory not found"
  SUCCESS=false
fi

if [ ! -d "$BASE_DIR/.pm-orchestrator/metrics" ]; then
  echo "${RED}✗${NC} metrics/ directory not found"
  SUCCESS=false
fi

if [ ! -f "$BASE_DIR/.pm-orchestrator/config.json" ]; then
  echo "${RED}✗${NC} config.json not found"
  SUCCESS=false
fi

if [ ! -f "$BASE_DIR/.pm-orchestrator/workflows/default.yml" ]; then
  echo "${RED}✗${NC} default.yml not found"
  SUCCESS=false
fi

if [ "$SUCCESS" = true ]; then
  echo "${GREEN}✓${NC} Migration validation passed"
else
  echo "${RED}✗${NC} Migration validation failed"
  exit 1
fi

echo ""

# 完了メッセージ
echo "==========================================="
echo "${GREEN}Migration completed successfully!${NC}"
echo "==========================================="
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "1. Review the new configuration: $BASE_DIR/.pm-orchestrator/config.json"
echo "2. Review the default workflows: $BASE_DIR/.pm-orchestrator/workflows/default.yml"
echo "3. Test the new system: pm-orchestrator 'Run quality checks'"
echo "4. If everything works, you can delete the backup: rm -rf $BACKUP_DIR"
echo ""
echo "For rollback instructions, see: docs/deployment/rollback.md"
echo ""
