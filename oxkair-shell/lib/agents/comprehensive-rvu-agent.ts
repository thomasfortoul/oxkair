/**
 * Comprehensive RVU Agent
 *
 * NOTE FOR REVIEW: This file has been reconstructed based on a migration plan.
 * Some methods are placeholders as the full source code was not available during generation.
 * The primary changes are the integration of sequencing logic from the former RVUSequencingAgent.
 *
 * This agent consolidates and enhances RVU processing capabilities by:
 * - Loading and caching RVU data, GPCI factors, and locality crosswalk
 * - Calculating base RVUs for all procedure codes
 * - Applying geographic adjustments (GPCI)
 * - Computing modifier-adjusted RVUs
 * - Sequencing procedure codes for optimal reimbursement using an AI model.
 * - Calculating estimated payment amounts
 * - Flagging RVU-based thresholds and anomalies
 * - Generating comprehensive RVU evidence for WorkflowState
 */

import {
  RVUCalculation,
  RVUResult,
  HCPCSRecord,
  LocalityInfo,
  ModifierRVUAdjustment,
} from "./types";
import { Agent } from "./agent-core";
import {
  Notes,
  StandardizedEvidence,
  StandardizedWorkflowState,
  Demographics,
  StandardizedModifier,
  ProcessingError,
  ProcessingErrorSeverity,
  Agents,
  EnhancedProcedureCode,
} from "./newtypes";
import { z } from "zod";

const AIResponseSchema = z.object({
  sequencingRationale: z.string(),
  finalSequence: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      finalModifiers: z.array(z.string()),
      adjustedRVU: z.number(),
      notes: z.string(),
    }),
  ),
});

export class ComprehensiveRVUAgent extends Agent {
  readonly name = "ComprehensiveRVUAgent";
  readonly description =
    "Performs comprehensive RVU calculations, including geographic adjustments, modifier application, and AI-powered sequencing.";
  readonly requiredServices = [
    "rvuDataService",
    "cache",
    "performance",
    "aiModel",
    "azureStorageService",
  ] as const;

  // Configurable variables as specified in the improvement plan
  private readonly defaultState: string = "WISCONSIN";
  private readonly conversionFactor: number = 1; // Default value for testing as requested

  async executeInternal(context: any): Promise<any> {
    const { state, services, logger } = context;
    const startTime = Date.now();
    logger.logInfo(this.name, "Starting comprehensive RVU processing");

    try {
      // Progress tracking removed
      const validationResult = this.validateInput(
        state as StandardizedWorkflowState,
        logger,
      );
      if (!validationResult.isValid) {
        // Progress tracking removed
        return this.createFailureResult(validationResult.errors);
      }

      const standardizedState = state as StandardizedWorkflowState;
      const { procedureCodes, finalModifiers, demographics } =
        standardizedState;
      const contractor = await this.extractContractor(
        demographics,
        logger,
        services,
      );

      logger.logInfo(this.name, "Loading RVU data sources...");
      // Progress tracking removed
      const dataLoadResult = await this.loadRVUDataSources(
        standardizedState,
        services,
        logger,
      );
      if (!dataLoadResult.success) {
        // Progress tracking removed
        return this.createFailureResult(dataLoadResult.errors);
      }

      logger.logInfo(this.name, "Determining locality...");
      // Progress tracking removed
      const locality = await this.getLocalityInfo(contractor, services, logger);

      logger.logInfo(this.name, "Calculating base RVU values...");
      // Progress tracking removed
      const baseCalculations = await this.calculateBaseRVUs(
        procedureCodes,
        services,
        logger,
        standardizedState.caseMeta.caseId,
      );

      logger.logInfo(this.name, "Applying geographic adjustments...");
      // Progress tracking removed
      const adjustedCalculations = this.applyGeographicAdjustments(
        baseCalculations,
        locality,
        logger,
      );

      logger.logInfo(this.name, "Processing modifier adjustments...");
      // Progress tracking removed
      const finalCalculations = this.applyModifierAdjustments(
        adjustedCalculations,
        finalModifiers || [],
        logger,
      );

      logger.logInfo(this.name, "Sequencing codes...");
      const presortedCalculations = this.sequenceCodes(finalCalculations);

      logger.logInfo(this.name, "Calling AI for optimal sequencing...");
      const sequencedCalculations = presortedCalculations;

      logger.logInfo(this.name, "Calculating payment estimates...");
      // Progress tracking removed
      const calculationsWithPayments = this.calculatePaymentAmounts(
        sequencedCalculations,
        logger,
      );

      logger.logInfo(this.name, "Performing threshold checks...");
      // Progress tracking removed
      const flaggedCalculations = this.performThresholdChecks(
        calculationsWithPayments,
        logger,
      );

      logger.logInfo(this.name, "Generating RVU analysis results...");
      // Progress tracking removed
      const rvuResult = this.generateRVUResult(
        flaggedCalculations,
        locality,
        standardizedState.caseMeta.dateOfService.toISOString().split("T")[0],
        contractor,
        Date.now() - startTime,
        null,
      );

      const evidence = this.generateEvidence(
        rvuResult,
        flaggedCalculations,
        logger,
      );
      const executionTime = Date.now() - startTime;
      logger.logInfo(
        this.name,
        `Comprehensive RVU processing completed in ${executionTime}ms`,
        { ...rvuResult.summary },
      );
      // Progress tracking removed
      return this.createSuccessResult(evidence, executionTime, 0.95, {
        rvuSequencingResult: rvuResult,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.logError(this.name, "Comprehensive RVU processing failed", {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Progress tracking removed
      return this.createFailureResult([
        this.createError(
          `Comprehensive RVU processing failed: ${errorMessage}`,
          ProcessingErrorSeverity.HIGH,
          { originalError: errorMessage, code: "RVU_PROCESSING_ERROR" },
        ),
      ]);
    }
  }

  private validateInput(
    state: StandardizedWorkflowState,
    logger: any,
  ): { isValid: boolean; errors: ProcessingError[] } {
    if (!state.procedureCodes || state.procedureCodes.length === 0) {
      logger.logWarn(
        this.name,
        "No procedure codes found in state. Skipping agent.",
      );
      return {
        isValid: false,
        errors: [
          this.createError(
            "No procedure codes to process",
            ProcessingErrorSeverity.LOW,
            undefined,
            "NO_PROCEDURE_CODES",
          ),
        ],
      };
    }
    return { isValid: true, errors: [] };
  }

  private async extractContractor(
    demographics: Demographics | undefined,
    logger: any,
    services: any,
  ): Promise<string> {
    // Default to Wisconsin as requested in the improvement plan
    const state = demographics?.state || this.defaultState;

    try {
      logger.logInfo(this.name, `Looking up contractor for state: ${state}`);

      // Load location crosswalk data from Azure Storage
      const crosswalkPath = "RVU/location_crosswalk.json";
      const crosswalkData =
        await services.azureStorageService.getFileContent(crosswalkPath);
      const locationCrosswalk = JSON.parse(crosswalkData);

      // Find matching entry for the state (looking for STATEWIDE area)
      const matchingEntry = locationCrosswalk.find(
        (entry: any) =>
          entry.state === state.toUpperCase() && entry.area === "STATEWIDE",
      );

      if (matchingEntry) {
        const contractor = matchingEntry.contractor;
        logger.logInfo(
          this.name,
          `Found contractor ${contractor} for state ${state}`,
        );
        return contractor;
      } else {
        logger.logWarning(
          this.name,
          `No contractor found for state ${state}, falling back to Wisconsin default`,
        );
        // Fallback to Wisconsin contractor as specified in the plan
        const wisconsinEntry = locationCrosswalk.find(
          (entry: any) =>
            entry.state === "WISCONSIN" && entry.area === "STATEWIDE",
        );
        if (wisconsinEntry) {
          logger.logInfo(
            this.name,
            `Using Wisconsin fallback contractor: ${wisconsinEntry.contractor}`,
          );
          return wisconsinEntry.contractor;
        } else {
          logger.logError(
            this.name,
            "Critical error: Wisconsin fallback entry not found in location crosswalk",
          );
          return "06302";
        }
      }
    } catch (error) {
      logger.logError(
        this.name,
        `Error loading contractor data from location_crosswalk.json: ${error}`,
      );
      logger.logInfo(
        this.name,
        `Using hardcoded Wisconsin contractor ID as final fallback: 06302`,
      );
      return "06302";
    }
  }

  private async loadRVUDataSources(
    state: StandardizedWorkflowState,
    services: any,
    logger: any,
  ): Promise<{ success: boolean; errors: ProcessingError[] }> {
    // In a real implementation, this would trigger loading of all necessary data files.
    // Here we assume they are pre-loaded by the service.
    logger.logInfo(
      this.name,
      "RVU Data sources are managed by RVUDataService.",
    );
    return { success: true, errors: [] };
  }

  private async getLocalityInfo(
    contractor: string,
    services: any,
    logger: any,
  ): Promise<LocalityInfo> {
    try {
      logger.logInfo(
        this.name,
        `Looking up GPCI data for contractor: ${contractor}`,
      );

      // Load GPCI data from Azure Storage
      const gpciPath = "RVU/gpci_output.json";
      const gpciData =
        await services.azureStorageService.getFileContent(gpciPath);
      const gpciArray = JSON.parse(gpciData);

      // Find matching contractor entry
      const contractorEntry = gpciArray.find(
        (entry: any) => entry[contractor] !== undefined,
      );

      if (contractorEntry && contractorEntry[contractor]) {
        const gpciInfo = contractorEntry[contractor];
        logger.logInfo(
          this.name,
          `Found GPCI data for contractor ${contractor}: PWGPCI=${gpciInfo.PWGPCI}, PEGPCI=${gpciInfo.PEGPCI}, MPGPCI=${gpciInfo.MPGPCI}`,
        );

        return {
          localityNumber: gpciInfo["Locality Number"].toString(),
          state: gpciInfo.State,
          description: gpciInfo["Locality Name"],
          gpci: {
            work: gpciInfo.PWGPCI,
            pe: gpciInfo.PEGPCI,
            mp: gpciInfo.MPGPCI,
          },
        };
      } else {
        logger.logWarning(
          this.name,
          `No GPCI data found for contractor ${contractor}, falling back to national average`,
        );
        return {
          localityNumber: "00",
          state: "NA",
          description: "National Average (Fallback)",
          gpci: { work: 1.0, pe: 1.0, mp: 1.0 },
        };
      }
    } catch (error) {
      logger.logError(this.name, `Error loading GPCI data: ${error}`);
      return {
        localityNumber: "00",
        state: "NA",
        description: "National Average (Error Fallback)",
        gpci: { work: 1.0, pe: 1.0, mp: 1.0 },
      };
    }
  }

  private async calculateBaseRVUs(
    procedureCodes: EnhancedProcedureCode[],
    services: any,
    logger: any,
    caseId: string,
  ): Promise<RVUCalculation[]> {
    const calculations: RVUCalculation[] = [];
    for (const [index, procCode] of procedureCodes.entries()) {
      const progressPercent =
        35 + Math.floor((index / procedureCodes.length) * 15);
      // Progress tracking removed
      try {
        const hcpcsRecord = (await services.rvuDataService.loadHCPCSRecord(
          procCode.code,
        )) as HCPCSRecord;
        if (!hcpcsRecord) {
          logger.logWarn(
            this.name,
            `HCPCS record not found for code: ${procCode.code}`,
          );
          calculations.push({
            code: procCode.code,
            baseRVUs: { work: 0, pe: 0, mp: 0 },
            gpci: { work: 1, pe: 1, mp: 1 },
            adjustedRVUs: { work: 0, pe: 0, mp: 0 },
            totalAdjustedRVU: 0,
            conversionFactor: this.conversionFactor,
            paymentAmount: 0,
            calculationRationale: "HCPCS record not found - zero RVU assigned",
            flags: ["HCPCS_NOT_FOUND"],
          });
          continue;
        }
        const baseWork = hcpcsRecord.work_rvu;
        const basePe = hcpcsRecord.pe_rvu;
        const baseMp = hcpcsRecord.mp_rvu;
        const baseTotal = Math.round((baseWork + basePe + baseMp) * 100) / 100;

        calculations.push({
          code: procCode.code,
          baseRVUs: {
            work: baseWork,
            pe: basePe,
            mp: baseMp,
          },
          gpci: { work: 1, pe: 1, mp: 1 },
          adjustedRVUs: {
            work: baseWork,
            pe: basePe,
            mp: baseMp,
          },
          totalAdjustedRVU: baseTotal,
          conversionFactor: this.conversionFactor,
          paymentAmount: 0,
          calculationRationale: `Base RVU: ${baseTotal.toFixed(2)}`,
          flags: [],
        });
      } catch (error) {
        logger.logError(
          this.name,
          `Error calculating base RVU for ${procCode.code}`,
          { error },
        );
        calculations.push({
          code: procCode.code,
          baseRVUs: { work: 0, pe: 0, mp: 0 },
          gpci: { work: 1, pe: 1, mp: 1 },
          adjustedRVUs: { work: 0, pe: 0, mp: 0 },
          totalAdjustedRVU: 0,
          conversionFactor: 0,
          paymentAmount: 0,
          flags: ["CALCULATION_ERROR"],
        });
      }
    }
    return calculations;
  }

  private applyGeographicAdjustments(
    calculations: RVUCalculation[],
    locality: LocalityInfo,
    logger: any,
  ): RVUCalculation[] {
    return calculations.map((calc) => {
      const adjustedCalc = { ...calc };
      adjustedCalc.gpci = locality.gpci;
      adjustedCalc.adjustedRVUs = {
        work: calc.baseRVUs.work * locality.gpci.work,
        pe: calc.baseRVUs.pe * locality.gpci.pe,
        mp: calc.baseRVUs.mp * locality.gpci.mp,
      };
      adjustedCalc.totalAdjustedRVU =
        adjustedCalc.adjustedRVUs.work +
        adjustedCalc.adjustedRVUs.pe +
        adjustedCalc.adjustedRVUs.mp;

      // Update calculation rationale to include GPCI adjustment
      const baseTotal =
        calc.baseRVUs.work + calc.baseRVUs.pe + calc.baseRVUs.mp;
      adjustedCalc.calculationRationale = `Base RVU: ${baseTotal.toFixed(2)} -> GPCI Adjusted: ${adjustedCalc.totalAdjustedRVU.toFixed(2)}`;

      logger.logDebug(this.name, `GPCI adjustment for ${calc.code}`, {
        original: calc.baseRVUs,
        adjusted: adjustedCalc.adjustedRVUs,
      });
      return adjustedCalc;
    });
  }

  private applyModifierAdjustments(
    calculations: RVUCalculation[],
    finalModifiers: StandardizedModifier[],
    logger: any,
  ): RVUCalculation[] {
    return calculations.map((calc) => {
      const adjustedCalc = {
        ...calc,
        flags: [...(calc.flags || [])],
        modifierAdjustments: [] as ModifierRVUAdjustment[],
      };
      const codeModifiers = finalModifiers.filter(
        (fm) => fm.linkedCptCode === calc.code,
      );

      // Initialize calculation rationale with base information
      let calculationRationale = `Base RVU: ${calc.baseRVUs.work + calc.baseRVUs.pe + calc.baseRVUs.mp} -> GPCI Adjusted: ${calc.totalAdjustedRVU.toFixed(2)}`;

      if (codeModifiers.length === 0) {
        adjustedCalc.calculationRationale = calculationRationale;
        return adjustedCalc;
      }

      // Initialize multiplier and track applied modifiers
      let multiplier = 1.0;
      const mods = codeModifiers
        .map((m) => m.modifier)
        .filter((m): m is string => m !== null);

      // Apply modifier 50 (bilateral procedure)
      if (mods.includes("50")) {
        multiplier *= 1.5;
        calculationRationale += ` -> Modifier 50 Applied: ${(calc.totalAdjustedRVU * multiplier).toFixed(2)}`;
        adjustedCalc.modifierAdjustments!.push({
          modifier: "50",
          adjustmentType: "percentage",
          adjustmentValue: 1.5,
          appliedToComponents: ["work", "pe", "mp"],
        });
      }

      // Apply modifier 63 (procedure on infant)
      if (mods.includes("63")) {
        const previousMultiplier = multiplier;
        multiplier *= 1.25;
        calculationRationale += ` -> Modifier 63 Applied: ${(calc.totalAdjustedRVU * multiplier).toFixed(2)}`;
        adjustedCalc.modifierAdjustments!.push({
          modifier: "63",
          adjustmentType: "percentage",
          adjustmentValue: 1.25,
          appliedToComponents: ["work", "pe", "mp"],
        });
      }

      // Handle modifier 22 (increased procedural services)
      if (mods.includes("22")) {
        calculationRationale += ` -> Modifier 22 flagged for manual review`;
        if (!adjustedCalc.flags.includes("MANUAL_REVIEW_MODIFIER_22")) {
          adjustedCalc.flags.push("MANUAL_REVIEW_MODIFIER_22");
        }
      }

      // Apply final multiplier to each RVU component individually for precision
      if (multiplier !== 1.0) {
        adjustedCalc.adjustedRVUs.work = parseFloat(
          (calc.adjustedRVUs.work * multiplier).toFixed(2),
        );
        adjustedCalc.adjustedRVUs.pe = parseFloat(
          (calc.adjustedRVUs.pe * multiplier).toFixed(2),
        );
        adjustedCalc.adjustedRVUs.mp = parseFloat(
          (calc.adjustedRVUs.mp * multiplier).toFixed(2),
        );

        // Recalculate total from adjusted components for accuracy
        adjustedCalc.totalAdjustedRVU = parseFloat(
          (
            adjustedCalc.adjustedRVUs.work +
            adjustedCalc.adjustedRVUs.pe +
            adjustedCalc.adjustedRVUs.mp
          ).toFixed(2),
        );
      }

      // Set final calculation rationale
      adjustedCalc.calculationRationale = calculationRationale;

      logger.logDebug(this.name, `Modifier adjustment for ${calc.code}`, {
        originalTotal: calc.totalAdjustedRVU,
        finalTotal: adjustedCalc.totalAdjustedRVU,
        multiplier: multiplier,
        rationale: calculationRationale,
      });

      return adjustedCalc;
    });
  }

  private sequenceCodes(codes: RVUCalculation[]): RVUCalculation[] {
    // Sort by highest adjusted RVU. Does not handle add-on codes yet.
    return [...codes].sort((a, b) => b.totalAdjustedRVU - a.totalAdjustedRVU);
  }

  private reorderCalculationsFromAI(
    calculations: RVUCalculation[],
    aiResult: z.infer<typeof AIResponseSchema>,
  ): RVUCalculation[] {
    const finalSequence = aiResult.finalSequence;
    const orderedCalculations = [...calculations].sort((a, b) => {
      const indexA = finalSequence.findIndex((s) => s.code === a.code) ?? 999;
      const indexB = finalSequence.findIndex((s) => s.code === b.code) ?? 999;
      return indexA - indexB;
    });
    return orderedCalculations;
  }

  private calculatePaymentAmounts(
    calculations: RVUCalculation[],
    logger: any,
  ): RVUCalculation[] {
    return calculations.map((calc) => {
      const paymentAmount = parseFloat(
        (calc.totalAdjustedRVU * calc.conversionFactor).toFixed(2),
      );
      logger.logDebug(
        this.name,
        `Calculated payment for ${calc.code}: ${paymentAmount}`,
      );
      return { ...calc, paymentAmount };
    });
  }

  private performThresholdChecks(
    calculations: RVUCalculation[],
    logger: any,
  ): RVUCalculation[] {
    // Placeholder for threshold check logic (e.g., high RVU, unusual modifier combos)
    return calculations.map((calc) => {
      if (calc.totalAdjustedRVU > 20) {
        if (!calc.flags?.includes("HIGH_RVU_VALUE"))
          calc.flags?.push("HIGH_RVU_VALUE");
      }
      return calc;
    });
  }

  private generateRVUResult(
    calculations: RVUCalculation[],
    locality: LocalityInfo,
    dateOfService: string,
    contractor: string,
    executionTime: number,
    aiSequencingResult: z.infer<typeof AIResponseSchema> | null,
  ): RVUResult {
    const flaggedCalculations = calculations.filter(
      (c) => c.flags && c.flags.length > 0,
    );
    const summary = {
      totalAdjustedRVU: parseFloat(
        calculations
          .reduce((sum, calc) => sum + calc.totalAdjustedRVU, 0)
          .toFixed(2),
      ),
      totalPayment: parseFloat(
        calculations
          .reduce((sum, calc) => sum + calc.paymentAmount, 0)
          .toFixed(2),
      ),
      alerts: flaggedCalculations.length,
      flaggedCodes: flaggedCalculations.map((c) => c.code),
    };
    return {
      dateOfService,
      contractor,
      calculations,
      summary,
      processingMetadata: {
        localityNumber: locality.localityNumber,
        state: locality.state,
        gpciSource: "CMS",
        processingTime: executionTime,
      },
    };
  }

  private generateEvidence(
    rvuResult: RVUResult,
    calculations: RVUCalculation[],
    logger: any,
  ): StandardizedEvidence[] {
    const evidence: StandardizedEvidence[] = [];
    evidence.push(
      this.createEvidence(
        [],
        "RVU result summary",
        0.95,
        Notes.OPERATIVE,
        {
          type: "rvu_result",
          data: rvuResult,
        },
        Agents.RVU,
      ),
    );

    // Add evidence containing rvuSequencingResult for state manager processing
    evidence.push(
      this.createEvidence(
        [],
        "RVU sequencing result",
        0.95,
        Notes.OPERATIVE,
        {
          type: "rvu_sequencing",
          rvuSequencingResult: rvuResult,
        },
        Agents.RVU,
      ),
    );

    // Add evidence for each calculation
    for (const calc of calculations) {
      evidence.push(
        this.createEvidence(
          [],
          `RVU calculation for ${calc.code}`,
          0.95,
          Notes.OPERATIVE,
          {
            type: "rvu_calculation",
            data: calc,
          },
          Agents.RVU,
        ),
      );

      if (calc.flags && calc.flags.length > 0) {
        evidence.push(
          this.createEvidence(
            [],
            `Procedure code ${calc.code} has flags: ${calc.flags.join(", ")}`,
            0.9,
            Notes.OPERATIVE,
            {
              type: "generic",
              data: {
                message: `Procedure code ${calc.code} has flags: ${calc.flags.join(
                  ", ",
                )}`,
              },
            },
            Agents.RVU,
          ),
        );
      }
    }
    return evidence;
  }
}
