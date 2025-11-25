/**
 * PM Orchestrator Enhancement - Rollback Strategy
 *
 * ロールバック戦略を実装します。バックアップの作成・復元・クリーンアップ機能を提供します。
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * RollbackStrategyクラス
 *
 * バックアップとロールバック機能を提供します。
 */
export class RollbackStrategy {
  private backupDir: string;

  /**
   * コンストラクタ
   *
   * @param baseDir ベースディレクトリ（デフォルト: カレントディレクトリ）
   */
  constructor(baseDir: string = process.cwd()) {
    this.backupDir = path.join(baseDir, '.pm-orchestrator', 'backups');
  }

  /**
   * バックアップを作成します
   *
   * @param sourceDir バックアップ元のディレクトリ
   * @returns バックアップID
   */
  public async createBackup(sourceDir: string = process.cwd()): Promise<string> {
    const backupId = `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const backupPath = path.join(this.backupDir, backupId);

    // バックアップディレクトリを作成
    await fs.mkdir(backupPath, { recursive: true });

    // ソースディレクトリの内容を再帰的にコピー
    await this.copyDirectory(sourceDir, backupPath);

    // バックアップメタデータを保存
    const metadata = {
      id: backupId,
      sourceDir,
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(
      path.join(backupPath, '.backup-metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    return backupId;
  }

  /**
   * バックアップから復元します
   *
   * @param backupId バックアップID
   * @param targetDir 復元先ディレクトリ（省略時はバックアップ元に復元）
   */
  public async restoreFromBackup(backupId: string, targetDir?: string): Promise<void> {
    const backupPath = path.join(this.backupDir, backupId);

    // バックアップが存在するか確認
    try {
      await fs.access(backupPath);
    } catch {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // メタデータを読み込み
    const metadataPath = path.join(backupPath, '.backup-metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // 復元先を決定
    const destination = targetDir || metadata.sourceDir;

    // 復元先ディレクトリをクリア（.pm-orchestratorは除く）
    await this.clearDirectory(destination);

    // バックアップから復元
    await this.copyDirectory(backupPath, destination, ['.backup-metadata.json']);
  }

  /**
   * バックアップをクリーンアップします
   *
   * @param backupId バックアップID
   */
  public async cleanupBackup(backupId: string): Promise<void> {
    const backupPath = path.join(this.backupDir, backupId);

    try {
      await fs.rm(backupPath, { recursive: true, force: true });
    } catch (error) {
      // バックアップが存在しない場合は無視
    }
  }

  /**
   * 全てのバックアップIDを取得します
   *
   * @returns バックアップIDの配列
   */
  public async listBackups(): Promise<string[]> {
    try {
      await fs.access(this.backupDir);
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * ディレクトリを再帰的にコピーします（プライベートメソッド）
   *
   * @param source コピー元
   * @param destination コピー先
   * @param exclude 除外するファイル名の配列
   */
  private async copyDirectory(
    source: string,
    destination: string,
    exclude: string[] = []
  ): Promise<void> {
    await fs.mkdir(destination, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      // .pm-orchestrator、node_modules、.git は除外
      if (
        entry.name === '.pm-orchestrator' ||
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        exclude.includes(entry.name)
      ) {
        continue;
      }

      const sourcePath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }

  /**
   * ディレクトリの内容をクリアします（プライベートメソッド）
   *
   * @param dir クリアするディレクトリ
   */
  private async clearDirectory(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // .pm-orchestratorは削除しない
      if (entry.name === '.pm-orchestrator') {
        continue;
      }

      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await fs.rm(entryPath, { recursive: true, force: true });
      } else {
        await fs.unlink(entryPath);
      }
    }
  }
}
