# Documentation: CCI Agent Refactor

## 1. Overview

This document outlines the recent refactoring of the **CCI Agent** (`cci-agent.ts`). The primary goal of this change was to streamline the agent's logic, reduce redundant database calls, and align it with the new, more efficient agentic workflow where data is progressively enriched as it moves through the pipeline.

## 2. The Core Change: Shifting Data Responsibility

The fundamental change is the source of compliance data, specifically **Medically Unlikely Edits (MUE) limits** and **Global Surgical Package periods**.

### Previous Data Flow

Previously, the `CCIAgent` was responsible for fetching all of its own data. For each procedure code it processed, it made separate calls to the `CCIDataService` to retrieve MUE limits and Global Period information.

```
CCIAgent -> CCIDataService -> Database (fetches MUE data)
         -> CCIDataService -> Database (fetches Global Period data)
         -> CCIDataService -> Database (fetches PTP edit data)
```

This resulted in multiple, potentially redundant, database lookups for the same procedure codes that might have already been processed by an upstream agent.

### New, Refactored Data Flow

In the new workflow, the responsibility for fetching core CPT-related data is centralized in the upstream **CPT Agent** (`cpt-agent.ts`). The `CCIAgent` now consumes this pre-enriched data directly from the workflow state.

```
CPTAgent -> Fetches CPT data (including MUE/Global) -> Enriches WorkflowState
                                                            |
                                                            v
CCIAgent -> Reads MUE/Global data from WorkflowState
         -> CCIDataService -> Database (fetches PTP edit data only)
```

## 3. How It Works Now

1.  **Data Enrichment by CPTAgent**: The `CPTAgent` runs first in the pipeline. As it processes and validates CPT codes, it fetches their comprehensive details from the database, including `mueLimit` and `globalDays`. It populates these values into the `EnhancedProcedureCode` objects within the `WorkflowState`.

2.  **CCIAgent Consumes Enriched Data**: The `WorkflowOrchestrator` passes the enriched state to the `CCIAgent`.

3.  **Simplified Validation Logic**:
    -   The `validateMUELimits` function no longer calls the data service. It now reads the `mueLimit` property directly from each procedure code object (`proc.mueLimit`).
    -   Similarly, the `validateGlobalPeriods` function reads the `globalDays` property (`proc.globalDays`) from the procedure code object.
    -   The separate function `addGlobalPeriodToProcedureCodes` was redundant and has been removed entirely.

4.  **Focused PTP Validation**: The agent's responsibility for Procedure-to-Procedure (PTP) validation remains unchanged. This is because PTP edits are pairwise and must be checked dynamically against the specific combination of codes present in the current case. The agent continues to use the `CCIDataService` for this specific task.

## 4. Benefits of the Refactor

-   **Efficiency**: Eliminates redundant database calls, as CPT data is now fetched only once by the `CPTAgent`.
-   **Separation of Concerns**: The `CPTAgent` is now the single source of truth for CPT code data, while the `CCIAgent` is more focused on its core task of applying compliance rules.
-   **Maintainability**: The code in `CCIAgent` is simpler and easier to understand, as the data-fetching logic has been removed.
-   **Performance**: Reduces the overall processing time for the compliance step by removing I/O latency.
