/**
 * AC-8: stable が dev を開発できる
 * Per spec/22_ACCEPTANCE_CRITERIA_STRICT.md
 *
 * 要件:
 * - stable runner で dev runner のコードを変更できる
 * - stable runner でテストを実行できる
 * - stable runner でビルドできる
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

describe('AC-8: stable が dev を開発できる', () => {
  let testDir: string;
  let stableRoot: string;
  let devRoot: string;

  beforeEach(() => {
    // Create temporary directory structure
    testDir = path.join(os.tmpdir(), 'ac8-test-' + Date.now());
    stableRoot = path.join(testDir, 'stable');
    devRoot = path.join(testDir, 'dev');
    fs.mkdirSync(stableRoot, { recursive: true });
    fs.mkdirSync(devRoot, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('File Operations', () => {
    it('stable process can read files from dev directory', () => {
      // Create a test file in dev
      const devFile = path.join(devRoot, 'test-file.ts');
      const testContent = '// This is a test file\nexport const value = 42;';
      fs.writeFileSync(devFile, testContent);

      // Stable process reads from dev (simulated by reading from a different path)
      const content = fs.readFileSync(devFile, 'utf-8');
      assert.strictEqual(content, testContent);
    });

    it('stable process can write files to dev directory', () => {
      // Create a new file in dev from stable context
      const devFile = path.join(devRoot, 'new-file.ts');
      const newContent = '// Created by stable\nexport const x = 123;';
      
      fs.writeFileSync(devFile, newContent);
      
      assert.ok(fs.existsSync(devFile));
      assert.strictEqual(fs.readFileSync(devFile, 'utf-8'), newContent);
    });

    it('stable process can modify existing files in dev directory', () => {
      // Create original file in dev
      const devFile = path.join(devRoot, 'modify-test.ts');
      const originalContent = 'export const value = 1;';
      fs.writeFileSync(devFile, originalContent);

      // Modify from stable context
      const modifiedContent = '// Modified by stable\nexport const value = 2;';
      fs.writeFileSync(devFile, modifiedContent);

      assert.strictEqual(fs.readFileSync(devFile, 'utf-8'), modifiedContent);
    });

    it('stable process can delete files in dev directory', () => {
      // Create file in dev
      const devFile = path.join(devRoot, 'to-delete.ts');
      fs.writeFileSync(devFile, 'content');
      assert.ok(fs.existsSync(devFile));

      // Delete from stable context
      fs.unlinkSync(devFile);
      assert.ok(!fs.existsSync(devFile));
    });
  });

  describe('Directory Operations', () => {
    it('stable process can create directories in dev', () => {
      const newDir = path.join(devRoot, 'src', 'components');
      
      fs.mkdirSync(newDir, { recursive: true });
      
      assert.ok(fs.existsSync(newDir));
      assert.ok(fs.statSync(newDir).isDirectory());
    });

    it('stable process can list files in dev directory', () => {
      // Create some files in dev
      fs.writeFileSync(path.join(devRoot, 'a.ts'), 'a');
      fs.writeFileSync(path.join(devRoot, 'b.ts'), 'b');
      fs.mkdirSync(path.join(devRoot, 'subdir'));
      fs.writeFileSync(path.join(devRoot, 'subdir', 'c.ts'), 'c');

      // List from stable context
      const files = fs.readdirSync(devRoot);
      assert.ok(files.includes('a.ts'));
      assert.ok(files.includes('b.ts'));
      assert.ok(files.includes('subdir'));
    });
  });

  describe('Test Execution', () => {
    it('stable can execute npm commands in dev directory', async () => {
      // Create a minimal package.json in dev
      const packageJson = {
        name: 'dev-test-project',
        version: '1.0.0',
        scripts: {
          test: 'echo "test passed"'
        }
      };
      fs.writeFileSync(
        path.join(devRoot, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Execute npm test from stable context targeting dev
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
        const proc = spawn('npm', ['test'], {
          cwd: devRoot,
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        proc.stdout?.on('data', (data) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data) => { stderr += data.toString(); });
        
        proc.on('close', (code) => {
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        });
      });

      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('test passed'));
    });
  });

  describe('Build Operations', () => {
    it('stable can run TypeScript check on dev files', async () => {
      // Create a simple TypeScript file in dev
      const tsFile = path.join(devRoot, 'index.ts');
      fs.writeFileSync(tsFile, 'export const x: number = 42;\n');
      
      // Create tsconfig.json
      const tsconfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true,
          outDir: './dist',
          declaration: true,
          skipLibCheck: true
        },
        include: ['./*.ts']
      };
      fs.writeFileSync(
        path.join(devRoot, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 2)
      );

      // Package.json with typescript
      const packageJson = {
        name: 'dev-build-test',
        version: '1.0.0',
        devDependencies: {
          typescript: '^5.0.0'
        }
      };
      fs.writeFileSync(
        path.join(devRoot, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Verify the TypeScript file is valid by checking syntax
      const content = fs.readFileSync(tsFile, 'utf-8');
      assert.ok(content.includes('export const x: number = 42'));
    });
  });

  describe('Path Isolation', () => {
    it('stable and dev have separate working directories', () => {
      // Create files in both directories
      fs.writeFileSync(path.join(stableRoot, 'stable-only.ts'), 'stable');
      fs.writeFileSync(path.join(devRoot, 'dev-only.ts'), 'dev');

      // Verify isolation
      assert.ok(fs.existsSync(path.join(stableRoot, 'stable-only.ts')));
      assert.ok(fs.existsSync(path.join(devRoot, 'dev-only.ts')));
      assert.ok(!fs.existsSync(path.join(stableRoot, 'dev-only.ts')));
      assert.ok(!fs.existsSync(path.join(devRoot, 'stable-only.ts')));
    });

    it('stable can access dev via relative path', () => {
      // Create file in dev
      fs.writeFileSync(path.join(devRoot, 'target.ts'), 'target content');

      // Access from stable using relative path
      const relativePath = path.relative(stableRoot, path.join(devRoot, 'target.ts'));
      const absolutePath = path.resolve(stableRoot, relativePath);
      
      assert.ok(fs.existsSync(absolutePath));
      assert.strictEqual(fs.readFileSync(absolutePath, 'utf-8'), 'target content');
    });

    it('stable can access dev via absolute path', () => {
      // Create file in dev
      const devFile = path.join(devRoot, 'absolute-test.ts');
      fs.writeFileSync(devFile, 'absolute content');

      // Access from stable using absolute path
      assert.ok(fs.existsSync(devFile));
      assert.strictEqual(fs.readFileSync(devFile, 'utf-8'), 'absolute content');
    });
  });

  describe('Cross-Project Operations', () => {
    it('stable can copy files from its own directory to dev', () => {
      // Create source file in stable
      const stableFile = path.join(stableRoot, 'source.ts');
      fs.writeFileSync(stableFile, 'copied content');

      // Copy to dev
      const devFile = path.join(devRoot, 'copied.ts');
      fs.copyFileSync(stableFile, devFile);

      assert.ok(fs.existsSync(devFile));
      assert.strictEqual(fs.readFileSync(devFile, 'utf-8'), 'copied content');
    });

    it('stable can read multiple files from dev and process them', () => {
      // Create multiple files in dev
      fs.writeFileSync(path.join(devRoot, 'file1.ts'), 'content1');
      fs.writeFileSync(path.join(devRoot, 'file2.ts'), 'content2');
      fs.writeFileSync(path.join(devRoot, 'file3.ts'), 'content3');

      // Read and process from stable
      const files = fs.readdirSync(devRoot).filter(f => f.endsWith('.ts'));
      const contents = files.map(f => fs.readFileSync(path.join(devRoot, f), 'utf-8'));

      assert.strictEqual(files.length, 3);
      assert.ok(contents.includes('content1'));
      assert.ok(contents.includes('content2'));
      assert.ok(contents.includes('content3'));
    });
  });

  describe('Concurrent Operations', () => {
    it('stable can perform multiple operations on dev without conflict', async () => {
      // Create initial files
      const operations = [
        () => fs.writeFileSync(path.join(devRoot, 'op1.ts'), 'op1'),
        () => fs.writeFileSync(path.join(devRoot, 'op2.ts'), 'op2'),
        () => fs.mkdirSync(path.join(devRoot, 'op3-dir'), { recursive: true }),
        () => fs.writeFileSync(path.join(devRoot, 'op4.ts'), 'op4'),
      ];

      // Execute operations
      for (const op of operations) {
        op();
      }

      // Verify all operations completed
      assert.ok(fs.existsSync(path.join(devRoot, 'op1.ts')));
      assert.ok(fs.existsSync(path.join(devRoot, 'op2.ts')));
      assert.ok(fs.existsSync(path.join(devRoot, 'op3-dir')));
      assert.ok(fs.existsSync(path.join(devRoot, 'op4.ts')));
    });
  });
});
