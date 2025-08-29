# Implementation Plan: Modifier Agent Adaptation

## 1. Goal

To adapt the `ModifierAssignmentAgent` to the new agentic workflow. The key change is to make the agent's decision-making process more constrained and accurate by using a pre-filtered list of `allowed_modifiers` that will be available on the `EnhancedProcedureCode` data structure.

## 2. Key Files

-   `oxkair-shell/lib/agents/modifier-assignment-agent.ts`: The agent to be modified.

## 3. Current State

The `ModifierAssignmentAgent` operates in two phases:
-   **Phase 1**: Handles compliance-related modifiers, primarily for CCI/PTP conflicts.
-   **Phase 2**: Handles other, non-compliance (contextual) modifiers.

Currently, the agent considers a broad range of possible modifiers and uses the AI model to determine applicability.

## 4. Target State

The `ModifierAssignmentAgent` will continue to operate in its two-phase structure, but its logic will be enhanced by the new `allowed_modifiers` property on each `EnhancedProcedureCode` object.

### Key Changes

1.  **Filtered Modifier Candidates**:
    -   Before prompting the AI in both Phase 1 and Phase 2, the agent must first retrieve the `allowed_modifiers` list from the `EnhancedProcedureCode` object for the procedure in question.
    -   This list will serve as the **only** source of candidate modifiers for the AI to consider.

2.  **Phase 1 (Compliance Modifiers)**:
    -   The agent will identify the subset of `allowed_modifiers` that are relevant for compliance issues (e.g., modifiers used to bypass PTP edits like `59`, `XE`, `XS`, etc.).
    -   The AI prompt (`buildPhase1ModifierPrompt_Batch`) must be updated to provide **only** this filtered subset of compliance-related modifiers to the model.
    -   The prompt should instruct the model to select a modifier *from this provided list* if one is needed to resolve a CCI issue.

3.  **Phase 2 (Non-compliance Modifiers)**:
    -   The agent will take the remaining `allowed_modifiers` (after excluding those considered in Phase 1).
    -   The AI prompt (`buildPhase2ModifierPrompt_Batch`) must be updated to provide this second subset of contextual modifiers.
    -   The prompt will ask the model to select any applicable modifiers for laterality, site, etc., *from the provided list*.

4.  **State Dependency**:
    -   The agent depends on the `CPTAgent` to have correctly populated the `allowed_modifiers` field and the `CCIAgent` to have provided the `cci_results`. The orchestrator must ensure this execution order.

## 5. Actionable Steps for Agent

1.  **Modify `oxkair-shell/lib/agents/modifier-assignment-agent.ts`**:
    -   In the `executeInternal` method, before calling the Phase 1 and Phase 2 logic, ensure you are retrieving the `EnhancedProcedureCode` objects with the populated `allowed_modifiers` field.

2.  **Update Phase 1 Logic (`runPhase1_MueAndCciProcessing` and `getPhase1Modifiers_Batch`)**:
    -   Inside the logic that prepares the AI prompt, for each procedure, access `proc.allowed_modifiers`.
    -   Create a filtered list of compliance-related modifiers from the `allowed_modifiers`. You will need a predefined list of which modifiers are considered "compliance" modifiers.
    -   Modify the `buildPhase1ModifierPrompt_Batch` function to accept this filtered list and include it in the prompt, instructing the AI to only use modifiers from that list.

3.  **Update Phase 2 Logic (`runPhase2_AncillaryModifierProcessing` and `getPhase2Modifiers_Batch`)**:
    -   Similarly, for each procedure, create a filtered list of non-compliance modifiers from the `allowed_modifiers`.
    -   Modify the `buildPhase2ModifierPrompt_Batch` function to accept this list and incorporate it into the prompt.

4.  **Handle Empty `allowed_modifiers`**:
    -   Ensure the agent has a fallback behavior if the `allowed_modifiers` list is empty or not present on a procedure code. It should log a warning and likely not suggest any modifiers for that code.

5.  **Verify Type Compatibility**:
    -   Ensure all interactions with the `EnhancedProcedureCode` object are compatible with the latest type definitions in `TYPES/agent_types.ts`.
