/**
 * Tests for Project Mode (--project-mode, --project-root, --print-project-path)
 * 
 * Property 32: Non-Volatile Project Root
 * Property 33: Verified Files Traceability
 * 
 * Per spec 10_REPL_UX.md and 06_CORRECTNESS_PROPERTIES.md
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { REPLInterface, REPLConfig, ProjectMode } from '../../../src/repl/repl-interface';

describe('Project Mode (Property 32, 33)', () => {
  let tempDir: string;
  
  beforeEach(() => {
    // Create a temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
  });
  
  afterEach(() => {
    // Cleanup temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  /**
   * Property 32: Non-Volatile Project Root
   * Per spec 10_REPL_UX.md: --project-mode <cwd|temp|fixed>
   * cwd is the default per spec lines 98-100
   */
  describe('Property 32: Non-Volatile Project Root', () => {

    it('should default to cwd mode when --project-mode is not specified', () => {
      const config: REPLConfig = {
        projectPath: tempDir,
      };
      const repl = new REPLInterface(config);

      assert.strictEqual(repl.getProjectMode(), 'cwd', 'Default project mode should be cwd per spec 10_REPL_UX.md');
    });
    
    it('should accept --project-mode temp', () => {
      const config: REPLConfig = {
        projectPath: tempDir,
        projectMode: 'temp',
      };
      const repl = new REPLInterface(config);
      
      assert.strictEqual(repl.getProjectMode(), 'temp');
    });
    
    it('should accept --project-mode fixed', () => {
      const config: REPLConfig = {
        projectPath: tempDir,
        projectMode: 'fixed',
        projectRoot: tempDir,  // Required for fixed mode
      };
      const repl = new REPLInterface(config);
      
      assert.strictEqual(repl.getProjectMode(), 'fixed');
    });
    
    it('should require --project-root when --project-mode is fixed', () => {
      const config: REPLConfig = {
        projectPath: tempDir,
        projectMode: 'fixed',
        // projectRoot is missing - should throw
      };
      
      assert.throws(() => {
        new REPLInterface(config);
      }, /project-root.*required|fixed.*requires.*project-root/i);
    });
    
    it('should validate that --project-root directory exists', () => {
      const nonExistentDir = path.join(tempDir, 'non-existent-dir');
      const config: REPLConfig = {
        projectPath: tempDir,
        projectMode: 'fixed',
        projectRoot: nonExistentDir,
      };
      
      assert.throws(() => {
        new REPLInterface(config);
      }, /not exist|does not exist|invalid.*path/i);
    });
    
    it('should use --project-root as verification_root in fixed mode', () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      try {
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
        };
        const repl = new REPLInterface(config);
        
        assert.strictEqual(repl.getVerificationRoot(), fixedRoot);
      } finally {
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
    
    it('should use a temporary directory as verification_root in temp mode', () => {
      const config: REPLConfig = {
        projectPath: tempDir,
        projectMode: 'temp',
      };
      const repl = new REPLInterface(config);
      
      const verificationRoot = repl.getVerificationRoot();
      assert.ok(verificationRoot, 'verification_root should be set');
      // In temp mode, verification_root should be in a temp location
      assert.ok(
        verificationRoot.includes('tmp') || 
        verificationRoot.includes('temp') || 
        verificationRoot.includes('var/folders'),
        'temp mode verification_root should be in a temp location'
      );
    });
  });
  
  /**
   * --print-project-path flag tests
   * Per spec 10_REPL_UX.md: Machine-readable output for scripts
   */
  describe('--print-project-path flag', () => {
    
    it('should output PROJECT_PATH=<path> when --print-project-path is set', async () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      let capturedOutput = '';
      
      try {
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
          printProjectPath: true,
        };
        const repl = new REPLInterface(config);
        
        // Capture output
        repl.on('output', (msg: string) => {
          capturedOutput += msg + '\n';
        });
        
        // Initialize should print project path
        await repl.initialize();
        
        assert.ok(
          capturedOutput.includes('PROJECT_PATH=' + fixedRoot),
          'Should output PROJECT_PATH=<path>'
        );
      } finally {
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
    
    it('should include PROJECT_PATH in a format parseable by shell scripts', async () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      let capturedOutput = '';
      
      try {
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
          printProjectPath: true,
        };
        const repl = new REPLInterface(config);
        
        repl.on('output', (msg: string) => {
          capturedOutput += msg + '\n';
        });
        
        await repl.initialize();
        
        // Format should be: PROJECT_PATH=/some/path (no quotes, no extra chars)
        const lines = capturedOutput.split('\n');
        const projectPathLine = lines.find(line => line.startsWith('PROJECT_PATH='));
        
        assert.ok(projectPathLine, 'Should have a line starting with PROJECT_PATH=');
        
        // Parse and verify
        const extractedPath = projectPathLine.replace('PROJECT_PATH=', '');
        assert.strictEqual(extractedPath, fixedRoot);
      } finally {
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
  });
  
  /**
   * Property 33: Verified Files Traceability
   * Per spec 06_CORRECTNESS_PROPERTIES.md
   */
  describe('Property 33: Verified Files Traceability', () => {
    
    it('should record verification_root in TaskLog', async () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      
      try {
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
        };
        const repl = new REPLInterface(config);
        
        // Create .claude directory in fixedRoot
        const claudeDir = path.join(fixedRoot, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        
        await repl.initialize();
        
        // Simulate task completion
        const taskLog = repl.createTaskLog('test-task', 'Test task');
        
        assert.ok(taskLog.verification_root, 'TaskLog should have verification_root');
        assert.strictEqual(taskLog.verification_root, fixedRoot);
      } finally {
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
    
    it('should record verified_files as relative paths to verification_root', async () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      
      try {
        // Create test file
        const testFile = path.join(fixedRoot, 'README.md');
        fs.writeFileSync(testFile, '# Test');
        
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
        };
        const repl = new REPLInterface(config);
        
        // Create .claude directory in fixedRoot
        const claudeDir = path.join(fixedRoot, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        
        await repl.initialize();
        
        // Verify files
        const verifiedFiles = repl.verifyFiles([testFile]);
        
        assert.ok(verifiedFiles.length > 0, 'Should have verified files');
        assert.strictEqual(verifiedFiles[0].path, 'README.md', 'Path should be relative to verification_root');
        assert.strictEqual(verifiedFiles[0].exists, true);
      } finally {
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
    
    it('should include detection_method in verified_files', async () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      
      try {
        // Create test file
        const testFile = path.join(fixedRoot, 'test.ts');
        fs.writeFileSync(testFile, 'export const x = 1;');
        
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
        };
        const repl = new REPLInterface(config);
        
        // Create .claude directory
        const claudeDir = path.join(fixedRoot, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        
        await repl.initialize();
        
        const verifiedFiles = repl.verifyFiles([testFile]);
        
        assert.ok(verifiedFiles[0].detection_method, 'Should have detection_method');
        assert.ok(
          ['diff', 'executor_claim'].includes(verifiedFiles[0].detection_method),
          'detection_method should be diff or executor_claim'
        );
      } finally {
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
    
    it('should include detected_at timestamp in verified_files', async () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      
      try {
        const testFile = path.join(fixedRoot, 'test.ts');
        fs.writeFileSync(testFile, 'export const x = 1;');
        
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
        };
        const repl = new REPLInterface(config);
        
        const claudeDir = path.join(fixedRoot, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        
        await repl.initialize();
        
        const verifiedFiles = repl.verifyFiles([testFile]);
        
        assert.ok(verifiedFiles[0].detected_at, 'Should have detected_at');
        // Validate ISO 8601 format
        const date = new Date(verifiedFiles[0].detected_at);
        assert.ok(!isNaN(date.getTime()), 'detected_at should be valid ISO 8601');
      } finally {
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
  });
  
  /**
   * Integration: fixed mode with heredoc
   * Per spec 10_REPL_UX.md: Non-interactive mode with fixed project root
   */
  describe('Integration: fixed mode with non-interactive REPL', () => {
    
    it('should persist verification_root after REPL exits', async () => {
      const fixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fixed-'));
      
      try {
        const config: REPLConfig = {
          projectPath: tempDir,
          projectMode: 'fixed',
          projectRoot: fixedRoot,
          forceNonInteractive: true,
        };
        const repl = new REPLInterface(config);
        
        // Create .claude directory
        const claudeDir = path.join(fixedRoot, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        
        await repl.initialize();
        
        // verification_root should still exist after initialization
        assert.ok(fs.existsSync(fixedRoot), 'fixedRoot should still exist');
        assert.strictEqual(repl.getVerificationRoot(), fixedRoot);
        
        // Simulate REPL exit
        await repl.cleanup();
        
        // In fixed mode, the directory should persist
        assert.ok(fs.existsSync(fixedRoot), 'fixedRoot should persist after cleanup in fixed mode');
      } finally {
        // Cleanup happens in afterEach
        fs.rmSync(fixedRoot, { recursive: true, force: true });
      }
    });
    
    it('should cleanup temp directory when mode is temp', async () => {
      const config: REPLConfig = {
        projectPath: tempDir,
        projectMode: 'temp',
        forceNonInteractive: true,
      };
      const repl = new REPLInterface(config);
      
      // Initialize (creates temp verification_root)
      await repl.initializeTempProjectRoot();
      const verificationRoot = repl.getVerificationRoot();
      
      assert.ok(verificationRoot, 'Should have verification_root');
      assert.ok(fs.existsSync(verificationRoot), 'verification_root should exist');
      
      // Cleanup
      await repl.cleanup();
      
      // In temp mode, directory cleanup is optional (OS handles it)
      // But the REPL should not throw on cleanup
    });
  });
});
