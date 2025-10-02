#!/bin/bash

# ================================================================
# Quality Workflow Setup Script
# 品質保証ワークフロー自動導入スクリプト
# ================================================================
# Usage: bash ~/dev/ai/scripts/setup-quality-workflow.sh [--non-interactive]
# Run this script in your project root directory
# ================================================================

set -e

# Check for non-interactive mode
INTERACTIVE=true
if [ "$1" = "--non-interactive" ] || [ "$1" = "-n" ]; then
    INTERACTIVE=false
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if we're in a git repository
if [ ! -d .git ]; then
    print_error "This is not a git repository. Please run this script in your project root."
    exit 1
fi

print_info "Starting Quality Workflow Setup..."

# ================================================================
# Step 1: Create directory structure
# ================================================================

print_info "Creating directory structure..."
mkdir -p .claude
mkdir -p docs/guides

# ================================================================
# Step 2: Detect project type and tools
# ================================================================

print_info "Detecting project type..."

# Variables to store detected tools
TEST_COMMAND=""
LINT_COMMAND=""
TYPE_CHECK_COMMAND=""
BUILD_COMMAND=""
FORMAT_COMMAND=""
PROJECT_TYPE=""

# Node.js / JavaScript / TypeScript detection
if [ -f "package.json" ]; then
    PROJECT_TYPE="Node.js"
    print_info "Detected Node.js project"
    
    # Check for test commands
    if grep -q '"test"' package.json; then
        TEST_COMMAND="npm test"
    elif grep -q '"jest"' package.json; then
        TEST_COMMAND="npm run jest"
    elif [ -f "yarn.lock" ]; then
        TEST_COMMAND="yarn test"
    fi
    
    # Check for lint commands
    if grep -q '"lint"' package.json; then
        LINT_COMMAND="npm run lint"
    elif grep -q '"eslint"' package.json; then
        LINT_COMMAND="npm run eslint"
    fi
    
    # Check for TypeScript
    if [ -f "tsconfig.json" ]; then
        TYPE_CHECK_COMMAND="npx tsc --noEmit"
        if grep -q '"type-check"' package.json; then
            TYPE_CHECK_COMMAND="npm run type-check"
        fi
    fi
    
    # Check for format command
    if grep -q '"format"' package.json; then
        FORMAT_COMMAND="npm run format"
    elif grep -q '"prettier"' package.json; then
        FORMAT_COMMAND="npx prettier --write ."
    fi
    
    # Check for build command
    if grep -q '"build"' package.json; then
        BUILD_COMMAND="npm run build"
    fi

# Python detection
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "Pipfile" ]; then
    PROJECT_TYPE="Python"
    print_info "Detected Python project"
    
    # Test detection
    if [ -d "tests" ] || [ -d "test" ]; then
        if command -v pytest &> /dev/null; then
            TEST_COMMAND="pytest"
        elif command -v python -m pytest &> /dev/null; then
            TEST_COMMAND="python -m pytest"
        else
            TEST_COMMAND="python -m unittest discover"
        fi
    fi
    
    # Linter detection
    if command -v ruff &> /dev/null; then
        LINT_COMMAND="ruff check ."
        FORMAT_COMMAND="ruff format ."
    elif command -v flake8 &> /dev/null; then
        LINT_COMMAND="flake8"
    elif command -v pylint &> /dev/null; then
        LINT_COMMAND="pylint **/*.py"
    fi
    
    # Type checker detection
    if command -v mypy &> /dev/null; then
        TYPE_CHECK_COMMAND="mypy ."
    fi
    
    # Format detection (if not ruff)
    if [ -z "$FORMAT_COMMAND" ]; then
        if command -v black &> /dev/null; then
            FORMAT_COMMAND="black ."
        fi
    fi

# Ruby detection
elif [ -f "Gemfile" ]; then
    PROJECT_TYPE="Ruby"
    print_info "Detected Ruby project"
    
    # RSpec or Minitest
    if [ -d "spec" ]; then
        TEST_COMMAND="bundle exec rspec"
    elif [ -d "test" ]; then
        TEST_COMMAND="bundle exec rake test"
    fi
    
    # RuboCop
    if grep -q "rubocop" Gemfile; then
        LINT_COMMAND="bundle exec rubocop"
        FORMAT_COMMAND="bundle exec rubocop -a"
    fi

# Go detection
elif [ -f "go.mod" ]; then
    PROJECT_TYPE="Go"
    print_info "Detected Go project"
    
    TEST_COMMAND="go test ./..."
    BUILD_COMMAND="go build"
    
    if command -v golangci-lint &> /dev/null; then
        LINT_COMMAND="golangci-lint run"
    else
        LINT_COMMAND="go vet ./..."
    fi
    
    FORMAT_COMMAND="go fmt ./..."

# Rust detection
elif [ -f "Cargo.toml" ]; then
    PROJECT_TYPE="Rust"
    print_info "Detected Rust project"
    
    TEST_COMMAND="cargo test"
    BUILD_COMMAND="cargo build"
    LINT_COMMAND="cargo clippy -- -D warnings"
    FORMAT_COMMAND="cargo fmt"

# Java / Maven detection
elif [ -f "pom.xml" ]; then
    PROJECT_TYPE="Java (Maven)"
    print_info "Detected Java Maven project"
    
    TEST_COMMAND="mvn test"
    BUILD_COMMAND="mvn compile"
    LINT_COMMAND="mvn checkstyle:check"

# Java / Gradle detection
elif [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
    PROJECT_TYPE="Java (Gradle)"
    print_info "Detected Java Gradle project"
    
    TEST_COMMAND="./gradlew test"
    BUILD_COMMAND="./gradlew build"
    LINT_COMMAND="./gradlew check"

# PHP / Composer detection
elif [ -f "composer.json" ]; then
    PROJECT_TYPE="PHP"
    print_info "Detected PHP project"
    
    if [ -d "tests" ] || [ -d "test" ]; then
        if command -v phpunit &> /dev/null; then
            TEST_COMMAND="phpunit"
        else
            TEST_COMMAND="./vendor/bin/phpunit"
        fi
    fi
    
    if grep -q "phpcs" composer.json; then
        LINT_COMMAND="./vendor/bin/phpcs"
        FORMAT_COMMAND="./vendor/bin/phpcbf"
    fi

# C# / .NET detection
elif [ -f "*.csproj" ] || [ -f "*.sln" ]; then
    PROJECT_TYPE=".NET/C#"
    print_info "Detected .NET/C# project"
    
    TEST_COMMAND="dotnet test"
    BUILD_COMMAND="dotnet build"
    FORMAT_COMMAND="dotnet format"

else
    PROJECT_TYPE="Unknown"
    print_warning "Could not detect project type. You'll need to configure commands manually."
fi

# ================================================================
# Step 3: Interactive command confirmation
# ================================================================

print_info "Detected commands for $PROJECT_TYPE project:"
echo ""
echo "Test Command:       ${TEST_COMMAND:-Not detected}"
echo "Lint Command:       ${LINT_COMMAND:-Not detected}"
echo "Type Check Command: ${TYPE_CHECK_COMMAND:-Not detected}"
echo "Format Command:     ${FORMAT_COMMAND:-Not detected}"
echo "Build Command:      ${BUILD_COMMAND:-Not detected}"
echo ""

if [ "$INTERACTIVE" = true ]; then
    read -p "Do you want to customize these commands? (y/N): " customize
else
    customize="N"
fi
if [[ $customize =~ ^[Yy]$ ]]; then
    read -p "Test command [${TEST_COMMAND}]: " custom_test
    TEST_COMMAND=${custom_test:-$TEST_COMMAND}
    
    read -p "Lint command [${LINT_COMMAND}]: " custom_lint
    LINT_COMMAND=${custom_lint:-$LINT_COMMAND}
    
    read -p "Type check command [${TYPE_CHECK_COMMAND}]: " custom_type
    TYPE_CHECK_COMMAND=${custom_type:-$TYPE_CHECK_COMMAND}
    
    read -p "Format command [${FORMAT_COMMAND}]: " custom_format
    FORMAT_COMMAND=${custom_format:-$FORMAT_COMMAND}
    
    read -p "Build command [${BUILD_COMMAND}]: " custom_build
    BUILD_COMMAND=${custom_build:-$BUILD_COMMAND}
fi

# ================================================================
# Step 3.5: Add skip test detection command
# ================================================================

# Check for test framework and add skip detection
SKIP_TEST_COMMAND=""
if [ "$PROJECT_TYPE" = "Node.js" ] || [ "$PROJECT_TYPE" = "TypeScript" ]; then
    # Jest/Mocha style skip detection
    SKIP_TEST_COMMAND="grep -r '\\.skip\\|test\\.skip\\|it\\.skip\\|describe\\.skip\\|xit\\|xtest\\|xdescribe' --include='*.test.*' --include='*.spec.*' --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null | wc -l"
elif [ "$PROJECT_TYPE" = "Python" ]; then
    # pytest style skip detection
    SKIP_TEST_COMMAND="grep -r '@pytest\\.mark\\.skip\\|@skip\\|pytest\\.skip' --include='*.py' tests/ test/ 2>/dev/null | wc -l"
elif [ "$PROJECT_TYPE" = "Ruby" ]; then
    # RSpec style skip detection
    SKIP_TEST_COMMAND="grep -r '\\bxit\\b\\|\\bxdescribe\\b\\|\\bxcontext\\b\\|skip:' --include='*_spec.rb' spec/ 2>/dev/null | wc -l"
elif [ "$PROJECT_TYPE" = "Go" ]; then
    # Go test skip detection
    SKIP_TEST_COMMAND="grep -r 't\\.Skip\\|t\\.SkipNow' --include='*_test.go' . 2>/dev/null | wc -l"
elif [ "$PROJECT_TYPE" = "Rust" ]; then
    # Rust test skip detection
    SKIP_TEST_COMMAND="grep -r '#\\[ignore\\]' --include='*.rs' . 2>/dev/null | wc -l"
elif [ "$PROJECT_TYPE" = "Java (Maven)" ] || [ "$PROJECT_TYPE" = "Java (Gradle)" ]; then
    # JUnit skip detection
    SKIP_TEST_COMMAND="grep -r '@Ignore\\|@Disabled' --include='*.java' . 2>/dev/null | wc -l"
fi

# ================================================================
# Step 4: Create CLAUDE.md with project-specific commands
# ================================================================

# Check if CLAUDE.md exists and handle safely
if [ -f .claude/CLAUDE.md ]; then
    # Check if our quality workflow section already exists
    if grep -q "# Quality Workflow Configuration" .claude/CLAUDE.md; then
        print_info "Quality workflow section already exists in .claude/CLAUDE.md"
        print_info "Skipping CLAUDE.md modification to preserve existing content"
        CLAUDE_MD_SKIPPED=true
    else
        print_warning "Existing .claude/CLAUDE.md found. Adding quality workflow section"
        # Backup the original
        cp .claude/CLAUDE.md .claude/CLAUDE.md.backup
        # Add separator and our section
        echo "" >> .claude/CLAUDE.md
        echo "# ================================================================" >> .claude/CLAUDE.md
        echo "# Quality Workflow Configuration (Auto-generated)" >> .claude/CLAUDE.md
        echo "# ================================================================" >> .claude/CLAUDE.md
        CLAUDE_MD_SKIPPED=false
    fi
else
    print_info "Creating new .claude/CLAUDE.md..."
    CLAUDE_MD_SKIPPED=false
fi

# Only write the content if we're not skipping
if [ "$CLAUDE_MD_SKIPPED" = "false" ]; then
    cat >> .claude/CLAUDE.md << EOF
# Claude Code Quality Workflow Configuration

This project uses an automated quality assurance workflow.
このプロジェクトは自動品質保証ワークフローを使用します。

## Project Information

- **Project Type**: $PROJECT_TYPE
- **Setup Date**: $(date +"%Y-%m-%d")
- **Setup Script Version**: 1.0.0

## Quality Check Commands

このプロジェクトで使用する品質チェックコマンド:

\`\`\`bash
# Run all quality checks
$([ -n "$TEST_COMMAND" ] && echo "# Test: $TEST_COMMAND")
$([ -n "$LINT_COMMAND" ] && echo "# Lint: $LINT_COMMAND")
$([ -n "$TYPE_CHECK_COMMAND" ] && echo "# Type Check: $TYPE_CHECK_COMMAND")
$([ -n "$FORMAT_COMMAND" ] && echo "# Format: $FORMAT_COMMAND")
$([ -n "$BUILD_COMMAND" ] && echo "# Build: $BUILD_COMMAND")
\`\`\`

## Workflow Rules

### 必須ワークフロー

1. **実装フェーズ**: task-executor でタスクを実行
2. **品質チェック**: quality-fixer で品質問題を修正
3. **承認基準**: 全テスト成功時のみ approved: true
4. **コミット**: approved: true 後にコミット実行

### quality-fixer 判定基準

\`\`\`yaml
approved: true の条件:
$([ -n "$TEST_COMMAND" ] && echo "  - $TEST_COMMAND: 全テスト成功")
$([ -n "$LINT_COMMAND" ] && echo "  - $LINT_COMMAND: エラー0")
$([ -n "$TYPE_CHECK_COMMAND" ] && echo "  - $TYPE_CHECK_COMMAND: エラー0")
$([ -n "$BUILD_COMMAND" ] && echo "  - $BUILD_COMMAND: ビルド成功")
  - skipされたテスト: 0個（test.skip, xit, xdescribe等は技術的負債）

approved: false の条件:
  - 上記のいずれかが失敗
  - skipされたテストが存在する
  - 部分的な修正のみ
  - エラーが残存
\`\`\`

### ⚠️ Skipped Tests Policy

**skipされたテストは技術的負債です:**
- \`test.skip\`, \`it.skip\`, \`describe.skip\` は使用禁止
- \`xit\`, \`xtest\`, \`xdescribe\` は使用禁止
- 一時的にskipする必要がある場合は、理由とTODOコメントを必須とする
- skipされたテストがある場合、quality-fixerは必ず修正または削除する

### 禁止事項

- ❌ テスト失敗があるままのコミット
- ❌ quality-fixer をスキップしての実装完了
- ❌ 部分的修正での approved: true

## Implementation Guidelines

### タスク実行時の品質サイクル

1. タスク実装 (task-executor)
2. 品質チェック実行 (quality-fixer)
3. 失敗があれば修正
4. 全チェック成功まで 2-3 を繰り返し
5. approved: true 確認後コミット

### 品質チェック実行方法

\`\`\`bash
# Individual checks
$([ -n "$TEST_COMMAND" ] && echo "$TEST_COMMAND  # Run tests")
$([ -n "$LINT_COMMAND" ] && echo "$LINT_COMMAND  # Check code style")
$([ -n "$TYPE_CHECK_COMMAND" ] && echo "$TYPE_CHECK_COMMAND  # Check types")
$([ -n "$BUILD_COMMAND" ] && echo "$BUILD_COMMAND  # Build project")
\`\`\`

## Notes for AI Assistant

When using Claude Code or other AI assistants, ensure:

1. Always run quality checks after implementation
2. Never approve with failing tests
3. Fix all issues before marking as complete
4. Document any exceptions clearly

---

*This file was generated by setup-quality-workflow.sh*
*To update, run: bash ~/dev/ai/scripts/setup-quality-workflow.sh*
EOF
fi

if [ "$CLAUDE_MD_SKIPPED" = "true" ]; then
    print_success "CLAUDE.md preserved (existing content kept)"
else
    print_success "CLAUDE.md updated with quality workflow section"
fi

# ================================================================
# Step 5: Create sub-agents workflow guide
# ================================================================

print_info "Creating workflow guide..."

cat > docs/guides/quality-workflow.md << 'EOF'
# Quality Workflow Guide

## Overview

This project follows a strict quality assurance workflow to ensure code reliability and maintainability.

## Workflow Phases

### 1. Implementation Phase

- Write new code or modify existing code
- Focus on functionality first
- Ensure basic structure is correct

### 2. Quality Check Phase

Run quality checks using project-specific commands:
- Execute all tests
- Run linters and formatters
- Check type safety (if applicable)
- Verify build succeeds

### 3. Fix Phase

If any quality checks fail:
- Analyze the failure reason
- Fix root causes, not symptoms
- Re-run quality checks
- Repeat until all checks pass

### 4. Approval Phase

**Approval Criteria:**
- ✅ All tests passing
- ✅ No lint errors
- ✅ No type errors (if applicable)
- ✅ Build succeeds (if applicable)

**Only when ALL criteria are met:**
- Mark as `approved: true`
- Proceed to commit

### 5. Commit Phase

After approval:
- Stage all changes
- Create descriptive commit message
- Include what was fixed/implemented
- Reference any related issues

## For AI Assistants (Claude Code, GitHub Copilot, etc.)

### Required Behavior

When acting as `quality-fixer`:

1. **Always run actual commands** - Don't assume, execute and verify
2. **Check all quality aspects** - Tests, lint, types, build
3. **Fix completely** - Partial fixes are not acceptable
4. **Iterate until perfect** - Keep fixing until all checks pass
5. **Report honestly** - Only report `approved: true` when truly ready

### Example Quality Check Sequence

```bash
# 1. Run tests
[test command]
# If fails → fix issues → re-run

# 2. Run linter
[lint command]
# If fails → fix issues → re-run

# 3. Check types (if applicable)
[type check command]
# If fails → fix issues → re-run

# 4. Build (if applicable)
[build command]
# If fails → fix issues → re-run

# 5. Final verification
# Run all commands again to ensure everything passes

# 6. Report status
# approved: true (only if all pass)
# approved: false (if any failures remain)
```

## Common Issues and Solutions

### Test Failures
- Check test expectations match implementation
- Verify mock data is correct
- Ensure async operations are handled properly

### Lint Errors
- Follow project style guide
- Use auto-fix when available
- Check for unused variables/imports

### Type Errors
- Ensure all variables are properly typed
- Fix any `any` types with specific types
- Verify import statements are correct

### Build Errors
- Check dependencies are installed
- Verify import paths are correct
- Ensure configuration files are valid

## Emergency Procedures

If quality checks cannot be fixed:
1. Document the specific issue
2. Create a TODO comment in code
3. Open an issue for later resolution
4. Get human developer input

---

*This guide ensures consistent quality across all development work.*
EOF

print_success "Created docs/guides/quality-workflow.md"

# ================================================================
# Step 6: Create quality check runner script
# ================================================================

print_info "Creating quality check script..."

cat > .claude/run-quality-checks.sh << EOF
#!/bin/bash

# Quality Check Runner Script
# Generated on: $(date +"%Y-%m-%d")

set -e

echo "=========================================="
echo "Running Quality Checks for $PROJECT_TYPE Project"
echo "=========================================="
echo ""

FAILED=0

# Function to run a command and check result
run_check() {
    local name="\$1"
    local command="\$2"
    
    if [ -z "\$command" ]; then
        echo "⏭️  Skipping \$name (not configured)"
        return 0
    fi
    
    echo "🔍 Running \$name..."
    echo "   Command: \$command"
    
    if eval \$command; then
        echo "✅ \$name passed"
    else
        echo "❌ \$name failed"
        FAILED=1
    fi
    echo ""
}

# Check for skipped tests
check_skipped_tests() {
    echo "🔍 Checking for skipped tests..."
    
    local skip_count=0
    if [ "$PROJECT_TYPE" = "Node.js" ] || [ "$PROJECT_TYPE" = "TypeScript" ]; then
        skip_count=\$(grep -r '\\.skip\\|test\\.skip\\|it\\.skip\\|describe\\.skip\\|xit\\|xtest\\|xdescribe' --include='*.test.*' --include='*.spec.*' --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null | wc -l)
    elif [ "$PROJECT_TYPE" = "Python" ]; then
        skip_count=\$(grep -r '@pytest\\.mark\\.skip\\|@skip\\|pytest\\.skip' --include='*.py' tests/ test/ 2>/dev/null | wc -l)
    elif [ "$PROJECT_TYPE" = "Ruby" ]; then
        skip_count=\$(grep -r '\\bxit\\b\\|\\bxdescribe\\b\\|\\bxcontext\\b\\|skip:' --include='*_spec.rb' spec/ 2>/dev/null | wc -l)
    elif [ "$PROJECT_TYPE" = "Go" ]; then
        skip_count=\$(grep -r 't\\.Skip\\|t\\.SkipNow' --include='*_test.go' . 2>/dev/null | wc -l)
    elif [ "$PROJECT_TYPE" = "Rust" ]; then
        skip_count=\$(grep -r '#\\[ignore\\]' --include='*.rs' . 2>/dev/null | wc -l)
    elif [ "$PROJECT_TYPE" = "Java (Maven)" ] || [ "$PROJECT_TYPE" = "Java (Gradle)" ]; then
        skip_count=\$(grep -r '@Ignore\\|@Disabled' --include='*.java' . 2>/dev/null | wc -l)
    fi
    
    # Trim whitespace from skip_count
    skip_count=\$(echo \$skip_count | tr -d ' ')
    
    if [ "\$skip_count" -gt 0 ]; then
        echo "❌ Found \$skip_count skipped test(s)"
        echo "   Skipped tests are technical debt and must be fixed or removed"
        if [ "$PROJECT_TYPE" = "Node.js" ] || [ "$PROJECT_TYPE" = "TypeScript" ]; then
            echo "   Files with skipped tests:"
            grep -r '\\.skip\\|test\\.skip\\|it\\.skip\\|describe\\.skip\\|xit\\|xtest\\|xdescribe' --include='*.test.*' --include='*.spec.*' --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null | head -5
        fi
        FAILED=1
    else
        echo "✅ No skipped tests found"
    fi
    echo ""
}

# Run all checks
$([ -n "$TEST_COMMAND" ] && echo "run_check \"Tests\" \"$TEST_COMMAND\"")
$([ -n "$LINT_COMMAND" ] && echo "run_check \"Linter\" \"$LINT_COMMAND\"")
$([ -n "$TYPE_CHECK_COMMAND" ] && echo "run_check \"Type Check\" \"$TYPE_CHECK_COMMAND\"")
$([ -n "$FORMAT_COMMAND" ] && echo "# run_check \"Format\" \"$FORMAT_COMMAND\"  # Uncomment to auto-format")
$([ -n "$BUILD_COMMAND" ] && echo "run_check \"Build\" \"$BUILD_COMMAND\"")

# Always check for skipped tests
check_skipped_tests

echo "=========================================="
if [ \$FAILED -eq 0 ]; then
    echo "✅ All quality checks passed!"
    echo "Status: approved = true"
else
    echo "❌ Some quality checks failed"
    echo "Status: approved = false"
    echo ""
    echo "Please fix the issues and run again:"
    echo "  bash .claude/run-quality-checks.sh"
fi
echo "=========================================="

exit \$FAILED
EOF

chmod +x .claude/run-quality-checks.sh
print_success "Created .claude/run-quality-checks.sh"

# ================================================================
# Step 7: Optional Git hooks setup
# ================================================================

read -p "Do you want to set up Git pre-commit hooks? (y/N): " setup_hooks
if [[ $setup_hooks =~ ^[Yy]$ ]]; then
    print_info "Setting up Git hooks..."
    
    # Create pre-commit hook
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

echo "Running pre-commit quality checks..."

# Run the quality check script
if [ -f .claude/run-quality-checks.sh ]; then
    bash .claude/run-quality-checks.sh
    exit $?
else
    echo "Warning: Quality check script not found"
    echo "Run: bash ~/dev/ai/scripts/setup-quality-workflow.sh"
    exit 0
fi
EOF
    
    chmod +x .git/hooks/pre-commit
    print_success "Git pre-commit hook installed"
fi

# ================================================================
# Step 8: Create README section
# ================================================================

print_info "Creating README section..."

cat > .claude/README-QUALITY.md << EOF
# Quality Assurance Setup

This project has an automated quality workflow configured.

## Quick Start

Run all quality checks:
\`\`\`bash
bash .claude/run-quality-checks.sh
\`\`\`

## Available Commands

$([ -n "$TEST_COMMAND" ] && echo "- **Tests**: \`$TEST_COMMAND\`")
$([ -n "$LINT_COMMAND" ] && echo "- **Linter**: \`$LINT_COMMAND\`")
$([ -n "$TYPE_CHECK_COMMAND" ] && echo "- **Type Check**: \`$TYPE_CHECK_COMMAND\`")
$([ -n "$FORMAT_COMMAND" ] && echo "- **Format**: \`$FORMAT_COMMAND\`")
$([ -n "$BUILD_COMMAND" ] && echo "- **Build**: \`$BUILD_COMMAND\`")

## Workflow

1. Make changes to code
2. Run \`bash .claude/run-quality-checks.sh\`
3. Fix any issues
4. Repeat until all checks pass
5. Commit changes

## For AI Assistants

See \`.claude/CLAUDE.md\` for AI-specific instructions.

## Updating Configuration

To reconfigure quality checks:
\`\`\`bash
bash ~/dev/ai/scripts/setup-quality-workflow.sh
\`\`\`
EOF

print_success "Created .claude/README-QUALITY.md"

# ================================================================
# Step 9: Final summary
# ================================================================

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Quality Workflow Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "📁 Created files:"
echo "   - .claude/CLAUDE.md (AI instructions)"
echo "   - .claude/run-quality-checks.sh (test runner)"
echo "   - .claude/README-QUALITY.md (documentation)"
echo "   - docs/guides/quality-workflow.md (workflow guide)"
if [[ $setup_hooks =~ ^[Yy]$ ]]; then
    echo "   - .git/hooks/pre-commit (Git hook)"
fi
echo ""
echo "📋 Detected project type: $PROJECT_TYPE"
echo ""
echo "🚀 Next steps:"
echo "   1. Review .claude/CLAUDE.md for accuracy"
echo "   2. Test the setup: bash .claude/run-quality-checks.sh"
echo "   3. Commit these files to your repository"
echo ""
echo "💡 Tips:"
echo "   - AI assistants will now follow quality workflow automatically"
echo "   - Run quality checks before every commit"
echo "   - Update configuration anytime by re-running this script"
echo ""
echo "📖 For more information, see:"
echo "   - .claude/README-QUALITY.md"
echo "   - docs/guides/quality-workflow.md"
echo ""
print_success "Setup complete! Your project now has automated quality assurance."