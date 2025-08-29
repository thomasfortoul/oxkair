"use server";
import { updateMedicalNote, getMedicalNoteById } from "../../lib/db/pg-service.ts";
import { getUserContext, createRequestContextFromServer } from "../../lib/auth/server-auth.ts";
import { processCaseWithOrchestrator } from "../coder/lib/orchestratorProcessing.ts";
import type {
  CaseNotes,
  AppliedModifiers,
} from "../coder/lib/ai-workflow-types.ts";
import type {
  ProcessingResult,
  ProcessingOptions,
  ProgressCallback,
} from "../coder/lib/orchestratorProcessing.ts";
import type { CaseMeta } from "../../lib/agents/newtypes";
import { WorkflowLogger } from "../coder/lib/logging";

// ============================================================================
// FEATURE FLAGS AND CONFIGURATION
// ============================================================================

/**
 * Feature flag to enable orchestrator processing
 * Can be controlled via environment variable or hardcoded for gradual rollout
 */
// The orchestrator should always be used.
const USE_ORCHESTRATOR = true;

/**
 * Fallback timeout for orchestrator processing (100 seconds)
 */
const ORCHESTRATOR_TIMEOUT = 100000;

/**
 * Legacy timeout for backward compatibility (90 seconds)
 */
const LEGACY_TIMEOUT = 100000;

// ============================================================================
// INTERFACES AND TYPES
// ============================================================================

/**
 * Enhanced panel data interface for collecting comprehensive case information
 */
export interface EnhancedPanelData {
  caseId?: string;
  patientId?: string;
  providerId?: string;
  dateOfService?: string;
  claimType?: "primary" | "secondary" | "tertiary";

  // Enhanced note collection
  notes?: {
    operative?: string;
    admission?: string;
    discharge?: string;
    pathology?: string;
    progress?: string;
    bedside?: string;
  };

  // Processing preferences
  processingOptions?: {
    priorityLevel?: "low" | "normal" | "high";
    useOrchestrator?: boolean;
    enableDetailedLogging?: boolean;
  };
}

/**
 * Processing metrics for performance monitoring
 */
interface ProcessingMetrics {
  processingMethod: "orchestrator" | "legacy";
  executionTime: number;
  success: boolean;
  errorType?: string;
  agentsExecuted?: number;
  memoryUsage?: number;
  caseComplexity?: "low" | "medium" | "high";
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Transform UI data to CaseNotes format
 */
function transformUIDataToCaseNotes(
  operativeNote: string,
  additionalNotes: Record<string, string> | undefined,
  workflowLogger: WorkflowLogger,
): CaseNotes {
  workflowLogger.logInfo(
    "transformUIDataToCaseNotes",
    "Transforming UI data to CaseNotes format.",
  );
  return {
    primaryNoteText: operativeNote,
    additionalNotes: additionalNotes
      ? Object.entries(additionalNotes).map(([type, text]) => ({
          type,
          text,
        }))
      : [],
  };
}

/**
 * Transform UI data to CaseMeta format
 */
function transformUIDataToCaseMeta(
  caseId: string,
  panelData: EnhancedPanelData | undefined,
  workflowLogger: WorkflowLogger,
): Partial<CaseMeta> {
  workflowLogger.logInfo(
    "transformUIDataToCaseMeta",
    "Transforming UI data to CaseMeta format.",
  );
  return {
    caseId,
    patientId:
      panelData?.patientId ||
      extractPatientId(panelData?.notes?.operative || "", workflowLogger),
    providerId:
      panelData?.providerId ||
      extractProviderId(panelData?.notes?.operative || "", workflowLogger),
    dateOfService: panelData?.dateOfService
      ? new Date(panelData.dateOfService)
      : new Date(),
    claimType: panelData?.claimType || "primary",
    status: "processing",
  };
}

/**
 * Extract patient ID from operative note text
 */
function extractPatientId(
  operativeNote: string,
  workflowLogger: WorkflowLogger,
): string {
  workflowLogger.logInfo(
    "extractPatientId",
    "Extracting patient ID from note.",
  );
  const patientIdMatch = operativeNote.match(/patient\s*(?:id|#):\s*(\w+)/i);
  const patientId = patientIdMatch
    ? patientIdMatch[1]
    : `patient_${Date.now()}`;
  workflowLogger.logDebug(
    "extractPatientId",
    `Extracted patient ID: ${patientId}`,
  );
  return patientId;
}

/**
 * Extract provider ID from operative note text
 */
function extractProviderId(
  operativeNote: string,
  workflowLogger: WorkflowLogger,
): string {
  workflowLogger.logInfo(
    "extractProviderId",
    "Extracting provider ID from note.",
  );
  const providerIdMatch = operativeNote.match(/provider\s*(?:id|#):\s*(\w+)/i);
  const providerId = providerIdMatch
    ? providerIdMatch[1]
    : `provider_${Date.now()}`;
  workflowLogger.logDebug(
    "extractProviderId",
    `Extracted provider ID: ${providerId}`,
  );
  return providerId;
}

/**
 * Assess case complexity based on note content
 */
function assessCaseComplexity(caseNotes: CaseNotes): "low" | "medium" | "high" {
  const noteLength = caseNotes.primaryNoteText.length;
  const additionalNotesCount = caseNotes.additionalNotes.length;

  if (noteLength > 2000 || additionalNotesCount > 3) {
    return "high";
  } else if (noteLength > 1000 || additionalNotesCount > 1) {
    return "medium";
  } else {
    return "low";
  }
}

/**
 * Classify error type for metrics
 */
function classifyError(error: string): string {
  if (error.toLowerCase().includes("timeout")) return "timeout";
  if (error.toLowerCase().includes("validation")) return "validation";
  if (error.toLowerCase().includes("network")) return "network";
  if (error.toLowerCase().includes("ai")) return "ai_model";
  return "unknown";
}

/**
 * Collect processing metrics
 */
async function collectMetrics(
  method: "orchestrator" | "legacy",
  startTime: number,
  result: any,
  caseNotes: CaseNotes,
): Promise<ProcessingMetrics> {
  return {
    processingMethod: method,
    executionTime: Date.now() - startTime,
    success: result.success,
    errorType: result.error ? classifyError(result.error) : undefined,
    agentsExecuted: result.metadata?.agentsExecuted,
    memoryUsage: process.memoryUsage().heapUsed,
    caseComplexity: assessCaseComplexity(caseNotes),
  };
}

/**
 * Log processing metrics
 */
function logProcessingMetrics(metrics: ProcessingMetrics): void {
  console.log(`[METRICS] Processing completed:`, {
    method: metrics.processingMethod,
    executionTime: `${metrics.executionTime}ms`,
    success: metrics.success,
    complexity: metrics.caseComplexity,
    memoryUsage: `${Math.round((metrics.memoryUsage || 0) / 1024 / 1024)}MB`,
    ...(metrics.agentsExecuted && { agentsExecuted: metrics.agentsExecuted }),
    ...(metrics.errorType && { errorType: metrics.errorType }),
  });
}

// ============================================================================
// MAIN PROCESSING FUNCTIONS
// ============================================================================

/**
 * Enhanced processOperativeNoteAction with orchestrator integration
 */
export async function processOperativeNoteAction(
  operativeNote: string,
  caseId: string,
  userRole: string,
  updateStatus: boolean = true, // New parameter to control status updates
  additionalNotes?: Record<string, string>,
  panelData?: EnhancedPanelData,
  processingOptions?: ProcessingOptions,
): Promise<{ success: boolean; error?: string; data?: any; metadata?: any }> {
  const workflowLogger = new WorkflowLogger(caseId);
  // Initialize default values for optional parameters
  const effectiveAdditionalNotes = additionalNotes || {};
  const effectivePanelData = panelData || {};
  const effectiveProcessingOptions = processingOptions || {};
  
  workflowLogger.logWorkflow("processOperativeNoteAction", "Start", {
    caseId,
    userRole,
    updateStatus,
    timestamp: new Date().toISOString(),
  });
  const startTime = Date.now();
  const processingMethod: "orchestrator" = "orchestrator";

  // This action now processes the case synchronously and returns when complete.
  // No more real-time progress updates - simplified request-response model.
  if (!caseId) {
    workflowLogger.logError(
      "processOperativeNoteAction",
      "Action called without a caseId.",
      {},
    );
    return {
      success: false,
      error: "A caseId is required for processing.",
      metadata: {
        processingMethod,
        executionTime: Date.now() - startTime,
        useOrchestrator: true,
      },
    };
  }

  const startBackgroundProcessing = async () => {
    // Get authenticated user from Easy Auth headers
    let authContext;
    try {
      const userContext = await getUserContext();
      authContext = {
        userId: userContext.userId,
        roles: userContext.roles,
        email: 'developer@example.com'
      };
    } catch (authError) {
      workflowLogger.logError(
        "startBackgroundProcessing",
        "User not authenticated, aborting.",
        { caseId, error: authError instanceof Error ? authError.message : String(authError) },
      );
      return;
    }

    console.log(`[DEBUG] User authenticated for case ${caseId}: ${authContext.userId}`);
    workflowLogger.logInfo(
      "startBackgroundProcessing",
      "User authenticated successfully",
      { caseId, userId: authContext.userId, roles: authContext.roles }
    );

    // Create request context for pg-service
    const requestContext = createRequestContextFromServer(authContext);

    // Test if we can read the record first (for authorization debugging)
    try {
      const testRead = await getMedicalNoteById(caseId, requestContext);
      if (testRead) {
        workflowLogger.logInfo(
          "startBackgroundProcessing",
          "Successfully read medical note for authorization test",
          { caseId, noteUserId: testRead.user_id, currentUserId: authContext.userId }
        );
        console.log(`[DEBUG] Successfully read medical note ${caseId}. Note user_id: ${testRead.user_id}, Current user_id: ${authContext.userId}`);
      } else {
        workflowLogger.logError(
          "startBackgroundProcessing",
          "Cannot read medical note - not found or access denied",
          { caseId }
        );
        console.error(`[DEBUG] Cannot read medical note ${caseId} - not found or access denied`);
        return;
      }
    } catch (readError) {
      workflowLogger.logError(
        "startBackgroundProcessing",
        `Cannot read medical note for authorization test: ${readError instanceof Error ? readError.message : String(readError)}`,
        { caseId, error: readError }
      );
      console.error(`[DEBUG] Cannot read medical note ${caseId} for authorization test:`, readError);
      return;
    }

    workflowLogger.logWorkflow(
      "startBackgroundProcessing",
      "Background processing starting",
      { caseId }
    );
    let caseNotes: CaseNotes = { primaryNoteText: operativeNote, additionalNotes: [] };
    try {
      console.log(`[DEBUG] Starting background processing for case ${caseId} at ${new Date().toISOString()}`);
      console.log(`[DEBUG] Environment check - NODE_ENV: ${process.env.NODE_ENV}, VERCEL: ${process.env.VERCEL}`);
      console.log(`[DEBUG] AI Keys available - OPENAI: ${!!process.env.OPENAI_API_KEY}, AZURE: ${!!process.env.AZURE_OPENAI_API_KEY}`);
      
      // Transform UI data to orchestrator format
      caseNotes = transformUIDataToCaseNotes(
        operativeNote,
        effectiveAdditionalNotes,
        workflowLogger,
      );
      const caseMeta = transformUIDataToCaseMeta(
        caseId,
        effectivePanelData,
        workflowLogger,
      );

      // Progress callback simplified - no real-time updates
      const progressCallback: ProgressCallback = (progress) => {
        console.log(`[DEBUG] Progress update for case ${caseId}: ${progress.step} (${progress.progress}%)`);
        // No longer sending progress messages - just logging
        workflowLogger.logInfo(
          "processCaseWithOrchestrator",
          `Processing progress: ${progress.step}`,
          { caseId, agent: progress.agent, progress: progress.progress },
        );
      };

      // Set up timeout protection with early completion signal
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => {
            console.log(`[DEBUG] Orchestrator timeout reached for case ${caseId} after ${ORCHESTRATOR_TIMEOUT}ms`);
            // No longer sending progress messages
            reject(
              new Error(`Orchestrator processing timeout after ${ORCHESTRATOR_TIMEOUT/1000} seconds`),
            );
          },
          ORCHESTRATOR_TIMEOUT,
        );
      });

      // Execute orchestrator processing
      workflowLogger.logInfo(
        "startBackgroundProcessing",
        "Calling processCaseWithOrchestrator",
        { caseId }
      );
      console.log(`[DEBUG] About to call processCaseWithOrchestrator for case ${caseId}`);
      const processingResult = (await Promise.race([
        processCaseWithOrchestrator(
          caseNotes,
          caseMeta,
          workflowLogger,
          progressCallback,
          effectiveProcessingOptions,
        ),
        timeoutPromise,
      ])) as ProcessingResult;
      
      workflowLogger.logInfo(
        "startBackgroundProcessing",
        "processCaseWithOrchestrator finished",
        { caseId, success: processingResult.success }
      );
      console.log(`[DEBUG] processCaseWithOrchestrator completed for case ${caseId}, success: ${processingResult.success}`);

      if (!processingResult.success) {
        // Log a warning instead of throwing an error for non-critical failures
        workflowLogger.logWarn(
          "startBackgroundProcessing",
          `Orchestrator processing finished with errors, but proceeding to save partial data. Error: ${processingResult.error}`,
          { caseId, results: processingResult.data }
        );
      }

      // Ensure we have some data to save, even if processing failed
      const results = processingResult.data || {
        demographics: {},
        encounter: {},
        diagnosisCodes: [],
        procedureCodes: [],
        hcpcsCodes: [],
        modifierSuggestions: [],
        modifiersByCode: {},
        assistantCoSurgeonAnalysis: {
          assistantSurgeonDetected: false,
          assistantSurgeonName: null,
          assistantEvidence: null,
          coSurgeonDetected: false,
          coSurgeonName: null,
          coSurgeonEvidence: null,
          attestationNarrative: null,
          codeModifierAssignments: [],
          sourceNoteType: "operative_notes",
        },
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
        processingError: processingResult.error || "Unknown processing error",
        partialData: true,
      };

      console.log(`[DEBUG] Processing results for case ${caseId}:`, JSON.stringify(results, null, 2));
      workflowLogger.logInfo(
        "startBackgroundProcessing",
        "Processing results obtained",
        { 
          caseId, 
          resultsKeys: Object.keys(results || {}),
          hasResults: !!results,
          processingSuccess: processingResult.success,
          processingError: processingResult.error
        }
      );

      const metrics = await collectMetrics(
        processingMethod,
        startTime,
        { success: true },
        caseNotes,
      );
      logProcessingMetrics(metrics);

      // Set status based on user role only if updateStatus is true
      let status: "INCOMPLETE" | "PENDING_CODER_REVIEW" | "PENDING_PROVIDER_REVIEW" | undefined;
      
      if (updateStatus) {
        status = userRole === "coder"
          ? "PENDING_CODER_REVIEW"
          : "PENDING_PROVIDER_REVIEW";
      }
      // If updateStatus is false, status remains undefined and won't be updated

      // Update database using pg-service with proper authorization
      // Ensure ai_raw_output is never null by providing a minimal structure if needed
      const aiRawOutput = results || {
        error: "Processing failed - no results available",
        partialData: true,
        timestamp: new Date().toISOString(),
      };
      
      // Only include status in update if it's explicitly set
      const dataToUpdate: any = {
        ai_raw_output: aiRawOutput as any,
        workflow_status: "complete" as "complete",
      };
      
      // Only add status field if it's defined
      if (status !== undefined) {
        dataToUpdate.status = status;
      }

      console.log(`[DEBUG] Attempting database update for case ${caseId}`, dataToUpdate);
      workflowLogger.logInfo(
        "startBackgroundProcessing",
        "Attempting database update via pg-service",
        { caseId, dataToUpdate }
      );

      try {
        const updateResult = await updateMedicalNote(caseId, dataToUpdate, requestContext);
        
        workflowLogger.logInfo(
          "startBackgroundProcessing",
          "Successfully updated medical note",
          { caseId, data: updateResult }
        );
        console.log(`[DEBUG] Successfully updated medical note ${caseId}`);

        // Final verification: read the record back to confirm the data was saved
        try {
          const verificationRead = await getMedicalNoteById(caseId, requestContext);
          
          if (verificationRead) {
            const hasAiOutput = verificationRead.ai_raw_output !== null;
            console.log(`[DEBUG] Verification for case ${caseId}: ai_raw_output exists: ${hasAiOutput}, status: ${verificationRead.status}, workflow_status: ${verificationRead.workflow_status}`);
            workflowLogger.logInfo(
              "startBackgroundProcessing",
              "Data verification completed",
              { 
                caseId, 
                hasAiOutput, 
                status: verificationRead.status, 
                workflowStatus: verificationRead.workflow_status,
                updatedAt: verificationRead.updated_at
              }
            );
          } else {
            console.error(`[DEBUG] Failed to verify saved data for case ${caseId}: record not found`);
            workflowLogger.logError(
              "startBackgroundProcessing",
              "Failed to verify saved data: record not found",
              { caseId }
            );
          }
        } catch (verificationError) {
          console.error(`[DEBUG] Failed to verify saved data for case ${caseId}:`, verificationError);
          workflowLogger.logError(
            "startBackgroundProcessing",
            "Failed to verify saved data",
            { caseId, error: verificationError }
          );
        }
      } catch (updateError) {
        workflowLogger.logError(
          "startBackgroundProcessing",
          `Failed to update medical note: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
          { caseId, error: updateError }
        );
        console.error(`[DEBUG] Failed to update medical note ${caseId}:`, updateError);
        throw updateError; // Re-throw to be caught by outer try-catch
      }

      workflowLogger.logInfo(
        "processOperativeNoteAction",
        "Background processing and DB update complete.",
        { caseId },
      );

      // No longer publishing completion events
      console.log(`[DEBUG] Background processing completed successfully for case ${caseId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      console.log(`[DEBUG] Error in background processing for case ${caseId}: ${errorMessage}`);
      workflowLogger.logError(
        "processOperativeNoteAction",
        `Error in background processing for case ${caseId}`,
        {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      // This is needed for metrics if it fails before caseNotes is set.
      if (!caseNotes) {
        caseNotes = transformUIDataToCaseNotes(
          operativeNote,
          additionalNotes,
          workflowLogger,
        );
      }
      const errorMetrics = await collectMetrics(
        processingMethod,
        startTime,
        {
          success: false,
          error: errorMessage,
        },
        caseNotes,
      );
      logProcessingMetrics(errorMetrics);

      // No longer publishing error events to client
    } finally {
      // Ensure logger is properly closed after all processing is complete
      // This is the correct place to close the logger as this function created it
      try {
        workflowLogger.logInfo(
          "processOperativeNoteAction",
          "Closing logger after processing completion.",
          { caseId },
        );
        await workflowLogger.close();
        console.log(`[processOperativeNoteAction] Logger closed successfully for case ${caseId}`);
      } catch (closeError) {
        // Log closure error to console since the logger might be in an invalid state
        console.warn(`[processOperativeNoteAction] Failed to close logger for case ${caseId}:`, closeError);
      }
    }
  };

  // Wait for background processing to complete (simplified approach)
  await startBackgroundProcessing();

  return {
    success: true,
    data: { caseId },
    metadata: {
      processingMethod,
      executionTime: Date.now() - startTime,
      useOrchestrator: true,
    },
  };
}

/**
 * Enhanced saveFinalProcessedDataAction with processing method tracking
 */
export async function saveFinalProcessedDataAction(
  caseId: string,
  finalData: Record<string, unknown>,
  processingMethod?: "orchestrator" | "legacy",
) {
  const logger = new WorkflowLogger(caseId);
  logger.logInfo(
    "saveFinalProcessedDataAction",
    "Saving final processed data",
    { processingMethod },
  );

  try {
    // Get authenticated user from Easy Auth headers
    const userContext = await getUserContext();
    const authContext = {
      userId: userContext.userId,
      roles: userContext.roles,
      email: 'developer@example.com'
    };
    const requestContext = createRequestContextFromServer(authContext);

    const data = await updateMedicalNote(
      caseId,
      {
        final_processed_data: finalData,
        status: "PENDING_BILLING",
      },
      requestContext,
    );

    logger.logInfo(
      "saveFinalProcessedDataAction",
      `Case ${caseId} final processed data saved successfully with ${processingMethod} method.`,
      { caseId, processingMethod },
    );
    return { success: true, data };
  } catch (error) {
    logger.logError(
      "saveFinalProcessedDataAction",
      "Error saving final processed data",
      { error },
    );
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    };
  }
}

/**
 * Health check function for orchestrator processing
 */
export async function checkOrchestratorHealthAction() {
  const logger = new WorkflowLogger("health-check");
  try {
    logger.logDebug(
      "checkOrchestratorHealthAction",
      "Checking orchestrator health",
    );

    // Test with minimal case data
    const testCaseNotes: CaseNotes = {
      primaryNoteText: "Test operative note for health check",
      additionalNotes: [],
    };

    const testCaseMeta = {
      caseId: "health-check-test",
      patientId: "test-patient",
      providerId: "test-provider",
      dateOfService: new Date(),
      claimType: "primary" as const,
      status: "processing" as const,
    };

    const startTime = Date.now();
    const result = await processCaseWithOrchestrator(
      testCaseNotes,
      testCaseMeta,
      logger,
      (status) =>
        logger.logInfo(
          "checkOrchestratorHealthAction",
          `Health check: ${status}`,
        ),
      { priorityLevel: "low" },
    );

    if (!result.success) {
      throw new Error(result.error || "Health check processing failed");
    }

    return {
      success: true,
      message: "Orchestrator is healthy",
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    logger.logError(
      "checkOrchestratorHealthAction",
      "Orchestrator health check failed",
      { error },
    );
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "An unknown error occurred",
    };
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * Legacy function signature for backward compatibility
 */
export async function processOperativeNote(
  operativeNote: string,
  caseId?: string,
  userRole?: string,
) {
  const logger = new WorkflowLogger(caseId || "unknown");
  logger.logDebug(
    "processOperativeNote",
    "Legacy processOperativeNote called - redirecting to enhanced version",
  );
  return await processOperativeNoteAction(operativeNote, caseId || "", userRole || "", false, undefined, undefined, undefined); // Default to not updating status for legacy calls
}

/**
 * Get current processing configuration
 */
export async function getProcessingConfig() {
  return {
    useOrchestrator: USE_ORCHESTRATOR,
    orchestratorTimeout: ORCHESTRATOR_TIMEOUT,
    legacyTimeout: LEGACY_TIMEOUT,
    version: "2.0.0",
  };
}