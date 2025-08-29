# Agents and Workflow - Expanded Documentation

This document provides a detailed overview of the AI agent-based workflow in the Qwen system, including the orchestrator, state management, and individual agent responsibilities. It expands upon the basic documentation with implementation details, data flows, and technical specifications.

## 1. Workflow Orchestrator

The AI workflow is managed by the `WorkflowOrchestrator`, a class responsible for executing a series of agents in a predefined order.

*   **Location**: `oxkair-shell/lib/workflow/workflow-orchestrator.ts`
*   **Implementation Details**:
    *   Manages agent registration with dependencies and priority levels
    *   Handles execution timeouts and retry policies
    *   Implements error handling with configurable policies ("fail-fast", "continue", "skip", "skip-dependents")
    *   Tracks execution metrics and performance monitoring
    *   Maintains execution history and state transitions
*   **Configuration Options**:
    *   `maxConcurrentJobs`: Controls parallel execution (default: 1)
    *   `defaultTimeout`: Overall workflow timeout (default: 300,000ms/5 minutes)
    *   `retryPolicy`: Configurable retry logic with backoff
    *   `errorPolicy`: Defines how execution errors are handled
*   **Agent Registration Process**:
    *   Agents are registered with a specific workflow step
    *   Dependencies between agents are tracked
    *   Priority levels determine execution order within a step
    *   Optional agents can be marked to allow workflow continuation on failure
*   **Execution Flow**:
    1. Initialize workflow state with provided data
    2. Validate initial state requirements
    3. Create execution plan based on registered agents and dependencies
    4. Execute agents in priority order within each workflow step
    5. Merge agent results into workflow state
    6. Handle errors according to configured policy
    7. Perform final state validation
    8. Generate execution summary and metrics

## 2. Entry Point and Data Flow

The workflow is initiated from a server-side action, which prepares the initial data and invokes the orchestrator.

*   **Primary Entry Point**: `oxkair-shell/app/actions/process-case.ts`
*   **Secondary Entry Point**: `oxkair-shell/app/coder/lib/orchestratorProcessing.ts`
*   **Data Flow**:
    1.  The `processOperativeNoteAction` function is called with the case notes and metadata.
    2.  Input data is transformed into `CaseNotes` and `CaseMeta` formats.
    3.  The `processCaseWithOrchestrator` function is called, which sets up the `WorkflowOrchestrator`.
    4.  Agents are registered using the `agent-factory.ts` module.
    5.  The orchestrator executes the agent pipeline, passing the `WorkflowState` object to each agent.
    6.  Each agent reads from and writes to the `WorkflowState`, adding its results to the `allEvidence` array.
    7.  After all agents have run, the final `WorkflowState` is transformed into the `AiRawOutput` format and saved to the database.
*   **Progress Tracking**: Real-time progress updates are provided during execution
*   **Error Handling**: Comprehensive error handling with detailed logging and metrics collection

## 3. Workflow State Management

The `WorkflowState` is the central data object that is passed between agents. It contains all the information about the case being processed.

*   **Type Definition**: `oxkair-shell/lib/agents/types.ts`
*   **State Manager**: `oxkair-shell/lib/workflow/state-manager.ts`
*   **Key Properties**:
    *   `caseMeta`: Metadata about the case (e.g., `caseId`, `dateOfService`).
    *   `caseNotes`: The medical notes for the case.
    *   `demographics`: Patient demographic information.
    *   `procedureCodes`: A list of `ProcedureCode` objects extracted from the notes.
    *   `diagnosisCodes`: A list of `DiagnosisCode` objects extracted from the notes.
    *   `hcpcsCodes`: A list of HCPCS codes (supplies, drugs, etc.).
    *   `cciResult`: The results of the CCI validation.
    *   `lcdResult`: The results of the LCD validation.
    *   `finalModifiers`: A list of `FinalModifier` objects assigned to the procedure codes.
    *   `claimSequence`: Organized claim data for billing.
    *   `rvuResult`: RVU calculations and payment estimates.
    *   `allEvidence`: An array of `Evidence` objects, where each agent stores its results.
    *   `errors`: Collection of processing errors encountered.
    *   `history`: Execution history and state transitions.
*   **State Operations**:
    *   `initializeState()`: Creates initial workflow state
    *   `mergeAgentResult()`: Integrates agent results into state
    *   `validateState()`: Validates state integrity at different stages
    *   `extractAllEvidence()`: Consolidates all evidence for final output
    *   `updateWorkflowStep()`: Tracks workflow progress
*   **Evidence Handling**:
    *   All agent outputs are stored as evidence objects
    *   Evidence is categorized by type for easy retrieval
    *   Evidence includes confidence scores and source tracking
    *   Historical evidence is maintained throughout processing

## 4. Agent Pipeline

The following agents are executed in sequence by the orchestrator:

### 4.1 `CodeExtractionAgent`

*   **Location**: `oxkair-shell/lib/agents/code-extraction-agent.ts`
*   **Description**: Extracts procedure and diagnosis codes from the medical notes using a three-stage AI pipeline.
*   **Execution Steps**:
    1.  **Input Validation**: Validates case notes and metadata
    2.  **Full Note Text Assembly**: Combines primary and additional notes
    3.  **Diagnosis Extraction Pipeline**: 
        *   Uses `diagnosisExtractionPrompt` to extract ICD-10 diagnoses
        *   Identifies negation, temporality, body site, and laterality
        *   Maps to ICD-10 code candidates with confidence scoring
    4.  **Procedure Extraction Pipeline**:
        *   Uses `procedureExtractionPrompt` to identify procedures
        *   Extracts anatomical sites, approaches, and key factors
        *   Determines CPT code ranges for each procedure
    5.  **CPT Mapping Pipeline**:
        *   Uses `cptMappingPrompt` to select final CPT codes
        *   Retrieves CPT code data from Azure storage
        *   Matches procedures to specific CPT codes with evidence
    6.  **Result Assembly**: Combines diagnosis and procedure results
    7.  **Evidence Generation**: Creates evidence objects for state update
*   **Inputs**: 
    *   `caseNotes` from `WorkflowState`
    *   Azure Storage Service for CPT code data
    *   AI Model Service for LLM processing
*   **Outputs**: 
    *   Adds `procedure_codes` and `diagnosis_codes` evidence to `allEvidence`
    *   Populates `procedureCodes` and `diagnosisCodes` in workflow state
    *   Links evidence text to specific code selections
*   **AI Prompts**:
    *   `diagnosisExtractionPrompt`: Specialized for ICD-10 extraction with context
    *   `procedureExtractionPrompt`: Designed for CPT procedure identification
    *   `cptMappingPrompt`: Optimized for final code selection with evidence
*   **Data Sources**:
    *   Azure Storage: CPT code databases (`CPT/{code}.json`)
    *   Unlisted codes database for range extension
*   **Processing Time**: ~15-30 seconds depending on note complexity
*   **Confidence Scoring**: Evidence-based confidence ratings for all extractions
*   **Error Handling**: Graceful degradation with partial results on failures

### 4.2 `CCIAgent`

*   **Location**: `oxkair-shell/lib/agents/cci-agent.ts`
*   **Description**: Validates procedure codes against CCI (Correct Coding Initiative) edits, MUE (Medically Unlikely Edits) limits, and Global Surgical Package rules.
*   **Execution Steps**:
    1.  **Prerequisite Validation**: Checks for required metadata and codes
    2.  **Service Type Determination**: Classifies as hospital or practitioner setting
    3.  **PTP (Procedure-to-Procedure) Validation**:
        *   Checks for CCI bundling conflicts
        *   Validates modifier requirements for bypass
        *   Flags conflicts with appropriate severity levels
    4.  **MUE (Medically Unlikely Edits) Validation**:
        *   Verifies unit counts against MUE limits
        *   Checks MAI (Modifier Adjudication Indicator) rules
        *   Flags violations with service type considerations
    5.  **Global Surgical Package Validation**:
        *   Identifies global period implications
        *   Flags procedures with 10-day or 90-day globals
        *   Suggests appropriate modifiers for bypass
    6.  **Global Period Data Addition**: Adds global period info to procedure codes
    7.  **Summary Calculation**: Aggregates all validation results
    8.  **Evidence Generation**: Creates detailed evidence objects
*   **Inputs**: 
    *   `procedureCodes` from `WorkflowState`
    *   `caseMeta` for date of service and patient information
    *   CCIDataService for CCI/MUE/Global data
    *   PatientHistoryService for historical data (future)
*   **Outputs**: 
    *   Adds `cci_result`, `ptp_violation`, `mue_violation`, `global_violation` evidence
    *   Populates `cciResult` in workflow state
    *   Updates procedure codes with global period information
*   **Data Sources**:
    *   CCI Edits Database: Procedure bundling rules
    *   MUE Database: Unit count limitations
    *   Global Period Database: Surgical package information
*   **Validation Rules**:
    *   Modifier Indicator 0: No bypass allowed
    *   Modifier Indicator 1: Specific modifiers allowed
    *   Modifier Indicator 2: Only -59 or X modifiers allowed
    *   MAI Rules: Different handling for MAI 1, 2, 3
*   **Processing Time**: ~5-15 seconds depending on code count
*   **Error Handling**: Continues processing on data retrieval failures

### 4.3 `LCDAgent`

*   **Location**: `oxkair-shell/lib/agents/lcd-agent.ts`
*   **Description**: Checks for coverage under Local Coverage Determinations (LCDs) by evaluating the medical necessity of procedures based on the provided diagnosis codes and clinical documentation.
*   **Execution Steps**:
    1.  **Input Validation**: Validates required data (procedures, diagnoses, notes)
    2.  **LCD Policy Loading**:
        *   Loads state-specific LCD policies from Azure storage
        *   Filters policies based on diagnosis code matches
        *   Retrieves full policy content for matching policies
    3.  **Policy Evaluation with AI**:
        *   Uses AI to evaluate note against LCD coverage criteria
        *   Assesses evidence sufficiency for each policy requirement
        *   Determines overall coverage status (Pass/Fail/Unknown)
    4.  **Result Synthesis**: Combines AI evaluations into comprehensive results
    5.  **Evidence Generation**: Creates LCD evaluation evidence
*   **Inputs**: 
    *   `procedureCodes`, `diagnosisCodes`, and `caseNotes` from `WorkflowState`
    *   Azure Storage Service for LCD policy data
    *   AI Model Service for policy evaluation
*   **Outputs**: 
    *   Adds `lcd_result` evidence to `allEvidence`
    *   Populates `lcdResult` in workflow state
    *   Provides detailed policy evaluations and recommendations
*   **AI Prompts**:
    *   System prompt: Specialized for LCD policy expertise
    *   User prompt: Contains note text and relevant policies
    *   Structured output schema for consistent results
*   **Data Sources**:
    *   Azure Storage: State-specific LCD policies (`LCD/{state}.json`)
    *   Azure Storage: Individual policy details (`LCD/pages/{policy_id}.json`)
*   **Processing Time**: ~10-25 seconds depending on policy count
*   **Fallback Handling**: Graceful degradation when policies unavailable

### 4.4 `ModifierAssignmentAgent`

*   **Location**: `oxkair-shell/lib/agents/modifier-assignment-agent.ts`
*   **Description**: Assigns appropriate modifiers to procedure codes based on the results of the CCI and LCD agents, as well as other clinical context from the notes. Uses a two-phase approach for comprehensive modifier assignment.
*   **Execution Steps**:
    1.  **Input Validation**: Validates procedure codes and previous results
    2.  **Phase 1 - MUE and CCI Processing**:
        *   Processes MUE violations based on MAI rules
        *   Handles unit truncation or splitting as needed
        *   Assigns distinct-service modifiers (XE/XS/XP/XU/59) for CCI conflicts
        *   Uses AI to determine documentation sufficiency for bypass
    3.  **Phase 2 - Ancillary Modifier Processing**:
        *   Assigns non-distinct-service modifiers (22, 25, 50, 52, etc.)
        *   Identifies assistant surgeon and team surgery modifiers
        *   Determines laterality and reduced service modifiers
    4.  **Validation**: Ensures modifier combinations are valid
    5.  **Evidence Generation**: Creates detailed modifier evidence
*   **Inputs**: 
    *   `procedureCodes`, `cciResult`, `lcdResult`, and `caseNotes` from `WorkflowState`
    *   AI Model Service for modifier assignment decisions
    *   Cache Service for performance optimization
*   **Outputs**: 
    *   Adds modifier assignment evidence to `allEvidence`
    *   Populates `finalModifiers` in workflow state
    *   Updates claim sequence with modifier information
*   **Two-Phase Processing**:
    *   **Phase 1**: Distinct-service modifiers (bundling bypass)
    *   **Phase 2**: Ancillary modifiers (clinical circumstances)
*   **AI Prompts**:
    *   Phase 1 Prompt: Specialized for distinct-service modifier assignment
    *   Phase 2 Prompt: Focused on ancillary modifier identification
    *   Structured schemas for consistent modifier data
*   **Modifier Rules**:
    *   XE: Separate encounter
    *   XS: Separate structure
    *   XP: Separate practitioner
    *   XU: Unusual non-overlapping service
    *   59: Distinct procedural service (fallback)
    *   Ancillary modifiers for clinical circumstances
*   **Processing Time**: ~20-45 seconds depending on code count and complexity
*   **Evidence Validation**: Verifies quoted evidence exists in original notes

### 4.5 `ComprehensiveRVUAgent`

*   **Location**: `oxkair-shell/lib/agents/comprehensive-rvu-agent.ts`
*   **Description**: Calculates Relative Value Units (RVUs) for each procedure code, applying adjustments for geographic location and modifiers. It also sequences the codes for optimal reimbursement using AI-powered analysis.
*   **Execution Steps**:
    1.  **Input Validation**: Validates procedure codes and demographics
    2.  **Contractor Determination**: Identifies Medicare contractor based on location
    3.  **Data Loading**: Retrieves RVU and GPCI data from Azure storage
    4.  **Base RVU Calculation**: Determines base work, PE, and MP RVUs
    5.  **Geographic Adjustment**: Applies GPCI factors for location
    6.  **Modifier Adjustment**: Applies modifier-based RVU adjustments
    7.  **Code Sequencing**: Orders codes for optimal reimbursement
    8.  **Payment Calculation**: Computes estimated payment amounts
    9.  **Threshold Checking**: Flags unusual values for review
    10. **Evidence Generation**: Creates RVU calculation evidence
*   **Inputs**: 
    *   `procedureCodes` and `finalModifiers` from `WorkflowState`
    *   `demographics` for geographic adjustments
    *   RVUDataService for RVU/GPCI data
    *   Azure Storage Service for data files
    *   AI Model Service for sequencing optimization
*   **Outputs**: 
    *   Adds `rvu_result` and `rvu_calculation` evidence to `allEvidence`
    *   Populates `rvuResult` and `rvuCalculations` in workflow state
    *   Updates claim sequence with payment information
*   **Data Sources**:
    *   HCPCS RVU Database: Base RVU values
    *   GPCI Database: Geographic adjustment factors
    *   Locality Crosswalk: Contractor to locality mapping
*   **Calculations**:
    *   Base RVU: Work + PE + MP components
    *   Geographic Adjustment: Base RVU × GPCI factors
    *   Modifier Adjustment: Additional RVU modifications
    *   Payment: Adjusted RVU × Conversion Factor
*   **AI Sequencing**: Optimizes code order for maximum reimbursement
*   **Processing Time**: ~15-30 seconds depending on code count
*   **Error Handling**: Fallback to national averages on data issues

## 5. Service Architecture

The agents depend on various services for data retrieval and processing:

### 5.1 Core Services

*   **AI Model Service**: Provides LLM access for all AI-based processing
*   **Azure Storage Service**: Handles all file-based data retrieval
*   **Cache Service**: Optimizes performance with caching strategies
*   **Performance Monitor**: Tracks execution metrics and performance
*   **Logger Service**: Centralized logging and audit trail

### 5.2 Data Services

*   **CCI Data Service**: Manages CCI/MUE/Global period data
*   **Patient History Service**: Handles historical patient data
*   **RVU Data Service**: Manages RVU and geographic data
*   **Retrieval Service**: Handles policy and guideline retrieval

## 6. Data Flow and Storage

### 6.1 Azure Storage Structure

*   `CPT/`: CPT code databases and descriptions
*   `LCD/`: Local Coverage Determination policies by state
*   `LCD/pages/`: Individual LCD policy documents
*   `RVU/`: RVU values, GPCI factors, and locality data

### 6.2 Database Integration

*   Results are stored in the `medical_notes` table
*   `ai_raw_output` contains the complete agent processing results
*   `final_processed_data` contains the curated output for UI
*   Evidence and audit trails are maintained for compliance

## 7. Error Handling and Recovery

### 7.1 Error Categories

*   **Processing Errors**: Issues during agent execution
*   **Data Errors**: Missing or invalid data sources
*   **Service Errors**: Unavailable external dependencies
*   **Validation Errors**: Failed state validation checks

### 7.2 Recovery Strategies

*   **Retry Logic**: Configurable retries with exponential backoff
*   **Graceful Degradation**: Partial results on non-critical failures
*   **Fallback Data**: Default values when primary data unavailable
*   **Circuit Breaker**: Protection against cascading failures

## 8. Performance and Monitoring

### 8.1 Performance Metrics

*   Execution time per agent
*   Total workflow duration
*   AI model usage and costs
*   Data retrieval performance
*   Error rates and patterns

### 8.2 Monitoring Capabilities

*   Real-time progress tracking
*   Detailed execution logging
*   Performance profiling
*   Error analysis and reporting
*   Service health checks

## Update Checklist

*   [ ] Update this document when a new agent is added or an existing one is modified.
*   [ ] Ensure that the agent pipeline is documented in the correct order.
*   [ ] Add any new key properties to the `WorkflowState` description.
*   [ ] Verify that the entry point and data flow are still accurate.
*   [ ] Update service architecture documentation when services change.
*   [ ] Maintain current performance and monitoring information.