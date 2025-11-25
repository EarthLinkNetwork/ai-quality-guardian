/**
 * PM Orchestrator Enhancement - Subagent Usage Example
 *
 * 各専門サブエージェントの使用例
 */

import { RuleChecker } from '../src/subagents/rule-checker';
import { CodeAnalyzer } from '../src/subagents/code-analyzer';
import { Designer } from '../src/subagents/designer';
import { Implementer } from '../src/subagents/implementer';
import { Tester } from '../src/subagents/tester';
import { QA } from '../src/subagents/qa';

async function main() {
  console.log('Subagent Usage Examples\n');
  console.log('='.repeat(60) + '\n');

  // 例1: Rule Checker
  console.log('Example 1: Rule Checker\n');

  const ruleChecker = new RuleChecker();
  const ruleResult = await ruleChecker.check(
    'implementation',
    ['src/auth/login.ts', 'src/auth/register.ts'],
    'git'
  );

  console.log('Rule Check Result:');
  console.log(`  Status: ${ruleResult.status}`);
  console.log(`  Violations: ${ruleResult.violations.length}`);
  if (ruleResult.violations.length > 0) {
    ruleResult.violations.forEach(v => {
      console.log(`    - ${v.rule}: ${v.message} (${v.severity})`);
    });
  }
  console.log('');

  console.log('='.repeat(60) + '\n');

  // 例2: Code Analyzer
  console.log('Example 2: Code Analyzer\n');

  const codeAnalyzer = new CodeAnalyzer();
  const analysisResult = await codeAnalyzer.analyze(
    ['src/auth/login.ts', 'src/auth/register.ts'],
    'quality'
  );

  console.log('Code Analysis Result:');
  console.log(`  Status: ${analysisResult.status}`);
  console.log(`  Findings: ${analysisResult.findings.length}`);
  console.log(`  Quality Score: ${analysisResult.metrics.qualityScore}`);
  console.log(`  Complexity: ${analysisResult.metrics.complexity}`);
  console.log('');

  console.log('='.repeat(60) + '\n');

  // 例3: Designer
  console.log('Example 3: Designer\n');

  const designer = new Designer();
  const designResult = await designer.design(
    'User authentication system with JWT tokens',
    ['Must use TypeScript', 'Must follow SOLID principles', 'Must include unit tests']
  );

  console.log('Design Result:');
  console.log(`  Status: ${designResult.status}`);
  console.log(`  Architecture: ${designResult.architecture.pattern}`);
  console.log(`  Layers: ${designResult.architecture.layers.length}`);
  console.log(`  Components: ${designResult.components.length}`);
  console.log(`  Data Models: ${designResult.dataModels.length}`);
  console.log('');

  console.log('='.repeat(60) + '\n');

  // 例4: Implementer
  console.log('Example 4: Implementer\n');

  const implementer = new Implementer();
  const implementResult = await implementer.implement(
    'Create authentication module',
    [
      {
        path: 'src/auth/index.ts',
        operation: 'create',
        content: 'export * from "./login";\nexport * from "./register";'
      }
    ],
    true
  );

  console.log('Implementation Result:');
  console.log(`  Status: ${implementResult.status}`);
  console.log(`  Files Created: ${implementResult.filesCreated.length}`);
  console.log(`  Files Modified: ${implementResult.filesModified.length}`);
  console.log(`  Lines Added: ${implementResult.linesAdded}`);
  console.log('');

  console.log('='.repeat(60) + '\n');

  // 例5: Tester
  console.log('Example 5: Tester\n');

  const tester = new Tester();
  const testResult = await tester.createTests(
    ['src/auth/login.ts'],
    'unit',
    80
  );

  console.log('Test Creation Result:');
  console.log(`  Status: ${testResult.status}`);
  console.log(`  Tests Created: ${testResult.testsCreated}`);
  console.log(`  Coverage: ${testResult.coverage}%`);
  console.log(`  Test Files: ${testResult.testFiles.length}`);
  console.log('');

  console.log('='.repeat(60) + '\n');

  // 例6: QA
  console.log('Example 6: QA\n');

  const qa = new QA();
  const qaResult = await qa.check(
    ['src/auth/login.ts'],
    ['lint', 'test', 'typecheck', 'build']
  );

  console.log('QA Check Result:');
  console.log(`  Status: ${qaResult.status}`);
  console.log(`  Quality Score: ${qaResult.qualityScore}`);
  console.log(`  Lint: ${qaResult.lint.passed ? '✓' : '✗'}`);
  console.log(`  Test: ${qaResult.test.passed ? '✓' : '✗'} (${qaResult.test.coverage}% coverage)`);
  console.log(`  Typecheck: ${qaResult.typecheck.passed ? '✓' : '✗'}`);
  console.log(`  Build: ${qaResult.build.passed ? '✓' : '✗'}`);
  console.log('');
}

main();
