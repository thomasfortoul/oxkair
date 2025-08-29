# Refactoring Plan: Agentic System Migration

## 1. Overview

This document outlines the implementation plan for refactoring the existing medical coding workflow into a more robust, modular, and auditable agentic system. The goal is to improve accuracy, maintainability, and transparency of the coding process.

The core of this refactor involves decomposing the monolithic `CodeExtractionAgent` into a multi-step **CPT Agent** and a new two-pass **ICD Agent**. This separation allows for more focused AI prompts, better data enrichment from our database, and clearer decision-making logic.

Downstream agents (`CCI`, `LCD`, `Modifier`, `RVU`) will be adapted to consume the enriched data structures produced by the new CPT and ICD agents.

## 2. Core Objectives

- **Modularity**: Decompose the primary code extraction logic into independent, single-responsibility agents (CPT and ICD).
- **Data Enrichment**: Introduce explicit database fetch steps between agent prompts to enrich the context with up-to-date information (e.g., allowed modifiers, global periods, MUE limits) directly into the data structures.
- **Transparency & Auditability**: Ensure each agent produces clear `rationale` and `evidence` for its decisions, which will be persisted in the final case output.
- **State Management**: Standardize the workflow state and data types to ensure seamless handoffs between agents.
- **Workflow Orchestration**: Update the `WorkflowOrchestrator` to manage the new sequential and parallel execution paths.

## 3. Key Changes by Component

| Component | Change Description |
| :--- | :--- |
| **Data Types** | Update `EnhancedProcedureCode` to include new fields from the CPT JSON data source (e.g., `globalDays`, `mueLimit`, `allowed_modifiers`). |
| **State Management** | The `StandardizedWorkflowState` will be updated to reflect the new data structures and track the more granular steps of the new workflow. |
| **CPT Agent** | The existing `CodeExtractionAgent` will be refactored into a 3-step process for CPT extraction, selection, and add-on identification. |
| **ICD Agent** | A new, 2-pass agent will be created to handle ICD code identification and selection, ensuring medical necessity for the selected CPTs. |
| **CCI Agent** | Will be adapted to use pre-enriched MUE and Global Period data from the `EnhancedProcedureCode` structure, removing redundant DB calls. |
| **LCD Agent** | Will run *after* the ICD Agent to perform compliance checks against the selected diagnosis codes. |
| **Modifier Agent** | Will be updated to use a pre-filtered list of `allowed_modifiers` from the `EnhancedProcedureCode` structure. |
| **RVU Agent** | No major functional changes, but will be updated to ensure compatibility with the new data types. |
| **Orchestrator** | The `WorkflowOrchestrator` will be reconfigured to manage the new agent sequence, including parallel execution of the CCI and RVU agents. |

## 4. Implementation Documentation

The following documents provide detailed, actionable instructions for implementing the changes for each component:

- `01_State_Management_and_Data_Types.md`
- `02_CPT_Agent_Migration.md`
- `03_ICD_Agent_Implementation.md`
- `04_CCI_Agent_Adaptation.md`
- `05_LCD_Agent_Adaptation.md`
- `06_Modifier_Agent_Adaptation.md`
- `07_RVU_Agent_Adaptation.md`
- `08_Orchestrator_Changes.md`
