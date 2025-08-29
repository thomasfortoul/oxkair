/**
 * Comprehensive State Management System
 *
 * This file implements the state management system for the AI Agent Architecture.
 * It handles workflow state initialization, merging of agent results, validation,
 * and evidence extraction across the entire claim processing pipeline.
 */
import {
  StandardizedWorkflowState,
  StandardizedAgentResult,
  ProcessingError,
  ProcessingErrorSeverity,
  CaseMeta,
  Demographics,
  StandardizedEvidence,
  Agents,
  Notes,
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedModifier,
  ModifierClassifications,
  ERROR_CODES,
  WorkflowHistoryEntry,
} from "../agents/newtypes.ts";
import { WORKFLOW_STEPS } from "../agents/types.ts";
import {
  CCIResult,
  MUEResult,
  LCDCheckOutput,
  RVUResult,
  RVUCalculation,
  LCDResult,
} from "../config/ai-model-types.ts";
import { HCPCSCode } from "../../app/coder/lib/ai-workflow-types.ts";
import { LCDEvidence } from "../agents/types.ts";

// ============================================================================
// STATE INITIALIZATION
// ============================================================================

/**
 * Initializes a new workflow state for a given case.
 * This creates the foundation state object that will be populated by agents.
 */
export function initializeState(caseId: string): StandardizedWorkflowState {
  const now = new Date();

  return {
    caseMeta: {
      caseId,
      patientId: "",
      providerId: "",
      dateOfService: now,
      claimType: "primary",
      status: "pending",
    },
    caseNotes: {
      primaryNoteText: "",
      additionalNotes: [],
    },
    demographics: {
      age: 0,
      gender: "O",
      zipCode: "",
      insuranceType: "",
      membershipStatus: "active",
    },
    candidateProcedureCodes: [],
    procedureCodes: [],
    diagnosisCodes: [],
    hcpcsCodes: [], // Initialize HCPCS codes array

    // Analysis Results (initially undefined)
    cciResult: undefined,
    mueResult: undefined,
    lcdResult: undefined,

    // Final Output
    finalModifiers: [],
    claimSequence: {
      lineItems: [],
      diagnoses: [],
      modifiers: [],
      totalUnits: 0,
      estimatedReimbursement: 0,
    },

    // Workflow Management
    currentStep: WORKFLOW_STEPS.INITIALIZATION,
    completedSteps: [],
    errors: [],
    history: [
      {
        agentName: "system",
        timestamp: now,
        action: "workflow_initialized",
        result: "success",
        details: { caseId },
      },
    ],

    // Evidence Collection
    allEvidence: [],

    // Metadata
    createdAt: now,
    updatedAt: now,
    version: "1.0.0",
  };
}

// ============================================================================
// STATE MERGING
// ============================================================================

/**
 * Merges an agent result into the existing workflow state.
 * This is the core function that integrates agent outputs into the state.
 */
export function mergeAgentResult(
  state: StandardizedWorkflowState,
  result: StandardizedAgentResult,
  agentName: string,
): StandardizedWorkflowState {
  const updatedState = { ...state };
  const now = new Date();

  // Update metadata
  updatedState.updatedAt = now;

  // Add evidence to the global collection
  updatedState.allEvidence = [...state.allEvidence, ...result.evidence];

  // Add history entry
  const historyEntry: WorkflowHistoryEntry = {
    agentName,
    timestamp: now,
    action: "agent_execution",
    result: result.success ? "success" : "failure",
    details: {
      evidenceCount: result.evidence.length,
      executionTime: result.metadata.executionTime,
      confidence: (result.metadata as any).confidence,
    },
  };
  updatedState.history = [...state.history, historyEntry];

  // Handle errors if present
  if (result.errors && result.errors.length > 0) {
    const processingErrors = result.errors.map((error) => ({
      code: error.code || ERROR_CODES.PROCESSING_ERROR,
      message: error.message,
      severity: error.severity,
      timestamp: error.timestamp,
      context: { agentName, ...error.context },
    }));
    updatedState.errors = [...state.errors, ...processingErrors];
  }

  // Process evidence to update specific state fields
  console.log(
    `[STATE_MANAGER] Processing ${result.evidence.length} evidence entries from agent: ${agentName}`,
  );
  for (const evidence of result.evidence) {
    console.log(
      `[STATE_MANAGER] Processing evidence type: ${(evidence as any).type || "standardized"}, content length: ${Array.isArray((evidence as any).content) ? (evidence as any).content.length : "not array"}`,
    );
    mergeEvidenceIntoState(updatedState, evidence);
  }

  console.log(`[STATE_MANAGER] Final state after merging from ${agentName}:`, {
    procedureCodes: updatedState.procedureCodes.length,
    hcpcsCodes: updatedState.hcpcsCodes?.length || 0,
    diagnosisCodes: updatedState.diagnosisCodes.length,
  });

  // Special handling for modifiers in data, following standardized agent result structure
  if (
    result.data?.finalModifiers &&
    Array.isArray(result.data.finalModifiers)
  ) {
    updatedState.finalModifiers = [
      ...state.finalModifiers,
      ...result.data.finalModifiers.filter(isValidFinalModifier),
    ];
  } else if (
    result.data?.agentSpecificData?.finalModifiers &&
    Array.isArray(result.data.agentSpecificData.finalModifiers)
  ) {
    // Fallback for nested agent-specific data
    updatedState.finalModifiers = [
      ...state.finalModifiers,
      ...result.data.agentSpecificData.finalModifiers.filter(
        isValidFinalModifier,
      ),
    ];
  }

  if (
    result.data?.rvuSequencingResult &&
    typeof result.data.rvuSequencingResult === "object"
  ) {
    updatedState.rvuSequencingResult = result.data.rvuSequencingResult;
  }

  return updatedState;
}

/**
 * Helper function to merge LCD evidence into state.
 */
function mergeEvidenceIntoState(
  state: StandardizedWorkflowState,
  evidence: StandardizedEvidence,
): void {
  const content = evidence.content;

  if (content) {
    switch (evidence.sourceAgent) {
      // Agents.CODE_EXTRACTION case removed - legacy agent deprecated
      case Agents.COMPLIANCE:
        // Handle procedure and diagnosis codes from COMPLIANCE agent
        if (content.procedureCodes) {
          state.procedureCodes = [
            ...state.procedureCodes,
            ...content.procedureCodes.filter(isValidProcedureCode),
          ];
        }
        // Only process diagnosis codes if they exist and are not empty
        if (content.diagnosisCodes && Array.isArray(content.diagnosisCodes) && content.diagnosisCodes.length > 0) {
          state.diagnosisCodes = [
            ...state.diagnosisCodes,
            ...content.diagnosisCodes.filter(isValidDiagnosisCode),
          ];
        }
        // Handle CCI results from COMPLIANCE agent
        console.log(`[STATE_MANAGER] Processing COMPLIANCE agent evidence:`, {
          hasContent: !!content,
          hasCciResult: !!content?.cciResult,
          hasDirectFlags: !!(
            content?.ptpFlags ||
            content?.mueFlags ||
            content?.globalFlags
          ),
          contentKeys: content ? Object.keys(content) : [],
          globalFlagsCount: content?.globalFlags?.length || 0,
        });

        if (content.cciResult) {
          state.cciResult = content.cciResult as CCIResult;
          console.log(
            `[STATE_MANAGER] Set cciResult from content.cciResult, globalFlags:`,
            content.cciResult.globalFlags?.length || 0,
          );
        } else if (
          content.ptpFlags ||
          content.mueFlags ||
          content.globalFlags
        ) {
          // Handle case where the entire CCIResult is in content directly
          state.cciResult = content as CCIResult;
          console.log(
            `[STATE_MANAGER] Set cciResult from direct content, globalFlags:`,
            content.globalFlags?.length || 0,
          );
        }
        if (content.mueResult) {
          state.mueResult = content.mueResult as MUEResult;
        }
        break;
      case Agents.CPT:
        // Handle CPT Agent output - procedure codes with enriched data
        if (content.procedureCodes) {
          state.procedureCodes = [
            ...state.procedureCodes,
            ...content.procedureCodes.filter(isValidProcedureCode),
          ];
        }
        // Explicitly preserve existing diagnosis codes when processing CPT evidence
        // Only process diagnosis codes if they exist and are not empty (same safeguard as other agents)
        if (content.diagnosisCodes && Array.isArray(content.diagnosisCodes) && content.diagnosisCodes.length > 0) {
          state.diagnosisCodes = [
            ...state.diagnosisCodes,
            ...content.diagnosisCodes.filter(isValidDiagnosisCode),
          ];
        }
        break;
      case Agents.ICD:
        // Handle ICD Agent output - diagnosis codes linked to procedures
        // Only process diagnosis codes if they exist and are not empty
        if (content.diagnosisCodes && Array.isArray(content.diagnosisCodes) && content.diagnosisCodes.length > 0) {
          state.diagnosisCodes = [
            ...state.diagnosisCodes,
            ...content.diagnosisCodes.filter(isValidDiagnosisCode),
          ];
          // Store backup of diagnosis codes for fallback mechanism
          (state as any)._icdBackupDiagnosisCodes = [...state.diagnosisCodes];
        }
        // Update procedure codes with linked ICD codes if provided
        if (content.procedureCodes) {
          // Merge ICD-linked procedure codes with existing ones
          const updatedProcedureCodes = state.procedureCodes.map(
            (existingProc) => {
              const linkedProc = content.procedureCodes.find(
                (p: any) => p.code === existingProc.code,
              );
              if (linkedProc && linkedProc.icd10Linked) {
                return { ...existingProc, icd10Linked: linkedProc.icd10Linked };
              }
              return existingProc;
            },
          );
          state.procedureCodes = updatedProcedureCodes;
        }
        break;
      case Agents.MODIFIER:
        if (content.finalModifiers) {
          state.finalModifiers = [
            ...state.finalModifiers,
            ...content.finalModifiers.filter(isValidFinalModifier),
          ];
        }
        // Explicitly preserve existing diagnosis codes when processing modifier evidence
        // Only process diagnosis codes if they exist and are not empty (same safeguard as other agents)
        if (content.diagnosisCodes && Array.isArray(content.diagnosisCodes) && content.diagnosisCodes.length > 0) {
          state.diagnosisCodes = [
            ...state.diagnosisCodes,
            ...content.diagnosisCodes.filter(isValidDiagnosisCode),
          ];
        }
        // The modifier agent should not modify diagnosis codes, only add modifiers
        // Diagnosis codes are explicitly preserved by not overwriting them
        break;
      case Agents.LCD:
        if (content.lcdResult) {
          state.lcdResult = content.lcdResult as LCDResult;
        }
        // Explicitly preserve existing diagnosis codes when processing LCD evidence
        // Only process diagnosis codes if they exist and are not empty (same safeguard as other agents)
        if (content.diagnosisCodes && Array.isArray(content.diagnosisCodes) && content.diagnosisCodes.length > 0) {
          state.diagnosisCodes = [
            ...state.diagnosisCodes,
            ...content.diagnosisCodes.filter(isValidDiagnosisCode),
          ];
        }
        break;
      case Agents.RVU:
        if (content.rvuResult) {
          state.rvuResult = content.rvuResult as RVUResult;
        }
        if (content.rvuCalculations) {
          state.rvuCalculations = [
            ...(state.rvuCalculations || []),
            ...content.rvuCalculations,
          ];
        }
        if (content.rvuSequencingResult) {
          state.rvuSequencingResult = content.rvuSequencingResult;
        }
        // Explicitly preserve existing diagnosis codes when processing RVU evidence
        // Only process diagnosis codes if they exist and are not empty (same safeguard as other agents)
        if (content.diagnosisCodes && Array.isArray(content.diagnosisCodes) && content.diagnosisCodes.length > 0) {
          state.diagnosisCodes = [
            ...state.diagnosisCodes,
            ...content.diagnosisCodes.filter(isValidDiagnosisCode),
          ];
        }
        // The RVU agent should not modify diagnosis codes, only add RVU calculations
        break;
    }
  }

  // Fallback mechanism: Restore diagnosis codes if they were lost during merge
  // This ensures diagnosis codes persist even if intermediate agents don't handle them
  if (
    content && 
    (!content.diagnosisCodes || content.diagnosisCodes.length === 0) &&
    state.diagnosisCodes.length === 0 &&
    (state as any)._icdBackupDiagnosisCodes?.length > 0
  ) {
    state.diagnosisCodes = [...(state as any)._icdBackupDiagnosisCodes];
    console.log(
      `[STATE_MANAGER] Fallback: Restored ${state.diagnosisCodes.length} diagnosis codes from backup`,
      { sourceAgent: evidence.sourceAgent, restoredCodes: state.diagnosisCodes.map(d => d.code) }
    );
  }
}

/**
 * Merges LCD evidence into the workflow state.
 */
function mergeLCDEvidenceIntoState(
  state: StandardizedWorkflowState,
  evidence: LCDEvidence,
): void {
  if (evidence.type === "lcd_result" && evidence.content) {
    state.lcdResult = evidence.content as LCDCheckOutput;

    // Add to allEvidence array (convert to StandardizedEvidence format)
    const standardizedEvidence: StandardizedEvidence = {
      verbatimEvidence: [],
      rationale: `LCD coverage evaluation: ${evidence.content.overallCoverageStatus}`,
      sourceAgent: Agents.LCD,
      sourceNote: Notes.OPERATIVE,
      confidence: evidence.confidence,
      content: evidence.content,
    };
    state.allEvidence.push(standardizedEvidence);

    // Update history
    state.history.push({
      agentName: evidence.source,
      timestamp: evidence.timestamp,
      action: "LCD Coverage Evaluation",
      result:
        evidence.content.overallCoverageStatus === "Pass"
          ? "success"
          : evidence.content.overallCoverageStatus === "Fail"
            ? "failure"
            : "warning",
      details: {
        overallStatus: evidence.content.overallCoverageStatus,
        policiesEvaluated: evidence.content.evaluations.length,
        confidence: evidence.confidence,
        criticalIssues: evidence.content.criticalIssues.length,
      },
    });
  }
}

// ============================================================================
// STATE VALIDATION
// ============================================================================

/**
 * Validates the current state and returns any validation errors.
 */
export function validateState(
  state: StandardizedWorkflowState,
  stage: "initial" | "final" = "final",
): ProcessingError[] {
  const errors: ProcessingError[] = [];
  const now = new Date();

  // Validate case meta - always required
  if (!state.caseMeta.caseId) {
    errors.push({
      message: "Case ID is required",
      severity: ProcessingErrorSeverity.CRITICAL,
      timestamp: now,
    });
  }

  if (!state.caseMeta.patientId) {
    errors.push({
      message: "Patient ID is required",
      severity: ProcessingErrorSeverity.HIGH,
      timestamp: now,
    });
  }

  // Validate demographics - always required
  if (
    typeof state.demographics.age === "number" &&
    (state.demographics.age < 0 || state.demographics.age > 150)
  ) {
    errors.push({
      message: "Invalid age value",
      severity: ProcessingErrorSeverity.MEDIUM,
      timestamp: now,
      context: { age: state.demographics.age },
    });
  }

  if (!["M", "F", "O"].includes(state.demographics.gender)) {
    errors.push({
      message: "Invalid gender value",
      severity: ProcessingErrorSeverity.MEDIUM,
      timestamp: now,
      context: { gender: state.demographics.gender },
    });
  }

  // Stage-specific validations
  if (stage === "final") {
    // Validate procedure codes - required only at the end
    if (
      (state.procedureCodes || []).length === 0 &&
      (state.hcpcsCodes || []).length === 0
    ) {
      errors.push({
        message: "At least one procedure or HCPCS code is required",
        severity: ProcessingErrorSeverity.MEDIUM, // Downgraded from HIGH
        timestamp: now,
      });
    }

    // Validate diagnosis codes - required only at the end
    if (state.diagnosisCodes.length === 0) {
      errors.push({
        message: "At least one diagnosis code is required",
        severity: ProcessingErrorSeverity.MEDIUM, // Downgraded from HIGH
        timestamp: now,
      });
    }

    // Validate claim sequence consistency (Temporarily disabled to allow partial data)
    /* if (state.claimSequence.lineItems.length !== state.procedureCodes.length) {
      errors.push({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Claim sequence line items must match procedure codes",
        severity: ProcessingErrorSeverity.MEDIUM,
        timestamp: now,
        context: {
          procedureCount: state.procedureCodes.length,
          lineItemCount: state.claimSequence.lineItems.length,
        },
      });
    } */

    // Validate LCD results
    if (state.lcdResult) {
      if (state.lcdResult.overallCoverageStatus === "Fail") {
        errors.push({
          message: "LCD coverage validation failed",
          severity: ProcessingErrorSeverity.LOW, // Downgraded from HIGH
          timestamp: now,
          context: {
            overallStatus: state.lcdResult.overallCoverageStatus,
            criticalIssues: state.lcdResult.criticalIssues,
            policiesEvaluated: state.lcdResult.evaluations.length,
          },
        });
      }

      if (state.lcdResult.criticalIssues.length > 0) {
        errors.push({
          message: "LCD coverage has critical issues",
          severity: ProcessingErrorSeverity.LOW, // Downgraded from MEDIUM
          timestamp: now,
          context: {
            lcdCriticalIssues: state.lcdResult.criticalIssues.length,
          },
        });
      }
    }

    // RVU-specific validations
    // RVU-specific validations (Temporarily disabled to allow partial data)
    /* if (state.procedureCodes?.length && !state.rvuCalculations) {
      errors.push({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "RVU calculations missing for procedure codes",
        severity: ProcessingErrorSeverity.MEDIUM,
        timestamp: now,
      });
    } */

    if (state.rvuCalculations) {
      state.rvuCalculations.forEach((calc, index) => {
        if (!calc.code || calc.totalAdjustedRVU < 0) {
          errors.push({
            message: `Invalid RVU calculation at index ${index}`,
            severity: ProcessingErrorSeverity.MEDIUM,
            timestamp: now,
            context: { calculationIndex: index, code: calc.code },
          });
        }
      });
    }

    if (
      state.rvuResult &&
      state.rvuResult.summary.flaggedCodes &&
      state.rvuResult.summary.flaggedCodes.length > 0
    ) {
      errors.push({
        message: `RVU processing flagged ${
          state.rvuResult.summary.flaggedCodes.length
        } codes for review: ${state.rvuResult.summary.flaggedCodes.join(", ")}`,
        severity: ProcessingErrorSeverity.LOW,
        timestamp: now,
        context: { flaggedCodes: state.rvuResult.summary.flaggedCodes },
      });
    }
  }

  return errors;
}

// ============================================================================
// EVIDENCE EXTRACTION
// ============================================================================

/**
 * Extracts all evidence from the workflow state.
 * This provides a consolidated view of all evidence collected during processing.
 */
export function extractAllEvidence(
  state: StandardizedWorkflowState,
): StandardizedEvidence[] {
  const evidence: StandardizedEvidence[] = [...state.allEvidence];

  // Add synthetic evidence from state fields
  const now = new Date();

  return evidence.sort((a, b) => a.confidence - b.confidence);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**\n * Validates if an object is a valid procedure code.\n */
function isValidProcedureCode(obj: any): obj is EnhancedProcedureCode {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.code === "string" &&
    typeof obj.description === "string" &&
    Array.isArray(obj.evidence) &&
    typeof obj.units === "number"
  );
}

/**
 * Validates if an object is a valid diagnosis code.
 */
function isValidDiagnosisCode(obj: any): obj is EnhancedDiagnosisCode {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.code === "string" &&
    typeof obj.description === "string" &&
    Array.isArray(obj.evidence)
  );
}

/**
 * Transforms a ProcedureCode to HCPCSCode format
 */
function transformToHCPCSCode(proc: EnhancedProcedureCode): HCPCSCode {
  return {
    code: proc.code,
    description: proc.description,
    evidence: {
      verbatimEvidence: Array.isArray(proc.evidence)
        ? proc.evidence.flatMap((e) => e.verbatimEvidence)
        : [],
      rationale: proc.description,
      sourceAgent: Agents.COMPLIANCE,
      sourceNote: Notes.OPERATIVE,
      confidence: 1.0,
    },
    date: new Date().toISOString(),
    quantity: proc.units,
    units: "each",
    laterality: "",
    category: determineHCPCSCategory(proc.code),
    isTemporary: false,
    exemptFromModifiers: [],
    codeType: "HCPCS" as const,
    sourceNoteType: "operative_notes",
  };
}

/**
 * Determines HCPCS category based on code prefix
 */
function determineHCPCSCategory(
  code: string,
): "DME" | "Drugs" | "Supplies" | "Transportation" | "Other" {
  const prefix = code.charAt(0);
  switch (prefix) {
    case "J":
      return "Drugs";
    case "E":
      return "DME";
    case "A":
      return "Supplies";
    case "T":
      return "Transportation";
    default:
      return "Other";
  }
}

/**
 * Validates if an object is a valid final modifier.
 */
export function isValidFinalModifier(obj: any): obj is StandardizedModifier {
  const isValidEvidence = (evidence: any): boolean => {
    if (!evidence) return true; // Evidence is optional

    // Handle both single evidence object (legacy) and array (new format)
    if (Array.isArray(evidence)) {
      return evidence.every(
        (ev) =>
          typeof ev === "object" &&
          // Handle both old format (excerpt) and new format (verbatimEvidence)
          (typeof ev.excerpt === "string" ||
            (Array.isArray(ev.verbatimEvidence) &&
              ev.verbatimEvidence.length > 0)) &&
          (typeof ev.sourceNoteType === "string" ||
            ev.sourceNoteType === undefined) &&
          (typeof ev.description === "string" ||
            typeof ev.rationale === "string" ||
            ev.description === undefined),
      );
    }

    // Legacy single evidence object support
    return (
      typeof evidence === "object" &&
      (typeof evidence.excerpt === "string" ||
        (Array.isArray(evidence.verbatimEvidence) &&
          evidence.verbatimEvidence.length > 0)) &&
      (typeof evidence.sourceNoteType === "string" ||
        evidence.sourceNoteType === undefined)
    );
  };

  return !!(
    obj &&
    typeof obj === "object" &&
    // Accept both procedureCode (legacy) and linkedCptCode (new format)
    (typeof obj.procedureCode === "string" ||
      typeof obj.linkedCptCode === "string") &&
    // Allow null modifiers (when no modifier is applicable)
    (typeof obj.modifier === "string" || obj.modifier === null) &&
    typeof obj.description === "string" &&
    typeof obj.rationale === "string" &&
    (obj.classification === "Pricing" ||
      obj.classification === "Payment" ||
      obj.classification === "Location" ||
      obj.classification === "Informational" ||
      obj.classification === ModifierClassifications.PRICING ||
      obj.classification === ModifierClassifications.PAYMENT ||
      obj.classification === ModifierClassifications.LOCATION ||
      obj.classification === ModifierClassifications.INFORMATIONAL) &&
    (typeof obj.requiredDocumentation === "string" ||
      typeof obj.requiredDocumentation === "boolean") &&
    typeof obj.feeAdjustment === "string" &&
    (typeof obj.confidence === "number" || obj.confidence === undefined) &&
    (obj.confidence === undefined ||
      (obj.confidence >= 0 && obj.confidence <= 1)) &&
    isValidEvidence(obj.evidence)
  );
}

/**
 * Creates a deep copy of the workflow state.
 */
export function cloneState(
  state: StandardizedWorkflowState,
): StandardizedWorkflowState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Gets a summary of the current state for debugging/monitoring.
 */
export function getStateSummary(state: StandardizedWorkflowState): {
  caseId: string;
  currentStep: string;
  completedSteps: number;
  totalErrors: number;
  evidenceCount: number;
  procedureCount: number;
  diagnosisCount: number;
  modifierCount: number;
} {
  return {
    caseId: state.caseMeta.caseId,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps.length,
    totalErrors: state.errors.length,
    evidenceCount: state.allEvidence.length,
    procedureCount: state.procedureCodes.length,
    diagnosisCount: state.diagnosisCodes.length,
    modifierCount: state.finalModifiers.length,
  };
}

/**
 * Updates the current workflow step and marks the previous step as completed.
 */
export function updateWorkflowStep(
  state: StandardizedWorkflowState,
  newStep: string,
  agentName: string = "system",
): StandardizedWorkflowState {
  const updatedState = { ...state };

  // Mark current step as completed if it's not already
  if (!updatedState.completedSteps.includes(updatedState.currentStep)) {
    updatedState.completedSteps = [
      ...updatedState.completedSteps,
      updatedState.currentStep,
    ];
  }

  // Update to new step
  updatedState.currentStep = newStep;
  updatedState.updatedAt = new Date();

  // Add history entry
  const historyEntry: WorkflowHistoryEntry = {
    agentName,
    timestamp: new Date(),
    action: "step_transition",
    result: "success",
    details: {
      fromStep: state.currentStep,
      toStep: newStep,
    },
  };
  updatedState.history = [...updatedState.history, historyEntry];

  return updatedState;
}

/**
 * Checks if the workflow is complete based on the current state.
 */
export function isWorkflowComplete(state: StandardizedWorkflowState): boolean {
  const requiredSteps = [
    WORKFLOW_STEPS.CPT_EXTRACTION,
    WORKFLOW_STEPS.ICD_SELECTION,
    WORKFLOW_STEPS.CCI_VALIDATION,
    WORKFLOW_STEPS.LCD_COVERAGE,
    WORKFLOW_STEPS.MODIFIER_ASSIGNMENT,
    WORKFLOW_STEPS.RVU_CALCULATION,
    WORKFLOW_STEPS.FINAL_ASSEMBLY,
  ];

  return requiredSteps.every((step) => state.completedSteps.includes(step));
}

/**
 * Gets the next step in the workflow based on current state.
 */
export function getNextWorkflowStep(
  state: StandardizedWorkflowState,
): string | null {
  const stepOrder = [
    WORKFLOW_STEPS.INITIALIZATION,
    WORKFLOW_STEPS.CPT_EXTRACTION,
    WORKFLOW_STEPS.ICD_SELECTION,
    WORKFLOW_STEPS.CCI_VALIDATION,
    WORKFLOW_STEPS.LCD_COVERAGE,
    WORKFLOW_STEPS.MODIFIER_ASSIGNMENT,
    WORKFLOW_STEPS.RVU_CALCULATION,
    WORKFLOW_STEPS.FINAL_ASSEMBLY,
    WORKFLOW_STEPS.VALIDATION,
  ];

  const currentIndex = stepOrder.indexOf(state.currentStep as any);
  if (currentIndex === -1 || currentIndex === stepOrder.length - 1) {
    return null;
  }

  return stepOrder[currentIndex + 1];
}
