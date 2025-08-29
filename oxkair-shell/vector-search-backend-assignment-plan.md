# Vector Search Backend Assignment Implementation Plan

## Overview
Extend the existing Azure OpenAI backend assignment system to support vector search services used by CPT, ICD, and Modifier Assignment agents. The vector search service currently makes direct Azure OpenAI API calls that bypass the backend assignment system, creating potential rate limiting issues.

## Current Implementation Status ✅

### **Already Implemented (Reusable Components)**:
1. **Backend Configuration** (`lib/config/azure-backend-simple.ts`)
   - ✅ Environment variable loading for both endpoints
   - ✅ Agent-to-backend assignments (CPT→A, ICD→A, Modifier→B)
   - ✅ Configuration validation and fallback logic

2. **Backend Manager** (`lib/services/simple-backend-manager.ts`)
   - ✅ Sticky assignment per agent
   - ✅ Failover logic (3 failures in 5 minutes)
   - ✅ Azure OpenAI client management for both endpoints
   - ✅ Health monitoring and failure tracking

3. **AI Model Service Integration** (`lib/services/ai-model-service.ts`)
   - ✅ Backend assignment integration
   - ✅ 429 error detection and immediate failover
   - ✅ Enhanced logging with backend context

4. **Agent Core Integration** (`lib/agents/agent-core.ts`)
   - ✅ Helper method to create AI service with agent name

## Current Vector Search Architecture Analysis

### **Vector Search Service** (`lib/services/vector-search-service.ts`):
- **Direct Azure OpenAI API calls** using `fetch()` to `/chat/completions` endpoint
- **Same endpoints as AI Model Service**: Uses `azureOpenAIEndpoint` and `azureOpenAIApiKey`
- **RAG Integration**: Includes Azure Search data sources in requests
- **Two main methods**:
  - `extractProceduresWithRAG()` - Used by CPT Agent
  - `extractDiagnosesWithRAG()` - Used by ICD Agent

### **Agent Usage**:
- **CPT Agent** (`lib/agents/cpt-agent.ts`): Uses `vectorSearchService.extractProceduresWithRAG()`
- **ICD Agent** (`lib/agents/icd-agent.ts`): Uses `vectorSearchService.extractDiagnosesWithRAG()`
- **Modifier Agent** (`lib/agents/modifier-assignment-agent.ts`): Uses direct Azure OpenAI calls with vector search integration

## Implementation Plan

### **Phase 1: Vector Search Service Backend Integration** (1 file modification)

#### **File: `lib/services/vector-search-service.ts` (modifications)**

**Goal**: Replace direct `fetch()` calls with backend-aware Azure OpenAI clients

**Changes**:
1. **Add Backend Manager Integration**:
   ```typescript
   import { SimpleBackendManager, BackendInfo } from './simple-backend-manager.js';
   
   export class AzureVectorSearchService implements VectorSearchService {
     private config: VectorSearchConfig;
     private backendManager: SimpleBackendManager;
     private agentName: string;
   
     constructor(config: VectorSearchConfig, agentName?: string) {
       this.config = config;
       this.agentName = agentName || 'vector_search_service';
       this.backendManager = new SimpleBackendManager();
     }
   ```

2. **Replace Direct API Calls**:
   ```typescript
   private async makeBackendAwareRequest(messages: any[], dataSources: any[]): Promise<any> {
     const { client, deployment, endpoint, endpointUrl } = this.backendManager.getAssignedBackend(this.agentName);
     
     try {
       const response = await client.chat.completions.create({
         model: deployment,
         messages,
         data_sources: dataSources,
         max_tokens: 4000,
         temperature: 0.1
       });
       
       // Log successful request
       console.log(`[VectorSearch] Request successful: ${this.agentName} → ${endpoint} (${deployment})`);
       this.backendManager.recordSuccess(this.agentName, endpoint);
       
       return response;
       
     } catch (error: any) {
       if (error.status === 429) {
         console.warn(`[VectorSearch] Rate limit hit: ${this.agentName} → ${endpoint}`);
         this.backendManager.recordFailure(this.agentName, error);
         
         // Immediate retry with potentially different backend
         const { client: fallbackClient, deployment: fallbackDeployment, endpoint: fallbackEndpoint } = 
           this.backendManager.getAssignedBackend(this.agentName);
         
         if (fallbackEndpoint !== endpoint) {
           console.log(`[VectorSearch] Retrying with fallback: ${this.agentName} → ${fallbackEndpoint}`);
           
           const fallbackResponse = await fallbackClient.chat.completions.create({
             model: fallbackDeployment,
             messages,
             data_sources: dataSources,
             max_tokens: 4000,
             temperature: 0.1
           });
           
           this.backendManager.recordSuccess(this.agentName, fallbackEndpoint);
           return fallbackResponse;
         }
       }
       
       this.backendManager.recordFailure(this.agentName, error);
       throw error;
     }
   }
   ```

3. **Update Extraction Methods**:
   ```typescript
   async extractProceduresWithRAG(operativeNote: string): Promise<VectorSearchResult> {
     // ... existing prompt logic ...
     
     const dataSources = [{
       type: "azure_search",
       parameters: {
         endpoint: this.config.searchEndpoint,
         index_name: this.config.searchIndex,
         // ... existing configuration ...
       }
     }];
     
     const response = await this.makeBackendAwareRequest(messages, dataSources);
     const content = response.choices?.[0]?.message?.content;
     
     // ... existing parsing logic ...
   }
   ```

### **Phase 2: Agent Integration Updates** (3 file modifications)

#### **File: `lib/agents/cpt-agent.ts` (minimal modification)**
```typescript
// Update vector service creation to include agent name
private async runVectorExtraction(context: StandardizedAgentContext, fullNoteText: string): Promise<VectorSearchResult> {
  const { services } = context;
  
  // Pass agent name to vector service for backend assignment
  if ('setAgentName' in services.vectorSearchService) {
    (services.vectorSearchService as any).setAgentName(this.name);
  }
  
  // ... existing logic unchanged ...
}
```

#### **File: `lib/agents/icd-agent.ts` (minimal modification)**
```typescript
// Same pattern as CPT agent
private async runVectorExtraction(context: StandardizedAgentContext, fullNoteText: string, cptBundle: any[]): Promise<IcdVectorSearchResult> {
  const { services } = context;
  
  // Pass agent name to vector service for backend assignment
  if ('setAgentName' in services.vectorSearchService) {
    (services.vectorSearchService as any).setAgentName(this.name);
  }
  
  // ... existing logic unchanged ...
}
```

#### **File: `lib/agents/modifier-assignment-agent.ts` (modification)**
```typescript
// Replace direct Azure OpenAI calls with AI Model Service
private async performVectorModifierSearch(context: StandardizedAgentContext, prompt: string, noteText: string, schema: any): Promise<any> {
  const aiService = this.createAIService(context); // Use existing backend-aware AI service
  
  // Use structured output instead of direct API calls
  return await aiService.generateStructuredOutput(prompt, schema);
}
```

### **Phase 3: Service Registry Integration** (1 file modification)

#### **File: `lib/services/service-registry.ts` (modification)**
```typescript
export class ServiceRegistry implements IServiceRegistry {
  // Update vector search service creation to include agent context
  createVectorSearchService(agentName?: string): VectorSearchService {
    return new AzureVectorSearchService({
      searchEndpoint: process.env.SEARCH_ENDPOINT || "https://oxkairsearchdb.search.windows.net",
      searchKey: process.env.SEARCH_KEY || "",
      searchIndex: process.env.SEARCH_INDEX_NAME || "updated-cpt",
      embeddingsDeployment: process.env.EMBEDDINGS_DEPLOYMENT_NAME || "text-embedding-ada-002",
      chatDeployment: process.env.CHAT_DEPLOYMENT_NAME || process.env.DEPLOYMENT_NAME || "gpt-4.1",
      azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "https://thoma-me2wgbl0-eastus2.openai.azure.com/",
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY || "",
      apiVersion: "2024-12-01-preview"
    }, agentName);
  }
}
```

### **Phase 4: Enhanced Logging and Monitoring** (1 new file)

#### **File: `lib/services/vector-search-logger.ts`**
```typescript
export class VectorSearchLogger {
  static logVectorRequest(agentName: string, endpoint: string, deployment: string, searchIndex: string): void {
    console.log(`[VectorSearch] ${agentName} → ${endpoint} (${deployment}) using index: ${searchIndex}`);
  }
  
  static logVectorSuccess(agentName: string, endpoint: string, responseTime: number, resultCount: number): void {
    console.log(`[VectorSearch] ✅ ${agentName} → ${endpoint} (${responseTime}ms, ${resultCount} results)`);
  }
  
  static logVectorFailover(agentName: string, originalEndpoint: string, fallbackEndpoint: string): void {
    console.warn(`[VectorSearch] 🔄 ${agentName} failover: ${originalEndpoint} → ${fallbackEndpoint}`);
  }
  
  static logVectorRateLimit(agentName: string, endpoint: string, retryAfter?: string): void {
    console.error(`[VectorSearch] 🚫 ${agentName} rate limited on ${endpoint} (retry-after: ${retryAfter || 'unknown'})`);
  }
}
```

## Agent-to-Backend Assignment Strategy

### **Reuse Existing Assignments**:
- **CPT Agent** (`cpt_agent`): Endpoint A, gpt-4.1 ✅
- **ICD Agent** (`icd_agent`): Endpoint A, gpt-4.1-2 ✅  
- **Modifier Agent** (`modifier_assignment_agent`): Endpoint B, gpt-4.1 ✅

### **Vector Search Specific Considerations**:
- **Same endpoints, same rate limits**: Vector search uses the same Azure OpenAI endpoints
- **RAG data sources**: Additional complexity but same underlying API
- **Longer prompts**: Vector search typically uses longer system prompts
- **Higher token usage**: RAG responses tend to be more detailed

## Testing Strategy

### **Phase 5: Vector Search Tests** (2 new files)

#### **File: `__tests__/vector-search-backend.test.ts`**
```typescript
// Test vector search backend assignment
runner.test('should assign vector search requests to correct backends', () => {
  const vectorService = new AzureVectorSearchService(config, 'cpt_agent');
  // Test that CPT agent gets endpoint A
});

runner.test('should handle vector search 429 errors with failover', async () => {
  // Mock 429 response and verify failover
});
```

#### **File: `scripts/test-vector-search-backends.ts`**
```typescript
// Integration test for vector search with backend assignment
// Test all three agents (CPT, ICD, Modifier) with vector search
```

## Implementation Benefits

### **Immediate Benefits**:
1. **Rate Limit Protection**: Vector search requests distributed across endpoints
2. **Automatic Failover**: 429 errors trigger immediate backend switching
3. **Consistent Logging**: All Azure OpenAI calls logged with backend context
4. **Reuse Existing Infrastructure**: No new configuration or setup required

### **Operational Benefits**:
1. **Unified Monitoring**: All Azure OpenAI usage tracked in one system
2. **Load Distribution**: Vector search load balanced across endpoints
3. **Failure Isolation**: Agent-specific failure tracking and recovery
4. **Audit Trail**: Complete request tracing with correlation IDs

## Migration Strategy

### **Phase 1**: Implement vector search backend integration (1-2 days)
### **Phase 2**: Update agent integrations (1 day)
### **Phase 3**: Service registry updates (0.5 days)
### **Phase 4**: Enhanced logging (0.5 days)
### **Phase 5**: Testing and validation (1 day)

**Total Estimated Time**: 4-5 days

## Risk Mitigation

### **Backward Compatibility**:
- Vector search service maintains same interface
- Agents require minimal changes
- Fallback to original behavior if backend assignment fails

### **Configuration Validation**:
- Reuse existing environment variable validation
- Graceful degradation if secondary endpoint unavailable
- Clear error messages for configuration issues

### **Performance Considerations**:
- Minimal overhead from backend assignment lookup
- Same Azure OpenAI client performance
- No impact on vector search response times

## Key Design Principles

1. **Reuse Existing Code**: Leverage all implemented backend assignment logic
2. **Minimal Agent Changes**: Preserve existing agent architecture and interfaces
3. **Consistent Behavior**: Vector search follows same failover patterns as AI Model Service
4. **Enhanced Observability**: All vector search requests logged with backend context
5. **Unified Management**: Single system for all Azure OpenAI backend assignment

This implementation extends the existing backend assignment system to cover vector search without disrupting the current agent architecture or requiring significant code changes.