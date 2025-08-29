# Agent Prompt: Medical Note to Structured JSON Conversion

Your primary objective is to meticulously analyze a given medical note and extract specific, structured information into a comprehensive JSON object. The most critical aspect of this task is the **absolute precision** required for the `evidence.excerpt` field, and ensuring all fields are populated.

## Input

You will receive the complete content of a medical note as a plain text string.

## Output Format

Your output **MUST** be a JSON object that strictly adheres to the `ComprehensiveAiOutput` interface. Ensure all fields are present, correctly typed, and populated according to the extraction guidelines.

```typescript
interface ComprehensiveAiOutput {
  caseMeta: {
    caseId: string;
    patientId: string;
    providerId: string;
    dateOfService: string; // Format: YYYY-MM-DDTHH:MM:SSZ (ISO 8601)
    claimType: string; // e.g., "primary", "secondary"
    status: string; // e.g., "completed", "processing"
  };
  procedureCodes: Array<{
    code: string;
    description: string;
    isPrimary: boolean;
    isAddOnCode: boolean;
    evidence: {
      description: string;
      excerpt: string; // CRITICAL: This MUST be an EXACT, VERBATIM substring from the original note.
    };
    rvu: number;
    allowedModifiers: string[];
    sourceNoteType: string; // e.g., "operative_notes", "pathology_notes"
  }>;
  diagnosisCodes: Array<{
    code: string;
    description: string;
    isPrimary: boolean;
    evidence: {
      description: string;
      excerpt: string; // CRITICAL: This MUST be an EXACT, VERBATIM substring from the original note.
    };
    laterality?: string; // e.g., "Bilateral", "Left", "Right"
    includes?: string[];
    excludes?: string[];
    sourceNoteType: string; // e.g., "operative_notes", "admission_notes"
  }>;
  modifierSuggestions: Array<{
    procedureCode: string;
    modifier: string;
    description: string;
    classification: string; // e.g., "Required", "Recommended", "Optional"
    priority: number; // 1 (highest) to 3 (lowest)
    required: boolean;
    rationale: string;
    fullJustification: string;
    confidence: number; // 0.0 to 1.0
    evidence: {
      description: string;
      excerpt: string; // CRITICAL: This MUST be an EXACT, VERBATIM substring from the original note.
    };
    sourceNoteType: string; // e.g., "operative_notes"
  }>;
  complianceIssues: Array<{
    type: string; // e.g., "CCI", "MUE", "LCD"
    description: string;
    severity: string; // e.g., "high", "medium", "low"
    affectedCodes: string[];
    recommendation: string;
    violationDetails: string;
    lcdPolicyId?: string | null;
    evidence: {
      description: string;
      excerpt: string; // CRITICAL: This MUST be an EXACT, VERBATIM substring from the original note.
    };
    sourceNoteType: string; // e.g., "operative_notes", "pathology_notes"
  }>;
  rvuSequencing: {
    sequencedCodes: string[];
    optimalSequence: string[];
    totalRVU: number;
    sequencingRationale: string[];
    recommendation: string;
  } | null;
  demographics: {
    patientName: string;
    patientMRN: string;
    patientDOB: string; // Format: YYYY-MM-DD
    gender: string; // e.g., "Male", "Female", "Unknown"
    attendingPhysician: string;
    providerSpecialty: string;
    npi: string;
    facilityName: string;
  } | null;
  encounter: {
    serviceDate: string; // Format: YYYY-MM-DD
    admissionDate: string; // Format: YYYY-MM-DD
    dischargeDate: string; // Format: YYYY-MM-DD
    visitType: string; // e.g., "Inpatient Surgery", "Outpatient Visit"
    encounterDate: string; // Format: YYYY-MM-DD
    encounterTime?: string; // Format: HH:MM
    anesthesiaType?: string;
  } | null;
  caseNotes: {
    primaryNoteText: string; // The full text of the primary note (e.g., operative note)
    additionalNotes: Array<{
      type: string; // e.g., "admission", "pathology", "discharge", "progress"
      content: string; // The full text of the additional note
    }>;
  };
  allEvidence: any[]; // Array of all evidence objects, can be empty if not explicitly structured
  finalModifiers: any[]; // Array of final modifiers, can be empty
  claimSequence: any | null; // Can be null or a structured object
  currentStep: string; // e.g., "initialization", "code_extraction"
  completedSteps: string[]; // Array of strings, e.g., ["initialization", "note_parsing"]
  errors: Array<{
    code: string;
    message: string;
    severity: string; // e.g., "high", "medium", "low"
    timestamp: string; // Format: YYYY-MM-DDTHH:MM:SSZ (ISO 8601)
  }>;
  history: Array<{
    agentName: string;
    timestamp: string; // Format: YYYY-MM-DDTHH:MM:SSZ (ISO 8601)
    action: string;
    result: string; // e.g., "success", "failure"
    details: any; // Object with additional details
  }>;
  createdAt: string; // Format: YYYY-MM-DDTHH:MM:SSZ (ISO 8601)
  updatedAt: string; // Format: YYYY-MM-DDTHH:MM:SSZ (ISO 8601)
  version: string; // e.g., "1.0.0"
}
```

## **CRITICAL INSTRUCTION: `evidence.excerpt`**

The `evidence.excerpt` field is paramount for data integrity and auditability. It **MUST** be an **IDENTICAL, character-for-character substring** found within the original medical note. This means:

*   **No Alterations**: Do not add, remove, or change any characters, including punctuation, capitalization, or whitespace.
*   **Verbatim Match**: The excerpt must be an exact copy of a segment of the input note.
*   **Direct Support**: The chosen excerpt must directly and clearly support the associated code or suggestion.
*   **Minimal Length**: Select the shortest possible segment that still provides unambiguous evidence.

**Example of a CORRECT `evidence.excerpt`:**

Given the note content:
`"Pre-op Diagnosis: Chronic rhinosinusitis with nasal polyps, bilateral (ICD-10 J32.4, J33.0)"`

For a diagnosis code `J32.4`, a **correct** `excerpt` would be:
`"Chronic rhinosinusitis with nasal polyps, bilateral (ICD-10 J32.4, J33.0)"`

**Examples of INCORRECT `evidence.excerpt` (and why):**

*   Original Note: `"Procedure: Laparoscopic cholecystectomy"`
*   Incorrect `excerpt`: `"Laparoscopic cholecystectomy"` (Missing "Procedure: ")
*   Incorrect `excerpt`: `"Laparoscopic cholecystectomy performed."` (Added " performed.")
*   Incorrect `excerpt`: `"The patient underwent laparoscopic cholecystectomy."` (Paraphrased)

## Handling Missing Information (Dummy Data)

It is **imperative** that all fields defined in the `ComprehensiveAiOutput` interface are present in your final JSON output. If a specific piece of information is **not explicitly found or inferable** from the provided medical note, you **MUST** populate that field with appropriate dummy or placeholder data.

*   For string fields: Use descriptive placeholders like `"N/A"`, `"Unknown"`, `"Not Specified"`, or `"Dummy Value"`.
*   For number fields: Use `0` or a reasonable dummy number.
*   For boolean fields: Use `false` or `true` based on a reasonable default or `null` if the field can be nullable.
*   For array fields: Use an empty array `[]` if no elements are found.
*   For object fields: Use an empty object `{}` or `null` if the field can be nullable.
*   For date/time fields: Use a default ISO string like `"2024-01-01T00:00:00Z"` or `"N/A"`.

This ensures the JSON output is always complete and valid against the schema, even when information is sparse.

## Output File Location and Naming

The generated JSON output **MUST** be saved to the `scripts/sample-ai-outputs/` directory. The filename for the JSON output should be derived from the original note's name (e.g., if the note is `operative.txt`, the JSON should be `operative.json`).

## Extraction Guidelines

*   **Procedure Codes**: Extract all relevant CPT/HCPCS codes.
    *   `isPrimary`: `true` for the main procedure, `false` for secondary.
    *   `sourceNoteType`: Always "Operative Note" for procedures from operative notes.
    *   `rvu`: Provide a reasonable RVU (placeholder if exact value unknown).
*   **Diagnosis Codes**: Extract all relevant ICD-10 codes.
    *   `isPrimary`: `true` for the primary diagnosis, `false` for secondary.
    *   `sourceNoteType`: Specify the note type (e.g., "Operative Note", "Admission Note", "Pathology Note").
*   **Modifier Suggestions**: Suggest appropriate CPT modifiers.
    *   `procedureCode`: The CPT code the modifier applies to.
    *   `modifier`: The two-digit CPT modifier (e.g., "80", "50").
    *   `sourceNoteType`: Specify the note type providing evidence for the modifier.
*   **Compliance Issues**: Identify any potential compliance issues.
    *   `lcdPolicyId`: Provide the ID if applicable.
*   **Case Notes**: Populate `primaryNoteText` with the full input note. If the note implies other types of notes (e.g., mentions a "pathology report"), you can add dummy `additionalNotes` with placeholder content and type.
*   **Other Fields**: Populate `caseMeta`, `demographics`, `encounter`, `rvuSequencing`, `allEvidence`, `finalModifiers`, `claimSequence`, `currentStep`, `completedSteps`, `errors`, `history`, `createdAt`, `updatedAt`, and `version` with extracted data or appropriate dummy values.

Your adherence to the `evidence.excerpt` requirement and the completeness of the JSON output are paramount.