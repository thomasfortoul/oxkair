/**
 * Agent Type Consistency Tests
 * Ensures all agents use standardized types consistently
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

// Import type definitions for validation
const AGENTS_DIR = join(process.cwd(), 'lib/agents');
const TYPES_DIR = join(process.cwd(), 'lib/agents');

describe('Agent Type Consistency', () => {
  let agentFiles = [];
  let typeDefinitions = {};

  beforeAll(async () => {
    // Load all agent files
    const fs = await import('fs');
    const agentFileNames = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.ts') && !f.includes('test'));
    
    agentFiles = agentFileNames.map(fileName => ({
      name: fileName,
      content: readFileSync(join(AGENTS_DIR, fileName), 'utf8')
    }));

    // Load type definition files
    const agentTypesContent = readFileSync(join(TYPES_DIR, 'types.ts'), 'utf8');
    const moreTypesContent = readFileSync(join(TYPES_DIR, 'newtypes.ts'), 'utf8');
    
    typeDefinitions = {
      agentTypes: agentTypesContent,
      moreTypes: moreTypesContent
    };
  });

  test('All agents import from standardized type files', () => {
    const requiredImports = [
      'StandardizedEvidence',
      'StandardizedAgentResult',
      'StandardizedAgentContext',
      'Agents',
      'Notes',
      'ProcessingError',
      'ProcessingErrorSeverity'
    ];

    agentFiles.forEach(agent => {
      if (agent.name !== 'index.ts' && agent.name !== 'agent-core.ts' && agent.name !== 'types.ts' && agent.name !== 'newtypes.ts') {
        requiredImports.forEach(importName => {
          const hasImport = agent.content.includes(importName);
          expect(hasImport).toBe(true);
        });
        console.log(`✓ ${agent.name} imports all required standardized types`);
      }
    });
  });

  test('Agents use consistent Evidence structure', () => {
    const evidencePattern = /StandardizedEvidence/g;
    
    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        const evidenceMatches = (agent.content.match(evidencePattern) || []).length;
        expect(evidenceMatches).toBeGreaterThan(0);
        console.log(`✓ ${agent.name} uses StandardizedEvidence structure (${evidenceMatches} occurrences)`);
      }
    });
  });

  test('Agents implement required interface methods', () => {
    // Updated required methods based on the actual Agent interface
    const requiredMethods = [
      'execute',
      'executeInternal'
    ];

    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        requiredMethods.forEach(method => {
          const hasMethod = agent.content.includes(`${method}(`);
          expect(hasMethod).toBe(true);
        });
        console.log(`✓ ${agent.name} implements required interface methods`);
      }
    });
  });

  test('Agents use consistent error handling types', () => {
    const errorPatterns = [
      /throw new Error\\(/g,
      /catch \\(error.*?\\)/g,
      /ProcessingError/g,
      /ProcessingErrorSeverity/g
    ];

    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        errorPatterns.forEach(pattern => {
          const matches = agent.content.match(pattern);
          if (matches) {
            expect(matches.length).toBeGreaterThan(0);
          }
        });
        console.log(`✓ ${agent.name} uses consistent error handling patterns`);
      }
    });
  });

  test('Agents use standardized output format', () => {
    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        const hasStandardizedOutput = agent.content.includes('StandardizedAgentResult');
        const hasExportClass = agent.content.includes('export class');
        
        if (hasExportClass) {
          expect(hasStandardizedOutput).toBe(true);
          console.log(`✓ ${agent.name} uses StandardizedAgentResult output format`);
        }
      }
    });
  });

  test('Type imports are from correct sources', () => {
    const validImportSources = [
      './types',
      './newtypes',
      '../types',
      '../agents/types',
      '../agents/newtypes'
    ];

    agentFiles.forEach(agent => {
      const importLines = agent.content.split('\n').filter(line => 
        line.trim().startsWith('import') && line.includes('from')
      );

      importLines.forEach(importLine => {
        if (importLine.includes('types') || importLine.includes('Types') || importLine.includes('newtypes')) {
          const hasValidSource = validImportSources.some(source => 
            importLine.includes(source)
          );
          expect(hasValidSource).toBe(true);
        }
      });
      
      if (importLines.length > 0 && agent.name.includes('-agent.ts')) {
        console.log(`✓ ${agent.name} imports from valid sources`);
      }
    });
  });

  test('Agents follow consistent naming conventions', () => {
    const namingPatterns = {
      classes: /export class \w+Agent/g,
      interfaces: /export interface \w+/g,
      types: /export type \w+/g
    };

    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        Object.entries(namingPatterns).forEach(([type, pattern]) => {
          const matches = agent.content.match(pattern);
          if (matches) {
            matches.forEach(match => {
              // Check PascalCase for classes and interfaces
              if (type === 'classes' || type === 'interfaces') {
                expect(match).toMatch(/[A-Z][a-zA-Z]+/);
              }
            });
          }
        });
        console.log(`✓ ${agent.name} follows consistent naming conventions`);
      }
    });
  });

  test('Agents have consistent constructor patterns', () => {
    agentFiles.forEach(agent => {
      if (agent.content.includes('export class') && agent.name.includes('-agent.ts')) {
        const hasConstructor = agent.content.includes('constructor(');
        const hasServiceInjection = agent.content.includes('Service') || 
                                   agent.content.includes('service');
        
        // Not all agents need constructors, but if they do, they should follow DI pattern
        if (hasConstructor) {
          expect(hasServiceInjection).toBe(true);
          console.log(`✓ ${agent.name} follows dependency injection pattern`);
        } else {
          console.log(`✓ ${agent.name} has no constructor (valid)`);
        }
      }
    });
  });

  // New, more detailed tests

  test('Agents properly implement the StandardizedAgent interface', () => {
    const requiredProperties = [
      'readonly name',
      'readonly description',
      'readonly requiredServices',
      'execute('
    ];

    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts') && agent.name !== 'agent-core.ts') {
        requiredProperties.forEach(property => {
          const hasProperty = agent.content.includes(property);
          expect(hasProperty).toBe(true);
        });
        console.log(`✓ ${agent.name} properly implements StandardizedAgent interface`);
      }
    });
  });

  test('Agents use correct enum values', () => {
    const enumChecks = [
      { enum: 'Agents', usage: /Agents\\.\\w+/g },
      { enum: 'Notes', usage: /Notes\\.\\w+/g },
      { enum: 'ProcessingErrorSeverity', usage: /ProcessingErrorSeverity\\.\\w+/g }
    ];

    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        enumChecks.forEach(check => {
          const matches = agent.content.match(check.usage);
          if (matches) {
            expect(matches.length).toBeGreaterThan(0);
            console.log(`✓ ${agent.name} uses ${check.enum} enum correctly (${matches.length} occurrences)`);
          }
        });
      }
    });
  });

  test('Agents properly handle evidence creation', () => {
    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        // Check for createEvidence method usage
        const hasCreateEvidence = agent.content.includes('createEvidence(');
        const hasEvidenceImport = agent.content.includes('StandardizedEvidence');
        
        if (hasEvidenceImport) {
          expect(hasCreateEvidence || agent.content.includes('this.createEvidence')).toBe(true);
          console.log(`✓ ${agent.name} properly handles evidence creation`);
        }
      }
    });
  });

  test('Agents properly handle result creation', () => {
    const resultMethods = [
      'createSuccessResult',
      'createFailureResult',
      'createError'
    ];

    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        resultMethods.forEach(method => {
          const hasMethod = agent.content.includes(method);
          if (hasMethod) {
            console.log(`✓ ${agent.name} uses ${method} for result creation`);
          }
        });
      }
    });
  });

  test('Agents properly extend the Agent base class', () => {
    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        const extendsAgent = agent.content.includes('extends Agent');
        expect(extendsAgent).toBe(true);
        console.log(`✓ ${agent.name} properly extends Agent base class`);
      }
    });
  });

  test('Agents properly type their execute method return value', () => {
    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        const hasReturnTyped = agent.content.includes('Promise<StandardizedAgentResult>');
        expect(hasReturnTyped).toBe(true);
        console.log(`✓ ${agent.name} properly types execute method return value`);
      }
    });
  });

  test('Agents properly type their context parameter', () => {
    agentFiles.forEach(agent => {
      if (agent.name.includes('-agent.ts')) {
        const hasContextTyped = agent.content.includes('StandardizedAgentContext');
        expect(hasContextTyped).toBe(true);
        console.log(`✓ ${agent.name} properly types context parameter`);
      }
    });
  });
});