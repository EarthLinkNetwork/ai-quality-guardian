/**
 * File Cache Module
 *
 * TTLベースのファイル内容キャッシュ機能を提供します。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CacheEntry {
  content: string;
  hash: string;
  cachedAt: Date;
  expiresAt: Date;
  filePath: string;
}

export class FileCache {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number;

  constructor(defaultTTL: number = 300000) { // 5 minutes
    this.defaultTTL = defaultTTL;
  }

  /**
   * ファイル内容を取得（キャッシュまたは読み込み）
   */
  get(filePath: string, ttl?: number): string | null {
    const absolutePath = path.resolve(filePath);
    const cacheKey = this.getCacheKey(absolutePath);

    // キャッシュをチェック
    const cached = this.cache.get(cacheKey);

    if (cached && this.isValid(cached)) {
      // ファイルが変更されていないかチェック
      if (this.hasFileChanged(absolutePath, cached.hash)) {
        // 変更されている場合は再読み込み
        return this.load(absolutePath, ttl);
      }

      return cached.content;
    }

    // キャッシュにない、または期限切れの場合は読み込み
    return this.load(absolutePath, ttl);
  }

  /**
   * ファイルを読み込んでキャッシュ
   */
  load(filePath: string, ttl?: number): string | null {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const hash = this.calculateHash(content);
      const effectiveTTL = ttl ?? this.defaultTTL;

      const entry: CacheEntry = {
        content,
        hash,
        cachedAt: new Date(),
        expiresAt: new Date(Date.now() + effectiveTTL),
        filePath: absolutePath
      };

      const cacheKey = this.getCacheKey(absolutePath);
      this.cache.set(cacheKey, entry);

      return content;
    } catch (error) {
      console.error(`Failed to read file: ${absolutePath}`, error);
      return null;
    }
  }

  /**
   * キャッシュを無効化
   */
  invalidate(filePath: string): boolean {
    const absolutePath = path.resolve(filePath);
    const cacheKey = this.getCacheKey(absolutePath);
    return this.cache.delete(cacheKey);
  }

  /**
   * 全てのキャッシュをクリア
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 期限切れエントリをクリーンアップ
   */
  cleanup(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * キャッシュエントリが有効かチェック
   */
  private isValid(entry: CacheEntry): boolean {
    return entry.expiresAt > new Date();
  }

  /**
   * ファイルが変更されたかチェック
   */
  private hasFileChanged(filePath: string, cachedHash: string): boolean {
    if (!fs.existsSync(filePath)) {
      return true;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const currentHash = this.calculateHash(content);
      return currentHash !== cachedHash;
    } catch (error) {
      return true;
    }
  }

  /**
   * コンテンツのハッシュを計算
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * キャッシュキーを生成
   */
  private getCacheKey(filePath: string): string {
    return filePath;
  }

  /**
   * キャッシュサイズを取得
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * キャッシュ統計を取得
   */
  getStats(): {
    total: number;
    valid: number;
    expired: number;
    totalSize: number;
  } {
    const now = new Date();
    let valid = 0;
    let expired = 0;
    let totalSize = 0;

    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) {
        valid++;
      } else {
        expired++;
      }
      totalSize += entry.content.length;
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      totalSize
    };
  }

  /**
   * 複数ファイルを一括読み込み
   */
  loadMultiple(filePaths: string[], ttl?: number): Map<string, string> {
    const results = new Map<string, string>();

    for (const filePath of filePaths) {
      const content = this.get(filePath, ttl);
      if (content !== null) {
        results.set(filePath, content);
      }
    }

    return results;
  }

  /**
   * ファイルパターンに一致するファイルをキャッシュ
   */
  preload(directory: string, pattern: RegExp, ttl?: number): number {
    let loaded = 0;

    const loadDirectory = (dir: string): void => {
      if (!fs.existsSync(dir)) {
        return;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          loadDirectory(fullPath);
        } else if (pattern.test(entry.name)) {
          if (this.load(fullPath, ttl) !== null) {
            loaded++;
          }
        }
      }
    };

    loadDirectory(directory);
    return loaded;
  }
}
