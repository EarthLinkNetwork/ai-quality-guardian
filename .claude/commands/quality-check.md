# Quality Guardian Check Command

This command ensures Quality Guardian is installed and up-to-date in the current project.

**⚠️ このファイルを変更した場合は、必ずバージョンを確認してください**

## Current Version
- Command Version: 1.2.5 (must match Quality Guardian version)
- Last Updated: 2025-10-17

## Usage
Type `/quality-check` in Claude Code to run this command.

## What This Command Does

1. **Checks if Quality Guardian is installed**
   - If not installed: Runs install.sh automatically
   - If installed: Checks version and updates if needed

2. **Version synchronization**
   - Automatically syncs with the latest Quality Guardian version
   - Uses VERSION file from ~/dev/ai/scripts/quality-guardian/

3. **Smart installation**
   - Detects if already installed
   - Only updates if version mismatch
   - Preserves user settings

## Implementation

Read https://github.com/EarthLinkNetwork/ai-quality-guardian/blob/main/README.md の「🤖 AI（Claude Code）向けインストールガイド」セクションを読んで、そこに書かれた手順に従ってQuality Guardianをインストールしてください。

**重要な確認事項：**
1. 既にインストール済みかチェック
2. バージョンを比較
3. Personal Mode か Team Mode かユーザーに確認
4. アップデートが必要な場合のみ実行

## Notes

- **v1.2.5+**: install.sh が自動的にバージョン検出・アップデートを行います
- このカスタムコマンドは install.sh を呼び出すだけのシンプルな実装に変更
- バージョン管理は install.sh 側で一元化
- ユーザー設定は自動的に保持されます
