/**
 * Core Types and Interfaces for AI Agent Architecture
 *
 * This file defines the fundamental types, interfaces, and enums used throughout
 * the agent system for medical claim processing and validation.
 */

import {
  StandardizedEvidence,
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedModifier,
  ProcessingErrorSeverity
} from "./newtypes";

// Re-export StandardizedEvidence for backwards compatibility
export type { StandardizedEvidence } from "./newtypes";

// ============================================================================
// CORE EVIDENCE AND RESULT TYPES
// ============================================================================

export interface LCDEvidence {
  type: "lcd_result";
  content: LCDCheckOutput; // Changed from 'data' to 'content' for consistency
  confidence: number;
  source: string;
  timestamp: Date;
}

export type EvidenceType =
  | "generic"
  | "case_meta"
  | "demographics"
  | "procedure_codes"
  | "diagnosis_codes"
  | "mue_result"
  | "final_modifiers"
  | "claim_sequence"
  | "RVU_FOUND"
  | "case_meta_final"
  | "demographics_final"
  | "procedure_codes_final"
  | "diagnosis_codes_final"
  | "hcpcs_codes_final"
  | "cci_result_final"
  | "mue_result_final"
  | "lcd_result_final"
  | "final_modifiers_complete"
  | "claim_sequence_final"
  | "cci_result"
  | "ptp_violation"
  | "mue_violation"
  | "global_violation"
  | "rvu_result"
  | "rvu_calculation"
  | "payment_estimates"
  | "lcd_result" // Explicitly include lcd_result type
  | "mue_processing" // MUE processing evidence from modifier assignment agent
  | "phase1_modifier_assignment" // Phase 1 modifier assignment evidence
  | "phase2_modifier_assignment" // Phase 2 modifier assignment evidence
  | "line_item_validation" // Line item validation evidence
  | "ptp_conflict_resolved" // PTP conflict resolution evidence
  | "mue_ai_split_approved" // MUE AI split approval evidence
  | "mue_ai_split_denied"; // MUE AI split denial evidence

// Temporary type for migration to StandardizedEvidence
export interface AgentResult {
  success: boolean;
  evidence: StandardizedEvidence[];
  errors?: ProcessingError[];
  metadata: {
    executionTime: number;
    confidence: number;
    version: string;
    agentSpecificData?: Record<string, any>;
    finalModifiers?: FinalModifier[]; // Keep for backward compatibility
    procedureLineItems?: ProcedureLineItem[]; // New structure for two-phase processing
  };
}

import { WorkflowLogger } from "../../app/coder/lib/logging";
import { LoggedAgentExecutionContext as ILoggedAgentExecutionContext } from "../../app/coder/lib/logging-types";

export interface AgentExecutionContext {
  caseId: string;
  state: WorkflowState;
  services: import("../services/service-types").ServiceRegistry;
  config: Record<string, any>;
  metadata: Record<string, any>;
  logger: WorkflowLogger;
}

export type LoggedAgentExecutionContext = ILoggedAgentExecutionContext;
export interface Agent {
  readonly name: string;
  run(context: AgentExecutionContext): Promise<AgentResult>;
}

// ============================================================================
// MEDICAL CLAIM DATA STRUCTURES
// ============================================================================

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

// Using EnhancedProcedureCode from newtypes.ts
export type ProcedureCode = EnhancedProcedureCode;

// Using EnhancedDiagnosisCode from newtypes.ts
export type DiagnosisCode = EnhancedDiagnosisCode;

// ============================================================================
// AGENT-SPECIFIC INPUT/OUTPUT TYPES (FOR REFACTORED PIPELINES)
// ============================================================================

/**
 * Output from Agent A (Diagnosis Extraction).
 */
export interface DiagnosisOutput {
  diagnoses: {
    statement: string;
    icd10: string;
    [key: string]: any; // Allows for additional, experimental fields
  }[];
}

/**
 * Represents a single extracted procedure with its details from Agent B.
 */
export interface ProcedureDetail {
  id?: string; // unique identifier, e.g. "P1"
  name: string;
  noteSection?: string; // heading where found, e.g. "OPERATION"
  site?: string; // anatomical location
  approach?: string;
  status?: string; // "primary" or "re-operation"
  size?: string; // dimensions or complexity
  keyFactors?: string[];
  cptSection?: string; // broader CPT section name
  // Code range for range-based extraction
  codeRange?: {
    startCode: string;
    endCode: string;
  };
  // Evidence with line numbers
  evidence?: string;
  // Legacy fields for backward compatibility
  technique?: string;
  devices?: any[];
  measurements?: any[];
  candidateCodes?: Array<{
    code: string;
    description: string;
    rationale: string;
  }>;
  [key: string]: any; // Allows for additional, experimental fields
}

/**
 * Output from Agent B (Procedure Extraction).
 */
export interface ProcedureOutput {
  procedures: ProcedureDetail[];
}

/**
 * Combined input for Agent C (CPT Mapper).
 */
export interface CptMappingInput {
  diagnoses: DiagnosisOutput["diagnoses"];
  procedures: ProcedureOutput["procedures"];
}
// ============================================================================
// POLICY VALIDATION RESULTS
// ============================================================================

export interface GlobalSurgicalPackageResult {
  flags: Array<{
    code: string;
    globalPeriod: string;
    issue: string;
    recommendedModifier?: string;
  }>;
  status: "Pass" | "Fail";
}

export interface EnrichmentData {
  macJurisdiction: string;
  payerRules?: Record<string, any>; // Flexible for various payer-specific rules
}

// Enhanced RVU-related interfaces
export interface RVUCalculation {
  code: string;
  baseRVUs: {
    work: number;
    pe: number;
    mp: number;
  };
  gpci: {
    work: number;
    pe: number;
    mp: number;
  };
  adjustedRVUs: {
    work: number;
    pe: number;
    mp: number;
  };
  totalAdjustedRVU: number;
  conversionFactor: number;
  paymentAmount: number;
  calculationRationale?: string;
  flags?: string[];
  modifierAdjustments?: ModifierRVUAdjustment[];
}

export interface RVUResult {
  dateOfService: string;
  contractor: string;
  calculations: RVUCalculation[];
  summary: {
    totalPayment: number;
    totalAdjustedRVU: number;
    alerts?: number;
    flaggedCodes?: string[];
  };
  processingMetadata: {
    localityNumber: string;
    state: string;
    gpciSource: string;
    processingTime: number;
  };
}

export interface ModifierRVUAdjustment {
  modifier: string;
  adjustmentType: "percentage" | "fixed" | "bilateral";
  adjustmentValue: number;
  appliedToComponents: ("work" | "pe" | "mp")[];
}

export interface RvuValidationResult {
  dateOfService: string;
  contractor: string;
  calculations: Array<{
    code: string;
    baseRVUs: { work: number; pe: number; mp: number };
    gpci: { work: number; pe: number; mp: number };
    adjustedRVUs: { work: number; pe: number; mp: number };
    totalAdjustedRVU: number;
    conversionFactor: number;
    paymentAmount: number;
    flags?: string[];
  }>;
  summary: {
    totalPayment: number;
    alerts?: number;
  };
}

// CCI-specific result types
export interface CCIResult {
  ptpFlags: PTPFlag[];
  mueFlags: MUEFlag[];
  globalFlags: GlobalFlag[];
  summary: CCISummary;
  processingMetadata: CCIProcessingMetadata;
}

export interface PTPFlag {
  primaryCode: string;
  secondaryCode: string;
  modifierIndicator: "0" | "1" | "2";
  submittedModifiers: string[];
  issue: string;
  allowedModifiers: string[];
  effectiveDate: string;
  deletionDate?: string;
  rationale: string;
  severity: "ERROR" | "WARNING" | "INFO";
}

export interface MUEFlag {
  code: string;
  claimedUnits: number;
  maxUnits: number;
  adjudicationIndicator: string;
  issue: string;
  serviceType: string;
  severity: "ERROR" | "WARNING";
}

export type Severity = "INFO" | "WARNING" | "ERROR";

export interface GlobalFlag {
  kind: "GLOBAL_PERIOD";
  severity: Severity;
  message: string;
  suggestedModifiers?: string[];
  // Legacy fields for backward compatibility
  code: string;
  globalPeriod: string;
  priorSurgeryDate: string;
  currentServiceDate: string;
  issue: string;
  recommendedModifier: string;
}

export interface CCISummary {
  ptpViolations: number;
  mueViolations: number;
  globalViolations: number;
  overallStatus: "PASS" | "FAIL" | "WARNING";
  totalFlags: number;
}

export interface CCIProcessingMetadata {
  cciDataVersion: string;
  mueDataVersion: string;
  globalDataVersion: string;
  processingTimestamp: string;
  rulesApplied: string[];
  performanceMetrics: {
    ptpCheckDuration: number;
    mueCheckDuration: number;
    globalCheckDuration: number;
    totalDuration: number;
  };
}

// Data structure interfaces
export interface CCIEdit {
  column_2: string;
  pre_1996_flag: boolean;
  effective_date: string;
  deletion_date?: string;
  modifier_indicator: "0" | "1" | "2";
  modifier_allowed: string;
  rationale: string;
  source_type: "hospital" | "practitioner";
}

export interface MUEEntry {
  code: string;
  max_units: number;
  adjudication_indicator: string;
  rationale: string;
  service_type: string;
}

export interface GlobalEntry {
  hcpcs: string;
  desc: string;
  global: string;
  status: string;
  globalDescription?: string; // Detailed description of the global period
}

// Global period status indicator descriptions
export const GLOBAL_PERIOD_DESCRIPTIONS: Record<string, string> = {
  "000":
    "No global period - Service is not subject to the global surgical package concept",
  "010":
    "10-day global period - Minor procedure with 10-day postoperative period included",
  "090":
    "90-day global period - Major procedure with 90-day postoperative period included",
  YYY: "Carrier judgment - Global period determined by individual Medicare contractor",
  XXX: "Not applicable - Global concept does not apply to this code",
  ZZZ: "Add-on code - Global period concept does not apply to add-on codes",
  MMM: "Maternity codes - Global period concept does not apply to maternity codes",
};

export interface MUEResult {
  violations: Array<{
    code: string;
    submitted: number;
    threshold: number;
    severity: "error" | "warning";
  }>;
  hasViolations: boolean;
}
export interface RetrievalResult {
  file_id: string;
  filename: string;
  content: Array<{ text: string }>;
  attributes: Record<string, any>;
  score: number;
  // Legacy fields for backward compatibility
  policyId?: string;
  title?: string;
  jurisdiction?: string;
  effectiveDate?: string;
  criteria?: LCDCriterion[];
}

export interface LCDCriterion {
  key: string;
  description: string;
  type: "required" | "preferred" | "exclusion";
  category: "clinical" | "documentation" | "administrative";
}

export interface LCDPolicy {
  policyId: string;
  title: string;
  jurisdiction: string;
  effectiveDate: string;
  lastUpdated: string;
  applicableCodes: string[];
  criteria: LCDCriterion[];
  fullText: string;
  status: "active" | "retired" | "draft";
}

// Using StandardizedModifier from newtypes.ts
export type FinalModifier = StandardizedModifier;

// --- NEW INTERFACE FOR TWO-PHASE MODIFIER ASSIGNMENT ---
export interface ProcedureLineItem {
  lineId: string; // e.g., 'proc-1-line-1'
  procedureCode: string;
  units: number;
  phase1Modifiers: FinalModifier[];
  phase2Modifiers: FinalModifier[];
  complianceFlag?: {
    message: string;
    severity?: "INFO" | "ERROR";
    originalUnits?: number;
    truncatedUnits?: number;
  };
}

export interface ClaimSequence {
  lineItems: ProcedureCode[];
  diagnoses: DiagnosisCode[];
  modifiers: FinalModifier[];
  totalUnits: number;
  estimatedReimbursement: number;
}

// ============================================================================
// WORKFLOW STATE MANAGEMENT
// ============================================================================

export interface WorkflowError {
  code: string;
  message: string;
  severity: ProcessingErrorSeverity;
  timestamp: Date;
  context?: Record<string, any>;
}

export interface WorkflowHistoryEntry {
  agentName: string;
  timestamp: Date;
  action: string;
  result: "success" | "failure" | "warning";
  details?: Record<string, any>;
}

import { EnhancedCaseNotes , LCDCheckOutput} from "./newtypes";
import {
  ClinicalContextSummary,
  ComplianceIssue,
} from "../../app/coder/lib/orchestratorProcessing"; // Import EnhancedCaseNotes

import { HCPCSCode } from "../../app/coder/lib/ai-workflow-types";

export interface WorkflowState { // TO REMOVE
  caseMeta: CaseMeta;
  caseNotes: EnhancedCaseNotes; // Add caseNotes to WorkflowState
  demographics: Demographics;
  procedureCodes: EnhancedProcedureCode[];
  diagnosisCodes: EnhancedDiagnosisCode[];
  hcpcsCodes?: HCPCSCode[];
  modifierSuggestions?: StandardizedModifier[];
  previousResults?: Record<string, AgentResult>;

  // Analysis Results
  cciResult?: CCIResult;
  mueResult?: MUEResult;
  lcdResult?: LCDCheckOutput;
  enrichmentData?: EnrichmentData;
  globalSurgicalPackageResult?: GlobalSurgicalPackageResult;
  rvuValidationResult?: RvuValidationResult;

  // Enhanced RVU Results
  rvuResult?: RVUResult;
  rvuCalculations?: RVUCalculation[];
  paymentEstimates?: {
    totalEstimatedPayment: number;
    byProcedure: { [code: string]: number };
  };

  // Final Output
  finalModifiers: StandardizedModifier[];
  claimSequence: ClaimSequence;
  rvuSequencingResult?: RVUSequencingResult;
  clinicalContextSummary?: ClinicalContextSummary;
  complianceIssues?: ComplianceIssue[];

  // Workflow Management
  currentStep: string;
  completedSteps: string[];
  errors: WorkflowError[];
  history: WorkflowHistoryEntry[];

  // Evidence Collection
  allEvidence: StandardizedEvidence[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: string;
}

export interface RVUSequencingResult {
  sequencingRationale: string;
  finalSequence: Array<{
    code: string;
    description: string;
    finalModifiers: string[];
    adjustedRVU: number;
    notes: string;
  }>;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================



export interface ProcessingError {
  code: string;
  message: string;
  severity: ProcessingErrorSeverity;
  timestamp: Date;
  agentName?: string;
  source?: string;
  context?: Record<string, any>;
  stackTrace?: string;
  details?: Record<string, any>;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryCondition: (error: ProcessingError) => boolean;
}

export interface ErrorResolution {
  canRecover: boolean;
  recoveryAction?: string;
  fallbackResult?: AgentResult;
}

// ============================================================================
// SERVICE REGISTRY
// ============================================================================

// Service interfaces
export interface CCIDataService {
  loadMUEData(
    serviceType: "hospital" | "practitioner" | "dme",
  ): Promise<MUEEntry[]>;
  loadGlobalData(): Promise<GlobalEntry[]>;
  getCCIEditsForCode(
    code: string,
    serviceType: "hospital" | "practitioner",
  ): Promise<{
    edits: CCIEdit[];
    status: "found" | "not_found" | "error";
    message?: string;
  }>;
  getMUEForCode(code: string, serviceType: string): Promise<MUEEntry | null>;
  getGlobalPeriodForCode(code: string): Promise<GlobalEntry | null>;
}

// PatientHistoryService is now defined in service-types.ts

export interface RVUDataService {
  loadHCPCSRecord(code: string): Promise<HCPCSRecord | null>;
  loadGPCIData(): Promise<GPCIData>;
  loadLocalityCrosswalk(): Promise<LocalityCrosswalk>;
  getLocalityInfo(contractor: string): Promise<LocalityInfo | null>;
  cacheRVUData(codes: string[]): Promise<void>;
  validateDataIntegrity(): Promise<ValidationResult>;
}

export interface AzureStorageService {
  getFileContent(filePath: string): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
  listFiles(directoryPath: string): Promise<string[]>;
  listFilesByName(prefixKey: string): Promise<string[]>;
  clearCache(): void;
  getCacheStats(): { size: number; hitRate: number };
}

export interface HCPCSRecord {
  code: string;
  description: string;
  work_rvu: number;
  pe_rvu: number;
  mp_rvu: number;
  total_rvu: number;
  conversion_factor: number;
  status: string;
}

export interface GPCIData {
  [localityNumber: string]: {
    work: number;
    pe: number;
    mp: number;
    state: string;
    locality_name: string;
  };
}

export interface LocalityCrosswalk {
  [contractor: string]: {
    localityNumber: string;
    state: string;
    description: string;
  };
}

export interface LocalityInfo {
  localityNumber: string;
  state: string;
  description: string;
  gpci: {
    work: number;
    pe: number;
    mp: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PriorSurgery {
  code: string;
  date: string;
  globalPeriod: string;
  modifiers: string[];
}

// 1. Define the new service interface
export interface RetrievalService {
  findRvu(hcpcsCode: string): Promise<number | null>;
  searchLCDPolicies(
    query: string,
    maxResults: number,
  ): Promise<RetrievalResult[]>;
}

// ServiceRegistry is now defined in service-types.ts to avoid duplication

// Forward declarations for services (will be implemented in separate files)
export interface AIModelService {
  generateStructuredOutput<T>(prompt: string, schema: any): Promise<T>;
  generateText(prompt: string): Promise<string>;
  estimateConfidence(result: any): number;
  testConnection(): Promise<{
    success: boolean;
    responseTime: number;
    error?: string;
  }>;
  getUsageStats(): {
    requestCount: number;
    totalTokensUsed: number;
    averageTokensPerRequest: number;
  };
  resetStats(): void;
  updateConfig(newConfig: Partial<AIModelConfig>): void;
  getConfig(): AIModelConfig;
}

export interface CCIService {
  checkConflicts(codes: string[]): Promise<CCIResult>;
}

export interface MUEService {
  checkThresholds(codes: ProcedureCode[]): Promise<MUEResult>;
}

export interface LCDService {
  fetchLCDPolicies(
    query: {
      codes: { code: string; description?: string }[];
      macJurisdiction: string;
      noteText: string;
      dateOfService: string;
    },
    maxResults: number,
  ): Promise<RetrievalResult[]>;

  getCachedPolicy(policyId: string): Promise<LCDPolicy | null>;
  cachePolicy(policy: LCDPolicy): Promise<void>;

  validateJurisdiction(jurisdiction: string): boolean;
  getJurisdictionByZip(zipCode: string): Promise<string>;

  // Health check and monitoring
  healthCheck(): Promise<boolean>;
  getMetrics(): Promise<LCDServiceMetrics>;
}

export interface LCDServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageRetrievalTime: number;
  averageSynthesisTime: number;
  cacheHitRate: number;
  circuitBreakerState: any; // Replace with actual CircuitBreakerState enum/type if available
  policyEvaluationStats: {
    passRate: number;
    failRate: number;
    unknownRate: number;
  };
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  generateCacheKey(data: any): string;
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalEntries: number;
    expiredEntries: number;
  };
  clear(): void;
  destroy(): void;
}

export interface PerformanceMonitor {
  timedOperation<T>(name: string, operation: () => Promise<T>): Promise<T>;
  getAggregatedMetrics(): PerformanceMetrics[];
  getOperationMetrics(operationName: string): PerformanceMetrics | null;
  getActiveOperations(): Array<{
    operationId: string;
    startTime: number;
    duration: number;
  }>;
  reset(): void;
  getSummary(): {
    totalOperations: number;
    totalErrors: number;
    averageExecutionTime: number;
    activeOperationCount: number;
    operationTypes: number;
  };
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

export interface PerformanceMetrics {
  operationName: string;
  executionCount: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  errorRate: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: Date;
  createdAt: Date;
  accessCount: number;
}

// ============================================================================
// WORKFLOW ORCHESTRATION
// ============================================================================

export interface WorkflowJob {
  id: string;
  caseId: string;
  priority: number;
  createdAt: Date;
  scheduledAt?: Date;
  maxRetries: number;
  currentRetries: number;
}

export interface WorkflowConfig {
  maxConcurrentJobs: number;
  defaultTimeout: number;
  retryPolicy: RetryPolicy;
  errorPolicy: "fail-fast" | "continue" | "skip" | "skip-dependents";
}

// ============================================================================
// AI MODEL CONFIGURATION
// ============================================================================

export interface AIModelConfig {
  provider: "openai" | "anthropic" | "local" | "azure";
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  reasoning_effort?: "low" | "medium" | "high";
}

export interface AIResponse<T = any> {
  data: T;
  confidence: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================================
// STANDARD MESSAGE FORMATS
// ============================================================================

export interface StandardAgentOutput {
  agentName: string;
  timestamp: Date;
  success: boolean;
  data: any;
  evidence: StandardizedEvidence[];
  metadata: Record<string, any>;
  errors?: ProcessingError[];
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export enum CircuitBreakerState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  monitoringPeriod: number;
}

// ============================================================================
// UTILITY FUNCTIONS TYPE DEFINITIONS
// ============================================================================

export type StateInitializer = (caseId: string) => WorkflowState;
export type StateMerger = (
  state: WorkflowState,
  result: AgentResult,
) => WorkflowState;
export type StateValidator = (state: WorkflowState) => ProcessingError[];
export type EvidenceExtractor = (
  state: WorkflowState,
) => StandardizedEvidence[];

// ============================================================================
// CONSTANTS
// ============================================================================

export const WORKFLOW_STEPS = {
  INITIALIZATION: "initialization",
  // New granular workflow steps
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
  // Agent-specific timeouts for batch processing
  MODIFIER_ASSIGNMENT_AGENT: 90000, // 90 seconds for batch processing
} as const;
// Re-export HCPCSCode for compatibility
export type { HCPCSCode };
