# Qwen System Types Documentation

This document provides a comprehensive overview of the type definitions used throughout the Qwen system. The goal is to standardize types, remove duplicates, and provide a clear reference for developers working with the system.

## Table of Contents

1. [Core Types](#core-types)
2. [Medical Claim Data Structures](#medical-claim-data-structures)
3. [Agent-Specific Types](#agent-specific-types)
4. [Policy Validation Results](#policy-validation-results)
5. [Workflow Management](#workflow-management)
6. [Service Interfaces](#service-interfaces)
7. [Dashboard Types](#dashboard-types)
8. [Data Access Service Types](#data-access-service-types)

## Core Types

### Evidence Types

```typescript
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
  | "lcd_result"
  | "mue_processing"
  | "phase1_modifier_assignment"
  | "phase2_modifier_assignment"
  | "line_item_validation"
  | "ptp_conflict_resolved"
  | "mue_ai_split_approved"
  | "mue_ai_split_denied";

export interface Evidence {
  type: EvidenceType;
  content: any;
  confidence: number;
  source: string;
  timestamp: Date;
}

export interface LCDEvidence {
  type: "lcd_result";
  content: LCDCheckOutput;
  confidence: number;
  source: string;
  timestamp: Date;
}
```

### Agent Result

```typescript
export interface AgentResult {
  success: boolean;
  evidence: Evidence[];
  errors?: ProcessingError[];
  metadata: {
    executionTime: number;
    confidence: number;
    version: string;
    agentSpecificData?: Record<string, any>;
    finalModifiers?: FinalModifier[];
    procedureLineItems?: ProcedureLineItem[];
  };
}
```

### Error Handling

```typescript
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface ProcessingError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: Date;
  agentName?: string;
  source?: string;
  context?: Record<string, any>;
  stackTrace?: string;
  details?: Record<string, any>;
}
```

## Medical Claim Data Structures

### Case Metadata

```typescript
export interface CaseMeta {
  caseId: string;
  patientId: string;
  providerId: string;
  dateOfService: Date;
  placeOfService?: string;
  claimType: "primary" | "secondary" | "tertiary";
  status: "pending" | "processing" | "completed" | "error";
}
```

### Demographics

```typescript
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
```

### Procedure Code

```typescript
export interface ProcedureCode {
  code: string;
  description: string;
  evidenceText: (string | CodeExtractionEvidence)[];
  units: number;
  rvu?: number;
  paymentAmount?: number;
  globalPeriod?: string;
  globalPeriodDescription?: string;
  requestedUnits: number;
  mueLimit: number;
  mai: 1 | 2 | 3;
}
```

### Diagnosis Code

```typescript
export interface DiagnosisCode {
  code: string;
  description: string;
  evidenceText: (string | CodeExtractionEvidence)[];
  type: "primary" | "secondary" | "tertiary";
}
```

### Code Extraction Evidence

```typescript
export interface CodeExtractionEvidence {
  description: string;
  excerpt: string;
  sourceNoteType?: string;
}
```

## Agent-Specific Types

### Diagnosis Output

```typescript
export interface DiagnosisOutput {
  diagnoses: {
    statement: string;
    icd10: string;
    [key: string]: any;
  }[];
}
```

### Procedure Detail

```typescript
export interface ProcedureDetail {
  id?: string;
  name: string;
  noteSection?: string;
  site?: string;
  approach?: string;
  status?: string;
  size?: string;
  keyFactors?: string[];
  cptSection?: string;
  codeRange?: {
    startCode: string;
    endCode: string;
  };
  evidence?: {
    span: string;
    lineStart: number;
    lineEnd: number;
  };
  technique?: string;
  devices?: any[];
  measurements?: any[];
  candidateCodes?: Array<{
    code: string;
    description: string;
    rationale: string;
  }>;
  [key: string]: any;
}
```

### Procedure Output

```typescript
export interface ProcedureOutput {
  procedures: ProcedureDetail[];
}
```

### CPT Mapping Input

```typescript
export interface CptMappingInput {
  diagnoses: DiagnosisOutput['diagnoses'];
  procedures: ProcedureOutput['procedures'];
}
```

## Policy Validation Results

### CCI Result

```typescript
export interface CCIResult {
  ptpFlags: PTPFlag[];
  mueFlags: MUEFlag[];
  globalFlags: GlobalFlag[];
  summary: CCISummary;
  processingMetadata: CCIProcessingMetadata;
}
```

### PTP Flag

```typescript
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
```

### MUE Flag

```typescript
export interface MUEFlag {
  code: string;
  claimedUnits: number;
  maxUnits: number;
  adjudicationIndicator: string;
  issue: string;
  serviceType: string;
  severity: "ERROR" | "WARNING";
}
```

### Global Flag

```typescript
export interface GlobalFlag {
  kind: "GLOBAL_PERIOD";
  severity: Severity;
  message: string;
  suggestedModifiers?: string[];
  code: string;
  globalPeriod: string;
  priorSurgeryDate: string;
  currentServiceDate: string;
  issue: string;
  recommendedModifier: string;
}
```

### LCD Check Output

```typescript
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
```

### RVU Result

```typescript
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
```

### RVU Calculation

```typescript
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
```

## Workflow Management

### Workflow State

```typescript
export interface WorkflowState {
  caseMeta: CaseMeta;
  caseNotes: EnhancedCaseNotes;
  demographics: Demographics;
  procedureCodes: ProcedureCode[];
  diagnosisCodes: DiagnosisCode[];
  hcpcsCodes?: HCPCSCode[];
  modifierSuggestions?: ModifierSuggestion[];
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
  finalModifiers: FinalModifier[];
  claimSequence: ClaimSequence;
  rvuSequencingResult?: RVUSequencingResult;
  clinicalContextSummary?: ClinicalContextSummary;
  complianceIssues?: ComplianceIssue[];
  assistantCoSurgeonAnalysis?: AssistantCoSurgeonAnalysis;

  // Workflow Management
  currentStep: string;
  completedSteps: string[];
  errors: WorkflowError[];
  history: WorkflowHistoryEntry[];

  // Evidence Collection
  allEvidence: Evidence[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: string;
}
```

### Final Modifier

```typescript
export interface FinalModifier {
  procedureCode: string;
  modifier: string | null;
  description: string;
  rationale: string;
  classification: "Pricing" | "Payment" | "Location" | "Informational";
  requiredDocumentation: string | boolean;
  feeAdjustment: string;
  confidence?: number;
  evidence?: ModifierEvidence[];
  appliesTo?: string;
  editType?: "PTP" | "MUE" | "NONE";
}
```

### Procedure Line Item

```typescript
export interface ProcedureLineItem {
  lineId: string;
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
```

## Service Interfaces

### Service Registry

```typescript
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
```

### CCI Data Service

```typescript
export interface CCIDataService {
  loadMUEData(
    serviceType: "hospital" | "practitioner" | "dme",
  ): Promise<MUEEntry[]>;
  loadGlobalData(): Promise<GlobalEntry[]>;
  getCCIEditsForCode(
    code: string,
    serviceType: "hospital" | "practitioner",
  ): Promise<{ edits: CCIEdit[]; status: "found" | "not_found" | "error"; message?: string }>;
  getMUEForCode(code: string, serviceType: string): Promise<MUEEntry | null>;
  getGlobalPeriodForCode(code: string): Promise<GlobalEntry | null>;
}
```

## Dashboard Types

### Comprehensive Dashboard State

```typescript
export interface ComprehensiveDashboardState {
  caseData: MedicalNote | null;
  currentPanel: number;
  initialAIOutput: {
    demographics: DemographicsPanel;
    diagnosis: DiagnosisPanel;
    procedure: ProcedurePanel;
    assistant: AssistantPanel;
    modifier: ModifierPanel;
    compliance: CompliancePanel;
    rvu: RVUPanel;
    summary: SummaryPanel;
    additionalNoteOutputs?: BillableNoteOutput[];
  };
  panelData: {
    demographics: DemographicsPanel;
    diagnosis: DiagnosisPanel;
    procedure: ProcedurePanel;
    assistant: AssistantPanel;
    modifier: ModifierPanel;
    compliance: CompliancePanel;
    rvu: RVUPanel;
    summary: SummaryPanel;
    additionalNoteOutputs?: BillableNoteOutput[];
    groupedProcedures: CPTGroup[];
  };
  selectedNotes: SelectedMedicalNote[];
  flags: PanelFlag[];
  workflowStatus: WorkflowStatus;
  userType: "coder" | "provider";
}
```

### CPT Group

```typescript
export interface CPTGroup {
  cptCode: string;
  description: string;
  tag: "Primary" | "Secondary" | "Tertiary";
  icdCodes: DiagnosisCode[];
  modifiers: ModifierInfo[];
  rvu: {
    workRvu: number;
    adjustedRvu: number;
  };
  compliance: {
    hasViolation: boolean;
    status: "info" | "warning" | "error";
    violationDetails?: string;
    lcdPolicyId?: string;
    policy?: string;
    specificEvidence?: string;
    neededAdditionalDocumentation?: string;
    details: Array<{
      label: string;
      text: string;
    }>;
    ptpViolations?: Array<{
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
    }>;
    mueViolations?: Array<{
      code: string;
      claimedUnits: number;
      maxUnits: number;
      adjudicationIndicator: string;
      issue: string;
      serviceType: string;
      severity: "ERROR" | "WARNING";
    }>;
    globalViolations?: Array<{
      code: string;
      globalPeriod: string;
      priorSurgeryDate: string;
      currentServiceDate: string;
      issue: string;
      recommendedModifier: string;
      severity: "ERROR" | "WARNING" | "INFO";
      suggestedModifiers?: string[];
    }>;
    lcdViolations?: Array<{
      code: string;
      policyId: string;
      requirement: string;
      coverage: string;
      issue: string;
      severity: "ERROR" | "WARNING" | "INFO";
    }>;
  };
  complianceIssues?: ComplianceIssue[];
  sourceNoteType: string;
  evidence: Array<{
    description: string;
    excerpt: string;
    sourceNoteType?: string;
  }>;
  isUserModified?: boolean;
  globalPeriod?: string;
  globalPeriodDescription?: string;
}
```

## Data Access Service Types

### CCI Record

```typescript
export interface CCIRecord {
  column1: string;
  column2: string;
  modifierAllowed: boolean;
  effectiveDate: string;
  terminationDate: string | null;
  ptp: string;
}
```

### MUE Info

```typescript
export interface MUEInfo {
  code: string;
  mueValue: number;
  mai: string;
}
```

### Global Period Data

```typescript
export interface GlobalPeriodData {
  code: string;
  globalPeriod: string;
}
```

### LCD Match

```typescript
export interface LCDMatch {
  lcdId: string;
  title: string;
  link: string;
}
```

### Authoritative RVU Info

```typescript
export interface AuthoritativeRVUInfo {
  code: string;
  workRVU: number;
  facilityPracticeExpenseRVU?: number;
  nonFacilityPracticeExpenseRVU?: number;
  malpracticeRVU?: number;
  totalFacilityRVU?: number;
  totalNonFacilityRVU?: number;
  facilityRate?: number;
  nonFacilityRate?: number;
}
```

## Conclusion

This documentation provides a standardized view of the types used throughout the Qwen system. By organizing these types into logical groups and removing duplicates, we've created a clear reference that should help developers understand and work with the system more effectively.

When adding new types or modifying existing ones, please ensure they're properly documented in this file and placed in the appropriate section based on their purpose and usage within the system.