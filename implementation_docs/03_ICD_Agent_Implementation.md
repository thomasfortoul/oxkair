# Implementation Plan: ICD Agent Implementation

## 1. Goal

To create a new, two-pass `ICDAgent` responsible for identifying and selecting appropriate ICD-10 diagnosis codes that establish medical necessity for the CPT codes selected by the `CPTAgent`. This new agent will replace the diagnosis extraction logic currently in `CodeExtractionAgent`.

## 2. Key Files

-   A new file will be created for the `ICDAgent`: `oxkair-shell/lib/agents/icd-agent.ts`.
-   `oxkair-shell/lib/agents/code-extraction-agent.ts`: The `runDiagnosisExtraction` method will be used as a reference and then removed.

## 3. Current State

The `runDiagnosisExtraction` method within `CodeExtractionAgent` currently identifies diagnoses and suggests ICD-10 prefixes from the clinical note in a single pass. This process is not explicitly linked to the selected CPT codes.

## 4. Target State: The 2-Pass `ICDAgent`

The new `ICDAgent` will run *after* the `CPTAgent` and will use the selected CPT codes as a primary input. It will operate in two distinct passes to first identify likely ICD-10 prefixes and then select the final, specific codes.

### Pass B1: ICD Prefix Identification

-   **Goal**: To identify the most likely 3-character ICD-10 prefixes that justify each of the selected CPT codes.
-   **Inputs**:
    -   Clinical note text.
    -   The `CPT Bundle` (the final, enriched `EnhancedProcedureCode` objects from the `CPTAgent`). This includes the procedure descriptions and any indications.
-   **Functionality**:
    -   This pass is similar to the current `runDiagnosisExtraction` but will be more focused.
    -   The AI prompt will instruct the model to find diagnoses in the note that are relevant to the provided CPT codes.
    -   For each CPT code, the agent should identify a limited set of 3-character ICD-10 prefixes.
-   **Outputs**:
    -   For each CPT code, a list of `icd_prefix_candidates` with `rationale` and `evidence`.

### Inter-pass Filter: Expand Prefixes to Codes

-   **Goal**: To generate a filtered list of full ICD-10 codes based on the identified prefixes.
-   **Inputs**:
    -   The `icd_prefix_candidates` from Pass B1.
    -   The `CPT Bundle`, which may contain constraints on allowed ICD families (`allowed_icd_families`).
-   **Functionality**:
    -   A new database service function will be needed to fetch all specific ICD-10 codes that fall under the identified prefixes.
    -   This list will be cross-referenced with the `allowed_icd_families` from the `EnhancedProcedureCode` object to create a final, filtered list of candidate codes for each CPT.
-   **Outputs**: A filtered list of full ICD-10 codes for each CPT.

### Pass B2: ICD Selection

-   **Goal**: To select the most specific and appropriate ICD-10 codes from the filtered list.
-   **Inputs**:
    -   Clinical note text.
    -   The `CPT Bundle`.
    -   The filtered list of ICD-10 codes from the inter-pass filter.
-   **Functionality**:
    -   This is a new step.
    -   The AI prompt will provide the filtered list of ICD codes to the model and ask it to choose the best-fitting codes for each CPT, based on the full detail of the clinical note.
-   **Outputs**:
    -   For each CPT code, a list of `selected_icd_codes` with `rationale` and `evidence`.
    -   This data will be used to populate the `icd10Linked` field in the `EnhancedProcedureCode` objects within the `StandardizedWorkflowState`.

## 5. Actionable Steps for Agent

1.  **Create `oxkair-shell/lib/agents/icd-agent.ts`**:
    -   Create a new `ICDAgent` class that extends `Agent`.
    -   Implement the `executeInternal` method to orchestrate the two passes and the inter-pass filter.

2.  **Implement Pass B1 (Prefix Identification)**:
    -   Adapt the logic from `runDiagnosisExtraction` in `code-extraction-agent.ts`.
    -   Create a new AI prompt that takes the CPT bundle as input and asks for relevant ICD-10 prefixes.
    -   Define the Zod schema for the output of this pass.

3.  **Implement the Inter-pass Filter**:
    -   Create a new function in a database service file (e.g., `lib/services/database.ts`) to fetch full ICD codes based on a list of prefixes.
    -   Implement the logic to filter these codes against the `allowed_icd_families` from the `EnhancedProcedureCode` objects.

4.  **Implement Pass B2 (ICD Selection)**:
    -   This is a new implementation.
    -   Create a new AI prompt that provides the filtered list of ICD codes and asks the model to make a final selection.
    -   Define the Zod schema for the output.

5.  **Update State Management**:
    -   Ensure the `ICDAgent` correctly populates the `diagnosisCodes` list in the `StandardizedWorkflowState` and links them to the appropriate procedure codes by updating the `icd10Linked` field in the `EnhancedProcedureCode` objects.

6.  **Decommission Diagnosis logic from `CodeExtractionAgent`**:
    -   Once the new `ICDAgent` is complete and integrated, remove the `runDiagnosisExtraction` method from `code-extraction-agent.ts`.
