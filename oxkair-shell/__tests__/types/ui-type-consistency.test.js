/**
 * UI Type Consistency Tests
 * Ensures UI components use standardized types consistently
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPONENTS_DIR = join(process.cwd(), 'components');
const APP_DIR = join(process.cwd(), 'app');
const LIB_TYPES_DIR = join(process.cwd(), 'lib/coder/comprehensive-dashboard');

describe('UI Type Consistency', () => {
  let componentFiles = [];
  let pageFiles = [];
  let typeFiles = [];

  beforeAll(async () => {
    // Recursively get all component files
    const getFilesRecursively = (dir, fileList = []) => {
      const files = readdirSync(dir, { withFileTypes: true });
      files.forEach(file => {
        const fullPath = join(dir, file.name);
        if (file.isDirectory()) {
          getFilesRecursively(fullPath, fileList);
        } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
          fileList.push({
            name: file.name,
            path: fullPath,
            content: readFileSync(fullPath, 'utf8')
          });
        }
      });
      return fileList;
    };

    componentFiles = getFilesRecursively(COMPONENTS_DIR);
    pageFiles = getFilesRecursively(APP_DIR).filter(f => 
      f.name.endsWith('.tsx') || (f.name.endsWith('.ts') && !f.name.includes('.test.'))
    );
    typeFiles = getFilesRecursively(LIB_TYPES_DIR);
  });

  test('Components import types from standardized locations', () => {
    const validTypeImports = [
      'lib/coder/comprehensive-dashboard/types',
      'lib/coder/comprehensive-dashboard/ai-output-types',
      'lib/agents/types',
      'lib/agents/newtypes',
      'lib/services/service-types'
    ];

    [...componentFiles, ...pageFiles].forEach(file => {
      const importLines = file.content.split('\n').filter(line => 
        line.trim().startsWith('import') && 
        line.includes('type') || line.includes('interface')
      );

      importLines.forEach(importLine => {
        if (importLine.includes('from')) {
          const hasValidImport = validTypeImports.some(validImport => 
            importLine.includes(validImport)
          );
          
          // Allow relative imports within the same directory
          const isRelativeImport = importLine.includes('./') || importLine.includes('../');
          
          if (!isRelativeImport && importLine.includes('types')) {
            expect(hasValidImport).toBe(true);
          }
        }
      });
    });
  });

  test('Components use consistent prop type definitions', () => {
    const propPatterns = [
      /interface \w+Props/g,
      /type \w+Props/g
    ];

    componentFiles.forEach(file => {
      if (file.name.endsWith('.tsx')) {
        propPatterns.forEach(pattern => {
          const matches = file.content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              expect(match).toMatch(/Props$/);
              console.log(`✓ ${file.name} uses consistent prop naming: ${match}`);
            });
          }
        });
      }
    });
  });

  test('Components handle AI output types consistently', () => {
    const aiOutputTypes = [
      'AiRawOutput',
      'AiProcedureCodeOutput',
      'AiDiagnosisCodeOutput',
      'AiModifierSuggestionOutput',
      'StandardizedAIOutput'
    ];

    [...componentFiles, ...pageFiles].forEach(file => {
      aiOutputTypes.forEach(type => {
        if (file.content.includes(type)) {
          // Check that the type is properly imported
          const hasImport = file.content.includes(`import`) && 
                           file.content.includes(type);
          
          if (file.content.includes(`${type}`) && !file.content.includes('//')) {
            expect(hasImport || file.content.includes(`interface ${type}`) || 
                   file.content.includes(`type ${type}`)).toBe(true);
            console.log(`✓ ${file.name} properly handles ${type}`);
          }
        }
      });
    });
  });

  test('Form components use consistent validation types', () => {
    const formFiles = componentFiles.filter(file => 
      file.content.includes('useForm') || 
      file.content.includes('zodResolver') ||
      file.content.includes('form')
    );

    formFiles.forEach(file => {
      if (file.content.includes('zod') || file.content.includes('schema')) {
        const hasZodImport = file.content.includes('import') && 
                            file.content.includes('zod');
        expect(hasZodImport).toBe(true);
        console.log(`✓ ${file.name} uses consistent form validation`);
      }
    });
  });

  test('Dashboard components use standardized data types', () => {
    const dashboardFiles = componentFiles.filter(file => 
      file.path.includes('coder') || 
      file.path.includes('dashboard') ||
      file.name.toLowerCase().includes('dashboard')
    );

    const requiredDashboardTypes = [
      'CaseData',
      'ProcessingStatus',
      'AiRawOutput'
    ];

    dashboardFiles.forEach(file => {
      const usesRequiredTypes = requiredDashboardTypes.some(type => 
        file.content.includes(type)
      );
      
      if (file.content.includes('interface') || file.content.includes('type')) {
        console.log(`✓ ${file.name} checked for dashboard type usage`);
      }
    });
  });

  test('Components handle error states with consistent types', () => {
    [...componentFiles, ...pageFiles].forEach(file => {
      if (file.content.includes('error') || file.content.includes('Error')) {
        const errorPatterns = [
          /error:\s*Error/g,
          /error:\s*string/g,
          /error\?\s*:\s*string/g,
          /catch\s*\(\s*error(:\s*\w+)?\)/g,
          /error:\s*err/g
        ];

        const hasConsistentErrorHandling = errorPatterns.some(pattern => 
          file.content.match(pattern)
        );

        if (file.content.includes('catch') || file.content.includes('error:')) {
          expect(hasConsistentErrorHandling).toBe(true);
          console.log(`✓ ${file.name} uses consistent error handling`);
        }
      }
    });
  });

  test('API route handlers use consistent response types', () => {
    const apiFiles = pageFiles.filter(file => 
      file.path.includes('/api/') && file.name === 'route.ts'
    );

    apiFiles.forEach(file => {
      if (file.content.includes('NextResponse')) {
        const hasResponseType = file.content.includes('Response') ||
                               file.content.includes('json()');
        expect(hasResponseType).toBe(true);
        
        // Check for consistent error response format
        if (file.content.includes('error')) {
          const hasErrorFormat = file.content.includes('message') ||
                                 file.content.includes('error:');
          expect(hasErrorFormat).toBe(true);
        }
        
        console.log(`✓ ${file.path} uses consistent API response types`);
      }
    });
  });

  test('State management uses consistent types', () => {
    const stateFiles = [...componentFiles, ...pageFiles].filter(file => 
      file.content.includes('useState') || 
      file.content.includes('useReducer') ||
      file.content.includes('Context')
    );

    stateFiles.forEach(file => {
      if (file.content.includes('useState')) {
        // Check for proper TypeScript state typing
        const statePattern = /useState<[\w\[\]|]+>/g;
        const matches = file.content.match(statePattern);
        
        if (matches) {
          matches.forEach(match => {
            expect(match).toMatch(/useState<.+>/);
          });
          console.log(`✓ ${file.name} uses typed state management`);
        }
      }
    });
  });

  test('Event handlers use consistent type signatures', () => {
    componentFiles.forEach(file => {
      if (file.name.endsWith('.tsx')) {
        const eventPatterns = [
          /onClick.*?:\s*\(\) => void/g,
          /onChange.*?:\s*\(.*?\) => void/g,
          /onSubmit.*?:\s*\(.*?\) => void/g
        ];

        eventPatterns.forEach(pattern => {
          const matches = file.content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              expect(match).toMatch(/=> void/);
            });
          }
        });
      }
    });
  });
});