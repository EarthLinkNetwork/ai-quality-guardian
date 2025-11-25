/**
 * Permission - 権限管理
 * 
 * サブエージェントごとの操作権限を管理。
 * 
 * Requirements:
 * - Requirement 10: コンテキスト共有機構（セキュリティ）
 */

/**
 * 操作タイプ
 */
export enum OperationType {
  READ_FILE = 'read_file',
  WRITE_FILE = 'write_file',
  DELETE_FILE = 'delete_file',
  EXECUTE_COMMAND = 'execute_command',
  ACCESS_NETWORK = 'access_network',
  MODIFY_CONFIG = 'modify_config',
  COMMIT_CODE = 'commit_code',
  PUSH_CODE = 'push_code',
  CREATE_PR = 'create_pr',
  MERGE_PR = 'merge_pr'
}

/**
 * 権限レベル
 */
export enum PermissionLevel {
  NONE = 0,
  READ = 1,
  WRITE = 2,
  EXECUTE = 3,
  ADMIN = 4
}

/**
 * 権限定義
 */
export interface PermissionRule {
  subagentName: string;
  operations: Set<OperationType>;
  allowedPaths?: string[]; // 許可するパスのパターン
  deniedPaths?: string[]; // 禁止するパスのパターン
  level: PermissionLevel;
}

/**
 * Permissionクラス
 * 
 * サブエージェントごとの権限を管理。
 */
export class Permission {
  private rules: Map<string, PermissionRule>;
  private readonly defaultLevel: PermissionLevel;

  constructor(defaultLevel: PermissionLevel = PermissionLevel.READ) {
    this.rules = new Map();
    this.defaultLevel = defaultLevel;
    this.initializeDefaultRules();
  }

  /**
   * デフォルト権限ルールの初期化
   */
  private initializeDefaultRules(): void {
    // Rule Checker: 読み取りのみ
    this.setRule({
      subagentName: 'rule-checker',
      operations: new Set([
        OperationType.READ_FILE
      ]),
      level: PermissionLevel.READ
    });

    // Code Analyzer: 読み取りのみ
    this.setRule({
      subagentName: 'code-analyzer',
      operations: new Set([
        OperationType.READ_FILE
      ]),
      level: PermissionLevel.READ
    });

    // Designer: 読み取りと設計ドキュメント作成
    this.setRule({
      subagentName: 'designer',
      operations: new Set([
        OperationType.READ_FILE,
        OperationType.WRITE_FILE
      ]),
      allowedPaths: ['docs/**', '.claude/**'],
      level: PermissionLevel.WRITE
    });

    // Implementer: コード変更可能
    this.setRule({
      subagentName: 'implementer',
      operations: new Set([
        OperationType.READ_FILE,
        OperationType.WRITE_FILE,
        OperationType.DELETE_FILE,
        OperationType.EXECUTE_COMMAND
      ]),
      deniedPaths: ['.git/**', 'node_modules/**'],
      level: PermissionLevel.EXECUTE
    });

    // Tester: テスト実行可能
    this.setRule({
      subagentName: 'tester',
      operations: new Set([
        OperationType.READ_FILE,
        OperationType.WRITE_FILE,
        OperationType.EXECUTE_COMMAND
      ]),
      allowedPaths: ['**/*.test.ts', '**/*.spec.ts', 'tests/**', '__tests__/**'],
      level: PermissionLevel.EXECUTE
    });

    // QA: 品質チェック実行可能
    this.setRule({
      subagentName: 'qa',
      operations: new Set([
        OperationType.READ_FILE,
        OperationType.EXECUTE_COMMAND
      ]),
      level: PermissionLevel.EXECUTE
    });

    // CICD Engineer: CI/CD設定変更可能
    this.setRule({
      subagentName: 'cicd-engineer',
      operations: new Set([
        OperationType.READ_FILE,
        OperationType.WRITE_FILE,
        OperationType.EXECUTE_COMMAND
      ]),
      allowedPaths: ['.github/**', '.gitlab-ci.yml', 'Jenkinsfile'],
      level: PermissionLevel.EXECUTE
    });

    // Reporter: 読み取りとレポート作成
    this.setRule({
      subagentName: 'reporter',
      operations: new Set([
        OperationType.READ_FILE,
        OperationType.WRITE_FILE
      ]),
      allowedPaths: ['reports/**', '.claude/**'],
      level: PermissionLevel.WRITE
    });
  }

  /**
   * 権限ルールを設定
   */
  setRule(rule: PermissionRule): void {
    this.rules.set(rule.subagentName, rule);
  }

  /**
   * 権限ルールを取得
   */
  getRule(subagentName: string): PermissionRule | undefined {
    return this.rules.get(subagentName);
  }

  /**
   * 操作が許可されているか確認
   */
  isAllowed(subagentName: string, operation: OperationType, targetPath?: string): boolean {
    const rule = this.rules.get(subagentName);
    if (!rule) {
      // デフォルトレベルで判定
      return this.defaultLevel >= PermissionLevel.READ;
    }

    // 操作タイプチェック
    if (!rule.operations.has(operation)) {
      return false;
    }

    // パスチェック
    if (targetPath) {
      // 禁止パスチェック
      if (rule.deniedPaths && this.matchesAnyPattern(targetPath, rule.deniedPaths)) {
        return false;
      }

      // 許可パスチェック（指定がある場合のみ）
      if (rule.allowedPaths && !this.matchesAnyPattern(targetPath, rule.allowedPaths)) {
        return false;
      }
    }

    return true;
  }

  /**
   * パターンマッチング
   */
  private matchesAnyPattern(path: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // 簡易的なグロブパターンマッチング
      // まず ** を一時的なプレースホルダーに置換
      let regexPattern = pattern
        .replace(/\\/g, '/')  // バックスラッシュをスラッシュに正規化
        .replace(/\*\*/g, '__DOUBLESTAR__')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/__DOUBLESTAR__/g, '.*');
      
      const regex = new RegExp('^' + regexPattern + '$');
      return regex.test(path.replace(/\\/g, '/'));
    });
  }

  /**
   * 権限レベルを取得
   */
  getLevel(subagentName: string): PermissionLevel {
    const rule = this.rules.get(subagentName);
    return rule?.level || this.defaultLevel;
  }

  /**
   * 全権限ルールを取得
   */
  getAllRules(): Map<string, PermissionRule> {
    return new Map(this.rules);
  }

  /**
   * 権限ルールをクリア
   */
  clear(): void {
    this.rules.clear();
    this.initializeDefaultRules();
  }
}
