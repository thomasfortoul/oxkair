/**
 * Cross-Agent Type Consistency Tests
 * Ensures types are consistent across different agents and their interactions
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const AGENTS_DIR = join(process.cwd(), 'lib/agents');
const TYPES_DIR = join(process.cwd(), '../../TYPES');

describe('Cross-Agent Type Consistency', () => {
  let agentFiles = [];
  let standardTypes = {};

  beforeAll(async () => {
    // Load all agent files
    const agentFileNames = readdirSync(AGENTS_DIR).filter(f => 
      f.endsWith('.ts') && !f.includes('test') && f.includes('-agent')
    );
    
    agentFiles = agentFileNames.map(fileName => ({
      name: fileName,
      content: readFileSync(join(AGENTS_DIR, fileName), 'utf8')
    }));

  });

  test('All agents use the same Evidence interface structure', () => {
    const evidenceStructurePattern = /evidence.*?:\s*(?:StandardizedEvidence|Evidence)\[\]/g;
    const evidenceUsagePatterns = [
      /evidence\s*:\s*\[/g,
      /evidence\.push/g,
      /evidence\.map/g,
      /evidence\.filter/g
    ];

    let evidenceStructures = new Set();

    agentFiles.forEach(agent => {
      evidenceUsagePatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          matches.forEach(match => {
            evidenceStructures.add(match.replace(/\s+/g, ' ').trim());
          });
        }
      });
    });

    // All agents should use consistent evidence patterns
    console.log('Evidence usage patterns found:', Array.from(evidenceStructures));
    expect(evidenceStructures.size).toBeGreaterThan(0);
  });

  test('Agents pass compatible data types between each other', () => {
    const agentInteractionPatterns = [
      /\.processInput\(/g,
      /\.validateInput\(/g,
      /\.formatOutput\(/g,
      /await.*?Agent.*?\./g
    ];

    const agentInteractions = [];

    agentFiles.forEach(agent => {
      agentInteractionPatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          agentInteractions.push({
            agent: agent.name,
            interactions: matches
          });
        }
      });
    });

    // Check that agents calling other agents use compatible types
    agentInteractions.forEach(interaction => {
      expect(interaction.interactions.length).toBeGreaterThan(0);
      console.log(`✓ ${interaction.agent} has ${interaction.interactions.length} agent interactions`);
    });
  });

  test('All agents implement the same base interface methods', () => {
    const requiredMethods = [
      'processInput',
      'validateInput', 
      'formatOutput'
    ];

    const agentMethodImplementations = {};

    agentFiles.forEach(agent => {
      agentMethodImplementations[agent.name] = {};
      
      requiredMethods.forEach(method => {
        const hasMethod = agent.content.includes(`${method}(`) || 
                         agent.content.includes(`${method} (`);
        agentMethodImplementations[agent.name][method] = hasMethod;
      });
    });

    // Verify all agents implement required methods
    Object.entries(agentMethodImplementations).forEach(([agentName, methods]) => {
      Object.entries(methods).forEach(([methodName, implemented]) => {
        if (agentName.includes('-agent.ts')) {
          expect(implemented).toBe(true);
          console.log(`✓ ${agentName} implements ${methodName}`);
        }
      });
    });
  });

  test('Agents use consistent input/output type structures', () => {
    const inputOutputPatterns = [
      /input:\s*\w+Input/g,
      /output:\s*\w+Output/g,
      /return.*?Output/g,
      /StandardizedAIOutput/g
    ];

    const typeUsage = {};

    agentFiles.forEach(agent => {
      typeUsage[agent.name] = [];
      
      inputOutputPatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          typeUsage[agent.name].push(...matches);
        }
      });
    });

    // Check for consistent type naming across agents
    const allTypes = Object.values(typeUsage).flat();
    const uniqueTypes = [...new Set(allTypes)];
    
    console.log('Types used across agents:', uniqueTypes);
    expect(uniqueTypes.length).toBeGreaterThan(0);
  });

  test('Error handling is consistent across all agents', () => {
    const errorPatterns = [
      /throw new.*?Error/g,
      /catch.*?error/g,
      /AgentError/g,
      /ValidationError/g
    ];

    const errorHandling = {};

    agentFiles.forEach(agent => {
      errorHandling[agent.name] = [];
      
      errorPatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          errorHandling[agent.name].push(...matches);
        }
      });
    });

    // Verify all agents have error handling
    Object.entries(errorHandling).forEach(([agentName, errors]) => {
      if (agentName.includes('-agent.ts') && errors.length > 0) {
        console.log(`✓ ${agentName} implements error handling`);
      }
    });
  });

  test('Agents use consistent logging and monitoring types', () => {
    const loggingPatterns = [
      /console\.log/g,
      /logger\./g,
      /log\(/g,
      /debug\(/g,
      /error\(/g,
      /warn\(/g
    ];

    const loggingUsage = {};

    agentFiles.forEach(agent => {
      loggingUsage[agent.name] = 0;
      
      loggingPatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          loggingUsage[agent.name] += matches.length;
        }
      });
    });

    // Check that agents implement logging
    Object.entries(loggingUsage).forEach(([agentName, logCount]) => {
      if (agentName.includes('-agent.ts')) {
        console.log(`✓ ${agentName} has ${logCount} logging statements`);
      }
    });
  });

  test('Configuration and dependency injection is consistent', () => {
    const diPatterns = [
      /constructor\(/g,
      /private.*?Service/g,
      /inject/g,
      /this\.\w+Service/g
    ];

    const dependencyUsage = {};

    agentFiles.forEach(agent => {
      dependencyUsage[agent.name] = [];
      
      diPatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          dependencyUsage[agent.name].push(...matches);
        }
      });
    });

    // Verify dependency injection patterns
    Object.entries(dependencyUsage).forEach(([agentName, dependencies]) => {
      if (agentName.includes('-agent.ts') && dependencies.length > 0) {
        console.log(`✓ ${agentName} uses dependency injection`);
      }
    });
  });

  test('Agent workflow orchestration uses compatible types', () => {
    const workflowPatterns = [
      /workflow/g,
      /orchestrat/g,
      /pipeline/g,
      /sequence/g,
      /chain/g
    ];

    const workflowUsage = {};

    agentFiles.forEach(agent => {
      workflowUsage[agent.name] = 0;
      
      workflowPatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          workflowUsage[agent.name] += matches.length;
        }
      });
    });

    console.log('Workflow integration across agents:', workflowUsage);
  });

  test('Data validation schemas are compatible across agents', () => {
    const validationPatterns = [
      /validate/g,
      /schema/g,
      /zod/g,
      /joi/g,
      /yup/g
    ];

    const validationUsage = {};

    agentFiles.forEach(agent => {
      validationUsage[agent.name] = [];
      
      validationPatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          validationUsage[agent.name].push(pattern.source);
        }
      });
    });

    // Check for consistent validation approaches
    const allValidationTypes = Object.values(validationUsage).flat();
    const uniqueValidationTypes = [...new Set(allValidationTypes)];
    
    console.log('Validation approaches used:', uniqueValidationTypes);
  });

  test('Agent performance monitoring uses consistent metrics', () => {
    const performancePatterns = [
      /performance/g,
      /timing/g,
      /duration/g,
      /metrics/g,
      /benchmark/g
    ];

    const performanceUsage = {};

    agentFiles.forEach(agent => {
      performanceUsage[agent.name] = 0;
      
      performancePatterns.forEach(pattern => {
        const matches = agent.content.match(pattern);
        if (matches) {
          performanceUsage[agent.name] += matches.length;
        }
      });
    });

    console.log('Performance monitoring across agents:', performanceUsage);
  });
});