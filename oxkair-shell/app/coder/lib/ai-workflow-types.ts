import {
  StandardizedEvidence,
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedModifier,
} from "@/lib/agents/newtypes";

export { MODIFIER_VALIDATION_RULES } from "./modifier-validation-rules";

export interface AppliedModifier {
  modifier: string;
  source: "AI" | "User" | "System";
  rationale: string;
  timestamp: string;
  requiredDocumentation?: string | boolean;
  classification?: "Pricing" | "Payment" | "Location" | "Informational";
  feeAdjustment?: string;
  evidence?: StandardizedEvidence[]; // Added evidence field
}

export type AppliedModifiers = Record<string, AppliedModifier[]>;

export function convertToLegacyFormat(
  appliedModifiers: AppliedModifiers | Record<string, string[]>,
): Record<string, string[]> {
  if (
    Object.values(appliedModifiers).every(
      (v) => Array.isArray(v) && typeof v[0] === "string",
    )
  ) {
    return appliedModifiers as Record<string, string[]>;
  }

  const result: Record<string, string[]> = {};
  for (const [code, modifiers] of Object.entries(appliedModifiers)) {
    if (Array.isArray(modifiers)) {
      if (typeof modifiers[0] === "string") {
        result[code] = modifiers as string[];
      } else {
        result[code] = (modifiers as AppliedModifier[]).map((m) => m.modifier);
      }
    }
  }
  return result;
}

export interface PatientDemographics {
  patientName: string;
  patientDOB: string;
  patientMRN: string;
  dateOfBirth: string;
  mrn: string;
  gender: string;
  provider: string;
  providerSpecialty: string;
  npi: string;
  facility: string;
  attendingPhysician: string;
  facilityName: string;
  timeOfSurgery: string;
  assistantSurgeonRole: string;
  anesthesiaType: string;
  age?: number;
  zipCode?: string;
  insuranceType?: string;
  membershipStatus?: "active" | "inactive";
}

export interface EncounterInfo {
  serviceDate: string;
  encounterDate: string;
  admissionDate: string | null;
  dischargeDate: string | null;
  visitType: string;
  timeOfSurgery: string;
  anesthesiaType: string;
}

export interface HCPCSCode {
  code: string;
  description: string;
  evidence?: StandardizedEvidence; // Changed from string to Evidence interface
  date: string;
  quantity: number;
  units: string;
  laterality: string;
  category: "DME" | "Drugs" | "Supplies" | "Transportation" | "Other";
  isTemporary: boolean;
  exemptFromModifiers?: string[];
  codeType: "HCPCS";
  sourceNoteType: string; // Added field
}

export interface ComplianceIssue {
  type: "CCI Edit" | "LCD" | "MUE" | "Global Period" | "RVU";
  description: string;
  recommendation: string;
  severity: "ERROR" | "WARNING" | "INFO";
  affectedCodes: string[];
}

export interface RVUSequencing {
  sequencedCodes: EnhancedProcedureCode[];
  sequencingRationale: string[];
  totalRVU: number;
}

export interface ClinicalContextSummary {
  diagnosis: string;
  procedure: string;
  product_used: string;
  anatomical_site: string;
  indication: string;
  key_findings: string;
}

export interface SummarizeClinicalContextInput {
  caseId?: string;
  demographics: PatientDemographics;
  encounter: EncounterInfo;
  diagnosisCodes: EnhancedDiagnosisCode[];
  procedureCodes: EnhancedProcedureCode[];
  operativeNote: string;
}

export interface CodeModifierAssignment {
  code: string;
  assignedModifier: "80" | "82" | "62" | "GC" | null;
  modifierRationale: string;
  attestationRequired: boolean;
}

// Task 6: Additional Note Usage Types
export interface StructuredFactualAmendments {
  demographicsUpdates?: Partial<PatientDemographics>;
  encounterUpdates?: Partial<EncounterInfo>;
  procedureAmendments?: {
    add: EnhancedProcedureCode[];
    remove: string[]; // codes to remove
    modify: Array<{ code: string; updates: Partial<EnhancedProcedureCode> }>;
  };
  diagnosisAmendments?: {
    add: EnhancedDiagnosisCode[];
    remove: string[]; // codes to remove
    modify: Array<{ code: string; updates: Partial<EnhancedDiagnosisCode> }>;
  };
  rationale?: string;
}

export interface CaseNotes {
  primaryNoteText: string;
  additionalNotes: Array<{
    type: string;
    text: string;
  }>;
}

export interface AiRawOutput {
  demographics?: PatientDemographics;
  encounter?: EncounterInfo;
  diagnosisCodes?: EnhancedDiagnosisCode[];
  procedureCodes?: EnhancedProcedureCode[];
  hcpcsCodes?: HCPCSCode[];
  modifierSuggestions?: StandardizedModifier[];
  finalModifiers?: StandardizedModifier[]; // Include finalModifiers from workflow state
  modifiersByCode?: AppliedModifiers;
  complianceIssues?: ComplianceIssue[];
  rvuSequencing?: RVUSequencing;
  clinicalContextSummary?: ClinicalContextSummary;
  // Error handling fields
  transformationError?: string;
  processingError?: string;
  partialData?: boolean;
}

export interface BillableNoteOutput {
  noteType: string;
  aiRawOutput: AiRawOutput;
}
