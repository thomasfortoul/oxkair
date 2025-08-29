/**
 * AI Model Service
 *
 * This service provides a unified interface for interacting with AI models
 * for medical claim processing. It handles model configuration, structured
 * output generation, text generation, and confidence estimation.
 */

import {
  AIModelService as IAIModelService,
  AIModelConfig,
  AIResponse,
  ProcessingError,
  ERROR_CODES
} from '../agents/types.ts';
import { ProcessingErrorSeverity } from '../agents/newtypes.ts';

import { openai as openaiClient } from '@ai-sdk/openai';
import { generateObject, generateText as generateTextSDK } from 'ai';

import { AzureOpenAI } from 'openai';

import { WorkflowLogger, AIUsageData } from '../../app/coder/lib/logging.ts';
import { calculateTokenCost } from '../config/ai-model-pricing.ts';
import { SimpleBackendManager, BackendInfo } from './simple-backend-manager.ts';

// Azure OpenAI configuration via environment variables
// Environment variables are now read inside the methods to avoid module-level initialization issues.

// ============================================================================
// AI MODEL SERVICE IMPLEMENTATION
// ============================================================================

export class AIModelService implements IAIModelService {
  private config: AIModelConfig;
  private requestCount = 0;
  private totalTokensUsed = 0;
  private responseCache = new Map<string, { result: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private logger?: WorkflowLogger;
  private azureClient?: AzureOpenAI;
  private backendManager?: SimpleBackendManager; // NEW: Make optional
  private agentName: string; // NEW
  private useDirectClient: boolean; // NEW: Flag to bypass SimpleBackendManager

  constructor(config: Partial<AIModelConfig> = {}, logger?: WorkflowLogger, agentName?: string, useDirectClient?: boolean) {
    this.config = {
      provider: config.provider || 'azure',
      model: config.model || process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '',
      temperature: 0.1,
      maxTokens: config.maxTokens ?? 2048,
      timeout: config.timeout ?? 60000,
      reasoning_effort: config.reasoning_effort
    };
    this.logger = logger;
    this.agentName = agentName || 'unknown_agent'; // NEW
    this.useDirectClient = useDirectClient || false; // NEW: Default to false for backward compatibility
    
    // Only initialize backend manager if not using direct client
    if (!this.useDirectClient) {
      this.backendManager = new SimpleBackendManager(); // NEW
    }
  }

  private getAzureClient(): BackendInfo {
    // NEW: Use backend manager instead of single client, unless direct client is requested
    if (this.useDirectClient) {
      return this.getDirectAzureClient();
    }
    if (!this.backendManager) {
      throw new Error('Backend manager not initialized');
    }
    return this.backendManager.getAssignedBackend(this.agentName);
  }

  private getDirectAzureClient(): BackendInfo {
    // Create direct Azure client bypassing SimpleBackendManager
    const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureDeployment = this.config.model || process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

    if (!azureApiKey || !azureEndpoint || !azureDeployment) {
      throw new Error('Missing Azure OpenAI configuration for direct client');
    }

    if (!this.azureClient) {
      this.azureClient = new AzureOpenAI({
        apiKey: azureApiKey,
        endpoint: azureEndpoint,
        apiVersion: '2025-01-01-preview'
      });
    }

    return {
      client: this.azureClient,
      deployment: azureDeployment,
      endpoint: 'direct',
      endpointUrl: azureEndpoint
    };
  }

  private logAiUsage(
    functionName: string,
    inputTokens: number,
    outputTokens: number,
    requestDuration: number,
    model?: string
  ): void {
    if (!this.logger) return;

    const selectedModel = model || this.config.model;
    const totalTokens = inputTokens + outputTokens;
    const costs = calculateTokenCost(selectedModel, inputTokens, outputTokens);

    const aiUsage: AIUsageData = {
      model: selectedModel,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost: costs.inputCost,
      outputCost: costs.outputCost,
      totalCost: costs.totalCost,
      provider: this.config.provider,
      requestDuration
    };

    this.logger.logAiUsage(functionName, aiUsage);
  }



  async generateStructuredOutput<T>(prompt: string, schema: any, model?: string): Promise<T> {
    const cacheKey = JSON.stringify({ prompt, schema, model });
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result as T;
    }

    this.requestCount++;
    const startTime = Date.now();
    
    // Use the provided model or fall back to the default model
    const selectedModel = model || this.config.model;
    const isLowReasoningModel = ['o4-mini', 'gpt-5', 'gpt-5-mini'].includes(selectedModel);

    if (this.config.provider === 'azure') {
      const { client, deployment, endpoint, endpointUrl } = this.getAzureClient(); // MODIFIED
      
      const options: any = {
        model: deployment, // MODIFIED: Use assigned deployment
        messages: [
          { role: 'system', content: 'Generate JSON output matching the schema.' },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: this.config.maxTokens
      };

      // Apply model-specific parameters
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
          endpointUrl,
          responseTime: Date.now() - startTime,
        });
        
        // Only record success in backend manager if not using direct client
        if (!this.useDirectClient) {
          this.backendManager?.recordSuccess(this.agentName, endpoint);
        }
        
        const requestDuration = Date.now() - startTime;
        const content = response.choices[0]?.message?.content ?? '';
        
        // Clean up markdown code blocks if present
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const resultObj = JSON.parse(cleanContent);
        
        if (response.usage?.total_tokens) {
          this.totalTokensUsed += response.usage.total_tokens;
          
          // Log AI usage with the selected model
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
            endpointUrl,
            retryAfter,
            error: error.message,
          });
          
          // Only record failure in backend manager if not using direct client
          if (!this.useDirectClient && this.backendManager) {
            this.backendManager?.recordFailure(this.agentName, error);
          }
          
          // Immediate retry with potentially different backend
          const { client: fallbackClient, deployment: fallbackDeployment, endpoint: fallbackEndpoint, endpointUrl: fallbackEndpointUrl } = this.getAzureClient();
          
          if (fallbackEndpoint !== endpoint) {
            this.logger?.logWarn('AIModelService.generateStructuredOutput', 'Retrying with fallback backend', {
              agentName: this.agentName,
              originalEndpoint: endpoint,
              fallbackEndpoint,
              fallbackDeployment,
              fallbackEndpointUrl,
            });
            
            // Retry once with fallback
            options.model = fallbackDeployment;
            const fallbackResponse = await fallbackClient.chat.completions.create(options);
            this.backendManager?.recordSuccess(this.agentName, fallbackEndpoint);
            
            // Process fallback response (same logic as above)
            const fallbackContent = fallbackResponse.choices[0]?.message?.content ?? '';
            let cleanFallbackContent = fallbackContent.trim();
            if (cleanFallbackContent.startsWith('```json')) {
              cleanFallbackContent = cleanFallbackContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanFallbackContent.startsWith('```')) {
              cleanFallbackContent = cleanFallbackContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            
            const fallbackResultObj = JSON.parse(cleanFallbackContent);
            
            if (fallbackResponse.usage?.total_tokens) {
              this.totalTokensUsed += fallbackResponse.usage.total_tokens;
              this.logAiUsage(
                'AIModelService.generateStructuredOutput',
                fallbackResponse.usage.prompt_tokens || 0,
                fallbackResponse.usage.completion_tokens || 0,
                Date.now() - startTime,
                selectedModel
              );
            }
            
            this.responseCache.set(cacheKey, { result: fallbackResultObj, timestamp: Date.now() });
            return fallbackResultObj as T;
          }
        }
        
        // Record other failures
        this.backendManager?.recordFailure(this.agentName, error);
        throw error;
      }
    } else {
      const client = openaiClient(selectedModel);
      
      const options: any = {
        model: client,
        prompt,
        schema,
        maxTokens: this.config.maxTokens
      };

      // Apply model-specific parameters
      if (isLowReasoningModel) {
        options.reasoning_effort = 'low';
      } else {
        options.temperature = 0.1;
      }

      const result = await generateObject(options);
      
      const requestDuration = Date.now() - startTime;
      this.totalTokensUsed += result.usage.totalTokens || 0;
      
      // Log AI usage with the selected model
      this.logAiUsage(
        'AIModelService.generateStructuredOutput',
        result.usage.inputTokens || 0,
        result.usage.outputTokens || 0,
        requestDuration,
        selectedModel
      );
      
      this.responseCache.set(cacheKey, { result: result.object, timestamp: Date.now() });
      return result.object as T;
    }
  }

  async generateText(prompt: string, model?: string): Promise<string> {
    this.requestCount++;
    const startTime = Date.now();
    
    // Use the provided model or fall back to the default model
    const selectedModel = model || this.config.model;
    const isLowReasoningModel = ['o4-mini', 'gpt-5', 'gpt-5-mini'].includes(selectedModel);

    if (this.config.provider === 'azure') {
      const { client, deployment, endpoint, endpointUrl } = this.getAzureClient(); // MODIFIED
      
      const options: any = {
        model: deployment, // MODIFIED: Use assigned deployment
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: this.config.maxTokens
      };

      // Apply model-specific parameters
      if (isLowReasoningModel) {
        options.reasoning_effort = 'low';
      } else {
        options.temperature = 0.1;
      }

      try {
        const response = await client.chat.completions.create(options);
        
        // Log successful request
        this.logger?.logInfo('AIModelService.generateText', 'Request successful', {
          agentName: this.agentName,
          endpoint,
          deployment,
          endpointUrl,
          responseTime: Date.now() - startTime,
        });
        
        // Only record success in backend manager if not using direct client
        if (!this.useDirectClient) {
          this.backendManager?.recordSuccess(this.agentName, endpoint);
        }
        
        const requestDuration = Date.now() - startTime;
        const text = response.choices[0]?.message?.content ?? '';
        
        if (response.usage?.total_tokens) {
          this.totalTokensUsed += response.usage.total_tokens;
          
          // Log AI usage with the selected model
          this.logAiUsage(
            'AIModelService.generateText',
            response.usage.prompt_tokens || 0,
            response.usage.completion_tokens || 0,
            requestDuration,
            selectedModel
          );
        }
        
        return text;
        
      } catch (error: any) {
        // NEW: Handle 429 errors specifically
        if (error.status === 429) {
          const retryAfter = error.headers?.['retry-after'];
          this.logger?.logError('AIModelService.generateText', 'Rate limit hit (429)', {
            agentName: this.agentName,
            endpoint,
            deployment,
            endpointUrl,
            retryAfter,
            error: error.message,
          });
          
          this.backendManager?.recordFailure(this.agentName, error);
          
          // Immediate retry with potentially different backend
          const { client: fallbackClient, deployment: fallbackDeployment, endpoint: fallbackEndpoint, endpointUrl: fallbackEndpointUrl } = this.getAzureClient();
          
          if (fallbackEndpoint !== endpoint) {
            this.logger?.logWarn('AIModelService.generateText', 'Retrying with fallback backend', {
              agentName: this.agentName,
              originalEndpoint: endpoint,
              fallbackEndpoint,
              fallbackDeployment,
              fallbackEndpointUrl,
            });
            
            // Retry once with fallback
            options.model = fallbackDeployment;
            const fallbackResponse = await fallbackClient.chat.completions.create(options);
            this.backendManager?.recordSuccess(this.agentName, fallbackEndpoint);
            
            const fallbackText = fallbackResponse.choices[0]?.message?.content ?? '';
            
            if (fallbackResponse.usage?.total_tokens) {
              this.totalTokensUsed += fallbackResponse.usage.total_tokens;
              this.logAiUsage(
                'AIModelService.generateText',
                fallbackResponse.usage.prompt_tokens || 0,
                fallbackResponse.usage.completion_tokens || 0,
                Date.now() - startTime,
                selectedModel
              );
            }
            
            return fallbackText;
          }
        }
        
        // Record other failures
        this.backendManager?.recordFailure(this.agentName, error);
        throw error;
      }
    } else {
      const client = openaiClient(selectedModel);
      
      const options: any = {
        model: client,
        prompt,
        maxTokens: this.config.maxTokens
      };

      // Apply model-specific parameters
      if (isLowReasoningModel) {
        options.reasoning_effort = 'low';
      } else {
        options.temperature = 0.1;
      }

      const result = await generateTextSDK(options);
      
      const requestDuration = Date.now() - startTime;
      this.totalTokensUsed += result.usage.totalTokens || 0;
      
      // Log AI usage with the selected model
      this.logAiUsage(
        'AIModelService.generateText',
        result.usage.inputTokens || 0,
        result.usage.outputTokens || 0,
        requestDuration,
        selectedModel
      );
      
      return result.text;
    }
  }

  estimateConfidence(result: any): number {
    // Simple confidence estimation based on result structure and content
    if (!result) return 0;
    
    if (typeof result === 'string') {
      return result.length > 10 ? 0.8 : 0.5;
    }
    
    if (typeof result === 'object') {
      const keys = Object.keys(result);
      const filledKeys = keys.filter(key => result[key] !== null && result[key] !== undefined && result[key] !== '');
      return filledKeys.length / keys.length;
    }
    
    return 0.7; // Default confidence
  }

  async testConnection(): Promise<{ success: boolean; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
      const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
      const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME_TEST;

      console.log(`[DEBUG] AIModelService: Testing connection with config:`, {
        provider: this.config.provider,
        model: this.config.model,
        endpoint: azureEndpoint ? azureEndpoint.substring(0, 30) + '...' : 'N/A',
        deployment: azureDeployment,
        hasApiKey: !!azureApiKey
      });

      // Check if we have valid configuration
      if (!azureApiKey) {
        throw new Error('Azure OpenAI API key is not configured');
      }
      
      if (!azureEndpoint) {
        throw new Error('Azure OpenAI endpoint is not configured');
      }
      
      if (!azureDeployment) {
        throw new Error('Azure OpenAI deployment name is not configured');
      }
      
      const testPrompt = "Hello, this is a connection test. Please respond with 'OK'.";
      console.log(`[DEBUG] AIModelService: Sending test prompt`);
      const result = await this.generateText(testPrompt);
      
      console.log(`[DEBUG] AIModelService: Connection test successful, response length:`, result.length);
      
      const responseTime = Date.now() - startTime;
      return {
        success: true,
        responseTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[DEBUG] AIModelService: Connection test failed:`, errorMessage);
      return {
        success: false,
        responseTime,
        error: errorMessage
      };
    }
  }

  getUsageStats(): {
    requestCount: number;
    totalTokensUsed: number;
    averageTokensPerRequest: number;
  } {
    return {
      requestCount: this.requestCount,
      totalTokensUsed: this.totalTokensUsed,
      averageTokensPerRequest: this.requestCount > 0 ? this.totalTokensUsed / this.requestCount : 0
    };
  }

  resetStats(): void {
    this.requestCount = 0;
    this.totalTokensUsed = 0;
    this.responseCache.clear();
  }

  updateConfig(newConfig: Partial<AIModelConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): AIModelConfig {
    return { ...this.config };
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class AIModelServiceError extends Error implements ProcessingError {
  public readonly code: string;
  public readonly severity: ProcessingErrorSeverity;
  public readonly timestamp: Date;
  public readonly context?: Record<string, any>;

  constructor(
    code: string,
    message: string,
    severity: ProcessingErrorSeverity,
    context?: Record<string, any>,
  ) {
    super(message);
    this.name = "AIModelServiceError";
    this.code = code;
    this.severity = severity;
    this.timestamp = new Date();
    this.context = context;
  }
}

export function createDefaultAIModelService(logger?: WorkflowLogger, agentName?: string): AIModelService {
  return new AIModelService({
    provider: 'azure',
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1',
    temperature: 0.1,
    maxTokens: 2048,
    timeout: 60000
  }, logger, agentName);
}

export function createTestAIModelService(logger?: WorkflowLogger, agentName?: string): AIModelService {
  return new AIModelService({
    provider: 'azure',
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME_TEST || 'gpt-oss-120b',
    temperature: 0.1,
    maxTokens: 500,
    timeout: 30000
  }, logger, agentName);
}

export function validateAIModelConfig(config: Partial<AIModelConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.provider && !['azure', 'openai'].includes(config.provider)) {
    errors.push('Provider must be either "azure" or "openai"');
  }
  
  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
    errors.push('Temperature must be between 0 and 2');
  }
  
  if (config.maxTokens !== undefined && (config.maxTokens < 1 || config.maxTokens > 8000)) {
    errors.push('Max tokens must be between 1 and 8000');
  }
  
  if (config.timeout !== undefined && config.timeout < 1000) {
    errors.push('Timeout must be at least 1000ms');
  }
  
  if (config.reasoning_effort !== undefined && !['low', 'medium', 'high'].includes(config.reasoning_effort)) {
    errors.push('Reasoning effort must be "low", "medium", or "high"');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

