# Implementation Plan: CPT Agent Migration

## 1. Goal

To refactor the existing `CodeExtractionAgent` into a new, multi-step `CPTAgent`. This new agent will be responsible for identifying CPT code candidates, selecting the final CPT codes, and identifying necessary add-on codes. This approach will improve accuracy by incorporating explicit database fetches for data enrichment between steps.

## 2. Key Files

-   `oxkair-shell/lib/agents/code-extraction-agent.ts`: The current agent to be refactored.
-   A new file will be created for the `CPTAgent`: `oxkair-shell/lib/agents/cpt-agent.ts`.

## 3. Current State

The `CodeExtractionAgent` is a monolithic agent that performs diagnosis extraction, procedure extraction, and CPT mapping in a single, complex flow. It uses three main internal methods:
-   `runDiagnosisExtraction`
-   `runProcedureExtraction`
-   `runCptMapping`

This agent will be decomposed. The diagnosis-related logic will be moved to the new `ICDAgent`, and the procedure and CPT mapping logic will be evolved into the new `CPTAgent`.

## 4. Target State: The 3-Step `CPTAgent`

The new `CPTAgent` will execute in three distinct steps, with database fetches in between to enrich the data.

### Step A1: Candidate CPT Extraction

-   **Goal**: To analyze the clinical note and extract a summary of the procedure performed, and identify a potential range of CPT codes.
-   **Inputs**:
    -   Clinical note text.
    -   Procedure extraction prompt.
-   **Functionality**:
    -   This step will be based on the existing `runProcedureExtraction` method in `CodeExtractionAgent`.
    -   The AI prompt should be updated to focus solely on extracting a `procedure_summary`, `laterality`, `approach`, and a `candidate_cpt_range`.
    -   It should **not** attempt to select the final CPT code.
-   **Outputs**:
    -   `procedure_summary`: A concise narrative of the procedure.
    -   `candidate_cpt_range`: A list or range of potential CPT codes.

### Inter-step DB Fetch: Primary CPT Candidates

-   **Goal**: To fetch detailed information for the candidate CPT codes from the database.
-   **Inputs**: `candidate_cpt_range` from Step A1.
-   **Functionality**:
    -   A new database service function will be needed to fetch CPT data based on a range.
    -   This function will retrieve the official description and other compliance-related flags for each primary CPT code in the range.
-   **Outputs**: A list of primary CPT candidates with their descriptions.

### Step A2: CPT Selection

-   **Goal**: To select the exact primary CPT code(s) from the candidates based on the clinical note.
-   **Inputs**:
    -   Clinical note text.
    -   `procedure_summary` from Step A1.
    -   The list of primary CPT candidates from the database fetch.
-   **Functionality**:
    -   This step is similar to the current `runCptMapping` but is simplified. It will not deal with ICD codes. USE THE SAME LANGUAGE AND DETAILS THOUGH.
    -   The AI prompt will instruct the model to select the best-fitting CPT code(s) and provide a `selection_rationale` and `evidence`.
    -   A new output field, `require_addons` (boolean), should be added to the AI output schema to indicate if add-on codes might be necessary.
-   **Outputs**:
    -   A list of selected primary CPT codes, each with `cpt_code`, `selection_rationale`, `evidence`, `claimed_units`, and `require_addons`.

### Inter-step DB Fetch: Add-on Candidates

-   **Goal**: To retrieve all potential add-on codes for the selected primary CPTs.
-   **Inputs**: The list of selected `cpt_code`s from Step A2.
-   **Functionality**:
    -   A new database service function will query our CPT data to find all linked add-on codes for the given primary codes.
-   **Outputs**: A list of add-on CPT candidates with their official descriptions.

### Step A3: CPT Add-On Selection

-   **Goal**: To determine which, if any, of the candidate add-on codes apply.
-   **Inputs**:
    -   Clinical note text.
    -   The selected primary CPTs and their rationales from Step A2.
    -   The list of add-on CPT candidates.
-   **Functionality**:
    -   This is a new step. The AI prompt will ask the model to review the clinical note and the rationale for the primary CPT selection to decide which add-on codes are justified.
-   **Outputs**:
    -   A list of selected add-on codes, each with `cpt_code`, `rationale`, `evidence`, and `claimed_units`.
    -   The final output of the `CPTAgent` will be a fully enriched `EnhancedProcedureCode` object for each selected primary and add-on code.

## 5. Implementation Status: COMPLETED ✅

The CPT Agent migration has been successfully completed with the following implementations:

### ✅ **Created `oxkair-shell/lib/agents/cpt-agent.ts`**:
- ✅ New `CPTAgent` class that extends `Agent`
- ✅ Implemented `executeInternal` method to orchestrate the three steps and inter-step database fetches
- ✅ Added to agent exports in `oxkair-shell/lib/agents/index.ts`

### ✅ **Implemented Step A1 (Candidate Extraction)**:
- ✅ Created `runCandidateExtraction` method adapted from `runProcedureExtraction` logic
- ✅ Implemented focused prompt for candidate extraction (`createCandidateExtractionPrompt`)
- ✅ Defined Zod schema `CandidateExtractionSchema` for output validation

### ✅ **Implemented Database Fetch for Primary CPTs**:
- ✅ Created `fetchPrimaryCptCandidates` method to fetch CPT details for a given range
- ✅ Includes unlisted code detection and Azure storage integration
- ✅ Enhanced error handling and logging

### ✅ **Implemented Step A2 (CPT Selection)**:
- ✅ Created `runCptSelection` method adapted from `runCptMapping` logic
- ✅ Implemented focused prompt for CPT selection (`createCptSelectionPrompt`)
- ✅ Added `require_addons` field to output schema as specified
- ✅ Defined Zod schema `CptSelectionSchema` for output validation

### ✅ **Implemented Database Fetch for Add-on CPTs**:
- ✅ Created `fetchAddOnCandidates` method to fetch linked add-on codes
- ✅ Implemented pattern-based add-on code discovery
- ✅ Includes filtering for actual add-on codes based on descriptions

### ✅ **Implemented Step A3 (Add-On Selection)**:
- ✅ Created `runAddOnSelection` method (new implementation)
- ✅ Implemented prompt for add-on selection (`createAddOnSelectionPrompt`)
- ✅ Defined Zod schema `AddOnSelectionSchema` for output validation

### ✅ **Enhanced Data Transformation**:
- ✅ Implemented `transformToEnhancedProcedureCodes` method
- ✅ Properly handles both primary and add-on codes
- ✅ Enriches data with CPT metadata (globalDays, mueLimit, allowed_modifiers, etc.)
- ✅ Maintains compatibility with existing `EnhancedProcedureCode` interface

## 6. Key Features Implemented

### **Type Safety & Validation**
- All steps use Zod schemas for robust input/output validation
- Proper TypeScript typing throughout the implementation
- Error handling with `ProcessingError` and severity levels

### **Database Integration**
- Azure Storage Service integration for CPT code retrieval
- Efficient batch processing of code ranges
- Unlisted code detection and inclusion
- Comprehensive logging for audit trails

### **AI Prompt Engineering**
- Step-specific prompts optimized for each task
- Clear separation of concerns between extraction, selection, and add-on identification
- Evidence-based reasoning with rationale requirements

### **Performance & Monitoring**
- Detailed logging at each step
- Performance metrics tracking
- Graceful error handling and recovery

## 7. Next Steps

The CPT Agent is now ready for integration into the workflow orchestrator. The next phase should focus on:

1. **Integration Testing**: Test the new CPT Agent in isolation and with mock data
2. **Orchestrator Integration**: Update the WorkflowOrchestrator to use the new CPTAgent
3. **Legacy Code Cleanup**: Remove CPT-related logic from `CodeExtractionAgent` once integration is complete
4. **ICD Agent Implementation**: Proceed with implementing the new ICD Agent as outlined in `03_ICD_Agent_Implementation.md`
