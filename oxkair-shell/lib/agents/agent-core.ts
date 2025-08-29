/**
 * Agent Core Interface and Abstract Base Class
 *
 * This file defines the core Agent interface and abstract base class that all
 * agents in the system must implement. It provides the foundational structure
 * for agent execution, evidence creation, and result handling.
 */

import {
  StandardizedAgentResult,
  StandardizedEvidence,
  Agents,
  Notes,
  ProcessingError,
  ProcessingErrorSeverity,
  ServiceRegistry,
} from "./newtypes.ts";
import { WorkflowLogger } from "../../app/coder/lib/logging.ts";
import { StandardizedAgentContext } from "./newtypes.ts";
import { createDefaultAIModelService } from "../services/ai-model-service.ts";

// ============================================================================
// CORE AGENT INTERFACE
// ============================================================================

/**
 * Abstract base class that all agents must extend.
 * Provides common functionality and enforces the agent contract.
 */
export abstract class Agent {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly requiredServices: readonly string[];

  /**
   * The internal execution method that contains the core agent logic.
   * This method is wrapped by the public `execute` method.
   */
  abstract executeInternal(
    context: StandardizedAgentContext,
  ): Promise<StandardizedAgentResult>;

  /**
   * Helper method to create standardized evidence objects.
   * All agents should use this method to ensure consistent evidence format.
   */
  protected createEvidence(
    verbatimEvidence: string[],
    rationale: string,
    confidence: number,
    sourceNote: Notes,
    content?: Record<string, any>,
    sourceAgent?: Agents,
  ): StandardizedEvidence {
    return {
      verbatimEvidence,
      rationale,
      sourceAgent: sourceAgent || this.mapAgentNameToEnum(this.name),
      sourceNote,
      confidence: Math.max(0, Math.min(1, confidence)), // Clamp between 0 and 1
      content,
    };
  }

  /**
   * Maps agent names to the Agents enum
   */
  private mapAgentNameToEnum(agentName: string): Agents {
    switch (agentName) {
      case "modifier_assignment_agent":
        return Agents.MODIFIER;
      case "lcd_coverage_agent":
      case "lcd_agent":
        return Agents.LCD;
      case "comprehensive_rvu_agent":
        return Agents.RVU;
      case "cci_validation_agent":
      case "cci_agent":
        return Agents.COMPLIANCE;
      case "cpt_agent":
        return Agents.CPT;
      case "icd_agent":
        return Agents.ICD;
      case "code_extraction_agent":
        return Agents.CODE_EXTRACTION;
      default:
        return Agents.COMPLIANCE; // Default fallback to compliance
    }
  }

  /**
   * Helper method to create a successful agent result.
   */
  protected createSuccessResult(
    evidence: StandardizedEvidence[],
    executionTime: number,
    confidence: number = 1.0,
    agentSpecificData?: Record<string, any>,
  ): StandardizedAgentResult {
    return {
      success: true,
      evidence: evidence,
      data: agentSpecificData || {},
      metadata: {
        executionTime,
        version: "1.0.0",
        agentName: this.mapAgentNameToEnum(this.name),
      },
    };
  }

  /**
   * Helper method to create a failed agent result.
   */
  protected createFailureResult(
    errors: ProcessingError[],
    evidence: StandardizedEvidence[] = [],
    executionTime: number = 0,
  ): StandardizedAgentResult {
    return {
      success: false,
      evidence: evidence,
      data: {},
      errors,
      metadata: {
        executionTime,
        version: "1.0.0",
        agentName: this.mapAgentNameToEnum(this.name),
      },
    };
  }

  /**
   * Helper method to create a processing error.
   */
  protected createError(
    message: string,
    severity: ProcessingErrorSeverity = ProcessingErrorSeverity.MEDIUM,
    context?: Record<string, any>,
    source?: string,
  ): ProcessingError {
    return {
      message,
      severity,
      timestamp: new Date(),
      source,
      context,
    };
  }

  /**
   * Validates that all required services are available in the context.
   */
  private validateRequiredServices(
    context: StandardizedAgentContext,
  ): ProcessingError[] {
    const errors: ProcessingError[] = [];
    const { services } = context;

    for (const serviceName of this.requiredServices) {
      if (!services[serviceName as keyof ServiceRegistry]) {
        const error = this.createError(
          `Required service '${serviceName}' is not available for agent '${this.name}'`,
          ProcessingErrorSeverity.CRITICAL,
          { requiredService: serviceName },
          "Agent.validateRequiredServices"
        );
        context.logger.logError("Agent.validateRequiredServices", error.message, {
          error,
        });
        errors.push(error);
      }
    }
    return errors;
  }

  /**
   * Public execution method that wraps the agent's core logic with comprehensive
   * logging, validation, and error handling. This is the entry point for the orchestrator.
   */
  public async execute(
    context: StandardizedAgentContext,
  ): Promise<StandardizedAgentResult> {
    const { logger } = context;
    const startTime = Date.now();

    logger.logWorkflow(
      "Agent.execute.start",
      `Starting execution for agent: ${this.name}`,
      { agent: this.name },
    );

    try {
      // 1. Validate required services
      const serviceErrors = this.validateRequiredServices(context);
      if (serviceErrors.length > 0) {
        logger.logError(
          "Agent.execute",
          `Service validation failed for agent: ${this.name}`,
          { errors: serviceErrors },
        );
        return this.createFailureResult(
          serviceErrors,
          [],
          Date.now() - startTime,
        );
      }
      logger.logDebug("Agent.execute", "All required services are available.", {
        requiredServices: this.requiredServices,
      });

      // 2. Execute the agent's core logic
      const result = await this.executeInternal(context);

      // 3. Log the result
      const executionTime = Date.now() - startTime;
      result.metadata.executionTime = executionTime; // Ensure execution time is updated

      if (result.success) {
        logger.logWorkflow(
          "Agent.execute.success",
          `Agent ${this.name} completed successfully.`,
          { result },
        );
      } else {
        logger.logWarn(
          "Agent.execute.failure",
          `Agent ${this.name} completed with errors.`,
          { result },
        );
      }

      // 4. Post-execution validation (optional but recommended)
      if (!this.isValidResult(result)) {
        const validationError = this.createError(
          `Agent '${this.name}' returned an invalid result format.`,
          ProcessingErrorSeverity.HIGH,
          undefined,
          "Agent.execute"
        );
        logger.logError("Agent.execute", validationError.message, { result });
        return this.createFailureResult(
          [validationError],
          result.evidence,
          executionTime,
        );
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";

      logger.logError(
        "Agent.execute.unhandledException",
        `Unhandled exception in agent ${this.name}: ${errorMessage}`,
        {
          error,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      const processingError = this.createError(
        `Unhandled exception during ${this.name} execution: ${errorMessage}`,
        ProcessingErrorSeverity.CRITICAL,
        {
          errorType:
            error instanceof Error ? error.constructor.name : typeof error,
          stackTrace: error instanceof Error ? error.stack : undefined,
        },
        "Agent.execute.unhandledException"
      );

      return this.createFailureResult([processingError], [], executionTime);
    }
  }

  /**
   * Validates that an agent result conforms to the expected format.
   */
  private isValidResult(result: StandardizedAgentResult): boolean {
    if (!result || typeof result !== "object") {
      return false;
    }

    // Check required properties
    if (typeof result.success !== "boolean") {
      return false;
    }

    if (!Array.isArray(result.evidence)) {
      return false;
    }

    if (typeof result.data !== "object") {
      return false;
    }

    if (!result.metadata || typeof result.metadata !== "object") {
      return false;
    }

    if (typeof result.metadata.executionTime !== "number") {
      return false;
    }

    if (typeof result.metadata.version !== "string") {
      return false;
    }

    if (typeof result.metadata.agentName !== "string") {
      return false;
    }

    // Validate evidence array
    for (const evidence of result.evidence) {
      if (!this.isValidEvidence(evidence)) {
        return false;
      }
    }

    // If there are errors, validate them
    if (result.errors) {
      if (!Array.isArray(result.errors)) {
        return false;
      }

      for (const error of result.errors) {
        if (!this.isValidProcessingError(error)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validates that an evidence object conforms to the expected format.
   */
  private isValidEvidence(evidence: StandardizedEvidence): boolean {
    return (
      evidence &&
      typeof evidence === "object" &&
      Array.isArray(evidence.verbatimEvidence) &&
      typeof evidence.rationale === "string" &&
      typeof evidence.sourceAgent === "string" &&
      typeof evidence.sourceNote === "number" &&
      typeof evidence.confidence === "number" &&
      evidence.confidence >= 0 &&
      evidence.confidence <= 1
    );
  }

  /**
   * Validates that a processing error object conforms to the expected format.
   */
  private isValidProcessingError(error: ProcessingError): boolean {
    return (
      error &&
      typeof error === "object" &&
      typeof error.message === "string" &&
      Object.values(ProcessingErrorSeverity).includes(error.severity) &&
      error.timestamp instanceof Date
    );
  }

  /**
   * Helper method to create AI service with agent name for backend assignment.
   */
  protected createAIService(context: StandardizedAgentContext): any {
    return createDefaultAIModelService(context.logger, this.name);
  }

  /**
   * Gets the agent's runtime information for debugging and monitoring.
   */
  getAgentInfo(): {
    name: string;
    description: string;
    requiredServices: string[];
    version: string;
  } {
    return {
      name: this.name,
      description: this.description,
      requiredServices: [...this.requiredServices],
      version: "1.0.0",
    };
  }

  /**
   * Wraps an external API call with standardized logging for request, response, and errors.
   */
  protected async loggedApiCall<T>(
    context: StandardizedAgentContext,
    serviceName: string,
    methodName: string,
    apiCall: () => Promise<T>,
    input?: any,
  ): Promise<T> {
    const { logger } = context;
    const startTime = Date.now();
    const callId = logger.logApiCall(serviceName, methodName, input, startTime);

    try {
      const response = await apiCall();
      const executionTime = Date.now() - startTime;
      logger.logApiResponse(
        callId,
        serviceName,
        methodName,
        response,
        null,
        executionTime,
      );
      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.logApiResponse(
        callId,
        serviceName,
        methodName,
        null,
        error,
        executionTime,
      );
      // Re-throw the error to be handled by the agent's logic
      throw error;
    }
  }

  /**
   * Logs a state transition, providing a clear record of how the workflow state evolves.
   */
  protected logStateUpdate(
    context: StandardizedAgentContext,
    previousState: any,
    newState: any,
    operation: string,
  ): void {
    context.logger.logStateTransition(
      previousState,
      newState,
      this.name,
      operation,
    );
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Type guard to check if an object implements the Agent interface.
 */
export function isAgent(obj: any): obj is Agent {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.name === "string" &&
    typeof obj.description === "string" &&
    Array.isArray(obj.requiredServices) &&
    typeof obj.execute === "function"
  );
}

/**
 * Utility function to create a mock agent for testing purposes.
 */
export function createMockAgent(
  name: string,
  description: string,
  requiredServices: string[] = [],
  executeImplementation?: (
    context: StandardizedAgentContext,
  ) => Promise<StandardizedAgentResult>,
): Agent {
  return new (class extends Agent {
    readonly name = name;
    readonly description = description;
    readonly requiredServices = requiredServices;

    async executeInternal(
      context: StandardizedAgentContext,
    ): Promise<StandardizedAgentResult> {
      if (executeImplementation) {
        return executeImplementation(context);
      }

      // Default mock implementation
      return this.createSuccessResult(
        [
          this.createEvidence(
            ["Mock execution successful"],
            "Mock execution successful",
            1.0,
            Notes.OPERATIVE,
          ),
        ],
        100,
        1.0,
      );
    }
  })();
}
