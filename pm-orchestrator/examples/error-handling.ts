/**
 * PM Orchestrator Enhancement - Error Handling Example
 *
 * エラーハンドリングの例: リトライとロールバック
 */

import { ErrorHandler } from '../src/error/error-handler';
import { RetryStrategy } from '../src/error/retry-strategy';
import { RollbackStrategy } from '../src/error/rollback-strategy';
import { ErrorType } from '../src/types';

async function main() {
  console.log('Error Handling Example\n');
  console.log('='.repeat(60) + '\n');

  // 初期化
  const errorHandler = new ErrorHandler();
  const retryStrategy = new RetryStrategy(3, 1000);
  const rollbackStrategy = new RollbackStrategy('/tmp/pm-orchestrator-backup');

  // 例1: リトライ可能なエラー
  console.log('Example 1: Retryable Error\n');

  let attempt = 0;
  const unstableOperation = async () => {
    attempt++;
    console.log(`Attempt ${attempt}...`);

    if (attempt < 3) {
      throw new Error('TIMEOUT: Connection timed out');
    }

    return 'Success!';
  };

  try {
    const result = await retryStrategy.execute(unstableOperation);
    console.log('Result:', result);
  } catch (error) {
    const errorType = errorHandler.classifyError(error as Error);
    console.log('Error Type:', errorType);
    console.log('Retryable:', errorHandler.isRetryable(errorType));
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // 例2: ロールバックが必要なエラー
  console.log('Example 2: Rollback Required\n');

  const files = [
    { path: '/tmp/test1.txt', content: 'Original content 1' },
    { path: '/tmp/test2.txt', content: 'Original content 2' }
  ];

  try {
    // バックアップ作成
    console.log('Creating backups...');
    for (const file of files) {
      await rollbackStrategy.backup(file.path);
    }
    console.log('Backups created');

    // 何か変更を試みる（失敗する可能性がある）
    console.log('\nMaking changes...');
    // ... 変更処理 ...
    console.log('Changes applied');

    // エラーが発生したと仮定
    throw new Error('TEST_FAILURE: Some tests failed');
  } catch (error) {
    const errorType = errorHandler.classifyError(error as Error);
    console.log('\nError occurred:', (error as Error).message);
    console.log('Error Type:', errorType);

    if (errorHandler.needsRollback(errorType)) {
      console.log('Rolling back changes...');
      await rollbackStrategy.rollback('/tmp/test1.txt');
      await rollbackStrategy.rollback('/tmp/test2.txt');
      console.log('Rollback complete');
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // 例3: エラー分類
  console.log('Example 3: Error Classification\n');

  const testErrors = [
    new Error('TIMEOUT: Request timed out'),
    new Error('LINT_ERROR: Missing semicolon'),
    new Error('TEST_FAILURE: Expected true but got false'),
    new Error('RULE_VIOLATION: Direct commit to main branch'),
    new Error('Something went wrong')
  ];

  testErrors.forEach(error => {
    const errorType = errorHandler.classifyError(error);
    console.log(`Error: "${error.message}"`);
    console.log(`  Type: ${errorType}`);
    console.log(`  Retryable: ${errorHandler.isRetryable(errorType)}`);
    console.log(`  Auto-fixable: ${errorHandler.isAutoFixable(errorType)}`);
    console.log(`  Needs Rollback: ${errorHandler.needsRollback(errorType)}`);
    console.log('');
  });
}

main();
