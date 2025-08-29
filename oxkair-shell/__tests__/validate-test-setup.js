#!/usr/bin/env node

/**
 * Test Setup Validation Script
 * Validates that the type testing environment is properly configured
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();

function validateFile(filePath, description) {
  const exists = existsSync(filePath);
  console.log(`${exists ? '✅' : '❌'} ${description}: ${filePath}`);
  return exists;
}

function validateJsonFile(filePath, description) {
  const exists = existsSync(filePath);
  if (exists) {
    try {
      JSON.parse(readFileSync(filePath, 'utf8'));
      console.log(`✅ ${description}: ${filePath} (valid JSON)`);
      return true;
    } catch (error) {
      console.log(`❌ ${description}: ${filePath} (invalid JSON: ${error.message})`);
      return false;
    }
  } else {
    console.log(`❌ ${description}: ${filePath} (not found)`);
    return false;
  }
}

function validatePackageJson() {
  const packagePath = join(ROOT_DIR, 'package.json');
  if (!existsSync(packagePath)) {
    console.log('❌ package.json not found');
    return false;
  }

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  const requiredScripts = [
    'test:types',
    'test:types:agent',
    'test:types:ui',
    'test:types:data',
    'test:types:cross',
    'test:types:api',
    'test:types:definitions',
    'test:types:integration'
  ];

  let allScriptsPresent = true;
  requiredScripts.forEach(script => {
    if (packageJson.scripts && packageJson.scripts[script]) {
      console.log(`✅ Script '${script}' is defined`);
    } else {
      console.log(`❌ Script '${script}' is missing`);
      allScriptsPresent = false;
    }
  });

  return allScriptsPresent;
}

function validateTypeFiles() {
  const typeFiles = [
    { path: 'lib/agents/types.ts', desc: 'Agent Legacy Types' },
    { path: 'lib/agents/newtypes.ts', desc: 'Agent New Types' },
    { path: 'lib/services/service-types.ts', desc: 'Service Types' },
    { path: 'lib/coder/comprehensive-dashboard/types.ts', desc: 'Dashboard Types' },
    { path: 'lib/coder/comprehensive-dashboard/ai-output-types.ts', desc: 'AI Output Types' }
  ];

  let allTypesPresent = true;
  typeFiles.forEach(({ path, desc }) => {
    const fullPath = join(ROOT_DIR, path);
    if (!validateFile(fullPath, desc)) {
      allTypesPresent = false;
    }
  });

  return allTypesPresent;
}

function validateTestFiles() {
  const testFiles = [
    '__tests__/types/agent-type-consistency.test.js',
    '__tests__/types/ui-type-consistency.test.js',
    '__tests__/types/data-processing-type-consistency.test.js',
    '__tests__/types/cross-agent-type-consistency.test.js',
    '__tests__/types/api-type-consistency.test.js',
    '__tests__/types/type-definition-validation.test.js',
    '__tests__/types/integration-type-consistency.test.js'
  ];

  let allTestsPresent = true;
  testFiles.forEach(testFile => {
    const fullPath = join(ROOT_DIR, testFile);
    if (!validateFile(fullPath, `Test file: ${testFile}`)) {
      allTestsPresent = false;
    }
  });

  return allTestsPresent;
}

function validateDependencies() {
  const packagePath = join(ROOT_DIR, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  
  const requiredDeps = [
    '@jest/globals',
    'jest',
    'ts-jest',
    'typescript'
  ];

  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  let allDepsPresent = true;
  requiredDeps.forEach(dep => {
    if (allDeps[dep]) {
      console.log(`✅ Dependency '${dep}' is installed`);
    } else {
      console.log(`❌ Dependency '${dep}' is missing`);
      allDepsPresent = false;
    }
  });

  return allDepsPresent;
}

function main() {
  console.log('🔍 Validating Type Testing Setup');
  console.log('================================\n');

  let allValid = true;

  console.log('📦 Package Configuration:');
  allValid = validatePackageJson() && allValid;

  console.log('\n📋 Jest Configuration:');
  allValid = validateJsonFile(join(ROOT_DIR, 'jest.types.config.json'), 'Type Test Jest Config') && allValid;
  allValid = validateJsonFile(join(ROOT_DIR, 'jest.config.json'), 'Main Jest Config') && allValid;

  console.log('\n📝 Type Definition Files:');
  allValid = validateTypeFiles() && allValid;

  console.log('\n🧪 Test Files:');
  allValid = validateTestFiles() && allValid;

  console.log('\n📚 Dependencies:');
  allValid = validateDependencies() && allValid;

  console.log('\n🔧 Additional Files:');
  allValid = validateFile(join(ROOT_DIR, '__tests__/run-type-tests.js'), 'Test Runner') && allValid;
  allValid = validateFile(join(ROOT_DIR, '__tests__/types/README.md'), 'Test Documentation') && allValid;
  allValid = validateFile(join(ROOT_DIR, 'tsconfig.json'), 'TypeScript Config') && allValid;

  console.log('\n📊 Validation Summary');
  console.log('====================');
  
  if (allValid) {
    console.log('🎉 All validation checks passed!');
    console.log('\nYou can now run the type consistency tests:');
    console.log('  npm run test:types');
    console.log('\nOr run individual test suites:');
    console.log('  npm run test:types:agent');
    console.log('  npm run test:types:ui');
    console.log('  npm run test:types:data');
    console.log('  npm run test:types:cross');
    console.log('  npm run test:types:api');
    console.log('  npm run test:types:definitions');
    console.log('  npm run test:types:integration');
    process.exit(0);
  } else {
    console.log('❌ Some validation checks failed.');
    console.log('\nPlease fix the issues above before running the type tests.');
    console.log('\nCommon fixes:');
    console.log('  - Install missing dependencies: npm install');
    console.log('  - Check file paths and ensure all files exist');
    console.log('  - Verify Jest configuration is valid JSON');
    process.exit(1);
  }
}

main();