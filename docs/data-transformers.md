
Last updated: 2025--08-21 12:10 UTC

# Data Transformers and Schemas

[Back to Master Index](./README.md)

This document outlines the contracts for parsing, validating, and transforming data, particularly for AI model inputs and outputs. The system relies heavily on the `zod` library for schema definition and validation.

## AI Input/Output Schemas

Each AI agent defines strict schemas for its structured outputs. This ensures that the data returned from the AI model is predictable and safe to use. These schemas are located alongside their respective agents in `oxkair-shell/lib/agents/`.

### 1. Code Extraction (`code-extraction-agent.ts`)

-   **Objective**: To extract procedure (CPT) and diagnosis (ICD-10) codes from clinical notes.
-   **Schemas**:
    -   `DiagnosisOutput`: Validates the initial extraction of diagnoses.
        -   **Input**: Raw text from medical notes.
        -   **Output Guarantees**: An array of objects, each containing a `statement`, `icd10` code, and confidence level.
    -   `ProcedureOutput`: Validates the initial extraction of procedures.
        -   **Input**: Raw text from medical notes.
        -   **Output Guarantees**: An array of procedure objects with `name`, `site`, `approach`, and candidate `codeRange`.
    -   `CptMapping`: Validates the final mapping of extracted procedures to specific CPT codes.
        -   **Input**: `DiagnosisOutput` and `ProcedureOutput`.
        -   **Output Guarantees**: An array of `procedureCodes`, each with a 5-digit CPT `code`, `description`, `units`, and `evidenceText`.

-   **Failure Modes**: If the AI output does not conform to the schema, the `generateStructuredOutput` call will throw an error, which is caught by the agent. The agent then creates a `ProcessingError` and returns a failure result, preventing invalid data from propagating.

-   **Example Payload (Valid for CPT Mapping)**:
    ```json
    {
      "procedureCodes": [
        {
          "code": "12345",
          "description": "Example Procedure",
          "evidenceText": [{ "description": "Note reference", "excerpt": "Doctor performed..." }],
          "units": 1,
          "rationale": "Based on the operative report."
        }
      ]
    }
    ```

### 2. CCI Validation (`cci-agent.ts`)

-   **Objective**: This agent does not use a Zod schema for AI output, as it's a rule-based agent that operates on data from the `WorkflowState`. It validates procedure codes against Correct Coding Initiative (CCI) edits.
-   **Input**: `procedureCodes` from `WorkflowState`.
-   **Output**: A `CCIResult` object is added to the `WorkflowState`.

### 3. LCD Coverage (`lcd-agent.ts`)

-   **Objective**: To evaluate medical necessity against Local Coverage Determination (LCD) policies.
-   **Schema**: `LCDPolicyEvaluation`
    -   **Input**: `LCDCheckInput` containing procedures, diagnoses, and note text.
    -   **Output Guarantees**: An array of `evaluations`, each with a `policyId`, `coverageStatus` ('Pass', 'Fail', or 'Unknown'), and a list of `unmetCriteria`.
-   **Failure Modes**: If the AI call fails, the agent creates a fallback `LCDPolicyEvaluation` with a status of `Unknown` and logs the error. This ensures the workflow can continue.

### 4. Modifier Assignment (`modifier-assignment-agent.ts`)

-   **Objective**: To assign appropriate CPT modifiers based on CCI results and clinical context.
-   **Schemas**:
    -   **Phase 1 (Distinct Service)**: A schema that expects an array of `assignments`, each linking a `lineId` to a distinct-service `modifier` (e.g., 59, XE) and a `rationale`.
    -   **Phase 2 (Ancillary)**: A schema that expects an array of `assignments`, each linking a `lineId` to a list of ancillary `modifiers` (e.g., RT, LT, 50).
-   **Failure Modes**: If the AI output fails validation, the agent logs an error and proceeds without assigning modifiers for the failed items. The process is designed to be resilient to partial failures.

### 5. Comprehensive RVU (`comprehensive-rvu-agent.ts`)

-   **Objective**: To calculate and sequence Relative Value Units (RVUs) for optimal reimbursement.
-   **Schema**: `AIResponseSchema`
    -   **Input**: A list of `RVUCalculation` objects.
    -   **Output Guarantees**: A `sequencingRationale` and a `finalSequence` array of procedure codes with their `adjustedRVU`.
-   **Failure Modes**: If the AI call fails, the agent falls back to a simple descending sort of RVU values, ensuring that a valid sequence is always produced.

## Update Checklist

When making changes to data transformers or schemas, please update this document:

-   [ ] List any new Zod schemas for AI or API validation.
-   [ ] Update the input assumptions and output guarantees for any modified transformers.
-   [ ] Document any new failure modes or recovery strategies.
-   [ ] Refresh the examples of valid/invalid payloads.
