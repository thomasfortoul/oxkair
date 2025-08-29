# Implementation Plan: State Management and Data Types

## 1. Goal

To adapt the core data structures (`EnhancedProcedureCode`, `EnhancedDiagnosisCode`, `StandardizedWorkflowState`) to support the new enriched data flow from the refactored CPT and ICD agents. This involves adding new fields to store compliance metadata and ensuring the workflow state can accommodate the new multi-step process.

## 2. Key Files

- `TYPES/agent_types.ts`: This file contains the core type definitions that need to be modified.
- `oxkair-shell/lib/workflow/state-manager.ts`: This file manages the workflow state and will need to be updated to handle the new data structures.

## 3. `EnhancedProcedureCode` Updates

The `EnhancedProcedureCode` interface in `TYPES/agent_types.ts` must be updated to become the single source of truth for CPT code metadata, enriched from our database during the CPT agent's execution.

### Current State

The current `EnhancedProcedureCode` interface contains fields for the code, description, units, and evidence, along with linked modifiers and diagnoses.

### Target State

The interface should be expanded to include fields that will be populated from the CPT JSON data source.

### Required Changes

Update the `EnhancedProcedureCode` interface in `TYPES/agent_types.ts` to include the following fields:

```typescript
export interface EnhancedProcedureCode {
  // ... existing fields ...

  /** Official description from the CPT JSON data source */
  officialDesc?: string;

  /** Global period in days (e.g., 0, 10, 90) from CPT JSON */
  globalDays?: number;

  /** MUE (Medically Unlikely Edits) limit from CPT JSON */
  mueLimit?: number;

  /** A list of allowed modifier codes from CPT JSON */
  allowed_modifiers?: string[];

  /** A list of allowed ICD-10 code families/prefixes from CPT JSON */
  allowed_icd_families?: string[];

  /** Flag indicating if the code is a primary procedure or an add-on */
  isPrimary: boolean; // Ensure this is consistently used

  // ... any other relevant fields from the CPT JSON ...
}
```

## 4. `StandardizedWorkflowState` Updates

The `StandardizedWorkflowState` needs to be adjusted to manage the more granular outputs of the new CPT and ICD agents and the new workflow steps.

### Current State

The state manages a single list of `procedureCodes` and `diagnosisCodes`.

### Target State

The state should be able to hold intermediate results from the CPT agent's steps and track the new workflow.

### Required Changes

1.  **Introduce Candidate Procedure Codes**: Add a new field to store the initial candidate CPTs identified in Step A1 of the CPT Agent. This helps in auditing the CPT selection process.

    ```typescript
    export interface StandardizedWorkflowState {
      // ... existing fields ...

      /** Candidate CPTs from the initial extraction step */
      candidateProcedureCodes: EnhancedProcedureCode[];

      /** Final selected procedure codes */
      procedureCodes: EnhancedProcedureCode[];

      // ... existing fields ...
    }
    ```

2.  **Update State Manager Logic**: The `mergeAgentResult` function in `oxkair-shell/lib/workflow/state-manager.ts` will need to be updated to handle the new `candidateProcedureCodes` field and correctly populate the `procedureCodes` field upon completion of the CPT agent pipeline.

## 5. Actionable Steps for Agent

1.  **Modify `TYPES/agent_types.ts`**:
    -   Add the new fields (`officialDesc`, `globalDays`, `mueLimit`, `allowed_modifiers`, `allowed_icd_families`) to the `EnhancedProcedureCode` interface.
    -   Add the `candidateProcedureCodes` field to the `StandardizedWorkflowState` interface.

2.  **Review `oxkair-shell/lib/workflow/state-manager.ts`**:
    -   Analyze the `mergeAgentResult` function to identify where to handle the outputs of the new CPT and ICD agents.
    -   Ensure the logic correctly populates the new fields in the state without overwriting necessary data from previous steps.
