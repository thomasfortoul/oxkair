# Implementation Plan: LCD Agent Adaptation

## 1. Goal

To adapt the `LCDAgent` to the new agentic workflow. The most significant change is its position in the workflow: it will now execute *after* the `ICDAgent`. This allows the `LCDAgent` to use the final, validated ICD-10 codes as a direct input for determining which Local Coverage Determination (LCD) policies are applicable.

## 2. Key Files

-   `oxkair-shell/lib/agents/lcd-agent.ts`: The agent to be modified.
-   `oxkair-shell/lib/workflow/workflow-orchestrator.ts`: The orchestrator will need to be updated to run the `LCDAgent` after the `ICDAgent`.

## 3. Current State

The `LCDAgent` currently operates on the diagnosis codes that are present in the workflow state. However, in the old workflow, the timing and finality of these codes were less defined.

## 4. Target State

The `LCDAgent` will be a more precise and effective compliance tool. It will be triggered after the `ICDAgent` has finalized the list of diagnosis codes and linked them to the corresponding procedures.

### Key Changes

1.  **Workflow Position**:
    -   The `WorkflowOrchestrator` must be configured to execute the `LCDAgent` only after the `ICDAgent` has successfully completed.

2.  **Input Data**:
    -   The `LCDAgent` will now receive a more reliable set of inputs:
        -   The final list of `EnhancedProcedureCode` objects, which now include linked `EnhancedDiagnosisCode` objects (`icd10Linked`).
        -   The clinical note.
    -   The agent should be updated to primarily use the `icd10Linked` codes on each procedure to fetch the relevant LCD policies.

3.  **Policy Fetching Logic**:
    -   The logic for fetching LCD policies (e.g., `loadApplicableLCDPolicies`) should be reviewed to ensure it correctly uses the final ICD codes from the state.
    -   It should iterate through the selected CPTs and their linked ICDs to gather all applicable policies.

4.  **AI Prompt Enrichment**:
    -   The AI prompt sent by the `LCDAgent` (`evaluatePoliciesWithAI`) should be enriched with the context of both the CPT code and the specific ICD code that triggered the policy check. This will help the AI make a more accurate determination of whether the clinical note supports the procedure for that specific diagnosis.
    -   The prompt should clearly state: \"This policy is being checked because diagnosis code [ICD code] was assigned to justify procedure [CPT code].\"

5.  **Type Compatibility**:
    -   Ensure the agent is fully compatible with the updated `EnhancedProcedureCode` and `EnhancedDiagnosisCode` types defined in `TYPES/agent_types.ts`.

## 5. Actionable Steps for Agent

1.  **Modify `oxkair-shell/lib/agents/lcd-agent.ts`**:
    -   Review the `executeInternal` method to ensure it correctly retrieves the final CPT and ICD codes from the `StandardizedWorkflowState`.
    -   Update the `prepareLCDInput` function (or equivalent) to extract the diagnosis codes from the `icd10Linked` field of each `EnhancedProcedureCode`.
    -   Modify the `buildUserPrompt` function to include the CPT-ICD linkage context in the prompt sent to the AI model.
    -   Verify that all data handling within the agent aligns with the latest type definitions in `TYPES/agent_types.ts`.

2.  **Update `oxkair-shell/lib/workflow/workflow-orchestrator.ts`**:
    -   This is a critical step that will be detailed further in `08_Orchestrator_Changes.md`.
    -   The registration of the `LCDAgent` in the orchestrator must declare a dependency on the `ICDAgent`. This ensures the correct execution order.

3.  **Review LCD Policy Data Service**:
    -   Examine the service responsible for fetching LCD policies. Ensure it can efficiently retrieve policies based on a list of ICD codes. No major changes are anticipated here, but verification is necessary.

## 6. Detailed Implementation Changes

### A. Update LCD Agent to Use Linked ICD Codes

The `LCDAgent` currently extracts diagnosis codes from the `state.diagnosisCodes` field. With the new workflow, diagnosis codes will be linked directly to procedure codes through the `icd10Linked` field. 

The `prepareLCDInput` method needs to be updated to:

```typescript
private prepareLCDInput(state: StandardizedWorkflowState): LCDCheckInput {
  const proceduresEvidence = state.allEvidence.find(
    (e) => (e.content as any)?.type === \"procedure_codes\",
  );

  const evidenceProcs = (proceduresEvidence?.content as any)?.data as
    | EnhancedProcedureCode[]
    | undefined;

  const procedures = evidenceProcs || state.procedureCodes || [];

  // Extract diagnosis codes from the linked ICD codes on each procedure
  const diagnoses: string[] = [];
  procedures.forEach(proc => {
    if (proc.icd10Linked && proc.icd10Linked.length > 0) {
      proc.icd10Linked.forEach(icd => {
        if (!diagnoses.includes(icd.code)) {
          diagnoses.push(icd.code);
        }
      });
    }
  });

  return {
    dateOfService: new Date(state.caseMeta.dateOfService).toISOString(),
    macJurisdiction: \"WI\", // Fixed to Wisconsin as per the plan
    procedures: procedures.map((proc) => ({
      code: proc.code,
      description: proc.description || \"\",
      modifiers: proc.modifiersLinked?.map(m => m.modifier).filter(m => m !== null) as string[] || [],
      units: proc.units || 1,
    })),
    diagnoses: diagnoses, // Updated to use linked ICD codes
    noteText: state.caseNotes.primaryNoteText,
    caseId: state.caseMeta.caseId,
  };
}
```

### B. Enhance AI Prompts with CPT-ICD Context

The `buildUserPrompt` method should be enhanced to provide more context about the CPT-ICD linkage:

```typescript
private async buildUserPrompt(
  input: LCDCheckInput,
  policies: any[],
  logger: WorkflowLogger,
): Promise<string> {
  const policyDetails = policies.map((policy, index) => {
    logger.logDebug(this.name.toString(), \"Processing policy for prompt\", {
      lcdId: policy.lcd_id,
      title: policy.lcd_information?.document_information?.lcd_title,
      hasCoverageGuidance: !!(policy.lcd_information?.coverage_guidance),
      matchedDiagnosisCodes: policy.matchedDiagnosisCodes,
    });

    // Extract coverage guidance directly from the JSON structure
    const coverageGuidance = policy.lcd_information?.coverage_guidance || \"No coverage guidance available\";

    // Get policy metadata
    const policyId = policy.lcd_id || `Policy_${index + 1}`;
    const title = policy.lcd_information?.document_information?.lcd_title || `LCD Policy ${index + 1}`;
    const effectiveDate = policy.lcd_information?.document_information?.original_effective_date || \"Unknown\";
    const matchedCodes = policy.matchedDiagnosisCodes || [];

    logger.logDebug(this.name.toString(), \"Extracted coverage guidance\", {
      policyId,
      coverageGuidanceLength: coverageGuidance.length,
      matchedCodesCount: matchedCodes.length,
    });

    return `
Policy ${index + 1}:
- Policy ID: ${policyId}
- Title: ${title}
- Jurisdiction: WI (Wisconsin)
- Effective Date: ${effectiveDate}
- Matched Diagnosis Codes: ${matchedCodes.join(\", \")}
- Relevance Score: ${policy.score}

Coverage Guidance:
${coverageGuidance}
`;
  });

  // Add context about CPT-ICD linkage
  const cptIcdContext = input.procedures.map(proc => {
    const linkedIcds = proc.icd10Linked || [];
    return `- Procedure ${proc.code}: Linked to ICD codes ${linkedIcds.map(icd => icd.code).join(\", \")}`;
  }).join(\"\\n\");

  return `Please evaluate the following physician note against the provided LCD policies that have been pre-selected based on diagnosis code matches:

**Case Information:**
- Date of Service: ${input.dateOfService}
- MAC Jurisdiction: WI (Wisconsin)
- Procedure Codes: ${input.procedures
        .map(
          (p) =>
            `${p.code}${p.modifiers.length ? ` (${p.modifiers.join(\", \")})` : \"\"}`,
        )
        .join(\", \")}
- Diagnosis Codes: ${input.diagnoses.join(\", \")}

**CPT-ICD Linkage Context:**
${cptIcdContext}

**Physician Note:**
${input.noteText}

**LCD Policies to Evaluate:**
${policyDetails.join(\"\\n---\\n\")}

**Important Notes:**
- Each policy listed above has been pre-selected because it contains coverage criteria that match one or more of the diagnosis codes from this case
- Focus your evaluation on whether the physician note provides adequate documentation to meet the specific coverage criteria outlined in each policy
- Pay special attention to the \"Matched Diagnosis Codes\" for each policy as these indicate why the policy is relevant to this case
- Consider the specific CPT-ICD linkage context when evaluating policy applicability

Please provide your evaluation as a JSON object with an 'evaluations' property containing an array of LCDPolicyEvaluation objects.`;
}
```

### C. Update Policy Loading Logic

The `loadApplicableLCDPolicies` method should be verified to ensure it works correctly with the diagnosis codes extracted from the linked ICD codes. No major changes are expected, but it should be tested to ensure it correctly identifies policies based on the ICD codes.

## 7. Orchestrator Changes

The `WorkflowOrchestrator` needs to be updated to ensure the `LCDAgent` runs after the `ICDAgent`. This involves:

1. Ensuring the `ICDAgent` is registered before the `LCDAgent`
2. Adding a dependency declaration for the `LCDAgent` on the `ICDAgent`

Example of how this might be implemented in the orchestrator setup:

```typescript
// Register ICD Agent first
orchestrator.registerAgent(
  new ICDAgent(),
  WORKFLOW_STEPS.ICD_SELECTION,
  [WORKFLOW_STEPS.CODE_EXTRACTION], // Depends on code extraction
  0,
  false
);

// Register LCD Agent after ICD Agent
orchestrator.registerAgent(
  new LCDAgent(),
  WORKFLOW_STEPS.LCD_COVERAGE,
  [WORKFLOW_STEPS.ICD_SELECTION], // Depends on ICD selection
  0,
  false
);
```

## 8. Testing Considerations

1. Verify that the LCD agent correctly extracts diagnosis codes from the `icd10Linked` field
2. Test with cases that have multiple CPT codes linked to different ICD codes
3. Ensure that policies are correctly fetched based on the linked ICD codes
4. Validate that the enhanced prompts provide sufficient context for accurate policy evaluation
5. Test error handling when no ICD codes are linked to procedures

## 9. Backward Compatibility

The changes should maintain backward compatibility by:
1. Still supporting the old method of extracting diagnosis codes from `state.diagnosisCodes` as a fallback
2. Ensuring that the agent gracefully handles cases where `icd10Linked` is not populated
3. Maintaining the same output format for LCD evaluation results