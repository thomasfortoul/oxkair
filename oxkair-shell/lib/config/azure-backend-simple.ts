/**
 * Simple Azure Backend Configuration
 * 
 * Provides basic configuration and assignment logic for Azure OpenAI backends
 * to handle rate limiting through sticky assignment and controlled failover.
 */

export interface SimpleBackendConfig {
  endpointA: {
    url: string;
    apiKey: string;
    deployments: ['gpt-4.1', 'gpt-4.1-2'];
  };
  endpointB: {
    url: string;
    apiKey: string;
    deployments: ['gpt-4.1', 'gpt-4.1-2'];
  };
}

export interface AgentBackendAssignment {
  agentName: string;
  primaryEndpoint: 'A' | 'B';
  primaryDeployment: string;
  failureCount: number;
  lastFailureAt?: Date;
}

/**
 * Simple deterministic assignment of agents to specific endpoint/deployment combinations.
 * This ensures each agent always uses the same backend unless failover is triggered.
 */
export const AGENT_ASSIGNMENTS: Record<string, { endpoint: 'A' | 'B'; deployment: string }> = {
  // Endpoint A assignments
  'cpt_agent': { endpoint: 'A', deployment: 'gpt-4.1' },
  'icd_agent': { endpoint: 'A', deployment: 'gpt-4.1-2' },
  'lcd_agent': { endpoint: 'A', deployment: 'gpt-4.1' }, // Shared with CPT
  'lcd_coverage_agent': { endpoint: 'A', deployment: 'gpt-4.1' }, // Alternative name
  
  // Endpoint B assignments
  'modifier_assignment_agent': { endpoint: 'B', deployment: 'gpt-4.1' },
  'cci_agent': { endpoint: 'B', deployment: 'gpt-4.1-2' },
  'cci_validation_agent': { endpoint: 'B', deployment: 'gpt-4.1-2' }, // Alternative name
  'comprehensive_rvu_agent': { endpoint: 'B', deployment: 'gpt-4.1' }, // Shared with Modifier
  
  // Additional agents that might exist
  'code_extraction_agent': { endpoint: 'A', deployment: 'gpt-4.1-2' },
  'vector_search_service': { endpoint: 'A', deployment: 'gpt-4.1' },
};

/**
 * Loads backend configuration from environment variables.
 * Falls back to reasonable defaults if environment variables are missing.
 */
export function loadSimpleBackendConfig(): SimpleBackendConfig {
  const endpointA = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKeyA = process.env.AZURE_OPENAI_API_KEY;
  const endpointB = process.env.AZURE_OPENAI_ENDPOINT_2;
  const apiKeyB = process.env.AZURE_OPENAI_API_KEY_2;

  if (!endpointA || !apiKeyA) {
    throw new Error('AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be configured');
  }

  if (!endpointB || !apiKeyB) {
    console.warn('AZURE_OPENAI_ENDPOINT_2 and AZURE_OPENAI_API_KEY_2 not configured. Fallback will use primary endpoint.');
  }

  return {
    endpointA: {
      url: endpointA,
      apiKey: apiKeyA,
      deployments: ['gpt-4.1', 'gpt-4.1-2'],
    },
    endpointB: {
      url: endpointB || endpointA, // Fallback to endpoint A if B not configured
      apiKey: apiKeyB || apiKeyA, // Fallback to key A if B not configured
      deployments: ['gpt-4.1', 'gpt-4.1-2'],
    },
  };
}

/**
 * Gets the assigned endpoint and deployment for a given agent.
 * Returns a default assignment if the agent is not explicitly configured.
 */
export function getAgentAssignment(agentName: string): { endpoint: 'A' | 'B'; deployment: string } {
  const assignment = AGENT_ASSIGNMENTS[agentName];
  if (assignment) {
    return assignment;
  }

  // Default fallback for unknown agents - use endpoint A, gpt-4.1
  console.warn(`No explicit assignment found for agent '${agentName}', using default: Endpoint A, gpt-4.1`);
  return { endpoint: 'A', deployment: 'gpt-4.1' };
}

/**
 * Validates that the backend configuration is properly set up.
 */
export function validateBackendConfig(config: SimpleBackendConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.endpointA.url || !config.endpointA.url.startsWith('https://')) {
    errors.push('Endpoint A URL is invalid or missing');
  }

  if (!config.endpointA.apiKey || config.endpointA.apiKey.length < 10) {
    errors.push('Endpoint A API key is invalid or missing');
  }

  if (!config.endpointB.url || !config.endpointB.url.startsWith('https://')) {
    errors.push('Endpoint B URL is invalid or missing');
  }

  if (!config.endpointB.apiKey || config.endpointB.apiKey.length < 10) {
    errors.push('Endpoint B API key is invalid or missing');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}