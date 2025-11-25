/**
 * ContextManager - コンテキスト管理クラス
 * 
 * SharedContextのラッパーとして、より高レベルなコンテキスト管理機能を提供。
 * PM Orchestratorから使いやすいAPIを提供。
 * 
 * Requirements:
 * - Requirement 10: コンテキスト共有機構
 */

import { SharedContext } from './SharedContext';
import * as fs from 'fs';

/**
 * サブエージェント実行コンテキスト
 */
export interface SubagentExecutionContext {
  subagentName: string;
  taskId: string;
  userInput: string;
  previousResults?: any[];
  filesModified?: string[];
  environmentInfo?: {
    cwd?: string;
    branch?: string;
    lastCommit?: string;
  };
}

/**
 * ContextManagerクラス
 * 
 * PM Orchestratorから使用するためのコンテキスト管理機構。
 */
export class ContextManager {
  private sharedContext: SharedContext;

  constructor(options?: { maxCacheSize?: number; defaultTTL?: number }) {
    this.sharedContext = new SharedContext(options);
  }

  /**
   * サブエージェント実行コンテキストを設定
   */
  setExecutionContext(context: SubagentExecutionContext): void {
    this.sharedContext.set(
      `execution:${context.taskId}:${context.subagentName}`,
      context,
      {
        source: 'pm-orchestrator',
        tags: ['execution', context.subagentName],
        ttl: 24 * 60 * 60 * 1000 // 24時間
      }
    );
  }

  /**
   * サブエージェント実行コンテキストを取得
   */
  getExecutionContext(taskId: string, subagentName: string): SubagentExecutionContext | undefined {
    return this.sharedContext.get(`execution:${taskId}:${subagentName}`);
  }

  /**
   * サブエージェントの結果を保存
   */
  saveSubagentResult(taskId: string, subagentName: string, result: any): void {
    this.sharedContext.set(
      `result:${taskId}:${subagentName}`,
      result,
      {
        source: subagentName,
        tags: ['result', subagentName, taskId],
        ttl: 24 * 60 * 60 * 1000 // 24時間
      }
    );
  }

  /**
   * 前のサブエージェントの結果を全て取得
   */
  getPreviousResults(taskId: string): any[] {
    return this.sharedContext.findByTag(taskId);
  }

  /**
   * 特定のサブエージェントの結果を取得
   */
  getSubagentResult(taskId: string, subagentName: string): any | undefined {
    return this.sharedContext.get(`result:${taskId}:${subagentName}`);
  }

  /**
   * ファイルをキャッシュに追加
   */
  cacheFile(filePath: string): string | undefined {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.sharedContext.cacheFile(filePath, content);
      return content;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * キャッシュからファイルを取得
   */
  getCachedFile(filePath: string): string | undefined {
    // キャッシュ検証
    if (!this.sharedContext.validateFileCache(filePath)) {
      // キャッシュが無効なら再読み込み
      return this.cacheFile(filePath);
    }
    return this.sharedContext.getCachedFile(filePath);
  }

  /**
   * 複数ファイルを一括キャッシュ
   */
  cacheFiles(filePaths: string[]): Map<string, string> {
    const cached = new Map<string, string>();
    for (const filePath of filePaths) {
      const content = this.cacheFile(filePath);
      if (content) {
        cached.set(filePath, content);
      }
    }
    return cached;
  }

  /**
   * タスク実行に必要な全コンテキストを準備
   */
  prepareTaskContext(taskId: string, subagentName: string, userInput: string, previousSubagents: string[]): SubagentExecutionContext {
    // 前のサブエージェントの結果を収集
    const previousResults = previousSubagents.map(name => 
      this.getSubagentResult(taskId, name)
    ).filter(result => result !== undefined);

    // 環境情報を収集
    const environmentInfo = this.collectEnvironmentInfo();

    // 実行コンテキストを作成
    const context: SubagentExecutionContext = {
      subagentName,
      taskId,
      userInput,
      previousResults,
      environmentInfo
    };

    // コンテキストを保存
    this.setExecutionContext(context);

    return context;
  }

  /**
   * 環境情報を収集
   */
  private collectEnvironmentInfo(): SubagentExecutionContext['environmentInfo'] {
    try {
      const { execSync } = require('child_process');
      return {
        cwd: process.cwd(),
        branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim(),
        lastCommit: execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
      };
    } catch (error) {
      return {
        cwd: process.cwd()
      };
    }
  }

  /**
   * タスク完了後のクリーンアップ
   */
  cleanupTask(taskId: string): void {
    // タスクIDでタグ付けされた全データを削除
    const results = this.sharedContext.findByTag(taskId);
    for (const result of results) {
      // 個別削除（実装省略、必要に応じて追加）
    }
  }

  /**
   * 統計情報を取得
   */
  getStats(): { storeSize: number; fileCacheSize: number } {
    return this.sharedContext.getStats();
  }

  /**
   * 全データをクリア
   */
  clear(): void {
    this.sharedContext.clear();
  }
}
