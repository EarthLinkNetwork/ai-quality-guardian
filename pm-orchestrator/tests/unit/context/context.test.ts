/**
 * Unit Tests for Context Sharing Mechanism
 */

import { ContextStore } from '../../../src/context/context-store';
import { FileCache } from '../../../src/context/file-cache';
import { DataSanitizer } from '../../../src/context/data-sanitizer';
import * as fs from 'fs';
import * as path from 'path';

describe('ContextStore', () => {
  let store: ContextStore;

  beforeEach(() => {
    store = new ContextStore();
  });

  describe('set and get', () => {
    it('should store and retrieve context data', () => {
      const data = { key: 'value', count: 42 };
      store.set('test-context', data, 'test-agent');

      const retrieved = store.get('test-context');
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent key', () => {
      const result = store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should handle TTL expiration', async () => {
      const data = { key: 'value' };
      store.set('expiring-context', data, 'test-agent', 100); // 100ms TTL

      // Immediately accessible
      expect(store.get('expiring-context')).toEqual(data);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      expect(store.get('expiring-context')).toBeNull();
    });
  });

  describe('update', () => {
    it('should update existing context', () => {
      store.set('update-test', { count: 1 }, 'agent-1');

      const updated = store.update('update-test', { count: 2, newField: 'added' }, 'agent-2');
      expect(updated).toBe(true);

      const retrieved = store.get('update-test');
      expect(retrieved).toEqual({ count: 2, newField: 'added' });
    });

    it('should return false for non-existent context', () => {
      const updated = store.update('non-existent', { key: 'value' }, 'agent');
      expect(updated).toBe(false);
    });
  });

  describe('namespace operations', () => {
    it('should retrieve contexts by namespace', () => {
      store.set('task:1', { name: 'Task 1' }, 'agent-1');
      store.set('task:2', { name: 'Task 2' }, 'agent-1');
      store.set('other:1', { name: 'Other' }, 'agent-2');

      const taskContexts = store.getNamespace('task');
      expect(taskContexts.size).toBe(2);
      expect(taskContexts.get('1')).toEqual({ name: 'Task 1' });
      expect(taskContexts.get('2')).toEqual({ name: 'Task 2' });
    });

    it('should clear namespace contexts', () => {
      store.set('task:1', { name: 'Task 1' }, 'agent');
      store.set('task:2', { name: 'Task 2' }, 'agent');
      store.set('other:1', { name: 'Other' }, 'agent');

      const removed = store.clearNamespace('task');
      expect(removed).toBe(2);
      expect(store.getNamespace('task').size).toBe(0);
      expect(store.get('other:1')).toBeTruthy();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      store.set('permanent', { key: 'value' }, 'agent');
      store.set('expiring-1', { key: 'value' }, 'agent', 50);
      store.set('expiring-2', { key: 'value' }, 'agent', 50);

      await new Promise(resolve => setTimeout(resolve, 100));

      const removed = store.cleanup();
      expect(removed).toBe(2);
      expect(store.size()).toBe(1);
    });
  });

  describe('getBySource', () => {
    it('should retrieve contexts by source agent', () => {
      store.set('ctx-1', { data: 1 }, 'agent-1');
      store.set('ctx-2', { data: 2 }, 'agent-2');
      store.set('ctx-3', { data: 3 }, 'agent-1');

      const agent1Contexts = store.getBySource('agent-1');
      expect(agent1Contexts.size).toBe(2);
      expect(agent1Contexts.get('ctx-1')).toEqual({ data: 1 });
      expect(agent1Contexts.get('ctx-3')).toEqual({ data: 3 });
    });
  });
});

describe('FileCache', () => {
  let cache: FileCache;
  const testDir = path.join(__dirname, 'test-cache');
  const testFile = path.join(testDir, 'test.txt');

  beforeEach(() => {
    cache = new FileCache(5000); // 5 second TTL

    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('get and load', () => {
    it('should cache file content', () => {
      fs.writeFileSync(testFile, 'Test content');

      const content1 = cache.get(testFile);
      expect(content1).toBe('Test content');

      // Second call should return cached version
      const content2 = cache.get(testFile);
      expect(content2).toBe('Test content');
      expect(cache.size()).toBe(1);
    });

    it('should return null for non-existent file', () => {
      const content = cache.get(path.join(testDir, 'non-existent.txt'));
      expect(content).toBeNull();
    });

    it('should detect file changes', () => {
      fs.writeFileSync(testFile, 'Original content');

      const content1 = cache.get(testFile);
      expect(content1).toBe('Original content');

      // Modify file
      fs.writeFileSync(testFile, 'Modified content');

      // Should detect change and reload
      const content2 = cache.get(testFile);
      expect(content2).toBe('Modified content');
    });

    it('should handle TTL expiration', async () => {
      const shortCache = new FileCache(100); // 100ms TTL
      fs.writeFileSync(testFile, 'Test content');

      shortCache.get(testFile);
      expect(shortCache.size()).toBe(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Cache entry expired, will reload
      const content = shortCache.get(testFile);
      expect(content).toBe('Test content');
    });
  });

  describe('invalidate', () => {
    it('should remove cached entry', () => {
      fs.writeFileSync(testFile, 'Test content');

      cache.get(testFile);
      expect(cache.size()).toBe(1);

      const removed = cache.invalidate(testFile);
      expect(removed).toBe(true);
      expect(cache.size()).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      const shortCache = new FileCache(50);

      fs.writeFileSync(testFile, 'Content 1');
      fs.writeFileSync(path.join(testDir, 'test2.txt'), 'Content 2');

      shortCache.get(testFile);
      shortCache.get(path.join(testDir, 'test2.txt'));
      expect(shortCache.size()).toBe(2);

      await new Promise(resolve => setTimeout(resolve, 100));

      const removed = shortCache.cleanup();
      expect(removed).toBe(2);
      expect(shortCache.size()).toBe(0);
    });
  });

  describe('loadMultiple', () => {
    it('should load multiple files', () => {
      fs.writeFileSync(testFile, 'Content 1');
      fs.writeFileSync(path.join(testDir, 'test2.txt'), 'Content 2');

      const files = [testFile, path.join(testDir, 'test2.txt')];
      const results = cache.loadMultiple(files);

      expect(results.size).toBe(2);
      expect(results.get(testFile)).toBe('Content 1');
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const shortCache = new FileCache(100);

      fs.writeFileSync(testFile, 'Content');
      fs.writeFileSync(path.join(testDir, 'test2.txt'), 'Content 2');

      shortCache.get(testFile);
      shortCache.get(path.join(testDir, 'test2.txt'));

      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = shortCache.getStats();
      expect(stats.total).toBe(2);
      expect(stats.expired).toBe(2);
      expect(stats.valid).toBe(0);
    });
  });
});

describe('DataSanitizer', () => {
  let sanitizer: DataSanitizer;

  beforeEach(() => {
    sanitizer = new DataSanitizer();
  });

  describe('sanitize strings', () => {
    it('should redact API keys', () => {
      const input = 'My API key is api_key=sk_test_1234567890abcdefghij';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('[REDACTED API Key]');
      expect(result.redacted.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should redact tokens', () => {
      const input = 'Bearer token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('[REDACTED Token]');
    });

    it('should redact passwords', () => {
      const input = 'password=MySecretPass123';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('[REDACTED Password]');
    });

    it('should redact AWS access keys', () => {
      const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('[REDACTED AWS Access Key]');
    });

    it('should redact GitHub tokens', () => {
      // GitHub token pattern requires ghp_ followed by 36+ chars
      // Note: without 'token:' prefix to avoid matching generic Token pattern first
      const input = 'my github credential: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
      const result = sanitizer.sanitize(input);

      expect(result.sanitized).toContain('[REDACTED GitHub Token]');
    });
  });

  describe('sanitize objects', () => {
    it('should redact sensitive key names', () => {
      const input = {
        username: 'user',
        password: 'secret123',
        api_key: 'sk_test_key'
      };

      const result = sanitizer.sanitize(input);

      expect(result.sanitized.username).toBe('user');
      expect(result.sanitized.password).toBe('[REDACTED]');
      expect(result.sanitized.api_key).toBe('[REDACTED]');
      expect(result.redacted).toContain('password (key name)');
      expect(result.redacted).toContain('api_key (key name)');
    });

    it('should recursively sanitize nested objects', () => {
      const input = {
        config: {
          database: {
            password: 'db_secret'
          },
          api: {
            token: 'api_token_12345678901234567890'
          }
        }
      };

      const result = sanitizer.sanitize(input);

      expect(result.sanitized.config.database.password).toBe('[REDACTED]');
      expect(result.sanitized.config.api.token).toBe('[REDACTED]');
    });

    it('should sanitize arrays', () => {
      const input = [
        'normal string',
        'password=secret123',
        { key: 'api_key=sk_test_1234567890123456789012345' }  // 20+ chars required
      ];

      const result = sanitizer.sanitize(input);

      expect(result.sanitized[0]).toBe('normal string');
      expect(result.sanitized[1]).toContain('[REDACTED Password]');
      expect(result.sanitized[2].key).toContain('[REDACTED API Key]');
    });
  });

  describe('sanitizeFilePath', () => {
    it('should redact username from file paths', () => {
      const macPath = '/Users/john/project/file.txt';
      const windowsPath = 'C:\\Users\\jane\\project\\file.txt';
      const linuxPath = '/home/bob/project/file.txt';

      expect(sanitizer.sanitizeFilePath(macPath)).toBe('/Users/<user>/project/file.txt');
      expect(sanitizer.sanitizeFilePath(windowsPath)).toBe('C:\\Users\\<user>\\project\\file.txt');
      expect(sanitizer.sanitizeFilePath(linuxPath)).toBe('/home/<user>/project/file.txt');
    });
  });

  describe('sanitizeEnv', () => {
    it('should redact sensitive environment variables', () => {
      const env = {
        USER: 'john',
        HOME: '/home/john',
        API_KEY: 'sk_test_key',
        DATABASE_PASSWORD: 'db_secret',
        NODE_ENV: 'production'
      };

      const result = sanitizer.sanitizeEnv(env);

      expect(result.USER).toBe('john');
      expect(result.NODE_ENV).toBe('production');
      expect(result.API_KEY).toBe('[REDACTED]');
      expect(result.DATABASE_PASSWORD).toBe('[REDACTED]');
    });
  });

  describe('generateReport', () => {
    it('should generate sanitization report', () => {
      const input = {
        username: 'user',
        password: 'secret',
        data: 'api_key=sk_test_1234567890abcdefghij'
      };

      const result = sanitizer.sanitize(input);
      const report = sanitizer.generateReport(result);

      expect(report).toContain('Sanitization Report');
      expect(report).toContain('Redacted:');
      expect(report).toContain('Warnings:');
    });
  });

  describe('addPattern', () => {
    it('should allow adding custom patterns', () => {
      sanitizer.addPattern('Custom Token', /CUSTOM_[A-Z0-9]{20}/g);

      // Note: avoid 'Token:' prefix to prevent generic Token pattern matching first
      const input = 'My custom credential: CUSTOM_ABCDEFGHIJ1234567890';
      const result = sanitizer.sanitize(input);

      // Pattern was added with name 'Custom Token'
      expect(result.sanitized).toContain('[REDACTED Custom Token]');
      expect(result.redacted.length).toBeGreaterThan(0);
    });
  });
});
