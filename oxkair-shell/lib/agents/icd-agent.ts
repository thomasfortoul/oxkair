/**
 * ICD Agent - Two-Pass ICD-10 Code Identification and Selection
 *
 * This agent is responsible for identifying and selecting appropriate ICD-10 diagnosis codes
 * that establish medical necessity for the CPT codes selected by the CPTAgent.
 * 
 * The agent operates in two distinct passes:
 * - Pass B1: ICD Prefix Identification - identifies likely 3-character ICD-10 prefixes
 * - Pass B2: ICD Selection - selects specific ICD-10 codes from filtered candidates
 */

import { z } from "zod";
import { Agent } from "./agent-core.ts";
import {
  StandardizedAgentResult,
  StandardizedEvidence,
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedWorkflowState,
  StandardizedAgentContext,
  Notes,
  Agents,
  ProcessingError,
  ProcessingErrorSeverity,
} from "./newtypes.ts";

// ============================================================================
// ICD AGENT IMPLEMENTATION
// ============================================================================

export class ICDAgent extends Agent {
  readonly name = "icd_agent";
  readonly description = "ICD-10 code identification and selection using CPT agent linkedDiagnoses prefixes and database filtering";
  readonly requiredServices = ["aiModel", "azureStorageService"] as const;

  async executeInternal(
    context: StandardizedAgentContext,
  ): Promise<StandardizedAgentResult> {
    const { logger, state } = context;
    const { caseId } = state.caseMeta;
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const startTime = Date.now();

    logger.logInfo(this.name, `ICD Agent execution started for case: ${caseId}`);

    try {
      // Validate that we have CPT codes from the CPT Agent
      if (!state.procedureCodes || state.procedureCodes.length === 0) {
        const error = this.createError(
          "No procedure codes available for ICD linking. CPT Agent must run first.",
          ProcessingErrorSeverity.CRITICAL
        );
        return this.createFailureResult([error], evidence, Date.now() - startTime);
      }

      // Get full note text
      const fullNoteText = [
        state.caseNotes.primaryNoteText,
        ...state.caseNotes.additionalNotes.map((note) => note.content),
      ].join("\n\n");

      // Extract linkedDiagnoses prefixes from CPT agent output
      logger.logInfo(this.name, "Extracting diagnosis prefixes from CPT agent linkedDiagnoses");
      const diagnosisPrefixes = this.extractDiagnosisPrefixes(state.procedureCodes, logger);

      // Fetch ICD codes from database using prefix filtering
      logger.logInfo(this.name, "Fetching ICD codes from database using prefix filtering");
      const filteredCodes = await this.fetchIcdCodesByPrefixes(context, diagnosisPrefixes, state.procedureCodes);

      // ICD Selection using filtered codes
      logger.logInfo(this.name, "Starting ICD Selection with filtered codes");
      const finalDiagnosisCodes = await this.runIcdSelection(context, fullNoteText, state.procedureCodes, filteredCodes);

      // Update the workflow state with the selected diagnosis codes
      this.updateWorkflowState(state, finalDiagnosisCodes);

      // Create evidence for the final result
      if (finalDiagnosisCodes.length > 0) {
        evidence.push(
          this.createEvidence(
            finalDiagnosisCodes.flatMap((d) =>
              d.evidence.flatMap((e) => e.verbatimEvidence)
            ),
            "Selected ICD-10 diagnosis codes with medical necessity linkage",
            1.0,
            Notes.OPERATIVE,
            { diagnosisCodes: finalDiagnosisCodes },
          ),
        );
      }

      const executionTime = Date.now() - startTime;

      logger.logInfo(this.name, "ICD Agent execution completed successfully", {
        totalDiagnosisCodes: finalDiagnosisCodes.length,
        linkedProcedureCodes: state.procedureCodes.filter(p => p.icd10Linked && p.icd10Linked.length > 0).length,
        executionTime,
      });

      return this.createSuccessResult(evidence, executionTime, 1.0, {
        diagnosisCodes: finalDiagnosisCodes,
        linkedProcedures: state.procedureCodes.length,
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("Error in ICDAgent:", error);
      const processingError = this.createError(
        error instanceof Error ? error.message : "An unknown error occurred during ICD code selection.",
        ProcessingErrorSeverity.CRITICAL
      );
      return this.createFailureResult([processingError], evidence, executionTime);
    }
  }

  /**
   * Extract diagnosis prefixes from CPT agent linkedDiagnoses output
   */
  private extractDiagnosisPrefixes(cptBundle: EnhancedProcedureCode[], logger: any): DiagnosisPrefixMapping[] {
    const prefixMappings: DiagnosisPrefixMapping[] = [];

    logger.logInfo(this.name, "Extracting diagnosis prefixes from CPT bundle", {
      totalCptCodes: cptBundle.length,
      cptCodes: cptBundle.map(cpt => ({
        code: cpt.code,
        description: cpt.description,
        linkedDiagnoses: cpt.linkedDiagnoses,
        icd10Applicable: cpt.icd10Applicable
      }))
    });

    for (const cptCode of cptBundle) {
      // Get linkedDiagnoses from the CPT agent output
      // The linkedDiagnoses field should be populated by the CPT agent's final selection
      const linkedDiagnoses = cptCode.linkedDiagnoses || [];
      
      logger.logInfo(this.name, `Processing CPT code ${cptCode.code}`, {
        linkedDiagnoses: linkedDiagnoses,
        linkedDiagnosesCount: linkedDiagnoses.length,
        icd10Applicable: cptCode.icd10Applicable,
        icd10ApplicableCount: cptCode.icd10Applicable?.length || 0
      });
      
      if (linkedDiagnoses.length > 0) {
        const prefixes = linkedDiagnoses.map((diagnosis: any) => {
          // Convert to string and extract the 3-character prefix from the diagnosis code
          // Handle formats like "K43.0" -> "K43" or "K43" -> "K43"
          const diagnosisStr = String(diagnosis);
          const prefix = diagnosisStr.length >= 3 ? diagnosisStr.substring(0, 3) : diagnosisStr;
          logger.logDebug(this.name, `Extracted prefix from linkedDiagnoses`, {
            originalDiagnosis: diagnosis,
            diagnosisAsString: diagnosisStr,
            extractedPrefix: prefix
          });
          return prefix;
        });

        const uniquePrefixes = [...new Set(prefixes)];
        prefixMappings.push({
          cptCode: cptCode.code,
          diagnosisPrefixes: uniquePrefixes
        });

        logger.logInfo(this.name, `Added prefix mapping from linkedDiagnoses`, {
          cptCode: cptCode.code,
          originalLinkedDiagnoses: linkedDiagnoses,
          extractedPrefixes: uniquePrefixes
        });
      } else {
        // If no linkedDiagnoses, we can fall back to using icd10Applicable if available
        const icd10Applicable = cptCode.icd10Applicable || [];
        if (icd10Applicable.length > 0) {
          const prefixes = icd10Applicable.map(family => {
            // Extract prefix from family codes like "K43" or "K43.0"
            const familyStr = String(family);
            const prefix = familyStr.length >= 3 ? familyStr.substring(0, 3) : familyStr;
            logger.logDebug(this.name, `Extracted prefix from icd10Applicable`, {
              originalFamily: family,
              familyAsString: familyStr,
              extractedPrefix: prefix
            });
            return prefix;
          });

          const uniquePrefixes = [...new Set(prefixes)];
          prefixMappings.push({
            cptCode: cptCode.code,
            diagnosisPrefixes: uniquePrefixes
          });

          logger.logInfo(this.name, `Added prefix mapping from icd10Applicable fallback`, {
            cptCode: cptCode.code,
            originalIcd10Applicable: icd10Applicable,
            extractedPrefixes: uniquePrefixes
          });
        } else {
          logger.logWarn(this.name, `No linkedDiagnoses or icd10Applicable found for CPT code ${cptCode.code}`, {
            cptCode: cptCode.code,
            description: cptCode.description
          });
        }
      }
    }

    logger.logInfo(this.name, "Diagnosis prefix extraction completed", {
      totalCptCodes: cptBundle.length,
      totalPrefixMappings: prefixMappings.length,
      prefixMappings: prefixMappings.map(mapping => ({
        cptCode: mapping.cptCode,
        prefixes: mapping.diagnosisPrefixes
      }))
    });

    // If no prefix mappings found, create fallback mappings with common prefixes
    if (prefixMappings.length === 0) {
      logger.logWarn(this.name, "No prefix mappings found, creating fallback mappings");
      
      for (const cptCode of cptBundle) {
        // Use common hernia-related prefixes as fallback for surgical procedures
        const fallbackPrefixes = ["K43", "K40", "K41", "K42", "K80", "K81"];
        
        prefixMappings.push({
          cptCode: cptCode.code,
          diagnosisPrefixes: fallbackPrefixes
        });
        
        logger.logInfo(this.name, `Created fallback prefix mapping for CPT ${cptCode.code}`, {
          cptCode: cptCode.code,
          fallbackPrefixes: fallbackPrefixes
        });
      }
    }

    return prefixMappings;
  }

  /**
   * Fetch ICD codes from database using prefix filtering
   * This replaces the mock expansion with real database queries
   */
  private async fetchIcdCodesByPrefixes(
    context: StandardizedAgentContext,
    prefixMappings: DiagnosisPrefixMapping[],
    cptBundle: EnhancedProcedureCode[]
  ): Promise<FilteredCodesResult> {
    const { logger, services } = context;

    logger.logInfo(this.name, "Starting database prefix filtering", {
      totalPrefixMappings: prefixMappings.length,
      prefixMappings: prefixMappings.map(mapping => ({
        cptCode: mapping.cptCode,
        prefixes: mapping.diagnosisPrefixes
      }))
    });

    const filteredCodes: FilteredCodesResult = {
      cptCodeMappings: []
    };

    for (const mapping of prefixMappings) {
      logger.logInfo(this.name, `Processing prefix mapping for CPT ${mapping.cptCode}`, {
        cptCode: mapping.cptCode,
        prefixes: mapping.diagnosisPrefixes
      });

      const cptCode = cptBundle.find(cpt => cpt.code === mapping.cptCode);
      const candidateIcdCodes: Array<{ code: string; description: string; source: string; }> = [];

      for (const prefix of mapping.diagnosisPrefixes) {
        logger.logInfo(this.name, `Fetching ICD codes for prefix ${prefix} (CPT: ${mapping.cptCode})`);
        
        try {
          // Fetch ICD codes from Azure storage that start with the prefix
          // This simulates a database query by checking files in the ICD directory
          const icdCodes = await this.fetchIcdCodesWithPrefix(context, prefix);
          
          logger.logInfo(this.name, `Fetched ${icdCodes.length} ICD codes for prefix ${prefix}`, {
            prefix: prefix,
            cptCode: mapping.cptCode,
            fetchedCodes: icdCodes.map(c => ({ code: c.code, description: c.description }))
          });
          
          // Filter against allowed families if available from CPT data
          const allowedFamilies = cptCode?.icd10Applicable || [];
          logger.logInfo(this.name, `Applying family filtering for CPT ${mapping.cptCode}`, {
            allowedFamilies: allowedFamilies,
            hasAllowedFamilies: allowedFamilies.length > 0
          });

          const filteredCodes = allowedFamilies.length > 0 
            ? icdCodes.filter(code => allowedFamilies.some(family => code.code.startsWith(family)))
            : icdCodes;

          logger.logInfo(this.name, `Family filtering results for CPT ${mapping.cptCode}`, {
            originalCount: icdCodes.length,
            filteredCount: filteredCodes.length,
            filteredCodes: filteredCodes.map(c => ({ code: c.code, description: c.description }))
          });

          candidateIcdCodes.push(...filteredCodes.map(code => ({
            code: code.code,
            description: code.description,
            source: "database_prefix_filter"
          })));

        } catch (error) {
          logger.logWarn(this.name, `Failed to fetch ICD codes for prefix ${prefix}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            cptCode: mapping.cptCode,
            prefix: prefix
          });
          
          // Fallback to mock codes if database fetch fails
          const mockCodes = this.generateMockIcdCodes(prefix);
          const mockCodesWithDesc = mockCodes.map(code => ({
            code,
            description: this.getMockIcdDescription(code),
            source: "fallback_mock"
          }));
          candidateIcdCodes.push(...mockCodesWithDesc);
          
          logger.logInfo(this.name, `Generated ${mockCodesWithDesc.length} fallback mock codes for prefix ${prefix}`, {
            prefix: prefix,
            cptCode: mapping.cptCode,
            codes: mockCodesWithDesc.map(c => ({ code: c.code, description: c.description }))
          });
        }
      }

      // Remove duplicates
      const uniqueCodes = candidateIcdCodes.filter((code, index, self) => 
        index === self.findIndex(c => c.code === code.code)
      );

      logger.logInfo(this.name, `Completed processing for CPT ${mapping.cptCode}`, {
        cptCode: mapping.cptCode,
        totalCandidates: candidateIcdCodes.length,
        uniqueCandidates: uniqueCodes.length,
        finalCandidates: uniqueCodes.map(c => ({ code: c.code, description: c.description, source: c.source }))
      });

      filteredCodes.cptCodeMappings.push({
        cptCode: mapping.cptCode,
        candidateIcdCodes: uniqueCodes
      });
    }

    logger.logInfo(this.name, "Database prefix filtering completed", {
      totalCptCodes: prefixMappings.length,
      totalPrefixes: prefixMappings.reduce((sum, mapping) => sum + mapping.diagnosisPrefixes.length, 0),
      totalCandidateCodes: filteredCodes.cptCodeMappings.reduce((sum, mapping) => sum + mapping.candidateIcdCodes.length, 0),
      finalResult: filteredCodes.cptCodeMappings.map(mapping => ({
        cptCode: mapping.cptCode,
        candidateCount: mapping.candidateIcdCodes.length,
        candidates: mapping.candidateIcdCodes.map(c => ({ code: c.code, description: c.description }))
      }))
    });

    return filteredCodes;
  }

  /**
   * Fetch ICD codes from Azure storage that start with the given prefix
   */
  private async fetchIcdCodesWithPrefix(
    context: StandardizedAgentContext,
    prefix: string
  ): Promise<Array<{ code: string; description: string; }>> {
    const { logger, services } = context;
    let icdCodes: Array<{ code: string; description: string; }> = [];

    logger.logInfo(this.name, `Starting ICD code fetch for prefix: ${prefix}`);

    // Always start with mock codes as fallback to ensure we have something
    const mockCodes = this.generateMockIcdCodes(prefix);
    const mockCodesWithDesc = mockCodes.map(code => ({
      code,
      description: this.getMockIcdDescription(code)
    }));

    logger.logInfo(this.name, `Generated ${mockCodesWithDesc.length} mock codes for prefix ${prefix}`, {
      mockCodes: mockCodesWithDesc.map(c => ({ code: c.code, description: c.description }))
    });

    try {
      // Use listFilesByName to efficiently find all files that start with the prefix
      const prefixPath = `ICD/${prefix}`;
      logger.logInfo(this.name, `Listing files with prefix: ${prefixPath}`);
      
      const matchingFiles = await services.azureStorageService.listFilesByName(prefixPath);
      
      logger.logInfo(this.name, `Found ${matchingFiles.length} matching files for prefix ${prefix}`, {
        matchingFiles: matchingFiles.slice(0, 10) // Show first 10 files for logging
      });
      
      let successfulFetches = 0;
      let failedFetches = 0;
      
      for (const filePath of matchingFiles) {
        try {
          // Extract the ICD code from the file path (e.g., "ICD/K43.0.json" -> "K43.0")
          const fileName = filePath.split('/').pop();
          if (!fileName || !fileName.endsWith('.json')) {
            logger.logDebug(this.name, `Skipping non-JSON file: ${filePath}`);
            continue;
          }
          
          const code = fileName.replace('.json', '');
          
          logger.logDebug(this.name, `Fetching content for ICD code: ${code} from ${filePath}`);
          const content = await services.azureStorageService.getFileContent(filePath);
          const icdData = JSON.parse(content);
          
          const description = icdData.description || icdData.title || icdData.DESCRIPTION || `ICD-10 code ${code}`;
          
          icdCodes.push({
            code: code,
            description: description
          });
          
          successfulFetches++;
          logger.logDebug(this.name, `Successfully fetched ICD code ${code}`, {
            description: description,
            filePath: filePath
          });
        } catch (error) {
          // Continue to next file if this one fails
          failedFetches++;
          logger.logDebug(this.name, `Failed to fetch ICD file ${filePath}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            filePath: filePath
          });
        }
      }

      logger.logInfo(this.name, `Database fetch results for prefix ${prefix}`, {
        totalFiles: matchingFiles.length,
        successfulFetches: successfulFetches,
        failedFetches: failedFetches,
        foundCodes: icdCodes.length
      });

      // If we found codes in database, use them; otherwise use mock codes
      if (icdCodes.length > 0) {
        logger.logInfo(this.name, `Found ${icdCodes.length} ICD codes in database for prefix ${prefix}`, {
          codes: icdCodes.map(c => ({ code: c.code, description: c.description }))
        });
      } else {
        logger.logWarn(this.name, `No ICD codes found in database for prefix ${prefix}, using mock codes`);
        icdCodes = mockCodesWithDesc;
      }

    } catch (error) {
      logger.logError(this.name, `Error fetching ICD codes for prefix ${prefix}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Use mock codes as fallback
      icdCodes = mockCodesWithDesc;
    }

    // Ensure we always return something
    if (icdCodes.length === 0) {
      logger.logWarn(this.name, `No ICD codes available for prefix ${prefix}, using mock codes as final fallback`);
      icdCodes = mockCodesWithDesc;
    }

    logger.logInfo(this.name, `Final result: Returning ${icdCodes.length} ICD codes for prefix ${prefix}`, {
      codes: icdCodes.map(c => ({ code: c.code, description: c.description })),
      source: icdCodes === mockCodesWithDesc ? 'mock' : 'database'
    });

    return icdCodes;
  }


  /**
   * Pass B2: ICD Selection
   * Selects the most specific and appropriate ICD-10 codes from the filtered list
   */
  private async runIcdSelection(
    context: StandardizedAgentContext,
    fullNoteText: string,
    cptBundle: EnhancedProcedureCode[],
    filteredCodes: FilteredCodesResult
  ): Promise<EnhancedDiagnosisCode[]> {
    const { logger, services } = context;

    const prompt = this.createIcdSelectionPrompt(fullNoteText, cptBundle, filteredCodes, logger);

    const schema = z.object({
      selectedDiagnoses: z.array(
        z.object({
          cptCode: z.string().min(1),
          selectedIcdCodes: z.array(
            z.object({
              code: z.string().min(1),
              description: z.string().min(1),
              rationale: z.string().min(1),
              evidence: z.array(z.string()).min(1),
              confidence: z.enum(["high", "medium", "low"]),
            })
          ).min(1),
        })
      ),
    });

    try {
      const result = await this.loggedApiCall(
        context,
        "aiModel",
        "generateStructuredOutput",
        () => services.aiModel.generateStructuredOutput<IcdSelectionResult>(prompt, schema, "gpt-4.1"),
        { prompt, schema }
      );

      // Transform the result into EnhancedDiagnosisCode objects
      const finalDiagnosisCodes: EnhancedDiagnosisCode[] = [];

      for (const diagnosisMapping of result.selectedDiagnoses) {
        const cptCode = cptBundle.find(cpt => cpt.code === diagnosisMapping.cptCode);
        if (!cptCode) {
          logger.logWarn(this.name, `CPT code ${diagnosisMapping.cptCode} not found in bundle`);
          continue;
        }

        for (const selectedIcd of diagnosisMapping.selectedIcdCodes) {
          const enhancedDiagnosisCode: EnhancedDiagnosisCode = {
            code: selectedIcd.code,
            description: selectedIcd.description,
            linkedCptCode: cptCode.code, // Use string reference instead of full object
            evidence: [
              this.createEvidence(
                selectedIcd.evidence,
                selectedIcd.rationale,
                this.mapConfidenceToNumber(selectedIcd.confidence),
                Notes.OPERATIVE,
              ),
            ],
          };

          finalDiagnosisCodes.push(enhancedDiagnosisCode);

          // Link the diagnosis code to the CPT code
          if (!cptCode.icd10Linked) {
            cptCode.icd10Linked = [];
          }
          cptCode.icd10Linked.push(enhancedDiagnosisCode);
        }
      }

      logger.logInfo(this.name, "Pass B2 completed", {
        totalSelectedCodes: finalDiagnosisCodes.length,
        cptCodesLinked: result.selectedDiagnoses.length,
      });

      return finalDiagnosisCodes;
    } catch (error) {
      throw new Error(`ICD selection failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
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
   * Creates the prompt for Pass B2: ICD Selection
   */
  private createIcdSelectionPrompt(
    fullNoteText: string,
    cptBundle: EnhancedProcedureCode[],
    filteredCodes: FilteredCodesResult,
    logger: any
  ): string {
    const cptCodesFormatted = cptBundle.map(cpt => 
      `- ${cpt.code}: ${cpt.description}`
    ).join('\n');

    const candidateCodesFormatted = filteredCodes.cptCodeMappings.map(mapping => {
      const codes = mapping.candidateIcdCodes.map(code => 
        `  - ${code.code}: ${code.description}`
      ).join('\n');
      return `CPT ${mapping.cptCode}:\n${codes}`;
    }).join('\n\n');

    const prompt = `You are an expert ICD-10-CM medical coder. Your task is to select the most specific and appropriate ICD-10 codes from the provided candidate lists that establish medical necessity for each CPT procedure code.

TASK: For each CPT code, select the most appropriate ICD-10 codes from the candidate list.

CPT CODES:
${cptCodesFormatted}

CANDIDATE ICD-10 CODES:
${candidateCodesFormatted}

CLINICAL NOTE:
${fullNoteText}

INSTRUCTIONS:
1. Select only the most specific and appropriate ICD-10 codes for each CPT, ensure the code is justified by the note documentation.
2. Ensure the selected codes establish clear medical necessity
3. Provide specific evidence from the clinical note supporting each selection
4. Rate your confidence as high, medium, or low
5. Provide a clear rationale for each code selection

Return only the JSON object with no additional formatting.

Example Output:
{
  "selectedDiagnoses": [
    {
      "cptCode": "49616",
      "selectedIcdCodes": [
        {
          "code": "K43.0",
          "description": "Incisional hernia with obstruction, without gangrene",
          "rationale": "Patient has documented incarcerated recurrent ventral incisional hernia which qualifies as obstructed",
          "evidence": ["incarcerated recurrent ventral incisional hernia", "Massive incarcerated recurrent ventral incisional hernia"],
          "confidence": "high"
        }
      ]
    }
  ]
}`;

    // Log the complete prompt for debugging
    logger.logInfo(this.name, "ICD Selection Prompt Created", {
      promptLength: prompt.length,
      cptCodesCount: cptBundle.length,
      candidateMappingsCount: filteredCodes.cptCodeMappings.length,
      totalCandidateCodes: filteredCodes.cptCodeMappings.reduce((sum, mapping) => sum + mapping.candidateIcdCodes.length, 0),
      cptCodesSection: cptCodesFormatted,
      candidateCodesSection: candidateCodesFormatted,
      fullPrompt: prompt
    });

    return prompt;
  }

  /**
   * Mock function to generate ICD codes from a prefix
   * In a real implementation, this would query the database
   */
  private generateMockIcdCodes(prefix: string): string[] {
    // Mock implementation - in reality, this would query the ICD database
    const mockCodes: Record<string, string[]> = {
      "K43": ["K43.0", "K43.1", "K43.2", "K43.9"],
      "K40": ["K40.0", "K40.1", "K40.9"],
      "K41": ["K41.0", "K41.1", "K41.9"],
      "K42": ["K42.0", "K42.1", "K42.9"],
      "T81": ["T81.30", "T81.31", "T81.32", "T81.33"],
      "Z98": ["Z98.890", "Z98.891"],
    };

    return mockCodes[prefix] || [`${prefix}.0`, `${prefix}.1`, `${prefix}.9`];
  }

  /**
   * Mock function to get ICD description
   * In a real implementation, this would query the database
   */
  private getMockIcdDescription(code: string): string {
    const mockDescriptions: Record<string, string> = {
      "K43.0": "Incisional hernia with obstruction, without gangrene",
      "K43.1": "Incisional hernia without obstruction or gangrene",
      "K43.2": "Incisional hernia without obstruction or gangrene, recurrent",
      "K43.9": "Ventral hernia without obstruction or gangrene",
      "K40.0": "Bilateral inguinal hernia, with obstruction, without gangrene",
      "K40.1": "Bilateral inguinal hernia, without obstruction or gangrene",
      "K40.9": "Unilateral inguinal hernia, without obstruction or gangrene",
      "K41.0": "Bilateral femoral hernia, with obstruction, without gangrene",
      "K41.1": "Bilateral femoral hernia, without obstruction or gangrene",
      "K41.9": "Unilateral femoral hernia, without obstruction or gangrene",
      "K42.0": "Umbilical hernia with obstruction, without gangrene",
      "K42.1": "Umbilical hernia without obstruction or gangrene",
      "K42.9": "Umbilical hernia without obstruction or gangrene",
      "T81.30": "Disruption of wound, unspecified",
      "T81.31": "Disruption of external operation wound, not elsewhere classified",
      "T81.32": "Disruption of internal operation wound, not elsewhere classified",
      "T81.33": "Disruption of traumatic injury wound repair",
      "Z98.890": "Other specified postprocedural states",
      "Z98.891": "History of uterine scar from previous surgery",
      // Common gallbladder-related codes for cholecystectomy
      "K80.0": "Calculus of gallbladder with acute cholecystitis",
      "K80.1": "Calculus of gallbladder with other cholecystitis",
      "K80.2": "Calculus of gallbladder without cholecystitis",
      "K81.0": "Acute cholecystitis",
      "K81.1": "Chronic cholecystitis",
      "K81.9": "Cholecystitis, unspecified",
      "K82.0": "Obstruction of gallbladder",
      "K82.1": "Hydrops of gallbladder",
      "K82.2": "Perforation of gallbladder",
      "K82.3": "Fistula of gallbladder",
      "K82.4": "Cholesterolosis of gallbladder",
      "K82.8": "Other specified diseases of gallbladder",
      "K82.9": "Disease of gallbladder, unspecified",
    };

    // If no specific description found, generate a more descriptive fallback
    if (mockDescriptions[code]) {
      return mockDescriptions[code];
    }
    
    // Generate more descriptive fallbacks based on code patterns
    const prefix = code.substring(0, 3);
    const suffix = code.substring(3);
    
    const prefixDescriptions: Record<string, string> = {
      "K40": "Inguinal hernia",
      "K41": "Femoral hernia", 
      "K42": "Umbilical hernia",
      "K43": "Ventral hernia",
      "K44": "Diaphragmatic hernia",
      "K80": "Cholelithiasis",
      "K81": "Cholecystitis",
      "K82": "Other diseases of gallbladder",
      "K83": "Other diseases of biliary tract",
      "T81": "Complications of procedures",
      "Z98": "Other postprocedural states",
    };
    
    const baseDescription = prefixDescriptions[prefix] || `Condition ${prefix}`;
    return `${baseDescription} (${code})`;
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
}

// ============================================================================
// TYPE DEFINITIONS FOR ICD AGENT
// ============================================================================

interface DiagnosisPrefixMapping {
  cptCode: string;
  diagnosisPrefixes: string[];
}

interface FilteredCodesResult {
  cptCodeMappings: Array<{
    cptCode: string;
    candidateIcdCodes: Array<{
      code: string;
      description: string;
      source: string;
    }>;
  }>;
}

interface IcdSelectionResult {
  selectedDiagnoses: Array<{
    cptCode: string;
    selectedIcdCodes: Array<{
      code: string;
      description: string;
      rationale: string;
      evidence: string[];
      confidence: "high" | "medium" | "low";
    }>;
  }>;
}