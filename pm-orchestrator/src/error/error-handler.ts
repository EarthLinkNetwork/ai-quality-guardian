/**
 * PM Orchestrator Enhancement - Error Handler
 *
 * エラー分類、リトライ可否判定、自動修正可否判定、ロールバック必要性判定を行います。
 */

import { ErrorType } from './error-types';

/**
 * ErrorHandlerクラス
 *
 * エラーを分類し、処理戦略を決定します。
 */
export class ErrorHandler {
  /**
   * エラーを分類します
   *
   * @param error エラーオブジェクト
   * @returns エラータイプ
   */
  public classify(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    // ネットワークエラー
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout')
    ) {
      return ErrorType.NETWORK_ERROR;
    }

    // タイムアウト
    if (message.includes('timeout')) {
      return ErrorType.TIMEOUT;
    }

    // 一時的な失敗
    if (
      message.includes('temporary') ||
      message.includes('retry') ||
      message.includes('unavailable')
    ) {
      return ErrorType.TEMPORARY_FAILURE;
    }

    // Lintエラー
    if (message.includes('lint') || message.includes('eslint')) {
      return ErrorType.LINT_ERROR;
    }

    // フォーマットエラー
    if (message.includes('format') || message.includes('prettier')) {
      return ErrorType.FORMAT_ERROR;
    }

    // 設計ミスマッチ（"specification"を含む可能性があるため、test判定より前に配置）
    if (message.includes('design') || message.includes('mismatch')) {
      return ErrorType.DESIGN_MISMATCH;
    }

    // テスト失敗
    if (
      message.includes('test') ||
      message.includes('jest') ||
      message.includes('spec')
    ) {
      return ErrorType.TEST_FAILURE;
    }

    // ビルド失敗
    if (message.includes('build') || message.includes('compile')) {
      return ErrorType.BUILD_FAILURE;
    }

    // ルール違反
    if (message.includes('rule') || message.includes('violation')) {
      return ErrorType.RULE_VIOLATION;
    }

    // 依存関係エラー
    if (
      message.includes('dependency') ||
      message.includes('module') ||
      message.includes('import')
    ) {
      return ErrorType.DEPENDENCY_ERROR;
    }

    // 不明なエラー
    return ErrorType.UNKNOWN;
  }

  /**
   * リトライ可能かどうかを判定します
   *
   * @param errorType エラータイプ
   * @returns リトライ可能な場合はtrue
   */
  public canRetry(errorType: ErrorType): boolean {
    return [
      ErrorType.NETWORK_ERROR,
      ErrorType.TIMEOUT,
      ErrorType.TEMPORARY_FAILURE
    ].includes(errorType);
  }

  /**
   * 自動修正可能かどうかを判定します
   *
   * @param errorType エラータイプ
   * @returns 自動修正可能な場合はtrue
   */
  public canAutoFix(errorType: ErrorType): boolean {
    return [ErrorType.LINT_ERROR, ErrorType.FORMAT_ERROR].includes(errorType);
  }

  /**
   * ロールバックが必要かどうかを判定します
   *
   * @param errorType エラータイプ
   * @returns ロールバックが必要な場合はtrue
   */
  public needsRollback(errorType: ErrorType): boolean {
    return [ErrorType.TEST_FAILURE, ErrorType.BUILD_FAILURE].includes(
      errorType
    );
  }

  /**
   * ユーザー介入が必要かどうかを判定します
   *
   * @param errorType エラータイプ
   * @returns ユーザー介入が必要な場合はtrue
   */
  public needsUserIntervention(errorType: ErrorType): boolean {
    return [
      ErrorType.RULE_VIOLATION,
      ErrorType.DESIGN_MISMATCH,
      ErrorType.DEPENDENCY_ERROR,
      ErrorType.UNKNOWN
    ].includes(errorType);
  }
}
