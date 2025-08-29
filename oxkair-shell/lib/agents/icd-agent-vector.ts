/**
 * ICD Vector Agent - RAG-based ICD-10 code extraction
 *
 * This agent replaces the traditional 2-step ICD extraction process with a single
 * RAG-based approach using Azure AI Search vector database. It directly extracts
 * ICD-10 diagnosis codes using the vector database as the authoritative source.
 */

import { z } from "zod";

import {
  StandardizedAgentContext,
} from "./newtypes.ts";
import { Agent } from "./agent-core.ts";
import { 
  Notes, 
  StandardizedEvidence, 
  EnhancedDiagnosisCode, 
  EnhancedProcedureCode,
  Agents,
  StandardizedAgentResult,
  ProcessingError,
  ProcessingErrorSeverity,
  StandardizedWorkflowState,
} from "./newtypes.ts";
import { IcdVectorSearchResult } from "../services/service-types.ts";

// ============================================================================
// ICD VECTOR AGENT SCHEMAS AND TYPES
// ============================================================================

// IcdVectorSearchResult is imported from vector-search-service.ts

// ============================================================================
// ICD VECTOR AGENT IMPLEMENTATION
// ============================================================================

export class ICDAgent extends Agent {
  readonly name = "icd_agent";
  readonly description =
    "Extracts ICD-10 diagnosis codes from clinical notes using RAG-based vector database search";
  readonly requiredServices = ["aiModel", "vectorSearchService"] as const;

  async executeInternal(
    context: StandardizedAgentContext,
  ): Promise<StandardizedAgentResult> {
    const { logger, state } = context;
    const { caseId } = state.caseMeta;
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const startTime = Date.now();

    logger.logInfo(this.name, `ICD Vector Agent execution started for case: ${caseId}`);

    try {
      // Validate that we have CPT codes from the CPT Agent
      if (!state.procedureCodes || state.procedureCodes.length === 0) {
        const error = this.createError(
          "No procedure codes available for ICD linking. CPT Agent must run first.",
          ProcessingErrorSeverity.CRITICAL
        );
        return this.createFailureResult([error], evidence, Date.now() - startTime);
      }

      // Get Full Note Text
      const fullNoteText = [
        state.caseNotes.primaryNoteText,
        ...state.caseNotes.additionalNotes.map((note) => note.content),
      ].join("\n\n");

      // Single RAG-based extraction using vector database
      logger.logInfo(this.name, "Starting RAG-based ICD extraction");
      const vectorResult = await this.runVectorExtraction(context, fullNoteText, state.procedureCodes);

      // Transform results to EnhancedDiagnosisCode format
      const finalDiagnosisCodes = await this.transformToEnhancedDiagnosisCodes(
        context,
        vectorResult.diagnoses,
        state.procedureCodes
      );

      // Update the workflow state with the selected diagnosis codes
      this.updateWorkflowState(state, finalDiagnosisCodes);

      // Create evidence
      if (finalDiagnosisCodes.length > 0) {
        evidence.push(
          this.createEvidence(
            finalDiagnosisCodes.flatMap((d) =>
              d.evidence.flatMap((e) => e.verbatimEvidence)
            ),
            "Extracted ICD-10 diagnosis codes using RAG vector search",
            1.0,
            Notes.OPERATIVE,
            { diagnosisCodes: finalDiagnosisCodes },
          ),
        );
      }

      const executionTime = Date.now() - startTime;
      const overallConfidence = this.calculateOverallConfidence(evidence);

      if (evidence.length === 0) {
        errors.push(this.createError("No ICD codes were extracted using vector search.", ProcessingErrorSeverity.MEDIUM));
        return this.createFailureResult(errors, evidence, executionTime);
      }

      logger.logInfo(this.name, "ICD Vector Agent execution completed", {
        totalDiagnosisCodes: finalDiagnosisCodes.length,
        linkedProcedureCodes: state.procedureCodes.filter(p => p.icd10Linked && p.icd10Linked.length > 0).length,
        diagnosisCodes: finalDiagnosisCodes.map(d => ({ code: d.code, description: d.description })),
      });

      logger.logPerformanceMetrics(this.name, {
        executionTime,
        diagnosisCodesExtracted: finalDiagnosisCodes.length,
      });

      return this.createSuccessResult(evidence, executionTime, overallConfidence, {
        diagnosisCodes: finalDiagnosisCodes,
        linkedProcedures: state.procedureCodes.length,
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("Error in ICDVectorAgent:", error);
      const processingError = this.createError(
        error instanceof Error ? error.message : "An unknown error occurred during vector-based ICD extraction.",
        ProcessingErrorSeverity.CRITICAL
      );
      return this.createFailureResult([processingError], evidence, executionTime);
    }
  }

  /**
   * Performs RAG-based ICD extraction using vector database search
   */
  private async runVectorExtraction(
    context: StandardizedAgentContext,
    fullNoteText: string,
    cptBundle: EnhancedProcedureCode[]
  ): Promise<IcdVectorSearchResult> {
    const { logger, services } = context;

    try {
      // Log the full prompt context being sent to the AI vector search
      const cptCodesFormatted = cptBundle.map(cpt => `- ${cpt.code}: ${cpt.description}`).join('\n');
      
      logger.logInfo(this.name, "ICD Vector Search - Full Prompt Logging", {
        promptType: "ICD_EXTRACTION_PROMPT",
        noteLength: fullNoteText.length,
        cptCodesCount: cptBundle.length,
        notePreview: fullNoteText.substring(0, 200) + (fullNoteText.length > 200 ? '...' : ''),
        cptCodesForLinking: cptCodesFormatted,
        systemPromptSummary: "Expert medical coder specializing in ICD-10-CM diagnosis coding for medical necessity",
        promptDetails: {
          authority: "RAG system (icd index) as single source of truth",
          extractionLogic: "Identify diagnoses for medical necessity, extract diagnostic attributes, apply medical necessity rules",
          outputFormat: "Strict JSON with diagnoses array containing id, icdCode, linkedCptCode, evidence, rationale, details, keyFactors, confidence"
        }
      });

      logger.logDebug(this.name, "ICD Vector Search - Complete Input Context", {
        fullNoteText: fullNoteText,
        noteCharacterCount: fullNoteText.length,
        noteWordCount: fullNoteText.split(/\s+/).length,
        cptBundleDetails: cptBundle.map(cpt => ({
          code: cpt.code,
          description: cpt.description,
          isPrimary: cpt.isPrimary,
          units: cpt.units
        }))
      });

      const result: IcdVectorSearchResult = await this.loggedApiCall(
        context,
        "vectorSearchService",
        "extractDiagnosesWithRAGWithFallback",
        () => services.vectorSearchService.extractDiagnosesWithRAGWithFallback(fullNoteText, cptBundle),
        { noteLength: fullNoteText.length, cptCodesCount: cptBundle.length }
      );

      // Log the complete AI response before validation
      logger.logInfo(this.name, "ICD Vector Search - Complete AI Response", {
        responseType: "RAW_AI_OUTPUT",
        rawResponse: result,
        responseSize: JSON.stringify(result).length,
        responseStructure: {
          hasDiagnoses: result && typeof result === 'object' && 'diagnoses' in result,
          diagnosesCount: result && typeof result === 'object' && 'diagnoses' in result && Array.isArray(result.diagnoses) ? result.diagnoses.length : 0
        }
      });

      // Result is already validated by the vector search service

      logger.logInfo(this.name, "ICD Vector Search - Validated Results", {
        diagnosesExtracted: result.diagnoses.length,
        diagnoses: result.diagnoses.map(d => ({
          id: d.id,
          icdCode: d.icdCode,
          linkedCptCode: d.linkedCptCode,
          confidence: d.confidence || "medium",
          evidence: d.evidence.substring(0, 150) + (d.evidence.length > 150 ? '...' : ''),
          rationale: d.rationale.substring(0, 150) + (d.rationale.length > 150 ? '...' : ''),
          details: d.details.substring(0, 100) + (d.details.length > 100 ? '...' : ''),
          keyFactors: d.keyFactors
        })),
        validationSuccess: true
      });

      // Log detailed extraction results for easy searching
      result.diagnoses.forEach((diagnosis, index) => {
        logger.logInfo(this.name, `ICD Diagnosis ${index + 1} - Detailed Extraction`, {
          diagnosisIndex: index + 1,
          icdCode: diagnosis.icdCode,
          linkedCptCode: diagnosis.linkedCptCode,
          confidence: diagnosis.confidence || "medium",
          fullEvidence: diagnosis.evidence,
          fullRationale: diagnosis.rationale,
          fullDetails: diagnosis.details,
          keyFactors: diagnosis.keyFactors,
          medicalNecessityJustification: `ICD ${diagnosis.icdCode} establishes medical necessity for CPT ${diagnosis.linkedCptCode}`
        });
      });

      return result;
    } catch (error) {
      logger.logError(this.name, "ICD Vector Search - Extraction Failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        noteLength: fullNoteText.length,
        cptCodesCount: cptBundle.length,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Vector-based ICD extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Transforms the vector search results into EnhancedDiagnosisCode format
   */
  private async transformToEnhancedDiagnosisCodes(
    context: StandardizedAgentContext,
    diagnoses: IcdVectorSearchResult['diagnoses'],
    cptBundle: EnhancedProcedureCode[]
  ): Promise<EnhancedDiagnosisCode[]> {
    const { logger } = context;
    const finalCodes: EnhancedDiagnosisCode[] = [];

    for (const diagnosis of diagnoses) {
      // Find the linked CPT code
      const linkedCptCode = cptBundle.find(cpt => cpt.code === diagnosis.linkedCptCode);
      if (!linkedCptCode) {
        logger.logWarn(this.name, `CPT code ${diagnosis.linkedCptCode} not found in bundle for ICD ${diagnosis.icdCode}`);
        continue;
      }

      // Add dummy confidence if not present to avoid breaking later types
      const confidence = diagnosis.confidence || "medium";

      const enhancedDiagnosisCode: EnhancedDiagnosisCode = {
        code: diagnosis.icdCode,
        description: diagnosis.details,
        linkedCptCode: diagnosis.linkedCptCode,
        evidence: [
          this.createEvidence(
            [diagnosis.evidence],
            diagnosis.rationale,
            this.mapConfidenceToNumber(confidence),
            Notes.OPERATIVE,
          ),
        ],
      };

      finalCodes.push(enhancedDiagnosisCode);

      // Link the diagnosis code to the CPT code
      if (!linkedCptCode.icd10Linked) {
        linkedCptCode.icd10Linked = [];
      }
      linkedCptCode.icd10Linked.push(enhancedDiagnosisCode);
    }

    logger.logInfo(this.name, "Transformed to EnhancedDiagnosisCode format", {
      totalCodes: finalCodes.length,
      linkedCptCodes: [...new Set(finalCodes.map(d => d.linkedCptCode))].length
    });

    return finalCodes;
  }

  /**
   * Updates the workflow state with the selected diagnosis codes
   */
  private updateWorkflowState(
    state: StandardizedWorkflowState,
    diagnosisCodes: EnhancedDiagnosisCode[]
  ): void {
    // Update the diagnosisCodes array in the workflow state
    state.diagnosisCodes = diagnosisCodes;

    // Update the workflow history
    state.history.push({
      agentName: this.name,
      timestamp: new Date(),
      action: "icd_code_selection",
      result: "success",
      details: {
        totalDiagnosisCodes: diagnosisCodes.length,
        linkedProcedureCodes: state.procedureCodes.filter(p => p.icd10Linked && p.icd10Linked.length > 0).length,
      },
    });

    // Update metadata
    state.updatedAt = new Date();
  }

  /**
   * Maps confidence string to number
   */
  private mapConfidenceToNumber(confidence: "high" | "medium" | "low"): number {
    switch (confidence) {
      case "high": return 0.9;
      case "medium": return 0.7;
      case "low": return 0.5;
      default: return 0.5;
    }
  }

  /**
   * Calculates overall confidence based on all evidence
   */
  private calculateOverallConfidence(evidence: StandardizedEvidence[]): number {
    if (evidence.length === 0) return 0;

    const confidences = evidence.map((e) => e.confidence);
    const average = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;

    // Apply penalty for low evidence count
    const evidencePenalty = Math.min(evidence.length / 3, 1);

    return Math.max(0, Math.min(1, average * evidencePenalty));
  }
}