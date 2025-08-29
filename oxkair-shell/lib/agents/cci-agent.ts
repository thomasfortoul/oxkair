import { CCIDataServiceImpl } from "../services/cci-data-service";
import {
  StandardizedAgent,
  StandardizedAgentContext,
  StandardizedAgentResult,
  StandardizedEvidence,
  Agents,
  Notes,
  ProcessingError,
  CCIDataService,
  CCIResult,
  PTPFlag,
  MUEFlag,
  GlobalFlag,
  RVUFlag,
  CCISummary,
  ProcessingErrorSeverity
} from "./newtypes";
import { z } from "zod";
import { isUnlistedCode } from "../constants/unlisted-codes";

export class CCIAgent implements StandardizedAgent {
  readonly name = Agents.COMPLIANCE;
  readonly description =
    "Validates procedures against CCI/PTP edits, MUE limits, and Global Surgical Package rules";
  readonly requiredServices: string[] = [
    "cciDataService",
  ];

  public async execute(context: StandardizedAgentContext): Promise<StandardizedAgentResult> {
    return this.executeInternal(context);
  }

  async executeInternal(context: StandardizedAgentContext): Promise<StandardizedAgentResult> {
    const { state, logger, services } = context;
    const startTime = Date.now();

    logger.logAgentStart(this.name.toString(), state, context);
    logger.logInfo("CCI_AGENT", "Starting CCI validation process");

    // Publish progress: Starting
    // Progress tracking removed
    try {
      // Validate prerequisites
      const validationResult = this.validatePrerequisites(state);
      if (!validationResult.isValid) {
        // Progress tracking removed
        return this.createErrorResult(validationResult.errors);
      }

      const cciDataService = services.cciDataService as CCIDataServiceImpl;

      // Initialize result structure
      const cciResult: CCIResult = {
        ptpFlags: [],
        mueFlags: [],
        globalFlags: [],
        rvuFlags: [],
        summary: {
          ptpViolations: 0,
          mueViolations: 0,
          globalViolations: 0,
          rvuViolations: 0,
          overallStatus: "PASS",
          totalFlags: 0,
        },
        processingMetadata: {
          cciDataVersion: "2025",
          mueDataVersion: "2025",
          globalDataVersion: "2025",
          processingTimestamp: new Date().toISOString(),
          rulesApplied: [],
          performanceMetrics: {
            ptpCheckDuration: 0,
            mueCheckDuration: 0,
            globalCheckDuration: 0,
            totalDuration: 0,
          },
        },
      };

      // Determine service type based on place of service
      const serviceType = this.determineServiceType(
        state.caseMeta?.placeOfService,
      );
      logger.logInfo("CCI_AGENT", `Determined service type: ${serviceType}`);

      // Step 1: PTP (Procedure-to-Procedure) Validation
      logger.logInfo("CCI_AGENT", "Starting PTP validation");
      // Progress tracking removed
      const ptpStartTime = Date.now();
      cciResult.ptpFlags = await this.validatePTPEdits(
        state.procedureCodes || [],
        state.caseMeta?.dateOfService?.toISOString() || "",
        serviceType,
        cciDataService,
        logger,
      );
      cciResult.processingMetadata.performanceMetrics.ptpCheckDuration =
        Date.now() - ptpStartTime;
      cciResult.processingMetadata.rulesApplied.push("PTP_VALIDATION");

      // Step 2: MUE (Medically Unlikely Edits) Validation
      logger.logInfo("CCI_AGENT", "Starting MUE validation");
      // Progress tracking removed
      const mueStartTime = Date.now();
      cciResult.mueFlags = this.validateMUELimits(
        state.procedureCodes || [],
        serviceType,
        logger,
      );
      cciResult.processingMetadata.performanceMetrics.mueCheckDuration =
        Date.now() - mueStartTime;
      cciResult.processingMetadata.rulesApplied.push("MUE_VALIDATION");

      // Step 3: Global Surgical Package Validation
      logger.logInfo("CCI_AGENT", "Starting Global Period validation");
      // Progress tracking removed
      const globalStartTime = Date.now();
      cciResult.globalFlags = this.validateGlobalPeriods(
        state.procedureCodes || [],
        state.caseMeta?.dateOfService?.toISOString() || "",
        state.caseMeta?.patientId || "",
        logger,
      );
      cciResult.processingMetadata.performanceMetrics.globalCheckDuration =
        Date.now() - globalStartTime;
      cciResult.processingMetadata.rulesApplied.push(
        "GLOBAL_PERIOD_VALIDATION",
      );

      // Step 4: Unlisted Code RVU Validation
      logger.logInfo("CCI_AGENT", "Starting Unlisted Code RVU validation");
      cciResult.rvuFlags = this.validateUnlistedCodes(
        state.procedureCodes || [],
        logger,
      );
      cciResult.processingMetadata.rulesApplied.push(
        "UNLISTED_CODE_VALIDATION",
      );

      // Calculate summary
      // Progress tracking removed
      cciResult.summary = this.calculateSummary(cciResult);
      cciResult.processingMetadata.performanceMetrics.totalDuration =
        Date.now() - startTime;

      logger.logInfo(
        "CCI_AGENT",
        `CCI validation completed. Status: ${cciResult.summary.overallStatus}`,
        {
          ptpViolations: cciResult.summary.ptpViolations,
          mueViolations: cciResult.summary.mueViolations,
          globalViolations: cciResult.summary.globalViolations,
          totalFlags: cciResult.summary.totalFlags,
        },
      );

      // Publish completion with final results
      // Progress tracking removed
      return {
        success: true,
        evidence: [
          {
            verbatimEvidence: [],
            rationale: "CCI edits validation completed with results",
            sourceAgent: Agents.COMPLIANCE,
            sourceNote: Notes.OPERATIVE,
            confidence: 1.0,
            content: cciResult,
          },
          ...cciResult.ptpFlags.map((flag) => ({
            verbatimEvidence: [],
            rationale: `PTP violation detected: ${flag.primaryCode} conflicts with ${flag.secondaryCode}`,
            sourceAgent: Agents.COMPLIANCE,
            sourceNote: Notes.OPERATIVE,
            confidence: 1.0,
            content: flag,
          })),
          ...cciResult.mueFlags.map((flag) => ({
            verbatimEvidence: [],
            rationale: `MUE violation detected: ${flag.code} units exceed limit`,
            sourceAgent: Agents.COMPLIANCE,
            sourceNote: Notes.OPERATIVE,
            confidence: 1.0,
            content: flag,
          })),
          ...cciResult.globalFlags.map((flag) => ({
            verbatimEvidence: [],
            rationale: `Global period violation detected for ${flag.code}`,
            sourceAgent: Agents.COMPLIANCE,
            sourceNote: Notes.OPERATIVE,
            confidence: 1.0,
            content: flag,
          })),
          ...cciResult.rvuFlags.map((flag) => ({
            verbatimEvidence: [],
            rationale: `RVU issue detected for ${flag.code}: ${flag.issue}`,
            sourceAgent: Agents.COMPLIANCE,
            sourceNote: Notes.OPERATIVE,
            confidence: 1.0,
            content: flag,
          })),
        ],
        data: cciResult,
        errors: [],
        metadata: {
          executionTime: Date.now() - startTime,
          version: "1.0.0",
          agentName: this.name,
        },
      };
    } catch (error: any) {
      logger.logError("CCI_AGENT", "CCI validation failed", {
        error: error.message,
        stack: error.stack,
      });
      // Progress tracking removed
      return this.createErrorResult([
        {
          message: `CCI validation failed: ${error.message}`,
          severity: ProcessingErrorSeverity.CRITICAL,
          timestamp: new Date(),
          source: "CCI_AGENT",
          stackTrace: error.stack,
        },
      ]);
    }
  }

  private validatePrerequisites(state: any): {
    isValid: boolean;
    errors: ProcessingError[];
  } {
    const errors: ProcessingError[] = [];

    if (!state.caseMeta) {
      errors.push({
        message: "Case metadata is required for CCI validation",
        severity: ProcessingErrorSeverity.CRITICAL,
        timestamp: new Date(),
        source: "CCI_AGENT",
        context: { requiredField: "caseMeta" },
      });
      return { isValid: false, errors };
    }

    if (!state.procedureCodes || state.procedureCodes.length === 0) {
      errors.push({
        message: "No procedure codes found for CCI validation",
        severity: ProcessingErrorSeverity.CRITICAL,
        timestamp: new Date(),
        source: "CCI_AGENT",
        context: { requiredField: "procedureCodes" },
      });
    }

    if (!state.caseMeta.dateOfService) {
      errors.push({
        message: "Date of service is required for CCI validation",
        severity: ProcessingErrorSeverity.CRITICAL,
        timestamp: new Date(),
        source: "CCI_AGENT",
        context: { requiredField: "caseMeta.dateOfService" },
      });
    }

    if (!state.caseMeta.patientId) {
      errors.push({
        message: "Patient ID is required for CCI validation",
        severity: ProcessingErrorSeverity.CRITICAL,
        timestamp: new Date(),
        source: "CCI_AGENT",
        context: { requiredField: "caseMeta.patientId" },
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private determineServiceType(
    placeOfService?: string,
  ): "hospital" | "practitioner" {
    // Place of Service codes: 21-23 are hospital settings
    const hospitalPOS = ["21", "22", "23"];
    return hospitalPOS.includes(placeOfService || "")
      ? "hospital"
      : "practitioner";
  }

  private async validatePTPEdits(
    procedureCodes: any[],
    dateOfService: string,
    serviceType: "hospital" | "practitioner",
    cciDataService: CCIDataService,
    logger: any,
  ): Promise<PTPFlag[]> {
    const flags: PTPFlag[] = [];
    const dos = new Date(dateOfService);
    const flaggedPairs = new Set<string>();
    const skippedCodes = new Set<string>();

    logger.logDebug(
      this.name,
      `Validating PTP edits for ${procedureCodes.length} procedures`,
    );

    const checkPair = async (col1Proc: any, col2Proc: any) => {
      const pairKey = `${col1Proc.code}:${col2Proc.code}`;
      const reversePairKey = `${col2Proc.code}:${col1Proc.code}`;
      if (flaggedPairs.has(pairKey) || flaggedPairs.has(reversePairKey)) {
        return;
      }

      // Skip if we already know this code has no CCI data
      if (skippedCodes.has(col1Proc.code)) {
        return;
      }

      const cciResult = await cciDataService.getCCIEditsForCode(
        col1Proc.code,
        serviceType,
      );

      if (cciResult.status === "not_found") {
        // Log informational message and skip PTP edits for this code
        logger.logInfo(
          this.name,
          `CCI data file not found for code ${col1Proc.code}. Skipping PTP edits for this code.`,
          { code: col1Proc.code, serviceType, message: cciResult.message },
        );
        skippedCodes.add(col1Proc.code);
        return;
      }

      if (cciResult.status === "error") {
        logger.logWarn(
          this.name,
          `Error retrieving CCI data for code ${col1Proc.code}. Skipping PTP edits for this code.`,
          { code: col1Proc.code, serviceType, message: cciResult.message },
        );
        skippedCodes.add(col1Proc.code);
        return;
      }

      // Process the edits if found
      for (const edit of cciResult.edits) {
        if (edit.column_2 === col2Proc.code) {
          const effectiveDate = new Date(edit.effective_date);
          const deletionDate = edit.deletion_date
            ? new Date(edit.deletion_date)
            : null;

          if (dos >= effectiveDate && (!deletionDate || dos <= deletionDate)) {
            const violation = this.checkModifierRequirements(
              col1Proc,
              col2Proc,
              edit,
              logger,
            );
            if (violation) {
              flags.push(violation);
              flaggedPairs.add(pairKey);
              return;
            }
          }
        }
      }
    };

    // Check all pairs of procedures
    for (let i = 0; i < procedureCodes.length; i++) {
      for (let j = i + 1; j < procedureCodes.length; j++) {
        const proc1 = procedureCodes[i];
        const proc2 = procedureCodes[j];

        await checkPair(proc1, proc2);
        await checkPair(proc2, proc1);
      }
    }

    if (skippedCodes.size > 0) {
      logger.logInfo(
        this.name,
        `PTP validation completed. Skipped ${skippedCodes.size} codes due to missing CCI data files: ${Array.from(skippedCodes).join(", ")}`,
        { skippedCodes: Array.from(skippedCodes), totalFlags: flags.length },
      );
    }

    logger.logDebug(this.name, `Found ${flags.length} PTP violations`);
    return flags;
  }

  private checkModifierRequirements(
    primaryProc: any,
    secondaryProc: any,
    edit: any,
    logger: any,
  ): PTPFlag | null {
    const submittedModifiers = [
      ...(primaryProc.modifiers || []),
      ...(secondaryProc.modifiers || []),
    ];

    switch (edit.modifier_indicator) {
      case "0":
        // No bypass modifier allowed
        return {
          primaryCode: primaryProc.code,
          secondaryCode: secondaryProc.code,
          modifierIndicator: "0",
          submittedModifiers,
          issue: `${secondaryProc.code} cannot be billed with ${primaryProc.code} - no modifier bypass allowed`,
          allowedModifiers: [],
          effectiveDate: edit.effective_date,
          deletionDate: edit.deletion_date,
          rationale: edit.rationale,
          severity: "ERROR",
        };

      case "1":
        // Specific modifiers allowed
        const allowedModifiers = ["59", "XE", "XP", "XS", "XU", "25", "57"];
        const hasAllowedModifier = submittedModifiers.some((mod) =>
          allowedModifiers.includes(mod),
        );

        if (!hasAllowedModifier) {
          return {
            primaryCode: primaryProc.code,
            secondaryCode: secondaryProc.code,
            modifierIndicator: "1",
            submittedModifiers,
            issue: `${secondaryProc.code} requires appropriate modifier when billed with ${primaryProc.code}`,
            allowedModifiers,
            effectiveDate: edit.effective_date,
            deletionDate: edit.deletion_date,
            rationale: edit.rationale,
            severity: "ERROR",
          };
        }
        break;

      case "2":
        // Only -59 or X{EPSU} modifiers allowed
        const mod59Allowed = ["59", "XE", "XP", "XS", "XU"];
        const hasMod59 = submittedModifiers.some((mod) =>
          mod59Allowed.includes(mod),
        );

        if (!hasMod59) {
          return {
            primaryCode: primaryProc.code,
            secondaryCode: secondaryProc.code,
            modifierIndicator: "2",
            submittedModifiers,
            issue:
              "Column 2 code requires -59 or X modifier when billed with Column 1 code",
            allowedModifiers: mod59Allowed,
            effectiveDate: edit.effective_date,
            deletionDate: edit.deletion_date,
            rationale: edit.rationale,
            severity: "ERROR",
          };
        }
        break;
    }

    return null;
  }

  private validateMUELimits(
    procedureCodes: any[],
    serviceType: "hospital" | "practitioner",
    logger: any,
  ): MUEFlag[] {
    const flags: MUEFlag[] = [];

    logger.logDebug(
      this.name,
      `Validating MUE limits for ${procedureCodes.length} procedures`,
    );

    for (const proc of procedureCodes) {
      const mueLimit = proc.mueLimit;

      if (mueLimit !== undefined && mueLimit !== null) {
        const claimedUnits = proc.units || 1;

        logger.logDebug(
          this.name,
          `MUE check for code ${proc.code}: claimed=${claimedUnits}, limit=${mueLimit}`,
          {
            code: proc.code,
            claimedUnits,
            maxUnits: mueLimit,
          },
        );

        if (claimedUnits > mueLimit) {
          flags.push({
            code: proc.code,
            claimedUnits,
            maxUnits: mueLimit,
            adjudicationIndicator: proc.mueAdjudicationIndicator || "N/A",
            issue: `Claimed units (${claimedUnits}) exceed MUE limit (${mueLimit})`,
            serviceType: serviceType,
            severity: "ERROR",
          });
        }
      } else {
        logger.logDebug(this.name, `No MUE data found for code ${proc.code}`, {
          code: proc.code,
          serviceType,
        });
      }
    }

    logger.logDebug(this.name, `Found ${flags.length} MUE violations`);
    return flags;
  }

  private validateGlobalPeriods(
    procedureCodes: any[],
    dateOfService: string,
    patientId: string,
    logger: any,
  ): GlobalFlag[] {
    const flags: GlobalFlag[] = [];
    const GLOBAL_HINTS = ["-24", "-25", "-57", "-58", "-78", "-79"] as const;

    logger.logInfo(
      "CCI_AGENT",
      `Validating global periods for ${procedureCodes.length} procedures`,
    );

    for (const proc of procedureCodes) {
      const globalDays = proc.globalDays;

      if (globalDays !== undefined && globalDays !== null) {
        // Handle both string and number formats for global days
        const globalDaysStr = String(globalDays);
        const globalDaysNum = typeof globalDays === 'number' ? globalDays : parseInt(globalDaysStr, 10);

        if (globalDaysStr === "010" || globalDaysNum === 10) {
          flags.push({
            kind: "GLOBAL_PERIOD",
            severity: "WARNING",
            message:
              "Code has a 10-day global; history unavailable—services in window may bundle.",
            suggestedModifiers: [...GLOBAL_HINTS],
            code: proc.code,
            globalPeriod: "010",
            priorSurgeryDate: "N/A",
            currentServiceDate: dateOfService,
            issue:
              "Code has a 10-day global; history unavailable—services in window may bundle.",
            recommendedModifier: "N/A",
          });
        } else if (globalDaysStr === "090" || globalDaysNum === 90) {
          flags.push({
            kind: "GLOBAL_PERIOD",
            severity: "WARNING",
            message:
              "Code has a 90-day global; history unavailable—services in window may bundle.",
            suggestedModifiers: [...GLOBAL_HINTS],
            code: proc.code,
            globalPeriod: "090",
            priorSurgeryDate: "N/A",
            currentServiceDate: dateOfService,
            issue:
              "Code has a 90-day global; history unavailable—services in window may bundle.",
            recommendedModifier: "N/A",
          });
        }
        // Note: No flags are pushed for globalDays === 0 or special indicators
        // ["ZZZ", "XXX", "MMM", "YYY"] as these represent no global period or
        // variable global periods that don't require flagging
      }
    }

    logger.logDebug("CCI_AGENT", `Created ${flags.length} global period flags`);
    return flags;
  }

  private validateUnlistedCodes(
    procedureCodes: any[],
    logger: any,
  ): RVUFlag[] {
    const flags: RVUFlag[] = [];

    logger.logDebug(
      "CCI_AGENT",
      `Validating unlisted codes for ${procedureCodes.length} procedures`,
    );

    for (const proc of procedureCodes) {
      if (isUnlistedCode(proc.code)) {
        // Check if RVU is zero or undefined
        const rvu = proc.rvu || proc.totalRVU || proc.workRVU;
        const isZeroRVU = rvu === 0 || rvu === "0" || rvu === undefined || rvu === null;

        if (isZeroRVU) {
          flags.push({
            code: proc.code,
            issue: "RVU is zero. Refer to similar procedures to assign estimated RVU.",
            severity: "WARNING",
          });

          logger.logDebug(
            "CCI_AGENT",
            `Unlisted code with zero RVU detected: ${proc.code}`,
            { code: proc.code, rvu }
          );
        }
      }
    }

    logger.logDebug("CCI_AGENT", `Created ${flags.length} unlisted code flags`);
    return flags;
  }

  private calculateSummary(cciResult: CCIResult): CCISummary {
    const ptpViolations = cciResult.ptpFlags.length;
    const mueViolations = cciResult.mueFlags.length;
    const globalViolations = cciResult.globalFlags.length;
    const rvuViolations = cciResult.rvuFlags.length;
    const totalFlags = ptpViolations + mueViolations + globalViolations + rvuViolations;

    const overallStatus = totalFlags === 0 ? "PASS" : "FAIL";

    return {
      ptpViolations,
      mueViolations,
      globalViolations,
      rvuViolations,
      totalFlags,
      overallStatus,
    };
  }

  private createErrorResult(errors: ProcessingError[]): StandardizedAgentResult {
    return {
      success: false,
      evidence: [],
      data: null,
      errors,
      metadata: {
        executionTime: 0,
        version: "1.0.0",
        agentName: this.name,
      },
    };
  }


}