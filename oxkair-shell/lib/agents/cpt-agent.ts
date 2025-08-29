/**
 * CPT Agent - Simplified AI Model + Vector Search approach
 *
 * This agent replaces the initial vector-search call with a simple AI model service call,
 * then runs a vector search on those results to get the top candidates for CPT mapping.
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
import { SimpleVectorSearchService } from "../services/simple-vector-search-service.ts";
import { UNLISTED_CPT_CODES, isUnlistedCode } from "../constants/unlisted-codes.ts";

// ============================================================================
// SCHEMAS AND TYPES
// ============================================================================

// Initial AI extraction result schema (from newcptprompt.md)
const InitialExtractionSchema = z.object({
  procedures: z.array(z.object({
    id: z.string(),
    approach: z.enum(["open", "laparoscopic", "robotic"]).nullable(),
    anatomy: z.array(z.string()),
    laterality: z.enum(["left", "right", "bilateral"]).nullable(),
    recurrence: z.union([z.boolean(), z.literal("unknown")]),
    incarcerated: z.union([z.boolean(), z.literal("unknown")]),
    obstruction: z.union([z.boolean(), z.literal("unknown")]),
    gangrene: z.union([z.boolean(), z.literal("unknown")]),
    mesh_placed: z.union([z.boolean(), z.literal("unknown")]),
    defect_size: z.string().nullable(),
    concurrent_procedures: z.array(z.string()),
    assistant_role: z.enum(["resident", "physician", "PA", "none"]),
    surgeon_confirmations_needed: z.array(z.string()),
    evidence_snippets: z.array(z.string()),
    units: z.number()
  })).min(1)
});

type InitialExtractionResult = z.infer<typeof InitialExtractionSchema>;

// Final CPT selection result schema
const FinalCPTSelectionSchema = z.object({
  procedureCodes: z.array(z.object({
    elementName: z.string(),
    code: z.string().regex(/^\d{5}$/),
    units: z.number().positive().int(),
    evidence: z.array(z.string()),
    linkedDiagnoses: z.array(z.string()),
    modifierExplanation: z.string().optional(),
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

interface VectorSearchCandidate {
  code: string;
  officialDescription: string;
  commonLanguageDescription?: string;
  chunk?: string;
}

interface EnrichedProcedureWithCandidates {
  id: string;
  approach: string | null;
  anatomy: string[];
  laterality: string | null;
  recurrence: boolean | "unknown";
  incarcerated: boolean | "unknown";
  obstruction: boolean | "unknown";
  gangrene: boolean | "unknown";
  mesh_placed: boolean | "unknown";
  defect_size: string | null;
  concurrent_procedures: string[];
  assistant_role: string;
  surgeon_confirmations_needed: string[];
  evidence_snippets: string[];
  units: number;
  vectorCandidates: VectorSearchCandidate[];
  unlistedCodes: VectorSearchCandidate[];
}

// ============================================================================
// CPT AGENT IMPLEMENTATION
// ============================================================================

export class CPTAgent extends Agent {
  readonly name = "cpt_agent";
  readonly description =
    "Extracts CPT procedure codes using simplified AI model + vector search approach";
  readonly requiredServices = ["azureStorageService"] as const;

  private vectorSearchService: SimpleVectorSearchService;

  constructor() {
    super();
    this.vectorSearchService = new SimpleVectorSearchService();
  }

  async executeInternal(
    context: LoggedAgentExecutionContext,
  ): Promise<StandardizedAgentResult> {
    const { logger, state } = context;
    const { caseId } = state.caseMeta;
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const startTime = Date.now();

    logger.logInfo(this.name, `CPT Agent execution started for case: ${caseId}`);

    try {
      // Get Full Note Text
      const fullNoteText = [
        state.caseNotes.primaryNoteText,
        ...state.caseNotes.additionalNotes.map((note) => note.content),
      ].join("\n\n");

      // Step 1: Simple AI model extraction (no vector search)
      logger.logInfo(this.name, "Starting simple AI model extraction");
      const initialExtraction = await this.runInitialExtraction(context, fullNoteText);

      // Step 2: Vector search for each procedure to get candidates
      logger.logInfo(this.name, "Running vector search for procedure candidates");
      const enrichedProcedures = await this.runVectorSearchForCandidates(context, initialExtraction.procedures);

      // Step 3: Final CPT selection using the same mapping prompts
      logger.logInfo(this.name, "Performing final CPT code selection");
      const finalSelection = await this.performFinalCPTSelection(context, enrichedProcedures, fullNoteText);

      // Transform results to EnhancedProcedureCode format
      const finalProcedureCodes = await this.transformFinalSelectionToEnhancedProcedureCodes(
        context,
        finalSelection,
        enrichedProcedures
      );

      // Create evidence
      if (finalProcedureCodes.length > 0) {
        evidence.push(
          this.createEvidence(
            finalProcedureCodes.flatMap((p) =>
              p.evidence.flatMap((e) => e.verbatimEvidence)
            ),
            "Extracted CPT procedure codes using AI model + vector search",
            1.0,
            Notes.OPERATIVE,
            { procedureCodes: finalProcedureCodes },
          ),
        );
      }

      const executionTime = Date.now() - startTime;
      const overallConfidence = this.calculateOverallConfidence(evidence);

      if (evidence.length === 0) {
        errors.push(this.createError("No CPT codes were extracted.", ProcessingErrorSeverity.MEDIUM));
        return this.createFailureResult(errors, evidence, executionTime);
      }

      logger.logInfo(this.name, "CPT Agent execution completed - FINAL SUMMARY", {
        executionTimeMs: executionTime,
        totalProcedureCodes: finalProcedureCodes.length,
        primaryCodes: finalProcedureCodes.filter(p => p.isPrimary).length,
        addOnCodes: finalProcedureCodes.filter(p => !p.isPrimary).length,
        overallConfidence: overallConfidence,
        finalProcedureCodes: finalProcedureCodes.map(c => ({ 
          code: c.code, 
          description: c.description,
          units: c.units,
          linkedDiagnoses: c.linkedDiagnoses,
          modifierExplanation: c.modifierExplanation,
          evidenceCount: c.evidence.length
        })),
        evidenceGenerated: evidence.length,
        processingSteps: {
          step1_initial_extraction: "✅ Completed",
          step2_vector_search: "✅ Completed", 
          step3_final_selection: "✅ Completed",
          step4_transformation: "✅ Completed"
        }
      });

      logger.logPerformanceMetrics(this.name, {
        executionTime,
        procedureCodesExtracted: finalProcedureCodes.length,
      });

      return this.createSuccessResult(evidence, executionTime, overallConfidence);

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("Error in CPTAgent:", error);
      const processingError = this.createError(
        error instanceof Error ? error.message : "An unknown error occurred during CPT extraction.",
        ProcessingErrorSeverity.CRITICAL
      );
      return this.createFailureResult([processingError], evidence, executionTime);
    }
  }

  /**
   * Step 1: Simple AI model extraction using the newcptprompt.md format
   */
  private async runInitialExtraction(
    context: LoggedAgentExecutionContext,
    fullNoteText: string
  ): Promise<InitialExtractionResult> {
    const { logger } = context;

    try {
      // Use the prompt from newcptprompt.md
      const prompt = `You are an expert medical extraction agent. For each provided operative note, extract every distinct, separately-documentable procedure and return ONLY a JSON array named "procedures". Do not output CPT/ICD codes, recommendations, or any extra text — only the JSON array. Return at least one procedure and include as many distinct procedures as the note documents.

EXTRACTION FLOW (keep it simple and evidence-driven) 
1) Normalize headings (case-insensitive): OPERATION/PROCEDURE(S)/SURGICAL PROCEDURE/PROCEDURES PERFORMED; DETAILS OF PROCEDURE/TECHNIQUE/DESCRIPTION OF PROCEDURE; ANESTHESIA/ANESTHESIA TYPE. 
2) Break the note into discrete actions: 
- Treat each bullet, sentence describing an independent therapeutic or diagnostic action, or discrete anatomic site action as a candidate procedure.
- Do a two-pass selection: first pass pick stand-alone primary procedures, second pass add add-on codes (only if their required primary is present and both exist in RAG).
- Ensure that all distinct executed procedure is listed and used for analysis.

For each procedure, identify and extract the following:
- approach ("open"|"laparoscopic"|"robotic"|null)
- anatomy (array of strings; e.g., ["ventral","suprapubic","parastomal"])
- laterality ("left"|"right"|"bilateral"|null)
- recurrence (true|false|"unknown")
- incarcerated (true|false|"unknown")
- obstruction (true|false|"unknown")
- gangrene (true|false|"unknown")
- mesh_placed (true|false|"unknown")
- defect_size (string | null) — concise, e.g. "2cm length, 3cm width"
- concurrent_procedures (array of strings)
- assistant_role ("resident" | "physician" | "PA" | "none")
- surgeon_confirmations_needed (array of strings)
- evidence_snippets (array of 1-3 verbatim short quotes from the note)
- units (integer)

REQUIREMENTS
- Output must be valid JSON and nothing else.
- The top-level value must be an array called "procedures".
- Each procedure object must include ALL fields below. If a field does not apply, use null or an empty array as appropriate.
- evidence_snippets must contain verbatim quotes (short sentences) from the note that support the extracted fields.

REQUIRED PROCEDURE OBJECT SCHEMA (ALL FIELDS MANDATORY)
{
 "procedures": [
  {
    "id": "P1",                                    // unique id (P1, P2, ...)
    "approach": "open" | "laparoscopic" | "robotic" | null,
    "anatomy": ["ventral", "suprapubic"],          // array of anatomy/site tags (strings)
    "laterality": "left" | "right" | "bilateral" | null,
    "recurrence": true | false | "unknown",
    "incarcerated": true | false | "unknown",
    "obstruction": true | false | "unknown",
    "gangrene": true | false | "unknown",
    "mesh_placed": true | false | "unknown",
    "defect_size": "2cm length, 3cm width"  | null,
    "concurrent_procedures": ["cystectomy", "ileal conduit creation"], // array
    "assistant_role": "resident" | "physician" | "PA" | "none",
    "surgeon_confirmations_needed": ["mesh_placement","exact_defect_size"], // array
    "evidence_snippets": ["PROCEDURE: Open primary repair of hernia", "POSTOPERATIVE DIAGNOSIS: Same, incarcerated, M5 ventral hernia measuring 2 x 3 cm"],
    "units": 1
    },
  ... // other disinct procedures if relevant P2, P3 ... 
  ]
}

Operative Note:
${fullNoteText}

## End of Operative Note

Be very thorough and precise in your analysis.
Output only the above specified.
`;

      logger.logInfo(this.name, "Initial AI extraction - Full Prompt Logging", {
        promptType: "INITIAL_EXTRACTION_PROMPT",
        noteLength: fullNoteText.length,
        notePreview: fullNoteText.substring(0, 200) + (fullNoteText.length > 200 ? '...' : ''),
        fullPrompt: prompt,
        promptCharacterCount: prompt.length
      });

      // Create AI model service instance for initial extraction
      const aiModelService = new AIModelService({
        provider: 'azure',
        model: 'gpt-4.1',
        // reasoning_effort: 'low',
        temperature:0.1,
        maxTokens: 4048,
        timeout: 60000
      }, logger, 'cpt_initial_extraction', true);
      
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
      const validatedResult = InitialExtractionSchema.parse(parsedResult);

      logger.logInfo(this.name, "Initial extraction - AI Response", {
        rawResponse: typeof response === 'string' ? response : JSON.stringify(response),
        responseLength: (typeof response === 'string' ? response : JSON.stringify(response)).length,
        parsedResult: JSON.stringify(parsedResult, null, 2),
        validatedResult: JSON.stringify(validatedResult, null, 2)
      });

      logger.logInfo(this.name, "Initial extraction completed", {
        proceduresExtracted: validatedResult.procedures.length,
        procedures: validatedResult.procedures.map(p => ({
          id: p.id,
          approach: p.approach,
          anatomy: p.anatomy,
          evidence: p.evidence_snippets.join('; ')
        }))
      });

      return validatedResult;

    } catch (error) {
      logger.logError(this.name, "Initial extraction failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        noteLength: fullNoteText.length
      });
      throw new Error(`Initial AI extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Step 2: Run vector search for each procedure to get candidate CPT codes
   */
  private async runVectorSearchForCandidates(
    context: LoggedAgentExecutionContext,
    procedures: InitialExtractionResult['procedures']
  ): Promise<EnrichedProcedureWithCandidates[]> {
    const { logger } = context;
    const enrichedProcedures: EnrichedProcedureWithCandidates[] = [];

    for (const procedure of procedures) {
      try {
        // Create a search query from the procedure details
        const searchQuery = this.createSearchQueryFromProcedure(procedure);
        
        logger.logInfo(this.name, `Running vector search for procedure ${procedure.id}`, {
          procedureId: procedure.id,
          fullSearchQuery: searchQuery,
          searchQueryLength: searchQuery.length,
          searchQueryPreview: searchQuery.substring(0, 200) + (searchQuery.length > 200 ? '...' : ''),
          anatomy: procedure.anatomy,
          approach: procedure.approach,
          procedureDetails: {
            recurrence: procedure.recurrence,
            incarcerated: procedure.incarcerated,
            mesh_placed: procedure.mesh_placed,
            defect_size: procedure.defect_size,
            concurrent_procedures: procedure.concurrent_procedures,
            evidence_snippets: procedure.evidence_snippets
          }
        });

        // Perform vector search
        const searchResult = await this.vectorSearchService.searchCPTCodes(searchQuery, 3);
        
        logger.logInfo(this.name, `Vector search results for procedure ${procedure.id}`, {
          procedureId: procedure.id,
          searchQuery: searchQuery,
          totalResults: searchResult.results.length,
          approxTotalCount: searchResult.approx_total_count,
          parentIds: searchResult.parent_ids,
          rawResults: searchResult.results.map(r => ({
            code_title: r.code_title,
            parent_id: r.parent_id,
            chunk: r.chunk,
            search_score: r['@search.score'],
            reranker_score: r['@search.rerankerScore']
          }))
        });
        
        // Extract candidate codes from search results
        const vectorCandidates = await this.extractCandidatesFromSearchResults(context, searchResult.results);
        
        // Get relevant unlisted codes
        const candidateCodes = vectorCandidates.map(c => c.code);
        const unlistedCodes = await this.getRelevantUnlistedCodes(context, candidateCodes);

        enrichedProcedures.push({
          ...procedure,
          vectorCandidates,
          unlistedCodes
        });

        logger.logInfo(this.name, `Vector search completed for procedure ${procedure.id}`, {
          candidatesFound: vectorCandidates.length,
          unlistedCodesFound: unlistedCodes.length,
          candidates: vectorCandidates.map(c => c.code),
          candidateDetails: vectorCandidates.map(c => ({
            code: c.code,
            officialDescription: c.officialDescription.substring(0, 100) + (c.officialDescription.length > 100 ? '...' : ''),
            commonLanguageDescription: c.commonLanguageDescription ? c.commonLanguageDescription.substring(0, 100) + '...' : null,
            chunkPreview: c.chunk ? c.chunk.substring(0, 100) + '...' : null
          })),
          unlistedCodes: unlistedCodes.map(u => u.code)
        });

      } catch (error) {
        logger.logError(this.name, `Vector search failed for procedure ${procedure.id}`, {
          error: error instanceof Error ? error.message : "Unknown error"
        });
        
        // Add procedure without candidates
        enrichedProcedures.push({
          ...procedure,
          vectorCandidates: [],
          unlistedCodes: []
        });
      }
    }

    return enrichedProcedures;
  }

  /**
   * Creates a search query string from procedure details
   */
  private createSearchQueryFromProcedure(procedure: InitialExtractionResult['procedures'][0]): string {
    const parts: string[] = [];
    
    // Add approach if available
    if (procedure.approach) {
      parts.push(procedure.approach, 'approach');
    }
    
    // Add anatomy
    if (procedure.anatomy.length > 0) {
      parts.push(...procedure.anatomy);
    }
    
    // Add key characteristics
    if (procedure.recurrence === true) parts.push('recurrent');
    if (procedure.incarcerated === true) parts.push('incarcerated');
    if (procedure.obstruction === true) parts.push('obstruction');
    if (procedure.gangrene === true) parts.push('gangrene');
    if (procedure.mesh_placed === true) parts.push('mesh placement');
    if (procedure.mesh_placed === false) parts.push('without mesh');
    if (procedure.laterality) parts.push(procedure.laterality);
    if (procedure.defect_size) parts.push('defect size', procedure.defect_size);
    
    // Add concurrent procedures
    if (procedure.concurrent_procedures.length > 0) {
      parts.push('concurrent procedures:', ...procedure.concurrent_procedures);
    }
    
    // Add evidence snippets for context
    parts.push(...procedure.evidence_snippets);
    
    const searchQuery = parts.join(' ');
    
    // Log the query construction details
    console.log(`[CPT Agent] Search query construction for ${procedure.id}:`, {
      procedureId: procedure.id,
      inputParts: {
        approach: procedure.approach,
        anatomy: procedure.anatomy,
        characteristics: {
          recurrence: procedure.recurrence,
          incarcerated: procedure.incarcerated,
          obstruction: procedure.obstruction,
          gangrene: procedure.gangrene,
          mesh_placed: procedure.mesh_placed,
          laterality: procedure.laterality,
          defect_size: procedure.defect_size
        },
        concurrent_procedures: procedure.concurrent_procedures,
        evidence_snippets: procedure.evidence_snippets
      },
      constructedParts: parts,
      finalQuery: searchQuery,
      queryLength: searchQuery.length
    });
    
    return searchQuery;
  }

  /**
   * Extracts candidate codes from vector search results
   */
  private async extractCandidatesFromSearchResults(
    context: LoggedAgentExecutionContext,
    searchResults: any[]
  ): Promise<VectorSearchCandidate[]> {
    const { logger, services } = context;
    const candidates: VectorSearchCandidate[] = [];

    for (const result of searchResults) {
      try {
        // Extract code from the result - it's in the code_title field based on our test
        const code = result.code_title || result.parent_id || result.code || result.HCPCS || result.cpt_code;
        if (!code || !/^\d{5}$/.test(code)) {
          continue; // Skip if no valid CPT code found
        }

        // Get official description from Azure storage
        const filePath = `UpdatedCPT/${code}.json`;
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

          candidates.push({
            code,
            officialDescription: cptJsonData.official_description || cptJsonData.TITLE || result.chunk || '',
            commonLanguageDescription,
            chunk: result.chunk || result.content || ''
          });
        } else {
          // Add without enrichment but use the chunk as description
          candidates.push({
            code,
            officialDescription: result.chunk || `CPT ${code} - Description not available`,
            commonLanguageDescription: result.common_language_description || '',
            chunk: result.chunk || result.content || ''
          });
        }

      } catch (error) {
        logger.logWarn(this.name, `Failed to process search result`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          result: JSON.stringify(result).substring(0, 100)
        });
      }
    }

    return candidates;
  }

  /**
   * Gets relevant unlisted codes for candidate codes
   */
  private async getRelevantUnlistedCodes(
    context: LoggedAgentExecutionContext,
    candidateCodes: string[]
  ): Promise<VectorSearchCandidate[]> {
    const { logger, services } = context;
    const unlistedCodes: VectorSearchCandidate[] = [];
    const unlistedSet = new Set<string>();
    
    for (const candidateCode of candidateCodes) {
      // If the candidate code itself is already an unlisted code, add it
      if (isUnlistedCode(candidateCode)) {
        unlistedSet.add(candidateCode);
        continue;
      }
      
      const { above, below } = this.findClosestUnlistedCodes(candidateCode);
      above.forEach(code => unlistedSet.add(code));
      below.forEach(code => unlistedSet.add(code));
    }
    
    // Enrich unlisted codes
    for (const unlistedCode of Array.from(unlistedSet)) {
      try {
        const filePath = `UpdatedCPT/${unlistedCode}.json`;
        const exists = await services.azureStorageService.fileExists(filePath);
        
        if (exists) {
          const content = await services.azureStorageService.getFileContent(filePath);
          const cptJsonData = JSON.parse(content);

          let commonLanguageDescription = '';
          if (cptJsonData.common_language_description) {
            const sentences = cptJsonData.common_language_description.split(/(?<=[.!?])\s+/);
            commonLanguageDescription = sentences.slice(0, 1).join(' ');
          }

          unlistedCodes.push({
            code: unlistedCode,
            officialDescription: cptJsonData.official_description || cptJsonData.TITLE || '',
            commonLanguageDescription
          });
        } else {
          unlistedCodes.push({
            code: unlistedCode,
            officialDescription: `Unlisted procedure code`
          });
        }
      } catch (error) {
        logger.logWarn(this.name, `Failed to enrich unlisted code ${unlistedCode}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        unlistedCodes.push({
          code: unlistedCode,
          officialDescription: `Unlisted procedure code`
        });
      }
    }
    
    return unlistedCodes;
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
        below.unshift(unlistedNum.toString().padStart(5, '0'));
        if (below.length === 2) break;
      }
    }
    
    return { above, below };
  }

  /**
   * Step 3: Final CPT selection using the same mapping prompts as before
   */
  private async performFinalCPTSelection(
    context: LoggedAgentExecutionContext,
    enrichedProcedures: EnrichedProcedureWithCandidates[],
    fullNoteText: string
  ): Promise<FinalCPTSelectionResult> {
    const { logger } = context;

    // Format the procedures with candidate codes and unlisted codes for the prompt
    const formattedProcedures = enrichedProcedures.map((proc, index) => {
      const candidateList = proc.vectorCandidates.map(candidate => 
        `${candidate.code}: ${candidate.officialDescription}${candidate.commonLanguageDescription ? ` (${candidate.commonLanguageDescription})` : ''}`
      ).join('\n  ');
      
      const unlistedList = proc.unlistedCodes.map(unlisted => 
        `${unlisted.code}: ${unlisted.officialDescription}${unlisted.commonLanguageDescription ? ` (${unlisted.commonLanguageDescription})` : ''}`
      ).join('\n  ');

      let formattedProc = `Procedure ${index + 1}: ${proc.approach || 'Unknown approach'} procedure on ${proc.anatomy.join(', ') || 'unknown anatomy'}
Evidence: ${proc.evidence_snippets.join('; ')}
Details: Approach: ${proc.approach || 'not specified'}, Anatomy: ${proc.anatomy.join(', ')}, Laterality: ${proc.laterality || 'not specified'}
Key Factors: ${[
  proc.recurrence === true ? 'recurrent' : null,
  proc.incarcerated === true ? 'incarcerated' : null,
  proc.mesh_placed === true ? 'mesh placed' : null,
  proc.assistant_role !== 'none' ? `assistant: ${proc.assistant_role}` : null
].filter(Boolean).join(', ')}
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
    
    logger.logInfo(this.name, "Final CPT selection - Full Prompt", {
      promptLength: prompt.length,
      procedureCount: enrichedProcedures.length,
      fullPrompt: prompt,
      formattedProcedures: formattedProcedures,
      formattedProceduresPreview: formattedProcedures.substring(0, 500) + (formattedProcedures.length > 500 ? '...' : '')
    });

    try {
      // Create AI model service instance for final selection
      const aiModelService = new AIModelService({
        provider: 'azure',
        model: 'o4-mini',
        reasoning_effort: 'low',
        maxTokens: 3048,
        // temperature:0.1,
        timeout: 60000
      }, logger, 'cpt_final_selection', true);
      
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

      logger.logInfo(this.name, "Final CPT selection - AI Response", {
        rawResponse: typeof response === 'string' ? response : JSON.stringify(response),
        responseLength: (typeof response === 'string' ? response : JSON.stringify(response)).length,
        parsedResult: JSON.stringify(parsedResult, null, 2),
        validatedResult: JSON.stringify(validatedResult, null, 2)
      });

      logger.logInfo(this.name, "Final CPT selection completed", {
        selectedCodes: validatedResult.procedureCodes.length,
        codes: validatedResult.procedureCodes.map(c => ({ 
          code: c.code, 
          elementName: c.elementName,
          linkedDiagnoses: c.linkedDiagnoses,
          units: c.units,
          evidence: c.evidence,
          rationale: c.rationale
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
   * Transforms the final selection results into EnhancedProcedureCode format
   */
  private async transformFinalSelectionToEnhancedProcedureCodes(
    context: LoggedAgentExecutionContext,
    finalSelection: FinalCPTSelectionResult,
    originalProcedures: EnrichedProcedureWithCandidates[]
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
          modifierExplanation: selectedCode.modifierExplanation || '',
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
          modifierExplanation: selectedCode.modifierExplanation || '',
          isPrimary: true,
          mueLimit: 1,
          mai: 1 as 1 | 2 | 3,
          modifiersLinked: [],
          icd10Linked: [],
          addOnLinked: [],
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