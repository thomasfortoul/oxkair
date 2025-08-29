/**
 * Tests for SimpleBackendManager
 * 
 * Tests the core backend assignment, failover, and health tracking functionality.
 * Run with: npx tsx __tests__/simple-backend-manager.test.ts
 */

import { SimpleBackendManager } from '../lib/services/simple-backend-manager.js';
import { AGENT_ASSIGNMENTS } from '../lib/config/azure-backend-simple.js';

// Simple test framework
class TestRunner {
  private tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => void | Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('🧪 Running SimpleBackendManager Tests\n');
    
    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
        this.failed++;
      }
    }

    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Mock environment variables
const mockEnv = {
  AZURE_OPENAI_ENDPOINT: 'https://test-endpoint-a.cognitiveservices.azure.com/',
  AZURE_OPENAI_API_KEY: 'test-key-a-12345678901234567890123456789012',
  AZURE_OPENAI_ENDPOINT_2: 'https://test-endpoint-b.cognitiveservices.azure.com/',
  AZURE_OPENAI_API_KEY_2: 'test-key-b-12345678901234567890123456789012',
  AZURE_OPENAI_API_VERSION: '2025-01-01-preview'
};

// Setup test environment
const originalEnv = process.env;
Object.assign(process.env, mockEnv);

const runner = new TestRunner();

// Helper functions
function assertEqual(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Assertion failed: expected true');
  }
}

// Agent Assignment Consistency Tests
runner.test('should consistently assign same backend to same agent', () => {
  const backendManager = new SimpleBackendManager();
  const assignment1 = backendManager.getAssignedBackend('cpt_agent');
  const assignment2 = backendManager.getAssignedBackend('cpt_agent');
  
  assertEqual(assignment1.endpoint, assignment2.endpoint);
  assertEqual(assignment1.deployment, assignment2.deployment);
  assertEqual(assignment1.endpoint, 'A', 'CPT agent should use endpoint A');
  assertEqual(assignment1.deployment, 'gpt-4.1');
});

runner.test('should assign different agents to their configured backends', () => {
  const backendManager = new SimpleBackendManager();
  const cptAssignment = backendManager.getAssignedBackend('cpt_agent');
  const modifierAssignment = backendManager.getAssignedBackend('modifier_assignment_agent');
  
  assertEqual(cptAssignment.endpoint, 'A');
  assertEqual(cptAssignment.deployment, 'gpt-4.1');
  assertEqual(modifierAssignment.endpoint, 'B');
  assertEqual(modifierAssignment.deployment, 'gpt-4.1');
});

runner.test('should handle unknown agents with default assignment', () => {
  const backendManager = new SimpleBackendManager();
  const unknownAssignment = backendManager.getAssignedBackend('unknown_agent');
  
  assertEqual(unknownAssignment.endpoint, 'A');
  assertEqual(unknownAssignment.deployment, 'gpt-4.1');
});

runner.test('should verify all configured agents have valid assignments', () => {
  const backendManager = new SimpleBackendManager();
  Object.keys(AGENT_ASSIGNMENTS).forEach(agentName => {
    const assignment = backendManager.getAssignedBackend(agentName);
    const expectedAssignment = AGENT_ASSIGNMENTS[agentName];
    
    assertEqual(assignment.endpoint, expectedAssignment.endpoint, `Agent ${agentName} endpoint mismatch`);
    assertEqual(assignment.deployment, expectedAssignment.deployment, `Agent ${agentName} deployment mismatch`);
  });
});

// Failure Tracking and Failover Tests
runner.test('should not failover before threshold is reached', () => {
  const backendManager = new SimpleBackendManager();
  // Record 2 failures (below threshold of 3)
  backendManager.recordFailure('cpt_agent', new Error('test error 1'));
  backendManager.recordFailure('cpt_agent', new Error('test error 2'));
  
  const assignment = backendManager.getAssignedBackend('cpt_agent');
  assertEqual(assignment.endpoint, 'A', 'Should still use primary endpoint');
});

runner.test('should failover after threshold is reached', () => {
  const backendManager = new SimpleBackendManager();
  // Record 3 failures (meets threshold)
  for (let i = 0; i < 3; i++) {
    backendManager.recordFailure('cpt_agent', new Error(`test error ${i + 1}`));
  }
  
  const assignment = backendManager.getAssignedBackend('cpt_agent');
  assertEqual(assignment.endpoint, 'B', 'Should failover to endpoint B');
  assertEqual(assignment.deployment, 'gpt-4.1', 'Should use fallback deployment');
});

runner.test('should reset failure count on successful request', () => {
  const backendManager = new SimpleBackendManager();
  // Record failures
  for (let i = 0; i < 2; i++) {
    backendManager.recordFailure('cpt_agent', new Error(`test error ${i + 1}`));
  }
  
  // Record success
  backendManager.recordSuccess('cpt_agent', 'A');
  
  // Should still use primary endpoint after success
  const assignment = backendManager.getAssignedBackend('cpt_agent');
  assertEqual(assignment.endpoint, 'A');
});

runner.test('should handle failures outside time window', () => {
  const backendManager = new SimpleBackendManager();
  const oldFailureTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
  
  // Manually set old failures (simulating failures outside window)
  backendManager.recordFailure('cpt_agent', new Error('old error'));
  
  // Modify the internal assignment to have old timestamp
  const assignments = (backendManager as any).assignments;
  const assignment = assignments.get('cpt_agent');
  if (assignment) {
    assignment.lastFailureAt = oldFailureTime;
    assignment.failureCount = 5; // High count but old timestamp
  }
  
  // Should not failover due to old timestamp
  const currentAssignment = backendManager.getAssignedBackend('cpt_agent');
  assertEqual(currentAssignment.endpoint, 'A', 'Should use primary');
});

// Health and Status Monitoring Tests
runner.test('should provide assignment status for all tracked agents', () => {
  const backendManager = new SimpleBackendManager();
  // Create some assignments with failures
  backendManager.recordFailure('cpt_agent', new Error('test'));
  backendManager.recordFailure('modifier_assignment_agent', new Error('test'));
  backendManager.recordFailure('modifier_assignment_agent', new Error('test'));
  
  const status = backendManager.getAssignmentStatus();
  
  assertTrue(status.length > 0, 'Should have assignment status');
  
  const cptStatus = status.find(s => s.agentName === 'cpt_agent');
  assertTrue(cptStatus !== undefined, 'Should find CPT agent status');
  assertEqual(cptStatus?.failureCount, 1);
  assertEqual(cptStatus?.shouldFailover, false);
  
  const modifierStatus = status.find(s => s.agentName === 'modifier_assignment_agent');
  assertTrue(modifierStatus !== undefined, 'Should find modifier agent status');
  assertEqual(modifierStatus?.failureCount, 2);
});

runner.test('should provide health summary', () => {
  const backendManager = new SimpleBackendManager();
  // Add some agents with different failure states
  backendManager.recordFailure('cpt_agent', new Error('test'));
  backendManager.recordSuccess('icd_agent', 'A');
  
  const health = backendManager.getHealthSummary();
  
  assertTrue('totalAgents' in health, 'Should have totalAgents property');
  assertTrue('agentsWithFailures' in health, 'Should have agentsWithFailures property');
  assertTrue('agentsInFailover' in health, 'Should have agentsInFailover property');
  assertTrue('endpointAActive' in health, 'Should have endpointAActive property');
  assertTrue('endpointBActive' in health, 'Should have endpointBActive property');
  
  assertEqual(health.endpointAActive, true);
  assertEqual(health.endpointBActive, true);
  assertTrue(health.agentsWithFailures > 0, 'Should have agents with failures');
});

runner.test('should provide configuration information', () => {
  const backendManager = new SimpleBackendManager();
  const config = backendManager.getConfigInfo();
  
  assertEqual(config.endpointAUrl, mockEnv.AZURE_OPENAI_ENDPOINT);
  assertEqual(config.endpointBUrl, mockEnv.AZURE_OPENAI_ENDPOINT_2);
  assertEqual(config.hasEndpointAKey, true);
  assertEqual(config.hasEndpointBKey, true);
  assertEqual(config.failureThreshold, 3);
  assertEqual(config.failureWindowMs, 5 * 60 * 1000);
});

runner.test('should reset all failures', () => {
  const backendManager = new SimpleBackendManager();
  // Create failures for multiple agents
  backendManager.recordFailure('cpt_agent', new Error('test'));
  backendManager.recordFailure('modifier_assignment_agent', new Error('test'));
  
  // Reset all failures
  backendManager.resetAllFailures();
  
  // Check that failures are reset
  const status = backendManager.getAssignmentStatus();
  status.forEach(assignment => {
    assertEqual(assignment.failureCount, 0);
    assertEqual(assignment.lastFailureAt, undefined);
  });
});

// Backend Client Management Tests
runner.test('should return valid client and deployment info', () => {
  const backendManager = new SimpleBackendManager();
  const assignment = backendManager.getAssignedBackend('cpt_agent');
  
  assertTrue(assignment.client !== undefined, 'Should have client');
  assertEqual(assignment.deployment, 'gpt-4.1');
  assertEqual(assignment.endpoint, 'A');
  assertEqual(assignment.endpointUrl, mockEnv.AZURE_OPENAI_ENDPOINT);
});

runner.test('should handle fallback client correctly', () => {
  const backendManager = new SimpleBackendManager();
  // Force failover
  for (let i = 0; i < 3; i++) {
    backendManager.recordFailure('cpt_agent', new Error(`test error ${i + 1}`));
  }
  
  const assignment = backendManager.getAssignedBackend('cpt_agent');
  
  assertTrue(assignment.client !== undefined, 'Should have fallback client');
  assertEqual(assignment.endpoint, 'B', 'Should be fallback endpoint');
  assertEqual(assignment.deployment, 'gpt-4.1', 'Should be fallback deployment');
  assertEqual(assignment.endpointUrl, mockEnv.AZURE_OPENAI_ENDPOINT_2);
});

// Error Handling Tests
runner.test('should handle missing secondary endpoint gracefully', () => {
  // Test with missing endpoint B
  const originalEndpoint2 = process.env.AZURE_OPENAI_ENDPOINT_2;
  delete process.env.AZURE_OPENAI_ENDPOINT_2;
  
  try {
    new SimpleBackendManager(); // Should not throw
    console.log('   ✓ Handled missing endpoint B gracefully');
  } catch (error) {
    throw new Error('Should fallback gracefully when endpoint B is missing');
  } finally {
    // Restore environment
    if (originalEndpoint2) {
      process.env.AZURE_OPENAI_ENDPOINT_2 = originalEndpoint2;
    }
  }
});

runner.test('should handle invalid primary configuration', () => {
  // Test with completely missing primary endpoint
  const originalEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const originalKey = process.env.AZURE_OPENAI_API_KEY;
  
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.AZURE_OPENAI_API_KEY;
  
  let threwError = false;
  try {
    new SimpleBackendManager();
  } catch (error) {
    threwError = true;
  }
  
  // Restore environment
  if (originalEndpoint) process.env.AZURE_OPENAI_ENDPOINT = originalEndpoint;
  if (originalKey) process.env.AZURE_OPENAI_API_KEY = originalKey;
  
  assertTrue(threwError, 'Should throw for missing primary config');
});

// Run all tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runner.run().catch(console.error);
}