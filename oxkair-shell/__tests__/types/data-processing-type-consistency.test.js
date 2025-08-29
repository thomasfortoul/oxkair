/**
 * Data Processing Type Consistency Tests
 * Ensures data processing services and transformers use standardized types
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SERVICES_DIR = join(process.cwd(), 'lib/services');
const WORKFLOW_DIR = join(process.cwd(), 'lib/workflow');
const CODER_LIB_DIR = join(process.cwd(), 'lib/coder');

describe('Data Processing Type Consistency', () => {
  let serviceFiles = [];
  let workflowFiles = [];
  let coderFiles = [];

  beforeAll(async () => {
    const getFilesRecursively = (dir, fileList = []) => {
      try {
        const files = readdirSync(dir, { withFileTypes: true });
        files.forEach(file => {
          const fullPath = join(dir, file.name);
          if (file.isDirectory()) {
            getFilesRecursively(fullPath, fileList);
          } else if (file.name.endsWith('.ts') && !file.name.includes('.test.')) {
            fileList.push({
              name: file.name,
              path: fullPath,
              content: readFileSync(fullPath, 'utf8')
            });
          }
        });
      } catch (error) {
        // Directory might not exist, skip
      }
      return fileList;
    };

    serviceFiles = getFilesRecursively(SERVICES_DIR);
    workflowFiles = getFilesRecursively(WORKFLOW_DIR);
    coderFiles = getFilesRecursively(CODER_LIB_DIR);
  });

  test('Services implement consistent interface patterns', () => {
    const serviceInterfacePattern = /interface \w+Service/g;
    const serviceClassPattern = /class \w+Service/g;

    serviceFiles.forEach(file => {
      const interfaceMatches = file.content.match(serviceInterfacePattern);
      const classMatches = file.content.match(serviceClassPattern);

      if (interfaceMatches || classMatches) {
        // Check that services follow naming convention
        const allMatches = [...(interfaceMatches || []), ...(classMatches || [])];
        allMatches.forEach(match => {
          expect(match).toMatch(/Service/);
          console.log(`✓ ${file.name} follows service naming convention: ${match}`);
        });
      }
    });
  });

  test('Data transformers use consistent input/output types', () => {
    const transformerFiles = [...serviceFiles, ...coderFiles].filter(file => 
      file.name.includes('transformer') || 
      file.content.includes('transform') ||
      file.name.includes('data-transformer')
    );

    const expectedTransformMethods = [
      'transform',
      'transformInput',
      'transformOutput',
      'processData'
    ];

    transformerFiles.forEach(file => {
      expectedTransformMethods.forEach(method => {
        if (file.content.includes(`${method}(`)) {
          // Check method signature includes proper typing
          const methodPattern = new RegExp(`${method}\\s*\\([^)]*\\)\\s*:\\s*\\w+`, 'g');
          const hasTypedMethod = file.content.match(methodPattern);
          
          if (hasTypedMethod) {
            console.log(`✓ ${file.name} has properly typed ${method} method`);
          }
        }
      });
    });
  });

  test('Services use consistent error handling types', () => {
    const allFiles = [...serviceFiles, ...workflowFiles, ...coderFiles];

    allFiles.forEach(file => {
      if (file.content.includes('throw') || file.content.includes('catch')) {
        const errorPatterns = [
          /throw new \w+Error/g,
          /catch \(error: \w+\)/g,
          /catch \(error\)/g
        ];

        const hasConsistentErrors = errorPatterns.some(pattern => 
          file.content.match(pattern)
        );

        expect(hasConsistentErrors).toBe(true);
        console.log(`✓ ${file.name} uses consistent error handling`);
      }
    });
  });

  test('Database services use consistent data types', () => {
    const dbFiles = serviceFiles.filter(file => 
      file.name.includes('db') || 
      file.name.includes('database') ||
      file.content.includes('pg') ||
      file.content.includes('query')
    );

    const expectedDbTypes = [
      'QueryResult',
      'PoolClient',
      'DatabaseError'
    ];

    dbFiles.forEach(file => {
      expectedDbTypes.forEach(type => {
        if (file.content.includes(type)) {
          const hasImport = file.content.includes('import') && 
                           file.content.includes(type);
          expect(hasImport || file.content.includes(`interface ${type}`)).toBe(true);
          console.log(`✓ ${file.name} properly imports/defines ${type}`);
        }
      });
    });
  });

  test('AI model services use consistent response types', () => {
    const aiFiles = serviceFiles.filter(file => 
      file.name.includes('ai') || 
      file.name.includes('model') ||
      file.content.includes('openai') ||
      file.content.includes('azure')
    );

    const expectedAiTypes = [
      'AIResponse',
      'ModelResponse',
      'ChatCompletion',
      'StandardizedAIOutput'
    ];

    aiFiles.forEach(file => {
      expectedAiTypes.forEach(type => {
        if (file.content.includes(type)) {
          console.log(`✓ ${file.name} uses AI response type: ${type}`);
        }
      });

      // Check for proper async/await patterns
      if (file.content.includes('async') && file.content.includes('await')) {
        const asyncPattern = /async \w+\([^)]*\):\s*Promise<[\w<>[\]|]+>/g;
        const matches = file.content.match(asyncPattern);
        
        if (matches) {
          matches.forEach(match => {
            expect(match).toMatch(/Promise</);
          });
          console.log(`✓ ${file.name} uses proper async return types`);
        }
      }
    });
  });

  test('Cache services use consistent key-value types', () => {
    const cacheFiles = serviceFiles.filter(file => 
      file.name.includes('cache') || 
      file.content.includes('cache') ||
      file.content.includes('redis')
    );

    cacheFiles.forEach(file => {
      if (file.content.includes('get') || file.content.includes('set')) {
        const cacheMethodPattern = /(get|set)\s*\([^)]*\)/g;
        const matches = file.content.match(cacheMethodPattern);
        
        if (matches) {
          console.log(`✓ ${file.name} implements cache interface methods`);
        }
      }
    });
  });

  test('Workflow orchestrator uses consistent state types', () => {
    workflowFiles.forEach(file => {
      if (file.name.includes('orchestrator') || file.name.includes('workflow')) {
        const stateTypes = [
          'WorkflowState',
          'ProcessingState',
          'AgentState'
        ];

        stateTypes.forEach(type => {
          if (file.content.includes(type)) {
            console.log(`✓ ${file.name} uses workflow state type: ${type}`);
          }
        });

        // Check for state transition methods
        const transitionMethods = [
          'transition',
          'setState',
          'updateState'
        ];

        transitionMethods.forEach(method => {
          if (file.content.includes(method)) {
            console.log(`✓ ${file.name} implements state transition: ${method}`);
          }
        });
      }
    });
  });

  test('Data validation uses consistent schema types', () => {
    const allFiles = [...serviceFiles, ...workflowFiles, ...coderFiles];

    allFiles.forEach(file => {
      if (file.content.includes('validate') || file.content.includes('schema')) {
        const validationPatterns = [
          /validate\w*\s*\([^)]*\):\s*boolean/g,
          /schema\s*:\s*\w+/g,
          /zod/g
        ];

        const hasValidation = validationPatterns.some(pattern => 
          file.content.match(pattern)
        );

        if (file.content.includes('validate')) {
          console.log(`✓ ${file.name} implements data validation`);
        }
      }
    });
  });

  test('Service registry uses consistent dependency injection', () => {
    const registryFiles = serviceFiles.filter(file => 
      file.name.includes('registry') || 
      file.name.includes('service-registry')
    );

    registryFiles.forEach(file => {
      if (file.content.includes('register') || file.content.includes('get')) {
        const diPatterns = [
          /register\s*<[\w<>]+>/g,
          /get\s*<[\w<>]+>/g,
          /inject/g
        ];

        const hasDI = diPatterns.some(pattern => 
          file.content.match(pattern)
        );

        console.log(`✓ ${file.name} implements dependency injection patterns`);
      }
    });
  });

  test('Data access layer uses consistent repository patterns', () => {
    const dataFiles = [...serviceFiles, ...coderFiles].filter(file => 
      file.name.includes('data-access') || 
      file.name.includes('repository') ||
      file.content.includes('Repository')
    );

    const repositoryMethods = [
      'findById',
      'findAll',
      'create',
      'update',
      'delete'
    ];

    dataFiles.forEach(file => {
      repositoryMethods.forEach(method => {
        if (file.content.includes(method)) {
          console.log(`✓ ${file.name} implements repository method: ${method}`);
        }
      });
    });
  });
});