# Standardized Types Implementation

This document explains the new standardized types implementation for the Qwen system, based on the newFlow.md implementation plan. The goal is to create a consistent, efficient communication system between agents while reducing unnecessary data transformations.

## Overview

The new standardized types system introduces a unified approach to evidence handling and agent communication. All agents now use the same evidence format, which includes:

1. Standardized evidence structure with verbatim evidence, rationale, and flexible content
2. Consistent agent result formats
3. Enhanced medical data structures with JSON metadata
4. Unified workflow state management

## Key Improvements

### 1. Standardized Evidence Format

All agents now use a consistent evidence format:

```typescript
interface StandardizedEvidence {
  evidenceType: string;
  verbatimEvidence: string[];
  rationale: string;
  content?: Record<string, any>;
  source: string;
  confidence: number;
  timestamp: Date;
}
```

Benefits:
- Eliminates redundant evidence types (LCDEvidence, CodeExtractionEvidence, etc.)
- Provides a consistent way to attach supporting information
- Makes evidence searchable and analyzable
- Reduces cognitive load for developers

### 2. Consistent Agent Results

All agents return results in a standardized format:

```typescript
interface StandardizedAgentResult {
  success: boolean;
  evidence: StandardizedEvidence[];
  errors?: ProcessingError[];
  metadata: {
    executionTime: number;
    confidence: number;
    version: string;
    agentName: string;
    [key: string]: any;
  };
}
```

Benefits:
- Uniform error handling across all agents
- Consistent metadata tracking
- Easier result processing and aggregation
- Better debugging and monitoring capabilities

### 3. Enhanced Medical Data Structures

Procedure and diagnosis codes now include rich metadata from CPT JSON:

```typescript
interface EnhancedProcedureCode {
  code: string;
  description: string;
  units: number;
  evidence: StandardizedEvidence[];
  source: "CPT_JSON" | "EVIDENCE" | "MANUAL";
  
  // Fields from CPT JSON
  jsonUrl?: string;
  officialDesc?: string;
  shortDesc?: string;
  statusCode?: string;
  globalDays?: string;
  mue?: number;
  modifierIndicators?: string;
  teamAssistCoSurgeonAllowed?: boolean;
  // ... additional JSON fields
}
```

Benefits:
- Reduced external lookups by embedding JSON data
- Richer context for decision making
- Better audit trail with source information
- Improved code selection accuracy

### 4. Unified Workflow State

The workflow state now uses standardized structures:

```typescript
interface StandardizedWorkflowState {
  caseMeta: { /* ... */ };
  caseNotes: { /* ... */ };
  demographics: { /* ... */ };
  procedureCodes: EnhancedProcedureCode[];
  diagnosisCodes: EnhancedDiagnosisCode[];
  // ... other fields
}
```

Benefits:
- Consistent data access across agents
- Reduced data transformation overhead
- Better type safety
- Easier state management

## Implementation Details

### New Files

1. `lib/agents/standardized-types.ts` - Contains all new standardized types
2. Updated `lib/agents/types.ts` - Extended existing types with standardized versions

### Migration Strategy

1. Existing agents continue to work with current types for backward compatibility
2. New agents should use standardized types
3. Gradual migration of existing agents to standardized types
4. Type aliases and extensions maintain compatibility

### Evidence Handling

The new evidence system replaces multiple specialized evidence types with a single, flexible format:

**Before:**
```typescript
type Evidence = 
  | GenericEvidence
  | CCIEvidence
  | LCDEvidence
  | CodeExtractionEvidence
  // ... many more types
```

**After:**
```typescript
type Evidence = StandardizedEvidence | /* backward compatibility types */;
```

This simplifies evidence processing and makes it easier to add new evidence types.

## Benefits for the New Implementation Plan

### 1. Reduced Data Transformations

With standardized types, agents no longer need to convert between different data formats. The CPT JSON data flows directly through the system with minimal transformation.

### 2. Better JSON Integration

The `EnhancedProcedureCode` interface directly supports the CPT JSON metadata, allowing agents to access rich code information without additional lookups.

### 3. Improved Modifier Processing

The `StandardizedModifier` interface provides a consistent structure for modifier information, making the two-phase modifier assignment more reliable.

### 4. Enhanced Audit Trail

All evidence is now captured in a consistent format, making it easier to trace decisions through the workflow.

## Usage Examples

### Creating Standardized Evidence

```typescript
const evidence: StandardizedEvidence = {
  evidenceType: "procedure_code_support",
  verbatimEvidence: [
    "Patient received intralesional steroid injection for treatment of warts",
    "Seven lesions were treated with triamcinolone acetonide 5mg/mL"
  ],
  rationale: "Documented procedure matches CPT code 11900 for intralesional injection",
  content: {
    cptCode: "11900",
    lesionCount: 7,
    medication: "triamcinolone acetonide"
  },
  source: "CodeExtractionAgent",
  confidence: 0.95,
  timestamp: new Date()
};
```

### Returning Standardized Results

```typescript
const result: StandardizedAgentResult = {
  success: true,
  evidence: [evidence],
  metadata: {
    executionTime: 1250,
    confidence: 0.95,
    version: "1.0.0",
    agentName: "CodeExtractionAgent"
  }
};
```

## Future Improvements

1. Gradually migrate all existing agents to use standardized types
2. Remove backward compatibility types in future major release
3. Enhance evidence search and analysis capabilities
4. Add evidence validation and quality scoring
5. Implement evidence-based decision auditing

This standardized types system provides a solid foundation for the new implementation plan while maintaining backward compatibility and setting the stage for future improvements.