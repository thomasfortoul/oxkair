/**
 * CPT Agent - Refactored from CodeExtractionAgent
 *
 * This agent is responsible for extracting CPT codes in a 2-step process:
 * 1. Candidate CPT Extraction - Identify potential CPT codes from clinical notes
 * 2. CPT Selection - Select the final primary and add-on CPT codes with validation
 *
 * Add-on codes are validated against their linked primary codes using database lookup.
 * Each step includes database fetches for data enrichment.
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
  HierarchyLevel,
  CPTCodeValidation
} from "./newtypes.ts";
import { 
  CodeDataInsights, 
  EnhancedCPTCodeData, 
  parseGlobalDays 
} from "../services/service-types.ts";
import {
  procedureExtractionPrompt,
  cptMappingPrompt,
} from "./prompts/code-extraction-prompts.ts";
import { getUnlistedCodesInRange, isUnlistedCode } from "../constants/unlisted-codes.ts";

// ============================================================================
// CPT AGENT SCHEMAS AND TYPES
// ============================================================================

// Step A1: Candidate CPT Extraction Output Schema - Enhanced based on procedureExtractionPrompt
const CandidateExtractionSchema = z.object({
  procedures: z.array(z.object({
    id: z.string(),
    details: z.string().min(1),
    keyFactors: z.array(z.string()),
    cptCode: z.string().regex(/^\d{5}$/),
    addOn: z.boolean(),
    linkedPrimaryId: z.string().nullable(),
    rationale: z.string().min(1),
    evidence: z.string()
  })).min(1)
});

// Step A2: CPT Selection Output Schema - Enhanced to match cptMappingPrompt output
const CptSelectionSchema = z.object({
  procedureCodes: z.array(
    z.object({
      elementName: z.string().min(1),
      code: z.string().regex(/^\d{5}$/),
      description: z.string().min(1),
      units: z.number().positive().int(),
      evidence: z.array(z.string()).min(1), // Changed from evidenceText array to simple string array
      linkedDiagnoses: z.array(z.string()),
      rationale: z.string().min(1)
    })
  )
});


// Internal types for the agent
interface CandidateExtractionResult {
  procedures: Array<{
    id: string;
    details: string;
    keyFactors: string[];
    cptCode: string;
    addOn: boolean;
    linkedPrimaryId: string | null;
    rationale: string;
    evidence: string;
  }>;
}

interface CptSelectionResult {
  procedureCodes: Array<{
    elementName: string;
    code: string;
    description: string;
    units: number;
    evidence: string[];
    linkedDiagnoses: string[];
    rationale: string;
  }>;
}


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

// Type for flagged codes during validation
type FlaggedCode = {
  code: string;
  issue: string;
  action: "remove" | "convert" | "flag";
};

// ============================================================================
// CPT AGENT IMPLEMENTATION
// ============================================================================

export class CPTAgent extends Agent {
  readonly name = "cpt_agent";
  readonly description =
    "Extracts and validates CPT procedure codes from clinical notes using a 2-step process with add-on validation";
  readonly requiredServices = ["aiModel", "azureStorageService"] as const;

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

      // Step A1: Candidate CPT Extraction
      logger.logInfo(this.name, "Starting Step A1: Candidate CPT Extraction");
      const candidateResult = await this.runCandidateExtraction(context, fullNoteText);

      // Validate code types and separate primary from add-on codes
      logger.logInfo(this.name, "Validating code types and separating primary from add-on codes");
      const validationResult = await this.validateCodeTypes(context, candidateResult.procedures);
      
      if (validationResult.flaggedCodes.length > 0) {
        logger.logWarn(this.name, "Code type validation issues found", {
          flaggedCodes: validationResult.flaggedCodes
        });
      }

      // Inter-step DB Fetch: Use new precise CPT code handling for each procedure
      logger.logInfo(this.name, "Fetching CPT candidates using precise code handling");
      const allPrimaryCptCandidates = await this.fetchPreciseCptCandidates(context, validationResult.validPrimary);

      if (allPrimaryCptCandidates.length === 0) {
        const error = this.createError(
          "No primary CPT candidates found in database for the extracted procedures",
          ProcessingErrorSeverity.MEDIUM
        );
        return this.createFailureResult([error], evidence, Date.now() - startTime);
      }

      // Step A2: CPT Selection (now includes add-on validation)
      logger.logInfo(this.name, "Starting Step A2: CPT Selection with add-on validation");
      const selectionResult = await this.runCptSelection(context, fullNoteText, validationResult.validPrimary, validationResult.validAddOns, allPrimaryCptCandidates);

      // Transform results to EnhancedProcedureCode format
      const finalProcedureCodes = await this.transformToEnhancedProcedureCodes(
        context,
        selectionResult.procedureCodes,
        allPrimaryCptCandidates
      );

      // Create evidence
      if (finalProcedureCodes.length > 0) {
        evidence.push(
          this.createEvidence(
            finalProcedureCodes.flatMap((p) =>
              p.evidence.flatMap((e) => e.verbatimEvidence)
            ),
            "Extracted CPT procedure codes",
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

      logger.logInfo(this.name, "CPT Agent execution completed", {
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
      console.error("Error in CPTAgent:", error);
      const processingError = this.createError(
        error instanceof Error ? error.message : "An unknown error occurred during CPT extraction.",
        ProcessingErrorSeverity.CRITICAL
      );
      return this.createFailureResult([processingError], evidence, executionTime);
    }
  }

  /**
   * Step A1: Candidate CPT Extraction
   * Analyzes clinical note to extract procedure summary and identify potential CPT code range
   */
  private async runCandidateExtraction(
    context: LoggedAgentExecutionContext,
    fullNoteText: string
  ): Promise<CandidateExtractionResult> {
    const { logger, services } = context;

    // Use adapted procedure extraction prompt focused on candidate identification
    const prompt = this.createCandidateExtractionPrompt(fullNoteText);

    try {
      const result = await this.loggedApiCall(
        context,
        "aiModel",
        "generateStructuredOutput",
        () => services.aiModel.generateStructuredOutput<CandidateExtractionResult>(prompt, CandidateExtractionSchema, "o4-mini"),
        { prompt, schema: CandidateExtractionSchema }
      );

      logger.logInfo(this.name, "Candidate extraction completed", {
        proceduresExtracted: result.procedures.length,
        procedures: result.procedures.map(p => ({
          id: p.id,
          details: p.details.substring(0, 100) + (p.details.length > 100 ? '...' : ''),
          cptCode: p.cptCode,
          addOn: p.addOn,
          linkedPrimaryId: p.linkedPrimaryId
        }))
      });

      return result;
    } catch (error) {
      throw new Error(`Candidate CPT extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Step A2: CPT Selection
   * Selects the exact primary CPT codes and validates add-on codes from candidates based on clinical note
   */
  private async runCptSelection(
    context: LoggedAgentExecutionContext,
    fullNoteText: string,
    validPrimaryProcedures: CandidateExtractionResult['procedures'],
    validAddOnProcedures: CandidateExtractionResult['procedures'],
    primaryCptCandidates: CptCodeData[]
  ): Promise<CptSelectionResult> {
    const { logger, services } = context;

    // Validate add-on codes against their linked primary codes
    const validatedAddOns = await this.validateAddOnCodesAgainstPrimary(context, validAddOnProcedures, validPrimaryProcedures);

    const prompt = await this.createCptSelectionPrompt(context, fullNoteText, validPrimaryProcedures, validatedAddOns, primaryCptCandidates);

    try {
      const result = await this.loggedApiCall(
        context,
        "aiModel",
        "generateStructuredOutput",
        () => services.aiModel.generateStructuredOutput<CptSelectionResult>(prompt, CptSelectionSchema, "o4-mini"),
        { prompt, schema: CptSelectionSchema }
      );

      logger.logInfo(this.name, "CPT selection completed", {
        selectedCodes: result.procedureCodes.length,
        codes: result.procedureCodes.map(p => p.code),
        procedures: result.procedureCodes.map(p => ({ code: p.code, elementName: p.elementName }))
      });

      return result;
    } catch (error) {
      throw new Error(`CPT selection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }


  /**
   * Handles precise CPT code lookup with hierarchy-based candidate selection
   */
  private async handlePreciseCPTCode(
    context: LoggedAgentExecutionContext,
    cptCode: string
  ): Promise<{
    candidateCodes: CptCodeData[];
    strategy: 'hierarchy' | 'range_extension';
  }> {
    const { logger } = context;
    
    // 1. Check if code exists in database
    const codeExists = await this.checkCPTCodeExists(context, cptCode);
    
    if (codeExists) {
      logger.logInfo(this.name, `CPT code ${cptCode} exists, using hierarchy strategy`);
      
      // 2. Fetch the code's JSON data including hierarchy
      const codeData = await this.fetchCPTCodeWithHierarchy(context, cptCode);
      
      if (codeData && codeData.hierarchy) {
        // 3. Extract all individual codes from highest hierarchy level
        const individualCodes = this.extractIndividualCodesFromHierarchy(codeData.hierarchy);
        
        // Fetch detailed data for all individual codes
        const candidateCodes = await this.fetchCptCodesData(context, individualCodes);
        
        return {
          candidateCodes,
          strategy: 'hierarchy'
        };
      }
    }
    
    logger.logInfo(this.name, `CPT code ${cptCode} not found or no hierarchy, using range extension strategy`);
    
    // 4. Extend range by ±10 and fetch all codes in that range
    const extendedCodes = await this.fetchExtendedRangeCodes(context, cptCode, 10);
    
    return {
      candidateCodes: extendedCodes,
      strategy: 'range_extension'
    };
  }

  /**
   * Checks if a CPT code exists in the database
   */
  private async checkCPTCodeExists(
    context: LoggedAgentExecutionContext,
    cptCode: string
  ): Promise<boolean> {
    const { services } = context;
    try {
      const filePath = `UpdatedCPT/${cptCode}.json`;
      return await services.azureStorageService.fileExists(filePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Fetches CPT code data with hierarchy information
   */
  private async fetchCPTCodeWithHierarchy(
    context: LoggedAgentExecutionContext,
    cptCode: string
  ): Promise<{ hierarchy?: HierarchyLevel[] } | null> {
    const { services, logger } = context;
    try {
      const filePath = `UpdatedCPT/${cptCode}.json`;
      const content = await services.azureStorageService.getFileContent(filePath);
      const cptData = JSON.parse(content);
      
      // Extract hierarchy if available
      const hierarchy = cptData.hierarchy || cptData.hierarchy_levels || [];
      
      return { hierarchy };
    } catch (error) {
      logger.logWarn(this.name, `Failed to fetch CPT code with hierarchy: ${cptCode}`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Extracts individual codes from hierarchy levels
   */
  private extractIndividualCodesFromHierarchy(hierarchy: HierarchyLevel[]): string[] {
    if (!hierarchy || hierarchy.length === 0) return [];
    
    // Find the highest level (deepest) that contains individual codes (not ranges)
    const maxLevel = Math.max(...hierarchy.map(h => h.level));
    
    // Get all codes at the highest level that represent individual codes
    const individualCodes = hierarchy
      .filter(h => h.level === maxLevel && !h.code.includes('-'))
      .map(h => h.code);
    
    // If no individual codes found at max level, look one level up
    if (individualCodes.length === 0) {
      const secondMaxLevel = Math.max(...hierarchy.filter(h => h.level < maxLevel).map(h => h.level));
      return hierarchy
        .filter(h => h.level === secondMaxLevel && !h.code.includes('-'))
        .map(h => h.code);
    }
    
    return individualCodes;
  }

  /**
   * Fetches extended range codes around a given CPT code
   */
  private async fetchExtendedRangeCodes(
    context: LoggedAgentExecutionContext,
    cptCode: string,
    extension: number
  ): Promise<CptCodeData[]> {
    const { logger } = context;
    const baseCode = parseInt(cptCode);
    const startCode = Math.max(0, baseCode - extension);
    const endCode = Math.min(99999, baseCode + extension);
    
    const codes: string[] = [];
    for (let code = startCode; code <= endCode; code++) {
      codes.push(code.toString().padStart(5, '0'));
    }
    
    logger.logInfo(this.name, `Fetching extended range codes`, {
      baseCode: cptCode,
      range: `${startCode.toString().padStart(5, '0')}-${endCode.toString().padStart(5, '0')}`,
      totalCodes: codes.length
    });
    
    return await this.fetchCptCodesData(context, codes);
  }

  /**
   * Fetches detailed CPT code information for multiple codes
   */
  private async fetchCptCodesData(
    context: LoggedAgentExecutionContext,
    codes: string[]
  ): Promise<CptCodeData[]> {
    const { logger, services } = context;
    const cptCodeData: CptCodeData[] = [];

    // Check which files exist and retrieve them
    const existenceChecks = codes.map(async (code) => {
      const filePath = `UpdatedCPT/${code}.json`;
      try {
        const exists = await services.azureStorageService.fileExists(filePath);
        return exists ? code : null;
      } catch (error) {
        return null;
      }
    });

    const existenceResults = await Promise.all(existenceChecks);
    const existingCodes = existenceResults.filter((code): code is string => code !== null);

    // Retrieve CPT data for existing codes
    const retrievalPromises = existingCodes.map(async (code) => {
      try {
        const filePath = `UpdatedCPT/${code}.json`;
        const content = await services.azureStorageService.getFileContent(filePath);
        const cptData = JSON.parse(content);

        // Extract first 2 sentences of common_language_description if available
        let commonLanguageDescription = '';
        if (cptData.common_language_description) {
          // Split by sentence endings and take first 2 sentences
          const sentences = cptData.common_language_description.split(/(?<=[.!?])\s+/);
          commonLanguageDescription = sentences.slice(0, 2).join(' ');
        }

        return {
          code: cptData.code_title || cptData.HCPCS || code,
          title: cptData.official_description || cptData.TITLE || '',
          summary: cptData.official_description || cptData.DESCRIPTION || '',
          commonLanguageDescription: commonLanguageDescription,
          globalDays: cptData.code_data_insights?.['Global Days'] || cptData.GLOBAL_DAYS || undefined,
          mueLimit: cptData.code_data_insights?.MUE ? parseInt(cptData.code_data_insights.MUE) : (cptData.MUE_LIMIT ? parseInt(cptData.MUE_LIMIT) : undefined),
          allowed_modifiers: cptData.modifier_assist ? Object.keys(cptData.modifier_assist) : (cptData.ALLOWED_MODIFIERS || []),
          allowed_icd_families: cptData.ALLOWED_ICD_FAMILIES || [],
        } as CptCodeData;
      } catch (error) {
        logger.logWarn(this.name, `Failed to retrieve CPT code ${code}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
      }
    });

    const results = await Promise.all(retrievalPromises);
    const validResults = results.filter((result): result is CptCodeData => result !== null);
    cptCodeData.push(...validResults);

    logger.logInfo(this.name, `CPT codes data retrieved`, {
      requestedCodes: codes.length,
      retrievedCodes: cptCodeData.length,
      availabilityRate: codes.length > 0 ? ((cptCodeData.length / codes.length) * 100).toFixed(1) + '%' : '0%'
    });

    return cptCodeData;
  }

  /**
   * Fetches CPT candidates using precise code handling with hierarchy-based selection
   */
  private async fetchPreciseCptCandidates(
    context: LoggedAgentExecutionContext,
    procedures: CandidateExtractionResult['procedures']
  ): Promise<CptCodeData[]> {
    const { logger } = context;
    const allCptCodeData: CptCodeData[] = [];
    const strategyUsage = { hierarchy: 0, range_extension: 0 };

    // Fetch candidates for each procedure using precise handling
    for (const procedure of procedures) {
      logger.logInfo(this.name, `Fetching CPT candidates for procedure: ${procedure.id}`, {
        cptCode: procedure.cptCode,
        details: procedure.details
      });
      
      const { candidateCodes, strategy } = await this.handlePreciseCPTCode(context, procedure.cptCode);
      strategyUsage[strategy]++;
      
      logger.logInfo(this.name, `Strategy used for ${procedure.cptCode}: ${strategy}`, {
        candidatesFound: candidateCodes.length
      });
      
      allCptCodeData.push(...candidateCodes);
    }

    // Remove duplicates based on code
    const uniqueCodes = new Map<string, CptCodeData>();
    allCptCodeData.forEach(cpt => {
      if (!uniqueCodes.has(cpt.code)) {
        uniqueCodes.set(cpt.code, cpt);
      }
    });

    const finalCandidates = Array.from(uniqueCodes.values());
    logger.logInfo(this.name, `Precise CPT candidates retrieved`, {
      totalProcedures: procedures.length,
      totalCandidates: finalCandidates.length,
      uniqueCodes: finalCandidates.length,
      strategyUsage
    });

    return finalCandidates;
  }

  /**
   * Fetches detailed CPT code information for all procedure candidate ranges from database
   * @deprecated Use fetchPreciseCptCandidates instead
   */
  private async fetchAllPrimaryCptCandidates(
    context: LoggedAgentExecutionContext,
    procedures: CandidateExtractionResult['procedures']
  ): Promise<CptCodeData[]> {
    const { logger } = context;
    const allCptCodeData: CptCodeData[] = [];

    // Fetch candidates for each procedure
    for (const procedure of procedures) {
      logger.logInfo(this.name, `Fetching CPT candidates for procedure: ${procedure.id}`, {
        cptCode: procedure.cptCode
      });
      
      const procedureCandidates = await this.fetchPrimaryCptCandidates(context, { startCode: procedure.cptCode, endCode: procedure.cptCode });
      allCptCodeData.push(...procedureCandidates);
    }

    // Remove duplicates based on code
    const uniqueCodes = new Map<string, CptCodeData>();
    allCptCodeData.forEach(cpt => {
      if (!uniqueCodes.has(cpt.code)) {
        uniqueCodes.set(cpt.code, cpt);
      }
    });

    const finalCandidates = Array.from(uniqueCodes.values());
    logger.logInfo(this.name, `All primary CPT candidates retrieved`, {
      totalProcedures: procedures.length,
      totalCandidates: finalCandidates.length,
      uniqueCodes: finalCandidates.length
    });

    return finalCandidates;
  }

  /**
   * Fetches detailed CPT code information for the candidate range from database
   */
  private async fetchPrimaryCptCandidates(
    context: LoggedAgentExecutionContext,
    codeRange: { startCode: string; endCode: string }
  ): Promise<CptCodeData[]> {
    const { logger, services } = context;
    const cptCodeData: CptCodeData[] = [];

    try {
      const startCode = parseInt(codeRange.startCode);
      const endCode = parseInt(codeRange.endCode);
      const allCodes = new Set<string>();

      // Generate all codes in the range
      for (let code = startCode; code <= endCode; code++) {
        allCodes.add(code.toString().padStart(5, '0'));
      }

      // Add unlisted codes in extended range
      const extendedStartCode = Math.max(0, startCode - 500);
      const extendedEndCode = Math.min(99999, endCode + 500);
      const unlistedCodes = getUnlistedCodesInRange(extendedStartCode, extendedEndCode);
      unlistedCodes.forEach(code => allCodes.add(code));

      // Check which files exist and retrieve them
      const existenceChecks = Array.from(allCodes).map(async (code) => {
        const filePath = `UpdatedCPT/${code}.json`;
        logger.logDebug(this.name, `Checking existence of CPT file: ${filePath}`);
        try {
          const exists = await services.azureStorageService.fileExists(filePath);
          logger.logDebug(this.name, `CPT file ${filePath} exists: ${exists}`);
          return exists ? code : null;
        } catch (error) {
          logger.logWarn(this.name, `Error checking CPT file existence: ${filePath}`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return null;
        }
      });

      const existenceResults = await Promise.all(existenceChecks);
      const existingCodes = existenceResults.filter((code): code is string => code !== null);

      // Retrieve CPT data for existing codes
      const retrievalPromises = existingCodes.map(async (code) => {
        try {
          const filePath = `UpdatedCPT/${code}.json`;
          logger.logDebug(this.name, `Fetching CPT data from: ${filePath}`);
          const content = await services.azureStorageService.getFileContent(filePath);
          logger.logDebug(this.name, `Retrieved CPT content for ${code}`, {
            contentLength: content.length,
            contentPreview: content.substring(0, 200) + '...'
          });
          
          const cptData = JSON.parse(content);
          logger.logDebug(this.name, `Parsed CPT data for ${code}`, {
            hasModifierAssist: !!cptData.modifier_assist,
            modifierAssistKeys: cptData.modifier_assist ? Object.keys(cptData.modifier_assist).length : 0,
            cptDataKeys: Object.keys(cptData)
          });

          // Parse code_data_insights if available
          const codeDataInsights: CodeDataInsights | undefined = cptData.code_data_insights ? {
            "Short Descr": cptData.code_data_insights["Short Descr"],
            "Medium Descr": cptData.code_data_insights["Medium Descr"],
            "Long Descr": cptData.code_data_insights["Long Descr"],
            "Status Code": cptData.code_data_insights["Status Code"],
            "Global Days": parseGlobalDays(cptData.code_data_insights["Global Days"]),
            "PC/TC Indicator (26, TC)": cptData.code_data_insights["PC/TC Indicator (26, TC)"],
            "Multiple Procedures (51)": cptData.code_data_insights["Multiple Procedures (51)"],
            "Bilateral Surgery (50)": cptData.code_data_insights["Bilateral Surgery (50)"],
            "Physician Supervisions": cptData.code_data_insights["Physician Supervisions"],
            "Assistant Surgeon (80, 82)": cptData.code_data_insights["Assistant Surgeon (80, 82)"],
            "Co-Surgeons (62)": cptData.code_data_insights["Co-Surgeons (62)"],
            "Team Surgery (66)": cptData.code_data_insights["Team Surgery (66)"],
            "Diagnostic Imaging Family": cptData.code_data_insights["Diagnostic Imaging Family"],
            "APC Status Indicator": cptData.code_data_insights["APC Status Indicator"],
            "Type of Service (TOS)": cptData.code_data_insights["Type of Service (TOS)"],
            "Berenson-Eggers TOS (BETOS)": cptData.code_data_insights["Berenson-Eggers TOS (BETOS)"],
            "MUE": cptData.code_data_insights["MUE"],
            "CCS Clinical Classification": cptData.code_data_insights["CCS Clinical Classification"]
          } : undefined;

          // Extract first 2 sentences of common_language_description if available
          let commonLanguageDescription = '';
          if (cptData.common_language_description) {
            // Split by sentence endings and take first 2 sentences
            const sentences = cptData.common_language_description.split(/(?<=[.!?])\s+/);
            commonLanguageDescription = sentences.slice(0, 2).join(' ');
          }

          return {
            code: cptData.code_title || cptData.HCPCS || code,
            title: cptData.official_description || cptData.TITLE || '',
            summary: cptData.official_description || cptData.DESCRIPTION || '',
            commonLanguageDescription: commonLanguageDescription,
            globalDays: parseGlobalDays(cptData.code_data_insights?.['Global Days']) || cptData.GLOBAL_DAYS || undefined,
            mueLimit: cptData.code_data_insights?.MUE ? parseInt(cptData.code_data_insights.MUE) : (cptData.MUE_LIMIT ? parseInt(cptData.MUE_LIMIT) : undefined),
            allowed_modifiers: cptData.modifier_assist ? Object.keys(cptData.modifier_assist) : (cptData.ALLOWED_MODIFIERS || []),
            allowed_icd_families: cptData.ALLOWED_ICD_FAMILIES || [],
            codeDataInsights: codeDataInsights,
          } as CptCodeData;
        } catch (error) {
          logger.logWarn(this.name, `Failed to retrieve CPT code ${code}`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return null;
        }
      });

      const results = await Promise.all(retrievalPromises);
      const validResults = results.filter((result): result is CptCodeData => result !== null && typeof result === 'object' && result !== undefined);
      cptCodeData.push(...validResults);

      logger.logInfo(this.name, `Primary CPT candidates retrieved`, {
        requestedCodes: allCodes.size,
        retrievedCodes: cptCodeData.length,
        availabilityRate: allCodes.size > 0 ? ((cptCodeData.length / allCodes.size) * 100).toFixed(1) + '%' : '0%'
      });

    } catch (error) {
      logger.logError(this.name, 'Failed to fetch primary CPT candidates', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return cptCodeData;
  }


  /**
   * Validates add-on codes against their linked primary codes using database lookup
   */
  private async validateAddOnCodesAgainstPrimary(
    context: LoggedAgentExecutionContext,
    addOnProcedures: CandidateExtractionResult['procedures'],
    primaryProcedures: CandidateExtractionResult['procedures']
  ): Promise<CandidateExtractionResult['procedures']> {
    const { logger, services } = context;
    const validatedAddOns: CandidateExtractionResult['procedures'] = [];

    for (const addOn of addOnProcedures) {
      // Find the linked primary procedure
      const linkedPrimary = primaryProcedures.find(p => p.id === addOn.linkedPrimaryId);
      
      if (!linkedPrimary) {
        logger.logWarn(this.name, `Add-on code ${addOn.cptCode} has no valid linked primary`, {
          addOnId: addOn.id,
          linkedPrimaryId: addOn.linkedPrimaryId
        });
        continue;
      }

      // Fetch the primary code's database entry to check allowed add-on codes
      try {
        const primaryFilePath = `UpdatedCPT/${linkedPrimary.cptCode}.json`;
        const primaryExists = await services.azureStorageService.fileExists(primaryFilePath);
        
        if (!primaryExists) {
          logger.logWarn(this.name, `Primary code ${linkedPrimary.cptCode} not found in database`);
          continue;
        }

        const primaryContent = await services.azureStorageService.getFileContent(primaryFilePath);
        const primaryData = JSON.parse(primaryContent);

        // Check if the add-on code is in the allowed add-on codes for this primary
        const allowedAddOns = primaryData.add_on_codes || {};
        const isValidAddOn = Object.keys(allowedAddOns).includes(addOn.cptCode);

        if (isValidAddOn) {
          validatedAddOns.push(addOn);
          logger.logInfo(this.name, `Add-on code ${addOn.cptCode} validated for primary ${linkedPrimary.cptCode}`);
        } else {
          logger.logWarn(this.name, `Add-on code ${addOn.cptCode} not allowed for primary ${linkedPrimary.cptCode}`, {
            allowedAddOns: Object.keys(allowedAddOns)
          });
        }
      } catch (error) {
        logger.logError(this.name, `Error validating add-on code ${addOn.cptCode}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.logInfo(this.name, `Add-on validation completed`, {
      totalAddOns: addOnProcedures.length,
      validatedAddOns: validatedAddOns.length,
      rejectedAddOns: addOnProcedures.length - validatedAddOns.length
    });

    return validatedAddOns;
  }

  /**
   * Validates code types and separates primary from add-on codes
   */
  private async validateCodeTypes(
    context: LoggedAgentExecutionContext,
    procedures: CandidateExtractionResult['procedures']
  ): Promise<{
    validPrimary: CandidateExtractionResult['procedures'];
    validAddOns: CandidateExtractionResult['procedures'];
    flaggedCodes: FlaggedCode[];
  }> {
    const validPrimary: CandidateExtractionResult['procedures'] = [];
    const validAddOns: CandidateExtractionResult['procedures'] = [];
    const flaggedCodes: FlaggedCode[] = [];

    for (const proc of procedures) {
      const validation = await this.validateCPTCodeType(context, proc.cptCode);
      
      if (proc.addOn === true) {
        if (validation.isAddOn) {
          validAddOns.push(proc);
        } else {
          // Add-on marked but not actually add-on - convert to primary
          flaggedCodes.push({
            code: proc.cptCode,
            issue: 'Marked as add-on but is actually primary code',
            action: 'convert'
          });
          validPrimary.push({...proc, addOn: false, linkedPrimaryId: null});
        }
      } else {
        if (validation.isPrimary) {
          validPrimary.push(proc);
        } else {
          // Primary marked but not actually primary - remove
          flaggedCodes.push({
            code: proc.cptCode,
            issue: 'Marked as primary but is not a primary code',
            action: 'remove'
          });
        }
      }
    }

    return { validPrimary, validAddOns, flaggedCodes };
  }

  /**
   * Validates CPT code type (primary vs add-on)
   */
  private async validateCPTCodeType(
    context: LoggedAgentExecutionContext,
    cptCode: string
  ): Promise<CPTCodeValidation> {
    const { services, logger } = context;
    try {
      const filePath = `UpdatedCPT/${cptCode}.json`;
      const exists = await services.azureStorageService.fileExists(filePath);
      
      if (!exists) {
        return {
          exists: false,
          isPrimary: false,
          isAddOn: false,
          validationErrors: ['Code does not exist in database']
        };
      }
      
      const content = await services.azureStorageService.getFileContent(filePath);
      const cptData = JSON.parse(content);
      
      // Check if it's a primary code (has is_primary field or no add_on_codes)
      const isPrimary = cptData.is_primary === true || 
                       (!cptData.add_on_codes || Object.keys(cptData.add_on_codes).length === 0);
      
      // Check if it's an add-on code (has add_on_codes field with entries)
      const isAddOn = cptData.add_on_codes && Object.keys(cptData.add_on_codes).length > 0;
      
      return {
        exists: true,
        isPrimary,
        isAddOn,
        validationErrors: []
      };
    } catch (error) {
      logger.logWarn(this.name, `CPT code validation error for ${cptCode}`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        exists: false,
        isPrimary: false,
        isAddOn: false,
        validationErrors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Formats candidate codes for prompt with identified code first
   */
  private formatCandidateCodesForPrompt(
    identifiedCode: string,
    candidateCodes: CptCodeData[],
    unlistedCodes: string[]
  ): string {
    let formatted = '';
    
    // Helper function to format code description with common language description
    const formatCodeDescription = (code: CptCodeData): string => {
      let description = code.title; // Use official description as the first sentence
      
      // For codes listed in cptMappingPrompt (regular codes), append first 2 sentences of common_language_description
      if (code.commonLanguageDescription && code.commonLanguageDescription.trim()) {
        description += ` ${code.commonLanguageDescription}`;
      }
      
      return description;
    };
    
    // 1. List identified code first
    const identifiedData = candidateCodes.find(c => c.code === identifiedCode);
    if (identifiedData) {
      const description = formatCodeDescription(identifiedData);
      formatted += `Identified Code:\n• ${identifiedCode}: ${description}\n\n`;
    }
    
    // 2. List other candidates
    const otherCandidates = candidateCodes.filter(c => c.code !== identifiedCode);
    if (otherCandidates.length > 0) {
      formatted += `Available Candidates:\n`;
      otherCandidates.forEach(code => {
        const description = formatCodeDescription(code);
        formatted += `• ${code.code}: ${description}\n`;
      });
      formatted += '\n';
    }
    
    // 3. List unlisted codes
    if (unlistedCodes.length > 0) {
      formatted += `Available Unlisted Codes:\n`;
      unlistedCodes.forEach(code => {
        // For unlisted codes, check if we have data for them in candidateCodes
        const unlistedData = candidateCodes.find(c => c.code === code);
        if (unlistedData) {
          // If we have data, format it the same way as regular codes
          const description = formatCodeDescription(unlistedData);
          formatted += `• ${code}: ${description}\n`;
        } else {
          // For unlisted codes without data, their common_language_description may be empty — if so, leave it empty
          // Still use the official description as the first sentence regardless
          formatted += `• ${code}: Unlisted procedure code\n`;
        }
      });
    }
    
    return formatted;
  }

  /**
   * Helper method to determine if a CPT code is primary or add-on
   */
  private async isPrimaryCode(context: LoggedAgentExecutionContext, cptCode: string): Promise<boolean> {
    const validation = await this.validateCPTCodeType(context, cptCode);
    return validation.isPrimary;
  }

  /**
   * Transforms the AI results into EnhancedProcedureCode format
   */
  private async transformToEnhancedProcedureCodes(
    context: LoggedAgentExecutionContext,
    allProcedureCodes: CptSelectionResult['procedureCodes'],
    allCptData: CptCodeData[]
  ): Promise<EnhancedProcedureCode[]> {
    const { logger } = context;
    const finalCodes: EnhancedProcedureCode[] = [];

    // Create lookup map for all CPT data
    const cptLookup = new Map(allCptData.map(item => [item.code, item]));

    // Transform all procedure codes (both primary and add-on)
    for (const proc of allProcedureCodes) {
      const cptData = cptLookup.get(proc.code);
      const description = proc.description || (cptData ? (cptData.summary || cptData.title) : `Procedure: ${proc.code}`);

      // Determine if this is a primary or add-on code based on the elementName or code validation
      const isPrimary = await this.isPrimaryCode(context, proc.code);

      finalCodes.push({
        code: proc.code,
        description: description,
        units: proc.units,
        evidence: proc.evidence.map((evidenceText) =>
          this.createEvidence(
            [evidenceText],
            `Evidence for CPT ${proc.code}`,
            1.0,
            Notes.OPERATIVE,
          ),
        ),
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

    logger.logInfo(this.name, "Transformed to EnhancedProcedureCode format", {
      totalCodes: finalCodes.length,
      primaryCodes: finalCodes.filter(c => c.isPrimary).length,
      addOnCodes: finalCodes.filter(c => !c.isPrimary).length
    });

    return finalCodes;
  }

  /**
   * Creates the prompt for Step A1: Candidate CPT Extraction
   * Uses the detailed procedureExtractionPrompt structure
   */
  private createCandidateExtractionPrompt(fullNoteText: string): string {
    return procedureExtractionPrompt(fullNoteText);
  }

  /**
   * Creates the prompt for Step A2: CPT Selection
   * Uses the enhanced cptMappingPrompt structure with new format including add-on codes
   */
  private async createCptSelectionPrompt(
    context: LoggedAgentExecutionContext,
    fullNoteText: string,
    validPrimaryProcedures: CandidateExtractionResult['procedures'],
    validatedAddOnProcedures: CandidateExtractionResult['procedures'],
    primaryCptCandidates: CptCodeData[]
  ): Promise<string> {
    // Create a map of CPT code to its hierarchy candidates for efficient lookup
    const codeHierarchyMap = new Map<string, CptCodeData[]>();
    const unlistedCodeMap = new Map<string, string[]>();
    
    // For each primary procedure, get its specific hierarchy candidates
    for (const procedure of validPrimaryProcedures) {
      const { candidateCodes } = await this.handlePreciseCPTCode(context, procedure.cptCode);
      
      // Store the hierarchy candidates for this specific code
      codeHierarchyMap.set(procedure.cptCode, candidateCodes);
      
      // Get unlisted codes for this procedure
      const baseCode = parseInt(procedure.cptCode);
      const extendedStartCode = Math.max(0, baseCode - 500);
      const extendedEndCode = Math.min(99999, baseCode + 500);
      const unlistedCodes = getUnlistedCodesInRange(extendedStartCode, extendedEndCode);
      unlistedCodeMap.set(procedure.cptCode, unlistedCodes);
    }

    // Format procedures using the new format with details and key factors
    const formattedProcedures = validPrimaryProcedures.map((p, index) => {
      const procedureNumber = index + 1;
      
      // Use details field directly instead of constructing sentences
      let procedureDescription = `Procedure ${procedureNumber}: ${p.details}`;
      
      // List key factors as bullet points
      if (p.keyFactors && p.keyFactors.length > 0) {
        procedureDescription += `
Key factors:
${p.keyFactors.map(factor => `• ${factor}`).join('\n')}`;
      }
      
      // Add evidence
      procedureDescription += `
Evidence: ${p.evidence}`;
      
      // Use procedure-specific candidate codes from hierarchy
      const procedureCandidates = codeHierarchyMap.get(p.cptCode) || [];
      const procedureUnlistedCodes = unlistedCodeMap.get(p.cptCode) || [];
      
      const candidateCodesText = this.formatCandidateCodesForPrompt(
        p.cptCode,
        procedureCandidates,
        procedureUnlistedCodes
      );
      
      return `${procedureDescription}

${candidateCodesText}`;
    }).join('\n\n');

    // Handle validated add-on codes if any
    if (validatedAddOnProcedures.length > 0) {
      const formattedAddOns = validatedAddOnProcedures.map((p, index) => {
        const addOnNumber = index + 1;
        const linkedPrimary = validPrimaryProcedures.find(primary => primary.id === p.linkedPrimaryId);
        
        let addOnDescription = `Add on Code ${addOnNumber} for Procedure ${linkedPrimary ? validPrimaryProcedures.indexOf(linkedPrimary) + 1 : 'Unknown'}:
`;
        addOnDescription += `Details: ${p.details}
`;
        
        if (p.keyFactors && p.keyFactors.length > 0) {
          addOnDescription += `Key factors:
${p.keyFactors.map(factor => `• ${factor}`).join('\n')}
`;
        }
        
        addOnDescription += `Evidence: ${p.evidence}`;
        
        return addOnDescription;
      }).join('\n\n');
      
      return cptMappingPrompt(
        JSON.stringify({ diagnoses: [] }, null, 2),
        formattedProcedures + '\n\n' + formattedAddOns,
        fullNoteText
      );
    }

    // Use empty diagnoses for now (will be populated by ICD agent later)
    const formattedDiagnoses = JSON.stringify({ diagnoses: [] }, null, 2);

    return cptMappingPrompt(formattedDiagnoses, formattedProcedures, fullNoteText);
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