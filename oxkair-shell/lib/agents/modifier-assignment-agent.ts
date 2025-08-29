/**
 * Vector-Enhanced Two-Phase Modifier Assignment Agent
 * 
 * Phase 1: Compliance-focused modifier assignment (PTP edits, MUE overrides)
 * Phase 2: Ancillary modifier assignment based on operative note documentation
 * Both phases use Azure AI Search with ncci-rag index for enhanced decision making
 */

import { z } from "zod";
import {
  LoggedAgentExecutionContext,
  StandardizedAgentResult,
  CCIResult,
  ProcessingError,
  ProcessingErrorSeverity,
  ERROR_CODES,
  Agents,
  StandardizedModifier,
  StandardizedWorkflowState,
  ModifierClassifications,
  Notes,
  StandardizedEvidence,
  EnhancedProcedureCode,
  ProcedureLineItem,
} from "./newtypes.ts";
import { Agent } from "./agent-core.ts";
import { VectorSearchService, VectorSearchConfig } from "../services/vector-search-service";
import {
  filterAllowedModifiers,
  PreVettedModifier,
} from "./modifier-data-loader.ts";
import { 
  buildPhase1ModifierPrompt_Batch,
  buildPhase2ModifierPrompt_Batch 
} from "./prompts/modifier-assignment-prompts.ts";

// Vector search result schema for Phase 1 (compliance) modifier assignments
const Phase1ModifierVectorSearchResultSchema = z.object({
  assignments: z.array(z.object({
    lineId: z.string(),
    modifier: z.string().nullable(),
    rationale: z.string(),
    documentationSupportsBypass: z.boolean().optional(),
    code: z.string(),
    editType: z.enum(["PTP", "MUE"]).optional(),
    evidence: z.array(z.object({
      excerpt: z.string(),
      sourceNoteType: z.string().optional()
    })).optional().default([])
  })).min(1)
});

// Vector search result schema for Phase 2 (ancillary) modifier assignments
const Phase2ModifierVectorSearchResultSchema = z.object({
  assignments: z.array(z.object({
    lineId: z.string(),
    modifiers: z.array(z.object({
      modifier: z.string(),
      rationale: z.string(),
      description: z.string().optional(),
      evidence: z.array(z.object({
        description: z.string(),
        excerpt: z.string(),
        sourceNoteType: z.string().optional()
      })).optional().default([])
    })).default([])
  })).min(1)
});

export type Phase1ModifierVectorSearchResult = z.infer<typeof Phase1ModifierVectorSearchResultSchema>;
export type Phase2ModifierVectorSearchResult = z.infer<typeof Phase2ModifierVectorSearchResultSchema>;
export type ModifierVectorSearchResult = Phase1ModifierVectorSearchResult | Phase2ModifierVectorSearchResult;

export class ModifierAssignmentAgent extends Agent {
  readonly name = "modifier_assignment_agent";
  readonly description = "Assigns modifiers using RAG-enhanced two-phase analysis with NCCI guidance";
  readonly requiredServices = ["aiModel", "cache"] as const;

  private vectorSearchService: VectorSearchService | null = null;

  constructor() {
    super();
    // Initialize vector search asynchronously - will be null until initialized
    this.initializeVectorSearch().catch(error => {
      console.warn("Failed to initialize vector search service:", error);
      this.vectorSearchService = null;
    });
  }

  private async initializeVectorSearch() {
    try {
      const config: VectorSearchConfig = {
        searchEndpoint: process.env.SEARCH_ENDPOINT || "https://oxkairsearchdb.search.windows.net",
        searchKey: process.env.SEARCH_KEY || "",
        searchIndex: "ncci-rag", // Use the NCCI RAG index
        embeddingsDeployment: process.env.EMBEDDINGS_DEPLOYMENT_NAME || "text-embedding-ada-002",
        chatDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME_2 || process.env.DEPLOYMENT_NAME || "gpt-4.1",
        azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "https://thoma-me2wgbl0-eastus2.openai.azure.com/",
        azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY || "",
        apiVersion: "2024-12-01-preview"
      };

      // Import the vector search service class and pass logger for backend assignment
      const { AzureVectorSearchService } = await import("../services/vector-search-service");
      this.vectorSearchService = new AzureVectorSearchService(config, undefined); // Will use modifier agent's logger when available
    } catch (error) {
      console.warn("Failed to initialize vector search service:", error);
      this.vectorSearchService = null;
    }
  }

  async executeInternal(
    context: LoggedAgentExecutionContext,
  ): Promise<StandardizedAgentResult> {
    const startTime = Date.now();
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const { caseId } = context.state.caseMeta;

    context.logger.logWorkflow(
      this.name,
      `Vector-enhanced two-phase modifier assignment started for case: ${caseId}`,
      { caseId },
    );

    try {
      const procedureCodes = this.extractProcedureCodesFromState(context.state as any);
      if (!procedureCodes || procedureCodes.length === 0) {
        const error = this.createErrorWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          "No procedure codes available for modifier assignment",
          ProcessingErrorSeverity.HIGH,
          { caseId, workflowStep: context.state.currentStep },
        );
        errors.push(error);
        context.logger.logError(this.name, error.message, { caseId, error });
        return this.createFailureResult(errors, evidence, Date.now() - startTime);
      }

      context.logger.logDebug(
        this.name,
        "Procedure codes found for vector two-phase modifier assignment.",
        { caseId, count: procedureCodes.length },
      );

      // Extract CCI result from evidence
      const cciResult = this.extractCCIResultFromEvidence(context.state.allEvidence);

      if (!cciResult) {
        context.logger.logWarn(
          this.name,
          "CCI result is not available in the evidence. Proceeding without CCI data.",
          { caseId },
        );
      }

      // Create line items from procedure codes
      const lineItems = this.createLineItemsFromProcedureCodes(
        context,
        procedureCodes,
        cciResult
      );

      evidence.push(...lineItems.evidence);
      errors.push(...lineItems.errors);

      if (lineItems.items.length === 0) {
        context.logger.logWarn(this.name, "No line items created for processing", { caseId });
        return this.createModifierSuccessResult([], evidence, Date.now() - startTime);
      }

      context.logger.logInfo(
        this.name,
        "Starting Phase 1: Compliance modifier processing (PTP edits, MUE overrides)",
        { caseId },
      );
      
      // Phase 1: Compliance-focused modifier assignment
      const phase1Result = await this.runPhase1_ComplianceProcessing(
        context,
        lineItems.items,
        cciResult
      );

      evidence.push(...phase1Result.evidence);
      errors.push(...phase1Result.errors);

      context.logger.logInfo(this.name, "Phase 1 completed", {
        caseId,
        lineItemsCreated: phase1Result.lineItems.length,
        errorsCount: phase1Result.errors?.length || 0,
        lineItemsWithPhase1Modifiers: phase1Result.lineItems.filter(
          (li) => li.phase1Modifiers.length > 0,
        ).length,
        phase1ModifierDetails: phase1Result.lineItems.map((li) => ({
          lineId: li.lineId,
          procedureCode: li.procedureCode,
          phase1ModifiersCount: li.phase1Modifiers.length,
          phase1Modifiers: li.phase1Modifiers.map((m) => m.modifier),
        })),
      });

      context.logger.logInfo(
        this.name,
        "Starting Phase 2: Ancillary modifier processing based on operative note",
        {
          caseId,
          lineItemsPassedToPhase2: phase1Result.lineItems.length,
          lineItemDetailsForPhase2: phase1Result.lineItems.map((li) => ({
            lineId: li.lineId,
            procedureCode: li.procedureCode,
            phase1ModifiersCount: li.phase1Modifiers.length,
          })),
        },
      );

      // Phase 2: Ancillary modifier assignment
      const phase2Result = await this.runPhase2_AncillaryProcessing(
        context,
        phase1Result.lineItems
      );

      evidence.push(...phase2Result.evidence);
      errors.push(...phase2Result.errors);

      context.logger.logInfo(this.name, "Phase 2 completed", {
        caseId,
        finalLineItems: phase2Result.lineItems.length,
        errorsCount: phase2Result.errors?.length || 0,
      });

      const finalLineItems = phase2Result.lineItems;

      // Convert to final modifier state
      const finalModifiers = this.convertLineItemsToFinalModifiers(finalLineItems);

      // Add evidence with finalModifiers for state manager
      evidence.push(
        this.createEvidence(
          [],
          "Vector-enhanced two-phase modifier assignments completed",
          0.9,
          Notes.OPERATIVE,
          { finalModifiers }
        )
      );

      const result: StandardizedAgentResult = {
        success: errors.length === 0,
        evidence,
        data: {
          totalLineItems: finalLineItems.length,
          phase1LineItems: finalLineItems.length,
          phase2ModifiersAdded: finalLineItems.reduce(
            (sum, item) => sum + item.phase2Modifiers.length,
            0,
          ),
          complianceFlags: finalLineItems.filter((item) => item.complianceFlag).length,
          ptpConflictsResolved: evidence.filter(
            (e) => (e as any).content?.type === "ptp_conflict_resolved",
          ).length,
          mueAiSplitsApproved: evidence.filter(
            (e) => (e as any).content?.type === "mue_ai_split_approved",
          ).length,
          mueAiSplitsDenied: evidence.filter(
            (e) => (e as any).content?.type === "mue_ai_split_denied",
          ).length,
          finalModifiers,
          procedureLineItems: finalLineItems,
        },
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          executionTime: Date.now() - startTime,
          version: "4.0.0",
          agentName: Agents.MODIFIER,
        },
      };

      context.logger.logInfo(
        this.name,
        "Vector two-phase modifier assignment completed successfully",
        {
          caseId,
          executionTime: result.metadata.executionTime,
          totalLineItems: finalLineItems.length,
          ptpConflictsResolved: result.data?.ptpConflictsResolved || 0,
          mueAiSplitsApproved: result.data?.mueAiSplitsApproved || 0,
          mueAiSplitsDenied: result.data?.mueAiSplitsDenied || 0,
          success: result.success,
        }
      );

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      context.logger.logError(
        this.name,
        `Vector two-phase modifier assignment failed: ${errorMessage}`,
        { caseId, executionTime, error }
      );
      
      const processingError = this.createErrorWithCode(
        ERROR_CODES.AGENT_EXECUTION_FAILED,
        `Unexpected error during Vector Two-Phase Modifier Assignment: ${errorMessage}`,
        ProcessingErrorSeverity.CRITICAL,
        { caseId, stack: error.stack }
      );
      errors.push(processingError);

      return this.createFailureResult(errors, evidence, executionTime);
    }
  }

  private async runPhase1_ComplianceProcessing(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
    cciResult?: CCIResult,
  ): Promise<{
    lineItems: ProcedureLineItem[];
    evidence: StandardizedEvidence[];
    errors: ProcessingError[];
    processingTime?: number;
  }> {
    const phase1StartTime = Date.now();
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const { caseId } = context.state.caseMeta;

    context.logger.logDebug(this.name, "Processing compliance modifiers with vector search", {
      caseId,
      lineItemCount: lineItems.length,
    });

    try {
      // Pre-processing: Filter line items that need Phase 1 processing
      const phase1RequiredLineItems = this.preprocessPhase1LineItems(
        context,
        lineItems,
        cciResult
      );

      // If no PTP edits (no CCI conflicts with MI = 1) and NO MUE overrides, skip Phase 1
      if (phase1RequiredLineItems.length === 0) {
        context.logger.logInfo(
          this.name,
          "No Phase 1 processing required - no PTP edits with MI=1 or MUE overrides with MAI=1",
          { caseId }
        );
        
        const processingTime = Date.now() - phase1StartTime;
        return {
          lineItems,
          evidence,
          errors,
          processingTime,
        };
      }

      // Filter line items with allowed compliance modifiers (Phase 1)
      const filteredLineItems = this.filterLineItemsWithAllowedModifiers(
        context,
        phase1RequiredLineItems,
        "phase1"
      );

      context.logger.logDebug(
        this.name,
        "Starting Phase 1 vector modifier assignment",
        {
          caseId,
          lineItemsCount: filteredLineItems.length,
          lineItemIds: filteredLineItems.map((li) => li.lineId),
          phase1RequiredCount: phase1RequiredLineItems.length,
        },
      );

      // Use vector search for compliance modifier assignment
      const phase1ModifierResult = await this.performVectorModifierSearch(
        context,
        filteredLineItems,
        cciResult,
        "phase1"
      ) as Phase1ModifierVectorSearchResult;

      // Process the results and update line items
      const updatedLineItems = this.processPhase1ModifierResults(
        context,
        lineItems,
        phase1ModifierResult,
        cciResult
      );

      evidence.push(
        this.createEvidence(
          [],
          "Phase 1 compliance modifier assignment completed",
          0.9,
          Notes.OPERATIVE,
          {
            type: "phase1_compliance_assignment",
            data: {
              totalLineItems: lineItems.length,
              phase1ModifiersAssigned: updatedLineItems.reduce(
                (sum, item) => sum + item.phase1Modifiers.length,
                0
              ),
            },
          }
        )
      );

      const processingTime = Date.now() - phase1StartTime;
      context.logger.logInfo(this.name, "Phase 1 processing completed", {
        caseId,
        processingTime,
        lineItemsCreated: updatedLineItems.length,
        errorsCount: errors.length,
      });

      return {
        lineItems: updatedLineItems,
        evidence,
        errors,
        processingTime,
      };
    } catch (error: any) {
      const processingError = this.createErrorWithCode(
        ERROR_CODES.EXTERNAL_API_ERROR,
        `Phase 1 compliance processing failed: ${error.message}`,
        ProcessingErrorSeverity.HIGH,
        { caseId, lineItemCount: lineItems.length }
      );
      errors.push(processingError);

      const processingTime = Date.now() - phase1StartTime;
      return {
        lineItems,
        evidence,
        errors,
        processingTime,
      };
    }
  }

  private async runPhase2_AncillaryProcessing(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
  ): Promise<{
    lineItems: ProcedureLineItem[];
    evidence: StandardizedEvidence[];
    errors: ProcessingError[];
    processingTime?: number;
  }> {
    const phase2StartTime = Date.now();
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const { caseId } = context.state.caseMeta;

    context.logger.logDebug(this.name, "Processing ancillary modifiers with vector search", {
      caseId,
      lineItemCount: lineItems.length,
    });

    try {
      // Filter line items with allowed ancillary modifiers (Phase 2)
      const filteredLineItems = this.filterLineItemsWithAllowedModifiers(
        context,
        lineItems,
        "phase2"
      );

      // Use vector search for ancillary modifier assignment
      const phase2ModifierResult = await this.performVectorModifierSearch(
        context,
        filteredLineItems,
        undefined, // No CCI result needed for Phase 2
        "phase2"
      ) as Phase2ModifierVectorSearchResult;

      // Process the results and update line items
      const updatedLineItems = this.processPhase2ModifierResults(
        context,
        lineItems,
        phase2ModifierResult
      );

      evidence.push(
        this.createEvidence(
          [],
          "Phase 2 ancillary modifier assignment completed",
          0.9,
          Notes.OPERATIVE,
          {
            type: "phase2_ancillary_assignment",
            data: {
              totalLineItems: lineItems.length,
              phase2ModifiersAssigned: updatedLineItems.reduce(
                (sum, item) => sum + item.phase2Modifiers.length,
                0
              ),
            },
          }
        )
      );

      const processingTime = Date.now() - phase2StartTime;
      context.logger.logInfo(this.name, "Phase 2 processing completed", {
        caseId,
        processingTime,
        lineItemsProcessed: updatedLineItems.length,
        errorsCount: errors.length,
      });

      return {
        lineItems: updatedLineItems,
        evidence,
        errors,
        processingTime,
      };
    } catch (error: any) {
      const processingError = this.createErrorWithCode(
        ERROR_CODES.EXTERNAL_API_ERROR,
        `Phase 2 ancillary processing failed: ${error.message}`,
        ProcessingErrorSeverity.HIGH,
        { caseId, lineItemCount: lineItems.length }
      );
      errors.push(processingError);

      const processingTime = Date.now() - phase2StartTime;
      return {
        lineItems,
        evidence,
        errors,
        processingTime,
      };
    }
  }

  /**
   * Performs robust vector search with automatic error handling and model fallbacks
   * Implements the decision flow:
   * 1. Try primary model (gpt-4.1)
   * 2. If 400 content_filter: attempt safe re-prompting once, then fallback to gpt-4.1-2, then gpt-4.1-mini
   * 3. If 429: retry on gpt-4.1-2, then fallback to gpt-4.1-mini
   */
  private async performStandardizedVectorSearch(
    context: LoggedAgentExecutionContext,
    systemPrompt: string,
    userContent: string,
    caseId: string
  ): Promise<string> {
    const modelFallbackChain = ['gpt-4.1', 'gpt-4.1-2', 'gpt-4.1-mini'];
    let lastError: any = null;

    for (let modelIndex = 0; modelIndex < modelFallbackChain.length; modelIndex++) {
      const currentModel = modelFallbackChain[modelIndex];
      
      try {
        context.logger.logDebug(
          this.name,
          `Attempting vector search with model: ${currentModel}`,
          { caseId, modelIndex, totalModels: modelFallbackChain.length }
        );

        // Try standardized vector search service first
        if (!this.vectorSearchService) {
          context.logger.logWarn(
            this.name,
            "Vector search service not available, using direct API call",
            { caseId, currentModel }
          );
          return await this.performDirectVectorSearchWithFallbacks(
            context, systemPrompt, userContent, caseId, currentModel, modelIndex
          );
        }

        // Use the standardized vector search service
        const vectorSearchService = this.vectorSearchService as any;
        const content = await vectorSearchService.makeVectorSearchRequest(
          systemPrompt,
          userContent,
          "ncci-rag",
          process.env.EMBEDDINGS_DEPLOYMENT_NAME || "text-embedding-ada-002",
          ["text_vector"],
          ["chunk"],
          "title",
          currentModel // Pass the specific model to use
        );

        context.logger.logInfo(
          this.name,
          `Vector search successful with model: ${currentModel}`,
          {
            caseId,
            currentModel,
            contentLength: content?.length || 0,
            hasContent: !!content,
            attemptNumber: modelIndex + 1
          }
        );

        return content;

      } catch (error: any) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isContentFilter = this.isContentFilterError(error);
        const isRateLimit = this.isRateLimitError(error);

        // Record the failure for monitoring
        this.recordFailure(context, currentModel, error, 'vector_search');

        context.logger.logError(
          this.name,
          `Vector search failed with model ${currentModel}`,
          {
            caseId,
            currentModel,
            error: errorMessage,
            isContentFilter,
            isRateLimit,
            attemptNumber: modelIndex + 1,
            remainingModels: modelFallbackChain.length - modelIndex - 1
          }
        );

        // Handle content filter errors
        if (isContentFilter) {
          context.logger.logWarn(
            this.name,
            `Content filter triggered for model ${currentModel}`,
            { 
              caseId, 
              currentModel,
              filterDetails: this.extractContentFilterDetails(error)
            }
          );

          // If this is the first model (gpt-4.1), try safe re-prompting once
          if (modelIndex === 0) {
            try {
              context.logger.logInfo(
                this.name,
                "Attempting safe re-prompting for content filter bypass",
                { caseId, currentModel }
              );

              const safePrompt = this.createSafeReprompt(systemPrompt);
              const safeContent = await this.performDirectVectorSearchWithModel(
                context, safePrompt, userContent, caseId, currentModel
              );

              context.logger.logInfo(
                this.name,
                "Safe re-prompting successful",
                { caseId, currentModel, contentLength: safeContent?.length || 0 }
              );

              return safeContent;
            } catch (repromptError: any) {
              // Record the re-prompt failure
              this.recordFailure(context, currentModel, repromptError, 'vector_search');
              
              context.logger.logWarn(
                this.name,
                "Safe re-prompting failed, proceeding to model fallback",
                { 
                  caseId, 
                  currentModel,
                  repromptError: repromptError instanceof Error ? repromptError.message : 'Unknown error'
                }
              );
            }
          }

          // Continue to next model in fallback chain
          continue;
        }

        // Handle rate limit errors
        if (isRateLimit) {
          const retryAfter = this.extractRetryAfter(error);
          context.logger.logWarn(
            this.name,
            `Rate limit hit for model ${currentModel}`,
            { 
              caseId, 
              currentModel,
              retryAfter: retryAfter ? `${retryAfter} seconds` : 'unknown'
            }
          );

          // Continue to next model in fallback chain immediately (no waiting)
          continue;
        }

        // For other errors, continue to next model
        context.logger.logWarn(
          this.name,
          `Unexpected error with model ${currentModel}, trying next model`,
          { caseId, currentModel, error: errorMessage }
        );
      }
    }

    // If all models failed, fall back to direct API call with the last model
    context.logger.logError(
      this.name,
      "All vector search models failed, falling back to direct API call",
      { 
        caseId, 
        lastError: lastError instanceof Error ? lastError.message : 'Unknown error',
        modelsAttempted: modelFallbackChain
      }
    );

    return await this.performDirectVectorSearchWithFallbacks(
      context, systemPrompt, userContent, caseId, 'gpt-4.1-mini', 2
    );
  }

  /**
   * Enhanced direct vector search with model fallbacks and error handling
   */
  private async performDirectVectorSearchWithFallbacks(
    context: LoggedAgentExecutionContext,
    systemPrompt: string,
    userContent: string,
    caseId: string,
    startingModel: string,
    startingIndex: number
  ): Promise<string> {
    const modelFallbackChain = ['gpt-4.1', 'gpt-4.1-2', 'gpt-4.1-mini'];
    let lastError: any = null;

    // Start from the specified model index
    for (let modelIndex = startingIndex; modelIndex < modelFallbackChain.length; modelIndex++) {
      const currentModel = modelFallbackChain[modelIndex];
      
      try {
        context.logger.logDebug(
          this.name,
          `Attempting direct API call with model: ${currentModel}`,
          { caseId, modelIndex, totalModels: modelFallbackChain.length }
        );

        const content = await this.performDirectVectorSearchWithModel(
          context, systemPrompt, userContent, caseId, currentModel
        );

        context.logger.logInfo(
          this.name,
          `Direct API call successful with model: ${currentModel}`,
          {
            caseId,
            currentModel,
            contentLength: content?.length || 0,
            attemptNumber: modelIndex + 1
          }
        );

        return content;

      } catch (error: any) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isContentFilter = this.isContentFilterError(error);
        const isRateLimit = this.isRateLimitError(error);

        // Record the failure for monitoring
        this.recordFailure(context, currentModel, error, 'direct_api');

        context.logger.logError(
          this.name,
          `Direct API call failed with model ${currentModel}`,
          {
            caseId,
            currentModel,
            error: errorMessage,
            isContentFilter,
            isRateLimit,
            attemptNumber: modelIndex + 1,
            remainingModels: modelFallbackChain.length - modelIndex - 1
          }
        );

        // Handle content filter errors
        if (isContentFilter && modelIndex === 0) {
          try {
            context.logger.logInfo(
              this.name,
              "Attempting safe re-prompting for direct API content filter bypass",
              { caseId, currentModel }
            );

            const safePrompt = this.createSafeReprompt(systemPrompt);
            const safeContent = await this.performDirectVectorSearchWithModel(
              context, safePrompt, userContent, caseId, currentModel
            );

            context.logger.logInfo(
              this.name,
              "Direct API safe re-prompting successful",
              { caseId, currentModel, contentLength: safeContent?.length || 0 }
            );

            return safeContent;
          } catch (repromptError: any) {
            // Record the re-prompt failure
            this.recordFailure(context, currentModel, repromptError, 'direct_api');
            
            context.logger.logWarn(
              this.name,
              "Direct API safe re-prompting failed, proceeding to model fallback",
              { 
                caseId, 
                currentModel,
                repromptError: repromptError instanceof Error ? repromptError.message : 'Unknown error'
              }
            );
          }
        }

        // Continue to next model for any error type
        if (modelIndex < modelFallbackChain.length - 1) {
          continue;
        }
      }
    }

    // If all models failed, throw the last error
    context.logger.logError(
      this.name,
      "All direct API models failed",
      { 
        caseId, 
        lastError: lastError instanceof Error ? lastError.message : 'Unknown error',
        modelsAttempted: modelFallbackChain.slice(startingIndex)
      }
    );

    throw lastError || new Error('All direct API models failed');
  }

  /**
   * Performs direct vector search API call with a specific model
   */
  private async performDirectVectorSearchWithModel(
    context: LoggedAgentExecutionContext,
    systemPrompt: string,
    userContent: string,
    caseId: string,
    model: string
  ): Promise<string> {
    const requestBody = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 1,
      max_tokens: 2048,
      data_sources: [{
        type: "azure_search",
        parameters: {
          endpoint: process.env.SEARCH_ENDPOINT || "https://oxkairsearchdb.search.windows.net",
          index_name: "ncci-rag",
          query_type: "vector_semantic_hybrid",
          embedding_dependency: {
            type: "deployment_name",
            deployment_name: process.env.EMBEDDINGS_DEPLOYMENT_NAME || "text-embedding-ada-002"
          },
          fields_mapping: {
            content_fields: ["chunk"],
            vector_fields: ["text_vector"],
            title_field: "title"
          },
          in_scope: true,
          strictness: 3,
          top_n_documents: 10,
          authentication: {
            type: "api_key",
            key: process.env.SEARCH_KEY
          }
        }
      }]
    };

    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://thoma-me2wgbl0-eastus2.openai.azure.com/";
    const apiVersion = "2024-12-01-preview";

    context.logger.logDebug(
      this.name,
      "Making direct API call",
      {
        caseId,
        model,
        endpoint: azureEndpoint,
        promptLength: systemPrompt.length,
        contentLength: userContent.length
      }
    );

    const response = await fetch(
      `${azureEndpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.AZURE_OPENAI_API_KEY || '',
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any = {};
      
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If parsing fails, use the raw text
        errorData = { message: errorText };
      }

      context.logger.logError(
        this.name,
        "Direct vector search API call failed",
        {
          caseId,
          model,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
          errorData: errorData
        }
      );

      // Create a structured error object for better error handling
      const structuredError = new Error(`Azure OpenAI API call failed: ${response.status} ${response.statusText}`);
      (structuredError as any).status = response.status;
      (structuredError as any).statusText = response.statusText;
      (structuredError as any).errorData = errorData;
      (structuredError as any).headers = Object.fromEntries(response.headers.entries());

      throw structuredError;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned from Azure OpenAI API');
    }

    context.logger.logDebug(
      this.name,
      "Direct API call successful",
      {
        caseId,
        model,
        contentLength: content.length,
        usage: data.usage
      }
    );

    return content;
  }

  private async performVectorModifierSearch(
    context: LoggedAgentExecutionContext,
    lineItems: (ProcedureLineItem & { allowedModifiers: PreVettedModifier[] })[],
    cciResult?: CCIResult,
    phase: "phase1" | "phase2" = "phase1"
  ): Promise<Phase1ModifierVectorSearchResult | Phase2ModifierVectorSearchResult> {
    const { caseId } = context.state.caseMeta;

    // Build the appropriate prompt based on phase
    const prompt = phase === "phase1" 
      ? buildPhase1ModifierPrompt_Batch(context.state, lineItems, cciResult)
      : buildPhase2ModifierPrompt_Batch(context.state, lineItems);

    // Prepare the full note text for the vector search
    const fullNoteText = [
      context.state.caseNotes.primaryNoteText,
      ...context.state.caseNotes.additionalNotes.map((note) => note.content),
    ].filter(Boolean).join("\n\n");

    // LOG: Prompt and input being sent to vector search
    context.logger.logDebug(
      this.name,
      "Vector modifier search prompt and input",
      {
        caseId,
        promptLength: prompt.length,
        noteTextLength: fullNoteText.length,
        lineItemCount: lineItems.length,
        prompt: prompt.substring(0, 1000) + (prompt.length > 1000 ? "...[truncated]" : ""),
        fullPrompt: prompt, // Full prompt for detailed debugging
        noteText: fullNoteText.substring(0, 500) + (fullNoteText.length > 500 ? "...[truncated]" : ""),
        fullNoteText: fullNoteText, // Full note text for detailed debugging
        lineItems: lineItems.map(item => ({
          lineId: item.lineId,
          procedureCode: item.procedureCode,
          units: item.units,
          allowedModifiers: item.allowedModifiers.map(m => m.code)
        })),
        cciResult: cciResult
      }
    );

    try {
      // Use the standardized vector search service with backend assignment
      const content = await this.performStandardizedVectorSearch(
        context,
        prompt,
        fullNoteText,
        caseId
      );

      // LOG: Raw response from Azure OpenAI
      context.logger.logDebug(
        this.name,
        "Azure OpenAI vector search raw response",
        {
          caseId,
          content: content,
          contentLength: content?.length || 0,
          hasContent: !!content
        }
      );

      if (!content) {
        context.logger.logError(
          this.name,
          "No content returned from Azure OpenAI API",
          { caseId, responseData: content }
        );
        throw new Error('No content returned from Azure OpenAI API');
      }

      // Parse and validate the JSON response
      let parsedResult;
      try {
        // Handle markdown code blocks if present
        let jsonContent = content.trim();
        
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        }
        
        jsonContent = jsonContent.replace(/^`+/, '').replace(/`+$/, '').trim();
        
        // Handle case where AI returns JSON followed by additional text
        // Look for the end of the JSON object/array
        let jsonEndIndex = -1;
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < jsonContent.length; i++) {
          const char = jsonContent[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEndIndex = i + 1;
                break;
              }
            }
          }
        }
        
        // If we found the end of the JSON object, extract only that part
        if (jsonEndIndex > 0) {
          jsonContent = jsonContent.substring(0, jsonEndIndex).trim();
        }
        
        // LOG: JSON parsing attempt
        context.logger.logDebug(
          this.name,
          "Parsing JSON response from AI",
          {
            caseId,
            originalContent: content,
            cleanedJsonContent: jsonContent,
            jsonEndIndex: jsonEndIndex
          }
        );
        
        parsedResult = JSON.parse(jsonContent);
      } catch (parseError) {
        context.logger.logError(
          this.name,
          "Failed to parse JSON response from AI",
          {
            caseId,
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
            originalContent: content,
            contentLength: content.length,
            contentPreview: content.substring(0, 500)
          }
        );
        throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Content: ${content.substring(0, 200)}...`);
      }

      // LOG: Successfully parsed result before validation
      context.logger.logDebug(
        this.name,
        "Successfully parsed AI response, validating against schema",
        {
          caseId,
          parsedResult: parsedResult,
          assignmentCount: parsedResult?.assignments?.length || 0
        }
      );

      // Validate against the appropriate schema based on phase
      const schema = phase === "phase1" ? Phase1ModifierVectorSearchResultSchema : Phase2ModifierVectorSearchResultSchema;
      const validatedResult = schema.parse(parsedResult);
      
      // LOG: Final validated result with extracted modifiers
      context.logger.logInfo(
        this.name,
        "Vector modifier search completed successfully - EXTRACTED MODIFIERS",
        {
          caseId,
          totalAssignments: validatedResult.assignments.length,
          extractedModifiers: validatedResult.assignments.map(assignment => {
            // Handle Phase1 assignments (single modifier per assignment)
            if ('modifier' in assignment) {
              return {
                lineId: assignment.lineId,
                modifier: assignment.modifier,
                code: assignment.code,
                editType: assignment.editType,
                rationale: assignment.rationale,
                documentationSupportsBypass: assignment.documentationSupportsBypass,
                evidenceCount: assignment.evidence?.length || 0,
                evidence: assignment.evidence?.map((ev: any) => ({
                  excerpt: ev.excerpt.substring(0, 100) + (ev.excerpt.length > 100 ? "..." : ""),
                  sourceNoteType: ev.sourceNoteType
                })) || []
              };
            }
            // Handle Phase2 assignments (multiple modifiers per assignment)
            else {
              return {
                lineId: assignment.lineId,
                modifiers: assignment.modifiers.map((mod: any) => ({
                  modifier: mod.modifier,
                  rationale: mod.rationale,
                  description: mod.description,
                  evidenceCount: mod.evidence?.length || 0,
                  evidence: mod.evidence?.map((ev: any) => ({
                    excerpt: ev.excerpt.substring(0, 100) + (ev.excerpt.length > 100 ? "..." : ""),
                    sourceNoteType: ev.sourceNoteType,
                    description: ev.description
                  })) || []
                }))
              };
            }
          }),
          validatedResult: validatedResult
        }
      );

      return validatedResult;

    } catch (error) {
      context.logger.logError(
        this.name,
        `Vector modifier search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { 
          caseId,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error
        }
      );
      throw error;
    }
  }

  private processPhase1ModifierResults(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
    modifierResult: Phase1ModifierVectorSearchResult,
    cciResult?: CCIResult
  ): ProcedureLineItem[] {
    const { caseId } = context.state.caseMeta;
    const updatedLineItems = [...lineItems];

    context.logger.logDebug(
      this.name,
      "Processing Phase 1 compliance modifier results",
      {
        caseId,
        totalAssignments: modifierResult.assignments.length,
        totalLineItems: lineItems.length,
      }
    );

    for (const assignment of modifierResult.assignments) {
      const lineItem = updatedLineItems.find(item => item.lineId === assignment.lineId);
      if (!lineItem) {
        context.logger.logWarn(
          this.name,
          "Line item not found for Phase 1 assignment",
          { caseId, lineId: assignment.lineId }
        );
        continue;
      }

      // Process PTP conflicts with modifiers
      if (assignment.editType === "PTP" && assignment.modifier) {
        const ptpModifier: StandardizedModifier = {
          linkedCptCode: assignment.code,
          modifier: assignment.modifier,
          description: this.getModifierDescription(assignment.modifier),
          rationale: assignment.rationale,
          classification: this.getModifierClassification(assignment.modifier),
          requiredDocumentation: this.getModifierDocumentationRequirement(assignment.modifier),
          feeAdjustment: this.getModifierFeeAdjustment(assignment.modifier),
          evidence: this.convertEvidenceToStandardized(assignment.evidence || []),
        };
        lineItem.phase1Modifiers.push(ptpModifier);

        // Check if this modifier resolves a PTP conflict and create evidence
        const ptpResolution = this.checkAndDowngradePTPConflict(
          assignment.code,
          assignment.modifier,
          cciResult,
          context.state.allEvidence,
          context.logger,
          caseId,
        );

        context.logger.logInfo(
          this.name,
          "PTP modifier added in Phase 1",
          {
            caseId,
            lineId: assignment.lineId,
            procedureCode: assignment.code,
            modifier: assignment.modifier,
            description: ptpModifier.description,
          }
        );
      } 
      // Process MUE violations
      else if (assignment.editType === "MUE") {
        const originalProc = context.state.procedureCodes?.find(p => p.code === assignment.code);
        if (originalProc && assignment.documentationSupportsBypass === true && assignment.modifier) {
          // Split the line item if documentation supports bypass
          this.splitLineItemForMUEWithModifier(lineItem, originalProc, updatedLineItems, assignment.modifier, assignment.rationale);
          
          context.logger.logInfo(
            this.name,
            "MUE bypass approved - splitting line item with modifier",
            {
              caseId,
              lineId: assignment.lineId,
              procedureCode: assignment.code,
              modifier: assignment.modifier,
              originalUnits: originalProc.units,
              mueLimit: originalProc.mueLimit,
            }
          );
        } else if (assignment.documentationSupportsBypass === false) {
          // Truncate units if documentation is insufficient
          this.truncateLineItemForMUE(lineItem, originalProc, assignment.rationale);
          
          context.logger.logInfo(
            this.name,
            "MUE bypass denied - truncating units",
            {
              caseId,
              lineId: assignment.lineId,
              procedureCode: assignment.code,
              originalUnits: originalProc?.units,
              truncatedUnits: originalProc?.mueLimit,
            }
          );
        }
      }
    }

    return updatedLineItems;
  }

  private processPhase2ModifierResults(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
    modifierResult: Phase2ModifierVectorSearchResult
  ): ProcedureLineItem[] {
    const { caseId } = context.state.caseMeta;
    const updatedLineItems = [...lineItems];

    context.logger.logDebug(
      this.name,
      "Processing Phase 2 ancillary modifier results",
      {
        caseId,
        totalAssignments: modifierResult.assignments.length,
        totalLineItems: lineItems.length,
      }
    );

    for (const assignment of modifierResult.assignments) {
      const lineItem = updatedLineItems.find(item => item.lineId === assignment.lineId);
      if (!lineItem) {
        context.logger.logWarn(
          this.name,
          "Line item not found for Phase 2 assignment",
          { caseId, lineId: assignment.lineId }
        );
        continue;
      }

      // Process ancillary modifiers (non-compliance related)
      for (const modifierAssignment of assignment.modifiers) {
        const modifier: StandardizedModifier = {
          linkedCptCode: lineItem.procedureCode,
          modifier: modifierAssignment.modifier,
          description: modifierAssignment.description || this.getModifierDescription(modifierAssignment.modifier),
          rationale: modifierAssignment.rationale,
          classification: this.getModifierClassification(modifierAssignment.modifier),
          requiredDocumentation: this.getModifierDocumentationRequirement(modifierAssignment.modifier),
          feeAdjustment: this.getModifierFeeAdjustment(modifierAssignment.modifier),
          evidence: this.convertPhase2EvidenceToStandardized(modifierAssignment.evidence || []),
        };
        lineItem.phase2Modifiers.push(modifier);
        
        context.logger.logInfo(
          this.name,
          "Ancillary modifier added in Phase 2",
          {
            caseId,
            lineId: assignment.lineId,
            procedureCode: lineItem.procedureCode,
            modifier: modifierAssignment.modifier,
            description: modifier.description,
          }
        );
      }
    }

    return updatedLineItems;
  }

  private splitLineItemForMUE(
    lineItem: ProcedureLineItem,
    originalProc: EnhancedProcedureCode,
    allLineItems: ProcedureLineItem[],
    rationale: string
  ): void {
    if (!originalProc.units || !originalProc.mueLimit) return;

    const unitsNeeded = originalProc.units;
    const linesNeeded = unitsNeeded;

    // Remove the original line item
    const index = allLineItems.indexOf(lineItem);
    if (index > -1) {
      allLineItems.splice(index, 1);
    }

    // Create new line items for each unit
    for (let lineNum = 1; lineNum <= linesNeeded; lineNum++) {
      const newLineItem: ProcedureLineItem = {
        lineId: `${originalProc.code}-line-${lineNum}`,
        procedureCode: originalProc.code,
        units: 1,
        phase1Modifiers: [],
        phase2Modifiers: [],
        complianceFlag: {
          message: `MUE bypass approved: ${rationale}`,
          severity: "INFO" as const,
        },
      };
      allLineItems.push(newLineItem);
    }
  }

  private splitLineItemForMUEWithModifier(
    lineItem: ProcedureLineItem,
    originalProc: EnhancedProcedureCode,
    allLineItems: ProcedureLineItem[],
    modifier: string,
    rationale: string
  ): void {
    if (!originalProc.units || !originalProc.mueLimit) return;

    const unitsNeeded = originalProc.units;
    const linesNeeded = unitsNeeded;

    // Remove the original line item
    const index = allLineItems.indexOf(lineItem);
    if (index > -1) {
      allLineItems.splice(index, 1);
    }

    // Create new line items for each unit with the modifier
    for (let lineNum = 1; lineNum <= linesNeeded; lineNum++) {
      const mueModifier: StandardizedModifier = {
        linkedCptCode: originalProc.code,
        modifier: modifier,
        description: this.getModifierDescription(modifier),
        rationale: rationale,
        classification: this.getModifierClassification(modifier),
        requiredDocumentation: this.getModifierDocumentationRequirement(modifier),
        feeAdjustment: this.getModifierFeeAdjustment(modifier),
        evidence: [],
      };

      const newLineItem: ProcedureLineItem = {
        lineId: `${originalProc.code}-line-${lineNum}`,
        procedureCode: originalProc.code,
        units: 1,
        phase1Modifiers: [mueModifier],
        phase2Modifiers: [],
        complianceFlag: {
          message: `MUE bypass approved with modifier ${modifier}: ${rationale}`,
          severity: "INFO" as const,
        },
      };
      allLineItems.push(newLineItem);
    }
  }

  private truncateLineItemForMUE(
    lineItem: ProcedureLineItem,
    originalProc: EnhancedProcedureCode | undefined,
    rationale: string
  ): void {
    if (!originalProc?.mueLimit) return;

    lineItem.units = originalProc.mueLimit;
    lineItem.complianceFlag = {
      message: `MUE violation: Units truncated. ${rationale}`,
      severity: "ERROR" as const,
      originalUnits: originalProc.units,
      truncatedUnits: originalProc.mueLimit,
    };
  }

  private createLineItemsFromProcedureCodes(
    context: LoggedAgentExecutionContext,
    procedureCodes: EnhancedProcedureCode[],
    cciResult?: CCIResult
  ): {
    items: ProcedureLineItem[];
    evidence: StandardizedEvidence[];
    errors: ProcessingError[];
  } {
    const items: ProcedureLineItem[] = [];
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const { caseId } = context.state.caseMeta;

    for (const proc of procedureCodes) {
      if (proc.units === undefined || proc.mueLimit === undefined || proc.mai === undefined) {
        const error = this.createErrorWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          `Missing MUE data for procedure ${proc.code}`,
          ProcessingErrorSeverity.HIGH,
          { procedureCode: proc.code, caseId }
        );
        errors.push(error);
        continue;
      }

      const lineItem: ProcedureLineItem = {
        lineId: `${proc.code}-line-1`,
        procedureCode: proc.code,
        units: proc.units,
        phase1Modifiers: [],
        phase2Modifiers: [],
      };

      items.push(lineItem);

      evidence.push(
        this.createEvidence(
          [],
          `Line item created for ${proc.code}`,
          1.0,
          Notes.OPERATIVE,
          {
            type: "line_item_creation",
            data: {
              procedureCode: proc.code,
              units: proc.units,
              mueLimit: proc.mueLimit,
              mai: proc.mai,
            },
          }
        )
      );
    }

    return { items, evidence, errors };
  }

  private filterLineItemsWithAllowedModifiers(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
    phase?: "phase1" | "phase2"
  ): (ProcedureLineItem & { allowedModifiers: PreVettedModifier[] })[] {
    const { caseId } = context.state.caseMeta;

    return lineItems.map((lineItem) => {
      const procedureCode = context.state.procedureCodes?.find(
        (p) => p.code === lineItem.procedureCode
      );

      if (!procedureCode?.modifiersApplicable?.length) {
        context.logger.logWarn(
          this.name,
          `No allowed modifiers found for procedure ${lineItem.procedureCode}`,
          { caseId, lineId: lineItem.lineId, procedureCode: lineItem.procedureCode }
        );
        return { ...lineItem, allowedModifiers: [] };
      }

      // Filter modifiers based on phase
      const allowedModifiers = filterAllowedModifiers(procedureCode.modifiersApplicable, phase);

      context.logger.logDebug(this.name, `Filtered modifiers for ${phase || 'all phases'}`, {
        caseId,
        lineId: lineItem.lineId,
        procedureCode: lineItem.procedureCode,
        totalAllowedModifiers: procedureCode.modifiersApplicable.length,
        filteredModifiers: allowedModifiers.length,
        allowedModifierCodes: allowedModifiers.map((m) => m.code),
      });

      return { ...lineItem, allowedModifiers };
    });
  }

  private convertEvidenceToStandardized(
    evidence: Array<{ excerpt: string; sourceNoteType?: string }>
  ): StandardizedEvidence[] {
    return evidence.map((ev) => ({
      verbatimEvidence: [ev.excerpt],
      rationale: `Evidence from ${ev.sourceNoteType || 'clinical note'}`,
      sourceAgent: Agents.MODIFIER,
      sourceNote: this.mapSourceNoteType(ev.sourceNoteType),
      confidence: 0.9,
      content: {
        originalFormat: {
          sourceNoteType: ev.sourceNoteType,
          excerpt: ev.excerpt,
        },
      },
    }));
  }

  private convertPhase2EvidenceToStandardized(
    evidence: Array<{ description: string; excerpt: string; sourceNoteType?: string }>
  ): StandardizedEvidence[] {
    return evidence.map((ev) => ({
      verbatimEvidence: [ev.excerpt],
      rationale: ev.description || `Evidence from ${ev.sourceNoteType || 'clinical note'}`,
      sourceAgent: Agents.MODIFIER,
      sourceNote: this.mapSourceNoteType(ev.sourceNoteType),
      confidence: 0.9,
      content: {
        originalFormat: {
          description: ev.description,
          sourceNoteType: ev.sourceNoteType,
          excerpt: ev.excerpt,
        },
      },
    }));
  }

  private mapSourceNoteType(sourceNoteType?: string): Notes {
    if (!sourceNoteType) return Notes.OPERATIVE;

    switch (sourceNoteType.toLowerCase()) {
      case "operative":
        return Notes.OPERATIVE;
      case "admission":
        return Notes.ADMISSION;
      case "discharge":
        return Notes.DISCHARGE;
      case "pathology":
        return Notes.PATHOLOGY;
      case "progress":
        return Notes.PROGRESS;
      case "bedside":
        return Notes.BEDSIDE;
      default:
        return Notes.OPERATIVE;
    }
  }

  // Helper methods (reused from original agent)
  private extractProcedureCodesFromState(
    state: StandardizedWorkflowState
  ): EnhancedProcedureCode[] | undefined {
    return state.procedureCodes;
  }

  private extractCCIResultFromEvidence(
    evidence: StandardizedEvidence[]
  ): CCIResult | undefined {
    for (const ev of evidence) {
      if (ev.content && ev.content.cciResult) {
        return ev.content.cciResult as CCIResult;
      }
    }
    return undefined;
  }

  private convertLineItemsToFinalModifiers(
    lineItems: ProcedureLineItem[]
  ): StandardizedModifier[] {
    const finalModifiers: StandardizedModifier[] = [];

    for (const lineItem of lineItems) {
      for (const modifier of lineItem.phase1Modifiers) {
        if (modifier.modifier) {
          finalModifiers.push(modifier);
        }
      }
      for (const modifier of lineItem.phase2Modifiers) {
        if (modifier.modifier) {
          finalModifiers.push(modifier);
        }
      }
    }

    return finalModifiers;
  }

  private getModifierDescription(modifier: string): string {
    const descriptions: Record<string, string> = {
      XE: "Separate Encounter",
      XS: "Separate Structure", 
      XP: "Separate Practitioner",
      XU: "Unusual Non-overlapping Service",
      "59": "Distinct Procedural Service",
      "25": "Significant, Separately Identifiable E/M Service",
      "57": "Decision for Surgery",
      "24": "Unrelated E/M Service During Global Period",
      "58": "Staged or Related Procedure",
      "78": "Unplanned Return to OR",
      "79": "Unrelated Procedure During Global Period",
      "50": "Bilateral Procedure",
      RT: "Right Side",
      LT: "Left Side",
      "52": "Reduced Services",
      "53": "Discontinued Procedure",
      "62": "Two Surgeons",
      "80": "Assistant Surgeon",
      "81": "Minimum Assistant Surgeon",
      "82": "Assistant Surgeon (No Resident Available)",
      "66": "Surgical Team",
      "22": "Increased Procedural Services",
    };
    return descriptions[modifier] || `Modifier ${modifier}`;
  }

  private getModifierClassification(modifier: string): ModifierClassifications {
    const pricingModifiers = ["50", "52", "62", "66", "78", "79", "22"];
    const paymentModifiers = ["25", "57", "24", "58"];
    const locationModifiers = ["RT", "LT"];

    if (pricingModifiers.includes(modifier)) return ModifierClassifications.PRICING;
    if (paymentModifiers.includes(modifier)) return ModifierClassifications.PAYMENT;
    if (locationModifiers.includes(modifier)) return ModifierClassifications.LOCATION;
    return ModifierClassifications.INFORMATIONAL;
  }

  private getModifierDocumentationRequirement(modifier: string): string | boolean {
    const highDocModifiers = ["25", "57", "59", "XE", "XS", "XP", "XU", "22"];
    return highDocModifiers.includes(modifier)
      ? "Detailed documentation required to support modifier usage"
      : true;
  }

  private getModifierFeeAdjustment(modifier: string): string {
    const adjustments: Record<string, string> = {
      "50": "+50%",
      "52": "Reduced",
      "62": "Split fee",
      "66": "Team surgery rates",
      "78": "Global period adjustment",
      "79": "Global period adjustment",
      "22": "Increased fee",
    };
    return adjustments[modifier] || "None";
  }

  /**
   * Checks if a modifier resolves a PTP conflict and creates evidence to downgrade severity
   */
  private checkAndDowngradePTPConflict(
    procedureCode: string,
    modifier: string,
    cciResult?: CCIResult,
    allEvidence?: StandardizedEvidence[],
    logger?: any,
    caseId?: string,
  ): StandardizedEvidence | null {
    if (!cciResult || !cciResult.ptpFlags || !modifier) {
      return null;
    }

    // Find PTP flags where this procedure is the secondary code and modifier is applicable
    const relevantPTPFlag = cciResult.ptpFlags.find(
      (flag) =>
        flag.secondaryCode === procedureCode &&
        flag.severity === "ERROR" &&
        (flag.modifierIndicator === "1" || flag.modifierIndicator === "2") &&
        flag.allowedModifiers?.includes(modifier),
    );

    if (!relevantPTPFlag) {
      return null;
    }

    logger?.logInfo(
      this.name,
      `Downgrading PTP conflict severity for ${procedureCode} with modifier ${modifier}`,
      {
        caseId,
        primaryCode: relevantPTPFlag.primaryCode,
        secondaryCode: relevantPTPFlag.secondaryCode,
        modifier,
        originalSeverity: relevantPTPFlag.severity,
        newSeverity: "INFO",
      },
    );

    // CRITICAL: Update the original PTP flag severity in place
    relevantPTPFlag.severity = "INFO" as any;
    relevantPTPFlag.issue = `PTP conflict resolved with modifier ${modifier}: ${relevantPTPFlag.issue}`;

    // Create evidence that documents the PTP conflict resolution
    return this.createEvidence(
      [],
      `PTP conflict resolved for ${procedureCode} with modifier ${modifier}`,
      1.0,
      Notes.OPERATIVE,
      {
        type: "ptp_conflict_resolved",
        data: {
          originalPTPFlag: {
            primaryCode: relevantPTPFlag.primaryCode,
            secondaryCode: relevantPTPFlag.secondaryCode,
            modifierIndicator: relevantPTPFlag.modifierIndicator,
            originalSeverity: "ERROR",
            issue: relevantPTPFlag.issue,
          },
          resolvedBy: {
            modifier,
            newSeverity: "INFO",
            resolution: `PTP conflict resolved by applying modifier ${modifier}. Original error downgraded to informational.`,
          },
          downgradedPTPFlag: {
            ...relevantPTPFlag,
            severity: "INFO",
            issue: `PTP conflict resolved with modifier ${modifier}: ${relevantPTPFlag.issue}`,
          },
        },
      },
    );
  }

  private createErrorWithCode(
    code: string,
    message: string,
    severity: ProcessingErrorSeverity = ProcessingErrorSeverity.MEDIUM,
    context?: Record<string, any>
  ): ProcessingError {
    const baseError = super.createError(message, severity, context, this.name);
    return { ...baseError, code };
  }

  protected createFailureResult(
    errors: ProcessingError[],
    evidence: StandardizedEvidence[],
    executionTime: number,
    context?: LoggedAgentExecutionContext
  ): StandardizedAgentResult {
    return {
      success: false,
      evidence,
      data: { caseId: context?.caseId },
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        executionTime,
        version: "3.0.0",
        agentName: Agents.MODIFIER,
      },
    };
  }

  private createModifierSuccessResult(
    finalModifiers: StandardizedModifier[],
    evidence: StandardizedEvidence[],
    executionTime: number
  ): StandardizedAgentResult {
    return {
      success: true,
      evidence,
      data: { finalModifiers },
      errors: undefined,
      metadata: {
        executionTime,
        version: "3.0.0",
        agentName: Agents.MODIFIER,
      },
    };
  }

  /**
   * Pre-processing: Filter line items that require Phase 1 modifier processing
   * Only include procedures with:
   * 1. PTP edits where MI = 1 (modifier allowed)
   * 2. MUE overrides where MAI = 1 (modifier allowed for override)
   */
  private preprocessPhase1LineItems(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
    cciResult?: CCIResult
  ): ProcedureLineItem[] {
    const { caseId } = context.state.caseMeta;
    const phase1RequiredItems: ProcedureLineItem[] = [];

    for (const lineItem of lineItems) {
      let requiresPhase1 = false;
      const reasons: string[] = [];

      // Check for PTP edits with MI = 1
      if (cciResult?.ptpFlags) {
        const ptpConflicts = cciResult.ptpFlags.filter(
          flag => 
            (flag.primaryCode === lineItem.procedureCode || flag.secondaryCode === lineItem.procedureCode) &&
            flag.modifierIndicator === "1" &&
            flag.severity === "ERROR"
        );
        
        if (ptpConflicts.length > 0) {
          requiresPhase1 = true;
          reasons.push(`PTP conflicts with MI=1: ${ptpConflicts.map(f => `${f.primaryCode}-${f.secondaryCode}`).join(', ')}`);
        }
      }

      // Check for MUE overrides with MAI = 1
      const originalProc = context.state.procedureCodes?.find(p => p.code === lineItem.procedureCode);
      if (originalProc && originalProc.mai === 1 && originalProc.units > (originalProc.mueLimit || 0)) {
        requiresPhase1 = true;
        reasons.push(`MUE override needed: MAI=1, ${originalProc.units} units > ${originalProc.mueLimit} limit`);
      }

      if (requiresPhase1) {
        // Add rationale and description to line item for prompt context
        const enhancedLineItem = {
          ...lineItem,
          phase1Rationale: reasons.join('; '),
          procedureDescription: originalProc?.description || `Procedure ${lineItem.procedureCode}`,
          enhancedProcedureCode: originalProc
        };
        
        phase1RequiredItems.push(enhancedLineItem);
        
        context.logger.logDebug(
          this.name,
          "Line item requires Phase 1 processing",
          {
            caseId,
            lineId: lineItem.lineId,
            procedureCode: lineItem.procedureCode,
            reasons: reasons,
            procedureDescription: originalProc?.description
          }
        );
      }
    }

    context.logger.logInfo(
      this.name,
      "Phase 1 preprocessing completed",
      {
        caseId,
        totalLineItems: lineItems.length,
        phase1RequiredItems: phase1RequiredItems.length,
        skippedItems: lineItems.length - phase1RequiredItems.length
      }
    );

    return phase1RequiredItems;
  }

  // ============================================================================
  // ERROR HANDLING AND FALLBACK HELPER METHODS
  // ============================================================================

  /**
   * Detects if an error is a content filter violation (HTTP 400 with content_filter)
   */
  private isContentFilterError(error: any): boolean {
    if (!error) return false;
    
    // Check for HTTP 400 status
    if (error.status !== 400) return false;
    
    // Check for content filter in error data
    const errorData = error.errorData || {};
    const errorCode = errorData.error?.code || errorData.code;
    
    // Look for content filter indicators
    if (errorCode === 'content_filter' || errorCode === 'ResponsibleAIPolicyViolation') {
      return true;
    }
    
    // Check error message for content filter keywords
    const errorMessage = error.message || errorData.message || '';
    if (errorMessage.toLowerCase().includes('content filter') || 
        errorMessage.toLowerCase().includes('responsible ai policy')) {
      return true;
    }
    
    return false;
  }

  /**
   * Detects if an error is a rate limit violation (HTTP 429)
   */
  private isRateLimitError(error: any): boolean {
    return error && error.status === 429;
  }

  /**
   * Extracts content filter details from the error for logging
   */
  private extractContentFilterDetails(error: any): any {
    const errorData = error.errorData || {};
    const details: any = {
      code: errorData.error?.code || errorData.code,
      message: errorData.error?.message || errorData.message
    };
    
    // Extract specific filter details if available
    if (errorData.error?.innererror) {
      details.innerError = errorData.error.innererror;
    }
    
    // Look for violence, hate, sexual, self_harm categories
    const categories = ['violence', 'hate', 'sexual', 'self_harm'];
    for (const category of categories) {
      if (errorData[category] || errorData.error?.[category]) {
        details[category] = errorData[category] || errorData.error[category];
      }
    }
    
    return details;
  }

  /**
   * Extracts retry-after header from rate limit errors
   */
  private extractRetryAfter(error: any): number | null {
    if (!error.headers) return null;
    
    const retryAfter = error.headers['retry-after'] || error.headers['Retry-After'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? null : seconds;
    }
    
    return null;
  }

  /**
   * Creates a safer version of the prompt to avoid content filter triggers
   * This implements "Safe Re-prompting" strategy
   */
  private createSafeReprompt(originalPrompt: string): string {
    // Remove potentially triggering words and replace with medical terminology
    let safePrompt = originalPrompt;
    
    // Replace potentially triggering surgical terms with neutral alternatives
    const replacements = [
      // Surgical terms that might trigger violence filters
      { pattern: /\b(cut|cutting|incision|incise)\b/gi, replacement: 'surgical access' },
      { pattern: /\b(dissect|dissection|dissected)\b/gi, replacement: 'anatomical separation' },
      { pattern: /\b(excise|excision|excising)\b/gi, replacement: 'surgical removal' },
      { pattern: /\b(ablate|ablation)\b/gi, replacement: 'therapeutic elimination' },
      { pattern: /\b(destroy|destruction|destroying)\b/gi, replacement: 'therapeutic treatment' },
      { pattern: /\b(kill|killing)\b/gi, replacement: 'therapeutic intervention' },
      { pattern: /\b(attack|attacking)\b/gi, replacement: 'therapeutic approach' },
      { pattern: /\b(aggressive)\b/gi, replacement: 'intensive' },
      { pattern: /\b(violent|violence)\b/gi, replacement: 'forceful' },
      
      // Anatomical terms that might be misinterpreted
      { pattern: /\b(penetrat|penetration)\b/gi, replacement: 'surgical access' },
      { pattern: /\b(invasion|invasive)\b/gi, replacement: 'surgical approach' },
      { pattern: /\b(trauma|traumatic)\b/gi, replacement: 'injury-related' },
      
      // General medical procedure terms
      { pattern: /\b(procedure|operation|surgery)\b/gi, replacement: 'medical intervention' },
      { pattern: /\b(patient)\b/gi, replacement: 'individual' },
    ];
    
    // Apply replacements
    for (const { pattern, replacement } of replacements) {
      safePrompt = safePrompt.replace(pattern, replacement);
    }
    
    // Add a safety prefix to the prompt
    const safetyPrefix = `Please analyze the following medical documentation using clinical terminology and focus on procedural coding requirements. Respond with structured JSON data only.\n\n`;
    
    // Ensure the prompt emphasizes medical/clinical context
    if (!safePrompt.toLowerCase().includes('medical') && !safePrompt.toLowerCase().includes('clinical')) {
      safePrompt = safePrompt.replace(
        /^(.*?)(You are|Please|Analyze)/i, 
        '$1As a medical coding specialist, $2'
      );
    }
    
    return safetyPrefix + safePrompt;
  }

  /**
   * Records failure details for monitoring and debugging
   */
  private recordFailure(
    context: LoggedAgentExecutionContext,
    model: string,
    error: any,
    phase: 'vector_search' | 'direct_api'
  ): void {
    const failureDetails = {
      model,
      phase,
      error: {
        message: error.message,
        status: error.status,
        code: error.errorData?.error?.code || error.errorData?.code,
        isContentFilter: this.isContentFilterError(error),
        isRateLimit: this.isRateLimitError(error),
        retryAfter: this.extractRetryAfter(error),
        filterDetails: this.isContentFilterError(error) ? this.extractContentFilterDetails(error) : null
      },
      timestamp: new Date().toISOString(),
      caseId: context.state.caseMeta.caseId
    };

    context.logger.logError(
      this.name,
      `Recorded failure for ${phase} with ${model}`,
      {
        caseId: context.state.caseMeta.caseId,
        deployment: model,
        error: failureDetails.error,
        code: failureDetails.error.code || 'unknown'
      }
    );
  }
}