/**
 * AI Agent Architecture - Main Index
 *
 * This file provides the main entry point for the AI Agent Architecture,
 * exporting all core components, types, and utilities for easy importing
 * and usage throughout the application.
 */
import { ProcessingErrorSeverity } from "./newtypes.ts";
import { WorkflowOrchestrator } from "../workflow/workflow-orchestrator";

// ============================================================================
// CORE TYPES AND INTERFACES
// ============================================================================

export * from "./newtypes.ts";

// ============================================================================
// AGENT CORE COMPONENTS
// ============================================================================

export { Agent, isAgent, createMockAgent } from "./agent-core";

// ============================================================================
// AGENT IMPLEMENTATIONS
// ============================================================================

// CodeExtractionAgent export removed - legacy agent deprecated
export { CPTAgent } from "./cpt-agent";
// CPTVectorAgent now renamed to CPTAgent - using vector-based implementation
export { ICDAgent } from "./icd-agent";
// ICDVectorAgent - keeping separate for now
export { CCIAgent as CCIValidationAgent } from "./cci-agent";
export { LCDAgent } from "./lcd-agent";
export { ModifierAssignmentAgent } from "./modifier-assignment-agent";
// export { VectorModifierAssignmentAgent } from "./modifier-vector-agent";

// ============================================================================
// WORKFLOW ORCHESTRATION
// ============================================================================

export {
  WorkflowOrchestrator,
  createDefaultOrchestrator,
  createTestOrchestrator,
} from "../workflow/workflow-orchestrator";

export {
  initializeState,
  mergeAgentResult,
  validateState,
  extractAllEvidence,
  cloneState,
  getStateSummary,
  updateWorkflowStep,
  isWorkflowComplete,
  getNextWorkflowStep,
} from "../workflow/state-manager";

// ============================================================================
// SERVICES
// ============================================================================

export {
  AIModelService,
  AIModelServiceError as AIModelError,
  createDefaultAIModelService,
  createTestAIModelService,
  validateAIModelConfig,
} from "../services/ai-model-service";

export { CCIDataServiceImpl as CCIService } from "../services/cci-data-service";
export type { LCDService } from "../services/lcd-service";

export {
  CacheService,
  PerformanceMonitor,
  CacheServiceError,
  createDefaultCacheService,
  createHighPerformanceCacheService,
  createTestCacheService,
  createDefaultPerformanceMonitor,
  createMonitoringServices,
} from "../services/cache-service";

export {
  ServiceRegistry,
  ServiceRegistryError,
  createDefaultServiceRegistry,
  createTestServiceRegistry,
  createProductionServiceRegistry,
  createCustomServiceRegistry,
} from "../services/service-registry";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a complete agent architecture setup with default configuration.
 * This is the main entry point for most applications.
 */
export async function createAgentArchitecture(): Promise<{
  serviceRegistry: import("./newtypes").ServiceRegistry;
  orchestrator: WorkflowOrchestrator;
}> {
  const { createDefaultServiceRegistry } = await import(
    "../services/service-registry"
  );
  const { createDefaultOrchestrator } = await import(
    "../workflow/workflow-orchestrator"
  );

  const serviceRegistry = createDefaultServiceRegistry();
  await serviceRegistry.initialize();

  const orchestrator = createDefaultOrchestrator(serviceRegistry);

  return {
    serviceRegistry,
    orchestrator,
  };
}

/**
 * Creates a test-optimized agent architecture setup.
 */
export async function createTestAgentArchitecture(): Promise<{
  serviceRegistry: import("./newtypes").ServiceRegistry;
  orchestrator: WorkflowOrchestrator;
}> {
  const { createTestServiceRegistry } = await import(
    "../services/service-registry"
  );
  const { createTestOrchestrator } = await import(
    "../workflow/workflow-orchestrator"
  );

  const serviceRegistry = createTestServiceRegistry();
  await serviceRegistry.initialize();

  const orchestrator = createTestOrchestrator(serviceRegistry);

  return {
    serviceRegistry,
    orchestrator,
  };
}

/**
 * Registers the LCD agent with the orchestrator.
 */
export function registerLCDAgent(orchestrator: WorkflowOrchestrator): void {
  const { LCDAgent } = require("./lcd-agent");
  const lcdAgent = new LCDAgent();

  orchestrator.registerAgent(
    lcdAgent,
    "lcd_coverage",
    ["code_extraction", "enrichment"], // Dependencies
    5, // Priority
    false, // Required
  );

  // Set custom timeout for LCD agent
  orchestrator.setAgentTimeout(lcdAgent.name, 45000); // 45 seconds
}

// registerCodeExtractionAgent removed - legacy agent deprecated

/**
 * Registers all agents with the orchestrator.
 */
export function registerAllAgents(orchestrator: WorkflowOrchestrator): void {
  // Register agents in dependency order
  registerLCDAgent(orchestrator);

  // TODO: Register other agents as needed
}

/**
 * Creates a complete agent pipeline with all agents registered.
 */
export function createProductionAgentPipeline(
  serviceRegistry: import("./newtypes").ServiceRegistry,
): WorkflowOrchestrator {
  const {
    createDefaultOrchestrator,
  } = require("../workflow/workflow-orchestrator");
  const orchestrator = createDefaultOrchestrator(serviceRegistry);

  // Register all agents
  registerAllAgents(orchestrator);

  return orchestrator;
}

/**
 * Creates a production-optimized agent architecture setup.
 */
export async function createProductionAgentArchitecture(): Promise<{
  serviceRegistry: import("./newtypes").ServiceRegistry;
  orchestrator: WorkflowOrchestrator;
}> {
  const { createProductionServiceRegistry } = await import(
    "../services/service-registry"
  );
  const { createDefaultOrchestrator } = await import(
    "../workflow/workflow-orchestrator"
  );

  const serviceRegistry = createProductionServiceRegistry();
  await serviceRegistry.initialize();

  const orchestrator = createProductionAgentPipeline(serviceRegistry);

  return {
    serviceRegistry,
    orchestrator,
  };
}

/**
 * Validates the entire agent architecture setup.
 */
export async function validateAgentArchitecture(
  serviceRegistry: import("./newtypes").ServiceRegistry,
  orchestrator: WorkflowOrchestrator,
): Promise<{
  valid: boolean;
  errors: any[];
  warnings: any[];
}> {
  const errors: any[] = [];
  const warnings: any[] = [];

  try {
    // Validate services
    const serviceErrors = await serviceRegistry.validateServices();
    errors.push(...serviceErrors);

    // Validate orchestrator dependencies
    const dependencyErrors = orchestrator.validateDependencies();
    warnings.push(
      ...dependencyErrors.filter(
        (e: import("./newtypes").ProcessingError) => e.severity !== ProcessingErrorSeverity.CRITICAL,
      ),
    );
    errors.push(
      ...dependencyErrors.filter(
        (e: import("./newtypes").ProcessingError) => e.severity === ProcessingErrorSeverity.CRITICAL,
      ),
    );

    // Check health status
    const healthStatus = await serviceRegistry.getHealthStatus();
    if (healthStatus.overall === "unhealthy") {
      errors.push({
        code: "HEALTH_CHECK_FAILED",
        message: "Service registry health check failed",
        severity: "high",
        details: healthStatus.details,
      });
    }
  } catch (error) {
    errors.push({
      code: "VALIDATION_ERROR",
      message: `Architecture validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      severity: "critical",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Gets the version information for the agent architecture.
 */
export function getArchitectureVersion(): {
  version: string;
  buildDate: string;
  components: string[];
} {
  return {
    version: "2.0.0",
    buildDate: new Date().toISOString(),
    components: [
      "Agent Core",
      "Code Extraction Agent",
      "CCI Validation Agent",
      "Modifier Assignment Agent",
      "Workflow Orchestrator",
      "State Manager",
      "AI Model Service",
      "Policy Services (CCI, MUE, LCD)",
      "Cache Service",
      "Performance Monitor",
      "Service Registry",
    ],
  };
}

/**
 * Type guard to check if an object is a valid WorkflowState.
 */
export function isWorkflowState(
  obj: any,
): obj is import("./newtypes").WorkflowState {
  return (
    obj &&
    typeof obj === "object" &&
    obj.caseMeta &&
    typeof obj.caseMeta.caseId === "string" &&
    obj.demographics &&
    Array.isArray(obj.procedureCodes) &&
    Array.isArray(obj.diagnosisCodes) &&
    Array.isArray(obj.finalModifiers) &&
    obj.claimSequence &&
    typeof obj.currentStep === "string" &&
    Array.isArray(obj.completedSteps) &&
    Array.isArray(obj.errors) &&
    Array.isArray(obj.history) &&
    Array.isArray(obj.allEvidence)
  );
}

/**
 * Type guard to check if an object is a valid AgentResult.
 */
export function isAgentResult(obj: any): obj is import("./newtypes").AgentResult {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.success === "boolean" &&
    Array.isArray(obj.evidence) &&
    obj.metadata &&
    typeof obj.metadata.executionTime === "number" &&
    typeof obj.metadata.confidence === "number" &&
    typeof obj.metadata.version === "string"
  );
}

// ============================================================================
// CONSTANTS AND DEFAULTS
// ============================================================================

/**
 * Default configuration values for the agent architecture.
 */
export const DEFAULT_CONFIG = {
  AGENT_TIMEOUT: 30000,
  WORKFLOW_TIMEOUT: 300000,
  CACHE_TTL: 300000,
  MAX_CACHE_SIZE: 1000,
  AI_MODEL: "gpt-4.1",
  AI_TEMPERATURE: 0.1,
  AI_MAX_TOKENS: 4000,
  RETRY_ATTEMPTS: 3,
  RETRY_BACKOFF: 1000,
} as const;

/**
 * Environment-specific configurations.
 */
export const ENVIRONMENT_CONFIGS = {
  development: {
    ...DEFAULT_CONFIG,
    AI_MODEL: "gpt-4.1",
    AI_MAX_TOKENS: 2000,
    CACHE_TTL: 60000, // 1 minute
    AGENT_TIMEOUT: 15000, // 15 seconds
  },
  testing: {
    ...DEFAULT_CONFIG,
    AI_MODEL: "gpt-oss-120b",
    AI_MAX_TOKENS: 1000,
    CACHE_TTL: 5000, // 5 seconds
    AGENT_TIMEOUT: 5000, // 5 seconds
    WORKFLOW_TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 1,
  },
  production: {
    ...DEFAULT_CONFIG,
    CACHE_TTL: 600000, // 10 minutes
    MAX_CACHE_SIZE: 5000,
  },
} as const;

/**
 * Gets configuration for the current environment.
 */
export function getEnvironmentConfig(
  env: "development" | "testing" | "production" = "development",
) {
  return ENVIRONMENT_CONFIGS[env];
}
