/**
 * Service Registry
 *
 * This file implements the service registry that manages all services
 * in the AI Agent Architecture. It provides a centralized way to
 * configure, initialize, and access all services used by agents.
 */

import {
  ServiceRegistry as IServiceRegistry,
  CCIDataService,
  PatientHistoryService,
  RVUDataService,
  AzureStorageService,
  LCDService,
  CacheService,
  PerformanceMonitor,
  RetrievalService,
  VectorSearchService,
} from "../services/service-types.ts";
import {
  ProcessingError,
  ProcessingErrorSeverity,
} from "../agents/newtypes.ts";
import { ERROR_CODES } from "../agents/types.ts";
import { AIModelService } from "./ai-model-service.ts";
import { WorkflowLogger } from "../../app/coder/lib/logging.ts";
import { AIModelService as AIModelServiceImpl } from "./ai-model-service.ts";
import {
  CacheService as CacheServiceImpl,
  PerformanceMonitor as PerformanceMonitorImpl,
} from "./cache-service.ts";
import { RetrievalService as RetrievalServiceImpl } from "./retrieval-service.ts";
import { LCDServiceImpl } from "./lcd-service-impl.ts";
import { CCIDataServiceImpl } from "./cci-data-service.ts";
import { RVUDataServiceImpl } from "./rvu-data-service.ts";
import { AzureStorageServiceImpl } from "./azure-storage-service.ts";
import { PatientHistoryServiceImpl } from "./patient-history-service.ts";
import { AzureVectorSearchService } from "./vector-search-service.ts";

// ============================================================================
// SERVICE REGISTRY IMPLEMENTATION
// ============================================================================

export class ServiceRegistry implements IServiceRegistry {
  public readonly aiModel: AIModelService;
  public readonly lcd: LCDService;
  public readonly retrievalService: RetrievalService;
  public readonly cache: CacheService;
  public readonly performance: PerformanceMonitor;
  public readonly logger: WorkflowLogger;
  public readonly cciDataService: CCIDataService;
  public readonly vectorSearchService: VectorSearchService;
  public readonly patientHistoryService: PatientHistoryService;
  public readonly rvuDataService: RVUDataService;
  public readonly azureStorageService: AzureStorageService;

  private internalLogger?: WorkflowLogger;
  initialized: boolean = false;
  initializationPromise: Promise<void> | null = null;

  constructor(
    logger?: WorkflowLogger,
    aiModel?: AIModelService,
    lcd?: LCDService,
    retrievalService?: RetrievalService,
    cache?: CacheService,
    performance?: PerformanceMonitor,
    cciDataService?: CCIDataService,
    patientHistoryService?: PatientHistoryService,
    rvuDataService?: RVUDataService,
    azureStorageService?: AzureStorageService,
    vectorSearchService?: VectorSearchService,
  ) {
    this.internalLogger = logger;
    const fallbackLogger = new WorkflowLogger();
    this.logger = logger || fallbackLogger;

    this.aiModel = this.wrapServiceWithLogging(
      "aiModel",
      aiModel || new AIModelServiceImpl({}, logger || fallbackLogger),
    );
    this.lcd = this.wrapServiceWithLogging(
      "lcd",
      lcd ||
        new LCDServiceImpl(
          retrievalService || new RetrievalServiceImpl(),
          cache || new CacheServiceImpl(),
          logger || fallbackLogger,
        ),
    );
    this.retrievalService = this.wrapServiceWithLogging(
      "retrievalService",
      retrievalService || new RetrievalServiceImpl(),
    );
    this.cache = this.wrapServiceWithLogging(
      "cache",
      cache || new CacheServiceImpl(),
    );
    this.performance = this.wrapServiceWithLogging(
      "performance",
      performance || new PerformanceMonitorImpl(),
    );
    this.cciDataService = this.wrapServiceWithLogging(
      "cciDataService",
      cciDataService ||
        new CCIDataServiceImpl(
          new CacheServiceImpl(),
          azureStorageService || new AzureStorageServiceImpl(logger || fallbackLogger),
        ),
    );
    this.patientHistoryService = this.wrapServiceWithLogging(
      "patientHistoryService",
      patientHistoryService || new PatientHistoryServiceImpl(),
    );
    this.azureStorageService = this.wrapServiceWithLogging(
      "azureStorageService",
      azureStorageService || new AzureStorageServiceImpl(logger || fallbackLogger),
    );
    this.rvuDataService = this.wrapServiceWithLogging(
      "rvuDataService",
      rvuDataService || new RVUDataServiceImpl(logger || fallbackLogger, this.azureStorageService),
    );
    this.vectorSearchService = this.wrapServiceWithLogging(
      "vectorSearchService",
      vectorSearchService || new AzureVectorSearchService({
        searchEndpoint: process.env.SEARCH_ENDPOINT || "https://oxkairsearchdb.search.windows.net",
        searchKey: process.env.SEARCH_KEY || "",
        searchIndex: process.env.SEARCH_INDEX_NAME || "updated-cpt",
        embeddingsDeployment: process.env.EMBEDDINGS_DEPLOYMENT_NAME || "text-embedding-ada-002",
        chatDeployment: process.env.CHAT_DEPLOYMENT_NAME || process.env.DEPLOYMENT_NAME || "gpt-4.1",
        azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "https://thoma-me2wgbl0-eastus2.openai.azure.com/",
        azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY || "",
        apiVersion: "2024-12-01-preview"
      }),
    );

    this.internalLogger?.logInfo(
      "ServiceRegistry.constructor",
      "ServiceRegistry created and services wrapped.",
    );
  }

  public wrapServiceWithLogging<T extends object>(
    serviceName: string,
    service: T,
  ): T {
    if (!this.internalLogger) {
      return service;
    }
    const logger = this.internalLogger;
    return new Proxy(service, {
      get: (target, prop, receiver) => {
        const originalMethod = Reflect.get(target, prop, receiver);
        if (typeof originalMethod === "function") {
          return (...args: any[]) => {
            const startTime = Date.now();
            const callId = logger.logApiCall(
              serviceName,
              String(prop),
              args,
              startTime,
            );
            try {
              const result = originalMethod.apply(target, args);
              if (result instanceof Promise) {
                return result
                  .then((response) => {
                    const executionTime = Date.now() - startTime;
                    logger.logApiResponse(
                      callId,
                      serviceName,
                      String(prop),
                      response,
                      null,
                      executionTime,
                    );
                    return response;
                  })
                  .catch((error) => {
                    const executionTime = Date.now() - startTime;
                    logger.logApiResponse(
                      callId,
                      serviceName,
                      String(prop),
                      null,
                      error,
                      executionTime,
                    );
                    throw error;
                  });
              }
              const executionTime = Date.now() - startTime;
              logger.logApiResponse(
                callId,
                serviceName,
                String(prop),
                result,
                null,
                executionTime,
              );
              return result;
            } catch (error) {
              const executionTime = Date.now() - startTime;
              logger.logApiResponse(
                callId,
                serviceName,
                String(prop),
                null,
                error,
                executionTime,
              );
              throw error;
            }
          };
        }
        return originalMethod;
      },
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      console.log(`[DEBUG] ServiceRegistry: Starting initialization`);
      console.log(`[DEBUG] ServiceRegistry: Environment check - NODE_ENV: ${process.env.NODE_ENV}, VERCEL: ${process.env.VERCEL}`);
      console.log(`[DEBUG] ServiceRegistry: AI Keys - OPENAI: ${!!process.env.OPENAI_API_KEY}, AZURE: ${!!process.env.AZURE_OPENAI_API_KEY}`);
      
      // Validate required environment variables first
      const requiredEnvVars = [
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT_NAME",
        "OPENAI_API_KEY"
      ];

      const missingVars = requiredEnvVars.filter(v => !process.env[v]);

      if (missingVars.length > 0) {
        const errorMsg = `Missing required environment variables: ${missingVars.join(", ")}`;
        console.error(`[DEBUG] ServiceRegistry: ${errorMsg}`);
        throw new ServiceRegistryError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          errorMsg,
          ProcessingErrorSeverity.CRITICAL
        );
      }

      this.initialized = true;
      console.log(`[DEBUG] ServiceRegistry: Initialization completed successfully`);
      this.internalLogger?.logInfo(
        "ServiceRegistry.performInitialization",
        "ServiceRegistry initialized successfully.",
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DEBUG] ServiceRegistry: Initialization failed:`, error);
      this.internalLogger?.logError(
        "ServiceRegistry.performInitialization",
        "ServiceRegistry initialization failed.",
        { error: errorMessage },
      );
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  async validateServices(): Promise<ProcessingError[]> {
    const errors: ProcessingError[] = [];
    try {
      const testResult = await this.aiModel.testConnection();
      if (!testResult.success) {
        errors.push(
          new ServiceRegistryError(
            ERROR_CODES.SERVICE_UNAVAILABLE,
            `AI model service validation failed: ${testResult.error}`,
            ProcessingErrorSeverity.HIGH,
          ),
        );
      }
    } catch (error) {
      errors.push(
        new ServiceRegistryError(
          ERROR_CODES.SERVICE_UNAVAILABLE,
          `AI model service validation error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          ProcessingErrorSeverity.HIGH,
        ),
      );
    }
    return errors;
  }

  /**
   * Gets the health status of all services.
   */
  async getHealthStatus(): Promise<{
    overall: "healthy" | "degraded" | "unhealthy";
    services: {
      aiModel: "healthy" | "unhealthy";
      lcd: "healthy" | "unhealthy";
      cache: "healthy" | "unhealthy";
      performance: "healthy" | "unhealthy";
      retrievalService: "healthy" | "unhealthy";
      cciDataService: "healthy" | "unhealthy";
    };
    details: string[];
  }> {
    const details: string[] = [];
    const serviceHealth = {
      aiModel: "healthy" as "healthy" | "unhealthy",
      lcd: "healthy" as "healthy" | "unhealthy",
      retrievalService: "healthy" as "healthy" | "unhealthy",
      cache: "healthy" as "healthy" | "unhealthy",
      performance: "healthy" as "healthy" | "unhealthy",
      cciDataService: "healthy" as "healthy" | "unhealthy",
    };

    try {
      const testResult = await this.aiModel.testConnection();
      if (!testResult.success) {
        serviceHealth.aiModel = "unhealthy";
        details.push(`AI Model: ${testResult.error}`);
      } else {
        details.push(`AI Model: Response time ${testResult.responseTime}ms`);
      }
    } catch (error) {
      serviceHealth.aiModel = "unhealthy";
      details.push(
        `AI Model: Connection error - ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }

    // For other services, we assume they are healthy if they are instantiated.
    // More specific health checks can be added here if needed.

    details.push(
      "LCD, Cache, Performance, CCI Data services are operational.",
    );

    const unhealthyServices = Object.values(serviceHealth).filter(
      (status) => status === "unhealthy",
    ).length;
    let overall: "healthy" | "degraded" | "unhealthy";

    if (unhealthyServices === 0) {
      overall = "healthy";
    } else if (unhealthyServices <= 2) {
      overall = "degraded";
    } else {
      overall = "unhealthy";
    }

    return {
      overall,
      services: serviceHealth,
      details,
    };
  }

  /**
   * Gets usage statistics for all services.
   */
  getUsageStatistics(): {
    aiModel: {
      requestCount: number;
      totalTokensUsed: number;
      averageTokensPerRequest: number;
    };
    cache: {
      size: number;
      maxSize: number;
      hitRate: number;
      totalEntries: number;
      expiredEntries: number;
    };
    performance: {
      totalOperations: number;
      totalErrors: number;
      averageExecutionTime: number;
      activeOperationCount: number;
      operationTypes: number;
    };
  } {
    return {
      aiModel: this.aiModel.getUsageStats(),
      cache: this.cache.getStats(),
      performance: this.performance.getSummary(),
    };
  }

  resetStatistics(): void {
    this.aiModel.resetStats();
    this.performance.reset();
    this.cache.clear();
    this.internalLogger?.logInfo(
      "ServiceRegistry.resetStatistics",
      "Service statistics have been reset.",
    );
  }


  /**
   * Shuts down all services gracefully.
   */
  async shutdown(): Promise<void> {
    try {
      this.cache.destroy();
      this.performance.reset();
      this.initialized = false;
      this.initializationPromise = null;
      this.internalLogger?.logInfo(
        "ServiceRegistry.shutdown",
        "ServiceRegistry shut down successfully.",
      );
    } catch (error) {
      const errorMessage = `Service shutdown failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.internalLogger?.logError("ServiceRegistry.shutdown", errorMessage, {
        error,
      });
      throw new ServiceRegistryError(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        errorMessage,
        ProcessingErrorSeverity.MEDIUM,
      );
    }
  }

  /**
   * Checks if the service registry has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the initialization promise if initialization is in progress.
   */
  getInitializationPromise(): Promise<void> | null {
    return this.initializationPromise;
  }

  /**
   * Gets the logger instance.
   */
  getLogger(): WorkflowLogger {
    return this.logger;
  }

  /**
   * Gets all services as a record.
   */
  getAllServices(): Record<string, any> {
    return {
      aiModel: this.aiModel,
      lcd: this.lcd,
      retrievalService: this.retrievalService,
      cache: this.cache,
      performance: this.performance,
      logger: this.logger,
      cciDataService: this.cciDataService,
      patientHistoryService: this.patientHistoryService,
      rvuDataService: this.rvuDataService,
      azureStorageService: this.azureStorageService,
    };
  }

  /**
   * Checks if a specific service is available.
   */
  hasService(serviceName: string): boolean {
    return serviceName in this.getAllServices();
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class ServiceRegistryError extends Error implements ProcessingError {
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
    this.name = "ServiceRegistryError";
    this.code = code;
    this.severity = severity;
    this.timestamp = new Date();
    this.context = context;
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createDefaultServiceRegistry(
  logger?: WorkflowLogger,
): ServiceRegistry {
  return new ServiceRegistry(logger);
}

export function createTestServiceRegistry(
  logger?: WorkflowLogger,
): ServiceRegistry {
  const aiModel = new AIModelServiceImpl({
    provider: "azure",
    model: "gpt-4.1-nano", // Faster, cheaper model
    temperature: 0,
    maxTokens: 1000,
    timeout: 30000, // Increased timeout for test environment
  });
  const cache = new CacheServiceImpl(5000, 100);
  const performance = new PerformanceMonitorImpl();
  const retrievalService = new RetrievalServiceImpl();
  const lcd = new LCDServiceImpl(
    retrievalService,
    cache,
    logger || new WorkflowLogger(),
  );
  const azureStorageService = new AzureStorageServiceImpl(logger);
  const cciDataService = new CCIDataServiceImpl(
    cache || new CacheServiceImpl(),
    azureStorageService,
  );
  const rvuDataService = new RVUDataServiceImpl(logger, azureStorageService);
  const patientHistoryService = new PatientHistoryServiceImpl();
  return new ServiceRegistry(
    logger,
    aiModel,
    lcd,
    retrievalService,
    cache,
    performance,
    cciDataService,
    patientHistoryService,
    rvuDataService,
    azureStorageService,
  );
}

export function createProductionServiceRegistry(
  logger?: WorkflowLogger,
): ServiceRegistry {
  const aiModel = new AIModelServiceImpl({
    provider: "azure",
    model: "gpt-4.1", // Faster, cheaper model
    temperature: 0.1,
    maxTokens: 4000,
    timeout: 60000, // Increased timeout
  });
  const cache = new CacheServiceImpl(600000, 5000);
  const performance = new PerformanceMonitorImpl();
  const retrievalService = new RetrievalServiceImpl();
  const lcd = new LCDServiceImpl(
    retrievalService,
    cache,
    logger || new WorkflowLogger(),
  );
  const azureStorageService = new AzureStorageServiceImpl(logger);
  const cciDataService = new CCIDataServiceImpl(
    cache || new CacheServiceImpl(),
    azureStorageService,
  );
  const rvuDataService = new RVUDataServiceImpl(logger, azureStorageService);
  const patientHistoryService = new PatientHistoryServiceImpl();
  return new ServiceRegistry(
    logger,
    aiModel,
    lcd,
    retrievalService,
    cache,
    performance,
    cciDataService,
    patientHistoryService,
    rvuDataService,
    azureStorageService,
  );
}

export function createCustomServiceRegistry(services: {
  aiModel?: AIModelService;
  lcd?: LCDService;
  retrievalService?: RetrievalService;
  cache?: CacheService;
  performance?: PerformanceMonitor;
  logger?: WorkflowLogger;
  cciDataService?: CCIDataService;
  patientHistoryService?: PatientHistoryService;
  rvuDataService?: RVUDataService;
  azureStorageService?: AzureStorageService;
}): ServiceRegistry {
  return new ServiceRegistry(
    services.logger,
    services.aiModel,
    services.lcd,
    services.retrievalService,
    services.cache,
    services.performance,
    services.cciDataService,
    services.patientHistoryService,
    services.rvuDataService,
    services.azureStorageService,
  );
}
