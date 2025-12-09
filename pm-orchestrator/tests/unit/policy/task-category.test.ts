import * as fs from 'fs';
import * as path from 'path';

describe('TaskCategory System', () => {
  const templatesPath = path.join(__dirname, '../../../templates/.claude');
  const categoriesPath = path.join(templatesPath, 'categories/task-categories.json');
  const agentsPath = path.join(templatesPath, 'agents');

  describe('TaskCategory Definition File', () => {
    let categories: any;

    beforeAll(() => {
      const content = fs.readFileSync(categoriesPath, 'utf-8');
      categories = JSON.parse(content);
    });

    it('should have task-categories.json file', () => {
      expect(fs.existsSync(categoriesPath)).toBe(true);
    });

    it('should have version field', () => {
      expect(categories.version).toBeDefined();
    });

    it('should have categories object', () => {
      expect(categories.categories).toBeDefined();
      expect(typeof categories.categories).toBe('object');
    });

    it('should have BACKUP_MIGRATION category', () => {
      expect(categories.categories.BACKUP_MIGRATION).toBeDefined();
    });

    it('should have CODE_CHANGE category', () => {
      expect(categories.categories.CODE_CHANGE).toBeDefined();
    });

    it('should have CONFIG_CHANGE category', () => {
      expect(categories.categories.CONFIG_CHANGE).toBeDefined();
    });

    it('should have PACKAGE_UPDATE category', () => {
      expect(categories.categories.PACKAGE_UPDATE).toBeDefined();
    });

    it('should have categoryDetectionPriority array', () => {
      expect(categories.categoryDetectionPriority).toBeDefined();
      expect(Array.isArray(categories.categoryDetectionPriority)).toBe(true);
    });
  });

  describe('BACKUP_MIGRATION Category', () => {
    let backupMigration: any;

    beforeAll(() => {
      const content = fs.readFileSync(categoriesPath, 'utf-8');
      const categories = JSON.parse(content);
      backupMigration = categories.categories.BACKUP_MIGRATION;
    });

    it('should have description', () => {
      expect(backupMigration.description).toBeDefined();
      expect(backupMigration.description).toContain('GCS');
    });

    it('should have keywords array', () => {
      expect(backupMigration.keywords).toBeDefined();
      expect(Array.isArray(backupMigration.keywords)).toBe(true);
      expect(backupMigration.keywords).toContain('backup');
      expect(backupMigration.keywords).toContain('GCS');
      expect(backupMigration.keywords).toContain('gsutil');
    });

    it('should have completionRequirements', () => {
      expect(backupMigration.completionRequirements).toBeDefined();
    });

    it('should have check_gcs_paths requirement', () => {
      expect(backupMigration.completionRequirements.check_gcs_paths).toBeDefined();
      expect(backupMigration.completionRequirements.check_gcs_paths.required).toBe(true);
    });

    it('should have check_backup_pairs requirement', () => {
      expect(backupMigration.completionRequirements.check_backup_pairs).toBeDefined();
      expect(backupMigration.completionRequirements.check_backup_pairs.required).toBe(true);
    });

    it('should have requiredEvidence', () => {
      expect(backupMigration.requiredEvidence).toBeDefined();
    });

    it('should require executed_commands evidence', () => {
      expect(backupMigration.requiredEvidence.executed_commands).toBeDefined();
      expect(backupMigration.requiredEvidence.executed_commands.required).toBe(true);
    });

    it('should require gcs_paths_by_environment evidence', () => {
      expect(backupMigration.requiredEvidence.gcs_paths_by_environment).toBeDefined();
      expect(backupMigration.requiredEvidence.gcs_paths_by_environment.required).toBe(true);
    });

    it('should have completionStatusRules', () => {
      expect(backupMigration.completionStatusRules).toBeDefined();
      expect(backupMigration.completionStatusRules.COMPLETE).toBeDefined();
      expect(backupMigration.completionStatusRules.PARTIAL).toBeDefined();
      expect(backupMigration.completionStatusRules.BLOCKED).toBeDefined();
    });

    it('should have prohibitions array', () => {
      expect(backupMigration.prohibitions).toBeDefined();
      expect(Array.isArray(backupMigration.prohibitions)).toBe(true);
      expect(backupMigration.prohibitions.length).toBeGreaterThan(0);
    });

    it('should prohibit guessing GCS paths', () => {
      const prohibitions = backupMigration.prohibitions.join(' ');
      expect(prohibitions).toContain('推測');
    });
  });

  describe('PACKAGE_UPDATE Category', () => {
    let packageUpdate: any;

    beforeAll(() => {
      const content = fs.readFileSync(categoriesPath, 'utf-8');
      const categories = JSON.parse(content);
      packageUpdate = categories.categories.PACKAGE_UPDATE;
    });

    it('should have description', () => {
      expect(packageUpdate.description).toBeDefined();
      expect(packageUpdate.description).toContain('npm');
    });

    it('should have workflow steps', () => {
      expect(packageUpdate.workflow).toBeDefined();
      expect(packageUpdate.workflow.steps).toBeDefined();
      expect(Array.isArray(packageUpdate.workflow.steps)).toBe(true);
    });

    it('should require external_install_test', () => {
      expect(packageUpdate.completionRequirements.external_install_test).toBeDefined();
      expect(packageUpdate.completionRequirements.external_install_test.required).toBe(true);
    });

    it('should have test_location in requiredEvidence', () => {
      expect(packageUpdate.requiredEvidence.test_location).toBeDefined();
      expect(packageUpdate.requiredEvidence.test_location.values).toContain('local_only');
      expect(packageUpdate.requiredEvidence.test_location.values).toContain('external_verified');
    });
  });

  describe('PM Orchestrator Agent (v4.0.0)', () => {
    let pmContent: string;

    beforeAll(() => {
      pmContent = fs.readFileSync(path.join(agentsPath, 'pm-orchestrator.md'), 'utf-8');
    });

    it('should have version 4.0.0', () => {
      expect(pmContent).toContain('version: 4.0.0');
    });

    it('should have TaskCategory section', () => {
      expect(pmContent).toContain('TaskCategory判定');
    });

    it('should mention BACKUP_MIGRATION', () => {
      expect(pmContent).toContain('BACKUP_MIGRATION');
    });

    it('should mention PACKAGE_UPDATE', () => {
      expect(pmContent).toContain('PACKAGE_UPDATE');
    });

    it('should mention推測禁止', () => {
      expect(pmContent).toContain('推測禁止');
    });

    it('should have Reporter output format section', () => {
      expect(pmContent).toContain('Reporter 出力フォーマット');
    });

    it('should mention task_category field', () => {
      expect(pmContent).toContain('task_category');
    });

    it('should mention completion_status field', () => {
      expect(pmContent).toContain('completion_status');
    });
  });

  describe('Implementer Agent (v4.0.0)', () => {
    let implContent: string;

    beforeAll(() => {
      implContent = fs.readFileSync(path.join(agentsPath, 'implementer.md'), 'utf-8');
    });

    it('should have version 4.0.0', () => {
      expect(implContent).toContain('version: 4.0.0');
    });

    it('should have BACKUP_MIGRATION section', () => {
      expect(implContent).toContain('BACKUP_MIGRATION カテゴリの場合');
    });

    it('should mention checklist requirement', () => {
      expect(implContent).toContain('docs/backupdata-checklist.md');
    });

    it('should mention gsutil ls requirement', () => {
      expect(implContent).toContain('gsutil ls');
    });

    it('should have禁止事項 for BACKUP_MIGRATION', () => {
      expect(implContent).toContain('絶対禁止事項');
      expect(implContent).toContain('gsutil ls を実行せずに');
    });

    it('should have PACKAGE_UPDATE section', () => {
      expect(implContent).toContain('PACKAGE_UPDATE カテゴリの場合');
    });

    it('should mention external test requirement', () => {
      expect(implContent).toContain('外部リポジトリでのインストールテスト');
    });

    it('should have test_location field', () => {
      expect(implContent).toContain('test_location');
    });
  });

  describe('QA Agent (v4.0.0)', () => {
    let qaContent: string;

    beforeAll(() => {
      qaContent = fs.readFileSync(path.join(agentsPath, 'qa.md'), 'utf-8');
    });

    it('should have version 4.0.0', () => {
      expect(qaContent).toContain('version: 4.0.0');
    });

    it('should have BACKUP_MIGRATION verification section', () => {
      expect(qaContent).toContain('BACKUP_MIGRATION カテゴリの検証');
    });

    it('should verify checklist', () => {
      expect(qaContent).toContain('チェックリスト検証');
    });

    it('should verify GCS paths', () => {
      expect(qaContent).toContain('GCS パス検証');
    });

    it('should verify environment pairing', () => {
      expect(qaContent).toContain('環境ペアリング検証');
    });

    it('should have COMPLETE禁止ロジック section', () => {
      expect(qaContent).toContain('COMPLETE 禁止ロジック');
    });

    it('should prohibit COMPLETE when gsutil not executed', () => {
      expect(qaContent).toContain('gsutil ls が実行されていない');
    });

    it('should have PACKAGE_UPDATE verification section', () => {
      expect(qaContent).toContain('PACKAGE_UPDATE カテゴリの検証');
    });
  });

  describe('Reporter Agent (v4.0.0)', () => {
    let reporterContent: string;

    beforeAll(() => {
      reporterContent = fs.readFileSync(path.join(agentsPath, 'reporter.md'), 'utf-8');
    });

    it('should have version 4.0.0', () => {
      expect(reporterContent).toContain('version: 4.0.0');
    });

    it('should have統一出力フォーマット section', () => {
      expect(reporterContent).toContain('統一出力フォーマット');
    });

    it('should have task_id field', () => {
      expect(reporterContent).toContain('task_id');
    });

    it('should have task_category field', () => {
      expect(reporterContent).toContain('task_category');
    });

    it('should have completion_status field', () => {
      expect(reporterContent).toContain('completion_status');
    });

    it('should have executed_steps field', () => {
      expect(reporterContent).toContain('executed_steps');
    });

    it('should have unexecuted_steps field', () => {
      expect(reporterContent).toContain('unexecuted_steps');
    });

    it('should have evidence_summary field', () => {
      expect(reporterContent).toContain('evidence_summary');
    });

    it('should have risks_or_unknowns field', () => {
      expect(reporterContent).toContain('risks_or_unknowns');
    });

    it('should have next_actions_for_user field', () => {
      expect(reporterContent).toContain('next_actions_for_user');
    });

    it('should have BACKUP_MIGRATION specific fields', () => {
      expect(reporterContent).toContain('gcs_paths');
      expect(reporterContent).toContain('evidence_source');
    });

    it('should mention evidence_source requirement', () => {
      expect(reporterContent).toContain('actual_ls_output');
      expect(reporterContent).toContain('inferred_from_local');
    });

    it('should prohibit COMPLETE with inferred evidence', () => {
      expect(reporterContent).toContain('inferred_from_local');
      expect(reporterContent).toContain('COMPLETE');
      expect(reporterContent).toContain('禁止');
    });

    it('should have PACKAGE_UPDATE specific fields', () => {
      expect(reporterContent).toContain('test_location');
      expect(reporterContent).toContain('external_verified');
    });
  });

  describe('Integration: TaskCategory Flow', () => {
    let categories: any;
    let pmContent: string;
    let implContent: string;
    let qaContent: string;
    let reporterContent: string;

    beforeAll(() => {
      const catContent = fs.readFileSync(categoriesPath, 'utf-8');
      categories = JSON.parse(catContent);
      pmContent = fs.readFileSync(path.join(agentsPath, 'pm-orchestrator.md'), 'utf-8');
      implContent = fs.readFileSync(path.join(agentsPath, 'implementer.md'), 'utf-8');
      qaContent = fs.readFileSync(path.join(agentsPath, 'qa.md'), 'utf-8');
      reporterContent = fs.readFileSync(path.join(agentsPath, 'reporter.md'), 'utf-8');
    });

    it('should have consistent category names across all files', () => {
      const categoryNames = Object.keys(categories.categories);

      categoryNames.forEach(cat => {
        expect(pmContent).toContain(cat);
        // At least one skill should mention each category
        const mentionedInImpl = implContent.includes(cat);
        const mentionedInQA = qaContent.includes(cat);
        const mentionedInReporter = reporterContent.includes(cat);

        expect(mentionedInImpl || mentionedInQA || mentionedInReporter).toBe(true);
      });
    });

    it('should have consistent completion_status values', () => {
      const statusValues = ['COMPLETE', 'PARTIAL', 'BLOCKED'];

      statusValues.forEach(status => {
        expect(categories.categories.BACKUP_MIGRATION.completionStatusRules[status]).toBeDefined();
        expect(pmContent).toContain(status);
        expect(qaContent).toContain(status);
        expect(reporterContent).toContain(status);
      });
    });

    it('should have consistent required evidence fields for BACKUP_MIGRATION', () => {
      // Check that required evidence in categories.json is mentioned in reporter
      const requiredEvidence = categories.categories.BACKUP_MIGRATION.requiredEvidence;

      expect(requiredEvidence.executed_commands).toBeDefined();
      expect(reporterContent).toContain('commands_executed');

      expect(requiredEvidence.gcs_paths_by_environment).toBeDefined();
      expect(reporterContent).toContain('gcs_paths');
    });
  });
});
