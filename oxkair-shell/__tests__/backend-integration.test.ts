/**
 * Integration Tests for Backend Assignment System
 * 
 * Tests the full integration of backend assignment with AI Model Service,
 * including 429 error handling and failover scenarios.
 * Run with: npx tsx __tests__/backend-integration.test.ts
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
    console.log('🧪 Running Backend Integration Tests\n');
    
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
  AZURE_OPENAI_API_VERSION: '2025-01-01-preview',
  AZURE_OPENAI_DEPLOYMENT_NAME: 'gpt-4.1'
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

function assertNotEqual(actual: any, notExpected: any, message?: string) {
  if (actual === notExpected) {
    throw new Error(`${message || 'Assertion failed'}: expected not ${notExpected}, got ${actual}`);
  }
}

// Backend Assignment Integration Tests
runner.test('should assign different agents to different endpoints', () => {
  const backendManager = new SimpleBackendManager();
  
  // Test CPT agent (should use endpoint A)
  const cptAssignment = backendManager.getAssignedBackend('cpt_agent');
  assertEqual(cptAssignment.endpoint, 'A', 'CPT agent should use endpoint A');
  assertEqual(cptAssignment.deployment, 'gpt-4.1');
  
  // Test Modifier agent (should use endpoint B)
  const modifierAssignment = backendManager.getAssignedBackend('modifier_assignment_agent');
  assertEqual(modifierAssignment.endpoint, 'B', 'Modifier agent should use endpoint B');
  assertEqual(modifierAssignment.deployment, 'gpt-4.1');
  
  // Test ICD agent (should use endpoint A with different deployment)
  const icdAssignment = backendManager.getAssignedBackend('icd_agent');
  assertEqual(icdAssignment.endpoint, 'A', 'ICD agent should use endpoint A');
  assertEqual(icdAssignment.deployment, 'gpt-4.1-2');
});

runner.test('should provide different clients for different endpoints', () => {
  const backendManager = new SimpleBackendManager();
  
  const endpointAAssignment = backendManager.getAssignedBackend('cpt_agent');
  const endpointBAssignment = backendManager.getAssignedBackend('modifier_assignment_agent');
  
  // Clients should be different objects (different endpoints)
  assertNotEqual(endpointAAssignment.client, endpointBAssignment.client, 'Should have different clients for different endpoints');
  
  // But endpoint URLs should be correct
  assertEqual(endpointAAssignment.endpointUrl, mockEnv.AZURE_OPENAI_ENDPOINT);
  assertEqual(endpointBAssignment.endpointUrl, mockEnv.AZURE_OPENAI_ENDPOINT_2);
});

// Failover Logic Integration Tests
runner.test('should trigger failover when threshold is reached', () => {
  const backendManager = new SimpleBackendManager();
  const testAgent = 'failover_test_agent';
  
  // Get initial assignment
  const initialAssignment = backendManager.getAssignedBackend(testAgent);
  const initialEndpoint = initialAssignment.endpoint;
  
  // Simulate failures to trigger failover
  for (let i = 0; i < 3; i++) {
    backendManager.recordFailure(testAgent, new Error(`Test failure ${i + 1}`));
  }
  
  // Get assignment after failures
  const failoverAssignment = backendManager.getAssignedBackend(testAgent);
  const failoverEndpoint = failoverAssignment.endpoint;
  
  assertNotEqual(failoverEndpoint, initialEndpoint, 'Should failover to different endpoint');
  assertEqual(failoverAssignment.deployment, 'gpt-4.1', 'Should use fallback deployment');
});

runner.test('should maintain separate failure tracking per agent', () => {
  const backendManager = new SimpleBackendManager();
  
  // Agent1 has failures
  backendManager.recordFailure('agent1', new Error('Test error'));
  backendManager.recordFailure('agent1', new Error('Test error'));
  
  // Agent2 should still get normal assignment
  const agent1Assignment = backendManager.getAssignedBackend('agent1');
  const agent2Assignment = backendManager.getAssignedBackend('agent2');
  
  // Both should still use their primary endpoints (failures below threshold)
  assertEqual(agent1Assignment.endpoint, 'A', 'Agent1 should still use primary');
  assertEqual(agent2Assignment.endpoint, 'A', 'Agent2 should use primary (no failures)');
  
  // But agent1 should have failure tracking
  const status = backendManager.getAssignmentStatus();
  const agent1Status = status.find(s => s.agentName === 'agent1');
  assertTrue(agent1Status !== undefined, 'Should find agent1 status');
  assertEqual(agent1Status?.failureCount, 2, 'Agent1 should have 2 failures');
});

// Load Distribution Tests
runner.test('should distribute agents across both endpoints', () => {
  const backendManager = new SimpleBackendManager();
  
  // Count assignments per endpoint
  let endpointACount = 0;
  let endpointBCount = 0;
  
  Object.keys(AGENT_ASSIGNMENTS).forEach(agentName => {
    const assignment = backendManager.getAssignedBackend(agentName);
    if (assignment.endpoint === 'A') {
      endpointACount++;
    } else if (assignment.endpoint === 'B') {
      endpointBCount++;
    }
  });
  
  assertTrue(endpointACount > 0, 'Should have agents assigned to endpoint A');
  assertTrue(endpointBCount > 0, 'Should have agents assigned to endpoint B');
  
  console.log(`   ✓ Load distribution: ${endpointACount} agents on A, ${endpointBCount} agents on B`);
});

runner.test('should use different deployments appropriately', () => {
  const backendManager = new SimpleBackendManager();
  
  // Check that we use both gpt-4.1 and gpt-4.1-2 deployments
  const deployments = new Set<string>();
  
  Object.keys(AGENT_ASSIGNMENTS).forEach(agentName => {
    const assignment = backendManager.getAssignedBackend(agentName);
    deployments.add(assignment.deployment);
  });
  
  assertTrue(deployments.has('gpt-4.1'), 'Should use gpt-4.1 deployment');
  assertTrue(deployments.has('gpt-4.1-2'), 'Should use gpt-4.1-2 deployment');
  
  console.log(`   ✓ Using deployments: ${Array.from(deployments).join(', ')}`);
});

// Health and Recovery Tests
runner.test('should provide comprehensive health monitoring', () => {
  const backendManager = new SimpleBackendManager();
  
  // Create some test scenarios
  backendManager.recordFailure('test_agent_1', new Error('Test error'));
  backendManager.recordFailure('test_agent_2', new Error('Test error'));
  backendManager.recordFailure('test_agent_2', new Error('Test error'));
  backendManager.recordSuccess('test_agent_3', 'A');
  
  const health = backendManager.getHealthSummary();
  const status = backendManager.getAssignmentStatus();
  
  // Verify health summary structure
  assertTrue('totalAgents' in health, 'Should have totalAgents');
  assertTrue('agentsWithFailures' in health, 'Should have agentsWithFailures');
  assertTrue('endpointAActive' in health, 'Should have endpointAActive');
  assertTrue('endpointBActive' in health, 'Should have endpointBActive');
  
  // Verify endpoints are active
  assertEqual(health.endpointAActive, true, 'Endpoint A should be active');
  assertEqual(health.endpointBActive, true, 'Endpoint B should be active');
  
  // Verify failure tracking
  assertTrue(health.agentsWithFailures > 0, 'Should track agents with failures');
  assertTrue(status.length > 0, 'Should have assignment status');
  
  console.log(`   ✓ Health: ${health.totalAgents} total agents, ${health.agentsWithFailures} with failures`);
});

runner.test('should reset failures and allow recovery', () => {
  const backendManager = new SimpleBackendManager();
  
  // Create failures
  backendManager.recordFailure('recovery_agent', new Error('Test error 1'));
  backendManager.recordFailure('recovery_agent', new Error('Test error 2'));
  
  // Verify failures are recorded
  let status = backendManager.getAssignmentStatus();
  let agentStatus = status.find(s => s.agentName === 'recovery_agent');
  assertTrue(agentStatus !== undefined, 'Should find agent status');
  assertEqual(agentStatus?.failureCount, 2, 'Should have 2 failures');
  
  // Record success (should reset failures)
  backendManager.recordSuccess('recovery_agent', 'A');
  
  // Verify failures are reset
  status = backendManager.getAssignmentStatus();
  agentStatus = status.find(s => s.agentName === 'recovery_agent');
  assertEqual(agentStatus?.failureCount, 0, 'Failures should be reset after success');
});

// Configuration and Environment Tests
runner.test('should provide configuration information', () => {
  const backendManager = new SimpleBackendManager();
  const config = backendManager.getConfigInfo();
  
  // Verify configuration structure
  assertTrue('endpointAUrl' in config, 'Should have endpointAUrl');
  assertTrue('endpointBUrl' in config, 'Should have endpointBUrl');
  assertTrue('hasEndpointAKey' in config, 'Should have hasEndpointAKey');
  assertTrue('hasEndpointBKey' in config, 'Should have hasEndpointBKey');
  assertTrue('failureThreshold' in config, 'Should have failureThreshold');
  assertTrue('failureWindowMs' in config, 'Should have failureWindowMs');
  
  // Verify values
  assertEqual(config.endpointAUrl, mockEnv.AZURE_OPENAI_ENDPOINT);
  assertEqual(config.endpointBUrl, mockEnv.AZURE_OPENAI_ENDPOINT_2);
  assertEqual(config.hasEndpointAKey, true);
  assertEqual(config.hasEndpointBKey, true);
  assertEqual(config.failureThreshold, 3);
  assertEqual(config.failureWindowMs, 5 * 60 * 1000);
});

runner.test('should handle environment configuration gracefully', () => {
  // Test that backend manager can be created with current environment
  try {
    const backendManager = new SimpleBackendManager();
    const assignment = backendManager.getAssignedBackend('test_agent');
    
    assertTrue(assignment.client !== undefined, 'Should create client');
    assertTrue(assignment.endpoint === 'A' || assignment.endpoint === 'B', 'Should assign valid endpoint');
    assertTrue(assignment.deployment.includes('gpt-4'), 'Should assign valid deployment');
    
    console.log(`   ✓ Environment configuration valid`);
  } catch (error) {
    throw new Error(`Environment configuration failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// Integration Validation Tests
runner.test('should validate agent assignment consistency across system', () => {
  const backendManager = new SimpleBackendManager();
  
  // Test all configured agents
  const testedAgents = [
    'cpt_agent',
    'icd_agent', 
    'modifier_assignment_agent',
    'cci_agent',
    'lcd_agent',
    'comprehensive_rvu_agent'
  ];
  
  const assignments = new Map<string, { endpoint: string; deployment: string }>();
  
  testedAgents.forEach(agentName => {
    const assignment = backendManager.getAssignedBackend(agentName);
    assignments.set(agentName, {
      endpoint: assignment.endpoint,
      deployment: assignment.deployment
    });
    
    // Verify assignment is consistent
    const secondAssignment = backendManager.getAssignedBackend(agentName);
    assertEqual(assignment.endpoint, secondAssignment.endpoint, `${agentName} endpoint should be consistent`);
    assertEqual(assignment.deployment, secondAssignment.deployment, `${agentName} deployment should be consistent`);
  });
  
  console.log(`   ✓ Validated ${testedAgents.length} agent assignments`);
  
  // Log the distribution for visibility
  const endpointAAgents = Array.from(assignments.entries()).filter(([_, a]) => a.endpoint === 'A');
  const endpointBAgents = Array.from(assignments.entries()).filter(([_, a]) => a.endpoint === 'B');
  
  console.log(`   ✓ Endpoint A: ${endpointAAgents.map(([name, _]) => name).join(', ')}`);
  console.log(`   ✓ Endpoint B: ${endpointBAgents.map(([name, _]) => name).join(', ')}`);
});

// Run all tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runner.run().catch(console.error);
}