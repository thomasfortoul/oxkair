
Last updated: 2025-08-21 12:00 UTC

# Agents and Workflow

This document provides a detailed overview of the AI agent-based workflow in the Qwen system, including the orchestrator, state management, and individual agent responsibilities.

## 1. Workflow Orchestrator

The AI workflow is managed by the `WorkflowOrchestrator`, a class responsible for executing a series of agents in a predefined order.

*   **Location**: `oxkair-shell/lib/workflow/workflow-orchestrator.ts`
*   **Responsibilities**:
    *   Registering agents for different steps in the workflow.
    *   Executing agents in the correct order based on their dependencies.
    *   Managing the overall state of the workflow via the `WorkflowState` object.
    *   Handling errors, retries, and timeouts.

## 2. Entry Point and Data Flow

The workflow is initiated from a server-side action, which prepares the initial data and invokes the orchestrator.

*   **Entry Point**: `oxkair-shell/app/actions/process-case.ts`
*   **Data Flow**:
    1.  The `processOperativeNoteAction` function is called with the case notes and metadata.
    2.  Input data is transformed into `CaseNotes` and `CaseMeta` formats.
    3.  The `processCaseWithOrchestrator` function is called, which sets up the `WorkflowOrchestrator`.
    4.  Agents are registered using the `agent-factory.ts` and `orchestratorProcessing.ts` modules.
    5.  The orchestrator executes the agent pipeline, passing the `WorkflowState` object to each agent.
    6.  Each agent reads from and writes to the `WorkflowState`, adding its results to the `allEvidence` array.
    7.  After all agents have run, the final `WorkflowState` is transformed into the `AiRawOutput` format and saved to the database.

## 3. Workflow State

The `WorkflowState` is the central data object that is passed between agents. It contains all the information about the case being processed.

*   **Type Definition**: `oxkair-shell/lib/agents/types.ts`
*   **Key Properties**:
    *   `caseMeta`: Metadata about the case (e.g., `caseId`, `dateOfService`).
    *   `caseNotes`: The medical notes for the case.
    *   `procedureCodes`: A list of `ProcedureCode` objects extracted from the notes.
    *   `diagnosisCodes`: A list of `DiagnosisCode` objects extracted from the notes.
    *   `cciResult`: The results of the CCI validation.
    *   `lcdResult`: The results of the LCD validation.
    *   `finalModifiers`: A list of `FinalModifier` objects assigned to the procedure codes.
    *   `allEvidence`: An array of `Evidence` objects, where each agent stores its results.

## 4. Agent Pipeline

The following agents are executed in sequence by the orchestrator:

### 4.1 `CodeExtractionAgent`

*   **Location**: `oxkair-shell/lib/agents/code-extraction-agent.ts`
*   **Inputs**: `caseNotes` from `WorkflowState`.
*   **Outputs**: Adds `procedure_codes` and `diagnosis_codes` evidence to `allEvidence`.
*   **Description**: Extracts procedure and diagnosis codes from the medical notes using a three-stage AI pipeline.

### 4.2 `CCIAgent`

*   **Location**: `oxkair-shell/lib/agents/cci-agent.ts`
*   **Inputs**: `procedureCodes` from `WorkflowState`.
*   **Outputs**: Adds `cci_result` evidence to `allEvidence`.
*   **Description**: Validates procedure codes against CCI (Correct Coding Initiative) edits, MUE (Medically Unlikely Edits) limits, and Global Surgical Package rules.

### 4.3 `LCDAgent`

*   **Location**: `oxkair-shell/lib/agents/lcd-agent.ts`
*   **Inputs**: `procedureCodes`, `diagnosisCodes`, and `caseNotes` from `WorkflowState`.
*   **Outputs**: Adds `lcd_result` evidence to `allEvidence`.
*   **Description**: Checks for coverage under Local Coverage Determinations (LCDs) by evaluating the medical necessity of procedures based on the provided diagnosis codes and clinical documentation.

### 4.4 `ModifierAssignmentAgent`

*   **Location**: `oxkair-shell/lib/agents/modifier-assignment-agent.ts`
*   **Inputs**: `procedureCodes`, `cciResult`, `lcdResult`, and `caseNotes` from `WorkflowState`.
*   **Outputs**: Adds `final_modifiers` evidence to `allEvidence`.
*   **Description**: Assigns appropriate modifiers to procedure codes based on the results of the CCI and LCD agents, as well as other clinical context from the notes.

### 4.5 `ComprehensiveRVUAgent`

*   **Location**: `oxkair-shell/lib/agents/comprehensive-rvu-agent.ts`
*   **Inputs**: `procedureCodes` and `finalModifiers` from `WorkflowState`.
*   **Outputs**: Adds `rvu_result` evidence to `allEvidence`.
*   **Description**: Calculates Relative Value Units (RVUs) for each procedure code, applying adjustments for geographic location and modifiers. It also sequences the codes for optimal reimbursement.

---

## Update Checklist

*   [ ] Update this document when a new agent is added or an existing one is modified.
*   [ ] Ensure that the agent pipeline is documented in the correct order.
*   [ ] Add any new key properties to the `WorkflowState` description.
*   [ ] Verify that the entry point and data flow are still accurate.
