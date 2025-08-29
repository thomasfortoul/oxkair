# Implementation Plan: CCI Agent Adaptation

## 1. Goal

To adapt the `CCIAgent` to the new agentic workflow. The primary change is to leverage the pre-enriched compliance data (MUE limits and Global Period) that is now part of the `EnhancedProcedureCode` data structure, which is populated by the `CPTAgent`. This will streamline the `CCIAgent` by removing redundant database calls and making the agent's logic more focused.

## 2. Key Files

-   `oxkair-shell/lib/agents/cci-agent.ts`: The agent to be modified.
-   `oxkair-shell/lib/services/cci-data-service.ts`: The service that provides CCI data. Some functions may no longer be needed by this agent.
-   `oxkair-shell/lib/workflow/workflow-orchestrator.ts`: To verify the agent's position in the workflow.

## 3. Dependencies

-   **CPT Agent**: The `CCIAgent` now depends on the `CPTAgent` to have already run and populated the `EnhancedProcedureCode` objects with `mueLimit` and `globalDays` data.
-   **Workflow Orchestrator**: The orchestrator must ensure that the `CCIAgent` runs after the `CPTAgent` and receives the updated `WorkflowState`.

## 4. Data Flow

### Current Data Flow:
```
CCIAgent -> cci-data-service -> Database (for MUE, Global Period, PTP)
```

### Target Data Flow:
```
CPTAgent -> WorkflowState (with enriched EnhancedProcedureCode)
                                |
                                v
CCIAgent -> cci-data-service -> Database (for PTP only)
```

## 5. Current State

The `CCIAgent` currently performs three main validation steps:
1.  `validatePTPEdits`: Checks for Procedure-to-Procedure (PTP) conflicts by fetching CCI edit data.
2.  `validateMUELimits`: Fetches and validates against Medically Unlikely Edits (MUE) limits.
3.  `validateGlobalPeriods`: Fetches and validates against Global Surgical Package rules.

It makes separate calls to a data service (e.g., `CCIDataServiceImpl`) to get the MUE and Global Period data for each procedure code.

## 6. Target State

The `CCIAgent` will be simplified. It will continue to perform PTP validation by querying the CCI database, but it will source MUE and Global Period data directly from the `EnhancedProcedureCode` objects passed to it in the workflow state.

### Key Changes

1.  **MUE Validation**:
    -   The `validateMUELimits` function will no longer fetch MUE data from the `cciDataService`.
    -   It will instead read the `mueLimit` property directly from each `EnhancedProcedureCode` object in the state.
    -   The validation logic will remain the same: compare `claimed_units` against the `mueLimit`.

2.  **Global Period Validation**:
    -   The `validateGlobalPeriods` function will no longer fetch Global Period data.
    -   It will read the `globalDays` property from each `EnhancedProcedureCode` object.
    -   The validation logic will remain the same, checking for conflicts based on the `globalDays`.

3.  **PTP Validation**:
    -   The `validatePTPEdits` function will remain largely unchanged, as PTP edits are pairwise and need to be checked dynamically against the full set of procedures in the case. It will continue to use the `cciDataService` to get PTP edit pairs.

4.  **Data Service Pruning (Optional)**:
    -   The functions in `cci-data-service.ts` for fetching MUE (`getMUEForCode`) and Global Period (`getGlobalPeriodForCode`) data will no longer be called by the `CCIAgent`.
    -   As per the refactor plan, we can prune these calls from the agent but should not delete the service functions themselves, as they may be useful elsewhere.

## 7. Actionable Steps

1.  **Modify `oxkair-shell/lib/agents/cci-agent.ts`**:
    -   Locate the `validateMUELimits` function.
        -   Remove the call to `cciDataService.getMUEForCode`.
        -   Update the logic to access `proc.mueLimit` from the `EnhancedProcedureCode` object (`proc`).
    -   Locate the `validateGlobalPeriods` function.
        -   Remove the call to `cciDataService.getGlobalPeriodForCode`.
        -   Update the logic to access `proc.globalDays` from the `EnhancedProcedureCode` object.
    -   Review the `executeInternal` method to ensure the `EnhancedProcedureCode` objects are correctly passed to these validation functions.
    -   Ensure that the agent gracefully handles cases where `mueLimit` or `globalDays` might be missing on a procedure code object, although the new `CPTAgent` should ensure this data is present. Add logging for such cases.

2.  **Verify Data Flow**:
    -   Confirm that the `CPTAgent` is correctly populating the `mueLimit` and `globalDays` fields on the `EnhancedProcedureCode` objects before the `CCIAgent` is executed in the `WorkflowOrchestrator`.

3.  **Review `cci-data-service.ts`**:
    -   Confirm that the `getMUEForCode` and `getGlobalPeriodForCode` functions are no longer called from within `cci-agent.ts`. No further action is needed on the service file itself.

## 8. Verification Steps

1.  **Unit Tests**:
    -   Update or create unit tests for `cci-agent.ts` to reflect the new data sourcing.
    -   Mock the `WorkflowState` with `EnhancedProcedureCode` objects containing `mueLimit` and `globalDays` and verify that the validation logic works as expected.
    -   Test edge cases, such as when `mueLimit` or `globalDays` are null or undefined.

2.  **Integration Tests**:
    -   Run the full workflow and inspect the state passed to the `CCIAgent` to ensure it contains the enriched data from the `CPTAgent`.
    -   Verify that the `CCIAgent` produces the correct validation results based on the pre-enriched data.

## 9. Documentation

-   Update any inline comments in `cci-agent.ts` to reflect the new logic.
-   Ensure that the agent's documentation (if any) is updated to reflect its new dependencies and data flow.
-   Once the changes are implemented and verified, update this document to reflect the completion of the task.