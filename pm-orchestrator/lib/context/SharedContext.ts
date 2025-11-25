/**
 * SharedContext - コンテキスト共有機構
 * 
 * サブエージェント間でコンテキスト情報を共有するための基盤クラス。
 * データのライフサイクル管理、キャッシュ、サニタイゼーションを提供。
 * 
 * Requirements:
 * - Requirement 10: コンテキスト共有機構
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * コンテキストデータの型定義
 */
export interface ContextData {
  key: string;
  value: any;
  timestamp: number;
  ttl?: number; // Time To Live (ミリ秒)
  metadata?: {
    source?: string; // どのサブエージェントが作成したか
    tags?: string[]; // 検索用タグ
    sensitive?: boolean; // 機密情報フラグ
  };
}

/**
 * ファイルキャッシュエントリ
 */
export interface FileCacheEntry {
  path: string;
  content: string;
  hash: string;
  timestamp: number;
  accessCount: number;
}

/**
 * SharedContextクラス
 * 
 * サブエージェント間のコンテキスト共有を管理。
 */
export class SharedContext {
  private store: Map<string, ContextData>;
  private fileCache: Map<string, FileCacheEntry>;
  private readonly maxCacheSize: number;
  private readonly defaultTTL: number;

  constructor(options?: { maxCacheSize?: number; defaultTTL?: number }) {
    this.store = new Map();
    this.fileCache = new Map();
    this.maxCacheSize = options?.maxCacheSize || 100;
    this.defaultTTL = options?.defaultTTL || 60 * 60 * 1000; // 1時間
  }

  /**
   * コンテキストデータを設定
   */
  set(key: string, value: any, options?: { ttl?: number; source?: string; tags?: string[]; sensitive?: boolean }): void {
    // サニタイゼーション
    const sanitizedValue = options?.sensitive ? this.sanitize(value) : value;

    const data: ContextData = {
      key,
      value: sanitizedValue,
      timestamp: Date.now(),
      ttl: options?.ttl || this.defaultTTL,
      metadata: {
        source: options?.source,
        tags: options?.tags,
        sensitive: options?.sensitive
      }
    };

    this.store.set(key, data);
    this.cleanExpiredData();
  }

  /**
   * コンテキストデータを取得
   */
  get(key: string): any | undefined {
    const data = this.store.get(key);
    if (!data) return undefined;

    // TTLチェック
    if (data.ttl && Date.now() - data.timestamp > data.ttl) {
      this.store.delete(key);
      return undefined;
    }

    return data.value;
  }

  /**
   * タグでコンテキストデータを検索
   */
  findByTag(tag: string): any[] {
    const results: any[] = [];
    for (const data of this.store.values()) {
      if (data.metadata?.tags?.includes(tag)) {
        // TTLチェック
        if (!data.ttl || Date.now() - data.timestamp <= data.ttl) {
          results.push(data.value);
        }
      }
    }
    return results;
  }

  /**
   * ソースでコンテキストデータを検索
   */
  findBySource(source: string): any[] {
    const results: any[] = [];
    for (const data of this.store.values()) {
      if (data.metadata?.source === source) {
        // TTLチェック
        if (!data.ttl || Date.now() - data.timestamp <= data.ttl) {
          results.push(data.value);
        }
      }
    }
    return results;
  }

  /**
   * ファイルをキャッシュに追加
   */
  cacheFile(filePath: string, content: string): void {
    // ファイル内容のハッシュ計算
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // キャッシュサイズ制限
    if (this.fileCache.size >= this.maxCacheSize) {
      this.evictLRU();
    }

    this.fileCache.set(filePath, {
      path: filePath,
      content,
      hash,
      timestamp: Date.now(),
      accessCount: 0
    });
  }

  /**
   * ファイルキャッシュから取得
   */
  getCachedFile(filePath: string): string | undefined {
    const entry = this.fileCache.get(filePath);
    if (!entry) return undefined;

    // アクセスカウント更新
    entry.accessCount++;
    entry.timestamp = Date.now();

    return entry.content;
  }

  /**
   * ファイルキャッシュの検証
   */
  validateFileCache(filePath: string): boolean {
    const entry = this.fileCache.get(filePath);
    if (!entry) return false;

    try {
      const currentContent = fs.readFileSync(filePath, 'utf-8');
      const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');
      return entry.hash === currentHash;
    } catch (error) {
      // ファイルが存在しない場合はキャッシュを削除
      this.fileCache.delete(filePath);
      return false;
    }
  }

  /**
   * 期限切れデータのクリーンアップ
   */
  private cleanExpiredData(): void {
    const now = Date.now();
    for (const [key, data] of this.store.entries()) {
      if (data.ttl && now - data.timestamp > data.ttl) {
        this.store.delete(key);
      }
    }
  }

  /**
   * LRU（Least Recently Used）アルゴリズムでキャッシュエビクション
   */
  private evictLRU(): void {
    let lruKey: string | undefined;
    let lruTimestamp = Infinity;
    let lruAccessCount = Infinity;

    for (const [key, entry] of this.fileCache.entries()) {
      // アクセス回数が少なく、タイムスタンプが古いものを優先
      if (entry.accessCount < lruAccessCount || 
          (entry.accessCount === lruAccessCount && entry.timestamp < lruTimestamp)) {
        lruKey = key;
        lruTimestamp = entry.timestamp;
        lruAccessCount = entry.accessCount;
      }
    }

    if (lruKey) {
      this.fileCache.delete(lruKey);
    }
  }

  /**
   * データサニタイゼーション
   */
  private sanitize(value: any): any {
    if (typeof value === 'string') {
      // 機密情報のパターンを削除
      return value
        .replace(/password[=:]\s*[^\s]+/gi, 'password=[REDACTED]')
        .replace(/token[=:]\s*[^\s]+/gi, 'token=[REDACTED]')
        .replace(/api[_-]?key[=:]\s*[^\s]+/gi, 'api_key=[REDACTED]')
        .replace(/secret[=:]\s*[^\s]+/gi, 'secret=[REDACTED]');
    } else if (typeof value === 'object' && value !== null) {
      const sanitized: any = Array.isArray(value) ? [] : {};
      for (const key in value) {
        if (key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('apikey')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(value[key]);
        }
      }
      return sanitized;
    }
    return value;
  }

  /**
   * 全データをクリア
   */
  clear(): void {
    this.store.clear();
    this.fileCache.clear();
  }

  /**
   * 統計情報を取得
   */
  getStats(): { storeSize: number; fileCacheSize: number } {
    return {
      storeSize: this.store.size,
      fileCacheSize: this.fileCache.size
    };
  }
}
