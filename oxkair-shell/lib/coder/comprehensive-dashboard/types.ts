// Comprehensive Medical Coding Dashboard Types
// Migrated from oxkair-coder to oxkair-shell
// Updated import paths for oxkair-shell structure

import type {
  HCPCSCode,
  ComplianceIssue as AIComplianceIssue,
  RVUSequencing,
  AiRawOutput, // Import AiRawOutput for BillableNoteOutput
  BillableNoteOutput, // Import BillableNoteOutput
} from "@/app/coder/lib/ai-workflow-types";

import type {
  StandardizedEvidence,
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedModifier,
} from "../../agents/newtypes";

export interface BasePanel {
  submittedBy?: string;
  submittedAt?: string;
}

export interface PanelFlag {
  id?: string;
  field?: string;
  codeIndex?: number;
  issue: string;
  severity: "high" | "medium" | "low";
  message: string;
  resolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

// Panel 1: Demographics & Encounter Info
export interface DemographicsPanel extends BasePanel {
  patientInfo: {
    name: string;
    mrn: string;
    dateOfBirth: string;
    gender: string;
  };
  providerInfo: {
    name: string;
    specialty: string;
    npi: string;
  };
  encounterInfo: {
    facility: string;
    serviceDate: string;
    admissionDate?: string;
    dischargeDate?: string;
    visitType: string;
  };
  flags: DemographicsFlag[];
}

export interface DemographicsFlag extends PanelFlag {
  field: string;
  issue: "missing" | "invalid" | "not_specified";
}

// Panel 2: Diagnosis Codes
export interface DiagnosisPanel extends BasePanel {
  codes: EnhancedDiagnosisCode[];
  flags: DiagnosisFlag[];
}

export interface DiagnosisFlag extends PanelFlag {
  codeIndex: number;
  issue:
    | "missing_evidence"
    | "low_confidence"
    | "missing_includes"
    | "missing_additional_codes";
}

// Panel 3: Procedure Codes
export interface ProcedurePanel extends BasePanel {
  codes: EnhancedProcedureCode[];
  flags: ProcedureFlag[];
}

export interface ProcedureFlag extends PanelFlag {
  codeIndex: number;
  issue:
    | "missing_evidence"
    | "low_confidence"
    | "incorrect_relationship"
    | "invalid_format";
}

// Panel 4: Assistant/Co-Surgeon Detection
export interface AssistantPanel extends BasePanel {
  assistants: AssistantInfo[];
  flags: AssistantFlag[];
}

export interface AssistantInfo {
  name: string;
  role: "assistant" | "co-surgeon";
  codes: string[];
  modifier: "80" | "82" | "62";
  attestationRequired: boolean;
  attestationStatus: "pending" | "uploaded" | "not_required";
  attestationDocument?: string;
  uploadedFiles?: File[];
  evidence: StandardizedEvidence[]; // Changed to use CodeExtractionEvidence
  source: "AI" | "Manual" | "Modified";
  sourceNoteType: string; // Added field
}

export interface AssistantFlag extends PanelFlag {
  assistantIndex: number;
  issue: "missing_attestation" | "low_confidence" | "missing_evidence";
}

// Panel 5: Modifier Suggestions
export interface ModifierPanel extends BasePanel {
  suggestions: ModifierSuggestion[];
  flags: ModifierFlag[];
}

export interface ModifierSuggestion {
  procedureCode: string;
  suggestedModifiers: StandardizedModifier[];
  lockedModifiers: string[]; // From prior steps
  finalSequence: string[];
}

export type ModifierInfo = StandardizedModifier;

export interface ModifierFlag extends PanelFlag {
  procedureCode: string;
  issue: "conflicting_modifiers" | "missing_required" | "invalid_combination";
}

// Panel 6: Compliance & Edits
export interface CompliancePanel extends BasePanel {
  cciEdits: CCIEdit[];
  mueInfo: MUEInfo[];
  lcdEdits: LCDEdit[];
  globalPeriodIssues: GlobalPeriodIssue[];
  complianceIssues: ComplianceIssue[];
  flags: ComplianceFlag[];
}

export interface CCIEdit {
  code1: string;
  code2: string;
  editType: string;
  modifier: string;
  description: string;
}

export interface MUEInfo {
  code: string;
  limit: number;
  currentCount: number;
  adjudication: string;
}

export interface LCDEdit {
  code: string;
  requirement: string;
  coverage: string;
  documentation: string[];
}

export interface GlobalPeriodIssue {
  code: string;
  globalPeriod: number;
  conflictingDate: string;
  description: string;
}

export interface ComplianceIssue {
  type: "CCI" | "MUE" | "LCD" | "GlobalPeriod" | "RVU";
  description: string;
  severity: "ERROR" | "WARNING" | "INFO";
  affectedCodes: string[];
  recommendation: string;
  resolved: boolean;
  resolution?: string;
  references: string[];
}

export interface ComplianceFlag extends PanelFlag {
  complianceType: "CCI" | "MUE" | "LCD" | "GlobalPeriod" | "RVU";
  issue: "violation" | "warning" | "documentation_required";
}

// Panel 7: RVU Sequencing
export interface RVUPanel extends BasePanel {
  sequencing: RVUSequence;
  flags: RVUFlag[];
  geographicInfo?: {
    locality: string;
    state: string;
    contractor: string;
  };
  paymentSummary?: {
    totalPayment: number;
    totalRVU: number;
    alertCount: number;
  };
}

export interface RVUSequence {
  optimizedOrder: RVUCode[];
  totalRVU: number;
  explanation: string;
  modifier51Applied: boolean;
}

export interface RVUCode {
  code: string;
  description: string;
  baseRVU: {
    work: number;
    pe: number;
    mp: number;
  };
  adjustedRVU: {
    work: number;
    pe: number;
    mp: number;
  };
  appliedModifiers: string[];
  sequencePosition: number;
  sequenceExplanation: string;
}

export interface RVUFlag extends PanelFlag {
  issue: "incorrect_sequence" | "modifier_51_error" | "addon_code_position";
}

// Panel 8: Summary & Final Review
export interface SummaryPanel extends BasePanel {
  panelSummaries: PanelSummary[];
  overallStatus: "ready" | "pending_resolution" | "PENDING_BILLING";
  flags: SummaryFlag[];
  workflow: WorkflowStatus;
}

export interface PanelSummary {
  panelType: string;
  status: "clean" | "flagged" | "unresolved";
  flagCount: number;
  lastModified: string;
  modifiedBy: string;
}

export interface WorkflowStatus {
  currentStep: string;
  nextAction: string;
  requiredActions: string[];
  canSubmitToProvider: boolean;
  canFinalizeDirectly: boolean;
}

export interface SummaryFlag extends PanelFlag {
  panelType: string;
  issue: "unresolved_flags" | "missing_data" | "workflow_incomplete";
}

// Dashboard State
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
    additionalNoteOutputs?: BillableNoteOutput[]; // Added for additional billable notes
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
    additionalNoteOutputs?: BillableNoteOutput[]; // Added for additional billable notes
    groupedProcedures: CPTGroup[]; // New grouped data structure for Phase 1
  };
  selectedNotes: SelectedMedicalNote[]; // New field to store selected notes for processing
  flags: PanelFlag[];
  workflowStatus: WorkflowStatus;
  userType: "coder" | "provider";
}

// User workflow types
export type UserType = "coder" | "provider";

export interface UserWorkflow {
  userType: UserType;
  allowedPanels: number[];
  canEdit: boolean;
  canApprove: boolean;
  canSubmit: boolean;
}

// Audit trail
export interface AuditEntry {
  id: string;
  caseId: string;
  panelType: string;
  action: "create" | "update" | "delete" | "resolve_flag" | "submit";
  userId: string;
  userType: UserType;
  timestamp: string;
  changes: Record<string, any>;
  rationale?: string;
}

// Flag resolution
export interface FlagResolution {
  flagId: string;
  resolution: string;
  rationale: string;
  resolvedBy: string;
  resolvedAt: string;
}

// New interface for selected medical notes
export interface SelectedMedicalNote {
  id: string; // Unique ID of the medical note
  noteType:
    | "Operative"
    | "Admission"
    | "Discharge"
    | "Pathology"
    | "Progress"
    | "Bedside"; // Enforce specific note types
  designation: "main" | "support"; // 'main' for the primary note, 'support' for others
  isBillable: boolean; // Indicates if this note is selected for billing
}

// Clinical Note Structure for Provider Review
export interface ClinicalNote {
  id: string; // Unique ID for the note
  noteType:
    | "Operative"
    | "Admission"
    | "Discharge"
    | "Pathology"
    | "Progress"
    | "Bedside"; // Enforce specific note types
  title: string; // Display title for the note
  content: string; // Full text content of the note
  isPrimary: boolean; // Indicates if this is the main note to display initially
  sourceUrl?: string; // Optional link to the original document if applicable
}

// Provider Review & Finalization Dashboard Specific Types
export interface ProviderInfo {
  id: string;
  name: string;
  // Add other relevant provider details if needed
}

export type ProviderReviewItemStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "clarification_requested";

export type ProviderReviewAction =
  | "Approve"
  | "Reject"
  | "Request Clarification";

// This interface represents a single item the provider reviews.
// It can be a demographic field, a diagnosis, a procedure, or an AI insight.
export interface ProviderReviewItem {
  id: string; // Unique identifier for the review item (e.g., 'demographics-mrn', 'diagnosis-0', 'aiInsight-2')
  caseId: string; // To associate with the case
  section:
    | "Demographics"
    | "Diagnoses"
    | "Procedures"
    | "HCPCS"
    | "Modifiers"
    | "QualityMeasures"
    | "AI Insights"
    | "Other"; // Category of the item
  description: string; // Brief description of the item (e.g., "Patient Name", "ICD-10 Code: J45.909", "AI Suggested Modifier")

  originalData?:
    | EnhancedDiagnosisCode
    | EnhancedProcedureCode
    | HCPCSCode
    | StandardizedModifier
    | AIComplianceIssue
    | RVUSequencing
    | Record<string, any>;
  coderEdit?:
    | EnhancedDiagnosisCode
    | EnhancedProcedureCode
    | HCPCSCode
    | StandardizedModifier
    | AIComplianceIssue
    | RVUSequencing
    | Record<string, any>;
  aiArtifact?:
    | EnhancedDiagnosisCode
    | EnhancedProcedureCode
    | HCPCSCode
    | StandardizedModifier
    | AIComplianceIssue
    | RVUSequencing
    | Record<string, any>;

  // Visual differentiation hints - these could be flags or specific styling instructions
  isEditedByCoder?: boolean;
  isAIGenerated?: boolean;
  aiConfidenceScore?: number;
  aiEvidenceLinks?: string[]; // Links to text snippets supporting AI suggestion

  status: ProviderReviewItemStatus;
  rejectionReason?: string; // Selected from a predefined list if action is 'Reject'
  rejectionDetails?: string; // Optional free-text for rejection
  clarificationQuery?: string; // Provider's question if action is 'Request Clarification'
  resolutionNotes?: string; // Notes from coder if item was returned and revised
}

// For logging provider actions
export interface ProviderAuditLogEntry {
  timestamp: string; // ISO 8601 format
  providerId: string;
  caseId: string;
  itemId: string; // Specific identifier for the item/artifact acted upon
  action: ProviderReviewAction;
  rejectionReason?: string; // If action was 'Reject'
  rejectionDetails?: string; // If action was 'Reject'
  clarificationQuery?: string; // If action was 'Request Clarification'
  triggeredBy?: string; // What triggered this action
  source?: string; // Source of the action
}

// Represents the overall data structure for the provider review dashboard for a single case
export interface ProviderDashboardData {
  caseId: string;
  provider: ProviderInfo;
  clinicalNotes: ClinicalNote[]; // To hold multiple clinical notes
  // Structured data for review, transformed from coder's final output
  // These would be arrays of objects that can be mapped to ProviderReviewItem
  demographics: ProviderReviewItem[];
  diagnoses: ProviderReviewItem[];
  procedures: ProviderReviewItem[];
  hcpcsCodes: ProviderReviewItem[]; // Added for HCPCS codes
  modifierSuggestions: ProviderReviewItem[]; // Added for Modifier suggestions
  potentialQualityMeasures: ProviderReviewItem[]; // Added for potential quality measures
  aiInsights: ProviderReviewItem[]; // For AI-generated summaries, flags, etc. not tied to a specific code
  // Potentially other sections based on the 8 panels, summarized for provider
  // e.g., assistantSurgeonInfo, complianceHighlights, rvuSummary

  overallCaseStatus:
    | "PendingProviderReview"
    | "RevisionRequested"
    | "Finalized";
  coderSubmissionTimestamp?: string;
  coderNotesToProvider?: string; // Any notes the coder left for the provider
}

// Helper type for transforming panel data into ProviderReviewItems
export interface TransformedPanelData {
  demographics: ProviderReviewItem[];
  diagnoses: ProviderReviewItem[];
  procedures: ProviderReviewItem[];
  hcpcsCodes: ProviderReviewItem[];
  assistantCoSurgeon: ProviderReviewItem[];
  modifierSuggestions: ProviderReviewItem[];
  potentialQualityMeasures: ProviderReviewItem[];
  complianceEdits: ProviderReviewItem[];
  rvuSequencing: ProviderReviewItem[];
  aiInsights: ProviderReviewItem[]; // General AI insights/summaries
}

// New interface for CPT/HCPCS grouped data structure (Phase 1 - Step 1.2)
export interface CPTGroup {
  cptCode: string;
  description: string;
  tag: "Primary" | "Secondary" | "Tertiary"; // For sequencing
  icdCodes: EnhancedDiagnosisCode[]; // Re-use existing DiagnosisCode type, ensure it has evidence and sourceNoteType
  modifiers: StandardizedModifier[]; // Re-use existing ModifierInfo type, ensure it has evidence and sourceNoteType
  rvu: {
    workRvu: {
      mp: number;
      pe: number;
      work: number;
    };
    adjustedRvu: {
      mp: number;
      pe: number;
      work: number;
    };
  };
  compliance: {
    hasViolation: boolean;
    status: "info" | "warning" | "error";
    violationDetails?: string; // For tooltip
    lcdPolicyId?: string; // For linking to LCD policy
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
    rvuViolations?: Array<{
      code: string;
      issue: string;
      severity: "ERROR" | "WARNING" | "INFO";
    }>;
  };
  complianceIssues?: ComplianceIssue[];
  sourceNoteType: string; // Added field for originating note source
  evidence: StandardizedEvidence[]; // Evidence for the CPT code itself
  isUserModified?: boolean; // Track user modifications
  globalPeriod?: string; // Global period code (000, 010, 090, etc.)
  globalPeriodDescription?: string; // Detailed description of the global period
  // Add any other CPT-specific details needed for display
}

export interface MedicalNoteAuditEntry {
  id: number;
  case_id: string;
  panel_type?: string;
  action_type: string;
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  user_id: string;
  user_type?: "coder" | "provider";
  rationale?: string;
  created_at: string;
  user_profile?: {
    first_name?: string;
    last_name?: string;
  };
}

export interface MedicalNote {
  id: string;
  user_id?: string;
  mrn?: string;
  date_of_service?: string | null;
  insurance_provider?: string | null;
  content?: string;
  operative_notes?: string;
  admission_notes?: string;
  discharge_notes?: string;
  pathology_notes?: string;
  progress_notes?: string;
  title?: string;
  tags?: string[];
  source?: "editor" | "coder";
  status?: string;
  ai_raw_output?: Record<string, unknown> | null;
  final_processed_data?: Record<string, unknown> | null;
  panel_data?: any;
  created_at?: string | null;
  updated_at?: string | null;
  audit_trail?: MedicalNoteAuditEntry[] | null;
  provider_user_id?: string | null;
  summary_data?: any;
  institution_id?: string | null;
}
