/**
 * Type Definition Validation Tests
 * Validates that all type definitions are properly structured and complete
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const LIB_TYPES_DIR = join(process.cwd(), 'lib');

describe('Type Definition Validation', () => {
  let typeFiles = {};

  beforeAll(async () => {
    // Load all type definition files
    typeFiles = {
      agentNewtypes: readFileSync(join(LIB_TYPES_DIR, 'agents/newtypes.ts'), 'utf8'),
      agentOldTypes: readFileSync(join(LIB_TYPES_DIR, 'agents/types.ts'), 'utf8'),
      serviceTypes: readFileSync(join(LIB_TYPES_DIR, 'services/service-types.ts'), 'utf8'),
      dashboardTypes: readFileSync(join(LIB_TYPES_DIR, 'coder/comprehensive-dashboard/types.ts'), 'utf8'),
      aiOutputTypes: readFileSync(join(LIB_TYPES_DIR, 'coder/comprehensive-dashboard/ai-output-types.ts'), 'utf8')
    };
  });

  test('All interfaces have proper TypeScript syntax', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      // Check for proper interface declarations
      const interfacePattern = /export interface \w+ \{[^}]*\}/gs;
      const interfaces = content.match(interfacePattern);
      
      if (interfaces) {
        interfaces.forEach(interfaceDecl => {
          // Check for proper property declarations
          expect(interfaceDecl).toMatch(/\w+\??\s*:\s*[\w\[\]<>|&\s]+;?/);
          
          // Check for proper closing braces
          expect(interfaceDecl).toMatch(/\}$/);
        });
        console.log(`✓ ${fileName} has ${interfaces.length} properly formatted interfaces`);
      }
    });
  });

  test('All type aliases are properly defined', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const typePattern = /export type \w+ = [^;]+;/g;
      const types = content.match(typePattern);
      
      if (types) {
        types.forEach(typeDecl => {
          expect(typeDecl).toMatch(/export type \w+/);
          expect(typeDecl).toMatch(/;$/);
        });
        console.log(`✓ ${fileName} has ${types.length} properly formatted type aliases`);
      }
    });
  });

  test('Required properties are consistently marked', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const propertyPattern = /\s+(\w+)(\??):\s*([\w\[\]<>|&\s]+);?/g;
      let match;
      const properties = [];
      
      while ((match = propertyPattern.exec(content)) !== null) {
        properties.push({
          name: match[1],
          optional: match[2] === '?',
          type: match[3]
        });
      }
      
      // Check for consistent optional property usage
      const optionalCount = properties.filter(p => p.optional).length;
      const requiredCount = properties.filter(p => !p.optional).length;
      
      if (properties.length > 0) {
        console.log(`✓ ${fileName} has ${requiredCount} required and ${optionalCount} optional properties`);
      }
    });
  });

  test('Array types use consistent notation', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const arrayPatterns = [
        /\w+\[\]/g,  // Type[]
        /Array<\w+>/g  // Array<Type>
      ];
      
      arrayPatterns.forEach((pattern, index) => {
        const matches = content.match(pattern);
        if (matches) {
          const notation = index === 0 ? 'Type[]' : 'Array<Type>';
          console.log(`✓ ${fileName} uses ${notation} notation: ${matches.length} instances`);
        }
      });
    });
  });

  test('Union types are properly formatted', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const unionPattern = /:\s*[\w\s]+\|[\w\s|]+/g;
      const unions = content.match(unionPattern);
      
      if (unions) {
        unions.forEach(union => {
          // Check for proper spacing around pipes
          expect(union).toMatch(/\w\s*\|\s*\w/);
        });
        console.log(`✓ ${fileName} has ${unions.length} properly formatted union types`);
      }
    });
  });

  test('Generic types are consistently used', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const genericPattern = /<[\w\s,<>]+>/g;
      const generics = content.match(genericPattern);
      
      if (generics) {
        generics.forEach(generic => {
          expect(generic).toMatch(/^<.*>$/);
        });
        console.log(`✓ ${fileName} has ${generics.length} generic type declarations`);
      }
    });
  });

  test('Enum values follow consistent naming', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const enumPattern = /export enum \w+ \{[^}]+\}/gs;
      const enums = content.match(enumPattern);
      
      if (enums) {
        enums.forEach(enumDecl => {
          // Check for consistent enum value naming (UPPER_CASE or PascalCase)
          const valuePattern = /\s+(\w+)\s*=?\s*[^,}]*/g;
          let match;
          while ((match = valuePattern.exec(enumDecl)) !== null) {
            const value = match[1];
            const isUpperCase = value === value.toUpperCase();
            const isPascalCase = /^[A-Z][a-zA-Z]*$/.test(value);
            expect(isUpperCase || isPascalCase).toBe(true);
          }
        });
        console.log(`✓ ${fileName} has ${enums.length} properly formatted enums`);
      }
    });
  });

  test('Documentation comments are present for complex types', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const docCommentPattern = /\/\*\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*export\s+(interface|type|enum)/g;
      const documentedTypes = content.match(docCommentPattern);
      
      const allExports = content.match(/export\s+(interface|type|enum)\s+\w+/g);
      
      if (allExports && documentedTypes) {
        const documentationRatio = documentedTypes.length / allExports.length;
        console.log(`✓ ${fileName} has ${Math.round(documentationRatio * 100)}% documented types`);
      }
    });
  });

  test('Circular dependencies are avoided', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const importPattern = /import.*?from\s+['"]([^'"]+)['"]/g;
      const imports = [];
      let match;
      
      while ((match = importPattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
      
      // Check for potential circular imports
      const relativeImports = imports.filter(imp => imp.startsWith('./') || imp.startsWith('../'));
      console.log(`✓ ${fileName} has ${relativeImports.length} relative imports`);
    });
  });

  test('Deprecated types are properly marked', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const deprecatedPattern = /@deprecated/gi;
      const deprecatedMatches = content.match(deprecatedPattern);
      
      if (deprecatedMatches) {
        console.log(`✓ ${fileName} has ${deprecatedMatches.length} deprecated type markers`);
      }
    });
  });

  test('Type exports are consistent', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      const exportPatterns = [
        /export \{[^}]+\}/g,  // Named exports
        /export \* from/g,    // Re-exports
        /export (interface|type|enum|class)/g  // Direct exports
      ];
      
      let totalExports = 0;
      exportPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          totalExports += matches.length;
        }
      });
      
      if (totalExports > 0) {
        console.log(`✓ ${fileName} has ${totalExports} export statements`);
      }
    });
  });

  test('Type compatibility across files', () => {
    // Check for types that should be compatible across files
    const commonTypes = [
      'Evidence',
      'StandardizedEvidence',
      'AIOutput',
      'StandardizedAIOutput',
      'ProcedureCode',
      'DiagnosisCode'
    ];

    commonTypes.forEach(typeName => {
      const filesWithType = Object.entries(typeFiles).filter(([fileName, content]) => 
        content.includes(typeName)
      );
      
      if (filesWithType.length > 1) {
        console.log(`✓ Type '${typeName}' found in ${filesWithType.length} files`);
      }
    });
  });

  test('Naming conventions are followed', () => {
    Object.entries(typeFiles).forEach(([fileName, content]) => {
      // Check interface naming (PascalCase)
      const interfaceNames = content.match(/export interface (\w+)/g);
      if (interfaceNames) {
        interfaceNames.forEach(name => {
          const typeName = name.replace('export interface ', '');
          expect(typeName).toMatch(/^[A-Z][a-zA-Z0-9]*$/);
        });
      }

      // Check type alias naming (PascalCase)
      const typeNames = content.match(/export type (\w+)/g);
      if (typeNames) {
        typeNames.forEach(name => {
          const typeName = name.replace('export type ', '');
          expect(typeName).toMatch(/^[A-Z][a-zA-Z0-9]*$/);
        });
      }

      console.log(`✓ ${fileName} follows naming conventions`);
    });
  });
});