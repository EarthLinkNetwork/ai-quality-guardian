/**
 * Context Store Module
 *
 * サブエージェント間のデータ共有機構とライフサイクル管理を提供します。
 */

export interface ContextData {
  [key: string]: any;
}

export interface ContextMetadata {
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  source: string;
}

export interface ContextEntry {
  data: ContextData;
  metadata: ContextMetadata;
}

export class ContextStore {
  private store: Map<string, ContextEntry> = new Map();

  /**
   * コンテキストを設定
   */
  set(key: string, data: ContextData, source: string, ttl?: number): void {
    const now = new Date();
    const expiresAt = ttl ? new Date(now.getTime() + ttl) : undefined;

    this.store.set(key, {
      data,
      metadata: {
        createdAt: now,
        updatedAt: now,
        expiresAt,
        source
      }
    });
  }

  /**
   * コンテキストを取得
   */
  get(key: string): ContextData | null {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // 有効期限チェック
    if (entry.metadata.expiresAt && entry.metadata.expiresAt < new Date()) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * コンテキストを更新
   */
  update(key: string, data: Partial<ContextData>, source: string): boolean {
    const entry = this.store.get(key);

    if (!entry) {
      return false;
    }

    entry.data = { ...entry.data, ...data };
    entry.metadata.updatedAt = new Date();
    entry.metadata.source = source;

    return true;
  }

  /**
   * コンテキストを削除
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * 全てのキーを取得
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * 特定のソースのコンテキストを取得
   */
  getBySource(source: string): Map<string, ContextData> {
    const result = new Map<string, ContextData>();

    for (const [key, entry] of this.store.entries()) {
      if (entry.metadata.source === source) {
        result.set(key, entry.data);
      }
    }

    return result;
  }

  /**
   * 期限切れエントリをクリーンアップ
   */
  cleanup(): number {
    const now = new Date();
    let removed = 0;

    for (const [key, entry] of this.store.entries()) {
      if (entry.metadata.expiresAt && entry.metadata.expiresAt < now) {
        this.store.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * 全てクリア
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * エントリ数を取得
   */
  size(): number {
    return this.store.size;
  }

  /**
   * コンテキストが存在するかチェック
   */
  has(key: string): boolean {
    const entry = this.store.get(key);

    if (!entry) {
      return false;
    }

    // 有効期限チェック
    if (entry.metadata.expiresAt && entry.metadata.expiresAt < new Date()) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * メタデータを取得
   */
  getMetadata(key: string): ContextMetadata | null {
    const entry = this.store.get(key);
    return entry ? entry.metadata : null;
  }

  /**
   * 名前空間でコンテキストをグループ化
   */
  getNamespace(namespace: string): Map<string, ContextData> {
    const result = new Map<string, ContextData>();
    const prefix = `${namespace}:`;

    for (const [key, entry] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        const shortKey = key.substring(prefix.length);
        result.set(shortKey, entry.data);
      }
    }

    return result;
  }

  /**
   * 名前空間のコンテキストをクリア
   */
  clearNamespace(namespace: string): number {
    const prefix = `${namespace}:`;
    let removed = 0;

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed++;
      }
    }

    return removed;
  }
}
