/**
 * PM Orchestrator Enhancement - Implementer Subagent
 *
 * 実装を実行します（ファイル作成・修正・削除）
 */

import { ImplementerOutput, FileOperation } from '../types';

export class Implementer {
  private version = '1.0.0';

  /**
   * 実装を実行します
   *
   * @param design 設計書
   * @param files ファイル操作
   * @param tests テスト実行フラグ
   * @returns 実装結果
   */
  public async implement(
    design: string,
    files: FileOperation[],
    tests: boolean
  ): Promise<ImplementerOutput> {
    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    const filesDeleted: string[] = [];
    let linesAdded = 0;
    let linesDeleted = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        switch (file.operation) {
          case 'create':
            await this.createFile(file.path, file.content || '');
            filesCreated.push(file.path);
            linesAdded += this.countLines(file.content || '');
            break;
          case 'modify':
            const originalLines = await this.getFileLines(file.path);
            await this.modifyFile(file.path, file.content || '');
            filesModified.push(file.path);
            const newLines = this.countLines(file.content || '');
            linesAdded += Math.max(0, newLines - originalLines);
            linesDeleted += Math.max(0, originalLines - newLines);
            break;
          case 'delete':
            const deletedLines = await this.getFileLines(file.path);
            await this.deleteFile(file.path);
            filesDeleted.push(file.path);
            linesDeleted += deletedLines;
            break;
        }
      } catch (error) {
        errors.push(`${file.path}: ${(error as Error).message}`);
      }
    }

    const status = errors.length === 0 ? 'success' : 'error';
    const autoFixApplied = false; // 実装例: Lintやフォーマットの自動適用

    return {
      status,
      filesCreated,
      filesModified,
      filesDeleted,
      linesAdded,
      linesDeleted,
      autoFixApplied,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * ファイルを作成（プライベート）
   */
  private async createFile(path: string, content: string): Promise<void> {
    // 実装例: fs.writeFileでファイル作成
    // ここではモック実装
  }

  /**
   * ファイルを修正（プライベート）
   */
  private async modifyFile(path: string, content: string): Promise<void> {
    // 実装例: fs.writeFileでファイル上書き
    // ここではモック実装
  }

  /**
   * ファイルを削除（プライベート）
   */
  private async deleteFile(path: string): Promise<void> {
    // 実装例: fs.unlinkでファイル削除
    // ここではモック実装
  }

  /**
   * ファイルの行数を取得（プライベート）
   */
  private async getFileLines(path: string): Promise<number> {
    // 実装例: fs.readFileで読み込んで行数カウント
    // ここではモック実装
    return 0;
  }

  /**
   * コンテンツの行数をカウント（プライベート）
   */
  private countLines(content: string): number {
    if (!content) return 0;
    return content.split('\n').length;
  }
}
