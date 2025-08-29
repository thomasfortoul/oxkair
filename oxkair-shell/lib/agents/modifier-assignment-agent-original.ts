/**
 * Modifier Assignment Agent
 *
 * This agent is responsible for analyzing all previous agent results and
 * assigning appropriate modifiers to procedure codes based on CCI conflicts,
 * MUE violations, LCD requirements, and demographic considerations.
 */

import { z } from "zod";

import {
  LoggedAgentExecutionContext,
  StandardizedAgentResult,
  CCIResult,
  ProcessingError,
  ProcessingErrorSeverity,
  ERROR_CODES,
  AIModelService,
  Agents,
  StandardizedModifier,
  StandardizedWorkflowState,
  ComplianceIssueTypes,
  ModifierClassifications,
  ComplianceIssueSeverity,
  Notes,
  StandardizedEvidence,
  EnhancedProcedureCode,
  ProcedureLineItem,
} from "./newtypes";
import { Agent } from "./agent-core.ts";

import { MODIFIER_VALIDATION_RULES } from "../../app/coder/lib/modifier-validation-rules.ts";
import {
  buildPhase1ModifierPrompt_Batch,
  buildPhase2ModifierPrompt_Batch,
} from "./prompts/modifier-assignment-prompts.ts";
import {
  filterAllowedModifiers,
  PreVettedModifier,
} from "./modifier-data-loader.ts";

// ============================================================================
// MODIFIER ASSIGNMENT AGENT IMPLEMENTATION
// ============================================================================

export class ModifierAssignmentAgent extends Agent {
  readonly name = "modifier_assignment_agent";
  readonly description =
    "Assigns appropriate modifiers to procedure codes based on comprehensive policy analysis";
  readonly requiredServices = ["aiModel", "cache"] as const;

  async executeInternal(
    context: import("../../app/coder/lib/logging-types.ts").LoggedAgentExecutionContext,
  ): Promise<import("./newtypes.ts").StandardizedAgentResult> {
    const startTime = Date.now();
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const { caseId } = context.state.caseMeta;

    context.logger.logWorkflow(
      this.name,
      `Two-phase modifier assignment started for case: ${caseId}`,
      { caseId },
    );

    try {
      const procedureCodes = this.extractProcedureCodesFromState(
        context.state as any,
      );
      if (!procedureCodes || procedureCodes.length === 0) {
        const error = this.createErrorWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          "No procedure codes available for modifier assignment",
          ProcessingErrorSeverity.HIGH,
          { caseId, workflowStep: context.state.currentStep },
        );
        errors.push(error);
        context.logger.logError(this.name, error.message, { caseId, error });
        return this.createFailureResult(
          errors,
          evidence,
          Date.now() - startTime,
        );
      }

      context.logger.logDebug(
        this.name,
        "Procedure codes found for two-phase modifier assignment.",
        { caseId, count: procedureCodes.length },
      );

      const cciResult = this.extractCCIResultFromEvidence(
        context.state.allEvidence,
      );

      if (!cciResult) {
        context.logger.logWarn(
          this.name,
          "CCI result is not available in the evidence. Proceeding without CCI data.",
          { caseId },
        );
      }

      context.logger.logInfo(
        this.name,
        "Starting Phase 1: MUE and CCI processing",
        { caseId },
      );
      const phase1Result = await this.runPhase1_MueAndCciProcessing(
        context,
        procedureCodes,
        cciResult,
      );

      evidence.push(...(phase1Result.evidence || []));
      errors.push(...(phase1Result.errors || []));

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
        "Starting Phase 2: Ancillary modifier processing",
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
      const phase2Result = await this.runPhase2_AncillaryModifierProcessing(
        context,
        phase1Result.lineItems,
      );

      evidence.push(...(phase2Result.evidence || []));
      errors.push(...(phase2Result.errors || []));

      context.logger.logInfo(this.name, "Phase 2 completed", {
        caseId,
        finalLineItems: phase2Result.lineItems.length,
        errorsCount: phase2Result.errors?.length || 0,
      });

      const finalLineItems = phase2Result.lineItems;

      const validationResult = await this.validateFinalLineItems(
        context,
        finalLineItems,
      );
      evidence.push(...(validationResult.evidence || []));
      errors.push(...(validationResult.errors || []));

      const finalModifierState: StandardizedModifier[] =
        this.convertLineItemsToFinalModifiers(finalLineItems);

      // Add evidence with finalModifiers for state manager
      evidence.push(
        this.createEvidence(
          [],
          "Final modifier assignments for all line items",
          0.9,
          Notes.OPERATIVE,
          {
            finalModifiers: finalModifierState,
          },
        ),
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
          complianceFlags: finalLineItems.filter((item) => item.complianceFlag)
            .length,
          ptpConflictsResolved: evidence.filter(
            (e) => (e as any).content?.type === "ptp_conflict_resolved",
          ).length,
          mueAiSplitsApproved: evidence.filter(
            (e) => (e as any).content?.type === "mue_ai_split_approved",
          ).length,
          mueAiSplitsDenied: evidence.filter(
            (e) => (e as any).content?.type === "mue_ai_split_denied",
          ).length,
          finalModifiers: finalModifierState,
          procedureLineItems: finalLineItems,
        },
        errors: errors.length > 0 ? errors : undefined,
        metadata: {
          executionTime: Date.now() - startTime,
          version: "2.0.0",
          agentName: Agents.MODIFIER,
        },
      };

      context.logger.logInfo(
        this.name,
        "Two-phase modifier assignment completed successfully",
        {
          caseId,
          executionTime: result.metadata.executionTime,
          totalLineItems: finalLineItems.length,
          ptpConflictsResolved: result.data?.ptpConflictsResolved || 0,
          mueAiSplitsApproved: result.data?.mueAiSplitsApproved || 0,
          mueAiSplitsDenied: result.data?.mueAiSplitsDenied || 0,
          success: result.success,
        },
      );

      context.logger.logPerformanceMetrics(this.name, {
        caseId: context.caseId,
        executionTime: result.metadata.executionTime,
        phase1Duration: phase1Result.processingTime || 0,
        phase2Duration: phase2Result.processingTime || 0,
      });

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      context.logger.logError(
        this.name,
        `Two-phase execution failed: ${errorMessage}`,
        {
          caseId,
          executionTime,
          error,
        },
      );
      const processingError = this.createErrorWithCode(
        ERROR_CODES.AGENT_EXECUTION_FAILED,
        `Unexpected error during Two-Phase Modifier Assignment Agent execution: ${errorMessage}`,
        ProcessingErrorSeverity.CRITICAL,
        { caseId, stack: error.stack },
      );
      errors.push(processingError);

      return this.createFailureResult(errors, evidence, executionTime);
    }
  }

  private async runPhase1_MueAndCciProcessing(
    context: LoggedAgentExecutionContext,
    procedureCodes: EnhancedProcedureCode[],
    cciResult?: CCIResult,
  ): Promise<{
    lineItems: ProcedureLineItem[];
    evidence: StandardizedEvidence[];
    errors: ProcessingError[];
    processingTime?: number;
  }> {
    const phase1StartTime = Date.now();
    const lineItems: ProcedureLineItem[] = [];
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];
    const { caseId } = context.state.caseMeta;

    context.logger.logDebug(this.name, "Processing MUE and MAI rules", {
      caseId,
      procedureCount: procedureCodes.length,
    });

    for (let i = 0; i < procedureCodes.length; i++) {
      const proc = procedureCodes[i];

      if (
        proc.units === undefined ||
        proc.mueLimit === undefined ||
        proc.mai === undefined
      ) {
        const error = this.createErrorWithCode(
          ERROR_CODES.VALIDATION_FAILED,
          `Missing MUE data for procedure ${proc.code}: units=${proc.units}, mueLimit=${proc.mueLimit}, mai=${proc.mai}`,
          ProcessingErrorSeverity.HIGH,
          { procedureCode: proc.code, caseId },
        );
        errors.push(error);
        continue;
      }

      context.logger.logDebug(this.name, `Processing procedure ${proc.code}`, {
        caseId,
        code: proc.code,
        units: proc.units,
        mueLimit: proc.mueLimit,
        mai: proc.mai,
      });

      if (proc.units <= proc.mueLimit) {
        const lineItem: ProcedureLineItem = {
          lineId: `${proc.code}-line-1`,
          procedureCode: proc.code,
          units: proc.units,
          phase1Modifiers: [],
          phase2Modifiers: [],
        };
        lineItems.push(lineItem);

        evidence.push(
          this.createEvidence(
            [],
            `MUE processing: No violation for ${proc.code}`,
            1.0,
            Notes.OPERATIVE,
            {
              type: "mue_processing",
              data: {
                procedureCode: proc.code,
                units: proc.units,
                mueLimit: proc.mueLimit,
                mai: proc.mai,
                result: "no_violation",
              },
            },
          ),
        );
      } else {
        if (proc.mai === 2 || proc.mai === 3) {
          const truncatedUnits = proc.mueLimit;
          const lineItem: ProcedureLineItem = {
            lineId: `${proc.code}-line-1`,
            procedureCode: proc.code,
            units: truncatedUnits,
            phase1Modifiers: [],
            phase2Modifiers: [],
            complianceFlag: {
              message:
                proc.mai === 2
                  ? "Compliance Issue: DOS limit is absolute—only allowed units will be billed."
                  : "Compliance Issue: Medicare auto-denies any units beyond limit per DOS.",
              originalUnits: proc.units,
              truncatedUnits: truncatedUnits,
            },
          };
          lineItems.push(lineItem);

          evidence.push(
            this.createEvidence(
              [],
              `MUE processing: Truncated units for ${proc.code}`,
              1.0,
              Notes.OPERATIVE,
              {
                type: "mue_processing",
                data: {
                  procedureCode: proc.code,
                  units: proc.units,
                  mueLimit: proc.mueLimit,
                  mai: proc.mai,
                  result: "truncated",
                  truncatedUnits: truncatedUnits,
                },
              },
            ),
          );

          context.logger.logWarn(
            this.name,
            `MUE violation: Truncated units for ${proc.code}`,
            {
              caseId,
              code: proc.code,
              originalUnits: proc.units,
              truncatedUnits: truncatedUnits,
              mai: proc.mai,
            },
          );
        } else if (proc.mai === 1) {
          // For MAI 1 violations, create a single line item with full requested units
          // The AI will decide whether to split based on documentation
          const lineItem: ProcedureLineItem = {
            lineId: `${proc.code}-line-1`,
            procedureCode: proc.code,
            units: proc.units,
            phase1Modifiers: [],
            phase2Modifiers: [],
          };
          lineItems.push(lineItem);

          evidence.push(
            this.createEvidence(
              [],
              `MUE processing: Pending AI analysis for ${proc.code}`,
              1.0,
              Notes.OPERATIVE,
              {
                type: "mue_processing",
                data: {
                  procedureCode: proc.code,
                  units: proc.units,
                  mueLimit: proc.mueLimit,
                  mai: proc.mai,
                  result: "pending_ai_analysis",
                },
              },
            ),
          );
        }
      }
    }

    context.logger.logDebug(
      this.name,
      "Processing CCI conflicts and assigning Phase 1 modifiers",
      {
        caseId,
        lineItemCount: lineItems.length,
      },
    );

    // Process ALL line items for Phase 1 - we need to check CCI conflicts for all
    // but only apply modifiers where appropriate based on modifier indicator
    if (lineItems.length > 0) {
      try {
        context.logger.logDebug(
          this.name,
          "Starting Phase 1 modifier assignment",
          {
            caseId,
            lineItemsCount: lineItems.length,
            lineItemIds: lineItems.map((li) => li.lineId),
          },
        );

        const phase1ModifierMap = await this.getPhase1Modifiers_Batch(
          context,
          lineItems,
          cciResult,
        );

        context.logger.logDebug(this.name, "Phase 1 modifier map received", {
          caseId,
          modifierMapSize: phase1ModifierMap.size,
          modifierMapKeys: Array.from(phase1ModifierMap.keys()),
          modifiersWithValues: Array.from(phase1ModifierMap.entries()).map(
            ([lineId, mod]) => ({
              lineId,
              hasModifier: !!mod?.modifier,
              modifier: mod?.modifier,
              rationale: mod?.rationale,
            }),
          ),
        });

        const finalLineItems: ProcedureLineItem[] = [];

        for (const lineItem of lineItems) {
          const modifier = phase1ModifierMap.get(lineItem.lineId);
          context.logger.logDebug(
            this.name,
            "Processing line item in Phase 1",
            {
              caseId,
              lineId: lineItem.lineId,
              procedureCode: lineItem.procedureCode,
              hasModifierInMap: !!modifier,
              modifierValue: modifier?.modifier,
            },
          );

          if (modifier) {
            // Check if this is a MAI 1 case that needs post-AI processing
            const originalProc = procedureCodes.find(
              (p) => p.code === lineItem.procedureCode,
            );
            const isMai1Violation =
              originalProc &&
              originalProc.mai === 1 &&
              originalProc.units !== undefined &&
              originalProc.mueLimit !== undefined &&
              originalProc.units > originalProc.mueLimit;

            if (isMai1Violation && "documentationSupportsBypass" in modifier) {
              const typedModifier = modifier as StandardizedModifier & {
                documentationSupportsBypass: boolean;
              };

              if (
                typedModifier.documentationSupportsBypass &&
                typedModifier.modifier
              ) {
                // AI found sufficient documentation - split the line
                const unitsNeeded = originalProc.units;
                const unitsPerLine = 1;
                const linesNeeded = unitsNeeded;

                context.logger.logInfo(
                  this.name,
                  `AI approved splitting ${originalProc.code} into ${linesNeeded} lines`,
                  {
                    caseId,
                    code: originalProc.code,
                    unitsNeeded,
                    linesNeeded,
                  },
                );

                for (let lineNum = 1; lineNum <= linesNeeded; lineNum++) {
                  const splitLineItem: ProcedureLineItem = {
                    lineId: `${originalProc.code}-line-${lineNum}`,
                    procedureCode: originalProc.code,
                    units: unitsPerLine,
                    phase1Modifiers: [typedModifier],
                    phase2Modifiers: [],
                    complianceFlag: {
                      message: `Claimed units exceed limit but sufficient documentation was found to split code across ${linesNeeded} lines.`,
                      severity: "INFO" as const,
                    },
                  };
                  finalLineItems.push(splitLineItem);
                }

                // Check if the modifier also resolves a PTP conflict
                if (
                  typedModifier.modifier &&
                  typedModifier.editType === "PTP"
                ) {
                  const ptpResolution = this.checkAndDowngradePTPConflict(
                    typedModifier.appliesTo || originalProc.code, // Use appliesTo for PTP conflicts
                    typedModifier.modifier,
                    cciResult,
                    context.state.allEvidence,
                    context.logger,
                    caseId,
                  );

                  if (ptpResolution) {
                    evidence.push(ptpResolution);
                  }
                }

                evidence.push(
                  this.createEvidence(
                    [],
                    `MUE AI split approved for ${originalProc.code}`,
                    0.9,
                    Notes.OPERATIVE,
                    {
                      type: "mue_ai_split_approved",
                      data: {
                        procedureCode: originalProc.code,
                        units: originalProc.units,
                        mueLimit: originalProc.mueLimit,
                        linesCreated: linesNeeded,
                        modifier: typedModifier.modifier,
                        rationale: typedModifier.rationale,
                        appliesTo: typedModifier.appliesTo,
                        editType: typedModifier.editType,
                      },
                    },
                  ),
                );
              } else {
                // AI found insufficient documentation - truncate units
                const truncatedLineItem: ProcedureLineItem = {
                  ...lineItem,
                  units: originalProc.mueLimit || 1,
                  phase1Modifiers: [], // No modifier applied for truncated case
                  complianceFlag: {
                    message: `Insufficient documentation exists to append a modifier. Claimed units have been truncated to ${originalProc.mueLimit}.`,
                    severity: "ERROR" as const,
                    originalUnits: originalProc.units,
                    truncatedUnits: originalProc.mueLimit,
                  },
                };
                finalLineItems.push(truncatedLineItem);

                evidence.push(
                  this.createEvidence(
                    [],
                    `MUE AI split denied for ${originalProc.code}`,
                    0.9,
                    Notes.OPERATIVE,
                    {
                      type: "mue_ai_split_denied",
                      data: {
                        procedureCode: originalProc.code,
                        units: originalProc.units,
                        mueLimit: originalProc.mueLimit,
                        truncatedUnits: originalProc.mueLimit,
                        rationale: typedModifier.rationale,
                        appliesTo: typedModifier.appliesTo,
                        editType: typedModifier.editType,
                      },
                    },
                  ),
                );

                context.logger.logWarn(
                  this.name,
                  `AI denied splitting ${originalProc.code} - insufficient documentation`,
                  {
                    caseId,
                    code: originalProc.code,
                    originalUnits: originalProc.units,
                    truncatedUnits: originalProc.mueLimit,
                  },
                );
              }
            } else {
              // Regular processing for non-MAI 1 cases
              if (modifier.modifier) {
                lineItem.phase1Modifiers.push(modifier);

                // Check if this modifier resolves a PTP conflict and downgrade severity
                // Use appliesTo field for PTP conflicts, otherwise use line item procedure code
                const codeToCheck =
                  (modifier as any).editType === "PTP"
                    ? (modifier as any).appliesTo || lineItem.procedureCode
                    : lineItem.procedureCode;

                const ptpResolution = this.checkAndDowngradePTPConflict(
                  codeToCheck,
                  modifier.modifier,
                  cciResult,
                  context.state.allEvidence,
                  context.logger,
                  caseId,
                );

                if (ptpResolution) {
                  evidence.push(ptpResolution);
                }
              }
              finalLineItems.push(lineItem);

              evidence.push(
                this.createEvidence(
                  [],
                  `Phase 1 modifier assignment for ${lineItem.procedureCode}`,
                  0.9,
                  Notes.OPERATIVE,
                  {
                    type: "phase1_modifier_assignment",
                    data: {
                      lineId: lineItem.lineId,
                      procedureCode: lineItem.procedureCode,
                      modifier: modifier.modifier,
                      rationale: modifier.rationale,
                      modifierApplied: !!modifier.modifier,
                      appliesTo: (modifier as any).appliesTo,
                      editType: (modifier as any).editType,
                    },
                  },
                ),
              );
            }
          } else {
            // No modifier assignment found
            context.logger.logWarn(
              this.name,
              "No modifier assignment found for line item",
              {
                caseId,
                lineId: lineItem.lineId,
                procedureCode: lineItem.procedureCode,
              },
            );
            finalLineItems.push(lineItem);
          }
        }

        context.logger.logDebug(
          this.name,
          "Phase 1 processing completed - finalLineItems created",
          {
            caseId,
            finalLineItemsCount: finalLineItems.length,
            finalLineItemIds: finalLineItems.map((li) => li.lineId),
            lineItemsWithPhase1Modifiers: finalLineItems.filter(
              (li) => li.phase1Modifiers.length > 0,
            ).length,
          },
        );

        // Replace the original lineItems array with the processed results
        lineItems.length = 0;
        lineItems.push(...finalLineItems);
      } catch (error: any) {
        const processingError = this.createErrorWithCode(
          ERROR_CODES.EXTERNAL_API_ERROR,
          `Error getting Phase 1 modifiers in batch: ${error.message}`,
          ProcessingErrorSeverity.MEDIUM,
          { lineItemCount: lineItems.length },
        );
        errors.push(processingError);
      }
    }

    const processingTime = Date.now() - phase1StartTime;
    context.logger.logInfo(this.name, "Phase 1 processing completed", {
      caseId,
      processingTime,
      lineItemsCreated: lineItems.length,
      errorsCount: errors.length,
    });

    return {
      lineItems,
      evidence,
      errors,
      processingTime,
    };
  }

  private async runPhase2_AncillaryModifierProcessing(
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

    context.logger.logDebug(this.name, "Processing ancillary modifiers", {
      caseId,
      lineItemCount: lineItems.length,
    });

    try {
      const phase2ModifierMap = await this.getPhase2Modifiers_Batch(
        context,
        lineItems,
      );

      for (const lineItem of lineItems) {
        const modifiers = phase2ModifierMap.get(lineItem.lineId);
        if (modifiers && modifiers.length > 0) {
          lineItem.phase2Modifiers.push(...modifiers);

          for (const modifier of modifiers) {
            evidence.push(
              this.createEvidence(
                [],
                `Phase 2 modifier assignment for ${lineItem.procedureCode}`,
                0.8,
                Notes.OPERATIVE,
                {
                  type: "phase2_modifier_assignment",
                  data: {
                    lineId: lineItem.lineId,
                    procedureCode: lineItem.procedureCode,
                    modifier: modifier.modifier,
                    rationale: modifier.rationale,
                  },
                },
              ),
            );
          }
        }
      }
    } catch (error: any) {
      const processingError = this.createErrorWithCode(
        ERROR_CODES.EXTERNAL_API_ERROR,
        `Error getting Phase 2 modifiers in batch: ${error.message}`,
        ProcessingErrorSeverity.MEDIUM,
        { lineItemCount: lineItems.length },
      );
      errors.push(processingError);
    }

    const processingTime = Date.now() - phase2StartTime;
    context.logger.logInfo(this.name, "Phase 2 processing completed", {
      caseId,
      processingTime,
      lineItemsProcessed: lineItems.length,
      errorsCount: errors.length,
    });

    return {
      lineItems,
      evidence,
      errors,
      processingTime,
    };
  }

  private extractProcedureCodesFromState(
    state: StandardizedWorkflowState,
  ): EnhancedProcedureCode[] | undefined {
    return state.procedureCodes;
  }

  private needsDistinctServiceModifier(
    lineItem: ProcedureLineItem,
    allLineItems: ProcedureLineItem[],
    cciResult?: CCIResult,
  ): boolean {
    // Check for multiple line items with same procedure code
    const sameCodeItems = allLineItems.filter(
      (item) => item.procedureCode === lineItem.procedureCode,
    );
    if (sameCodeItems.length > 1) {
      return true;
    }

    // Check for CCI conflicts where this line item is the SECONDARY code
    // and modifier indicator is "1" (bypass allowed)
    if (cciResult && cciResult.ptpFlags) {
      const hasBypassableConflict = cciResult.ptpFlags.some(
        (flag) =>
          flag.secondaryCode === lineItem.procedureCode &&
          flag.modifierIndicator === "1",
      );
      if (hasBypassableConflict) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determines the CCI modifier indicator status for a line item
   */
  private getCCIModifierIndicatorStatus(
    lineItem: ProcedureLineItem,
    cciResult?: CCIResult,
  ): {
    hasConflict: boolean;
    modifierIndicator?: string;
    conflictType?: string;
  } {
    if (!cciResult || !cciResult.ptpFlags) {
      return { hasConflict: false };
    }

    // Check if this line item is involved in any CCI conflicts
    const relevantFlag = cciResult.ptpFlags.find(
      (flag) =>
        flag.primaryCode === lineItem.procedureCode ||
        flag.secondaryCode === lineItem.procedureCode,
    );

    if (!relevantFlag) {
      return { hasConflict: false };
    }

    return {
      hasConflict: true,
      modifierIndicator: relevantFlag.modifierIndicator,
      conflictType:
        relevantFlag.secondaryCode === lineItem.procedureCode
          ? "secondary"
          : "primary",
    };
  }

  private async getPhase1Modifiers_Batch(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
    cciResult?: CCIResult,
  ): Promise<Map<string, StandardizedModifier>> {
    const aiModelService = context.services.aiModel as AIModelService;

    if (!aiModelService) {
      throw new Error(
        "AI Model Service is not available for Phase 1 modifier assignment",
      );
    }

    // Filter allowed modifiers for Phase 1 (compliance-related modifiers)
    const filteredLineItems = this.filterLineItemsWithAllowedModifiers(
      context,
      lineItems,
      "phase1",
    );

    const prompt = buildPhase1ModifierPrompt_Batch(
      context.state,
      filteredLineItems,
      cciResult,
    );
    const schema = this.getPhase1ModifierSchema_Batch();

    context.logger.logDebug(
      this.name,
      "Calling AI for Phase 1 modifiers (batch)",
      {
        caseId: context.caseId,
        lineItemCount: lineItems.length,
      },
    );

    const aiResponse = await aiModelService.generateStructuredOutput<{
      assignments: Array<{
        lineId: string;
        modifier?: string;
        rationale?: string;
        description?: string;
        appliesTo?: string;
        editType?: "PTP" | "MUE" | "NONE";
        evidence?: Array<{
          description: string;
          excerpt: string;
          sourceNoteType?: string;
        }>;
        documentationSupportsBypass?: boolean;
      }>;
    }>(prompt, schema, "gpt-4.1");

    const resultMap = new Map<string, StandardizedModifier>();

    if (!aiResponse || !aiResponse.assignments) {
      return resultMap;
    }

    const fullNoteText = [
      context.state.caseNotes.primaryNoteText,
      ...context.state.caseNotes.additionalNotes.map((note) => note.content),
    ]
      .filter(Boolean)
      .join("\n\n");

    for (const assignment of aiResponse.assignments) {
      context.logger.logDebug(
        this.name,
        "Processing Phase 1 assignment from AI",
        {
          caseId: context.caseId,
          lineId: assignment.lineId,
          modifier: assignment.modifier,
          rationale: assignment.rationale,
          hasEvidence: !!(
            assignment.evidence && assignment.evidence.length > 0
          ),
        },
      );

      const lineItem = lineItems.find(
        (item) => item.lineId === assignment.lineId,
      );
      if (!lineItem) {
        context.logger.logWarn(
          this.name,
          "Line item not found for assignment",
          {
            caseId: context.caseId,
            lineId: assignment.lineId,
          },
        );
        continue;
      }

      // Find the procedure code that this modifier applies to
      const procedureCode = context.state.procedureCodes?.find(
        (p) => p.code === lineItem.procedureCode,
      );

      let validatedEvidence: {
        excerpt: string;
        sourceNoteType: string | undefined;
        description: string;
      }[] = [];
      // Only validate evidence if there's actually a modifier assigned
      if (
        assignment.modifier &&
        assignment.evidence &&
        assignment.evidence.length > 0
      ) {
        context.logger.logDebug(
          this.name,
          "Validating evidence for Phase 1 assignment",
          {
            caseId: context.caseId,
            lineId: assignment.lineId,
            evidenceCount: assignment.evidence.length,
          },
        );

        validatedEvidence = assignment.evidence
          .map((ev) => {
            const isValidEvidence = this.findVerbatimEvidence(
              fullNoteText,
              ev.excerpt,
            );

            // Enhanced logging for evidence validation
            if (!isValidEvidence) {
              context.logger.logDebug(
                this.name,
                "Evidence validation failed - detailed analysis",
                {
                  caseId: context.caseId,
                  lineId: assignment.lineId,
                  excerptLength: ev.excerpt.length,
                  excerptHasNewlines: ev.excerpt.includes("\n"),
                  excerptHasEllipses: ev.excerpt.includes("..."),
                  excerptPreview: ev.excerpt.substring(0, 150),
                  fullNoteTextLength: fullNoteText.length,
                  fullNoteTextPreview: fullNoteText.substring(0, 200),
                },
              );
            } else {
              context.logger.logDebug(
                this.name,
                "Evidence validation succeeded",
                {
                  caseId: context.caseId,
                  lineId: assignment.lineId,
                  excerptLength: ev.excerpt.length,
                },
              );
            }

            if (isValidEvidence) {
              return {
                excerpt: ev.excerpt,
                sourceNoteType: ev.sourceNoteType,
                description: ev.description,
              };
            } else {
              context.logger.logWarn(
                this.name,
                "Phase 1 evidence excerpt not found in note",
                {
                  caseId: context.caseId,
                  lineId: assignment.lineId,
                  excerpt: ev.excerpt,
                },
              );
              return null;
            }
          })
          .filter(
            (
              ev,
            ): ev is {
              excerpt: string;
              sourceNoteType: string | undefined;
              description: string;
            } => ev !== null,
          );

        context.logger.logDebug(this.name, "Evidence validation completed", {
          caseId: context.caseId,
          lineId: assignment.lineId,
          originalEvidenceCount: assignment.evidence.length,
          validatedEvidenceCount: validatedEvidence.length,
        });
      }

      // Determine the correct procedure code and edit type based on the assignment
      const appliesTo = assignment.appliesTo || lineItem.procedureCode;
      const editType =
        assignment.editType ||
        this.determineEditType(
          lineItem,
          cciResult,
          context.state.procedureCodes,
        );

      const finalModifier: StandardizedModifier & {
        documentationSupportsBypass?: boolean;
        appliesTo?: string;
        editType?: string;
      } = {
        linkedCptCode: procedureCode?.code || lineItem.procedureCode, // Use string reference instead of full object
        modifier: assignment.modifier ?? null, // Convert undefined to null
        description:
          assignment.description ||
          (assignment.modifier
            ? this.getModifierDescription(assignment.modifier)
            : "No distinct-service modifier applicable"),
        rationale: assignment.rationale || "No rationale provided.",
        classification: assignment.modifier
          ? this.getModifierClassification(assignment.modifier)
          : ModifierClassifications.INFORMATIONAL,
        requiredDocumentation: assignment.modifier
          ? this.getModifierDocumentationRequirement(assignment.modifier)
          : false,
        feeAdjustment: assignment.modifier
          ? this.getModifierFeeAdjustment(assignment.modifier)
          : "None",
        evidence:
          validatedEvidence.length > 0
            ? this.convertToStandardizedEvidence(validatedEvidence)
            : [],
        documentationSupportsBypass: assignment.documentationSupportsBypass,
        appliesTo: appliesTo,
        editType: editType || undefined,
      };

      resultMap.set(assignment.lineId, finalModifier);
    }

    return resultMap;
  }

  private async getPhase2Modifiers_Batch(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
  ): Promise<Map<string, StandardizedModifier[]>> {
    const aiModelService = context.services.aiModel as AIModelService;

    if (!aiModelService) {
      throw new Error(
        "AI Model Service is not available for Phase 2 modifier assignment",
      );
    }

    // Filter allowed modifiers for Phase 2 (non-compliance modifiers)
    const filteredLineItems = this.filterLineItemsWithAllowedModifiers(
      context,
      lineItems,
      "phase2",
    );

    const prompt = buildPhase2ModifierPrompt_Batch(
      context.state,
      filteredLineItems,
    );
    const schema = this.getPhase2ModifierSchema_Batch();

    context.logger.logDebug(
      this.name,
      "Calling AI for Phase 2 modifiers (batch)",
      {
        caseId: context.caseId,
        lineItemCount: lineItems.length,
      },
    );

    const aiResponse = await aiModelService.generateStructuredOutput<{
      assignments: Array<{
        lineId: string;
        modifiers: Array<{
          modifier: string;
          rationale: string;
          description?: string;
          evidence?: Array<{
            description: string;
            excerpt: string;
            sourceNoteType?: string;
          }>;
        }>;
      }>;
    }>(prompt, schema);

    const resultMap = new Map<string, StandardizedModifier[]>();

    if (!aiResponse || !aiResponse.assignments) {
      return resultMap;
    }

    const fullNoteText = [
      context.state.caseNotes.primaryNoteText,
      ...context.state.caseNotes.additionalNotes.map((note) => note.content),
    ]
      .filter(Boolean)
      .join("\n\n");

    for (const assignment of aiResponse.assignments) {
      if (!assignment.modifiers || assignment.modifiers.length === 0) {
        resultMap.set(assignment.lineId, []);
        continue;
      }

      context.logger.logDebug(
        this.name,
        "Processing Phase 2 assignment from AI",
        {
          caseId: context.caseId,
          lineId: assignment.lineId,
          modifiers: assignment.modifiers.map((m) => ({
            modifier: m.modifier,
            rationale: m.rationale,
          })),
        },
      );

      const lineItem = lineItems.find(
        (item) => item.lineId === assignment.lineId,
      );
      if (!lineItem) {
        context.logger.logWarn(
          this.name,
          "Line item not found for assignment",
          {
            caseId: context.caseId,
            lineId: assignment.lineId,
          },
        );
        continue;
      }

      // Find the procedure code that this modifier applies to
      const procedureCode = context.state.procedureCodes?.find(
        (p) => p.code === lineItem.procedureCode,
      );

      const finalModifiers: StandardizedModifier[] = assignment.modifiers.map(
        (mod) => {
          let validatedEvidence: {
            excerpt: string;
            sourceNoteType: string | undefined;
            description: string;
          }[] = [];
          if (mod.evidence && mod.evidence.length > 0) {
            validatedEvidence = mod.evidence
              .map((ev) => {
                if (this.findVerbatimEvidence(fullNoteText, ev.excerpt)) {
                  return {
                    excerpt: ev.excerpt,
                    sourceNoteType: ev.sourceNoteType,
                    description: ev.description,
                  };
                } else {
                  context.logger.logWarn(
                    this.name,
                    "Phase 2 evidence excerpt not found in note",
                    {
                      caseId: context.caseId,
                      lineId: assignment.lineId,
                      modifier: mod.modifier,
                      excerpt: ev.excerpt,
                    },
                  );
                  return null;
                }
              })
              .filter(
                (
                  ev,
                ): ev is {
                  excerpt: string;
                  sourceNoteType: string | undefined;
                  description: string;
                } => ev !== null,
              );
          }

          return {
            linkedCptCode: procedureCode?.code || lineItem.procedureCode, // Use string reference instead of full object
            modifier: mod.modifier,
            description:
              mod.description || this.getModifierDescription(mod.modifier),
            rationale: mod.rationale,
            classification: this.getModifierClassification(mod.modifier),
            requiredDocumentation: this.getModifierDocumentationRequirement(
              mod.modifier,
            ),
            feeAdjustment: this.getModifierFeeAdjustment(mod.modifier),
            evidence:
              validatedEvidence.length > 0
                ? this.convertToStandardizedEvidence(validatedEvidence)
                : [],
            editType: undefined, // Phase 2 modifiers don't have a specific edit type
          };
        },
      );

      resultMap.set(assignment.lineId, finalModifiers);
    }

    return resultMap;
  }

  private extractCCIResultFromEvidence(
    evidence: StandardizedEvidence[],
  ): CCIResult | undefined {
    for (const ev of evidence) {
      if (ev.content && ev.content.cciResult) {
        return ev.content.cciResult as CCIResult;
      }
    }
    return undefined;
  }

  /**
   * Finds verbatim evidence in the full note text with normalization to handle formatting differences
   * between the original note text and AI-provided excerpts
   */
  private findVerbatimEvidence(fullNoteText: string, excerpt: string): boolean {
    // More aggressive normalization to handle AI formatting artifacts
    const normalizeText = (text: string): string => {
      return (
        text
          // Convert to lowercase for case-insensitive matching
          .toLowerCase()
          // Handle literal \n strings from AI responses (convert to actual newlines first)
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          // Remove common AI formatting artifacts
          .replace(/\.\.\./g, "") // Remove ellipses
          .replace(/\[.*?\]/g, "") // Remove bracketed content like [sic], [edit], etc.
          .replace(/\n+/g, " ") // Convert newlines to spaces
          .replace(/\r/g, "") // Remove carriage returns
          // Normalize whitespace (multiple spaces, tabs, etc. to single space)
          .replace(/\s+/g, " ")
          // Remove common punctuation that might vary
          .replace(/[‑–—-]/g, "-") // Normalize different dash types
          .replace(/['']/g, "'") // Normalize different apostrophe types
          .replace(/[""]/g, '"') // Normalize different quote types
          // Remove extra spaces around common medical separators
          .replace(/\s*:\s*/g, ":") // Normalize colons
          .replace(/\s*\(\s*/g, "(") // Normalize parentheses
          .replace(/\s*\)\s*/g, ")")
          .trim()
      );
    };

    const normalizedNote = normalizeText(fullNoteText);
    let normalizedExcerpt = normalizeText(excerpt);

    // First try exact match after normalization
    if (normalizedNote.includes(normalizedExcerpt)) {
      return true;
    }

    // Try breaking the excerpt into sentences and matching individual sentences
    const excerptSentences = normalizedExcerpt
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5); // Ignore very short fragments

    if (excerptSentences.length > 0) {
      const matchingSize = excerptSentences.filter((sentence) =>
        normalizedNote.includes(sentence),
      ).length;

      if (matchingSize / excerptSentences.length >= 0.6) {
        return true;
      }
    }

    // If that fails, try fuzzy matching by splitting into meaningful chunks
    // and checking if most chunks are present
    const excerptChunks = normalizedExcerpt
      .split(" ")
      .filter((chunk) => chunk.length > 3) // Ignore short words
      .filter(
        (chunk) => !/^(the|and|of|to|in|for|with|on|at|by|from)$/.test(chunk),
      ) // Filter common words
      .slice(0, 15); // Limit to first 15 meaningful words

    if (excerptChunks.length === 0) {
      return false;
    }

    // Check if at least 70% of meaningful chunks are found
    const foundChunks = excerptChunks.filter((chunk) =>
      normalizedNote.includes(chunk),
    );
    const matchRatio = foundChunks.length / excerptChunks.length;

    if (matchRatio >= 0.7) {
      return true;
    }

    // Final fallback: try to find key medical terms or procedure names
    // This handles cases where the excerpt contains valid medical information
    // but with different formatting than the original note
    const medicalTerms = normalizedExcerpt
      .split(/[,.\n\s]+/)
      .filter((term) => term.length > 4)
      .filter(
        (term) =>
          /^(procedure|operation|surgery|lesion|destruction|electrocardiogram|time|count|report|interpretation)/.test(
            term,
          ) || /\d{5}/.test(term), // CPT codes
      )
      .slice(0, 5); // Limit to prevent false positives

    if (medicalTerms.length > 0) {
      const foundMedicalTerms = medicalTerms.filter((term) =>
        normalizedNote.includes(term),
      );
      const medicalTermRatio = foundMedicalTerms.length / medicalTerms.length;

      if (medicalTermRatio >= 0.8) {
        return true;
      }
    }

    return false;
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
    };
    return descriptions[modifier] || `Modifier ${modifier}`;
  }

  private getModifierClassification(modifier: string): ModifierClassifications {
    const pricingModifiers = ["50", "52", "62", "66", "78", "79"];
    const paymentModifiers = ["25", "57", "24", "58"];
    const locationModifiers = ["RT", "LT"];

    if (pricingModifiers.includes(modifier))
      return ModifierClassifications.PRICING;
    if (paymentModifiers.includes(modifier))
      return ModifierClassifications.PAYMENT;
    if (locationModifiers.includes(modifier))
      return ModifierClassifications.LOCATION;
    return ModifierClassifications.INFORMATIONAL;
  }

  private getModifierDocumentationRequirement(
    modifier: string,
  ): string | boolean {
    const highDocModifiers = ["25", "57", "59", "XE", "XS", "XP", "XU"];
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
    };
    return adjustments[modifier] || "None";
  }

  private getPhase1ModifierSchema_Batch(): z.ZodObject<any> {
    return z
      .object({
        assignments: z
          .array(
            z
              .object({
                lineId: z
                  .string()
                  .describe("The line ID this modifier applies to"),
                modifier: z
                  .string()
                  .nullable()
                  .describe(
                    "The distinct-service modifier code (XE/XS/XP/XU/59) or null if CCI modifier indicator is 0/9 or no modifier needed",
                  ),
                rationale: z
                  .string()
                  .describe(
                    "Required explanation for the modifier choice or why no modifier applies (e.g., 'Modifier not applicable: CCI pair has modifier indicator 0' or 'Modifier not required: CCI edit is deleted/irrelevant (indicator 9)')",
                  ),
                description: z
                  .string()
                  .optional()
                  .describe("Description of the modifier"),
                appliesTo: z
                  .string()
                  .describe(
                    "The procedure code this modifier applies to - for PTP conflicts this is the secondary code, for MUE violations this is the procedure code being split",
                  ),
                editType: z
                  .enum(["PTP", "MUE", "NONE"])
                  .describe(
                    "Type of edit: PTP for CCI conflicts, MUE for medically unlikely edits, NONE if no conflict",
                  ),
                evidence: z
                  .array(
                    z
                      .object({
                        description: z
                          .string()
                          .describe("Why this excerpt supports the modifier"),
                        excerpt: z
                          .string()
                          .describe("Exact excerpt from the note"),
                        sourceNoteType: z
                          .string()
                          .optional()
                          .describe("Type of note the excerpt is from"),
                      })
                      .strict(),
                  )
                  .optional()
                  .describe("Supporting evidence from the clinical note"),
                documentationSupportsBypass: z
                  .boolean()
                  .optional()
                  .describe(
                    "For MAI 1 violations: true if sufficient documentation exists to justify splitting units across multiple lines with modifier, false if documentation is insufficient",
                  ),
              })
              .strict(),
          )
          .describe("Array of modifier assignments for line items"),
      })
      .strict();
  }

  private getPhase2ModifierSchema_Batch(): z.ZodObject<any> {
    return z
      .object({
        assignments: z
          .array(
            z
              .object({
                lineId: z
                  .string()
                  .describe("The line ID these modifiers apply to"),
                modifiers: z
                  .array(
                    z
                      .object({
                        modifier: z
                          .string()
                          .describe("The ancillary modifier code"),
                        rationale: z
                          .string()
                          .describe(
                            "Brief explanation for the modifier choice",
                          ),
                        description: z
                          .string()
                          .optional()
                          .describe("Description of the modifier"),
                        evidence: z
                          .array(
                            z
                              .object({
                                description: z
                                  .string()
                                  .describe(
                                    "Why this excerpt supports the modifier",
                                  ),
                                excerpt: z
                                  .string()
                                  .describe("Exact excerpt from the note"),
                                sourceNoteType: z
                                  .string()
                                  .optional()
                                  .describe("Type of note the excerpt is from"),
                              })
                              .strict(),
                          )
                          .optional()
                          .describe(
                            "Supporting evidence from the clinical note",
                          ),
                      })
                      .strict(),
                  )
                  .describe(
                    "Array of applicable ancillary modifiers for this line item",
                  ),
              })
              .strict(),
          )
          .describe("Array of modifier assignments for line items"),
      })
      .strict();
  }

  private async validateFinalLineItems(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
  ): Promise<{ evidence: StandardizedEvidence[]; errors: ProcessingError[] }> {
    const evidence: StandardizedEvidence[] = [];
    const errors: ProcessingError[] = [];

    for (const lineItem of lineItems) {
      const allModifiers = [
        ...lineItem.phase1Modifiers.map((m) => m.modifier),
        ...lineItem.phase2Modifiers.map((m) => m.modifier),
      ];

      for (const pair of MODIFIER_VALIDATION_RULES.CONFLICTING_PAIRS) {
        if (allModifiers.includes(pair[0]) && allModifiers.includes(pair[1])) {
          errors.push(
            this.createErrorWithCode(
              ERROR_CODES.VALIDATION_FAILED,
              `Conflicting modifiers ${pair[0]} and ${pair[1]} found for line ${lineItem.lineId}`,
              ProcessingErrorSeverity.HIGH,
              { lineId: lineItem.lineId, conflictingPair: pair },
            ),
          );
        }
      }

      const duplicates = allModifiers.filter(
        (modifier, index) => allModifiers.indexOf(modifier) !== index,
      );
      if (duplicates.length > 0) {
        errors.push(
          this.createError(
            `Duplicate modifiers found for line ${lineItem.lineId}: ${duplicates.join(", ")}`,
            ProcessingErrorSeverity.MEDIUM,
            {
              lineId: lineItem.lineId,
              duplicateModifiers: duplicates,
              code: ERROR_CODES.VALIDATION_FAILED,
            },
          ),
        );
      }

      const allModifierObjects = [
        ...lineItem.phase1Modifiers,
        ...lineItem.phase2Modifiers,
      ];
      for (const modifier of allModifierObjects) {
        // Only validate modifiers that actually have a modifier code
        if (modifier.modifier) {
          if (!modifier.description || !modifier.rationale) {
            errors.push(
              this.createError(
                `Incomplete modifier data for ${modifier.modifier} on line ${lineItem.lineId}`,
                ProcessingErrorSeverity.MEDIUM,
                {
                  lineId: lineItem.lineId,
                  modifier: modifier.modifier,
                  code: ERROR_CODES.VALIDATION_FAILED,
                },
              ),
            );
          }

          if (modifier.evidence && Array.isArray(modifier.evidence)) {
            for (const evidenceItem of modifier.evidence) {
              if (
                !evidenceItem.verbatimEvidence ||
                !Array.isArray(evidenceItem.verbatimEvidence) ||
                evidenceItem.verbatimEvidence.length === 0 ||
                typeof evidenceItem.verbatimEvidence[0] !== "string"
              ) {
                errors.push(
                  this.createError(
                    `Invalid evidence format for modifier ${modifier.modifier} on line ${lineItem.lineId}`,
                    ProcessingErrorSeverity.LOW,
                    {
                      lineId: lineItem.lineId,
                      modifier: modifier.modifier,
                      code: ERROR_CODES.VALIDATION_FAILED,
                    },
                  ),
                );
              }
            }
          }
        } else {
          // For null modifiers, just ensure rationale is provided
          if (!modifier.rationale) {
            errors.push(
              this.createError(
                `Missing rationale for null modifier on line ${lineItem.lineId}`,
                ProcessingErrorSeverity.MEDIUM,
                {
                  lineId: lineItem.lineId,
                  code: ERROR_CODES.VALIDATION_FAILED,
                },
              ),
            );
          }
        }
      }
    }

    evidence.push(
      this.createEvidence([], "Line item validation", 1.0, Notes.OPERATIVE, {
        type: "line_item_validation",
        data: {
          totalLineItems: lineItems.length,
          totalModifiers: lineItems.reduce(
            (sum, item) =>
              sum + item.phase1Modifiers.length + item.phase2Modifiers.length,
            0,
          ),
          validationErrors: errors.length,
          conflictingPairs: errors.filter((e) =>
            e.message.includes("Conflicting"),
          ).length,
          duplicateModifiers: errors.filter((e) =>
            e.message.includes("Duplicate"),
          ).length,
          incompleteModifiers: errors.filter((e) =>
            e.message.includes("Incomplete"),
          ).length,
        },
      }),
    );

    return { evidence, errors };
  }

  private convertLineItemsToFinalModifiers(
    lineItems: ProcedureLineItem[],
  ): StandardizedModifier[] {
    const finalModifiers: StandardizedModifier[] = [];

    for (const lineItem of lineItems) {
      // Only include modifiers that actually have a modifier code (not null)
      for (const modifier of lineItem.phase1Modifiers) {
        if (modifier.modifier) {
          finalModifiers.push({
            ...modifier,
            evidence: Array.isArray(modifier.evidence)
              ? modifier.evidence
              : modifier.evidence
                ? [modifier.evidence]
                : [],
          });
        }
      }

      for (const modifier of lineItem.phase2Modifiers) {
        if (modifier.modifier) {
          finalModifiers.push({
            ...modifier,
            evidence: Array.isArray(modifier.evidence)
              ? modifier.evidence
              : modifier.evidence
                ? [modifier.evidence]
                : [],
          });
        }
      }
    }

    return finalModifiers;
  }

  private convertToStandardizedEvidence(
    oldEvidence: {
      excerpt: string;
      sourceNoteType?: string;
      description?: string;
    }[],
  ): StandardizedEvidence[] {
    return oldEvidence.map((ev) => ({
      verbatimEvidence: [ev.excerpt],
      rationale: ev.description || "Evidence supporting modifier assignment",
      sourceAgent: Agents.MODIFIER,
      sourceNote: this.mapSourceNoteType(ev.sourceNoteType),
      confidence: 0.9,
      content: {
        originalFormat: {
          excerpt: ev.excerpt,
          description: ev.description,
          sourceNoteType: ev.sourceNoteType,
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

  // Override with different signature - add code parameter
  private createErrorWithCode(
    code: string,
    message: string,
    severity: ProcessingErrorSeverity = ProcessingErrorSeverity.MEDIUM,
    context?: Record<string, any>,
  ): ProcessingError {
    const baseError = super.createError(message, severity, context, this.name);
    return {
      ...baseError,
      code: code,
    };
  }

  protected createFailureResult(
    errors: import("./newtypes.ts").ProcessingError[],
    evidence: import("./newtypes.ts").StandardizedEvidence[],
    executionTime: number,
    context?: import("../../app/coder/lib/logging-types.ts").LoggedAgentExecutionContext,
  ): StandardizedAgentResult {
    return {
      success: false,
      evidence: evidence,
      data: {
        caseId: context?.caseId,
      },
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        executionTime: executionTime,
        version: "1.0.0",
        agentName: Agents.MODIFIER,
      },
    };
  }

  private calculateOverallConfidence(evidence: StandardizedEvidence[]): number {
    if (evidence.length === 0) {
      return 0;
    }
    const confidences = evidence.map((e) => e.confidence);
    const average =
      confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;

    const evidencePenalty = Math.min(evidence.length / 7, 1);

    return Math.max(0, Math.min(1, average * evidencePenalty));
  }

  /**
   * Determines the edit type (PTP, MUE, or NONE) for a line item
   */
  private determineEditType(
    lineItem: ProcedureLineItem,
    cciResult?: CCIResult,
    procedureCodes?: EnhancedProcedureCode[],
  ): "PTP" | "MUE" | "NONE" {
    // Check for PTP conflicts where this line item is the secondary code
    if (cciResult && cciResult.ptpFlags) {
      const hasPTPConflict = cciResult.ptpFlags.some(
        (flag) =>
          flag.secondaryCode === lineItem.procedureCode &&
          flag.modifierIndicator === "1",
      );
      if (hasPTPConflict) {
        return "PTP";
      }
    }

    // Check for MUE violations
    const originalProc = procedureCodes?.find(
      (p) => p.code === lineItem.procedureCode,
    );
    if (
      originalProc &&
      originalProc.mai === 1 &&
      originalProc.units !== undefined &&
      originalProc.mueLimit !== undefined &&
      originalProc.units > originalProc.mueLimit
    ) {
      return "MUE";
    }

    return "NONE";
  }

  /**
   * Filters line items with their allowed modifiers based on phase
   */
  private filterLineItemsWithAllowedModifiers(
    context: LoggedAgentExecutionContext,
    lineItems: ProcedureLineItem[],
    phase: "phase1" | "phase2",
  ): (ProcedureLineItem & { allowedModifiers: PreVettedModifier[] })[] {
    const { caseId } = context.state.caseMeta;

    return lineItems.map((lineItem) => {
      // Find the corresponding procedure code with allowed modifiers
      const procedureCode = context.state.procedureCodes?.find(
        (p) => p.code === lineItem.procedureCode,
      );

      if (
        !procedureCode ||
        !procedureCode.modifiersApplicable ||
        procedureCode.modifiersApplicable.length === 0
      ) {
        context.logger.logWarn(
          this.name,
          `No allowed modifiers found for procedure ${lineItem.procedureCode}`,
          {
            caseId,
            lineId: lineItem.lineId,
            procedureCode: lineItem.procedureCode,
          },
        );
        // Return line item with empty allowed modifiers to prevent AI from suggesting any modifiers
        return {
          ...lineItem,
          allowedModifiers: [],
        } as ProcedureLineItem & { allowedModifiers: PreVettedModifier[] };
      }

      // Filter modifiers using the new pre-vetted system
      const allowedModifiers = filterAllowedModifiers(
        procedureCode.modifiersApplicable,
        phase,
      );

      context.logger.logDebug(this.name, `Filtered modifiers for ${phase}`, {
        caseId,
        lineId: lineItem.lineId,
        procedureCode: lineItem.procedureCode,
        totalAllowedModifiers: procedureCode.modifiersApplicable.length,
        preVettedModifiers: allowedModifiers.length,
        allowedModifierCodes: allowedModifiers.map((m) => m.code),
      });

      // Store the filtered modifiers for use in prompts
      return {
        ...lineItem,
        allowedModifiers, // Add this field temporarily for prompt building
      } as ProcedureLineItem & { allowedModifiers: PreVettedModifier[] };
    });
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
}
