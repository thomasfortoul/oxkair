#!/usr/bin/env node

/**
 * Type Consistency Test Runner
 * Runs all type consistency tests and generates a comprehensive report
 */

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const testSuites = [
  {
    name: 'Agent Type Consistency',
    file: '__tests__/types/agent-type-consistency.test.js',
    description: 'Tests type consistency across all AI agents'
  },
  {
    name: 'UI Type Consistency', 
    file: '__tests__/types/ui-type-consistency.test.js',
    description: 'Tests type consistency in UI components and pages'
  },
  {
    name: 'Data Processing Type Consistency',
    file: '__tests__/types/data-processing-type-consistency.test.js', 
    description: 'Tests type consistency in data processing services'
  },
  {
    name: 'Cross-Agent Type Consistency',
    file: '__tests__/types/cross-agent-type-consistency.test.js',
    description: 'Tests type consistency between different agents'
  },
  {
    name: 'API Type Consistency',
    file: '__tests__/types/api-type-consistency.test.js',
    description: 'Tests type consistency in API routes and responses'
  },
  {
    name: 'Type Definition Validation',
    file: '__tests__/types/type-definition-validation.test.js',
    description: 'Validates all type definitions are properly structured'
  },
  {
    name: 'Integration Type Consistency',
    file: '__tests__/types/integration-type-consistency.test.js',
    description: 'Tests type consistency across application integration points'
  }
];

async function runTest(testSuite) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Running ${testSuite.name}...`);
    console.log(`   ${testSuite.description}`);
    
    const jest = spawn('npx', ['jest', testSuite.file, '--config', 'jest.types.config.json', '--verbose'], {
      stdio: 'pipe',
      shell: true
    });

    let output = '';
    let errorOutput = '';

    jest.stdout.on('data', (data) => {
      output += data.toString();
    });

    jest.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    jest.on('close', (code) => {
      const success = code === 0;
      const result = {
        name: testSuite.name,
        success,
        output: output + errorOutput,
        exitCode: code
      };

      if (success) {
        console.log(`✅ ${testSuite.name} - PASSED`);
      } else {
        console.log(`❌ ${testSuite.name} - FAILED (exit code: ${code})`);
      }

      resolve(result);
    });
  });
}

async function generateReport(results) {
  const timestamp = new Date().toISOString();
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = totalTests - passedTests;

  const report = {
    timestamp,
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      successRate: `${Math.round((passedTests / totalTests) * 100)}%`
    },
    results: results.map(result => ({
      name: result.name,
      status: result.success ? 'PASSED' : 'FAILED',
      exitCode: result.exitCode,
      output: result.output.split('\n').slice(-20).join('\n') // Last 20 lines
    }))
  };

  // Write detailed report
  const reportPath = join(process.cwd(), 'type-consistency-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Write summary report
  const summaryPath = join(process.cwd(), 'type-consistency-summary.md');
  const summaryContent = `# Type Consistency Test Report

Generated: ${timestamp}

## Summary
- **Total Test Suites**: ${totalTests}
- **Passed**: ${passedTests} ✅
- **Failed**: ${failedTests} ❌
- **Success Rate**: ${report.summary.successRate}

## Test Results

${results.map(result => `
### ${result.name}
**Status**: ${result.success ? '✅ PASSED' : '❌ FAILED'}
**Exit Code**: ${result.exitCode}

`).join('')}

## Recommendations

${failedTests > 0 ? `
⚠️ **${failedTests} test suite(s) failed**

Please review the detailed report at \`type-consistency-report.json\` for specific issues.

Common issues to check:
- Missing type imports
- Inconsistent type naming
- Circular dependencies
- Missing interface implementations
` : `
🎉 **All type consistency tests passed!**

Your codebase maintains excellent type consistency across:
- Agent implementations
- UI components  
- Data processing services
- API endpoints
- Type definitions
- Integration points
`}

## Next Steps

1. Review any failed tests and fix type inconsistencies
2. Run tests again after fixes: \`npm run test:types\`
3. Consider adding these tests to your CI/CD pipeline
4. Update type definitions as needed when adding new features
`;

  writeFileSync(summaryPath, summaryContent);

  return { reportPath, summaryPath, report };
}

async function main() {
  console.log('🚀 Starting Type Consistency Test Suite');
  console.log('=====================================\n');

  const results = [];
  
  for (const testSuite of testSuites) {
    const result = await runTest(testSuite);
    results.push(result);
  }

  console.log('\n📊 Generating Report...');
  const { reportPath, summaryPath, report } = await generateReport(results);

  console.log('\n📋 Test Summary');
  console.log('================');
  console.log(`Total Suites: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed} ✅`);
  console.log(`Failed: ${report.summary.failed} ❌`);
  console.log(`Success Rate: ${report.summary.successRate}`);

  console.log('\n📄 Reports Generated:');
  console.log(`- Detailed: ${reportPath}`);
  console.log(`- Summary: ${summaryPath}`);

  if (report.summary.failed > 0) {
    console.log('\n⚠️  Some tests failed. Please review the reports for details.');
    process.exit(1);
  } else {
    console.log('\n🎉 All type consistency tests passed!');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});