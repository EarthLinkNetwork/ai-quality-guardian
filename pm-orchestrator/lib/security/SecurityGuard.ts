/**
 * SecurityGuard - セキュリティガード
 * 
 * 入力検証、権限チェック、セキュリティポリシーの適用。
 * 
 * Requirements:
 * - Requirement 10: コンテキスト共有機構（セキュリティ）
 */

import { Permission, OperationType, PermissionLevel } from './Permission';

/**
 * セキュリティ違反
 */
export class SecurityViolation extends Error {
  constructor(
    message: string,
    public readonly violationType: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'SecurityViolation';
  }
}

/**
 * 入力検証結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedInput?: string;
}

/**
 * SecurityGuardクラス
 * 
 * セキュリティポリシーを適用し、不正な操作を防ぐ。
 */
export class SecurityGuard {
  private permission: Permission;
  private dangerousPatterns: RegExp[];

  constructor(permission: Permission) {
    this.permission = permission;
    this.dangerousPatterns = this.initializeDangerousPatterns();
  }

  /**
   * 危険なパターンの初期化
   */
  private initializeDangerousPatterns(): RegExp[] {
    return [
      // コマンドインジェクション
      /;.*\s*(rm|mv|dd|mkfs|:|>|wget|curl)\s/i,
      /<\s*script\s*>/i,
      /`.*`/,
      /\$\(.*\)/,

      // パストラバーサル
      /\.\.\//,
      /\.\.\\/,

      // 機密情報
      /password\s*[:=]\s*[^\s]+/i,
      /api[_-]?key\s*[:=]\s*[^\s]+/i,
      /secret\s*[:=]\s*[^\s]+/i,
      /token\s*[:=]\s*[^\s]+/i,

      // 危険なコマンド
      /rm\s+-rf\s+\//,
      /chmod\s+777/,
      /sudo\s+/
    ];
  }

  /**
   * ユーザー入力を検証
   */
  validateInput(input: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 長さチェック
    if (input.length > 10000) {
      errors.push('Input too long (max 10000 characters)');
    }

    // 危険なパターンチェック
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(input)) {
        warnings.push(`Potentially dangerous pattern detected: ${pattern.source}`);
      }
    }

    // サニタイズ
    const sanitizedInput = this.sanitizeInput(input);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedInput
    };
  }

  /**
   * 入力をサニタイズ
   */
  private sanitizeInput(input: string): string {
    return input
      .replace(/password[:=]\s*[^\s]+/gi, 'password=[REDACTED]')
      .replace(/api[_-]?key[:=]\s*[^\s]+/gi, 'api_key=[REDACTED]')
      .replace(/token[:=]\s*[^\s]+/gi, 'token=[REDACTED]')
      .replace(/secret[:=]\s*[^\s]+/gi, 'secret=[REDACTED]');
  }

  /**
   * サブエージェントの操作を検証
   */
  checkOperation(
    subagentName: string,
    operation: OperationType,
    targetPath?: string
  ): void {
    if (!this.permission.isAllowed(subagentName, operation, targetPath)) {
      throw new SecurityViolation(
        `Operation ${operation} not allowed for subagent ${subagentName}`,
        'permission_denied',
        { subagentName, operation, targetPath }
      );
    }
  }

  /**
   * ファイルパスを検証
   */
  validateFilePath(path: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // パストラバーサル
    if (path.includes('../') || path.includes('..\\')) {
      errors.push('Path traversal detected');
    }

    // 絶対パスチェック
    if (!path.startsWith('/') && !path.match(/^[A-Za-z]:\\/)) {
      warnings.push('Relative path detected, consider using absolute path');
    }

    // 機密ディレクトリ
    const sensitiveDirs = ['.env', '.git', 'node_modules/.cache', '.ssh'];
    if (sensitiveDirs.some(dir => path.includes(dir))) {
      warnings.push(`Accessing sensitive directory: ${path}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * コマンドを検証
   */
  validateCommand(command: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 危険なコマンド
    const dangerousCommands = [
      /rm\s+-rf\s+\//,
      /chmod\s+777/,
      /chown\s+root/,
      /mkfs/,
      /dd\s+if=/,
      /:(){ :|:& };:/  // Fork bomb
    ];

    for (const pattern of dangerousCommands) {
      if (pattern.test(command)) {
        errors.push(`Dangerous command detected: ${pattern.source}`);
      }
    }

    // コマンドインジェクション
    if (command.includes(';') || command.includes('&&') || command.includes('||')) {
      warnings.push('Command chaining detected');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * サブエージェント実行コンテキストを検証
   */
  validateExecutionContext(
    subagentName: string,
    context: any
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 権限レベルチェック
    const level = this.permission.getLevel(subagentName);
    if (level === PermissionLevel.NONE) {
      errors.push(`Subagent ${subagentName} has no permissions`);
    }

    // コンテキストデータのサイズチェック
    const contextSize = JSON.stringify(context).length;
    if (contextSize > 1000000) {  // 1MB
      warnings.push('Execution context too large');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * セキュリティレポートを生成
   */
  generateSecurityReport(
    subagentName: string,
    operations: OperationType[],
    targetPaths: string[]
  ): {
    allowed: OperationType[];
    denied: OperationType[];
    warnings: string[];
  } {
    const allowed: OperationType[] = [];
    const denied: OperationType[] = [];
    const warnings: string[] = [];

    for (const operation of operations) {
      let isAllowed = true;
      for (const path of targetPaths) {
        if (!this.permission.isAllowed(subagentName, operation, path)) {
          isAllowed = false;
          break;
        }
      }

      if (isAllowed) {
        allowed.push(operation);
      } else {
        denied.push(operation);
      }
    }

    // 警告
    if (denied.length > 0) {
      warnings.push(`${denied.length} operations denied for ${subagentName}`);
    }

    return { allowed, denied, warnings };
  }

  /**
   * カスタム危険パターンを追加
   */
  addDangerousPattern(pattern: RegExp): void {
    this.dangerousPatterns.push(pattern);
  }
}
