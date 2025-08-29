/**
 * Service Interface Types
 * 
 * This file contains all service interface definitions used throughout the application.
 * These interfaces define the contracts for various services like AI models, data access,
 * caching, and external integrations.
 */
import {
  AIModelService
} from "../services/ai-model-service";

import { WorkflowLogger } from "../../app/coder/lib/logging";
import { 
  ProcessingError, 
  StandardizedEvidence,
  EnhancedProcedureCode,
  ProcessingErrorSeverity 
} from "../agents/newtypes";
import {
  HCPCSRecord,
  GPCIData,
  LocalityCrosswalk,
  LocalityInfo,
  ValidationResult
} from "../config/ai-model-types";

// ============================================================================
// CORE SERVICE INTERFACES
// ============================================================================

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

export interface RetrievalService {
  findRvu(hcpcsCode: string): Promise<number | null>;
  searchLCDPolicies(
    query: string,
    maxResults: number,
  ): Promise<RetrievalResult[]>;
}

export interface VectorSearchService {
  extractProceduresWithRAG(operativeNote: string): Promise<VectorSearchResult>;
  extractProceduresWithRAGWithFallback(operativeNote: string): Promise<VectorSearchResult>;
  extractDiagnosesWithRAG(operativeNote: string, cptCodes: any[]): Promise<IcdVectorSearchResult>;
  extractDiagnosesWithRAGWithFallback(operativeNote: string, cptCodes: any[]): Promise<IcdVectorSearchResult>;
}

export interface VectorSearchResult {
  procedures: Array<{
    id: string;
    candidateCodes: string[];
    addOn: boolean;
    linkedPrimaryId: string | null;
    evidence: string;
    rationale: string;
    details: string;
    keyFactors: string[];
    units: number;
  }>;
}

export interface IcdVectorSearchResult {
  diagnoses: Array<{
    id: string;
    icdCode: string;
    linkedCptCode: string;
    evidence: string;
    rationale: string;
    details: string;
    keyFactors: string[];
    confidence: "high" | "medium" | "low";
  }>;
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
// LCD SERVICE INTERFACES
// ============================================================================

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
  circuitBreakerState: any;
  policyEvaluationStats: {
    passRate: number;
    failRate: number;
    unknownRate: number;
  };
}

// ============================================================================
// COMPLIANCE SERVICE INTERFACES
// ============================================================================

export interface CCIService {
  checkConflicts(codes: string[]): Promise<CCIResult>;
}

export interface MUEService {
  checkThresholds(codes: EnhancedProcedureCode[]): Promise<MUEResult>;
}

// ============================================================================
// SERVICE REGISTRY
// ============================================================================

export interface ServiceRegistry {
  aiModel: AIModelService;
  lcd: LCDService;
  retrievalService: RetrievalService;
  cache: CacheService;
  performance: PerformanceMonitor;
  logger: WorkflowLogger;
  cciDataService: CCIDataService;
  patientHistoryService: PatientHistoryService;
  rvuDataService: RVUDataService;
  azureStorageService: AzureStorageService;
  vectorSearchService: VectorSearchService;
  validateServices(): Promise<ProcessingError[]>;
  getHealthStatus(): Promise<{
    overall: "healthy" | "degraded" | "unhealthy";
    services: {
      aiModel: "healthy" | "unhealthy";
      lcd: "healthy" | "unhealthy";
      cache: "healthy" | "unhealthy";
      performance: "healthy" | "unhealthy";
    };
    details: string[];
  }>;
}

// ============================================================================
// DATA STRUCTURE INTERFACES
// ============================================================================

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
  globalDescription?: string;
}

// Note: HCPCSRecord, GPCIData, LocalityCrosswalk, LocalityInfo, and ValidationResult
// are now defined in ai-model-types.ts

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

// ============================================================================
// RESULT INTERFACES
// ============================================================================

export interface CCIResult {
  ptpFlags: PTPFlag[];
  mueFlags: MUEFlag[];
  globalFlags: GlobalFlag[];
  rvuFlags: RVUFlag[];
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

export interface RVUFlag {
  code: string;
  issue: string;
  severity: "WARNING";
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

export interface GlobalFlag {
  kind: "GLOBAL_PERIOD";
  severity: "INFO" | "WARNING" | "ERROR";
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
  rvuViolations: number;
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

export interface MUEResult {
  violations: Array<{
    code: string;
    submitted: number;
    threshold: number;
    severity: "error" | "warning";
  }>;
  hasViolations: boolean;
}

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
// ADDITIONAL SERVICE INTERFACES
// ============================================================================

export interface PatientHistoryService {
  getPriorSurgeries(
    patientId: string,
    lookbackDays: number,
  ): Promise<PriorSurgery[]>;
}

export interface CCIService {
  checkConflicts(codes: string[]): Promise<CCIResult>;
}

export interface MUEService {
  checkThresholds(codes: EnhancedProcedureCode[]): Promise<MUEResult>;
}

export interface PriorSurgery {
  code: string;
  date: string;
  globalPeriod: string;
  modifiers: string[];
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

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryCondition: (error: ProcessingError) => boolean;
}

export interface WorkflowConfig {
  maxConcurrentJobs: number;
  defaultTimeout: number;
  retryPolicy: RetryPolicy;
  errorPolicy: "fail-fast" | "continue" | "skip" | "skip-dependents";
}

export interface ErrorResolution {
  canRecover: boolean;
  recoveryAction?: string;
  fallbackResult?: any; // Will be StandardizedAgentResult
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
// CCI DATA STRUCTURES
// ============================================================================

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

// Re-export types from ai-model-types.ts for backward compatibility
export type { LCDCheckInput, LCDCheckOutput, LCDPolicyEvaluation, LCDResult } from "../config/ai-model-types";

// Re-export types from newtypes.ts for backward compatibility
export type { 
  ProcessingError,
  ProcessingErrorSeverity
} from "../agents/newtypes";
export { ERROR_CODES } from "../agents/newtypes";


/// NEW TYPES

// ============================================================================
// CPT CODE DATA INSIGHTS TYPES
// ============================================================================

/**
 * Parsed code_data_insights object from CPT JSON files
 * Contains all the standardized fields extracted from CPT data
 */
export interface CodeDataInsights {
  /** Short description */
  "Short Descr"?: string;
  
  /** Medium description */
  "Medium Descr"?: string;
  
  /** Long description */
  "Long Descr"?: string;
  
  /** Status code indicating the type of service */
  "Status Code"?: string;
  
  /** Global days period - parsed to first 3 characters */
  "Global Days"?: string;
  
  /** Professional/Technical component indicator */
  "PC/TC Indicator (26, TC)"?: string;
  
  /** Multiple procedures indicator */
  "Multiple Procedures (51)"?: string;
  
  /** Bilateral surgery indicator */
  "Bilateral Surgery (50)"?: string;
  
  /** Physician supervision requirements */
  "Physician Supervisions"?: string;
  
  /** Assistant surgeon indicators */
  "Assistant Surgeon (80, 82)"?: string;
  
  /** Co-surgeons indicator */
  "Co-Surgeons (62)"?: string;
  
  /** Team surgery indicator */
  "Team Surgery (66)"?: string;
  
  /** Diagnostic imaging family classification */
  "Diagnostic Imaging Family"?: string;
  
  /** APC status indicator */
  "APC Status Indicator"?: string;
  
  /** Type of Service code */
  "Type of Service (TOS)"?: string;
  
  /** Berenson-Eggers Type of Service classification */
  "Berenson-Eggers TOS (BETOS)"?: string;
  
  /** Medically Unlikely Edits value */
  "MUE"?: string;
  
  /** CCS Clinical Classification */
  "CCS Clinical Classification"?: string;
}

/**
 * Utility function to parse Global Days to first 3 characters
 */
export function parseGlobalDays(globalDaysValue?: string): string | undefined {
  if (!globalDaysValue) return undefined;
  
  // Extract first 3 characters from the Global Days string
  const firstThreeChars = globalDaysValue.substring(0, 3);
  
  // Validate against known global period codes
  const validGlobalCodes = ["000", "010", "090", "YYY", "XXX", "ZZZ", "MMM"];
  
  if (validGlobalCodes.includes(firstThreeChars)) {
    return firstThreeChars;
  }
  
  // If not a standard code, return the first 3 characters anyway
  return firstThreeChars;
}

/**
 * Enhanced CPT code data structure with parsed insights
 */
export interface EnhancedCPTCodeData {
  /** CPT code */
  code: string;
  
  /** Official title/description */
  title: string;
  
  /** Common language summary */
  summary: string;
  
  /** Parsed global days (first 3 characters) */
  globalDays?: string;
  
  /** MUE limit as number */
  mueLimit?: number;
  
  /** Allowed modifiers */
  allowed_modifiers?: string[];
  
  /** Allowed ICD families */
  allowed_icd_families?: string[];
  
  /** Full code data insights object */
  codeDataInsights?: CodeDataInsights;
}

/**
 * Service for loading CPT JSON data
 */
export interface CPTJsonService {
  /** Load CPT JSON data for a code */
  loadCptJson(code: string): Promise<Record<string, any> | null>;
  
  /** Check if CPT JSON exists for a code */
  cptJsonExists(code: string): Promise<boolean>;
  
  /** Parse code data insights from CPT JSON */
  parseCodeDataInsights(cptJsonData: Record<string, any>): CodeDataInsights | null;
  
  /** Get enhanced CPT code data with parsed insights */
  getEnhancedCPTData(code: string): Promise<EnhancedCPTCodeData | null>;
}

/**
 * Service for accessing medical data
 */
export interface MedicalDataService {
  /** Get CCI edits for a code */
  getCciEdits(code: string): Promise<any[]>;
  
  /** Get MUE information for a code */
  getMueInfo(code: string): Promise<any>;
  
  /** Get global period for a code */
  getGlobalPeriod(code: string): Promise<string>;
  
  /** Get LCD policies */
  getLcdPolicies(): Promise<any[]>;
}

