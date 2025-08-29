/**
 * Agent Factory
 *
 * This module provides centralized agent registration and configuration for the
 * WorkflowOrchestrator. It maintains clean separation of concerns and enables
 * easy configuration of agent pipelines for different environments.
 *
 * Key Features:
 * - Centralized agent registration
 * - Environment-specific configurations
 * - Dependency management
 * - Pipeline customization
 * - Error handling for registration failures
 */

import { WorkflowConfig } from "@/lib/services/service-types.ts";
import { WORKFLOW_STEPS } from "../../../lib/agents/newtypes";
import {
  WorkflowOrchestrator,
  createDefaultOrchestrator,
} from "../../../lib/workflow/workflow-orchestrator";
import {
  ProcessingErrorSeverity,
} from "../../../lib/agents/newtypes";
export { WORKFLOW_STEPS };
import { WorkflowLogger } from "./logging.ts";

// Import all available agents
// CodeExtractionAgent import removed - legacy agent deprecated
import { CPTAgent } from "../../../lib/agents/cpt-agent.ts";
// CPTVectorAgent now renamed to CPTAgent - using vector-based implementation
import { ICDAgent } from "../../../lib/agents/icd-agent.ts";
import { CCIAgent } from "../../../lib/agents/cci-agent.ts";
import { LCDAgent } from "../../../lib/agents/lcd-agent.ts";
import { ModifierAssignmentAgent } from "../../../lib/agents/modifier-assignment-agent.ts";
import { ComprehensiveRVUAgent } from "../../../lib/agents/comprehensive-rvu-agent.ts";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Workflow steps constants aligned with the orchestrator
 */

/**
 * Agent dependency mapping - Updated for new workflow
 */
export const AGENT_DEPENDENCIES: Record<string, string[]> = {
  // New workflow dependencies
  ["cpt_agent"]: [],                                    // CPT Agent has no dependencies
  ["icd_agent"]: [WORKFLOW_STEPS.CPT_EXTRACTION],      // ICD depends on CPT
  ["cci_agent"]: [WORKFLOW_STEPS.CPT_EXTRACTION],      // CCI depends on CPT
  ["rvu_agent"]: [WORKFLOW_STEPS.CPT_EXTRACTION],      // RVU depends on CPT
  ["lcd_agent"]: [WORKFLOW_STEPS.ICD_SELECTION],       // LCD depends on ICD
  ["modifier_assignment_agent"]: [WORKFLOW_STEPS.CPT_EXTRACTION, WORKFLOW_STEPS.CCI_VALIDATION], // Modifier depends on CPT and CCI
  
  // Legacy dependencies for backward compatibility - REMOVED
  ["LCD_AGENT"]: [],
  ["CCI_AGENT"]: [],
  ["ComprehensiveRVUAgent"]: ["modifier_assignment_agent"],
};

/**
 * Agent priority levels
 */
export const AGENT_PRIORITIES: Record<string, number> = {
  [WORKFLOW_STEPS.CPT_EXTRACTION]: 100,
  [WORKFLOW_STEPS.ICD_SELECTION]: 95,
  [WORKFLOW_STEPS.CCI_VALIDATION]: 90,
  [WORKFLOW_STEPS.LCD_COVERAGE]: 85,
  [WORKFLOW_STEPS.MODIFIER_ASSIGNMENT]: 80,
  [WORKFLOW_STEPS.RVU_CALCULATION]: 75,
  // Legacy support removed
};

// ============================================================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// ============================================================================

/**
 * Production configuration for stable, high-performance processing
 */
export const PRODUCTION_CONFIG: WorkflowConfig = {
  maxConcurrentJobs: 5,
  defaultTimeout: 180000, // 3 minutes
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 2000,
    retryCondition: (error) => error.severity !== ProcessingErrorSeverity.CRITICAL,
  },
  errorPolicy: "continue",
};

/**
 * Development configuration for faster iteration and debugging
 */
export const DEVELOPMENT_CONFIG: WorkflowConfig = {
  maxConcurrentJobs: 2,
  defaultTimeout: 60000, // 1 minute
  retryPolicy: {
    maxRetries: 2,
    backoffMs: 1000,
    retryCondition: (error) => error.severity !== ProcessingErrorSeverity.CRITICAL,
  },
  errorPolicy: "continue",
};

/**
 * Testing configuration for fast, fail-fast testing
 */
export const TESTING_CONFIG: WorkflowConfig = {
  maxConcurrentJobs: 1,
  defaultTimeout: 30000, // 30 seconds
  retryPolicy: {
    maxRetries: 1,
    backoffMs: 500,
    retryCondition: (error) => false, // No retries in testing
  },
  errorPolicy: "fail-fast",
};

// ============================================================================
// AGENT REGISTRATION FUNCTIONS
// ============================================================================

/**
 * Registers all available agents with the orchestrator
 *
 * @param orchestrator - The WorkflowOrchestrator instance
 * @param logger - The WorkflowLogger instance
 * @param config - Optional configuration overrides
 */
export function registerAllAgents(
  orchestrator: WorkflowOrchestrator,
  logger: WorkflowLogger,
  config?: Partial<AgentRegistrationConfig>,
): void {
  logger.logInfo("registerAllAgents", "Registering all agents with new workflow steps...", { config });
  const registrationConfig = {
    includeOptionalAgents: true,
    enableAllAgents: true,
    customTimeouts: {},
    ...config,
  };

  try {
    // Phase 1: Foundation Agent (CPT Extraction)
    logger.logDebug("registerAllAgents", "Registering Phase 1: CPT Extraction Agent...");
    registerCPTAgent(orchestrator, registrationConfig, logger);

    // Phase 2: Parallel Agents (ICD, CCI, RVU)
    logger.logDebug("registerAllAgents", "Registering Phase 2: Parallel Agents...");
    registerICDAgent(orchestrator, registrationConfig, logger);
    registerCCIAgent(orchestrator, registrationConfig, logger);
    registerComprehensiveRVUAgent(orchestrator, registrationConfig, logger);

    // Phase 3: Sequential Dependencies (LCD, Modifier)
    logger.logDebug("registerAllAgents", "Registering Phase 3: Sequential Dependencies...");
    registerLCDAgent(orchestrator, registrationConfig, logger);
    registerModifierAssignmentAgent(orchestrator, registrationConfig, logger);

    logger.logInfo("registerAllAgents", "Successfully registered all agents with new workflow.");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.logError("registerAllAgents", "Failed to register agents.", {
      error: errorMessage,
    });
    throw new Error(`Agent registration failed: ${errorMessage}`);
  }
}

/**
 * Creates a production-ready agent pipeline
 *
 * @param orchestrator - The WorkflowOrchestrator instance
 */
export function createProductionAgentPipeline(
  orchestrator: WorkflowOrchestrator,
  logger: WorkflowLogger,
): void {
  orchestrator.updateConfiguration(PRODUCTION_CONFIG);
  registerAllAgents(orchestrator, logger, {
    includeOptionalAgents: true,
    enableAllAgents: true,
    customTimeouts: {
      [WORKFLOW_STEPS.CPT_EXTRACTION]: 45000, // 45 seconds
      [WORKFLOW_STEPS.ICD_SELECTION]: 30000, // 30 seconds
      [WORKFLOW_STEPS.CCI_VALIDATION]: 20000, // 20 seconds
      [WORKFLOW_STEPS.LCD_COVERAGE]: 25000, // 25 seconds
      [WORKFLOW_STEPS.MODIFIER_ASSIGNMENT]: 90000, // 90 seconds - increased for batch processing
      [WORKFLOW_STEPS.RVU_CALCULATION]: 35000, // 35 seconds
    },
  });
}

/**
 * Creates a development agent pipeline with debugging features
 *
 * @param orchestrator - The WorkflowOrchestrator instance
 */
export function createDevelopmentAgentPipeline(
  orchestrator: WorkflowOrchestrator,
  logger: WorkflowLogger,
): void {
  orchestrator.updateConfiguration(DEVELOPMENT_CONFIG);
  registerAllAgents(orchestrator, logger, {
    includeOptionalAgents: true,
    enableAllAgents: true,
    customTimeouts: {
      [WORKFLOW_STEPS.CPT_EXTRACTION]: 30000, // 30 seconds
      [WORKFLOW_STEPS.ICD_SELECTION]: 20000, // 20 seconds
      [WORKFLOW_STEPS.CCI_VALIDATION]: 15000, // 15 seconds
      [WORKFLOW_STEPS.LCD_COVERAGE]: 18000, // 18 seconds
      [WORKFLOW_STEPS.MODIFIER_ASSIGNMENT]: 60000, // 60 seconds - increased for batch processing
      [WORKFLOW_STEPS.RVU_CALCULATION]: 25000, // 25 seconds
    },
  });
}

/**
 * Creates a testing agent pipeline for unit and integration tests
 *
 * @param orchestrator - The WorkflowOrchestrator instance
 */
export function createTestingAgentPipeline(
  orchestrator: WorkflowOrchestrator,
  logger: WorkflowLogger,
): void {
  orchestrator.updateConfiguration(TESTING_CONFIG);
  registerAllAgents(orchestrator, logger, {
    includeOptionalAgents: false,
    enableAllAgents: true,
    customTimeouts: {
      [WORKFLOW_STEPS.CPT_EXTRACTION]: 10000, // 10 seconds
      [WORKFLOW_STEPS.ICD_SELECTION]: 8000, // 8 seconds
      [WORKFLOW_STEPS.CCI_VALIDATION]: 5000, // 5 seconds
      [WORKFLOW_STEPS.LCD_COVERAGE]: 7000, // 7 seconds
      [WORKFLOW_STEPS.MODIFIER_ASSIGNMENT]: 30000, // 30 seconds - increased for batch processing
      [WORKFLOW_STEPS.RVU_CALCULATION]: 12000, // 12 seconds
    },
  });
}

// ============================================================================
// INDIVIDUAL AGENT REGISTRATION FUNCTIONS
// ============================================================================

/**
 * Registers the CPT Agent (New workflow)
 */
function registerCPTAgent(
  orchestrator: WorkflowOrchestrator,
  config: AgentRegistrationConfig,
  logger: WorkflowLogger,
): void {
  try {
    const agent = new CPTAgent();
    logger.logInfo(
      "registerCPTAgent",
      `Registering agent: ${agent.name?.toString() || 'CPT Agent'} (RAG-based vector search)`,
    );
    orchestrator.registerAgent(
      agent as any,
      WORKFLOW_STEPS.CPT_EXTRACTION,
      AGENT_DEPENDENCIES["cpt_agent"],
      AGENT_PRIORITIES[WORKFLOW_STEPS.CPT_EXTRACTION],
      false, // Required agent
    );

    if (config.customTimeouts?.[WORKFLOW_STEPS.CPT_EXTRACTION]) {
      orchestrator.setAgentTimeout(
        WORKFLOW_STEPS.CPT_EXTRACTION,
        config.customTimeouts[WORKFLOW_STEPS.CPT_EXTRACTION],
      );
    }
  } catch (error) {
    logger.logError(
      "registerCPTAgent",
      "Failed to register CPT Agent",
      { error },
    );
    throw error;
  }
}

/**
 * Registers the ICD Agent (New workflow)
 */
function registerICDAgent(
  orchestrator: WorkflowOrchestrator,
  config: AgentRegistrationConfig,
  logger: WorkflowLogger,
): void {
  try {
    const agent = new ICDAgent();
    logger.logInfo(
      "registerICDAgent",
      `Registering agent: ${agent.name?.toString() || 'ICD Agent'}`,
    );
    orchestrator.registerAgent(
      agent as any,
      WORKFLOW_STEPS.ICD_SELECTION,
      AGENT_DEPENDENCIES["icd_agent"],
      AGENT_PRIORITIES[WORKFLOW_STEPS.ICD_SELECTION],
      false, // Required agent
    );

    if (config.customTimeouts?.[WORKFLOW_STEPS.ICD_SELECTION]) {
      orchestrator.setAgentTimeout(
        WORKFLOW_STEPS.ICD_SELECTION,
        config.customTimeouts[WORKFLOW_STEPS.ICD_SELECTION],
      );
    }
  } catch (error) {
    logger.logError(
      "registerICDAgent",
      "Failed to register ICD Agent",
      { error },
    );
    throw error;
  }
}

// registerCodeExtractionAgent function removed - legacy agent deprecated

/**
 * Registers the CCI Agent
 */
function registerCCIAgent(
  orchestrator: WorkflowOrchestrator,
  config: AgentRegistrationConfig,
  logger: WorkflowLogger,
): void {
  try {
    const agent = new CCIAgent();
    logger.logInfo("registerCCIAgent", `Registering agent: ${agent.name?.toString() || 'CCI Agent'}`);
    orchestrator.registerAgent(
      agent as any, // Type assertion to handle interface mismatch
      WORKFLOW_STEPS.CCI_VALIDATION,
      AGENT_DEPENDENCIES["cci_agent"] || [],
      AGENT_PRIORITIES[WORKFLOW_STEPS.CCI_VALIDATION],
      false, // Required agent
    );

    if (config.customTimeouts?.[WORKFLOW_STEPS.CCI_VALIDATION]) {
      orchestrator.setAgentTimeout(
        WORKFLOW_STEPS.CCI_VALIDATION,
        config.customTimeouts[WORKFLOW_STEPS.CCI_VALIDATION],
      );
    }
  } catch (error) {
    logger.logError("registerCCIAgent", "Failed to register CCI Agent", {
      error,
    });
    throw error;
  }
}

/**
 * Registers the LCD Agent
 */
function registerLCDAgent(
  orchestrator: WorkflowOrchestrator,
  config: AgentRegistrationConfig,
  logger: WorkflowLogger,
): void {
  try {
    const agent = new LCDAgent();
    logger.logInfo("registerLCDAgent", `Registering agent: ${agent.name?.toString() || 'LCD Agent'}`);
    orchestrator.registerAgent(
      agent as any,
      WORKFLOW_STEPS.LCD_COVERAGE,
      AGENT_DEPENDENCIES["lcd_agent"] || [],
      AGENT_PRIORITIES[WORKFLOW_STEPS.LCD_COVERAGE],
      false, // Required agent
    );

    if (config.customTimeouts?.[WORKFLOW_STEPS.LCD_COVERAGE]) {
      orchestrator.setAgentTimeout(
        WORKFLOW_STEPS.LCD_COVERAGE,
        config.customTimeouts[WORKFLOW_STEPS.LCD_COVERAGE],
      );
    }
  } catch (error) {
    logger.logError("registerLCDAgent", "Failed to register LCD Agent", {
      error,
    });
    throw error;
  }
}

/**
 * Registers the Modifier Assignment Agent
 */
function registerModifierAssignmentAgent(
  orchestrator: WorkflowOrchestrator,
  config: AgentRegistrationConfig,
  logger: WorkflowLogger,
): void {
  try {
    // Use the new vector-enhanced modifier agent for improved RAG-based decisions
    const agent = new ModifierAssignmentAgent();
    logger.logInfo(
      "registerModifierAssignmentAgent",
      `Registering agent: ${agent.name?.toString() || 'Modifier Agent'}`,
    );
    orchestrator.registerAgent(
      agent as any,
      WORKFLOW_STEPS.MODIFIER_ASSIGNMENT,
      AGENT_DEPENDENCIES[agent.name],
      AGENT_PRIORITIES[WORKFLOW_STEPS.MODIFIER_ASSIGNMENT],
      false,
    );

    if (config.customTimeouts?.[WORKFLOW_STEPS.MODIFIER_ASSIGNMENT]) {
      orchestrator.setAgentTimeout(
        WORKFLOW_STEPS.MODIFIER_ASSIGNMENT,
        config.customTimeouts[WORKFLOW_STEPS.MODIFIER_ASSIGNMENT],
      );
    }
  } catch (error) {
    logger.logError(
      "registerModifierAssignmentAgent",
      "Failed to register Modifier Assignment Agent",
      { error },
    );
    throw error;
  }
}

/**
 * Registers the Comprehensive RVU Agent
 */
function registerComprehensiveRVUAgent(
  orchestrator: WorkflowOrchestrator,
  config: AgentRegistrationConfig,
  logger: WorkflowLogger,
): void {
  try {
    const agent = new ComprehensiveRVUAgent();
    logger.logInfo(
      "registerComprehensiveRVUAgent",
      `Registering agent: ${agent.name?.toString() || 'RVU Agent'}`,
    );
    orchestrator.registerAgent(
      agent as any,
      WORKFLOW_STEPS.RVU_CALCULATION,
      AGENT_DEPENDENCIES["rvu_agent"] || [],
      AGENT_PRIORITIES[WORKFLOW_STEPS.RVU_CALCULATION],
      false, // Required agent
    );

    if (config.customTimeouts?.[WORKFLOW_STEPS.RVU_CALCULATION]) {
      orchestrator.setAgentTimeout(
        WORKFLOW_STEPS.RVU_CALCULATION,
        config.customTimeouts[WORKFLOW_STEPS.RVU_CALCULATION],
      );
    }
  } catch (error) {
    logger.logError(
      "registerComprehensiveRVUAgent",
      "Failed to register Comprehensive RVU Agent",
      { error },
    );
    throw error;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Configuration interface for agent registration
 */
export interface AgentRegistrationConfig {
  includeOptionalAgents: boolean;
  enableAllAgents: boolean;
  customTimeouts: Record<string, number>;
}

/**
 * Gets the list of all available agents
 */
export function getAvailableAgents(): string[] {
  return [
    "demographics_analysis_agent",
    "cci_validation_agent",
    "modifier_assignment_agent",
  ];
}

/**
 * Gets the dependency tree for all agents
 */
export function getAgentDependencyTree(): Record<string, string[]> {
  return { ...AGENT_DEPENDENCIES };
}

/**
 * Gets the priority levels for all agents
 */
export function getAgentPriorities(): Record<string, number> {
  return { ...AGENT_PRIORITIES };
}

/**
 * Validates that all required agents are available
 */
export function validateAgentAvailability(): {
  isValid: boolean;
  missingAgents: string[];
} {
  const requiredAgents = getAvailableAgents();
  const missingAgents: string[] = [];

  // Check if agent classes are available
  const agentClasses = [LCDAgent, ModifierAssignmentAgent];

  agentClasses.forEach((AgentClass, index) => {
    if (!AgentClass) {
      missingAgents.push(requiredAgents[index]);
    }
  });

  return {
    isValid: missingAgents.length === 0,
    missingAgents,
  };
}

/**
 * Creates a custom agent pipeline with specific agents
 */
export function createCustomAgentPipeline(
  orchestrator: WorkflowOrchestrator,
  logger: WorkflowLogger,
  agentSteps: string[],
  config?: Partial<AgentRegistrationConfig>,
): void {
  const registrationConfig = {
    includeOptionalAgents: true,
    enableAllAgents: true,
    customTimeouts: {},
    ...config,
  };

  agentSteps.forEach((step) => {
    switch (step) {
      default:
        throw new Error(`[AgentFactory] Unknown agent step: ${step}`);
    }
  });
}

/**
 * Gets the configuration for a specific environment
 */
export function getEnvironmentConfig(
  environment: "production" | "development" | "testing",
): WorkflowConfig {
  switch (environment) {
    case "production":
      return PRODUCTION_CONFIG;
    case "development":
      return DEVELOPMENT_CONFIG;
    case "testing":
      return TESTING_CONFIG;
    default:
      throw new Error(`Invalid environment specified: ${environment}`);
  }
}

// ============================================================================
// EXPORT CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * One-stop function to set up orchestrator with environment-specific configuration
 */
export function setupOrchestrator(
  orchestrator: WorkflowOrchestrator,
  logger: WorkflowLogger,
  environment: "production" | "development" | "testing" = "development",
): void {
  switch (environment) {
    case "production":
      createProductionAgentPipeline(orchestrator, logger);
      break;
    case "development":
      createDevelopmentAgentPipeline(orchestrator, logger);
      break;
    case "testing":
      createTestingAgentPipeline(orchestrator, logger);
      break;
    default:
      createDevelopmentAgentPipeline(orchestrator, logger);
  }
}

/**
 * Gets the current version of the agent factory
 */
export function getAgentFactoryVersion(): string {
  return "1.0.0";
}
