/**
 * Workflow Orchestrator
 *
 * This file implements the core workflow orchestrator that manages the execution
 * of agents in the AI Agent Architecture. It handles agent sequencing, error
 * handling, state management, and provides the main entry point for processing
 * medical claims through the agent pipeline.
 */

import {
  WorkflowConfig,
  RetryPolicy,
  WORKFLOW_STEPS,
  ERROR_CODES,
  DEFAULT_TIMEOUTS,
} from "../agents/types.ts";
import { ServiceRegistry } from "../services/service-types.ts";
import {
  StandardizedWorkflowState,
  StandardizedAgentResult,
  StandardizedAgentContext,
  ProcessingError,
  ProcessingErrorSeverity,
} from "../agents/newtypes.ts";
import { WorkflowLogger } from "../../app/coder/lib/logging.ts";

import { Agent } from "../agents/agent-core.ts";
import {
  initializeState,
  mergeAgentResult,
  validateState,
  updateWorkflowStep,
  getNextWorkflowStep,
  isWorkflowComplete,
  getStateSummary,
} from "./state-manager.ts";

// ============================================================================
// ORCHESTRATOR CONFIGURATION
// ============================================================================

export interface OrchestrationResult {
  success: boolean;
  finalState: StandardizedWorkflowState;
  executionSummary: {
    totalExecutionTime: number;
    agentsExecuted: number;
    errorsEncountered: number;
    stepsCompleted: string[];
    workflowLogger?: any;
  };
  errors: ProcessingError[];
  agentExecutionResults: Array<StandardizedAgentResult & { agentName: string }>;
}

interface AgentRegistration {
  agent: Agent;
  step: string;
  dependencies: string[];
  priority: number;
  optional: boolean;
}

// ============================================================================
// WORKFLOW ORCHESTRATOR CLASS
// ============================================================================

export class WorkflowOrchestrator {
  private agents: Map<string, AgentRegistration> = new Map();
  private services: ServiceRegistry;
  private config: WorkflowConfig;
  private executionTimeouts: Map<string, number> = new Map();

  constructor(services: ServiceRegistry, config: Partial<WorkflowConfig> = {}) {
    this.services = services;
    this.config = {
      maxConcurrentJobs: config.maxConcurrentJobs || 1,
      defaultTimeout: config.defaultTimeout || DEFAULT_TIMEOUTS.WORKFLOW_TOTAL,
      retryPolicy: config.retryPolicy || {
        maxRetries: 3,
        backoffMs: 1000,
        retryCondition: (error) => error.severity !== ProcessingErrorSeverity.CRITICAL,
      },
      errorPolicy: config.errorPolicy || "skip-dependents",
    };
  }

  /**
   * Registers an agent with the orchestrator.
   */
  registerAgent(
    agent: Agent,
    step: string,
    dependencies: string[] = [],
    priority: number = 0,
    optional: boolean = false,
  ): void {
    this.agents.set(step, {
      agent,
      step,
      dependencies,
      priority,
      optional,
    });
  }

  /**
   * Sets a custom timeout for a specific agent.
   */
  setAgentTimeout(agentName: string, timeoutMs: number): void {
    this.executionTimeouts.set(agentName, timeoutMs);
  }

  /**
   * Main execution method that orchestrates the entire workflow.
   */
  async execute(
    caseId: string,
    initialData?: Partial<StandardizedWorkflowState>,
    logger?: WorkflowLogger,
    onProgressUpdate?: (progress: {
      agent?: string;
      step: string;
      progress?: number;
    }) => void,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const workflowLogger = logger || new WorkflowLogger(caseId, { caseId });
    let state = initializeState(caseId);
    if (initialData) {
      state = { ...state, ...initialData };
    }
    const errors: ProcessingError[] = [];
    const executedAgents: string[] = [];
    const agentExecutionResults: Array<StandardizedAgentResult & { agentName: string }> =
      [];

    workflowLogger.logWorkflow(
      "WorkflowOrchestrator.execute",
      `Executing orchestrator for case ID: ${caseId}`,
      {
        caseId,
        configuredAgents: Array.from(this.agents.keys()),
        config: this.config,
      },
    );

    try {
      const initialValidationErrors = validateState(state, "initial");
      if (initialValidationErrors.length > 0) {
        errors.push(...initialValidationErrors);
        workflowLogger.logError(
          "WorkflowOrchestrator.execute",
          "Initial state validation failed.",
          { errors: initialValidationErrors },
        );
        if (this.config.errorPolicy === "fail-fast") {
          return await this.createFailureResult(
            state,
            errors,
            executedAgents,
            startTime,
            workflowLogger,
            agentExecutionResults,
          );
        }
      } else {
        workflowLogger.logInfo(
          "WorkflowOrchestrator.execute",
          "Initial state validated successfully.",
        );
      }

      const executionPlan = this.createExecutionPlan();
      const totalSteps = executionPlan.length;
      let currentStep = 0;

      // Notify that we're starting agent execution
      onProgressUpdate?.({
        step: "Starting agent execution pipeline...",
        progress: 35,
      });

      // Phase 1: CPT Agent (Foundation - runs alone)
      onProgressUpdate?.({
        step: "Phase 1: Extracting procedure codes...",
        progress: 40,
      });
      
      const cptAgent = this.getAgentByStep(WORKFLOW_STEPS.CPT_EXTRACTION);
      if (cptAgent) {
        try {
          onProgressUpdate?.({
            agent: cptAgent.agent.name,
            step: `Executing CPT Agent: ${cptAgent.agent.name}`,
            progress: 45,
          });
          
          const result = await this.executeAgent(cptAgent.agent, state, workflowLogger);
          agentExecutionResults.push({ ...result, agentName: cptAgent.agent.name });
          
          if (result.success) {
            state = mergeAgentResult(state, result, cptAgent.agent.name);
            state = updateWorkflowStep(state, WORKFLOW_STEPS.CPT_EXTRACTION, cptAgent.agent.name);
            executedAgents.push(cptAgent.agent.name);
            
            onProgressUpdate?.({
              agent: cptAgent.agent.name,
              step: `✓ Completed CPT extraction`,
              progress: 50,
            });
          } else {
            if (result.errors) {
              errors.push(...result.errors);
            }
            if (this.config.errorPolicy === "fail-fast") {
              return await this.createFailureResult(
                state,
                errors,
                executedAgents,
                startTime,
                workflowLogger,
                agentExecutionResults,
              );
            }
          }
        } catch (error) {
          const processingError = this.createExecutionError(
            cptAgent.agent.name,
            error instanceof Error ? error.message : "Unknown error",
            error,
          );
          errors.push(processingError);
          
          if (this.config.errorPolicy === "fail-fast") {
            return await this.createFailureResult(
              state,
              errors,
              executedAgents,
              startTime,
              workflowLogger,
              agentExecutionResults,
            );
          }
        }
      }

      // Phase 2: Run three parallel pathways
      onProgressUpdate?.({
        step: "Phase 2: Running parallel analysis pathways...",
        progress: 55,
      });

      const pathwayPromises = [
        // Pathway A: ICD → LCD (sequential within pathway)
        this.executePathway([
          this.getAgentByStep(WORKFLOW_STEPS.ICD_SELECTION),
          this.getAgentByStep(WORKFLOW_STEPS.LCD_COVERAGE)
        ], state, workflowLogger, "ICD→LCD Pathway"),
        
        // Pathway B: CCI → Modifier (sequential within pathway)  
        this.executePathway([
          this.getAgentByStep(WORKFLOW_STEPS.CCI_VALIDATION),
          this.getAgentByStep(WORKFLOW_STEPS.MODIFIER_ASSIGNMENT)
        ], state, workflowLogger, "CCI→Modifier Pathway"),
        
        // RVU Agent (independent)
        this.executeSingleAgent(
          this.getAgentByStep(WORKFLOW_STEPS.RVU_CALCULATION),
          state,
          workflowLogger
        )
      ];

      onProgressUpdate?.({
        step: "Executing parallel pathways (ICD→LCD, CCI→Modifier, RVU)...",
        progress: 60,
      });

      const pathwayResults = await Promise.allSettled(pathwayPromises);

      // Process pathway results and merge into final state
      onProgressUpdate?.({
        step: "Merging results from parallel pathways...",
        progress: 75,
      });

      pathwayResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (index < 2) {
            // Pathway results (contains final state and execution results from pathway)
            const pathwayResult = result.value as {
              success: boolean;
              finalState: StandardizedWorkflowState;
              executedAgents: string[];
              agentResults: Array<StandardizedAgentResult & { agentName: string }>;
              errors: ProcessingError[];
            };
            if (pathwayResult.success) {
              // CRITICAL FIX: Merge pathway state instead of overwriting to preserve data from other pathways
              state = this.mergePathwayStates(state, pathwayResult.finalState);
              executedAgents.push(...pathwayResult.executedAgents);
              agentExecutionResults.push(...pathwayResult.agentResults);
            } else {
              errors.push(...pathwayResult.errors);
              // Still merge partial results if available
              if (pathwayResult.finalState) {
                state = this.mergePathwayStates(state, pathwayResult.finalState);
              }
              executedAgents.push(...pathwayResult.executedAgents);
              agentExecutionResults.push(...pathwayResult.agentResults);
            }
          } else {
            // RVU result (single agent result)
            const rvuResult = result.value as {
              success: boolean;
              result?: StandardizedAgentResult;
              agentName: string;
              errors: ProcessingError[];
            };
            if (rvuResult.success) {
              state = mergeAgentResult(state, rvuResult.result!, rvuResult.agentName);
              state = updateWorkflowStep(state, WORKFLOW_STEPS.RVU_CALCULATION, rvuResult.agentName);
              executedAgents.push(rvuResult.agentName);
              agentExecutionResults.push({ ...rvuResult.result!, agentName: rvuResult.agentName });
            } else {
              errors.push(...rvuResult.errors);
              if (rvuResult.result) {
                agentExecutionResults.push({ ...rvuResult.result, agentName: rvuResult.agentName });
              }
            }
          }
        } else {
          // Handle rejected promises
          const pathwayNames = ["ICD→LCD Pathway", "CCI→Modifier Pathway", "RVU Agent"];
          const processingError = this.createExecutionError(
            pathwayNames[index],
            `Pathway execution failed: ${result.reason}`,
            result.reason,
          );
          errors.push(processingError);
          
          if (this.config.errorPolicy === "fail-fast") {
            // Don't return here, continue to process other pathways
          }
        }
      });

      onProgressUpdate?.({
        step: "✓ Completed parallel pathway execution",
        progress: 80,
      });

      // Notify about final validation
      onProgressUpdate?.({
        step: "Performing final validation...",
        progress: 85,
      });

      const finalValidationErrors = validateState(state, "final");
      if (finalValidationErrors.length > 0) {
        errors.push(...finalValidationErrors);
        const errorDetails = finalValidationErrors
          .map((e) => e.message)
          .join(", ");
        onProgressUpdate?.({
          step: `Validation found ${finalValidationErrors.length} issue(s): ${errorDetails}`,
          progress: 90,
        });
      } else {
        onProgressUpdate?.({
          step: "✓ Final validation passed",
          progress: 90,
        });
      }

      // Notify about generating execution summary
      onProgressUpdate?.({
        step: "Generating execution summary...",
        progress: 95,
      });

      state.caseMeta.status = errors.length === 0 ? "completed" : "error";
      const executionSummary = workflowLogger.generateExecutionSummary();

      // Notify about completion
      onProgressUpdate?.({
        step: errors.length === 0 ? "✓ Workflow completed successfully!" : "⚠ Workflow completed with errors",
        progress: 100,
      });

      // Note: Logger lifecycle is managed by the calling function (processOperativeNoteAction)
      // Do not close the logger here as the main process may still need to write to it

      const result = {
        success: errors.length === 0 || this.config.errorPolicy !== "fail-fast",
        finalState: state,
        executionSummary: {
          totalExecutionTime: executionSummary.totalExecutionTime,
          agentsExecuted: executionSummary.agentExecutions,
          errorsEncountered: errors.length,
          stepsCompleted: state.completedSteps,
          workflowLogger: executionSummary,
        },
        errors,
        agentExecutionResults,
      };
      
      // Log a more detailed final result with key information expanded
      workflowLogger.logInfo("WorkflowOrchestrator.execute", "Final orchestration result", { 
        success: result.success,
        totalExecutionTime: result.executionSummary.totalExecutionTime,
        agentsExecuted: result.executionSummary.agentsExecuted,
        errorsEncountered: result.executionSummary.errorsEncountered,
        stepsCompleted: result.executionSummary.stepsCompleted,
        finalStateKeys: Object.keys(result.finalState),
        caseMeta: result.finalState.caseMeta,
        procedureCodesCount: result.finalState.procedureCodes?.length || 0,
        diagnosisCodesCount: result.finalState.diagnosisCodes?.length || 0,
        modifiersCount: result.finalState.finalModifiers?.length || 0,
        evidenceCount: result.finalState.allEvidence?.length || 0,
        errors: result.errors.map(e => ({ message: e.message, severity: e.severity })),
        agentResults: result.agentExecutionResults.map(r => ({ 
          agentName: r.agentName, 
          success: r.success, 
          evidenceCount: r.evidence?.length || 0,
          errorCount: r.errors?.length || 0 
        }))
      });
      return result;
    } catch (error) {
      const criticalError = this.createExecutionError(
        "orchestrator",
        `Critical orchestration failure: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        error,
      );
      errors.push(criticalError);
      workflowLogger.logError(
        "WorkflowOrchestrator.execute",
        "Critical orchestration failure.",
        { error: criticalError },
      );
      return await this.createFailureResult(
        state,
        errors,
        executedAgents,
        startTime,
        workflowLogger,
        [],
      );
    }
  }

  /**
   * Executes a single agent with proper error handling and timeouts.
   */
  private async executeAgent(
    agent: Agent,
    state: StandardizedWorkflowState,
    logger: WorkflowLogger,
  ): Promise<StandardizedAgentResult> {
    const context: StandardizedAgentContext = {
      caseId: state.caseMeta.caseId,
      state,
      services: this.services,
      config: this.config,
      logger,
      metadata: {
        orchestratorVersion: "1.0.0",
        executionId: `${state.caseMeta.caseId}-${Date.now()}`,
      },
    };

    const timeout =
      this.executionTimeouts.get(agent.name) ||
      (agent.name === "modifier_assignment_agent" 
        ? DEFAULT_TIMEOUTS.MODIFIER_ASSIGNMENT_AGENT 
        : DEFAULT_TIMEOUTS.AGENT_EXECUTION);

    // Execute with timeout and retry logic
    return this.executeWithRetry(
      () => this.executeWithTimeout(() => agent.execute(context), timeout),
      this.config.retryPolicy,
      agent.name,
    );
  }

  /**
   * Executes a function with retry logic.
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryPolicy: RetryPolicy,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= retryPolicy.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;

        if (attempts > retryPolicy.maxRetries) {
          break;
        }

        // Check if we should retry this error
        const processingError: ProcessingError = {
          message: lastError.message,
          severity: ProcessingErrorSeverity.MEDIUM,
          timestamp: new Date(),
          context: {
            code: ERROR_CODES.AGENT_EXECUTION_FAILED,
            operationName,
            attempt: attempts,
          },
        };

        // Convert to types.ts ProcessingError format for retry condition
        const typesProcessingError = {
          ...processingError,
          code: processingError.code || 'UNKNOWN_ERROR'
        };
        
        if (!retryPolicy.retryCondition(typesProcessingError)) {
          break;
        }

        // Wait before retrying
        await this.sleep(retryPolicy.backoffMs * attempts);
      }
    }

    throw lastError || new Error(`Operation failed after ${attempts} attempts`);
  }

  /**
   * Executes a function with a timeout.
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Creates the execution plan based on registered agents and their dependencies.
   */
  private createExecutionPlan(): string[] {
    const allSteps = Object.values(WORKFLOW_STEPS);

    // Filter to only include steps that have registered agents
    return allSteps.filter((step) => this.getAgentsForStep(step).length > 0);
  }

  /**
   * Gets all agents registered for a specific step.
   */
  private getAgentsForStep(step: string): AgentRegistration[] {
    const agents = Array.from(this.agents.values())
      .filter((registration) => registration.step === step)
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    return agents;
  }

  /**
   * Gets a single agent registration for a specific step.
   */
  private getAgentByStep(step: string): AgentRegistration | undefined {
    return Array.from(this.agents.values()).find(reg => reg.step === step);
  }

  /**
   * Merges states from parallel pathways, preserving data from both states.
   * This is critical to prevent data loss when pathways run in parallel.
   */
  private mergePathwayStates(
    mainState: StandardizedWorkflowState,
    pathwayState: StandardizedWorkflowState
  ): StandardizedWorkflowState {
    return {
      ...mainState,
      ...pathwayState,
      // Preserve arrays by merging them instead of overwriting
      procedureCodes: [
        ...mainState.procedureCodes,
        ...pathwayState.procedureCodes.filter(
          pc => !mainState.procedureCodes.some(existing => existing.code === pc.code)
        )
      ],
      diagnosisCodes: [
        ...mainState.diagnosisCodes,
        ...pathwayState.diagnosisCodes.filter(
          dc => !mainState.diagnosisCodes.some(existing => existing.code === dc.code)
        )
      ],
      hcpcsCodes: [
        ...(mainState.hcpcsCodes || []),
        ...(pathwayState.hcpcsCodes || []).filter(
          hc => !(mainState.hcpcsCodes || []).some(existing => existing.code === hc.code)
        )
      ],
      finalModifiers: [
        ...mainState.finalModifiers,
        ...pathwayState.finalModifiers.filter(
          fm => !mainState.finalModifiers.some(existing => 
            existing.linkedCptCode === fm.linkedCptCode && existing.modifier === fm.modifier
          )
        )
      ],
      allEvidence: [
        ...mainState.allEvidence,
        ...pathwayState.allEvidence
      ],
      completedSteps: [
        ...new Set([...mainState.completedSteps, ...pathwayState.completedSteps])
      ],
      errors: [
        ...mainState.errors,
        ...pathwayState.errors
      ],
      history: [
        ...mainState.history,
        ...pathwayState.history
      ],
      // Use the most recent update time
      updatedAt: pathwayState.updatedAt > mainState.updatedAt ? pathwayState.updatedAt : mainState.updatedAt,
      // Preserve specific results from pathways (last one wins for single-value fields)
      cciResult: pathwayState.cciResult || mainState.cciResult,
      mueResult: pathwayState.mueResult || mainState.mueResult,
      lcdResult: pathwayState.lcdResult || mainState.lcdResult,
      rvuResult: pathwayState.rvuResult || mainState.rvuResult,
      rvuCalculations: pathwayState.rvuCalculations || mainState.rvuCalculations,
      rvuSequencingResult: pathwayState.rvuSequencingResult || mainState.rvuSequencingResult,
    };
  }

  /**
   * Executes a pathway of agents sequentially within the pathway.
   */
  private async executePathway(
    agents: (AgentRegistration | undefined)[], 
    initialState: StandardizedWorkflowState, 
    logger: WorkflowLogger,
    pathwayName: string
  ): Promise<{
    success: boolean;
    finalState: StandardizedWorkflowState;
    executedAgents: string[];
    agentResults: Array<StandardizedAgentResult & { agentName: string }>;
    errors: ProcessingError[];
  }> {
    let currentState = { ...initialState };
    const executedAgents: string[] = [];
    const agentResults: Array<StandardizedAgentResult & { agentName: string }> = [];
    const errors: ProcessingError[] = [];
    
    logger.logInfo("executePathway", `Starting pathway: ${pathwayName}`);
    
    for (const agentReg of agents.filter(a => a)) {
      if (!agentReg) continue;
      
      try {
        logger.logInfo("executePathway", `Executing agent ${agentReg.agent.name} in pathway ${pathwayName}`);
        const result = await this.executeAgent(agentReg.agent, currentState, logger);
        agentResults.push({ ...result, agentName: agentReg.agent.name });
        
        if (result.success) {
          currentState = mergeAgentResult(currentState, result, agentReg.agent.name);
          currentState = updateWorkflowStep(currentState, agentReg.step, agentReg.agent.name);
          executedAgents.push(agentReg.agent.name);
          logger.logInfo("executePathway", `Successfully completed agent ${agentReg.agent.name} in pathway ${pathwayName}`);
        } else {
          if (result.errors) {
            errors.push(...result.errors);
          }
          logger.logError("executePathway", `Agent ${agentReg.agent.name} failed in pathway ${pathwayName}`, { errors: result.errors });
          
          // Continue with other agents in pathway unless it's a critical failure
          if (!agentReg.optional && this.config.errorPolicy === "fail-fast") {
            break;
          }
        }
      } catch (error) {
        const processingError = this.createExecutionError(
          agentReg.agent.name,
          error instanceof Error ? error.message : "Unknown error",
          error,
        );
        errors.push(processingError);
        logger.logError("executePathway", `Agent ${agentReg.agent.name} threw exception in pathway ${pathwayName}`, { error: processingError });
        
        if (!agentReg.optional && this.config.errorPolicy === "fail-fast") {
          break;
        }
      }
    }
    
    logger.logInfo("executePathway", `Completed pathway: ${pathwayName}`, {
      executedAgents: executedAgents.length,
      errors: errors.length,
      success: errors.length === 0
    });
    
    return {
      success: errors.length === 0,
      finalState: currentState,
      executedAgents,
      agentResults,
      errors
    };
  }

  /**
   * Executes a single agent independently.
   */
  private async executeSingleAgent(
    agentReg: AgentRegistration | undefined,
    state: StandardizedWorkflowState,
    logger: WorkflowLogger
  ): Promise<{
    success: boolean;
    result?: StandardizedAgentResult;
    agentName: string;
    errors: ProcessingError[];
  }> {
    if (!agentReg) {
      return {
        success: false,
        agentName: "unknown",
        errors: [this.createExecutionError("unknown", "Agent registration not found", null)]
      };
    }
    
    try {
      logger.logInfo("executeSingleAgent", `Executing independent agent: ${agentReg.agent.name}`);
      const result = await this.executeAgent(agentReg.agent, state, logger);
      
      if (result.success) {
        logger.logInfo("executeSingleAgent", `Successfully completed independent agent: ${agentReg.agent.name}`);
        return {
          success: true,
          result,
          agentName: agentReg.agent.name,
          errors: []
        };
      } else {
        logger.logError("executeSingleAgent", `Independent agent failed: ${agentReg.agent.name}`, { errors: result.errors });
        return {
          success: false,
          result,
          agentName: agentReg.agent.name,
          errors: result.errors || []
        };
      }
    } catch (error) {
      const processingError = this.createExecutionError(
        agentReg.agent.name,
        error instanceof Error ? error.message : "Unknown error",
        error,
      );
      logger.logError("executeSingleAgent", `Independent agent threw exception: ${agentReg.agent.name}`, { error: processingError });
      
      return {
        success: false,
        agentName: agentReg.agent.name,
        errors: [processingError]
      };
    }
  }

  /**
   * Creates a processing error from an execution error.
   */
  private createExecutionError(
    source: string,
    message: string,
    originalError?: any,
  ): ProcessingError {
    return {
      message,
      severity: ProcessingErrorSeverity.HIGH,
      timestamp: new Date(),
      source,
      context: {
        code: ERROR_CODES.AGENT_EXECUTION_FAILED,
        originalError:
          originalError instanceof Error
            ? originalError.message
            : String(originalError),
      },
      stackTrace:
        originalError instanceof Error ? originalError.stack : undefined,
    };
  }

  /**
   * Creates a failure result for the orchestration.
   */
  private async createFailureResult(
    state: StandardizedWorkflowState,
    errors: ProcessingError[],
    executedAgents: string[],
    startTime: number,
    logger: WorkflowLogger,
    agentExecutionResults: Array<StandardizedAgentResult & { agentName: string }>,
  ): Promise<OrchestrationResult> {
    state.caseMeta.status = "error";
    const executionSummary = logger.generateExecutionSummary();

    // Note: Logger lifecycle is managed by the calling function (processOperativeNoteAction)
    // Do not close the logger here as the main process may still need to write to it

    return {
      success: false,
      finalState: state,
      executionSummary: {
        totalExecutionTime: executionSummary.totalExecutionTime,
        agentsExecuted: executedAgents.length,
        errorsEncountered: errors.length,
        stepsCompleted: state.completedSteps,
        workflowLogger: executionSummary,
      },
      errors,
      agentExecutionResults,
    };
  }

  /**
   * Utility function to sleep for a given number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gets information about all registered agents.
   */
  getRegisteredAgents(): Array<{
    name: string;
    description: string;
    step: string;
    dependencies: string[];
    priority: number;
    optional: boolean;
  }> {
    return Array.from(this.agents.values()).map((registration) => ({
      name: registration.agent.name,
      description: registration.agent.description,
      step: registration.step,
      dependencies: registration.dependencies,
      priority: registration.priority,
      optional: registration.optional,
    }));
  }

  /**
   * Gets the current configuration.
   */
  getConfiguration(): WorkflowConfig {
    return { ...this.config };
  }

  /**
   * Updates the orchestrator configuration.
   */
  updateConfiguration(newConfig: Partial<WorkflowConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Validates that all agent dependencies are satisfied.
   */
  validateDependencies(): ProcessingError[] {
    const errors: ProcessingError[] = [];
    const agentNames = new Set(Array.from(this.agents.keys()));

    for (const [agentName, registration] of this.agents) {
      for (const dependency of registration.dependencies) {
        if (!agentNames.has(dependency)) {
          errors.push({
            message: `Agent '${agentName}' depends on '${dependency}' which is not registered`,
            severity: ProcessingErrorSeverity.CRITICAL,
            timestamp: new Date(),
            source: agentName,
            context: {
              code: ERROR_CODES.VALIDATION_FAILED,
              missingDependency: dependency,
            },
          });
        }
      }
    }

    return errors;
  }

  /**
   * Clears all registered agents.
   */
  clearAgents(): void {
    this.agents.clear();
    this.executionTimeouts.clear();
  }

  private checkDependencies(
    registration: AgentRegistration,
    executedAgents: string[],
  ): { dependenciesMet: boolean; failedDependencies: string[] } {
    const failedDependencies = registration.dependencies.filter(
      (dep) => !executedAgents.includes(dep),
    );
    return {
      dependenciesMet: failedDependencies.length === 0,
      failedDependencies,
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates a default workflow orchestrator with basic configuration.
 */
export function createDefaultOrchestrator(
  services: ServiceRegistry,
): WorkflowOrchestrator {
  return new WorkflowOrchestrator(services, {
    maxConcurrentJobs: 1,
    defaultTimeout: DEFAULT_TIMEOUTS.WORKFLOW_TOTAL,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
      retryCondition: (error) => error.severity !== ProcessingErrorSeverity.CRITICAL,
    },
    errorPolicy: "continue",
  });
}

/**
 * Creates a fast-fail orchestrator for testing purposes.
 */
export function createTestOrchestrator(
  services: ServiceRegistry,
): WorkflowOrchestrator {
  return new WorkflowOrchestrator(services, {
    maxConcurrentJobs: 1,
    defaultTimeout: 5000, // 5 seconds for testing
    retryPolicy: {
      maxRetries: 1,
      backoffMs: 100,
      retryCondition: () => false, // No retries in testing
    },
    errorPolicy: "fail-fast",
  });
}
