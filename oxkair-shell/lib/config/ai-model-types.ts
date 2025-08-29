/**
 * AI Model Configuration Types
 * 
 * This file contains types related to AI model configuration, responses,
 * and interaction patterns used throughout the application.
 */

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
// AI MODEL SERVICE INTERFACE
// ============================================================================

export interface AIModelService {
  generateStructuredOutput<T>(prompt: string, schema: any, model?: string): Promise<T>;
  generateText(prompt: string, model?: string): Promise<string>;
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

// ============================================================================
// AI AGENT OUTPUT TYPES
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
// AI MODEL PRICING AND USAGE
// ============================================================================

export interface ModelPricing {
  inputTokenCost: number; // Cost per 1000 input tokens
  outputTokenCost: number; // Cost per 1000 output tokens
  currency: string;
}

export interface UsageMetrics {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  lastResetDate: Date;
}

export interface ModelCapabilities {
  maxContextLength: number;
  supportsStructuredOutput: boolean;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  supportedFormats: string[];
}

// ============================================================================
// AI PROMPT TEMPLATES
// ============================================================================

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  version: string;
  category: "extraction" | "validation" | "analysis" | "generation";
}

export interface PromptExecution {
  templateId: string;
  variables: Record<string, any>;
  timestamp: Date;
  executionTime: number;
  success: boolean;
  error?: string;
}

// ============================================================================
// AI MODEL MONITORING
// ============================================================================

export interface ModelHealthCheck {
  modelId: string;
  status: "healthy" | "degraded" | "unhealthy";
  responseTime: number;
  errorRate: number;
  lastChecked: Date;
  issues: string[];
}

export interface ModelPerformanceMetrics {
  modelId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    successRate: number;
    throughput: number;
    tokenUsage: {
      input: number;
      output: number;
      total: number;
    };
  };
}

// ============================================================================
// CONFIDENCE AND QUALITY SCORING
// ============================================================================

export interface ConfidenceScore {
  overall: number; // 0-1
  components: {
    textQuality: number;
    structuralConsistency: number;
    domainRelevance: number;
    evidenceStrength: number;
  };
  factors: string[];
}

export interface QualityAssessment {
  score: number; // 0-1
  issues: Array<{
    type: "warning" | "error";
    message: string;
    severity: "low" | "medium" | "high";
  }>;
  recommendations: string[];
}

// ============================================================================
// AI MODEL FALLBACK AND RETRY
// ============================================================================

export interface FallbackConfig {
  enabled: boolean;
  fallbackModels: string[];
  retryAttempts: number;
  retryDelay: number;
  fallbackThreshold: number; // Error rate threshold to trigger fallback
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

// ============================================================================
// STRUCTURED OUTPUT SCHEMAS
// ============================================================================

export interface OutputSchema {
  type: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, OutputSchema>;
  items?: OutputSchema;
  required?: string[];
  description?: string;
  enum?: any[];
}

export interface StructuredOutputRequest<T = any> {
  prompt: string;
  schema: OutputSchema;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  expectedType?: new () => T;
}

export interface StructuredOutputResponse<T = any> {
  data: T;
  rawResponse: string;
  confidence: number;
  validationErrors: string[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}


// LCD AGENT



export interface LCDCheckInput {
  dateOfService: string;
  macJurisdiction: string;
  procedures: Array<{
    code: string;
    description: string;
    modifiers: string[];
    units?: number;
    icd10Linked?: Array<{
      code: string;
      description: string;
    }>;
  }>;
  diagnoses: string[];
  noteText: string;
  caseId: string;
}

export interface LCDPolicyEvaluation {
  policyId: string;
  title: string;
  jurisdiction: string;
  score: number; // retrieval relevance 0.0-1.0
  coverageStatus: "Pass" | "Fail" | "Unknown";
  unmetCriteria: Array<{
    criterion: string;
    description: string;
    noteEvidence?: string;
    action: string;
    severity: "Critical" | "Warning" | "Info";
  }>;
  effectiveDate: string;
  lastReviewed?: string;
  policy: string;
  specificEvidence: string;
  neededAdditionalDocumentation: string;
}

export interface LCDCheckOutput {
  dateOfService: string;
  macJurisdiction: string;
  evaluations: LCDPolicyEvaluation[];
  bestMatch: {
    policyId: string;
    coverageStatus: "Pass" | "Fail" | "Unknown";
    confidence: number;
  };
  overallCoverageStatus: "Pass" | "Fail" | "Partial" | "Unknown";
  criticalIssues: string[];
  recommendations: string[];
  processingMetadata: {
    retrievalTime: number;
    synthesisTime: number;
    policiesEvaluated: number;
    cacheHit: boolean;
  };
}

export type LCDResult = LCDCheckOutput;

// ============================================================================
// RVU-RELATED TYPES
// ============================================================================

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

export interface RVUFlag {
  code: string;
  issue: string;
  severity: "WARNING";
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