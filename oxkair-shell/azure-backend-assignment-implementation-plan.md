# Azure OpenAI Backend Assignment Implementation Plan (SIMPLIFIED)

## Overview
Implement sticky backend assignment for Azure OpenAI services to handle HTTP 429 rate limiting through controlled failover. **Focus on simplicity and minimal changes to existing codebase.**

## Current Environment Variables (Reference)
```bash
# Primary Endpoint (Endpoint A)
AZURE_OPENAI_ENDPOINT=https://thoma-me2wgbl0-eastus2.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4.1
AZURE_OPENAI_DEPLOYMENT_NAME_2=gpt-4.1-2

# Secondary Endpoint (Endpoint B) 
AZURE_OPENAI_ENDPOINT_2=https://oxkairfoundry.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY_2=<key>
# Uses same deployment names: gpt-4.1, gpt-4.1-2
```

## Agent-to-Deployment Assignment Strategy

### Primary Pool (Sticky Assignment)
- **CPT Agent**: Endpoint A, gpt-4.1
- **ICD Agent**: Endpoint A, gpt-4.1-2  
- **Modifier Agent**: Endpoint B, gpt-4.1
- **CCI Agent**: Endpoint B, gpt-4.1-2
- **LCD Agent**: Endpoint A, gpt-4.1 (shared with CPT)
- **RVU Agent**: Endpoint B, gpt-4.1 (shared with Modifier)

### Fallback Pool (Emergency Use)
- **All Agents**: Any available endpoint/deployment when primary fails

## SIMPLIFIED Implementation Plan

### Phase 1: Basic Backend Configuration (1 file)

#### File: `lib/config/azure-backend-simple.ts`
```typescript
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

// Simple deterministic assignment
export const AGENT_ASSIGNMENTS: Record<string, { endpoint: 'A' | 'B'; deployment: string }> = {
  'cpt_agent': { endpoint: 'A', deployment: 'gpt-4.1' },
  'icd_agent': { endpoint: 'A', deployment: 'gpt-4.1-2' },
  'modifier_assignment_agent': { endpoint: 'B', deployment: 'gpt-4.1' },
  'cci_agent': { endpoint: 'B', deployment: 'gpt-4.1-2' },
  'lcd_agent': { endpoint: 'A', deployment: 'gpt-4.1' },
  'comprehensive_rvu_agent': { endpoint: 'B', deployment: 'gpt-4.1' },
};

export function loadSimpleBackendConfig(): SimpleBackendConfig {
  return {
    endpointA: {
      url: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      deployments: ['gpt-4.1', 'gpt-4.1-2'],
    },
    endpointB: {
      url: process.env.AZURE_OPENAI_ENDPOINT_2!,
      apiKey: process.env.AZURE_OPENAI_API_KEY_2!,
      deployments: ['gpt-4.1', 'gpt-4.1-2'],
    },
  };
}
```

### Phase 2: Simple Backend Manager (1 file)

#### File: `lib/services/simple-backend-manager.ts`
```typescript
import { AzureOpenAI } from 'openai';
import { AGENT_ASSIGNMENTS, loadSimpleBackendConfig } from '../config/azure-backend-simple.ts';

export class SimpleBackendManager {
  private config = loadSimpleBackendConfig();
  private assignments = new Map<string, AgentBackendAssignment>();
  private clients = new Map<string, AzureOpenAI>();
  
  constructor() {
    this.initializeClients();
  }
  
  private initializeClients(): void {
    // Endpoint A client
    this.clients.set('A', new AzureOpenAI({
      endpoint: this.config.endpointA.url,
      apiKey: this.config.endpointA.apiKey,
      apiVersion: '2025-01-01-preview',
    }));
    
    // Endpoint B client
    this.clients.set('B', new AzureOpenAI({
      endpoint: this.config.endpointB.url,
      apiKey: this.config.endpointB.apiKey,
      apiVersion: '2025-01-01-preview',
    }));
  }
  
  getAssignedBackend(agentName: string): { client: AzureOpenAI; deployment: string; endpoint: string } {
    const assignment = AGENT_ASSIGNMENTS[agentName];
    if (!assignment) {
      // Fallback to endpoint A, gpt-4.1 for unknown agents
      return {
        client: this.clients.get('A')!,
        deployment: 'gpt-4.1',
        endpoint: 'A',
      };
    }
    
    // Check if we should failover (simple threshold: 3 failures in 5 minutes)
    const agentAssignment = this.assignments.get(agentName);
    if (this.shouldFailover(agentAssignment)) {
      return this.getFallbackBackend(assignment.endpoint);
    }
    
    return {
      client: this.clients.get(assignment.endpoint)!,
      deployment: assignment.deployment,
      endpoint: assignment.endpoint,
    };
  }
  
  recordFailure(agentName: string, error: any): void {
    const assignment = this.assignments.get(agentName) || {
      agentName,
      primaryEndpoint: AGENT_ASSIGNMENTS[agentName]?.endpoint || 'A',
      primaryDeployment: AGENT_ASSIGNMENTS[agentName]?.deployment || 'gpt-4.1',
      failureCount: 0,
    };
    
    assignment.failureCount++;
    assignment.lastFailureAt = new Date();
    this.assignments.set(agentName, assignment);
  }
  
  recordSuccess(agentName: string): void {
    // Reset failure count on success
    const assignment = this.assignments.get(agentName);
    if (assignment) {
      assignment.failureCount = 0;
      assignment.lastFailureAt = undefined;
    }
  }
  
  private shouldFailover(assignment?: AgentBackendAssignment): boolean {
    if (!assignment) return false;
    
    // Simple failover logic: 3 failures in last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return assignment.failureCount >= 3 && 
           assignment.lastFailureAt && 
           assignment.lastFailureAt > fiveMinutesAgo;
  }
  
  private getFallbackBackend(primaryEndpoint: 'A' | 'B'): { client: AzureOpenAI; deployment: string; endpoint: string } {
    // Simple fallback: use the other endpoint with gpt-4.1
    const fallbackEndpoint = primaryEndpoint === 'A' ? 'B' : 'A';
    return {
      client: this.clients.get(fallbackEndpoint)!,
      deployment: 'gpt-4.1',
      endpoint: fallbackEndpoint,
    };
  }
}
```

### Phase 3: Minimal AI Model Service Changes (1 file modification)

#### File: `lib/services/ai-model-service.ts` (modifications)
```typescript
import { SimpleBackendManager } from './simple-backend-manager.ts';

export class AIModelService implements IAIModelService {
  private config: AIModelConfig;
  private requestCount = 0;
  private totalTokensUsed = 0;
  private responseCache = new Map<string, { result: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private logger?: WorkflowLogger;
  private backendManager: SimpleBackendManager; // NEW
  private agentName: string; // NEW

  constructor(config: Partial<AIModelConfig> = {}, logger?: WorkflowLogger, agentName?: string) {
    this.config = {
      provider: config.provider || 'azure',
      model: config.model || process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '',
      temperature: 1,
      maxTokens: config.maxTokens ?? 2048,
      timeout: config.timeout ?? 60000,
      reasoning_effort: config.reasoning_effort
    };
    this.logger = logger;
    this.agentName = agentName || 'unknown_agent'; // NEW
    this.backendManager = new SimpleBackendManager(); // NEW
  }

  private getAzureClient(): { client: AzureOpenAI; deployment: string; endpoint: string } {
    // NEW: Use backend manager instead of single client
    return this.backendManager.getAssignedBackend(this.agentName);
  }

  async generateStructuredOutput<T>(prompt: string, schema: any, model?: string): Promise<T> {
    const cacheKey = JSON.stringify({ prompt, schema, model });
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result as T;
    }

    this.requestCount++;
    const startTime = Date.now();
    
    const selectedModel = model || this.config.model;
    const isLowReasoningModel = ['o4-mini', 'gpt-5', 'gpt-5-mini'].includes(selectedModel);

    if (this.config.provider === 'azure') {
      const { client, deployment, endpoint } = this.getAzureClient(); // MODIFIED
      
      const options: any = {
        model: deployment, // MODIFIED: Use assigned deployment
        messages: [
          { role: 'system', content: 'Generate JSON output matching the schema.' },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: this.config.maxTokens
      };

      if (isLowReasoningModel) {
        options.reasoning_effort = 'low';
      } else {
        options.temperature = 0.1;
      } 

      try {
        const response = await client.chat.completions.create(options);
        
        // Log successful request
        this.logger?.logInfo('AIModelService.generateStructuredOutput', 'Request successful', {
          agentName: this.agentName,
          endpoint,
          deployment,
          responseTime: Date.now() - startTime,
        });
        
        this.backendManager.recordSuccess(this.agentName); // NEW
        
        const requestDuration = Date.now() - startTime;
        const content = response.choices[0]?.message?.content ?? '';
        
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const resultObj = JSON.parse(cleanContent);
        
        if (response.usage?.total_tokens) {
          this.totalTokensUsed += response.usage.total_tokens;
          
          this.logAiUsage(
            'AIModelService.generateStructuredOutput',
            response.usage.prompt_tokens || 0,
            response.usage.completion_tokens || 0,
            requestDuration,
            selectedModel
          );
        }
        
        this.responseCache.set(cacheKey, { result: resultObj, timestamp: Date.now() });
        return resultObj as T;
        
      } catch (error: any) {
        // NEW: Handle 429 errors specifically
        if (error.status === 429) {
          const retryAfter = error.headers?.['retry-after'];
          this.logger?.logError('AIModelService.generateStructuredOutput', 'Rate limit hit (429)', {
            agentName: this.agentName,
            endpoint,
            deployment,
            retryAfter,
            error: error.message,
          });
          
          this.backendManager.recordFailure(this.agentName, error);
          
          // Immediate retry with potentially different backend
          const { client: fallbackClient, deployment: fallbackDeployment, endpoint: fallbackEndpoint } = this.getAzureClient();
          
          if (fallbackEndpoint !== endpoint) {
            this.logger?.logWarn('AIModelService.generateStructuredOutput', 'Retrying with fallback backend', {
              agentName: this.agentName,
              originalEndpoint: endpoint,
              fallbackEndpoint,
              fallbackDeployment,
            });
            
            // Retry once with fallback
            options.model = fallbackDeployment;
            const fallbackResponse = await fallbackClient.chat.completions.create(options);
            this.backendManager.recordSuccess(this.agentName);
            
            // Process fallback response (same logic as above)
            const fallbackContent = fallbackResponse.choices[0]?.message?.content ?? '';
            let cleanFallbackContent = fallbackContent.trim();
            if (cleanFallbackContent.startsWith('```json')) {
              cleanFallbackContent = cleanFallbackContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanFallbackContent.startsWith('```')) {
              cleanFallbackContent = cleanFallbackContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            const fallbackResultObj = JSON.parse(cleanFallbackContent);
            this.responseCache.set(cacheKey, { result: fallbackResultObj, timestamp: Date.now() });
            return fallbackResultObj as T;
          }
        }
        
        // Record other failures
        this.backendManager.recordFailure(this.agentName, error);
        throw error;
      }
    } else {
      // Existing OpenAI logic unchanged
      const client = openaiClient(selectedModel);
      
      const options: any = {
        model: client,
        prompt,
        schema,
        maxTokens: this.config.maxTokens
      };

      if (isLowReasoningModel) {
        options.reasoning_effort = 'low';
      } else {
        options.temperature = 0.1;
      }

      const result = await generateObject(options);
      
      const requestDuration = Date.now() - startTime;
      this.totalTokensUsed += result.usage.totalTokens;
      
      this.logAiUsage(
        'AIModelService.generateStructuredOutput',
        result.usage.promptTokens || 0,
        result.usage.completionTokens || 0,
        requestDuration,
        selectedModel
      );
      
      this.responseCache.set(cacheKey, { result: result.object, timestamp: Date.now() });
      return result.object as T;
    }
  }

  // Similar modifications for generateText method...
  async generateText(prompt: string, model?: string): Promise<string> {
    // Apply same backend management logic to generateText
    // (Similar pattern as generateStructuredOutput)
  }
}

// Update factory functions to include agent name
export function createDefaultAIModelService(logger?: WorkflowLogger, agentName?: string): AIModelService {
  return new AIModelService({
    provider: 'azure',
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1',
    temperature: 0.1,
    maxTokens: 2048,
    timeout: 60000
  }, logger, agentName);
}
```

### Phase 4: Agent Integration (Minimal Changes)

#### File: `lib/agents/agent-core.ts` (minimal modifications)
```typescript
export abstract class Agent {
  // Add helper method to create AI service with agent name
  protected createAIService(context: StandardizedAgentContext): AIModelService {
    return createDefaultAIModelService(context.logger, this.name);
  }
  
  // Existing code unchanged...
}
```

### Phase 5: Service Registry Update (1 modification)

#### File: `lib/services/service-registry.ts` (minimal modification)
```typescript
export class ServiceRegistry {
  // Update AI service creation to include agent context
  createAIModelService(logger?: WorkflowLogger, agentName?: string): AIModelService {
    return createDefaultAIModelService(logger, agentName);
  }
  
  // Existing code unchanged...
}
```

## Testing Strategy (Simplified)

### Unit Tests (1 file)
#### File: `__tests__/simple-backend-manager.test.ts`
```typescript
describe('SimpleBackendManager', () => {
  test('agent assignment consistency', () => {
    const manager = new SimpleBackendManager();
    const assignment1 = manager.getAssignedBackend('cpt_agent');
    const assignment2 = manager.getAssignedBackend('cpt_agent');
    expect(assignment1.endpoint).toBe(assignment2.endpoint);
    expect(assignment1.deployment).toBe(assignment2.deployment);
  });
  
  test('failover after threshold', () => {
    const manager = new SimpleBackendManager();
    
    // Record 3 failures
    for (let i = 0; i < 3; i++) {
      manager.recordFailure('cpt_agent', new Error('test'));
    }
    
    const assignment = manager.getAssignedBackend('cpt_agent');
    // Should failover to endpoint B
    expect(assignment.endpoint).toBe('B');
  });
});
```

### Integration Test (1 file)
#### File: `__tests__/backend-integration.test.ts`
```typescript
describe('Backend Integration', () => {
  test('429 handling and failover', async () => {
    // Mock 429 response from primary backend
    // Verify failover to secondary backend
    // Verify logging of failover event
  });
});
```

## Migration Steps

### Step 1: Add New Environment Variables
```bash
# Add to .env.local
AZURE_OPENAI_ENDPOINT_2=https://oxkairfoundry.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY_2=<key>
```

### Step 2: Deploy New Files
- `lib/config/azure-backend-simple.ts`
- `lib/services/simple-backend-manager.ts`

### Step 3: Update Existing Files
- Modify `lib/services/ai-model-service.ts` (add backend manager)
- Modify `lib/agents/agent-core.ts` (add agent name to AI service)
- Modify `lib/services/service-registry.ts` (pass agent name)

### Step 4: Test and Monitor
- Deploy to staging environment
- Monitor logs for backend assignments and failovers
- Verify no 429 errors under normal load

## Key Benefits of Simplified Approach

1. **Minimal Code Changes**: Only 3 new files, minimal modifications to existing files
2. **No Complex State Management**: Simple in-memory tracking, no persistence required
3. **Deterministic Assignment**: Each agent always gets the same backend (unless failover)
4. **Immediate Failover**: No retry delays, immediate switch to fallback backend
5. **Clear Observability**: All backend operations logged with agent context
6. **Easy Rollback**: Can disable by reverting AI service changes

## Monitoring and Observability

### Key Metrics to Track
- Backend assignment distribution
- 429 error rates per endpoint
- Failover frequency per agent
- Response times per backend
- Success rates after failover

### Log Examples
```json
{
  "level": "info",
  "message": "Request successful",
  "agentName": "cpt_agent",
  "endpoint": "A",
  "deployment": "gpt-4.1",
  "responseTime": 1250
}

{
  "level": "error", 
  "message": "Rate limit hit (429)",
  "agentName": "modifier_assignment_agent",
  "endpoint": "B",
  "deployment": "gpt-4.1",
  "retryAfter": "60"
}

{
  "level": "warn",
  "message": "Retrying with fallback backend", 
  "agentName": "modifier_assignment_agent",
  "originalEndpoint": "B",
  "fallbackEndpoint": "A",
  "fallbackDeployment": "gpt-4.1"
}
```

This simplified implementation provides the core functionality needed to handle Azure OpenAI rate limiting while minimizing complexity and maintaining the existing architecture patterns.