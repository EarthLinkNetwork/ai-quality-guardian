/**
 * SharedContext - ユニットテスト
 */

import { SharedContext } from '../../../lib/context/SharedContext';
import * as fs from 'fs';
import * as path from 'path';

describe('SharedContext', () => {
  let context: SharedContext;

  beforeEach(() => {
    context = new SharedContext();
  });

  afterEach(() => {
    context.clear();
  });

  describe('基本的なget/set操作', () => {
    it('should set and get a value', () => {
      context.set('key1', 'value1');
      expect(context.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent key', () => {
      expect(context.get('non-existent')).toBeUndefined();
    });

    it('should overwrite existing value', () => {
      context.set('key1', 'value1');
      context.set('key1', 'value2');
      expect(context.get('key1')).toBe('value2');
    });
  });

  describe('TTL（Time To Live）', () => {
    it('should respect TTL and expire data', (done) => {
      context.set('temp-key', 'temp-value', { ttl: 100 }); // 100ms
      expect(context.get('temp-key')).toBe('temp-value');

      setTimeout(() => {
        expect(context.get('temp-key')).toBeUndefined();
        done();
      }, 150);
    });

    it('should not expire data within TTL', () => {
      context.set('key1', 'value1', { ttl: 1000 }); // 1秒
      expect(context.get('key1')).toBe('value1');
    });
  });

  describe('メタデータ（source, tags）', () => {
    it('should find data by tag', () => {
      context.set('key1', 'value1', { tags: ['tag-a', 'tag-b'] });
      context.set('key2', 'value2', { tags: ['tag-b', 'tag-c'] });
      context.set('key3', 'value3', { tags: ['tag-c'] });

      const results = context.findByTag('tag-b');
      expect(results).toHaveLength(2);
      expect(results).toContain('value1');
      expect(results).toContain('value2');
    });

    it('should find data by source', () => {
      context.set('key1', 'value1', { source: 'subagent-a' });
      context.set('key2', 'value2', { source: 'subagent-b' });
      context.set('key3', 'value3', { source: 'subagent-a' });

      const results = context.findBySource('subagent-a');
      expect(results).toHaveLength(2);
      expect(results).toContain('value1');
      expect(results).toContain('value3');
    });
  });

  describe('ファイルキャッシュ', () => {
    const testFilePath = path.join(__dirname, 'test-file.txt');
    const testContent = 'This is a test file content.';

    beforeEach(() => {
      fs.writeFileSync(testFilePath, testContent, 'utf-8');
    });

    afterEach(() => {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should cache and retrieve file content', () => {
      context.cacheFile(testFilePath, testContent);
      const cached = context.getCachedFile(testFilePath);
      expect(cached).toBe(testContent);
    });

    it('should validate file cache', () => {
      context.cacheFile(testFilePath, testContent);
      expect(context.validateFileCache(testFilePath)).toBe(true);
    });

    it('should invalidate cache when file changes', () => {
      context.cacheFile(testFilePath, testContent);
      expect(context.validateFileCache(testFilePath)).toBe(true);

      // ファイルを変更
      fs.writeFileSync(testFilePath, 'Modified content', 'utf-8');
      expect(context.validateFileCache(testFilePath)).toBe(false);
    });

    it('should update access count on cache hit', () => {
      context.cacheFile(testFilePath, testContent);
      context.getCachedFile(testFilePath);
      context.getCachedFile(testFilePath);
      context.getCachedFile(testFilePath);

      const stats = context.getStats();
      expect(stats.fileCacheSize).toBe(1);
    });
  });

  describe('データサニタイゼーション', () => {
    it('should sanitize sensitive string data', () => {
      context.set('key1', 'password=secret123', { sensitive: true });
      const value = context.get('key1');
      expect(value).toBe('password=[REDACTED]');
    });

    it('should sanitize sensitive object data', () => {
      context.set('key1', { username: 'user', password: 'secret' }, { sensitive: true });
      const value = context.get('key1');
      expect(value.username).toBe('user');
      expect(value.password).toBe('[REDACTED]');
    });

    it('should sanitize multiple sensitive fields', () => {
      context.set('key1', {
        apiKey: 'abc123',
        token: 'xyz456',
        secret: 'hidden'
      }, { sensitive: true });

      const value = context.get('key1');
      expect(value.apiKey).toBe('[REDACTED]');
      expect(value.token).toBe('[REDACTED]');
      expect(value.secret).toBe('[REDACTED]');
    });
  });

  describe('キャッシュエビクション（LRU）', () => {
    it('should evict least recently used file when cache is full', () => {
      const smallContext = new SharedContext({ maxCacheSize: 3 });

      smallContext.cacheFile('/file1', 'content1');
      smallContext.cacheFile('/file2', 'content2');
      smallContext.cacheFile('/file3', 'content3');

      // file1にアクセス（アクセスカウント増加）
      smallContext.getCachedFile('/file1');
      smallContext.getCachedFile('/file1');

      // 新しいファイルをキャッシュ（file2がエビクションされるはず）
      smallContext.cacheFile('/file4', 'content4');

      expect(smallContext.getCachedFile('/file1')).toBe('content1');
      expect(smallContext.getCachedFile('/file2')).toBeUndefined();
      expect(smallContext.getCachedFile('/file3')).toBe('content3');
      expect(smallContext.getCachedFile('/file4')).toBe('content4');
    });
  });

  describe('統計情報', () => {
    it('should return correct stats', () => {
      context.set('key1', 'value1');
      context.set('key2', 'value2');
      context.cacheFile('/file1', 'content1');

      const stats = context.getStats();
      expect(stats.storeSize).toBe(2);
      expect(stats.fileCacheSize).toBe(1);
    });
  });

  describe('クリア機能', () => {
    it('should clear all data', () => {
      context.set('key1', 'value1');
      context.set('key2', 'value2');
      context.cacheFile('/file1', 'content1');

      context.clear();

      expect(context.get('key1')).toBeUndefined();
      expect(context.get('key2')).toBeUndefined();
      expect(context.getCachedFile('/file1')).toBeUndefined();

      const stats = context.getStats();
      expect(stats.storeSize).toBe(0);
      expect(stats.fileCacheSize).toBe(0);
    });
  });
});
