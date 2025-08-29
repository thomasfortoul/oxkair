import { StandardizedEvidence } from "../../agents/newtypes";

// Re-export for backward compatibility
export type Evidence = StandardizedEvidence;

export interface AiRawOutput {
  modifierSuggestions?: AiModifierSuggestionOutput[];
  finalModifiers?: AiModifierSuggestionOutput[];
  procedureCodes?: AiProcedureCodeOutput[];
  hcpcsCodes?: AiHCPCSCodeOutput[]; // Added HCPCSCodeOutput
  demographics?: AiDemographicsOutput;
  encounter?: AiEncounterOutput;
  diagnosisCodes?: AiDiagnosisCodeOutput[];
  assistantCoSurgeonAnalysis?: AiAssistantAnalysisOutput;
  complianceIssues?: AiComplianceIssueOutput[];
  rvuSequencing?: AiRvuSequencingOutput;
  clinicalContextSummary?: AiClinicalContextSummaryOutput; // Added ClinicalContextSummaryOutput
  transformationError?: string;
  partialData?: boolean;
}

export interface AiDemographicsOutput {
  patientName?: string;
  provider_name?: string;
  patientMRN?: string;
  mrn?: string;
  patientDOB?: string;
  dateOfBirth?: string;
  gender?: string;
  attendingPhysician?: string;
  provider?: string;
  providerSpecialty?: string;
  npi?: string;
  facilityName?: string;
  facility?: string;
  encounterDate?: string;
}

export interface AiEncounterOutput {
  serviceDate?: string;
  admissionDate?: string;
  dischargeDate?: string;
  visitType?: string;
  encounterDate?: string;
}

export interface AiDiagnosisCodeOutput {
  code: string;
  description: string;
  isPrimary?: boolean;
  evidence?: Evidence[];
  includes?: string[];
  excludes?: string[];
  additionalCodesRequired?: string[];
  source?: string;
  sourceNoteType?: string; // Added field
}

export interface AiProcedureCodeOutput {
  code: string;
  description: string;
  isPrimary?: boolean;
  isAddOnCode?: boolean;
  requiresParentCode?: string;
  parentCode?: string;
  evidence?: Evidence[];
  rvu?: number | { mp: number; pe: number; work: number };
  allowedModifiers?: string[];
  modifiersApplicable?: string[];
  sourceNoteType?: string; // Added field
  globalPeriod?: string; // Add this line
}

export interface AiHCPCSCodeOutput {
  // New interface for HCPCS codes
  code: string;
  description: string;
  evidence?: Evidence[];
  date?: string;
  quantity?: number;
  units?: string;
  laterality?: string;
  category?: "DME" | "Drugs" | "Supplies" | "Transportation" | "Other";
  isTemporary?: boolean;
  exemptFromModifiers?: string[];
  codeType?: "HCPCS";
  sourceNoteType?: string;
}

export interface AiComplianceIssueOutput {
  type: "globalPeriod" | "PTP" | "MUE" | string;
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  description: string;
  affectedCodes?: string[];
  recommendation?: string;
  suggestedModifiers?: string[];
}

export interface AiRvuSequencingOutput {
  sequencedCodes?: string[];
  optimalSequence?: string[];
  totalRVU?: number;
  sequencingRationale?: string[];
  recommendation?: string;
}

export interface AiModifierSuggestionOutput {
  procedureCode: string;
  modifier: string | null;
  description?: string;
  rationale?: string;
  explanation?: string;
  justification?: string;
  reason?: string;
  fullJustification?: string;
  detailedJustification?: string;
  completeJustification?: string;
  justificationText?: string;
  fullReason?: string;
  priority?: number;
  classification?: "Required" | "Suggested";
  confidence?: number;
  required?: boolean;
  evidence?: Evidence[]; // Added evidence field
  sourceNoteType?: string; // Added field
}

export interface AiAssistantAnalysisOutput {
  assistantSurgeonDetected?: boolean;
  assistantSurgeonName?: string;
  codeModifierAssignments?: AiCodeModifierAssignmentOutput[];
  coSurgeonDetected?: boolean;
  coSurgeonName?: string;
  assistantEvidence?: Evidence;
  attestation?: string;
  attestationNarrative?: string;
  coSurgeonEvidence?: Evidence; // Changed from string to Evidence interface
  sourceNoteType?: string; // Added field
}

export interface AiCodeModifierAssignmentOutput {
  assignedModifier: string;
  code: string;
  attestationRequired?: boolean;
}

export interface AiClinicalContextSummaryOutput {
  diagnosis?: string;
  procedure?: string;
  product_used?: string;
  anatomical_site?: string;
  indication?: string;
  key_findings?: string;
}
