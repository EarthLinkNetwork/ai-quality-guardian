"use strict";
/**
 * StepwiseMockExecutor
 *
 * A mock executor that returns different results based on call count.
 * Used for testing the self-heal mediation loop.
 *
 * Per spec:
 * - Step 1: Returns buggy implementation -> INCOMPLETE
 * - Step 2: Returns fixed implementation -> COMPLETE
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StepwiseMockExecutor = void 0;
exports.createTinyCliMockExecutor = createTinyCliMockExecutor;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * StepwiseMockExecutor
 *
 * Varies results based on call count to simulate:
 * 1. Initial buggy implementation (INCOMPLETE)
 * 2. Correction/fix (COMPLETE)
 */
class StepwiseMockExecutor {
    callCount = 0;
    config;
    executionLog = [];
    constructor(config) {
        this.config = config;
    }
    /**
     * Get current call count
     */
    getCallCount() {
        return this.callCount;
    }
    /**
     * Get execution log for verification
     */
    getExecutionLog() {
        return [...this.executionLog];
    }
    /**
     * Reset executor state
     */
    reset() {
        this.callCount = 0;
        this.executionLog = [];
    }
    async isClaudeCodeAvailable() {
        return true;
    }
    async checkAuthStatus() {
        return { available: true, loggedIn: true };
    }
    async execute(task) {
        const startTime = Date.now();
        this.callCount++;
        const currentStep = this.callCount - 1;
        // Get step config or use default
        const stepConfig = this.config.steps[currentStep] || {
            status: this.config.defaultStatus || 'COMPLETE',
            output: 'No more steps configured',
        };
        const filesCreated = [];
        const verifiedFiles = [];
        // Create files if specified
        if (stepConfig.filesToCreate) {
            for (const file of stepConfig.filesToCreate) {
                const fullPath = path.join(this.config.projectPath, file.path);
                const dir = path.dirname(fullPath);
                // Ensure directory exists
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                // Write file
                fs.writeFileSync(fullPath, file.content, 'utf-8');
                filesCreated.push(file.path);
                // Verify file
                const stat = fs.statSync(fullPath);
                verifiedFiles.push({
                    path: file.path,
                    exists: true,
                    size: stat.size,
                    content_preview: file.content.substring(0, 100),
                });
            }
        }
        // Execute custom handler if provided
        let customResult = {};
        if (stepConfig.customHandler) {
            customResult = await stepConfig.customHandler(task, this.config.projectPath);
        }
        // Determine final status
        let finalStatus = stepConfig.status;
        // If testShouldPass is specified, run npm test to verify
        if (stepConfig.testShouldPass !== undefined && filesCreated.length > 0) {
            // Rebuild if TypeScript files were modified
            const tsFilesModified = filesCreated.some(f => f.endsWith('.ts'));
            if (tsFilesModified) {
                try {
                    const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
                    execSync('npm run build', {
                        cwd: this.config.projectPath,
                        stdio: 'pipe',
                    });
                }
                catch {
                    // Build failed
                    finalStatus = 'ERROR';
                }
            }
        }
        // Log execution
        this.executionLog.push({
            callNumber: this.callCount,
            timestamp: new Date().toISOString(),
            taskId: task.id,
            prompt: task.prompt.substring(0, 200),
            status: finalStatus,
            filesCreated,
        });
        const duration_ms = Date.now() - startTime;
        return {
            executed: true,
            output: stepConfig.output,
            files_modified: filesCreated,
            duration_ms,
            status: finalStatus,
            cwd: this.config.projectPath,
            verified_files: verifiedFiles,
            unverified_files: [],
            ...customResult,
        };
    }
}
exports.StepwiseMockExecutor = StepwiseMockExecutor;
/**
 * Create a StepwiseMockExecutor configured for the tiny-cli self-heal test
 *
 * Step 1: Creates buggy implementation (tests fail) -> INCOMPLETE
 * Step 2: Creates fixed implementation (tests pass) -> COMPLETE
 */
function createTinyCliMockExecutor(projectPath) {
    return new StepwiseMockExecutor({
        projectPath,
        steps: [
            // Step 1: Initial implementation (buggy)
            {
                status: 'INCOMPLETE',
                output: 'Implemented sum and fib functions. Running tests... Tests failed: 6 failing. Need to fix bugs.',
                filesToCreate: [
                    {
                        path: 'src/tiny-cli.ts',
                        content: `#!/usr/bin/env node
/**
 * Tiny CLI - A minimal CLI for testing
 * 
 * BUGGY IMPLEMENTATION (Step 1)
 */

function sum(a: number, b: number): number {
  // BUG: String concatenation instead of numeric addition
  return Number(String(a) + String(b));
}

function fib(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;

  let prev = 0;
  let curr = 1;

  // BUG: Off-by-one error
  for (let i = 0; i <= n; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }

  return curr;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tiny-cli <command> [args]');
    console.error('Commands:');
    console.error('  sum <a> <b>  - Returns the sum of two numbers');
    console.error('  fib <n>      - Returns the nth Fibonacci number');
    process.exit(2);
  }

  const command = args[0];

  switch (command) {
    case 'sum': {
      if (args.length !== 3) {
        console.error('Usage: tiny-cli sum <a> <b>');
        process.exit(2);
      }
      const a = parseInt(args[1], 10);
      const b = parseInt(args[2], 10);
      if (isNaN(a) || isNaN(b)) {
        console.error('Error: Arguments must be numbers');
        process.exit(2);
      }
      console.log(sum(a, b));
      break;
    }

    case 'fib': {
      if (args.length !== 2) {
        console.error('Usage: tiny-cli fib <n>');
        process.exit(2);
      }
      const n = parseInt(args[1], 10);
      if (isNaN(n) || n < 0) {
        console.error('Error: Argument must be a non-negative integer');
        process.exit(2);
      }
      console.log(fib(n));
      break;
    }

    default:
      console.error(\`Unknown command: \${command}\`);
      console.error('Available commands: sum, fib');
      process.exit(2);
  }
}

main();
`,
                    },
                ],
                testShouldPass: false,
            },
            // Step 2: Fixed implementation
            {
                status: 'COMPLETE',
                output: 'Fixed both sum and fib functions. Running tests... All 15 tests passing.',
                filesToCreate: [
                    {
                        path: 'src/tiny-cli.ts',
                        content: `#!/usr/bin/env node
/**
 * Tiny CLI - A minimal CLI for testing
 * 
 * FIXED IMPLEMENTATION (Step 2)
 */

function sum(a: number, b: number): number {
  // FIXED: Proper numeric addition
  return a + b;
}

function fib(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;

  let prev = 0;
  let curr = 1;

  // FIXED: Correct loop bounds (n-1 iterations)
  for (let i = 2; i <= n; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }

  return curr;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: tiny-cli <command> [args]');
    console.error('Commands:');
    console.error('  sum <a> <b>  - Returns the sum of two numbers');
    console.error('  fib <n>      - Returns the nth Fibonacci number');
    process.exit(2);
  }

  const command = args[0];

  switch (command) {
    case 'sum': {
      if (args.length !== 3) {
        console.error('Usage: tiny-cli sum <a> <b>');
        process.exit(2);
      }
      const a = parseInt(args[1], 10);
      const b = parseInt(args[2], 10);
      if (isNaN(a) || isNaN(b)) {
        console.error('Error: Arguments must be numbers');
        process.exit(2);
      }
      console.log(sum(a, b));
      break;
    }

    case 'fib': {
      if (args.length !== 2) {
        console.error('Usage: tiny-cli fib <n>');
        process.exit(2);
      }
      const n = parseInt(args[1], 10);
      if (isNaN(n) || n < 0) {
        console.error('Error: Argument must be a non-negative integer');
        process.exit(2);
      }
      console.log(fib(n));
      break;
    }

    default:
      console.error(\`Unknown command: \${command}\`);
      console.error('Available commands: sum, fib');
      process.exit(2);
  }
}

main();
`,
                    },
                ],
                testShouldPass: true,
            },
        ],
        defaultStatus: 'COMPLETE',
    });
}
//# sourceMappingURL=stepwise-mock-executor.js.map