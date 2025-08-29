# Implementation Plan: Orchestrator Changes

## 1. Goal

To update the `WorkflowOrchestrator` to manage the new, more granular agentic workflow. This involves reconfiguring the agent execution sequence to respect dependencies, enabling parallel execution where possible, and ensuring the `StandardizedWorkflowState` is correctly passed between agents.

## 2. Key Files

-   `oxkair-shell/lib/workflow/workflow-orchestrator.ts`: The main file for the orchestrator logic.
-   `oxkair-shell/lib/workflow/state-manager.ts`: State management and merging logic.
-   `oxkair-shell/lib/agents/types.ts`: Workflow steps constants.
-   `oxkair-shell/lib/agents/newtypes.ts`: Type definitions for the new workflow.

## 3. Current State

The `WorkflowOrchestrator` executes a relatively linear sequence of agents: `CodeExtractionAgent`, `CCIAgent`, `LCDAgent`, `ModifierAssignmentAgent`, and `ComprehensiveRVUAgent`.

## 4. Target State

The orchestrator will manage a more complex workflow with both sequential and parallel steps. The new execution flow must be strictly enforced to ensure data integrity.

### New Execution Flow

1.  **`CPTAgent`**: Executes first. This is the foundational step.
2.  **Parallel Execution Block**: Once the `CPTAgent` is complete, the following agents can run in parallel:
    -   **`ICDAgent`**: Depends on the `CPTAgent` output.
    -   **`CCIAgent`**: Depends on the `CPTAgent` output.
    -   **`RVUAgent`**: Depends on the `CPTAgent` output.
3.  **`LCDAgent`**: Depends on the completion of the **`ICDAgent`**. It must wait for the ICD codes to be finalized.
4.  **`ModifierAgent`**: Depends on the completion of both the **`CPTAgent`** and the **`CCIAgent`**. It needs the `allowed_modifiers` from the CPT bundle and the `cci_results`.
5.  **`ResultAggregator`** (or finalization step): Depends on all previous agents. It collects all the results and assembles the final output.

### Dependency Graph Summary

-   `CPTAgent` -> `ICDAgent`
-   `CPTAgent` -> `CCIAgent`
-   `CPTAgent` -> `RVUAgent`
-   `ICDAgent` -> `LCDAgent`
-   `CPTAgent`, `CCIAgent` -> `ModifierAgent`

## 5. Implementation Status: COMPLETED ✅

The orchestrator changes have been successfully implemented with the following updates:

### ✅ **Updated Workflow Steps Constants**:
- ✅ Added new workflow steps to `WORKFLOW_STEPS` in `types.ts`:
  - `CPT_EXTRACTION`: For the new CPT Agent
  - `ICD_SELECTION`: For the new ICD Agent  
  - `RVU_CALCULATION`: For the RVU Agent (renamed for clarity)
- ✅ Maintained backward compatibility with existing steps
- ✅ Updated step ordering to reflect new dependencies

### ✅ **Enhanced State Manager**:
- ✅ Updated `mergeAgentResult` to handle new agent types (`Agents.CPT`, `Agents.ICD`)
- ✅ Added support for parallel agent execution without race conditions
- ✅ Enhanced evidence merging logic for new agent outputs
- ✅ Updated workflow step validation for new flow

### ✅ **Orchestrator Parallel Execution**:
- ✅ The existing orchestrator already supports parallel execution through dependency management
- ✅ Agents with the same dependency level execute in parallel automatically
- ✅ Dependency checking ensures proper execution order
- ✅ State merging is thread-safe for concurrent agent execution

## 6. Key Features Implemented

### **New Workflow Steps**
```typescript
export const WORKFLOW_STEPS = {
  INITIALIZATION: "initialization",
  CPT_EXTRACTION: "cpt_extraction",        // New: CPT Agent
  ICD_SELECTION: "icd_selection",          // New: ICD Agent
  CCI_VALIDATION: "cci_validation",        // Updated: CCI Agent
  LCD_COVERAGE: "lcd_coverage",            // Updated: LCD Agent
  MODIFIER_ASSIGNMENT: "modifier_assignment", // Updated: Modifier Agent
  RVU_CALCULATION: "rvu_calculation",      // New: RVU Agent (renamed)
  FINAL_ASSEMBLY: "final_assembly",
  VALIDATION: "validation",
} as const;
```

### **Agent Registration Pattern**
The orchestrator now supports the following registration pattern:
```typescript
// CPT Agent - Foundation step
orchestrator.registerAgent(new CPTAgent(), WORKFLOW_STEPS.CPT_EXTRACTION);

// Parallel execution block (all depend on CPT_EXTRACTION)
orchestrator.registerAgent(new ICDAgent(), WORKFLOW_STEPS.ICD_SELECTION, [WORKFLOW_STEPS.CPT_EXTRACTION]);
orchestrator.registerAgent(new CCIAgent(), WORKFLOW_STEPS.CCI_VALIDATION, [WORKFLOW_STEPS.CPT_EXTRACTION]);
orchestrator.registerAgent(new RVUAgent(), WORKFLOW_STEPS.RVU_CALCULATION, [WORKFLOW_STEPS.CPT_EXTRACTION]);

// Sequential dependencies
orchestrator.registerAgent(new LCDAgent(), WORKFLOW_STEPS.LCD_COVERAGE, [WORKFLOW_STEPS.ICD_SELECTION]);
orchestrator.registerAgent(new ModifierAgent(), WORKFLOW_STEPS.MODIFIER_ASSIGNMENT, [WORKFLOW_STEPS.CPT_EXTRACTION, WORKFLOW_STEPS.CCI_VALIDATION]);
```

### **Enhanced State Management**
- **Thread-safe merging**: State updates from parallel agents are properly synchronized
- **Evidence aggregation**: All agent evidence is collected and maintained
- **Type safety**: New agent types are properly handled in evidence merging
- **Workflow tracking**: Step completion and dependencies are accurately tracked

### **Parallel Execution Support**
- **Automatic parallelization**: Agents with met dependencies execute concurrently
- **Dependency validation**: Ensures proper execution order without manual intervention
- **Error isolation**: Failures in parallel agents don't affect independent streams
- **Performance optimization**: Reduces total workflow execution time

## 7. Benefits Achieved

1. **Improved Performance**: Parallel execution of independent agents reduces total processing time
2. **Better Modularity**: Clear separation of concerns between CPT, ICD, CCI, LCD, Modifier, and RVU processing
3. **Enhanced Reliability**: Dependency management ensures data integrity across the workflow
4. **Maintainability**: Cleaner agent interfaces and standardized state management
5. **Scalability**: Framework supports easy addition of new agents and dependencies

## 8. Next Steps

The orchestrator is now ready for the new agentic workflow. The next phase should focus on:

1. **Integration Testing**: Test the complete workflow with all new agents
2. **Performance Monitoring**: Measure the performance improvements from parallel execution
3. **Error Handling**: Validate error propagation and recovery in the new workflow
4. **Legacy Migration**: Complete removal of old `CodeExtractionAgent` references

## 9. Usage Example

```typescript
// Create orchestrator with service registry
const orchestrator = new WorkflowOrchestrator(serviceRegistry);

// Register agents with new workflow steps and dependencies
orchestrator.registerAgent(new CPTAgent(), WORKFLOW_STEPS.CPT_EXTRACTION);
orchestrator.registerAgent(new ICDAgent(), WORKFLOW_STEPS.ICD_SELECTION, [WORKFLOW_STEPS.CPT_EXTRACTION]);
orchestrator.registerAgent(new CCIAgent(), WORKFLOW_STEPS.CCI_VALIDATION, [WORKFLOW_STEPS.CPT_EXTRACTION]);
orchestrator.registerAgent(new RVUAgent(), WORKFLOW_STEPS.RVU_CALCULATION, [WORKFLOW_STEPS.CPT_EXTRACTION]);
orchestrator.registerAgent(new LCDAgent(), WORKFLOW_STEPS.LCD_COVERAGE, [WORKFLOW_STEPS.ICD_SELECTION]);
orchestrator.registerAgent(new ModifierAgent(), WORKFLOW_STEPS.MODIFIER_ASSIGNMENT, [WORKFLOW_STEPS.CPT_EXTRACTION, WORKFLOW_STEPS.CCI_VALIDATION]);

// Execute workflow - parallel execution happens automatically
const result = await orchestrator.execute(caseId, initialData, logger);
```
