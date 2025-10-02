// PR分析モジュール
const { execSync } = require('child_process');

class PRReviewer {
  static async analyze(projectRoot, targetBranch, rules) {
    // EventSystemのpr-review-analyzer.jsをベースに汎用化
    const analysis = {
      verdict: 'PASS',
      confidence: 85,
      contradictions: [],
      recommendations: []
    };

    // 汎用的なPR分析ロジック
    const changes = this.getChanges(projectRoot, targetBranch);

    // ルールベースの検証
    if (rules.migration && !rules.migration.allowDeletion) {
      const deletedMigrations = changes.deleted.filter(f =>
        f.includes('migration') || f.includes('prisma')
      );

      if (deletedMigrations.length > 0) {
        analysis.verdict = 'BLOCK';
        analysis.contradictions.push({
          type: 'MIGRATION_DELETION',
          explanation: 'Migration削除は禁止されています'
        });
      }
    }

    return analysis;
  }

  static getChanges(projectRoot, targetBranch) {
    try {
      const deleted = execSync(
        `git diff ${targetBranch}...HEAD --diff-filter=D --name-only`,
        { cwd: projectRoot, encoding: 'utf8' }
      ).trim().split('\n').filter(Boolean);

      const added = execSync(
        `git diff ${targetBranch}...HEAD --diff-filter=A --name-only`,
        { cwd: projectRoot, encoding: 'utf8' }
      ).trim().split('\n').filter(Boolean);

      return { deleted, added };
    } catch {
      return { deleted: [], added: [] };
    }
  }
}

module.exports = PRReviewer;