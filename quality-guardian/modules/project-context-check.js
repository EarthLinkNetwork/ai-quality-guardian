#!/usr/bin/env node

/**
 * プロジェクトコンテキストチェッカー
 * 別プロジェクトでのquality-guardian操作を防止
 *
 * MUST Rule 6の構造的な問題への対策：
 * - AIはシステムプロンプトのルールを守らないことがある
 * - ルール追加では解決できない
 * - システム的な強制（pre-pushフック）が必要
 */

const { execSync } = require('child_process');
const path = require('path');

class ProjectContextChecker {
  constructor() {
    // このプロジェクトの正しいパスとリモートURL
    this.CORRECT_PROJECT_PATH = '/Users/masa/dev/ai/scripts';
    this.CORRECT_REMOTE_URL = 'git@github.com:EarthLinkNetwork/ai-quality-guardian.git';
    this.PROJECT_NAME = 'ai-quality-guardian';
  }

  /**
   * 現在のGitリポジトリのリモートURLを取得
   */
  getCurrentRemoteUrl() {
    try {
      const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf-8' }).trim();
      return remoteUrl;
    } catch (error) {
      console.error('❌ Cannot get remote URL');
      return null;
    }
  }

  /**
   * 現在のGitリポジトリのパスを取得（表示用）
   */
  getCurrentRepoPath() {
    try {
      const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
      return gitRoot;
    } catch (error) {
      console.error('❌ Not a git repository');
      return null;
    }
  }

  /**
   * リモートURLを正規化（httpsとsshの両方に対応）
   */
  normalizeRemoteUrl(url) {
    if (!url) return '';

    // git@github.com:user/repo.git → github.com/user/repo
    // https://github.com/user/repo.git → github.com/user/repo
    const normalized = url
      .replace(/^git@/, '')
      .replace(/^https?:\/\//, '')
      .replace(/:/, '/')
      .replace(/\.git$/, '')
      .toLowerCase();

    return normalized;
  }

  /**
   * 現在のプロジェクトが正しいか確認
   */
  checkProjectContext() {
    const currentRemoteUrl = this.getCurrentRemoteUrl();
    const currentPath = this.getCurrentRepoPath();

    if (!currentRemoteUrl) {
      console.error('❌ Cannot determine current repository remote URL');
      return false;
    }

    const normalizedCurrent = this.normalizeRemoteUrl(currentRemoteUrl);
    const normalizedCorrect = this.normalizeRemoteUrl(this.CORRECT_REMOTE_URL);

    if (normalizedCurrent !== normalizedCorrect) {
      this.displayError(currentPath, currentRemoteUrl);
      return false;
    }

    return true;
  }

  /**
   * エラーメッセージを表示
   */
  displayError(currentPath, currentRemoteUrl) {
    console.error('\n');
    console.error('🚫 ============================================================');
    console.error('🚫 BLOCKER: Wrong Project Context Detected');
    console.error('🚫 ============================================================');
    console.error('');
    console.error('❌ Current repository:');
    console.error(`   Path: ${currentPath}`);
    console.error(`   Remote: ${currentRemoteUrl}`);
    console.error('');
    console.error('✅ Expected repository:');
    console.error(`   Path: ${this.CORRECT_PROJECT_PATH}`);
    console.error(`   Remote: ${this.CORRECT_REMOTE_URL}`);
    console.error('');
    console.error('📋 Problem:');
    console.error('   You are trying to use quality-guardian commands');
    console.error('   in a DIFFERENT project.');
    console.error('');
    console.error('   This violates MUST Rule 6: AI Guardian Role Separation');
    console.error('   -別プロジェクトの問題を解決してはいけない');
    console.error('   - AI guardianとして分析すべき');
    console.error('');
    console.error('🔧 What to do:');
    console.error('   1. If you want to work on quality-guardian:');
    console.error(`      cd ${this.CORRECT_PROJECT_PATH}`);
    console.error('');
    console.error('   2. If you are in a different project:');
    console.error('      This project should have its OWN CLAUDE.md and rules.');
    console.error('      Do NOT use quality-guardian commands here.');
    console.error('');
    console.error('📖 Reference:');
    console.error('   .claude/CLAUDE.md - MUST Rule 6');
    console.error('   .claude/agents/project-context-guardian.md');
    console.error('');
    console.error('🚫 ============================================================');
    console.error('\n');
  }

  /**
   * メインチェック実行
   */
  run() {
    const isCorrectProject = this.checkProjectContext();

    if (!isCorrectProject) {
      process.exit(1); // pushをブロック
    }

    // 正しいプロジェクトの場合は何も表示せず正常終了
    process.exit(0);
  }
}

// 実行
const checker = new ProjectContextChecker();
checker.run();
