/**
 * CPT Vector Agent - RAG-based CPT code extraction
 *
 * This agent replaces the traditional 3-step CPT extraction process with a single
 * RAG-based approach using Azure AI Search vector database. It directly extracts
 * CPT codes using the vector database as the authoritative source.
 */

import { z } from "zod";

import {
  LoggedAgentExecutionContext,
  ERROR_CODES,
} from "./types.ts";
import { Agent } from "./agent-core.ts";
import { 
  Notes, 
  StandardizedEvidence, 
  EnhancedProcedureCode, 
  Agents,
  StandardizedAgentResult,
  ProcessingError,
  ProcessingErrorSeverity,
} from "./newtypes.ts";
import { 
  CodeDataInsights, 
  EnhancedCPTCodeData, 
  parseGlobalDays 
} from "../services/service-types.ts";
import { cptMappingPrompt } from "./prompts/code-extraction-prompts.ts";
import { AIModelService } from "../services/ai-model-service.ts";
import { UNLISTED_CPT_CODES, isUnlistedCode } from "../constants/unlisted-codes.ts";

// ============================================================================
// CPT VECTOR AGENT SCHEMAS AND TYPES
// ============================================================================

// Vector search result schema for candidate codes
const VectorSearchResultSchema = z.object({
  procedures: z.array(z.object({
    id: z.string(),
    candidateCodes: z.array(z.string().regex(/^\d{5}$/)).min(1),
    addOn: z.boolean(),
    linkedPrimaryId: z.string().nullable(),
    evidence: z.string().min(1),
    rationale: z.string().min(1),
    details: z.string().min(1),
    keyFactors: z.array(z.string()),
    units: z.number().positive().int().optional().default(1)
  })).min(1)
});

type VectorSearchResult = z.infer<typeof VectorSearchResultSchema>;

// Final CPT selection result schema
const FinalCPTSelectionSchema = z.object({
  procedureCodes: z.array(z.object({
    elementName: z.string(),
    code: z.string().regex(/^\d{5}$/),
    units: z.number().positive().int(),
    evidence: z.array(z.string()),
    linkedDiagnoses: z.array(z.string()),
    modifierExplanation: z.string().optional(), // Made optional since we're not using it
    rationale: z.string()
  }))
});

type FinalCPTSelectionResult = z.infer<typeof FinalCPTSelectionSchema>;

interface CptCodeData {
  code: string;
  title: string;
  summary: string;
  commonLanguageDescription?: string;
  globalDays?: string;
  mueLimit?: number;
  allowed_modifiers?: string[];
  allowed_icd_families?: string[];
  codeDataInsights?: CodeDataInsights;
}

interface EnrichedCandidateCode {
  code: string;
  officialDescription: string;
  commonLanguageDescription?: string;
}

interface EnrichedProcedureWithUnlisted {
  id: string;
  candidateCodes: string[];
  addOn: boolean;
  linkedPrimaryId: string | null;
  evidence: string;
  rationale: string;
  details: string;
  keyFactors: string[];
  units: number;
  enrichedCandidates: EnrichedCandidateCode[];
  unlistedCodes: EnrichedCandidateCode[];
}

// ============================================================================
// CPT VECTOR AGENT IMPLEMENTATION
// ============================================================================

export class CPTAgent extends Agent {
  readonly name = "cpt_agent";
  readonly description =
    "Extracts CPT procedure codes from clinical notes using RAG-based vector database search";
  readonly requiredServices = ["vectorSearchService", "azureStorageService"] as const;

  async executeInternal(
    context: LoggedAgentExecutionContext,
  ): Promise<StandardizedAgentResult> {
    const { logger, state } = context;
    const { caseId } = state.caseMeta;
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const startTime = Date.now();

    logger.logInfo(this.name, `CPT Vector Agent execution started for case: ${caseId}`);

    try {
      // Get Full Note Text
      const fullNoteText = [
        state.caseNotes.primaryNoteText,
        ...state.caseNotes.additionalNotes.map((note) => note.content),
      ].join("\n\n");

      // Step 1: RAG-based extraction to get candidate codes
      logger.logInfo(this.name, "Starting RAG-based CPT candidate extraction");
      const vectorResult = await this.runVectorExtraction(context, fullNoteText);

      // Step 2: Fetch official descriptions for all candidate codes
      logger.logInfo(this.name, "Fetching official descriptions for candidate codes");
      const enrichedCandidates = await this.enrichCandidateCodes(context, vectorResult.procedures);

      // Step 3: Final CPT selection using o4-mini
      logger.logInfo(this.name, "Performing final CPT code selection");
      const finalSelection = await this.performFinalCPTSelection(context, enrichedCandidates, fullNoteText);

      // Transform results to EnhancedProcedureCode format
      const finalProcedureCodes = await this.transformFinalSelectionToEnhancedProcedureCodes(
        context,
        finalSelection,
        vectorResult.procedures
      );

      // Create evidence
      if (finalProcedureCodes.length > 0) {
        evidence.push(
          this.createEvidence(
            finalProcedureCodes.flatMap((p) =>
              p.evidence.flatMap((e) => e.verbatimEvidence)
            ),
            "Extracted CPT procedure codes using RAG vector search",
            1.0,
            Notes.OPERATIVE,
            { procedureCodes: finalProcedureCodes },
          ),
        );
      }

      const executionTime = Date.now() - startTime;
      const overallConfidence = this.calculateOverallConfidence(evidence);

      if (evidence.length === 0) {
        errors.push(this.createError("No CPT codes were extracted using vector search.", ProcessingErrorSeverity.MEDIUM));
        return this.createFailureResult(errors, evidence, executionTime);
      }

      logger.logInfo(this.name, "CPT Vector Agent execution completed", {
        totalProcedureCodes: finalProcedureCodes.length,
        primaryCodes: finalProcedureCodes.filter(p => p.isPrimary).length,
        addOnCodes: finalProcedureCodes.filter(p => !p.isPrimary).length,
        procedureCodes: finalProcedureCodes.map(c => ({ code: c.code, description: c.description })),
      });

      logger.logPerformanceMetrics(this.name, {
        executionTime,
        procedureCodesExtracted: finalProcedureCodes.length,
      });

      return this.createSuccessResult(evidence, executionTime, overallConfidence);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("Error in CPTVectorAgent:", error);
      const processingError = this.createError(
        error instanceof Error ? error.message : "An unknown error occurred during vector-based CPT extraction.",
        ProcessingErrorSeverity.CRITICAL
      );
      return this.createFailureResult([processingError], evidence, executionTime);
    }
  }

  /**
   * Performs RAG-based CPT extraction using vector database search
   */
  private async runVectorExtraction(
    context: LoggedAgentExecutionContext,
    fullNoteText: string
  ): Promise<VectorSearchResult> {
    const { logger, services } = context;

    try {
      // Log the full prompt being sent to the AI vector search
      logger.logInfo(this.name, "CPT Vector Search - Full Prompt Logging", {
        promptType: "CPT_EXTRACTION_PROMPT",
        noteLength: fullNoteText.length,
        notePreview: fullNoteText.substring(0, 200) + (fullNoteText.length > 200 ? '...' : ''),
        systemPromptSummary: "Expert medical coder for CPT extraction using RAG-based vector database search",
        promptDetails: {
          authority: "RAG system (updated-cpt index) as single source of truth",
          extractionLogic: "Normalize headings, break into discrete actions, extract attributes, apply coder decision rules",
          outputFormat: "Strict JSON with procedures array containing id, cptCode, addOn, linkedPrimaryId, evidence, rationale, details, keyFactors, units"
        }
      });

      logger.logDebug(this.name, "CPT Vector Search - Complete Input Note", {
        fullNoteText: fullNoteText,
        noteCharacterCount: fullNoteText.length,
        noteWordCount: fullNoteText.split(/\s+/).length
      });

      const result = await this.loggedApiCall(
        context,
        "vectorSearchService",
        "extractProceduresWithRAGWithFallback",
        () => services.vectorSearchService.extractProceduresWithRAGWithFallback(fullNoteText),
        { noteLength: fullNoteText.length }
      );

      // Log the complete AI response before validation
      logger.logInfo(this.name, "CPT Vector Search - Complete AI Response", {
        responseType: "RAW_AI_OUTPUT",
        rawResponse: result,
        responseSize: JSON.stringify(result).length,
        responseStructure: {
          hasProcedures: result && typeof result === 'object' && 'procedures' in result,
          procedureCount: result && typeof result === 'object' && 'procedures' in result && Array.isArray(result.procedures) ? result.procedures.length : 0
        }
      });

      // Validate the result against our schema
      const validatedResult = VectorSearchResultSchema.parse(result);

      logger.logInfo(this.name, "CPT Vector Search - Validated Results", {
        proceduresExtracted: validatedResult.procedures.length,
        procedures: validatedResult.procedures.map(p => ({
          id: p.id,
          candidateCodes: p.candidateCodes,
          addOn: p.addOn,
          linkedPrimaryId: p.linkedPrimaryId,
          evidence: p.evidence.substring(0, 150) + (p.evidence.length > 150 ? '...' : ''),
          rationale: p.rationale.substring(0, 150) + (p.rationale.length > 150 ? '...' : ''),
          details: p.details.substring(0, 100) + (p.details.length > 100 ? '...' : ''),
          keyFactors: p.keyFactors,
          units: p.units
        })),
        validationSuccess: true
      });

      // Log detailed extraction results for easy searching
      validatedResult.procedures.forEach((procedure, index) => {
        logger.logInfo(this.name, `CPT Procedure ${index + 1} - Detailed Extraction`, {
          procedureIndex: index + 1,
          candidateCodes: procedure.candidateCodes,
          isPrimary: !procedure.addOn,
          linkedPrimaryId: procedure.linkedPrimaryId,
          units: procedure.units,
          fullEvidence: procedure.evidence,
          fullRationale: procedure.rationale,
          fullDetails: procedure.details,
          keyFactors: procedure.keyFactors,
          extractionConfidence: "high" // Based on successful validation
        });
      });

      return validatedResult;
    } catch (error) {
      logger.logError(this.name, "CPT Vector Search - Extraction Failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        noteLength: fullNoteText.length,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Vector-based CPT extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Finds the closest unlisted CPT codes above and below a given candidate code
   */
  private findClosestUnlistedCodes(candidateCode: string): { above: string[], below: string[] } {
    const candidateNum = parseInt(candidateCode);
    const unlistedNumbers = UNLISTED_CPT_CODES.map(code => parseInt(code)).sort((a, b) => a - b);
    
    const above: string[] = [];
    const below: string[] = [];
    
    // Find two closest above
    for (const unlistedNum of unlistedNumbers) {
      if (unlistedNum > candidateNum) {
        above.push(unlistedNum.toString().padStart(5, '0'));
        if (above.length === 2) break;
      }
    }
    
    // Find two closest below
    for (let i = unlistedNumbers.length - 1; i >= 0; i--) {
      const unlistedNum = unlistedNumbers[i];
      if (unlistedNum < candidateNum) {
        below.unshift(unlistedNum.toString().padStart(5, '0')); // unshift to maintain closest-first order
        if (below.length === 2) break;
      }
    }
    
    return { above, below };
  }

  /**
   * Gets relevant unlisted codes for all candidate codes in a procedure
   */
  private getRelevantUnlistedCodes(candidateCodes: string[]): string[] {
    const unlistedSet = new Set<string>();
    
    for (const candidateCode of candidateCodes) {
      // If the candidate code itself is already an unlisted code, add it to the unlisted set
      if (isUnlistedCode(candidateCode)) {
        unlistedSet.add(candidateCode);
        continue;
      }
      
      const { above, below } = this.findClosestUnlistedCodes(candidateCode);
      // Add all unlisted codes above (up to 2)
      above.forEach(code => unlistedSet.add(code));
      // Add all unlisted codes below (up to 2)
      below.forEach(code => unlistedSet.add(code));
    }
    
    return Array.from(unlistedSet).sort();
  }

  /**
   * Enriches candidate CPT codes with official descriptions from Azure storage
   */
  private async enrichCandidateCodes(
    context: LoggedAgentExecutionContext,
    procedures: VectorSearchResult['procedures']
  ): Promise<EnrichedProcedureWithUnlisted[]> {
    const { logger, services } = context;
    const enrichedProcedures = [];

    for (const procedure of procedures) {
      const enrichedCandidates: EnrichedCandidateCode[] = [];
      
      // Enrich regular candidate codes
      for (const candidateCode of procedure.candidateCodes) {
        try {
          const filePath = `UpdatedCPT/${candidateCode}.json`;
          const exists = await services.azureStorageService.fileExists(filePath);
          
          if (exists) {
            const content = await services.azureStorageService.getFileContent(filePath);
            const cptJsonData = JSON.parse(content);

            // Extract first 2 sentences of common_language_description if available
            let commonLanguageDescription = '';
            if (cptJsonData.common_language_description) {
              const sentences = cptJsonData.common_language_description.split(/(?<=[.!?])\s+/);
              commonLanguageDescription = sentences.slice(0, 2).join(' ');
            }

            enrichedCandidates.push({
              code: candidateCode,
              officialDescription: cptJsonData.official_description || cptJsonData.TITLE || '',
              commonLanguageDescription: commonLanguageDescription
            });
          } else {
            logger.logWarn(this.name, `CPT code ${candidateCode} not found in database`);
            enrichedCandidates.push({
              code: candidateCode,
              officialDescription: `CPT ${candidateCode} - Description not available`
            });
          }
        } catch (error) {
          logger.logWarn(this.name, `Failed to fetch data for CPT code ${candidateCode}`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          enrichedCandidates.push({
            code: candidateCode,
            officialDescription: `CPT ${candidateCode} - Error fetching description`
          });
        }
      }

      // Get relevant unlisted codes for this procedure
      const relevantUnlistedCodes = this.getRelevantUnlistedCodes(procedure.candidateCodes);
      const enrichedUnlistedCodes: EnrichedCandidateCode[] = [];

      // Enrich unlisted codes
      for (const unlistedCode of relevantUnlistedCodes) {
        try {
          const filePath = `UpdatedCPT/${unlistedCode}.json`;
          const exists = await services.azureStorageService.fileExists(filePath);
          
          if (exists) {
            const content = await services.azureStorageService.getFileContent(filePath);
            const cptJsonData = JSON.parse(content);

            // Extract first 2 sentences of common_language_description if available
            let commonLanguageDescription = '';
            if (cptJsonData.common_language_description) {
              const sentences = cptJsonData.common_language_description.split(/(?<=[.!?])\s+/);
              commonLanguageDescription = sentences.slice(0, 1).join(' ');
            }

            enrichedUnlistedCodes.push({
              code: unlistedCode,
              officialDescription: cptJsonData.official_description || cptJsonData.TITLE || '',
              commonLanguageDescription: commonLanguageDescription
            });
          } else {
            logger.logWarn(this.name, `Unlisted CPT code ${unlistedCode} not found in database`);
            enrichedUnlistedCodes.push({
              code: unlistedCode,
              officialDescription: `Unlisted procedure code`
            });
          }
        } catch (error) {
          logger.logWarn(this.name, `Failed to fetch data for unlisted CPT code ${unlistedCode}`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          enrichedUnlistedCodes.push({
            code: unlistedCode,
            officialDescription: `Unlisted procedure code`
          });
        }
      }

      enrichedProcedures.push({
        ...procedure,
        enrichedCandidates,
        unlistedCodes: enrichedUnlistedCodes
      });
    }

    logger.logInfo(this.name, `Candidate codes enrichment completed`, {
      totalProcedures: procedures.length,
      totalCandidates: procedures.reduce((sum, p) => sum + p.candidateCodes.length, 0),
      enrichedCandidates: enrichedProcedures.reduce((sum, p) => sum + p.enrichedCandidates.length, 0)
    });

    return enrichedProcedures;
  }

  /**
   * Performs final CPT code selection using o4-mini and cptMappingPrompt
   */
  private async performFinalCPTSelection(
    context: LoggedAgentExecutionContext,
    enrichedProcedures: EnrichedProcedureWithUnlisted[],
    fullNoteText: string
  ): Promise<FinalCPTSelectionResult> {
    const { logger, services } = context;

    // Format the procedures with candidate codes and unlisted codes for the prompt
    const formattedProcedures = enrichedProcedures.map((proc, index) => {
      // Create a set of unlisted codes for this procedure to check against
      const unlistedCodeSet = new Set(proc.unlistedCodes.map(u => u.code));
      
      // Filter out candidate codes that are also unlisted codes
      const filteredCandidates = proc.enrichedCandidates.filter(candidate => 
        !unlistedCodeSet.has(candidate.code)
      );
      
      const candidateList = filteredCandidates.map(candidate => 
        `${candidate.code}: ${candidate.officialDescription}${candidate.commonLanguageDescription ? ` (${candidate.commonLanguageDescription})` : ''}`
      ).join('\n  ');
      
      const unlistedList = proc.unlistedCodes.map(unlisted => 
        `${unlisted.code}: ${unlisted.officialDescription}${unlisted.commonLanguageDescription ? ` (${unlisted.commonLanguageDescription})` : ''}`
      ).join('\n  ');

      let formattedProc = `Procedure ${index + 1}: ${proc.details}
Evidence: ${proc.evidence}
Rationale: ${proc.rationale}
Key Factors: ${proc.keyFactors.join(', ')}
Candidate Codes:
  ${candidateList}`;

      if (unlistedList) {
        formattedProc += `\n\nUnlisted Codes:
  ${unlistedList}`;
      }
      
      formattedProc += `\n\n(End of Procedure ${index + 1})`;
      
      return formattedProc;
    }).join('\n\n');

    // Use the cptMappingPrompt from code-extraction-prompts.ts
    const prompt = cptMappingPrompt('', formattedProcedures, fullNoteText);
    logger.logInfo(this.name, "Calling selection CPT", {prompt})

    try {
      // Create AI model service instance for o4-mini with direct client to bypass SimpleBackendManager
      const aiModelService = new AIModelService({
        provider: 'azure',
        model: 'gpt-5-mini', // Use o4-mini for final selection
        reasoning_effort: 'low',
        // temperature:0.1,
        maxTokens: 2048,
        timeout: 60000
      }, logger, 'cpt_final_selection', true); // Use direct client to avoid backend manager routing issues
      
      const response = await this.loggedApiCall(
        context,
        "aiModelService",
        "generateText",
        () => aiModelService.generateText(prompt),
        { promptLength: prompt.length }
      );

      // Parse and validate the JSON response
      let parsedResult;
      try {
        // Handle markdown code blocks if present
        let jsonContent = typeof response === 'string' ? response.trim() : JSON.stringify(response);
        
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        jsonContent = jsonContent.replace(/^`+/, '').replace(/`+$/, '').trim();
        parsedResult = JSON.parse(jsonContent);
      } catch (parseError) {
        const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
        throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Content: ${responseStr.substring(0, 200)}...`);
      }

      // Validate against schema
      const validatedResult = FinalCPTSelectionSchema.parse(parsedResult);

      logger.logInfo(this.name, "Final CPT selection completed", {
        selectedCodes: validatedResult.procedureCodes.length,
        codes: validatedResult.procedureCodes.map(c => ({ 
          code: c.code, 
          elementName: c.elementName,
          linkedDiagnoses: c.linkedDiagnoses 
        }))
      });

      return validatedResult;

    } catch (error) {
      logger.logError(this.name, "Final CPT selection failed", {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Final CPT selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Legacy method - keeping for compatibility but updating to use new structure
   */
  private async enrichCPTCodes(
    context: LoggedAgentExecutionContext,
    procedures: VectorSearchResult['procedures']
  ): Promise<Array<VectorSearchResult['procedures'][0] & { cptData?: CptCodeData }>> {
    const { logger, services } = context;
    const enrichedProcedures = [];

    for (const procedure of procedures) {
      const primaryCode = procedure.candidateCodes?.[0] || 'UNKNOWN';
      try {
        // Fetch additional CPT data from Azure storage
        const filePath = `UpdatedCPT/${primaryCode}.json`;
        const exists = await services.azureStorageService.fileExists(filePath);
        
        let cptData: CptCodeData | undefined;
        
        if (exists) {
          const content = await services.azureStorageService.getFileContent(filePath);
          const cptJsonData = JSON.parse(content);

          // Extract first 2 sentences of common_language_description if available
          let commonLanguageDescription = '';
          if (cptJsonData.common_language_description) {
            const sentences = cptJsonData.common_language_description.split(/(?<=[.!?])\s+/);
            commonLanguageDescription = sentences.slice(0, 2).join(' ');
          }

          // Parse code_data_insights if available
          const codeDataInsights: CodeDataInsights | undefined = cptJsonData.code_data_insights ? {
            "Short Descr": cptJsonData.code_data_insights["Short Descr"],
            "Medium Descr": cptJsonData.code_data_insights["Medium Descr"],
            "Long Descr": cptJsonData.code_data_insights["Long Descr"],
            "Status Code": cptJsonData.code_data_insights["Status Code"],
            "Global Days": parseGlobalDays(cptJsonData.code_data_insights["Global Days"]),
            "PC/TC Indicator (26, TC)": cptJsonData.code_data_insights["PC/TC Indicator (26, TC)"],
            "Multiple Procedures (51)": cptJsonData.code_data_insights["Multiple Procedures (51)"],
            "Bilateral Surgery (50)": cptJsonData.code_data_insights["Bilateral Surgery (50)"],
            "Physician Supervisions": cptJsonData.code_data_insights["Physician Supervisions"],
            "Assistant Surgeon (80, 82)": cptJsonData.code_data_insights["Assistant Surgeon (80, 82)"],
            "Co-Surgeons (62)": cptJsonData.code_data_insights["Co-Surgeons (62)"],
            "Team Surgery (66)": cptJsonData.code_data_insights["Team Surgery (66)"],
            "Diagnostic Imaging Family": cptJsonData.code_data_insights["Diagnostic Imaging Family"],
            "APC Status Indicator": cptJsonData.code_data_insights["APC Status Indicator"],
            "Type of Service (TOS)": cptJsonData.code_data_insights["Type of Service (TOS)"],
            "Berenson-Eggers TOS (BETOS)": cptJsonData.code_data_insights["Berenson-Eggers TOS (BETOS)"],
            "MUE": cptJsonData.code_data_insights["MUE"],
            "CCS Clinical Classification": cptJsonData.code_data_insights["CCS Clinical Classification"]
          } : undefined;

          cptData = {
            code: cptJsonData.code_title || cptJsonData.HCPCS || primaryCode,
            title: cptJsonData.official_description || cptJsonData.TITLE || '',
            summary: cptJsonData.official_description || cptJsonData.DESCRIPTION || '',
            commonLanguageDescription: commonLanguageDescription,
            globalDays: parseGlobalDays(cptJsonData.code_data_insights?.['Global Days']) || cptJsonData.GLOBAL_DAYS || undefined,
            mueLimit: cptJsonData.code_data_insights?.MUE ? parseInt(cptJsonData.code_data_insights.MUE) : (cptJsonData.MUE_LIMIT ? parseInt(cptJsonData.MUE_LIMIT) : undefined),
            allowed_modifiers: cptJsonData.modifier_assist ? Object.keys(cptJsonData.modifier_assist) : (cptJsonData.ALLOWED_MODIFIERS || []),
            allowed_icd_families: cptJsonData.ALLOWED_ICD_FAMILIES || [],
            codeDataInsights: codeDataInsights,
          };

          logger.logDebug(this.name, `Enriched CPT code ${primaryCode}`, {
            hasModifierAssist: !!cptJsonData.modifier_assist,
            modifierCount: cptData.allowed_modifiers?.length || 0,
            hasCodeDataInsights: !!codeDataInsights
          });
        } else {
          logger.logWarn(this.name, `CPT code ${primaryCode} not found in database`);
        }

        enrichedProcedures.push({
          ...procedure,
          cptData
        });

      } catch (error) {
        logger.logWarn(this.name, `Failed to enrich CPT code ${primaryCode}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Add procedure without enrichment
        enrichedProcedures.push(procedure);
      }
    }

    logger.logInfo(this.name, `CPT codes enrichment completed`, {
      totalProcedures: procedures.length,
      enrichedProcedures: enrichedProcedures.filter(p => 'cptData' in p && p.cptData).length,
      enrichmentRate: procedures.length > 0 ? ((enrichedProcedures.filter(p => 'cptData' in p && p.cptData).length / procedures.length) * 100).toFixed(1) + '%' : '0%'
    });

    return enrichedProcedures;
  }

  /**
   * Determines if a CPT code is primary or add-on based on the vector search result
   */
  private isPrimaryCode(procedure: VectorSearchResult['procedures'][0]): boolean {
    // The vector search already determines this based on RAG data
    return !procedure.addOn;
  }

  /**
   * Transforms the final selection results into EnhancedProcedureCode format
   */
  private async transformFinalSelectionToEnhancedProcedureCodes(
    context: LoggedAgentExecutionContext,
    finalSelection: FinalCPTSelectionResult,
    originalProcedures: VectorSearchResult['procedures']
  ): Promise<EnhancedProcedureCode[]> {
    const { logger, services } = context;
    const finalCodes: EnhancedProcedureCode[] = [];

    for (const selectedCode of finalSelection.procedureCodes) {
      try {
        // Fetch additional CPT data from Azure storage for the selected code
        const filePath = `UpdatedCPT/${selectedCode.code}.json`;
        const exists = await services.azureStorageService.fileExists(filePath);
        
        let cptData: CptCodeData | undefined;
        
        if (exists) {
          const content = await services.azureStorageService.getFileContent(filePath);
          const cptJsonData = JSON.parse(content);

          // Extract first 2 sentences of common_language_description if available
          let commonLanguageDescription = '';
          if (cptJsonData.common_language_description) {
            const sentences = cptJsonData.common_language_description.split(/(?<=[.!?])\s+/);
            commonLanguageDescription = sentences.slice(0, 2).join(' ');
          }

          // Parse code_data_insights if available
          const codeDataInsights: CodeDataInsights | undefined = cptJsonData.code_data_insights ? {
            "Short Descr": cptJsonData.code_data_insights["Short Descr"],
            "Medium Descr": cptJsonData.code_data_insights["Medium Descr"],
            "Long Descr": cptJsonData.code_data_insights["Long Descr"],
            "Status Code": cptJsonData.code_data_insights["Status Code"],
            "Global Days": parseGlobalDays(cptJsonData.code_data_insights["Global Days"]),
            "PC/TC Indicator (26, TC)": cptJsonData.code_data_insights["PC/TC Indicator (26, TC)"],
            "Multiple Procedures (51)": cptJsonData.code_data_insights["Multiple Procedures (51)"],
            "Bilateral Surgery (50)": cptJsonData.code_data_insights["Bilateral Surgery (50)"],
            "Physician Supervisions": cptJsonData.code_data_insights["Physician Supervisions"],
            "Assistant Surgeon (80, 82)": cptJsonData.code_data_insights["Assistant Surgeon (80, 82)"],
            "Co-Surgeons (62)": cptJsonData.code_data_insights["Co-Surgeons (62)"],
            "Team Surgery (66)": cptJsonData.code_data_insights["Team Surgery (66)"],
            "Diagnostic Imaging Family": cptJsonData.code_data_insights["Diagnostic Imaging Family"],
            "APC Status Indicator": cptJsonData.code_data_insights["APC Status Indicator"],
            "Type of Service (TOS)": cptJsonData.code_data_insights["Type of Service (TOS)"],
            "Berenson-Eggers TOS (BETOS)": cptJsonData.code_data_insights["Berenson-Eggers TOS (BETOS)"],
            "MUE": cptJsonData.code_data_insights["MUE"],
            "CCS Clinical Classification": cptJsonData.code_data_insights["CCS Clinical Classification"]
          } : undefined;

          cptData = {
            code: cptJsonData.code_title || cptJsonData.HCPCS || selectedCode.code,
            title: cptJsonData.official_description || cptJsonData.TITLE || '',
            summary: cptJsonData.official_description || cptJsonData.DESCRIPTION || '',
            commonLanguageDescription: commonLanguageDescription,
            globalDays: parseGlobalDays(cptJsonData.code_data_insights?.['Global Days']) || cptJsonData.GLOBAL_DAYS || undefined,
            mueLimit: cptJsonData.code_data_insights?.MUE ? parseInt(cptJsonData.code_data_insights.MUE) : (cptJsonData.MUE_LIMIT ? parseInt(cptJsonData.MUE_LIMIT) : undefined),
            allowed_modifiers: cptJsonData.modifier_assist ? Object.keys(cptJsonData.modifier_assist) : (cptJsonData.ALLOWED_MODIFIERS || []),
            allowed_icd_families: cptJsonData.ALLOWED_ICD_FAMILIES || [],
            codeDataInsights: codeDataInsights,
          };
        }

        const description = selectedCode.elementName || (cptData ? (cptData.summary || cptData.title) : `Procedure: ${selectedCode.code}`);

        finalCodes.push({
          code: selectedCode.code,
          description: description,
          units: selectedCode.units,
          evidence: [
            this.createEvidence(
              selectedCode.evidence,
              selectedCode.rationale,
              1.0,
              Notes.OPERATIVE,
            )
          ],
          modifierExplanation: selectedCode.modifierExplanation || '', // Handle case where it's not provided
          isPrimary: true, // Default to primary, will be updated by modifier agent if needed
          mueLimit: cptData?.mueLimit || 1,
          mai: 1 as 1 | 2 | 3,
          modifiersLinked: [],
          icd10Linked: [],
          addOnLinked: [],
          // Enhanced fields from CPT data
          officialDesc: cptData?.summary,
          globalDays: cptData?.globalDays,
          modifiersApplicable: cptData?.allowed_modifiers,
          icd10Applicable: cptData?.allowed_icd_families,
          codeDataInsights: cptData?.codeDataInsights,
          // Add linkedDiagnoses from the AI response
          linkedDiagnoses: selectedCode.linkedDiagnoses || [],
        });

      } catch (error) {
        logger.logWarn(this.name, `Failed to enrich selected CPT code ${selectedCode.code}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Add procedure without enrichment
        finalCodes.push({
          code: selectedCode.code,
          description: selectedCode.elementName || `Procedure: ${selectedCode.code}`,
          units: selectedCode.units,
          evidence: [
            this.createEvidence(
              selectedCode.evidence,
              selectedCode.rationale,
              1.0,
              Notes.OPERATIVE,
            )
          ],
          modifierExplanation: selectedCode.modifierExplanation || '', // Handle case where it's not provided
          isPrimary: true,
          mueLimit: 1,
          mai: 1 as 1 | 2 | 3,
          modifiersLinked: [],
          icd10Linked: [],
          addOnLinked: [],
          // Add linkedDiagnoses from the AI response
          linkedDiagnoses: selectedCode.linkedDiagnoses || [],
        });
      }
    }

    logger.logInfo(this.name, "Transformed final selection to EnhancedProcedureCode format", {
      selectedCodes: finalSelection.procedureCodes.length,
      finalCodes: finalCodes.length,
      codes: finalCodes.map(c => ({ 
        code: c.code, 
        description: c.description,
        linkedDiagnoses: c.linkedDiagnoses 
      }))
    });

    return finalCodes;
  }

  /**
   * Legacy method - Transforms the vector search results into EnhancedProcedureCode format
   */
  private async transformToEnhancedProcedureCodes(
    context: LoggedAgentExecutionContext,
    enrichedProcedures: Array<VectorSearchResult['procedures'][0] & { cptData?: CptCodeData }>
  ): Promise<EnhancedProcedureCode[]> {
    const { logger } = context;
    const finalCodes: EnhancedProcedureCode[] = [];
    const seenCodes = new Set<string>();
    const duplicatesFound: Array<{ code: string, firstProcedure: string, duplicateProcedure: string }> = [];

    for (const proc of enrichedProcedures) {
      // Legacy method - this won't be used with the new flow
      // Check for duplicate CPT codes - skip for candidate codes
      const primaryCode = proc.candidateCodes?.[0] || 'UNKNOWN';
      if (seenCodes.has(primaryCode)) {
        // Log the duplicate and skip it
        const firstProcedure = finalCodes.find(c => c.code === primaryCode);
        duplicatesFound.push({
          code: primaryCode,
          firstProcedure: firstProcedure?.description || 'Unknown procedure',
          duplicateProcedure: proc.details || `Procedure: ${primaryCode}`
        });
        
        logger.logWarn(this.name, `Duplicate CPT code found and discarded`, {
          duplicateCode: primaryCode,
          firstProcedureDescription: firstProcedure?.description || 'Unknown procedure',
          duplicateProcedureDescription: proc.details || `Procedure: ${primaryCode}`,
          duplicateEvidence: proc.evidence,
          duplicateRationale: proc.rationale,
          action: 'DISCARDED_DUPLICATE'
        });
        
        continue; // Skip this duplicate procedure
      }

      // Mark this code as seen
      seenCodes.add(primaryCode);

      const cptData = proc.cptData;
      const description = proc.details || (cptData ? (cptData.summary || cptData.title) : `Procedure: ${primaryCode}`);

      // Use the vector search determination for primary vs add-on
      const isPrimary = this.isPrimaryCode(proc);

      finalCodes.push({
        code: primaryCode,
        description: description,
        units: proc.units || 1, // Use units from vector search result, default to 1
        evidence: [
          this.createEvidence(
            [proc.evidence],
            proc.rationale, // Use the actual rationale from RAG response
            1.0,
            Notes.OPERATIVE,
          )
        ],
        isPrimary: isPrimary,
        mueLimit: cptData?.mueLimit || 1,
        mai: 1 as 1 | 2 | 3,
        modifiersLinked: [], // Initialize as empty array - will be populated by modifier agent
        icd10Linked: [], // Initialize as empty array - will be populated by ICD agent
        addOnLinked: [], // Initialize as empty array
        // Enhanced fields from CPT data
        officialDesc: cptData?.summary,
        globalDays: cptData?.globalDays,
        modifiersApplicable: cptData?.allowed_modifiers,
        icd10Applicable: cptData?.allowed_icd_families,
        codeDataInsights: cptData?.codeDataInsights,
      });
    }

    // Log summary of duplicate handling
    if (duplicatesFound.length > 0) {
      logger.logInfo(this.name, "Duplicate CPT codes summary", {
        totalDuplicatesFound: duplicatesFound.length,
        duplicatesSummary: duplicatesFound.map(d => ({
          code: d.code,
          kept: d.firstProcedure,
          discarded: d.duplicateProcedure
        })),
        originalProcedureCount: enrichedProcedures.length,
        finalProcedureCount: finalCodes.length,
        duplicatesDiscarded: enrichedProcedures.length - finalCodes.length
      });
    }

    logger.logInfo(this.name, "Transformed to EnhancedProcedureCode format", {
      originalProcedureCount: enrichedProcedures.length,
      totalCodes: finalCodes.length,
      primaryCodes: finalCodes.filter(c => c.isPrimary).length,
      addOnCodes: finalCodes.filter(c => !c.isPrimary).length,
      duplicatesRemoved: enrichedProcedures.length - finalCodes.length
    });

    return finalCodes;
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