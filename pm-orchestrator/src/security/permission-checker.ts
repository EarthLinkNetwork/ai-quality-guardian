/**
 * Permission Checker Module
 *
 * サブエージェントの権限管理とアクセス制御を提供します。
 */

export interface Permission {
  resource: string;
  action: 'read' | 'write' | 'execute' | 'delete';
  condition?: (context: any) => boolean;
}

export interface Role {
  name: string;
  permissions: Permission[];
}

export interface AccessContext {
  agentName: string;
  resource: string;
  action: 'read' | 'write' | 'execute' | 'delete';
  metadata?: Record<string, any>;
}

export class PermissionChecker {
  private roles: Map<string, Role> = new Map();
  private agentRoles: Map<string, string[]> = new Map();

  constructor() {
    this.initializeDefaultRoles();
  }

  /**
   * デフォルトロールの初期化
   */
  private initializeDefaultRoles(): void {
    // Read-only role
    this.defineRole({
      name: 'readonly',
      permissions: [
        { resource: '*', action: 'read' }
      ]
    });

    // Developer role
    this.defineRole({
      name: 'developer',
      permissions: [
        { resource: 'src/**', action: 'read' },
        { resource: 'src/**', action: 'write' },
        { resource: 'tests/**', action: 'read' },
        { resource: 'tests/**', action: 'write' },
        { resource: 'package.json', action: 'read' }
      ]
    });

    // Admin role
    this.defineRole({
      name: 'admin',
      permissions: [
        { resource: '*', action: 'read' },
        { resource: '*', action: 'write' },
        { resource: '*', action: 'execute' },
        { resource: '.env', action: 'delete', condition: (ctx) => ctx.confirmed === true }
      ]
    });

    // Quality Checker role
    this.defineRole({
      name: 'quality-checker',
      permissions: [
        { resource: '**/*.ts', action: 'read' },
        { resource: '**/*.js', action: 'read' },
        { resource: 'tests/**', action: 'execute' }
      ]
    });

    // Implementer role
    this.defineRole({
      name: 'implementer',
      permissions: [
        { resource: 'src/**', action: 'read' },
        { resource: 'src/**', action: 'write' },
        { resource: 'tests/**', action: 'read' },
        { resource: 'tests/**', action: 'write' }
      ]
    });
  }

  /**
   * ロールを定義
   */
  defineRole(role: Role): void {
    this.roles.set(role.name, role);
  }

  /**
   * エージェントにロールを割り当て
   */
  assignRole(agentName: string, roleName: string): void {
    const currentRoles = this.agentRoles.get(agentName) || [];

    if (!currentRoles.includes(roleName)) {
      currentRoles.push(roleName);
      this.agentRoles.set(agentName, currentRoles);
    }
  }

  /**
   * エージェントのロールを取得
   */
  getAgentRoles(agentName: string): string[] {
    return this.agentRoles.get(agentName) || [];
  }

  /**
   * アクセス権限をチェック
   */
  checkAccess(context: AccessContext): boolean {
    const roles = this.getAgentRoles(context.agentName);

    if (roles.length === 0) {
      // ロールが割り当てられていない場合、デフォルトでreadonly
      roles.push('readonly');
    }

    // 各ロールの権限をチェック
    for (const roleName of roles) {
      const role = this.roles.get(roleName);

      if (!role) {
        continue;
      }

      // ロールの権限をチェック
      for (const permission of role.permissions) {
        if (this.matchesPermission(context, permission)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 権限がコンテキストにマッチするかチェック
   */
  private matchesPermission(context: AccessContext, permission: Permission): boolean {
    // アクションが一致するかチェック
    if (permission.action !== context.action) {
      return false;
    }

    // リソースパターンが一致するかチェック
    if (!this.matchesResource(context.resource, permission.resource)) {
      return false;
    }

    // 条件が設定されている場合はチェック
    if (permission.condition) {
      return permission.condition(context.metadata || {});
    }

    return true;
  }

  /**
   * リソースパターンマッチング
   */
  private matchesResource(resource: string, pattern: string): boolean {
    // ワイルドカード "*" は全てにマッチ
    if (pattern === '*') {
      return true;
    }

    // 変換順序に注意: まず . をエスケープ、次に ** と * を変換
    const regexPattern = pattern
      .replace(/\./g, '\\.')        // . → \. (最初にエスケープ)
      .replace(/\*\*/g, '.*')       // ** → .* (任意のパス深度)
      .replace(/(?<!\.)(\*)(?!\*)/g, '[^/]*');  // 単独の * → [^/]* (1階層)

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(resource);
  }

  /**
   * エージェントのアクセス可能なリソースを取得
   */
  getAccessibleResources(agentName: string, action: 'read' | 'write' | 'execute' | 'delete'): string[] {
    const roles = this.getAgentRoles(agentName);
    const resources: Set<string> = new Set();

    for (const roleName of roles) {
      const role = this.roles.get(roleName);

      if (!role) {
        continue;
      }

      for (const permission of role.permissions) {
        if (permission.action === action) {
          resources.add(permission.resource);
        }
      }
    }

    return Array.from(resources);
  }

  /**
   * アクセス拒否の理由を取得
   */
  getAccessDenialReason(context: AccessContext): string {
    const roles = this.getAgentRoles(context.agentName);

    if (roles.length === 0) {
      return `Agent "${context.agentName}" has no assigned roles`;
    }

    const roleNames = roles.join(', ');
    return `Agent "${context.agentName}" with roles [${roleNames}] does not have permission to ${context.action} "${context.resource}"`;
  }

  /**
   * 全ロールを取得
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * ロールを削除
   */
  removeRole(roleName: string): boolean {
    return this.roles.delete(roleName);
  }

  /**
   * エージェントのロールを削除
   */
  revokeRole(agentName: string, roleName: string): boolean {
    const roles = this.agentRoles.get(agentName);

    if (!roles) {
      return false;
    }

    const index = roles.indexOf(roleName);

    if (index === -1) {
      return false;
    }

    roles.splice(index, 1);

    if (roles.length === 0) {
      this.agentRoles.delete(agentName);
    }

    return true;
  }

  /**
   * 権限チェック結果をログ
   */
  logAccessCheck(context: AccessContext, allowed: boolean): void {
    const timestamp = new Date().toISOString();
    const status = allowed ? 'ALLOWED' : 'DENIED';
    const message = `[${timestamp}] ${status}: ${context.agentName} ${context.action} ${context.resource}`;

    console.log(message);

    if (!allowed) {
      console.log(`  Reason: ${this.getAccessDenialReason(context)}`);
    }
  }
}
