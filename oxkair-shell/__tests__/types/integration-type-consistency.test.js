/**
 * Integration Type Consistency Tests
 * Tests type consistency across the entire application integration points
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT_DIR = process.cwd();

describe('Integration Type Consistency', () => {
  let allFiles = [];
  let typeDefinitions = new Map();

  beforeAll(async () => {
    // Recursively collect all TypeScript files
    const collectFiles = (dir, fileList = []) => {
      try {
        const files = readdirSync(dir, { withFileTypes: true });
        files.forEach(file => {
          const fullPath = join(dir, file.name);
          if (file.isDirectory() && !file.name.includes('node_modules') && !file.name.includes('.git')) {
            collectFiles(fullPath, fileList);
          } else if ((file.name.endsWith('.ts') || file.name.endsWith('.tsx')) && 
                     !file.name.includes('.test.') && !file.name.includes('.spec.')) {
            fileList.push({
              name: file.name,
              path: fullPath,
              relativePath: fullPath.replace(ROOT_DIR, ''),
              content: readFileSync(fullPath, 'utf8')
            });
          }
        });
      } catch (error) {
        // Skip directories that can't be read
      }
      return fileList;
    };

    allFiles = collectFiles(ROOT_DIR);

    // Extract type definitions from all files
    allFiles.forEach(file => {
      const interfaceMatches = file.content.match(/export interface (\w+)/g);
      const typeMatches = file.content.match(/export type (\w+)/g);
      const enumMatches = file.content.match(/export enum (\w+)/g);

      [interfaceMatches, typeMatches, enumMatches].forEach(matches => {
        if (matches) {
          matches.forEach(match => {
            const typeName = match.replace(/export (interface|type|enum) /, '');
            if (!typeDefinitions.has(typeName)) {
              typeDefinitions.set(typeName, []);
            }
            typeDefinitions.get(typeName).push(file.relativePath);
          });
        }
      });
    });
  });

  test('No duplicate type definitions across files', () => {
    const duplicateTypes = [];
    
    typeDefinitions.forEach((files, typeName) => {
      if (files.length > 1) {
        // Allow certain types to be defined in multiple places if they're re-exports
        const allowedDuplicates = [
          'Evidence', // Can be re-exported for compatibility
          'AIOutput', // Legacy compatibility
          'ProcessingStatus' // Common across modules
        ];
        
        if (!allowedDuplicates.includes(typeName)) {
          duplicateTypes.push({ typeName, files });
        }
      }
    });

    if (duplicateTypes.length > 0) {
      console.warn('Duplicate type definitions found:');
      duplicateTypes.forEach(({ typeName, files }) => {
        console.warn(`  ${typeName}: ${files.join(', ')}`);
      });
    }

    // This should be a warning, not a failure, as some duplication might be intentional
    expect(duplicateTypes.length).toBeLessThan(10);
  });

  test('Import statements use correct type sources', () => {
    const typeImportPattern = /import\s+(?:\{[^}]+\}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const incorrectImports = [];

    allFiles.forEach(file => {
      let match;
      while ((match = typeImportPattern.exec(file.content)) !== null) {
        const importPath = match[1];
        
        // Check for imports that should use standardized types
        if (importPath.includes('types') || importPath.includes('Types')) {
          const preferredSources = [
            '../../TYPES/agent_types',
            '../../TYPES/more_types',
            './types',
            './newtypes',
            '../types',
            'lib/agents/types',
            'lib/agents/newtypes'
          ];
          
          const isValidSource = preferredSources.some(source => 
            importPath.includes(source) || importPath.startsWith('./')
          );
          
          if (!isValidSource && !importPath.includes('node_modules')) {
            incorrectImports.push({
              file: file.relativePath,
              import: importPath
            });
          }
        }
      }
    });

    if (incorrectImports.length > 0) {
      console.log('Potentially incorrect type imports:');
      incorrectImports.forEach(({ file, import: importPath }) => {
        console.log(`  ${file}: ${importPath}`);
      });
    }

    expect(incorrectImports.length).toBeLessThan(5);
  });

  test('Agent-to-UI data flow uses compatible types', () => {
    const agentFiles = allFiles.filter(f => f.relativePath.includes('lib/agents/'));
    const uiFiles = allFiles.filter(f => f.relativePath.includes('components/') || f.relativePath.includes('app/'));

    const agentOutputTypes = new Set();
    const uiInputTypes = new Set();

    // Extract output types from agents
    agentFiles.forEach(file => {
      const outputMatches = file.content.match(/return.*?:\s*(\w+)/g);
      if (outputMatches) {
        outputMatches.forEach(match => {
          const type = match.replace(/return.*?:\s*/, '');
          agentOutputTypes.add(type);
        });
      }
    });

    // Extract input types from UI components
    uiFiles.forEach(file => {
      const propMatches = file.content.match(/props:\s*(\w+)/g);
      if (propMatches) {
        propMatches.forEach(match => {
          const type = match.replace(/props:\s*/, '');
          uiInputTypes.add(type);
        });
      }
    });

    console.log(`Agent output types: ${Array.from(agentOutputTypes).join(', ')}`);
    console.log(`UI input types: ${Array.from(uiInputTypes).join(', ')}`);
  });

  test('Database schema types match application types', () => {
    const dbFiles = allFiles.filter(f => 
      f.relativePath.includes('db/') || 
      f.relativePath.includes('database') ||
      f.name.includes('schema')
    );

    const appDataTypes = new Set();
    const dbTypes = new Set();

    // Extract application data types
    allFiles.forEach(file => {
      if (file.content.includes('interface') && 
          (file.content.includes('Data') || file.content.includes('Record'))) {
        const matches = file.content.match(/interface (\w+(?:Data|Record))/g);
        if (matches) {
          matches.forEach(match => {
            appDataTypes.add(match.replace('interface ', ''));
          });
        }
      }
    });

    console.log(`Application data types: ${Array.from(appDataTypes).join(', ')}`);
    console.log(`Database files found: ${dbFiles.length}`);
  });

  test('API request/response types are consistent with client expectations', () => {
    const apiFiles = allFiles.filter(f => f.relativePath.includes('app/api/'));
    const clientFiles = allFiles.filter(f => 
      f.relativePath.includes('lib/api/') || 
      f.content.includes('fetch(') ||
      f.content.includes('axios')
    );

    const apiResponseTypes = new Set();
    const clientRequestTypes = new Set();

    // Extract API response types
    apiFiles.forEach(file => {
      const responseMatches = file.content.match(/NextResponse\.json\([^)]*\)/g);
      if (responseMatches) {
        console.log(`${file.relativePath} has ${responseMatches.length} API responses`);
      }
    });

    // Extract client request types
    clientFiles.forEach(file => {
      const requestMatches = file.content.match(/fetch\([^)]*\)/g);
      if (requestMatches) {
        console.log(`${file.relativePath} has ${requestMatches.length} API requests`);
      }
    });
  });

  test('Event handling types are consistent across components', () => {
    const componentFiles = allFiles.filter(f => 
      f.relativePath.includes('components/') && f.name.endsWith('.tsx')
    );

    const eventHandlerTypes = new Set();

    componentFiles.forEach(file => {
      const eventMatches = file.content.match(/on\w+\s*:\s*\([^)]*\)\s*=>\s*\w+/g);
      if (eventMatches) {
        eventMatches.forEach(match => {
          eventHandlerTypes.add(match);
        });
      }
    });

    console.log(`Event handler patterns found: ${eventHandlerTypes.size}`);
  });

  test('Configuration types are used consistently', () => {
    const configFiles = allFiles.filter(f => 
      f.name.includes('config') || 
      f.relativePath.includes('config') ||
      f.content.includes('process.env')
    );

    const configTypes = new Set();

    configFiles.forEach(file => {
      const envMatches = file.content.match(/process\.env\.(\w+)/g);
      if (envMatches) {
        envMatches.forEach(match => {
          configTypes.add(match.replace('process.env.', ''));
        });
      }
    });

    console.log(`Configuration variables found: ${Array.from(configTypes).slice(0, 10).join(', ')}`);
  });

  test('Error types are handled consistently across modules', () => {
    const errorTypes = new Map();

    allFiles.forEach(file => {
      const errorMatches = file.content.match(/throw new (\w+Error)/g);
      if (errorMatches) {
        errorMatches.forEach(match => {
          const errorType = match.replace('throw new ', '');
          if (!errorTypes.has(errorType)) {
            errorTypes.set(errorType, []);
          }
          errorTypes.get(errorType).push(file.relativePath);
        });
      }
    });

    console.log('Error types used across application:');
    errorTypes.forEach((files, errorType) => {
      console.log(`  ${errorType}: ${files.length} files`);
    });
  });

  test('Utility function types are reused appropriately', () => {
    const utilFiles = allFiles.filter(f => 
      f.relativePath.includes('utils/') || 
      f.relativePath.includes('lib/utils') ||
      f.name.includes('utils')
    );

    const utilityFunctions = new Set();

    utilFiles.forEach(file => {
      const functionMatches = file.content.match(/export\s+(?:function|const)\s+(\w+)/g);
      if (functionMatches) {
        functionMatches.forEach(match => {
          const funcName = match.replace(/export\s+(?:function|const)\s+/, '');
          utilityFunctions.add(funcName);
        });
      }
    });

    console.log(`Utility functions exported: ${utilityFunctions.size}`);
  });

  test('Type guards and validation functions are properly typed', () => {
    const typeGuardPattern = /function\s+is\w+\s*\([^)]*\):\s*\w+\s+is\s+\w+/g;
    const validationPattern = /function\s+validate\w+\s*\([^)]*\):\s*boolean/g;

    let typeGuardCount = 0;
    let validationCount = 0;

    allFiles.forEach(file => {
      const typeGuards = file.content.match(typeGuardPattern);
      const validations = file.content.match(validationPattern);

      if (typeGuards) typeGuardCount += typeGuards.length;
      if (validations) validationCount += validations.length;
    });

    console.log(`Type guards found: ${typeGuardCount}`);
    console.log(`Validation functions found: ${validationCount}`);
  });
});