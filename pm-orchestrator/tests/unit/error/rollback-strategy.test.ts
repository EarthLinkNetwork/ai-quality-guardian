/**
 * PM Orchestrator Enhancement - RollbackStrategy Unit Tests
 */

import { promises as fs } from 'fs';
import path from 'path';
import { RollbackStrategy } from '../../../src/error/rollback-strategy';

describe('RollbackStrategy', () => {
  let strategy: RollbackStrategy;
  let testBaseDir: string;
  let testSourceDir: string;

  beforeEach(async () => {
    // テストごとにユニークなディレクトリを使用
    testBaseDir = path.join(
      process.cwd(),
      `.rollback-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    testSourceDir = path.join(testBaseDir, 'source');

    strategy = new RollbackStrategy(testBaseDir);

    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }

    // テストソースディレクトリを作成
    await fs.mkdir(testSourceDir, { recursive: true });
  });

  afterEach(async () => {
    // テストディレクトリをクリーンアップ
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // ディレクトリが存在しない場合は無視
    }
  });

  describe('createBackup', () => {
    it('should create backup successfully', async () => {
      // ソースファイルを作成
      await fs.writeFile(path.join(testSourceDir, 'file1.txt'), 'content1', 'utf-8');
      await fs.writeFile(path.join(testSourceDir, 'file2.txt'), 'content2', 'utf-8');

      const backupId = await strategy.createBackup(testSourceDir);

      expect(backupId).toMatch(/^backup-\d+-[a-z0-9]+$/);

      // バックアップディレクトリが作成されているか確認
      const backupPath = path.join(testBaseDir, '.pm-orchestrator', 'backups', backupId);
      const stat = await fs.stat(backupPath);
      expect(stat.isDirectory()).toBe(true);

      // バックアップファイルが存在するか確認
      const file1Content = await fs.readFile(path.join(backupPath, 'file1.txt'), 'utf-8');
      const file2Content = await fs.readFile(path.join(backupPath, 'file2.txt'), 'utf-8');
      expect(file1Content).toBe('content1');
      expect(file2Content).toBe('content2');

      // メタデータが存在するか確認
      const metadataPath = path.join(backupPath, '.backup-metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      expect(metadata.id).toBe(backupId);
      expect(metadata.sourceDir).toBe(testSourceDir);
    });

    it('should exclude .pm-orchestrator, node_modules, .git', async () => {
      // 除外されるべきディレクトリを作成
      await fs.mkdir(path.join(testSourceDir, '.pm-orchestrator'), { recursive: true });
      await fs.mkdir(path.join(testSourceDir, 'node_modules'), { recursive: true });
      await fs.mkdir(path.join(testSourceDir, '.git'), { recursive: true });

      // 通常のファイルを作成
      await fs.writeFile(path.join(testSourceDir, 'file.txt'), 'content', 'utf-8');

      const backupId = await strategy.createBackup(testSourceDir);

      const backupPath = path.join(testBaseDir, '.pm-orchestrator', 'backups', backupId);

      // 通常のファイルは存在する
      await expect(fs.access(path.join(backupPath, 'file.txt'))).resolves.toBeUndefined();

      // 除外されたディレクトリは存在しない
      await expect(fs.access(path.join(backupPath, '.pm-orchestrator'))).rejects.toThrow();
      await expect(fs.access(path.join(backupPath, 'node_modules'))).rejects.toThrow();
      await expect(fs.access(path.join(backupPath, '.git'))).rejects.toThrow();
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup successfully', async () => {
      // ソースファイルを作成
      await fs.writeFile(path.join(testSourceDir, 'file1.txt'), 'original1', 'utf-8');
      await fs.writeFile(path.join(testSourceDir, 'file2.txt'), 'original2', 'utf-8');

      // バックアップを作成
      const backupId = await strategy.createBackup(testSourceDir);

      // ソースファイルを変更
      await fs.writeFile(path.join(testSourceDir, 'file1.txt'), 'modified1', 'utf-8');
      await fs.writeFile(path.join(testSourceDir, 'file2.txt'), 'modified2', 'utf-8');

      // バックアップから復元
      await strategy.restoreFromBackup(backupId);

      // 元の内容に戻っていることを確認
      const file1Content = await fs.readFile(path.join(testSourceDir, 'file1.txt'), 'utf-8');
      const file2Content = await fs.readFile(path.join(testSourceDir, 'file2.txt'), 'utf-8');
      expect(file1Content).toBe('original1');
      expect(file2Content).toBe('original2');
    });

    it('should throw error if backup not found', async () => {
      await expect(strategy.restoreFromBackup('invalid-backup-id')).rejects.toThrow(
        'Backup not found: invalid-backup-id'
      );
    });
  });

  describe('cleanupBackup', () => {
    it('should cleanup backup successfully', async () => {
      // ソースファイルを作成
      await fs.writeFile(path.join(testSourceDir, 'file.txt'), 'content', 'utf-8');

      // バックアップを作成
      const backupId = await strategy.createBackup(testSourceDir);

      const backupPath = path.join(testBaseDir, '.pm-orchestrator', 'backups', backupId);

      // バックアップが存在することを確認
      await expect(fs.access(backupPath)).resolves.toBeUndefined();

      // バックアップをクリーンアップ
      await strategy.cleanupBackup(backupId);

      // バックアップが削除されたことを確認
      await expect(fs.access(backupPath)).rejects.toThrow();
    });

    it('should not throw error if backup does not exist', async () => {
      // 存在しないバックアップをクリーンアップしてもエラーにならない
      await expect(strategy.cleanupBackup('non-existent-backup')).resolves.toBeUndefined();
    });
  });

  describe('listBackups', () => {
    it('should list all backups', async () => {
      // ソースファイルを作成
      await fs.writeFile(path.join(testSourceDir, 'file.txt'), 'content', 'utf-8');

      // 複数のバックアップを作成
      const backupId1 = await strategy.createBackup(testSourceDir);
      const backupId2 = await strategy.createBackup(testSourceDir);
      const backupId3 = await strategy.createBackup(testSourceDir);

      const backups = await strategy.listBackups();

      expect(backups).toContain(backupId1);
      expect(backups).toContain(backupId2);
      expect(backups).toContain(backupId3);
      expect(backups.length).toBe(3);
    });

    it('should return empty array if no backups exist', async () => {
      const backups = await strategy.listBackups();
      expect(backups).toEqual([]);
    });
  });
});
