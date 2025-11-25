/**
 * Input Validator Module
 *
 * ユーザー入力の検証とサニタイズを提供します。
 */

export interface ValidationRule {
  name: string;
  validate: (input: string) => boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized?: string;
}

export class InputValidator {
  private rules: ValidationRule[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * デフォルトルールの初期化
   */
  private initializeDefaultRules(): void {
    // コマンドインジェクション防止
    this.addRule({
      name: 'no-command-injection',
      validate: (input: string) => {
        const dangerousPatterns = [
          /;.*rm\s+-rf/i,
          /\|\|/,
          /&&/,
          /`[^`]+`/,
          /\$\([^)]+\)/
        ];

        return !dangerousPatterns.some(pattern => pattern.test(input));
      },
      message: 'Input contains potentially dangerous command patterns'
    });

    // パストラバーサル防止
    this.addRule({
      name: 'no-path-traversal',
      validate: (input: string) => {
        return !input.includes('../') && !input.includes('..\\');
      },
      message: 'Input contains path traversal patterns'
    });

    // SQLインジェクション防止
    this.addRule({
      name: 'no-sql-injection',
      validate: (input: string) => {
        const sqlPatterns = [
          /'\s*OR\s+'1'\s*=\s*'1/i,
          /'\s*OR\s+1\s*=\s*1/i,
          /--/,
          /;\s*DROP\s+TABLE/i,
          /UNION\s+SELECT/i
        ];

        return !sqlPatterns.some(pattern => pattern.test(input));
      },
      message: 'Input contains SQL injection patterns'
    });

    // XSS防止
    this.addRule({
      name: 'no-xss',
      validate: (input: string) => {
        const xssPatterns = [
          /<script[^>]*>.*<\/script>/i,
          /javascript:/i,
          /on\w+\s*=/i,  // onclick=, onerror=, etc.
          /<iframe/i
        ];

        return !xssPatterns.some(pattern => pattern.test(input));
      },
      message: 'Input contains XSS patterns'
    });

    // 絶対パスのみ許可
    this.addRule({
      name: 'absolute-path-only',
      validate: (input: string) => {
        // ファイルパスの場合、絶対パスかチェック
        if (input.includes('/') || input.includes('\\')) {
          return input.startsWith('/') || /^[A-Z]:\\/.test(input);
        }
        return true; // ファイルパスでない場合はOK
      },
      message: 'File paths must be absolute'
    });
  }

  /**
   * ルールを追加
   */
  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  /**
   * 入力を検証
   */
  validate(input: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 空入力チェック
    if (!input || input.trim().length === 0) {
      errors.push('Input is empty');
      return { valid: false, errors, warnings };
    }

    // 長さチェック
    if (input.length > 10000) {
      warnings.push('Input is very long (>10000 characters)');
    }

    // 各ルールで検証
    for (const rule of this.rules) {
      if (!rule.validate(input)) {
        errors.push(`${rule.name}: ${rule.message}`);
      }
    }

    const valid = errors.length === 0;
    const sanitized = valid ? this.sanitize(input) : undefined;

    return {
      valid,
      errors,
      warnings,
      sanitized
    };
  }

  /**
   * 入力をサニタイズ
   */
  sanitize(input: string): string {
    let result = input;

    // HTMLエスケープ
    result = this.escapeHtml(result);

    // 制御文字を削除
    result = result.replace(/[\x00-\x1F\x7F]/g, '');

    // 連続する空白を1つに
    result = result.replace(/\s+/g, ' ');

    // 前後の空白を削除
    result = result.trim();

    return result;
  }

  /**
   * HTMLエスケープ
   */
  private escapeHtml(input: string): string {
    const htmlEscapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };

    return input.replace(/[&<>"'/]/g, char => htmlEscapeMap[char] || char);
  }

  /**
   * ファイルパスを検証
   */
  validateFilePath(filePath: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本検証
    const baseResult = this.validate(filePath);

    if (!baseResult.valid) {
      return baseResult;
    }

    // パストラバーサルチェック
    if (filePath.includes('../') || filePath.includes('..\\')) {
      errors.push('Path traversal detected');
    }

    // 絶対パスチェック
    if (!filePath.startsWith('/') && !/^[A-Z]:\\/.test(filePath)) {
      errors.push('Path must be absolute');
    }

    // 危険な文字チェック
    if (/[;|&$`]/.test(filePath)) {
      errors.push('Path contains dangerous characters');
    }

    return {
      valid: errors.length === 0,
      errors: [...baseResult.errors, ...errors],
      warnings: [...baseResult.warnings, ...warnings],
      sanitized: baseResult.sanitized
    };
  }

  /**
   * コマンドを検証
   */
  validateCommand(command: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本検証
    const baseResult = this.validate(command);

    if (!baseResult.valid) {
      return baseResult;
    }

    // 危険なコマンドチェック
    const dangerousCommands = [
      'rm -rf',
      'dd if=',
      'mkfs',
      ':(){:|:&};:',  // Fork bomb
      'chmod 777',
      '> /dev/sda'
    ];

    for (const dangerous of dangerousCommands) {
      if (command.toLowerCase().includes(dangerous.toLowerCase())) {
        errors.push(`Dangerous command detected: ${dangerous}`);
      }
    }

    // シェルメタ文字チェック
    const shellMetaChars = ['|', '&', ';', '>', '<', '`', '$', '(', ')'];
    const hasMetaChars = shellMetaChars.some(char => command.includes(char));

    if (hasMetaChars) {
      warnings.push('Command contains shell meta-characters');
    }

    return {
      valid: errors.length === 0,
      errors: [...baseResult.errors, ...errors],
      warnings: [...baseResult.warnings, ...warnings],
      sanitized: baseResult.sanitized
    };
  }

  /**
   * JSON入力を検証
   */
  validateJson(input: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      JSON.parse(input);
    } catch (error) {
      errors.push('Invalid JSON format');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 環境変数名を検証
   */
  validateEnvVarName(name: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 環境変数名の規則: A-Z, 0-9, _ のみ
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      errors.push('Environment variable name must contain only A-Z, 0-9, and _ (and start with A-Z or _)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * URLを検証
   */
  validateUrl(url: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const parsed = new URL(url);

      // プロトコルチェック
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        warnings.push(`Non-standard protocol: ${parsed.protocol}`);
      }

      // localhostチェック
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        warnings.push('URL points to localhost');
      }

    } catch (error) {
      errors.push('Invalid URL format');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 検証レポートを生成
   */
  generateReport(result: ValidationResult): string {
    const lines: string[] = [
      '=== Validation Report ===',
      '',
      `Status: ${result.valid ? 'VALID' : 'INVALID'}`,
      `Errors: ${result.errors.length}`,
      `Warnings: ${result.warnings.length}`,
      ''
    ];

    if (result.errors.length > 0) {
      lines.push('Errors:');
      for (const error of result.errors) {
        lines.push(`  ❌ ${error}`);
      }
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of result.warnings) {
        lines.push(`  ⚠️  ${warning}`);
      }
      lines.push('');
    }

    if (result.sanitized) {
      lines.push('Sanitized Input:');
      lines.push(`  ${result.sanitized}`);
    }

    return lines.join('\n');
  }
}
