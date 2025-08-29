/**
 * Simple Backend Manager
 * 
 * Manages Azure OpenAI backend assignments, health tracking, and failover logic.
 * Implements sticky assignment with simple threshold-based failover.
 */

import { AzureOpenAI } from 'openai';
import { 
  AgentBackendAssignment, 
  loadSimpleBackendConfig, 
  getAgentAssignment,
  validateBackendConfig,
  SimpleBackendConfig
} from '../config/azure-backend-simple.ts';

export interface BackendInfo {
  client: AzureOpenAI;
  deployment: string;
  endpoint: string;
  endpointUrl: string;
}

export class SimpleBackendManager {
  private config: SimpleBackendConfig;
  private assignments = new Map<string, AgentBackendAssignment>();
  private clients = new Map<string, AzureOpenAI>();
  private isInitialized = false;

  // Configuration constants
  private readonly FAILURE_THRESHOLD = 3;
  private readonly FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  
  constructor() {
    this.config = loadSimpleBackendConfig();
    this.validateConfiguration();
    this.initializeClients();
  }

  /**
   * Validates the backend configuration on startup.
   */
  private validateConfiguration(): void {
    const validation = validateBackendConfig(this.config);
    if (!validation.valid) {
      throw new Error(`Backend configuration validation failed: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * Initializes Azure OpenAI clients for both endpoints.
   */
  private initializeClients(): void {
    try {
      // Endpoint A client
      this.clients.set('A', new AzureOpenAI({
        endpoint: this.config.endpointA.url,
        apiKey: this.config.endpointA.apiKey,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview',
      }));

      // Endpoint B client
      this.clients.set('B', new AzureOpenAI({
        endpoint: this.config.endpointB.url,
        apiKey: this.config.endpointB.apiKey,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview',
      }));

      this.isInitialized = true;
      console.log('[SimpleBackendManager] Successfully initialized clients for both endpoints');
    } catch (error) {
      console.error('[SimpleBackendManager] Failed to initialize clients:', error);
      throw new Error(`Failed to initialize Azure OpenAI clients: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the assigned backend for a given agent.
   * Implements sticky assignment with failover logic.
   */
  getAssignedBackend(agentName: string): BackendInfo {
    if (!this.isInitialized) {
      throw new Error('SimpleBackendManager is not properly initialized');
    }

    const assignment = getAgentAssignment(agentName);
    const agentAssignment = this.assignments.get(agentName);

    // Check if we should failover due to repeated failures
    if (this.shouldFailover(agentAssignment)) {
      console.warn(`[SimpleBackendManager] Triggering failover for agent '${agentName}' due to repeated failures`);
      return this.getFallbackBackend(assignment.endpoint, agentName);
    }

    // Return primary assignment
    const client = this.clients.get(assignment.endpoint);
    if (!client) {
      throw new Error(`Client not found for endpoint ${assignment.endpoint}`);
    }

    return {
      client,
      deployment: assignment.deployment,
      endpoint: assignment.endpoint,
      endpointUrl: assignment.endpoint === 'A' ? this.config.endpointA.url : this.config.endpointB.url,
    };
  }

  /**
   * Records a failure for the given agent.
   * Updates failure count and timestamp for failover decision making.
   */
  recordFailure(agentName: string, error: any): void {
    const primaryAssignment = getAgentAssignment(agentName);
    const assignment = this.assignments.get(agentName) || {
      agentName,
      primaryEndpoint: primaryAssignment.endpoint,
      primaryDeployment: primaryAssignment.deployment,
      failureCount: 0,
    };

    assignment.failureCount++;
    assignment.lastFailureAt = new Date();
    this.assignments.set(agentName, assignment);

    console.warn(`[SimpleBackendManager] Recorded failure for agent '${agentName}' (count: ${assignment.failureCount})`, {
      agentName,
      endpoint: assignment.primaryEndpoint,
      deployment: assignment.primaryDeployment,
      failureCount: assignment.failureCount,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * Records a successful request for the given agent.
   * Resets failure count to allow return to primary backend.
   */
  recordSuccess(agentName: string, endpointUsed: string): void {
    const assignment = this.assignments.get(agentName);
    if (assignment) {
      const previousFailureCount = assignment.failureCount;
      assignment.failureCount = 0;
      assignment.lastFailureAt = undefined;
      this.assignments.set(agentName, assignment);

      if (previousFailureCount > 0) {
        console.info(`[SimpleBackendManager] Reset failure count for agent '${agentName}' after successful request`, {
          agentName,
          endpointUsed,
          previousFailureCount,
        });
      }
    }
  }

  /**
   * Determines if an agent should failover to a different backend.
   * Uses simple threshold logic: 3 failures within 5 minutes.
   */
  private shouldFailover(assignment?: AgentBackendAssignment): boolean {
    if (!assignment || assignment.failureCount < this.FAILURE_THRESHOLD) {
      return false;
    }

    if (!assignment.lastFailureAt) {
      return false;
    }

    // Check if failures occurred within the time window
    const windowStart = new Date(Date.now() - this.FAILURE_WINDOW_MS);
    const shouldFailover = assignment.lastFailureAt > windowStart;

    if (shouldFailover) {
      console.warn(`[SimpleBackendManager] Failover threshold reached for agent '${assignment.agentName}'`, {
        failureCount: assignment.failureCount,
        threshold: this.FAILURE_THRESHOLD,
        lastFailureAt: assignment.lastFailureAt,
        windowStart,
      });
    }

    return shouldFailover;
  }

  /**
   * Gets a fallback backend for the given agent.
   * Simple strategy: use the other endpoint with gpt-4.1 deployment.
   */
  private getFallbackBackend(primaryEndpoint: 'A' | 'B', agentName: string): BackendInfo {
    const fallbackEndpoint = primaryEndpoint === 'A' ? 'B' : 'A';
    const fallbackDeployment = 'gpt-4.1'; // Always use gpt-4.1 for fallback

    const client = this.clients.get(fallbackEndpoint);
    if (!client) {
      throw new Error(`Fallback client not found for endpoint ${fallbackEndpoint}`);
    }

    console.info(`[SimpleBackendManager] Using fallback backend for agent '${agentName}'`, {
      agentName,
      primaryEndpoint,
      fallbackEndpoint,
      fallbackDeployment,
    });

    return {
      client,
      deployment: fallbackDeployment,
      endpoint: fallbackEndpoint,
      endpointUrl: fallbackEndpoint === 'A' ? this.config.endpointA.url : this.config.endpointB.url,
    };
  }

  /**
   * Gets current assignment status for all tracked agents.
   * Useful for monitoring and debugging.
   */
  getAssignmentStatus(): Array<AgentBackendAssignment & { shouldFailover: boolean }> {
    return Array.from(this.assignments.values()).map(assignment => ({
      ...assignment,
      shouldFailover: this.shouldFailover(assignment),
    }));
  }

  /**
   * Gets health summary for monitoring.
   */
  getHealthSummary(): {
    totalAgents: number;
    agentsWithFailures: number;
    agentsInFailover: number;
    endpointAActive: boolean;
    endpointBActive: boolean;
  } {
    const assignments = Array.from(this.assignments.values());
    
    return {
      totalAgents: assignments.length,
      agentsWithFailures: assignments.filter(a => a.failureCount > 0).length,
      agentsInFailover: assignments.filter(a => this.shouldFailover(a)).length,
      endpointAActive: this.clients.has('A'),
      endpointBActive: this.clients.has('B'),
    };
  }

  /**
   * Resets failure counts for all agents.
   * Useful for recovery scenarios or testing.
   */
  resetAllFailures(): void {
    for (const assignment of this.assignments.values()) {
      assignment.failureCount = 0;
      assignment.lastFailureAt = undefined;
    }
    console.info('[SimpleBackendManager] Reset all failure counts');
  }

  /**
   * Gets configuration information (without sensitive data).
   */
  getConfigInfo(): {
    endpointAUrl: string;
    endpointBUrl: string;
    hasEndpointAKey: boolean;
    hasEndpointBKey: boolean;
    failureThreshold: number;
    failureWindowMs: number;
  } {
    return {
      endpointAUrl: this.config.endpointA.url,
      endpointBUrl: this.config.endpointB.url,
      hasEndpointAKey: !!this.config.endpointA.apiKey,
      hasEndpointBKey: !!this.config.endpointB.apiKey,
      failureThreshold: this.FAILURE_THRESHOLD,
      failureWindowMs: this.FAILURE_WINDOW_MS,
    };
  }
}