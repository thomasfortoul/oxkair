/**
 * Orchestrator Processing Module
 *
 * This module implements the orchestrator-based case processing workflow that replaces
 * the monolithic processCaseDocuments function. It uses the WorkflowOrchestrator class
 * and the complete agent pipeline to process medical cases through a configurable,
 * modular architecture.
 *
 * Key Features:
 * - Modular agent-based processing
 * - Comprehensive error handling
 * - Progress tracking and status updates
 * - Backward compatibility with existing data structures
 * - Configurable timeout and retry policies
 */

import {
  WorkflowOrchestrator,
  createDefaultOrchestrator,
  OrchestrationResult,
} from "../../../lib/workflow/workflow-orchestrator";
// Removed deprecated imports - using ServiceRegistry class and ProcessingErrorSeverity from newtypes.ts
import {
  Agents,
  Notes,
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedModifier,
  StandardizedEvidence,
  ProcessingError,
  ProcessingErrorSeverity,
  StandardizedWorkflowState,
  CaseMeta,
  Demographics,
  EnhancedCaseNotes,
  ModifierClassifications,
} from "../../../lib/agents/newtypes";
import { ServiceRegistry } from "../../../lib/services/service-registry.ts";
import {
  CaseNotes,
  AiRawOutput,
  PatientDemographics,
  EncounterInfo,
  AppliedModifiers,
  ComplianceIssue,
  RVUSequencing,
  ClinicalContextSummary,
  HCPCSCode,
} from "./ai-workflow-types.ts";

export type {
  HCPCSCode,
  RVUSequencing,
  ClinicalContextSummary,
  ComplianceIssue,
};
import { registerAllAgents } from "./agent-factory.ts";
import { v4 as uuidv4 } from "uuid";
import { WorkflowLogger } from "./logging.ts";

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

// EnhancedCaseNotes is now imported from newtypes.ts

/**
 * Processing result interface that matches the expected output format
 */
export interface ProcessingResult {
  success: boolean;
  data?: AiRawOutput;
  error?: string;
  metadata?: {
    executionTime: number;
    agentsExecuted: number;
    stepsCompleted: string[];
    errorsEncountered: number;
  };
  executionSummary?: any;
}

/**
 * Progress update callback type
 */
export type ProgressCallback = (progress: {
  agent?: string;
  step: string;
  progress?: number;
}) => void;

/**
 * Processing options for configuring the orchestrator
 */
export interface ProcessingOptions {
  priorityLevel?: "low" | "normal" | "high";
  requiredAgents?: string[];
  optionalAgents?: string[];
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  aiModelConfig?: {
    model?: string;
    provider?: "openai" | "anthropic" | "local";
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Main entry point for orchestrator-based case processing
 *
 * @param caseNotes - The case notes to process
 * @param caseMeta - Case metadata (optional, will be generated if not provided)
 * @param onProgressUpdate - Progress callback function
 * @param options - Processing options
 * @returns Promise<ProcessingResult>
 */
export async function processCaseWithOrchestrator(
  caseNotes: CaseNotes,
  caseMeta: Partial<CaseMeta> = {},
  workflowLogger: WorkflowLogger,
  onProgressUpdate?: ProgressCallback,
  options: ProcessingOptions = {},
): Promise<ProcessingResult> {
  const startTime = Date.now();

  try {
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Orchestrator processing started.",
    );
    console.log(
      `[DEBUG] processCaseWithOrchestrator started for case: ${caseMeta.caseId}`,
    );
    console.log(
      `[DEBUG] Environment: NODE_ENV=${process.env.NODE_ENV}, VERCEL=${process.env.VERCEL}`,
    );

    // Step 1: Input validation
    onProgressUpdate?.({ step: "Validating input data...", progress: 5 });
    const validationResult = validateInputs(
      caseNotes,
      caseMeta,
      workflowLogger,
    );
    if (!validationResult.isValid) {
      workflowLogger.logError(
        "processCaseWithOrchestrator",
        `Input validation failed: ${validationResult.errors.join(", ")}`,
      );
      return {
        success: false,
        error: `Input validation failed: ${validationResult.errors.join(", ")}`,
        metadata: {
          executionTime: Date.now() - startTime,
          agentsExecuted: 0,
          stepsCompleted: [],
          errorsEncountered: validationResult.errors.length,
        },
        executionSummary: workflowLogger.generateExecutionSummary(),
      };
    }
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Input validation successful.",
    );

    // Step 2: Data transformation
    onProgressUpdate?.({ step: "Transforming input data...", progress: 10 });
    const transformedCaseMeta = transformToCaseMeta(
      caseNotes,
      caseMeta,
      workflowLogger,
    );
    const enhancedCaseNotes = transformCaseNotes(caseNotes, workflowLogger);
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Data transformation complete.",
    );

    // Step 3: Create service registry
    onProgressUpdate?.({ step: "Initializing services...", progress: 15 });
    console.log(
      `[DEBUG] About to create service registry for case: ${caseMeta.caseId}`,
    );
    console.log(`[DEBUG] Environment variables check:`, {
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasAzureKey: !!process.env.AZURE_OPENAI_API_KEY,
      hasAzureEndpoint: !!process.env.AZURE_OPENAI_ENDPOINT,
      azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      nodeEnv: process.env.NODE_ENV,
      isVercel: !!process.env.VERCEL,
    });
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Creating service registry",
    );
    console.log(
      `[DEBUG] About to create service registry for case: ${caseMeta.caseId}`,
    );
    const serviceRegistry = await createServiceRegistry(
      workflowLogger,
      options.aiModelConfig,
    );
    console.log(
      `[DEBUG] Service registry created successfully for case: ${caseMeta.caseId}`,
    );
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Service registry created.",
    );

    // Step 4: Create and configure orchestrator
    onProgressUpdate?.({ step: "Setting up orchestrator...", progress: 20 });
    const orchestrator = createDefaultOrchestrator(serviceRegistry);
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Orchestrator created.",
    );

    // Step 5: Register all agents
    onProgressUpdate?.({ step: "Registering agents...", progress: 25 });
    registerAllAgents(orchestrator, workflowLogger);
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "All agents registered.",
    );

    // Step 6: Initialize workflow state
    onProgressUpdate?.({
      step: "Initializing workflow state...",
      progress: 30,
    });
    const initialState = await initializeWorkflowState(
      transformedCaseMeta,
      enhancedCaseNotes,
      workflowLogger,
    );
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Workflow state initialized.",
    );

    // Step 7: Execute orchestrator
    onProgressUpdate?.({ step: "Executing agent pipeline...", progress: 35 });
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      `Executing orchestrator for case ID: ${transformedCaseMeta.caseId}`,
    );
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Executing orchestrator",
    );
    const orchestrationResult = await orchestrator.execute(
      transformedCaseMeta.caseId,
      initialState,
      workflowLogger,
      onProgressUpdate,
    );
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Orchestrator execution complete",
    );
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Orchestrator execution finished.",
    );

    // Step 8: Process results
    onProgressUpdate?.({ step: "Processing results...", progress: 85 });
    // Continue with result transformation even if some non-critical agents failed
    if (!orchestrationResult.success) {
      const errorSummary = `Processing completed with ${orchestrationResult.errors.length} error(s).`;
      workflowLogger.logWarn(
        "processCaseWithOrchestrator",
        "Orchestrator processing finished with non-critical errors. Attempting to salvage partial results.",
        { errors: orchestrationResult.errors },
      );
    }

    const processedResult = await transformOrchestrationResult(
      orchestrationResult as OrchestrationResult,
      enhancedCaseNotes,
      onProgressUpdate,
    );
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Orchestration result transformed.",
    );

    if (!processedResult.success) {
      // If the transformation failed, still return the partial data to prevent null ai_raw_output
      workflowLogger.logWarn(
        "processCaseWithOrchestrator",
        `Transformation failed but returning partial data: ${processedResult.error}`,
        { hasPartialData: !!processedResult.data },
      );
      return {
        success: false,
        error: processedResult.error,
        data: processedResult.data, // This will contain the minimal structure from the catch block
        metadata: {
          executionTime: Date.now() - startTime,
          agentsExecuted: 0,
          stepsCompleted: ["validation", "transformation"],
          errorsEncountered: 1,
        },
        executionSummary: workflowLogger.generateExecutionSummary(),
      };
    }

    // Step 9: Final validation and formatting
    onProgressUpdate?.({ step: "Finalizing results...", progress: 95 });
    const finalResult = await finalizeProcessingResult(
      processedResult.data!,
      startTime,
      workflowLogger,
    );
    workflowLogger.logInfo(
      "processCaseWithOrchestrator",
      "Processing finalized.",
    );

    onProgressUpdate?.({ step: "Processing complete!", progress: 100 });
    return {
      ...finalResult,
      executionSummary: workflowLogger.generateExecutionSummary(),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred.";
    workflowLogger.logError(
      "processCaseWithOrchestrator",
      `Unhandled exception in processCaseWithOrchestrator: ${errorMessage}`,
      { error },
    );
    onProgressUpdate?.({
      step: `Processing failed: ${errorMessage}`,
      progress: 100,
    });
    return {
      success: false,
      error: errorMessage,
      metadata: {
        executionTime: Date.now() - startTime,
        agentsExecuted: 0,
        stepsCompleted: [],
        errorsEncountered: 1,
      },
      executionSummary: workflowLogger.generateExecutionSummary(),
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validates input data before processing
 */
function validateInputs(
  caseNotes: CaseNotes,
  caseMeta: Partial<CaseMeta>,
  logger: WorkflowLogger,
): { isValid: boolean; errors: string[] } {
  logger.logInfo("validateInputs", "Validating input data...");
  const errors: string[] = [];

  if (!caseNotes) {
    errors.push("Case notes are required");
  } else {
    if (
      !caseNotes.primaryNoteText ||
      caseNotes.primaryNoteText.trim().length === 0
    ) {
      errors.push("Primary note text is required");
    }
    if (
      caseNotes.primaryNoteText &&
      caseNotes.primaryNoteText.length > 100000
    ) {
      errors.push("Primary note text exceeds maximum length limit");
    }
  }

  if (caseMeta) {
    if (
      caseMeta.dateOfService &&
      !(caseMeta.dateOfService instanceof Date) &&
      (typeof caseMeta.dateOfService !== "string" ||
        isNaN(Date.parse(caseMeta.dateOfService as string)))
    ) {
      errors.push(
        "Date of service must be a valid Date object or an ISO date string",
      );
    }
    if (
      caseMeta.claimType &&
      !["primary", "secondary", "tertiary"].includes(caseMeta.claimType)
    ) {
      errors.push("Claim type must be primary, secondary, or tertiary");
    }
  }

  if (errors.length > 0) {
    logger.logWarn("validateInputs", "Input validation failed", { errors });
  } else {
    logger.logInfo("validateInputs", "Input validation successful");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Transforms case notes to enhanced format
 */
function transformCaseNotes(
  caseNotes: CaseNotes,
  logger: WorkflowLogger,
): EnhancedCaseNotes {
  logger.logInfo(
    "transformCaseNotes",
    "Transforming case notes to enhanced format.",
  );
  const enhanced: EnhancedCaseNotes = {
    primaryNoteText: caseNotes.primaryNoteText,
    additionalNotes:
      caseNotes.additionalNotes?.map((note) => ({
        type: normalizeNoteType(note.type),
        content: note.text,
        metadata: {
          originalType: note.type,
          length: note.text?.length || 0,
          timestamp: new Date(),
        },
      })) || [],
  };
  logger.logInfo("transformCaseNotes", "Case notes transformed successfully.");
  return enhanced;
}

/**
 * Normalizes note types to standard format
 */
function normalizeNoteType(
  type: string,
):
  | "operative"
  | "admission"
  | "discharge"
  | "pathology"
  | "progress"
  | "bedside" {
  const normalizedType = type.toLowerCase().replace(/[^a-z]/g, "");

  switch (normalizedType) {
    case "operative":
    case "operativenotes":
      return "operative";
    case "admission":
    case "admissionnotes":
      return "admission";
    case "discharge":
    case "dischargenotes":
      return "discharge";
    case "pathology":
    case "pathologynotes":
      return "pathology";
    case "progress":
    case "progressnotes":
      return "progress";
    case "bedside":
    case "bedsidenotes":
      return "bedside";
    default:
      return "operative"; // Default fallback
  }
}

/**
 * Transforms input data to CaseMeta format
 */
function transformToCaseMeta(
  caseNotes: CaseNotes,
  caseMeta: Partial<CaseMeta>,
  logger: WorkflowLogger,
): CaseMeta {
  logger.logInfo(
    "transformToCaseMeta",
    "Transforming input data to CaseMeta format.",
  );
  const caseId = caseMeta?.caseId || uuidv4();

  const meta: CaseMeta = {
    caseId,
    patientId:
      caseMeta?.patientId ||
      extractPatientId(caseNotes.primaryNoteText) ||
      `patient-${caseId}`,
    providerId:
      caseMeta?.providerId ||
      extractProviderId(caseNotes.primaryNoteText) ||
      `provider-${caseId}`,
    dateOfService: caseMeta?.dateOfService || new Date(),
    claimType: caseMeta?.claimType || "primary",
    status: "processing",
  };
  logger.logInfo(
    "transformToCaseMeta",
    `CaseMeta created with caseId: ${caseId}`,
  );
  return meta;
}

/**
 * Extracts patient ID from note text (basic implementation)
 */
function extractPatientId(noteText: string): string | null {
  const patterns = [
    /patient\s+id[:\s]+(\w+)/i,
    /mrn[:\s]+(\w+)/i,
    /medical\s+record\s+number[:\s]+(\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = noteText.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extracts provider ID from note text (basic implementation)
 */
function extractProviderId(noteText: string): string | null {
  const patterns = [
    /provider[:\s]+(\w+)/i,
    /physician[:\s]+(\w+)/i,
    /doctor[:\s]+(\w+)/i,
    /surgeon[:\s]+(\w+)/i,
  ];

  for (const pattern of patterns) {
    const match = noteText.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Creates a service registry for the orchestrator
 */
async function createServiceRegistry(
  logger: WorkflowLogger,
  aiModelConfig?: {
    model?: string;
    provider?: "openai" | "anthropic" | "local";
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  },
): Promise<ServiceRegistry> {
  try {
    console.log(`[DEBUG] Creating ServiceRegistry instance`);
    console.log(
      `[DIAGNOSTIC_LOG] orchestratorProcessing.ts: ENTER createServiceRegistry`,
    );
    const serviceRegistry = new ServiceRegistry(logger);

    // Configure AI model if config is provided
    if (aiModelConfig) {
      console.log(`[DEBUG] Configuring AI model with config:`, aiModelConfig);
      serviceRegistry.aiModel.updateConfig(aiModelConfig);
      logger.logInfo("createServiceRegistry", "AI model configured", {
        config: aiModelConfig,
      });
    }

    console.log(`[DEBUG] Initializing service registry`);
    console.log(
      `[DIAGNOSTIC_LOG] orchestratorProcessing.ts: PRE-serviceRegistry.initialize()`,
    );
    await serviceRegistry.initialize();
    console.log(
      `[DIAGNOSTIC_LOG] orchestratorProcessing.ts: POST-serviceRegistry.initialize()`,
    );
    console.log(`[DEBUG] Service registry initialized successfully`);
    return serviceRegistry;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[DEBUG] Error creating service registry:`, error);
    logger.logError(
      "createServiceRegistry",
      `Failed to create service registry: ${errorMessage}`,
      { error },
    );
    throw new Error(`Service registry initialization failed: ${errorMessage}`);
  }
}

/**
 * Initializes the workflow state from case data
 */
async function initializeWorkflowState(
  caseMeta: CaseMeta,
  caseNotes: EnhancedCaseNotes,
  logger: WorkflowLogger,
): Promise<Partial<StandardizedWorkflowState>> {
  logger.logInfo("initializeWorkflowState", "Initializing workflow state.");
  const state: Partial<StandardizedWorkflowState> = {
    caseMeta,
    caseNotes,
    demographics: createInitialDemographics(),
    procedureCodes: [],
    diagnosisCodes: [],
    hcpcsCodes: [], // Initialize HCPCS codes array
    finalModifiers: [],
    claimSequence: {
      lineItems: [],
      diagnoses: [],
      modifiers: [],
      totalUnits: 0,
      estimatedReimbursement: 0,
    },
    errors: [],
  };
  logger.logInfo(
    "initializeWorkflowState",
    "Workflow state initialized successfully.",
  );
  return state;
}

/**
 * Creates initial demographics structure
 */
function createInitialDemographics(): Demographics {
  return {
    age: 0,
    gender: "O",
    zipCode: "",
    insuranceType: "",
    membershipStatus: "active",
  };
}

/**
 * Transforms orchestration result to expected format
 */
export async function transformOrchestrationResult(
  orchestrationResult: OrchestrationResult,
  caseNotes: EnhancedCaseNotes,
  onProgressUpdate?: ProgressCallback,
): Promise<ProcessingResult> {
  onProgressUpdate?.({
    step: "Transforming orchestration results...",
    progress: 90,
  });

  try {
    // Allow transformation to proceed even if orchestrationResult.success is false
    // to salvage partial data. The success status will be handled by the caller.

    const state = orchestrationResult.finalState;

    // Ensure critical state properties are initialized to prevent undefined errors
    if (!state.procedureCodes) state.procedureCodes = [];
    if (!state.hcpcsCodes) state.hcpcsCodes = [];
    if (!state.diagnosisCodes) state.diagnosisCodes = [];
    if (!state.allEvidence) state.allEvidence = [];
    if (!state.demographics)
      state.demographics = {
        age: 0,
        gender: "O",
        zipCode: "",
        insuranceType: "",
        membershipStatus: "active",
      };
    if (!state.caseMeta)
      state.caseMeta = {
        caseId: "unknown",
        patientId: "unknown",
        providerId: "unknown",
        dateOfService: new Date(),
        claimType: "primary",
        status: "processing",
      };

    console.log(`[ORCHESTRATOR] State validation complete:`, {
      procedureCodes: state.procedureCodes.length,
      hcpcsCodes: state.hcpcsCodes.length,
      diagnosisCodes: state.diagnosisCodes.length,
      allEvidence: state.allEvidence.length,
      hasRvuSequencingResult: !!state.rvuSequencingResult,
      hasFinalSequence: !!state.rvuSequencingResult?.finalSequence,
    });

    // Transform demographics
    const demographics: PatientDemographics = {
      patientName: state.demographics?.patientName || "",
      patientDOB: state.demographics?.patientDOB || "",
      patientMRN: state.demographics?.patientMRN || "",
      dateOfBirth: state.demographics?.dateOfBirth || "",
      mrn: state.demographics?.mrn || "",
      gender: state.demographics?.gender || "O",
      provider: state.demographics?.provider || "",
      providerSpecialty: state.demographics?.providerSpecialty || "",
      npi: state.demographics?.npi || "",
      facility: state.demographics?.facility || "",
      attendingPhysician: state.demographics?.attendingPhysician || "",
      facilityName: state.demographics?.facilityName || "",
      timeOfSurgery: state.demographics?.timeOfSurgery || "",
      assistantSurgeonRole: state.demographics?.assistantSurgeonRole || "",
      anesthesiaType: state.demographics?.anesthesiaType || "",
      age: state.demographics?.age,
      zipCode: state.demographics?.zipCode,
      insuranceType: state.demographics?.insuranceType,
      membershipStatus: state.demographics?.membershipStatus,
    };

    // Transform encounter info
    const encounter: EncounterInfo = {
      serviceDate: (() => {
        console.log(
          "DEBUG: state.caseMeta?.dateOfService type:",
          typeof state.caseMeta?.dateOfService,
        );
        console.log(
          "DEBUG: state.caseMeta?.dateOfService value:",
          state.caseMeta?.dateOfService,
        );
        if (state.caseMeta?.dateOfService instanceof Date) {
          return state.caseMeta.dateOfService.toISOString();
        }
        if (typeof state.caseMeta?.dateOfService === "string") {
          try {
            const date = new Date(state.caseMeta.dateOfService);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          } catch (e) {
            console.error("DEBUG: Error parsing date string:", e);
          }
        }
        return new Date().toISOString();
      })(),
      encounterDate: (() => {
        console.log(
          "DEBUG: state.caseMeta?.dateOfService type (encounterDate):",
          typeof state.caseMeta?.dateOfService,
        );
        console.log(
          "DEBUG: state.caseMeta?.dateOfService value (encounterDate):",
          state.caseMeta?.dateOfService,
        );
        if (state.caseMeta?.dateOfService instanceof Date) {
          return state.caseMeta.dateOfService.toISOString();
        }
        if (typeof state.caseMeta?.dateOfService === "string") {
          try {
            const date = new Date(state.caseMeta.dateOfService);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          } catch (e) {
            console.error(
              "DEBUG: Error parsing date string (encounterDate):",
              e,
            );
          }
        }
        return new Date().toISOString();
      })(),
      admissionDate: null,
      dischargeDate: null,
      visitType: "Inpatient",
      timeOfSurgery: "",
      anesthesiaType: "",
    };

    // Transform procedure codes - collect all procedure codes from state
    // Create a map of adjusted RVU values from the RVU sequencing result
    // This ensures that the final calculated RVU values from the ComprehensiveRVUAgent
    // are used instead of the initial 0 values from the code extraction agent
    const adjustedRVUMap = new Map<
      string,
      { work: number; pe: number; mp: number; total: number }
    >();
    if (
      state.rvuSequencingResult?.calculations &&
      Array.isArray(state.rvuSequencingResult.calculations)
    ) {
      state.rvuSequencingResult.calculations.forEach((calc: any) => {
        if (calc && calc.code) {
          adjustedRVUMap.set(calc.code, {
            work: calc.adjustedRVUs?.work || 0,
            pe: calc.adjustedRVUs?.pe || 0,
            mp: calc.adjustedRVUs?.mp || 0,
            total: calc.totalAdjustedRVU || 0,
          });
        }
      });
    }

    // Use procedure codes directly from state as EnhancedProcedureCode
    const procedureCodes: EnhancedProcedureCode[] = (state.procedureCodes || [])
      .filter((p) => p && p.code)
      .map((p: EnhancedProcedureCode) => {
        // Get the RVU data from our map if available
        const rvuData = adjustedRVUMap.get(p.code);

        return {
          code: p.code,
          description: p.description,
          units: p.units || 1,
          mueLimit: p.mueLimit,
          evidence: p.evidence || [],
          officialDesc: p.officialDesc,
          shortDesc: p.shortDesc,
          isPrimary: p.isPrimary || false,
          statusCode: p.statusCode,
          globalDays: p.globalDays,
          modifierIndicators: p.modifierIndicators,
          teamAssistCoSurgeonAllowed: p.teamAssistCoSurgeonAllowed,
          apcAscPackaging: p.apcAscPackaging,
          tos: p.tos,
          betos: p.betos,
          hierarchyPath: p.hierarchyPath,
          codeHistory: p.codeHistory,
          modifiersApplicable: p.modifiersApplicable,
          modifiersLinked: p.modifiersLinked,
          addOnApplicable: p.addOnApplicable,
          icd10Applicable: p.icd10Applicable,
          icd10Linked: p.icd10Linked,
          addOnLinked: p.addOnLinked,
          rvu: rvuData
            ? {
                work: rvuData.work,
                pe: rvuData.pe,
                mp: rvuData.mp,
              }
            : p.rvu || {
                work: 0,
                pe: 0,
                mp: 0,
              },
          claimType: p.claimType,
          mai: p.mai,
        };
      });

    // Calculate total RVU for the RVU sequencing section
    let totalRVU = 0;
    if (state.rvuSequencingResult?.calculations) {
      totalRVU = state.rvuSequencingResult.calculations.reduce(
        (sum: number, calc: any) => sum + (calc.totalAdjustedRVU || 0),
        0,
      );
    }

    // Debug logging for RVU calculation
    console.log(`[ORCHESTRATOR] RVU calculation debug:`, {
      hasRvuSequencingResult: !!state.rvuSequencingResult,
      hasCalculations: !!state.rvuSequencingResult?.calculations,
      calculationsLength: state.rvuSequencingResult?.calculations?.length || 0,
      summaryTotalRVU: state.rvuSequencingResult?.summary?.totalAdjustedRVU,
      calculatedTotalRVU: totalRVU,
      calculationDetails: state.rvuSequencingResult?.calculations?.map(
        (calc: any) => ({
          code: calc.code,
          totalAdjustedRVU: calc.totalAdjustedRVU,
          adjustedRVUs: calc.adjustedRVUs,
        }),
      ),
    });

    // Transform HCPCS codes - collect from state.hcpcsCodes
    console.log(`[ORCHESTRATOR] Processing HCPCS codes from state:`, {
      hcpcsCodesInState: state.hcpcsCodes?.length || 0,
      hcpcsCodesData:
        state.hcpcsCodes?.map((h) => ({
          code: h.code,
          description: h.description,
        })) || [],
    });

    const hcpcsCodes: HCPCSCode[] = (state.hcpcsCodes || [])
      .filter((h) => h && h.code)
      .map((h: any) => ({
        code: h.code,
        description: h.description,
        evidence: h.evidence || {
          description: h.description,
          excerpt: h.evidenceText || "",
        },
        date:
          h.date ||
          (state.caseMeta?.dateOfService
            ? new Date(state.caseMeta.dateOfService).toISOString()
            : new Date().toISOString()),
        quantity: h.quantity || h.units || 1,
        units: h.units || "each",
        laterality: h.laterality || "",
        category: h.category || "Other",
        isTemporary: h.isTemporary || false,
        exemptFromModifiers: h.exemptFromModifiers || [],
        codeType: "HCPCS" as const,
        sourceNoteType: h.sourceNoteType || "operative_notes",
      }));

    console.log(`[ORCHESTRATOR] Final procedure and HCPCS codes:`, {
      procedureCodes: procedureCodes.length,
      hcpcsCodes: hcpcsCodes.length,
      procedureCodesData: procedureCodes.map((p) => ({
        code: p.code,
        description: p.description,
      })),
      hcpcsCodesData: hcpcsCodes.map((h) => ({
        code: h.code,
        description: h.description,
      })),
    });

    // Ensure allEvidence is properly initialized to prevent map errors
    const allEvidence = state.allEvidence || [];

    console.log(`[ORCHESTRATOR] Full state summary:`, {
      totalEvidence: allEvidence.length,
      evidenceTypes: [
        ...new Set(
          allEvidence.map((e) =>
            "type" in e ? e.type : "StandardizedEvidence",
          ),
        ),
      ],
      procedureCodesInState: state.procedureCodes?.length || 0,
      hcpcsCodesInState: state.hcpcsCodes?.length || 0,
      diagnosisCodesInState: state.diagnosisCodes?.length || 0,
    });

    // Transform diagnosis codes - use state.diagnosisCodes directly as EnhancedDiagnosisCode
    const diagnosisCodes: EnhancedDiagnosisCode[] = (state.diagnosisCodes || [])
      .filter((d) => d && d.code)
      .map((d: EnhancedDiagnosisCode) => ({
        code: d.code,
        description: d.description,
        evidence: d.evidence || [],
        linkedCptCode: d.linkedCptCode,
      }));

    // Transform modifiers
    const modifierAgentResult = orchestrationResult.agentExecutionResults.find(
      (r) => r.agentName === "modifier_assignment_agent",
    );

    const finalModifiers =
      (modifierAgentResult?.data as any)?.finalModifiers ||
      orchestrationResult.finalState.finalModifiers ||
      [];

    const modifierSuggestions: StandardizedModifier[] =
      finalModifiers.map((mod: StandardizedModifier) => ({
        modifier: mod.modifier,
        description: mod.description,
        rationale: mod.rationale,
        evidence: mod.evidence || [],
        classification: mod.classification,
        requiredDocumentation: mod.requiredDocumentation,
        linkedCptCode: mod.linkedCptCode,
        feeAdjustment: mod.feeAdjustment,
        editType: mod.editType,
        appliesTo: mod.appliesTo,
      })) || [];

    // Create modifiers by code
    const modifiersByCode: AppliedModifiers = {};
    modifierSuggestions.forEach((mod) => {
      const procedureCode = mod.linkedCptCode || mod.appliesTo || "unknown";
      if (!modifiersByCode[procedureCode]) {
        modifiersByCode[procedureCode] = [];
      }
      modifiersByCode[procedureCode].push({
        modifier: mod.modifier || "",
        source: "AI",
        rationale: mod.rationale,
        timestamp: new Date().toISOString(),
        requiredDocumentation: mod.requiredDocumentation,
        classification:
          mod.classification === ModifierClassifications.PRICING
            ? "Pricing"
            : mod.classification === ModifierClassifications.PAYMENT
              ? "Payment"
              : mod.classification === ModifierClassifications.LOCATION
                ? "Location"
                : mod.classification === ModifierClassifications.INFORMATIONAL
                  ? "Informational"
                  : "Informational",
        feeAdjustment: mod.feeAdjustment,
        evidence: mod.evidence, // Include evidence in modifiersByCode
      });
    });

    // Transform CCI results to compliance issues
    const complianceIssues: ComplianceIssue[] = [];

    console.log(
      `[ORCHESTRATOR] Processing CCI results for compliance issues:`,
      {
        hasCciResult: !!state.cciResult,
        ptpFlagsCount: state.cciResult?.ptpFlags?.length || 0,
        mueFlagsCount: state.cciResult?.mueFlags?.length || 0,
        globalFlagsCount: state.cciResult?.globalFlags?.length || 0,
        rvuFlagsCount: state.cciResult?.rvuFlags?.length || 0,
        cciResultKeys: state.cciResult ? Object.keys(state.cciResult) : [],
      },
    );

    // Add PTP violations from CCI results
    if (state.cciResult?.ptpFlags) {
      state.cciResult.ptpFlags.forEach((flag) => {
        complianceIssues.push({
          type: "CCI Edit" as const,
          description: flag.issue,
          severity: flag.severity === "ERROR" ? ("ERROR" as const) : ("WARNING" as const),
          affectedCodes: [flag.primaryCode, flag.secondaryCode],
          recommendation:
            flag.allowedModifiers.length > 0
              ? `Consider using modifier(s): ${flag.allowedModifiers.join(", ")}`
              : "Review code combination for bundling rules",
        });
      });
    }

    // Add MUE violations from CCI results
    if (state.cciResult?.mueFlags) {
      state.cciResult.mueFlags.forEach((flag) => {
        complianceIssues.push({
          type: "MUE" as const,
          description: flag.issue,
          severity: flag.severity === "ERROR" ? ("ERROR" as const) : ("WARNING" as const),
          affectedCodes: [flag.code],
          recommendation: `Units claimed (${flag.claimedUnits}) exceed MUE limit (${flag.maxUnits}). Review medical necessity.`,
        });
      });
    }

    // Add Global Period violations from CCI results
    if (state.cciResult?.globalFlags) {
      console.log(`[ORCHESTRATOR] Processing ${state.cciResult.globalFlags.length} global flags:`, 
        state.cciResult.globalFlags.map(flag => ({
          code: flag.code,
          severity: flag.severity,
          issue: flag.issue,
          globalPeriod: flag.globalPeriod
        }))
      );
      
      state.cciResult.globalFlags.forEach((flag) => {
        const complianceIssue: ComplianceIssue = {
          type: "Global Period" as const,
          description: flag.issue,
          severity:
            flag.severity === "ERROR"
              ? ("ERROR" as const)
              : flag.severity === "WARNING"
                ? ("WARNING" as const)
                : ("INFO" as const),
          affectedCodes: [flag.code],
          recommendation: flag.recommendedModifier
            ? `Consider using modifier ${flag.recommendedModifier}`
            : "Review global period rules for this procedure",
        };
        
        console.log(`[ORCHESTRATOR] Adding global period compliance issue:`, complianceIssue);
        complianceIssues.push(complianceIssue);
      });
    } else {
      console.log(`[ORCHESTRATOR] No global flags found in CCI result`);
    }

    // Add RVU violations from CCI results
    if (state.cciResult?.rvuFlags) {
      console.log(`[ORCHESTRATOR] Processing ${state.cciResult.rvuFlags.length} RVU flags:`, 
        state.cciResult.rvuFlags.map(flag => ({
          code: flag.code,
          severity: flag.severity,
          issue: flag.issue
        }))
      );
      
      state.cciResult.rvuFlags.forEach((flag) => {
        const complianceIssue: ComplianceIssue = {
          type: "RVU" as const,
          description: flag.issue,
          severity: "WARNING" as const, // RVU flags are always warnings
          affectedCodes: [flag.code],
          recommendation: "Review similar procedures to assign appropriate RVU value",
        };
        
        console.log(`[ORCHESTRATOR] Adding RVU compliance issue:`, complianceIssue);
        complianceIssues.push(complianceIssue);
      });
    } else {
      console.log(`[ORCHESTRATOR] No RVU flags found in CCI result`);
    }

    console.log(`[ORCHESTRATOR] Final compliance issues created:`, {
      totalIssues: complianceIssues.length,
      issueTypes: complianceIssues.map(issue => issue.type),
      globalPeriodIssues: complianceIssues.filter(issue => issue.type === "Global Period").length,
      rvuIssues: complianceIssues.filter(issue => issue.type === "RVU").length
    });

    const rvuSequencing: RVUSequencing =
      state.rvuSequencingResult && state.rvuSequencingResult.calculations
        ? {
            sequencedCodes: state.rvuSequencingResult.calculations.map(
              (c: any) => {
                const originalCode = state.procedureCodes.find(
                  (pc) => pc.code === c.code,
                );
                const procedureCode = {
                  code: c.code,
                  description: c.description || originalCode?.description || "",
                  evidence:
                    originalCode?.evidence && originalCode.evidence.length > 0
                      ? originalCode.evidence[0]
                      : {
                          verbatimEvidence: [
                            c.description || originalCode?.description || "",
                          ],
                          rationale: "RVU sequencing evidence",
                          sourceAgent: Agents.RVU,
                          sourceNote: Notes.OPERATIVE,
                          confidence: 0.8,
                          content: {
                            rvu: c.totalAdjustedRVU,
                            description:
                              c.description || originalCode?.description || "",
                          },
                        },
                  isPrimary: false,
                  date: state.caseMeta?.dateOfService
                    ? new Date(state.caseMeta.dateOfService).toISOString()
                    : new Date().toISOString(),
                  rvu: c.totalAdjustedRVU,
                  laterality: "",
                  sourceNoteType: "operative_notes",
                  globalPeriod: originalCode?.globalDays,
                };
                return procedureCode;
              },
            ),
            sequencingRationale: [
              state.rvuSequencingResult.sequencingRationale || "",
            ],
            totalRVU:
              state.rvuSequencingResult.summary?.totalAdjustedRVU ||
              totalRVU ||
              0,
          }
        : {
            sequencedCodes: [],
            sequencingRationale: [],
            totalRVU: 0,
          };

    const clinicalContextSummary: ClinicalContextSummary = {
      diagnosis: "",
      procedure: "",
      product_used: "",
      anatomical_site: "",
      indication: "",
      key_findings: "",
    };

    return {
      success: true,
      data: {
        demographics,
        encounter,
        diagnosisCodes: diagnosisCodes,
        procedureCodes: procedureCodes,
        hcpcsCodes, // Now properly populated from state
        modifierSuggestions,
        finalModifiers: finalModifiers.map((mod: StandardizedModifier) => ({
          modifier: mod.modifier,
          description: mod.description,
          rationale: mod.rationale,
          evidence: mod.evidence || [],
          linkedCptCode: mod.linkedCptCode,
          classification: mod.classification,
          requiredDocumentation: mod.requiredDocumentation,
          feeAdjustment: mod.feeAdjustment,
          editType: mod.editType,
          appliesTo: mod.appliesTo,
        })), // Convert finalModifiers to StandardizedModifier format
        modifiersByCode,
        complianceIssues,
        rvuSequencing,
        clinicalContextSummary,
      },
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown transformation error";
    console.error(`[ORCHESTRATOR] Error during result transformation:`, error);

    // Return a minimal structure to prevent null ai_raw_output
    return {
      success: false,
      error: errorMessage,
      data: {
        demographics: {
          patientName: "",
          patientDOB: "",
          patientMRN: "",
          dateOfBirth: "",
          mrn: "",
          gender: "O",
          provider: "",
          providerSpecialty: "",
          npi: "",
          facility: "",
          attendingPhysician: "",
          facilityName: "",
          timeOfSurgery: "",
          assistantSurgeonRole: "",
          anesthesiaType: "",
        },
        encounter: {
          serviceDate: new Date().toISOString(),
          encounterDate: new Date().toISOString(),
          admissionDate: null,
          dischargeDate: null,
          visitType: "Inpatient",
          timeOfSurgery: "",
          anesthesiaType: "",
        },
        diagnosisCodes: [],
        procedureCodes: [],
        hcpcsCodes: [],
        modifierSuggestions: [],
        finalModifiers: [],
        modifiersByCode: {},
        complianceIssues: [],
        rvuSequencing: {
          sequencedCodes: [],
          sequencingRationale: [],
          totalRVU: 0,
        },
        clinicalContextSummary: {
          diagnosis: "",
          procedure: "",
          product_used: "",
          anatomical_site: "",
          indication: "",
          key_findings: "",
        },
        transformationError: errorMessage,
        partialData: true,
      },
    };
  }
}

/**
 * Finalizes the processing result
 */
async function finalizeProcessingResult(
  data: AiRawOutput,
  startTime: number,
  logger: WorkflowLogger,
): Promise<ProcessingResult> {
  logger.logInfo("finalizeProcessingResult", "Finalizing processing result.");
  const executionTime = Date.now() - startTime;

  const result: ProcessingResult = {
    success: true,
    data,
    metadata: {
      executionTime,
      agentsExecuted: data.modifierSuggestions?.length || 0,
      stepsCompleted: [
        "validation",
        "transformation",
        "orchestration",
        "finalization",
      ],
      errorsEncountered: data.complianceIssues?.length || 0,
    },
  };
  logger.logInfo(
    "finalizeProcessingResult",
    "Processing result finalized successfully.",
  );
  return result;
}

// ============================================================================
// EXPORT ADDITIONAL UTILITIES
// ============================================================================

/**
 * Validates that the orchestrator processing is available
 */
export function isOrchestratorProcessingAvailable(): boolean {
  return typeof WorkflowOrchestrator !== "undefined";
}

/**
 * Gets the version of the orchestrator processing module
 */
export function getOrchestratorProcessingVersion(): string {
  return "1.0.0";
}

/**
 * Creates a test processing result for development
 */
export function createTestProcessingResult(): ProcessingResult {
  return {
    success: true,
    data: {
      demographics: {
        patientName: "Test Patient",
        patientDOB: "1980-01-01",
        patientMRN: "12345",
        dateOfBirth: "1980-01-01",
        mrn: "12345",
        gender: "M",
        provider: "Test Provider",
        providerSpecialty: "Surgery",
        npi: "1234567890",
        facility: "Test Hospital",
        attendingPhysician: "Dr. Test",
        facilityName: "Test Hospital",
        timeOfSurgery: "10:00 AM",
        assistantSurgeonRole: "",
        anesthesiaType: "General",
      },
      encounter: {
        serviceDate: new Date().toISOString(),
        encounterDate: new Date().toISOString(),
        admissionDate: null,
        dischargeDate: null,
        visitType: "Inpatient",
        timeOfSurgery: "10:00 AM",
        anesthesiaType: "General",
      },
      diagnosisCodes: [],
      procedureCodes: [],
      hcpcsCodes: [],
      modifierSuggestions: [],
      modifiersByCode: {},
      complianceIssues: [],
      rvuSequencing: {
        sequencedCodes: [],
        sequencingRationale: [],
        totalRVU: 0,
      },
      clinicalContextSummary: {
        diagnosis: "",
        procedure: "",
        product_used: "",
        anatomical_site: "",
        indication: "",
        key_findings: "",
      },
    },
    metadata: {
      executionTime: 1000,
      agentsExecuted: 6,
      stepsCompleted: [
        "INITIALIZATION",
        "CODE_EXTRACTION",
        "CCI_VALIDATION",
        "MUE_VALIDATION",
        "LCD_COVERAGE",
        "MODIFIER_ASSIGNMENT",
      ],
      errorsEncountered: 0,
    },
  };
}
