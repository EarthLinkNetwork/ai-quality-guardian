/**
 * Data Sanitizer Module
 *
 * 機密情報の検出と除去、安全なデータ共有を提供します。
 */

export interface SanitizationResult {
  sanitized: any;
  redacted: string[];
  warnings: string[];
}

export class DataSanitizer {
  private sensitivePatterns: Array<{ name: string; pattern: RegExp }>;

  constructor() {
    this.sensitivePatterns = [
      // API Keys
      { name: 'API Key', pattern: /(?:api[_-]?key|apikey|api[_-]?token)["\s:=]+[a-zA-Z0-9_-]{20,}/gi },

      // Tokens
      { name: 'Token', pattern: /(?:token|access[_-]?token|auth[_-]?token)["\s:=]+[a-zA-Z0-9_-]{20,}/gi },

      // Passwords
      { name: 'Password', pattern: /(?:password|passwd|pwd)["\s:=]+[^\s"]{6,}/gi },

      // Private Keys
      { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi },

      // AWS Credentials
      { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
      { name: 'AWS Secret Key', pattern: /(?:aws[_-]?secret|aws[_-]?access)["\s:=]+[a-zA-Z0-9/+=]{40}/gi },

      // Email Addresses (optional)
      { name: 'Email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },

      // Credit Cards
      { name: 'Credit Card', pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },

      // GitHub Tokens
      { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },

      // Slack Tokens
      { name: 'Slack Token', pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}/g }
    ];
  }

  /**
   * データをサニタイズ
   */
  sanitize(data: any): SanitizationResult {
    const redacted: string[] = [];
    const warnings: string[] = [];

    const sanitized = this.sanitizeRecursive(data, redacted, warnings);

    return {
      sanitized,
      redacted,
      warnings
    };
  }

  /**
   * 再帰的にサニタイズ
   */
  private sanitizeRecursive(data: any, redacted: string[], warnings: string[]): any {
    if (typeof data === 'string') {
      return this.sanitizeString(data, redacted, warnings);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeRecursive(item, redacted, warnings));
    }

    if (data !== null && typeof data === 'object') {
      const result: any = {};

      for (const [key, value] of Object.entries(data)) {
        // キー名チェック
        if (this.isSensitiveKey(key)) {
          result[key] = '[REDACTED]';
          redacted.push(`${key} (key name)`);
          warnings.push(`Sensitive key detected: ${key}`);
        } else {
          result[key] = this.sanitizeRecursive(value, redacted, warnings);
        }
      }

      return result;
    }

    return data;
  }

  /**
   * 文字列をサニタイズ
   */
  private sanitizeString(str: string, redacted: string[], warnings: string[]): string {
    let result = str;

    for (const { name, pattern } of this.sensitivePatterns) {
      const matches = str.match(pattern);

      if (matches) {
        for (const match of matches) {
          result = result.replace(match, `[REDACTED ${name}]`);
          redacted.push(`${name}: ${match.substring(0, 10)}...`);
          warnings.push(`Detected ${name} in string`);
        }
      }
    }

    return result;
  }

  /**
   * キー名が機密情報かチェック
   */
  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'passwd',
      'pwd',
      'secret',
      'token',
      'api_key',
      'apikey',
      'api-key',
      'private_key',
      'privatekey',
      'access_token',
      'auth_token',
      'authorization',
      'credentials'
    ];

    const lowerKey = key.toLowerCase();

    return sensitiveKeys.some(sensitive => lowerKey.includes(sensitive));
  }

  /**
   * カスタムパターンを追加
   */
  addPattern(name: string, pattern: RegExp): void {
    this.sensitivePatterns.push({ name, pattern });
  }

  /**
   * ファイルパスをサニタイズ（ユーザー名を除去）
   */
  sanitizeFilePath(filePath: string): string {
    // ユーザー名を <user> に置換
    return filePath.replace(/\/Users\/[^/]+/, '/Users/<user>')
                  .replace(/\\Users\\[^\\]+/, '\\Users\\<user>')
                  .replace(/\/home\/[^/]+/, '/home/<user>')
                  .replace(/C:\\Users\\[^\\]+/, 'C:\\Users\\<user>');
  }

  /**
   * 環境変数をサニタイズ
   */
  sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      if (this.isSensitiveKey(key) || value === undefined) {
        result[key] = '[REDACTED]';
      } else {
        const { sanitized } = this.sanitize(value);
        result[key] = sanitized;
      }
    }

    return result;
  }

  /**
   * コマンドラインをサニタイズ
   */
  sanitizeCommand(command: string): string {
    const { sanitized } = this.sanitize(command);
    return sanitized;
  }

  /**
   * サニタイズレポートを生成
   */
  generateReport(result: SanitizationResult): string {
    const lines: string[] = [
      '=== Sanitization Report ===',
      '',
      `Redacted: ${result.redacted.length} items`,
      `Warnings: ${result.warnings.length}`,
      ''
    ];

    if (result.redacted.length > 0) {
      lines.push('Redacted Items:');
      for (const item of result.redacted) {
        lines.push(`  - ${item}`);
      }
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of result.warnings) {
        lines.push(`  - ${warning}`);
      }
    }

    return lines.join('\n');
  }
}
