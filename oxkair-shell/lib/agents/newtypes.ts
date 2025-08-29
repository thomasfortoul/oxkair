/**
 * Standardized Types for Agent Communication
 * 
 * This file defines the standardized types for communication between agents
 * in the Qwen system, based on the new implementation plan.
 */
import { ServiceRegistry } from "../services/service-types";

// NEW TYPE ENUMS (MUST USE EVERYWHERE)
export enum Notes { OPERATIVE, ADMISSION, DISCHARGE, PATHOLOGY, PROGRESS, BEDSIDE }
export enum Agents { 
  CODE_EXTRACTION = "code_extraction_agent", 
  CPT = "cpt_agent", 
  ICD = "icd_agent", 
  MODIFIER = "modifier_assignment_agent", 
  LCD = "lcd_agent", 
  COMPLIANCE = "cci_validation_agent", 
  RVU = "comprehensive_rvu_agent" 
} 
export enum ComplianceIssueSeverity { INFO, WARNING, CRITICAL }
export enum ProcessingErrorSeverity { LOW, MEDIUM, HIGH, CRITICAL }
export enum ModifierClassifications { PRICING, PAYMENT, LOCATION, INFORMATIONAL }
export enum ClaimTypes { PRIMARY, SECONDARY, TERTIARY, OTHER }
export enum ComplianceIssueTypes { PTP, MUE, DOCS, NONE }
// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Hierarchy level for CPT code structure
 */
export interface HierarchyLevel {
  level: number;
  code: string;
  description: string;
}

/**
 * CPT code validation result
 */
export interface CPTCodeValidation {
  exists: boolean;
  isPrimary: boolean;
  isAddOn: boolean;
  validationErrors: string[];
}

/**
 * Standardized evidence format used across all agents
 */
export interface StandardizedEvidence {
  /** Verbatim evidence quotes from the medical note */
  verbatimEvidence: string[];
  
  /** Explanation of why this evidence supports the finding */
  rationale: string;

  /** Source agent that generated this evidence */
  sourceAgent: Agents;

   /** Source note that generated this evidence */
  sourceNote: Notes;
  
  /** Confidence level (0-1) */
  confidence: number;

  /** Additional structured content specific to the evidence type */
  content?: Record<string, any>;
}

/**
 * Standardized result format for all agents
 */
export interface StandardizedAgentResult {
  /** Whether the agent execution was successful */
  success: boolean;

  /** Standardized evidence produced by the agent */
  evidence: StandardizedEvidence[];
  
  // result of agent.
  data: any;

  /** Any errors encountered during execution */
  errors?: ProcessingError[];
  
  /** Metadata about the agent execution */
  metadata: {
    executionTime: number;
    version: string;
    agentName: Agents;
  };
}

/**
 * Error handling interface
 */
export interface ProcessingError {
  code?: string;
  message: string;
  severity: ProcessingErrorSeverity;
  timestamp: Date;
  source?: string;
  context?: Record<string, any>;
  stackTrace?: string;
}

// ============================================================================
// MEDICAL DATA STRUCTURES
// ============================================================================

/**
 * Enhanced procedure code with JSON metadata
 */
export interface EnhancedProcedureCode {
  /** CPT code */
  code: string;
  
  /** Description from the medical note */
  description: string;
  
  /** Units of service */
  units: number;

  /** MUE limit */
  mueLimit?: number;
  
  /** Evidence supporting this code */
  evidence: StandardizedEvidence[];
  
  /** Explanation of potential modifiers for this procedure */
  modifierExplanation?: string;
  
  /** Official description from CMS */
  officialDesc?: string;
  
  /** Short description */
  shortDesc?: string;

  /** Short description */
  isPrimary: boolean;
  
  /** Store the full hierarchy from JSON */
  hierarchy?: HierarchyLevel[];
  
  /** Flag to identify add-on codes */
  isAddOn?: boolean;
  
  /** Primary codes this add-on applies to */
  addOnApplicableTo?: string[];
  
  /** Code status (Active, Deleted, etc.) */
  statusCode?: string;
  
  /** Global period days */
  globalDays?: string;

  /** NCCI modifier indicators */
  modifierIndicators?: string[];
  
  /** Whether team/assistant/co-surgeon is allowed */
  teamAssistCoSurgeonAllowed?: boolean;
  
  /** APC/ASC packaging information */
  apcAscPackaging?: string;
  
  /** Type of Service code */
  tos?: string;
  
  /** BETOS code */
  betos?: string;
  
  /** Hierarchy path in the CPT structure */
  hierarchyPath?: string[];
  
  /** Code history */
  codeHistory?: Array<{
    date: string;
    change: string;
  }>;
  
  /** The supported modifiers for this CPT code*/
  modifiersApplicable?: string[];

  /** The linked modifiers to this CPT code */
  modifiersLinked?: StandardizedModifier[];

  /** This code is an add-on of these primary codes */
  addOnApplicable?: string[];
  
  /** ICD-10 codes Applicable by this CPT from JSON crosswalk */
  icd10Applicable?: string[];

  /** ICD-10 codes linked to this CPT code */
  icd10Linked?: EnhancedDiagnosisCode[];

  /** Add on codes linked to this CPT code */
  addOnLinked?: EnhancedProcedureCode[];

  /** Linked diagnosis codes from CPT agent output (for ICD agent input) */
  linkedDiagnoses?: string[];
  
  /** RVU values */
  rvu?: {
    work: number;
    pe: number;
    mp: number;
  };

  claimType?: ClaimTypes;
  
  /** Modifier Adjudication Indicator */
  mai?: 1 | 2 | 3;
  
  /** Full code data insights from CPT JSON */
  codeDataInsights?: any; // Will be typed as CodeDataInsights from service-types.ts
}

/**
 * Enhanced diagnosis code with CPT support information
 */
export interface EnhancedDiagnosisCode {
  /** ICD-10 code */
  code: string;
  
  /** Description */
  description: string;
  
  /** Evidence supporting this code */
  evidence: StandardizedEvidence[];

  /** Optional: Simple string reference to linked CPT code instead of full object */
  linkedCptCode?: string;
}

/**
 * Standardized modifier information
 */
export interface StandardizedModifier {
  /** Modifier code */
  modifier: string | null;
  
  /** Description of the modifier */
  description: string;
  
  /** Rationale for applying this modifier */
  rationale: string;
  
  /** Evidence supporting this modifier */
  evidence: StandardizedEvidence[];

  /** Classification of the modifier */
  classification: ModifierClassifications;
  
  /** Documentation requirements */
  requiredDocumentation: string | boolean;
  
  /** Fee adjustment information */
  feeAdjustment: string;
  
  /** Type of edit that triggered this modifier */
  editType?: string;
  
  /** The procedure code this modifier applies to (for PTP conflicts) */
  appliesTo?: string;

  /** Optional: Simple string reference to linked CPT code instead of full object */
  linkedCptCode?: string;
}

/**
 * Procedure line item for claim sequencing
 */
export interface ProcedureLineItem {
  /** Unique line identifier */
  lineId: string;
  
  /** Procedure code */
  procedureCode: string;
  
  /** Units of service */
  units: number;
  
  /** Modifiers from phase 1 processing */
  phase1Modifiers: StandardizedModifier[];
  
  /** Modifiers from phase 2 processing */
  phase2Modifiers: StandardizedModifier[];
  
  /** Compliance flag if units were adjusted */
  complianceFlag?: ComplianceFlag;
}

export interface ComplianceFlag {
    message: string;
    severity?: "INFO" | "ERROR";
    originalUnits?: number;
    truncatedUnits?: number;
}
// ============================================================================
// WORKFLOW STATE
// ============================================================================

/**
 * Standardized workflow state that all agents work with
 */

export interface CaseMeta {
  caseId: string;
  patientId: string;
  providerId: string;
  dateOfService: Date;
  placeOfService?: string;
  claimType: "primary" | "secondary" | "tertiary";
  status: "pending" | "processing" | "completed" | "error";
}

export interface Demographics {
  patientName?: string;
  patientDOB?: string;
  patientMRN?: string;
  dateOfBirth?: string;
  mrn?: string;
  gender: "M" | "F" | "O";
  provider?: string;
  providerSpecialty?: string;
  npi?: string;
  facility?: string;
  attendingPhysician?: string;
  facilityName?: string;
  timeOfSurgery?: string;
  assistantSurgeonRole?: string;
  anesthesiaType?: string;
  age?: number;
  zipCode?: string;
  state?: string;
  insuranceType?: string;
  membershipStatus?: "active" | "inactive";
  eligibilityDate?: Date;
}

export interface StandardizedWorkflowState {
  /** Case metadata */
  caseMeta: CaseMeta
  /** Case notes */
  caseNotes: {
    primaryNoteText: string;
    additionalNotes: Array<{
      type: string;
      content: string;
    }>;
  };
  
  /** Patient demographics */
  demographics: Demographics;

  /** Extracted procedure codes */  
  candidateProcedureCodes: EnhancedProcedureCode[];

  /** Extracted procedure codes */
  procedureCodes: EnhancedProcedureCode[];
  
  /** Extracted diagnosis codes */
  diagnosisCodes: EnhancedDiagnosisCode[];
  
  /** Extracted HCPCS codes */
  hcpcsCodes?: EnhancedProcedureCode[];
  
  /** Suggested modifiers */
  modifierSuggestions?: StandardizedModifier[];
  
  /** Results from previous agents */
  previousResults?: Record<string, StandardizedAgentResult>;
  
  // Analysis Results
  /** CCI validation results */
  cciResult?: CCIResult;
  
  /** MUE validation results */
  mueResult?: any;
  
  /** LCD validation results */
  lcdResult?: any;
  
  /** Additional enrichment data */
  enrichmentData?: any;
  
  /** Global surgical package results */
  globalSurgicalPackageResult?: any;
  
  /** RVU validation results */
  rvuValidationResult?: any;
  
  // Enhanced RVU Results
  /** RVU calculation results */
  rvuResult?: any;
  
  /** Individual RVU calculations */
  rvuCalculations?: any[];
  
  /** Payment estimates */
  paymentEstimates?: {
    totalEstimatedPayment: number;
    byProcedure: { [code: string]: number };
  };
  
  // Final Output
  /** Final modifiers */
  finalModifiers: StandardizedModifier[];
  
  /** Claim sequence */
  claimSequence: {
    lineItems: ProcedureLineItem[];
    diagnoses: EnhancedDiagnosisCode[];
    modifiers: StandardizedModifier[];
    totalUnits: number;
    estimatedReimbursement: number;
  };
  
  /** RVU sequencing result */
  rvuSequencingResult?: any;
  
  /** Clinical context summary */
  clinicalContextSummary?: any;
  
  /** Compliance issues */
  complianceIssues?: any[];
  
  // Workflow Management
  /** Current workflow step */
  currentStep: string;
  
  /** Completed workflow steps */
  completedSteps: string[];
  
  /** Workflow errors */
  errors: {
    code: string;
    message: string;
    severity: ProcessingErrorSeverity;
    timestamp: Date;
    context?: Record<string, any>;
  }[];
  
  /** Workflow history */
  history: Array<{
    agentName: string;
    timestamp: Date;
    action: string;
    result: "success" | "failure" | "warning";
    details?: Record<string, any>;
  }>;
  
  // Evidence Collection
  /** All evidence collected during processing */
  allEvidence: StandardizedEvidence[];
  
  // Metadata
  /** Creation timestamp */
  createdAt: Date;
  
  /** Last update timestamp */
  updatedAt: Date;
  
  /** Version of the workflow state */
  version: string;
}

// ============================================================================
// AGENT INTERFACES
// ============================================================================

/**
 * Standardized agent interface
 */
export interface StandardizedAgent {
  /** Unique name of the agent */
  readonly name: Agents;
  
  /** Description of what the agent does */
  readonly description: string;
  
  /** Services required by this agent */
  readonly requiredServices: string[];
  
  /** Execute the agent */
  execute(context: StandardizedAgentContext): Promise<StandardizedAgentResult>;
}

/** 
 * Standardized context passed to agents
 */
export interface StandardizedAgentContext {
  /** Case ID */
  caseId: string;
  
  /** Current workflow state */
  state: StandardizedWorkflowState;
  
  /** Services registry */
  services: ServiceRegistry;
  
  /** Configuration */
  config: any;
  
  /** Logger */
  logger: WorkflowLogger;
  
  /** Metadata */
  metadata: Record<string, any>;
}

// ============================================================================
// AGENT EXECUTION CONTEXT AND INTERFACES
// ============================================================================

import { WorkflowLogger } from "../../app/coder/lib/logging";
import { LoggedAgentExecutionContext as ILoggedAgentExecutionContext } from "../../app/coder/lib/logging-types";

export interface AgentExecutionContext {
  caseId: string;
  state: StandardizedWorkflowState;
  services: any; // ServiceRegistry from service-types.ts
  config: Record<string, any>;
  metadata: Record<string, any>;
  logger: WorkflowLogger;
}

export type LoggedAgentExecutionContext = ILoggedAgentExecutionContext;

export interface Agent {
  readonly name: string;
  run(context: AgentExecutionContext): Promise<StandardizedAgentResult>;
}

// ============================================================================
// WORKFLOW MANAGEMENT
// ============================================================================

export interface WorkflowHistoryEntry {
  agentName: string;
  timestamp: Date;
  action: string;
  result: "success" | "failure" | "warning";
  details?: Record<string, any>;
}

export interface ClaimSequence {
  lineItems: EnhancedProcedureCode[];
  diagnoses: EnhancedDiagnosisCode[];
  modifiers: StandardizedModifier[];
  totalUnits: number;
  estimatedReimbursement: number;
}

// ============================================================================
// STANDARD MESSAGE FORMATS
// ============================================================================

export interface StandardAgentOutput {
  agentName: Agent;
  timestamp: Date;
  success: boolean;
  data: any;
  evidence: StandardizedEvidence[];
  metadata: Record<string, any>;
  errors?: ProcessingError[];
}

// ============================================================================
// UTILITY TYPE DEFINITIONS
// ============================================================================

export type StateInitializer = (caseId: string) => StandardizedWorkflowState;
export type StateMerger = (
  state: StandardizedWorkflowState,
  result: StandardizedAgentResult,
) => StandardizedWorkflowState;
export type StateValidator = (state: StandardizedWorkflowState) => ProcessingError[];
export type EvidenceExtractor = (
  state: StandardizedWorkflowState,
) => StandardizedEvidence[];

// ============================================================================
// CONSTANTS
// ============================================================================

export const WORKFLOW_STEPS = {
  INITIALIZATION: "initialization",
  CPT_EXTRACTION: "cpt_extraction",        // New: CPT Agent
  ICD_SELECTION: "icd_selection",          // New: ICD Agent
  CCI_VALIDATION: "cci_validation",        // Updated: CCI Agent
  LCD_COVERAGE: "lcd_coverage",            // Updated: LCD Agent
  MODIFIER_ASSIGNMENT: "modifier_assignment", // Updated: Modifier Agent
  RVU_CALCULATION: "rvu_calculation",      // New: RVU Agent (renamed from RVU_SEQUENCING)
  FINAL_ASSEMBLY: "final_assembly",
  VALIDATION: "validation",
  // Legacy steps removed - no longer supported
} as const;

export const ERROR_CODES = {
  AGENT_EXECUTION_FAILED: "AGENT_EXECUTION_FAILED",
  PROCESSING_ERROR: "PROCESSING_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  TIMEOUT_EXCEEDED: "TIMEOUT_EXCEEDED",
  INVALID_INPUT: "INVALID_INPUT",
  EXTERNAL_API_ERROR: "EXTERNAL_API_ERROR",
} as const;

export const DEFAULT_TIMEOUTS = {
  AGENT_EXECUTION: 30000, // 30 seconds
  SERVICE_CALL: 10000, // 10 seconds
  WORKFLOW_TOTAL: 300000, // 5 minutes
  MODIFIER_ASSIGNMENT_AGENT: 90000, // 90 seconds for batch processing
} as const;



export interface EnhancedCaseNotes {
  primaryNoteText: string;
  additionalNotes: Array<{
    type:
      | "operative"
      | "admission"
      | "discharge"
      | "pathology"
      | "progress"
      | "bedside";
    content: string;
    metadata?: Record<string, any>;
  }>;
}

// Re-export types from service-types.ts for backward compatibility
export type { 
  CCIDataService, 
  CCIResult, 
  PTPFlag, 
  MUEFlag, 
  GlobalFlag, 
  RVUFlag,
  CCISummary,
  ServiceRegistry,
  AzureStorageService
} from "../services/service-types";

// Import CCIResult for use in this file
import type { CCIResult } from "../services/service-types";

// Re-export types from ai-model-types.ts for backward compatibility  
export type { 
  LCDCheckInput, 
  LCDCheckOutput, 
  LCDPolicyEvaluation,
  LCDResult,
  AIModelService
} from "../config/ai-model-types";

// Add missing types for backward compatibility
export type WorkflowState = StandardizedWorkflowState;
export type AgentResult = StandardizedAgentResult;

// ============================================================================
// UTILITY FUNCTIONS FOR RELATIONSHIP MANAGEMENT
// ============================================================================

/**
 * Find the CPT code associated with a diagnosis code
 */
export function findCptForDiagnosis(
  diagnosis: EnhancedDiagnosisCode, 
  allCptCodes: EnhancedProcedureCode[]
): EnhancedProcedureCode | undefined {
  if (!diagnosis.linkedCptCode) return undefined;
  return allCptCodes.find(cpt => cpt.code === diagnosis.linkedCptCode);
}

/**
 * Find the CPT code associated with a modifier
 */
export function findCptForModifier(
  modifier: StandardizedModifier, 
  allCptCodes: EnhancedProcedureCode[]
): EnhancedProcedureCode | undefined {
  if (!modifier.linkedCptCode) return undefined;
  return allCptCodes.find(cpt => cpt.code === modifier.linkedCptCode);
}

/**
 * Find all diagnoses linked to a CPT code
 */
export function findDiagnosesForCpt(
  cptCode: EnhancedProcedureCode
): EnhancedDiagnosisCode[] {
  return cptCode.icd10Linked || [];
}

/**
 * Find all modifiers linked to a CPT code
 */
export function findModifiersForCpt(
  cptCode: EnhancedProcedureCode
): StandardizedModifier[] {
  return cptCode.modifiersLinked || [];
}

