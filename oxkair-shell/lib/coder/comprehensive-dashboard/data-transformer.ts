import type {
  ComprehensiveDashboardState,
  DemographicsPanel,
  DiagnosisPanel,
  ProcedurePanel,
  AssistantPanel,
  ModifierPanel,
  CompliancePanel,
  RVUPanel,
  SummaryPanel,
  CPTGroup,
} from "./types";
import { 
  Agents, 
  Notes,
  EnhancedProcedureCode,
  EnhancedDiagnosisCode,
  StandardizedModifier,
  ModifierClassifications,
  ComplianceIssueTypes,
  StandardizedWorkflowState,
} from "../../agents/newtypes";

import type {
  AiRawOutput,
  AiDemographicsOutput,
  AiEncounterOutput,
  AiDiagnosisCodeOutput,
  AiProcedureCodeOutput,
  AiHCPCSCodeOutput,
  AiComplianceIssueOutput,
  AiRvuSequencingOutput,
  AiModifierSuggestionOutput,
  AiAssistantAnalysisOutput,
  AiCodeModifierAssignmentOutput,
} from "./ai-output-types";

// Removed unused import that was causing module resolution error

import type {
  CCIResult,
  PTPFlag,
  MUEFlag,
  GlobalFlag,
} from "../../agents/newtypes";

/**
 * Convert final modifiers from workflow state to AI modifier suggestion format
 */
function convertFinalModifiersToAiModifierSuggestions(
  finalModifiers: StandardizedModifier[]
): AiModifierSuggestionOutput[] {
  return finalModifiers.map((modifier) => ({
    procedureCode: modifier.linkedCptCode || "",
    modifier: modifier.modifier,
    description: modifier.description,
    rationale: modifier.rationale,
    classification: "Required" as const,
    confidence: 0.95,
    evidence: modifier.evidence || [],
  }));
}

/**
 * Main function to transform AI raw output to panel data structure
 */
export function transformAiOutputToPanelData(
  aiOutput: AiRawOutput,
  workflowState?: StandardizedWorkflowState,
): ComprehensiveDashboardState["panelData"] {
  // Log the entire AI output to inspect its structure
  console.log(
    "DEBUG: Full aiOutput received in transformer:",
    JSON.stringify(aiOutput, null, 2),
  );

  // Use finalModifiers from workflow state first, then aiOutput, then fallback to modifierSuggestions
  // Only show modifiers that were actually assigned by the AI, not all applicable ones
  let modifiersToProcess = workflowState?.finalModifiers
    ? convertFinalModifiersToAiModifierSuggestions(workflowState.finalModifiers)
    : aiOutput.finalModifiers || aiOutput.modifierSuggestions || [];

  // IMPORTANT: Do NOT fallback to modifiersApplicable from procedureCodes
  // The previous fallback logic was incorrectly showing all applicable modifiers 
  // instead of respecting the AI's decision to not assign certain modifiers.
  // For example, when phase2ModifiersAdded: 0, it means the AI found no justification
  // to apply any modifiers, but the fallback was still showing all applicable ones.
  // This fix ensures only modifiers that were actually assigned are displayed.
  const modifierPanelData = transformModifiers(modifiersToProcess);

  // Combine procedure codes and HCPCS codes
  const allProcedureAndHcpcsCodes = (aiOutput.procedureCodes || []).concat(
    aiOutput.hcpcsCodes || [],
  );

  const rvuPanelData = transformRvu(
    aiOutput.rvuSequencing,
    allProcedureAndHcpcsCodes,
    modifierPanelData,
    workflowState?.rvuResult,
    workflowState?.rvuCalculations,
  );
  const groupedProcedures = transformToGroupedProcedures(
    aiOutput,
    modifierPanelData,
    rvuPanelData,
    workflowState,
  );

  const baseData = {
    demographics: transformDemographics(
      aiOutput.demographics,
      aiOutput.encounter,
    ),
    diagnosis: transformDiagnosis(aiOutput.diagnosisCodes || []),
    procedure: transformProcedure(allProcedureAndHcpcsCodes),
    assistant: transformAssistant(aiOutput.assistantCoSurgeonAnalysis),
    modifier: modifierPanelData,
    compliance: transformCompliance(
      aiOutput.complianceIssues || [],
      workflowState?.cciResult,
    ),
    rvu: rvuPanelData,
    groupedProcedures: groupedProcedures,
  };

  return {
    ...baseData,
    summary: transformSummary(baseData),
  };
}

/**
 * Transform demographics and encounter data
 */
export function transformDemographics(
  demographics: AiDemographicsOutput | undefined,
  encounter: AiEncounterOutput | undefined,
): DemographicsPanel {
  return {
    patientInfo: {
      name: demographics?.patientName || "Not specified",
      mrn: demographics?.patientMRN || demographics?.mrn || "Not specified",
      dateOfBirth:
        demographics?.patientDOB ||
        demographics?.dateOfBirth ||
        "Not specified",
      gender: demographics?.gender || "Not specified",
    },
    providerInfo: {
      name:
        demographics?.attendingPhysician ||
        demographics?.provider ||
        "Not specified",
      specialty: demographics?.providerSpecialty || "Not specified",
      npi: demographics?.npi || "Not specified",
    },
    encounterInfo: {
      facility:
        demographics?.facilityName || demographics?.facility || "Not specified",
      serviceDate:
        demographics?.encounterDate ||
        encounter?.serviceDate ||
        encounter?.encounterDate ||
        "Not specified",
      admissionDate: encounter?.admissionDate || undefined,
      dischargeDate: encounter?.dischargeDate || undefined,
      visitType: encounter?.visitType || "Not specified",
    },
    flags: [],
  };
}

/**
 * Transform diagnosis codes
 */
export function transformDiagnosis(
  diagnosisCodes: AiDiagnosisCodeOutput[],
): DiagnosisPanel {
  return {
    codes: diagnosisCodes.map(
      (code) =>
        ({
          code: code.code,
          description: code.description,
          evidence: Array.isArray(code.evidence)
            ? code.evidence
            : code.evidence
              ? [code.evidence]
              : [],
          // Create a placeholder cptLinked - this will need to be properly linked in the workflow
          cptLinked: {
            code: "99999", // Placeholder CPT code
            description: "Placeholder procedure",
            units: 1,
            isPrimary: true,
            evidence: [],
            mueLimit: 1,
            modifiersLinked: [],
            icd10Linked: [],
            addOnLinked: [],
            claimType: undefined,
            mai: 1,
          } as EnhancedProcedureCode,
        }) as EnhancedDiagnosisCode,
    ),
    flags: [],
  };
}

/**
 * Transform procedure codes
 */
export function transformProcedure(
  procedureCodes: AiProcedureCodeOutput[],
): ProcedurePanel {
  return {
    codes: procedureCodes.map(
      (code) =>
        ({
          code: code.code,
          description: code.description,
          units: 1, // Default units
          isPrimary: code.isPrimary || false,
          evidence: Array.isArray(code.evidence)
            ? code.evidence
            : code.evidence
              ? [code.evidence]
              : [],
          mueLimit: 1, // Default MUE limit
          modifiersLinked: [], // Will be populated later
          icd10Linked: [], // Will be populated later
          addOnLinked: [], // Will be populated later
          rvu: {
            work: typeof code.rvu === 'number' ? code.rvu : 0,
            pe: 0,
            mp: 0,
          },
          claimType: undefined,
          mai: 1,
        }) as EnhancedProcedureCode,
    ),
    flags: [],
  };
}

/**
 * Transform compliance issues including CCI results
 */
export function transformCompliance(
  complianceIssues: AiComplianceIssueOutput[],
  cciResult?: CCIResult,
): CompliancePanel {
  const cciEdits: any[] = [];
  const mueInfo: any[] = [];
  const globalPeriodIssues: any[] = [];
  const flags: any[] = [];

  // Process compliance issues from AI output (now includes CCI results)
  complianceIssues.forEach((issue) => {
    if (issue.type === "PTP") {
      // Extract codes from affectedCodes array
      const [code1, code2] = issue.affectedCodes || [];
      if (code1 && code2) {
        cciEdits.push({
          code1,
          code2,
          editType: "PTP Edit",
          modifier: "None", // Could be enhanced to extract from recommendation
          description: issue.description,
        });
      }

      flags.push({
        id: `ptp-${issue.affectedCodes?.join("-") || "unknown"}`,
        type: "error",
        message: issue.description,
        complianceType: "CCI",
        issue: "violation",
        affectedCodes: issue.affectedCodes || [],
      });
    } else if (issue.type === "MUE") {
      const code = issue.affectedCodes?.[0];
      if (code) {
        // Extract MUE details from description or recommendation
        const limitMatch = issue.recommendation?.match(
          /exceed MUE limit \((\d+)\)/,
        );
        const claimedMatch = issue.recommendation?.match(
          /Units claimed \((\d+)\)/,
        );

        mueInfo.push({
          code,
          limit: limitMatch ? parseInt(limitMatch[1]) : 0,
          currentCount: claimedMatch ? parseInt(claimedMatch[1]) : 0,
          adjudication: "Unknown", // Could be enhanced
        });
      }

      flags.push({
        id: `mue-${issue.affectedCodes?.[0] || "unknown"}`,
        type: "error",
        message: issue.description,
        complianceType: "MUE",
        issue: "violation",
        affectedCodes: issue.affectedCodes || [],
      });
    } else if (issue.type === "globalPeriod") {
      const code = issue.affectedCodes?.[0];
      if (code) {
        globalPeriodIssues.push({
          code,
          globalPeriod: 0, // Could be enhanced to extract from description
          conflictingDate: "", // Could be enhanced
          description: issue.description || issue.message,
        });
      }

      const flagType =
        issue.severity === "WARNING"
          ? "warning"
          : issue.severity === "INFO"
            ? "info"
            : "error";

      flags.push({
        id: `global-${issue.affectedCodes?.[0] || "unknown"}`,
        type: flagType,
        message: issue.description || issue.message,
        complianceType: "GlobalPeriod",
        issue: issue.severity === "WARNING" ? "warning" : "violation",
        affectedCodes: issue.affectedCodes || [],
      });
    }
  });

  // Process CCI results if available (legacy support)
  if (cciResult) {
    // Transform PTP flags to CCI edits
    cciResult.ptpFlags.forEach((flag: PTPFlag) => {
      cciEdits.push({
        code1: flag.primaryCode,
        code2: flag.secondaryCode,
        editType: `PTP Edit (Modifier ${flag.modifierIndicator})`,
        modifier: flag.submittedModifiers.join(", ") || "None",
        description: flag.issue,
      });

      flags.push({
        id: `ptp-${flag.primaryCode}-${flag.secondaryCode}`,
        type: "error",
        message: flag.issue,
        complianceType: "CCI",
        issue: "violation",
        affectedCodes: [flag.primaryCode, flag.secondaryCode],
      });
    });

    // Transform MUE flags to MUE info
    cciResult.mueFlags.forEach((flag: MUEFlag) => {
      mueInfo.push({
        code: flag.code,
        limit: flag.maxUnits,
        currentCount: flag.claimedUnits,
        adjudication: flag.adjudicationIndicator,
      });

      flags.push({
        id: `mue-${flag.code}`,
        type: "error",
        message: flag.issue,
        complianceType: "MUE",
        issue: "violation",
        affectedCodes: [flag.code],
      });
    });

    // Transform Global flags to global period issues
    cciResult.globalFlags.forEach((flag: GlobalFlag) => {
      globalPeriodIssues.push({
        code: flag.code,
        globalPeriod: parseInt(flag.globalPeriod) || 0,
        conflictingDate: flag.priorSurgeryDate,
        description: flag.issue || flag.message,
      });

      const flagType =
        flag.severity === "WARNING"
          ? "warning"
          : flag.severity === "INFO"
            ? "info"
            : "error";

      flags.push({
        id: `global-${flag.code}`,
        type: flagType,
        message: flag.issue || flag.message,
        complianceType: "GlobalPeriod",
        issue:
          flag.severity === "WARNING"
            ? "warning"
            : flag.severity === "INFO"
              ? "info"
              : "violation",
        affectedCodes: [flag.code],
      });
    });
  }

  // Transform RVU flags to compliance issues
  if (cciResult?.rvuFlags) {
    cciResult.rvuFlags.forEach((flag: any) => {
      flags.push({
        id: `rvu-${flag.code}`,
        type: "warning", // RVU flags are always warnings
        message: flag.issue,
        complianceType: "RVU",
        issue: "warning",
        affectedCodes: [flag.code],
      });
    });
  }

  return {
    cciEdits,
    mueInfo,
    lcdEdits: [], // Will be populated by LCD agent results
    globalPeriodIssues,
    complianceIssues: complianceIssues.map((issue) => ({
      type: mapComplianceType(issue.type),
      description: issue.description,
      severity: mapSeverity(issue.severity),
      affectedCodes: issue.affectedCodes || [],
      recommendation: issue.recommendation || "",
      resolved: false,
      references: [],
    })),
    flags,
  };
}

/**
 * Transform RVU sequencing data
 */
export function transformRvu(
  rvuSequencing: AiRvuSequencingOutput | undefined,
  procedureCodes?: AiProcedureCodeOutput[],
  modifierPanelData?: ModifierPanel,
  rvuResult?: any, // RVUResult from comprehensive RVU agent
  rvuCalculations?: any[], // RVUCalculation[] from comprehensive RVU agent
): RVUPanel {
  // First check if we have comprehensive RVU data
  if (rvuResult && rvuCalculations) {
    return transformComprehensiveRvu(
      rvuResult,
      rvuCalculations,
      modifierPanelData,
    );
  }

  // Fallback to legacy RVU sequencing data
  if (!rvuSequencing) {
    return {
      sequencing: {
        optimizedOrder: [],
        totalRVU: 0,
        explanation: "No RVU sequencing data available",
        modifier51Applied: false,
      },
      flags: [],
    };
  }

  // Handle both sequencedCodes and optimalSequence field names
  const sequencedCodes =
    rvuSequencing.sequencedCodes || rvuSequencing.optimalSequence || [];

  // Create a map of procedure codes for quick lookup
  const procedureMap = new Map<string, AiProcedureCodeOutput>();
  if (procedureCodes) {
    procedureCodes.forEach((proc: AiProcedureCodeOutput) => {
      procedureMap.set(proc.code, proc);
    });
  }

  const optimizedOrder = sequencedCodes.map(
    (codeStr: string, index: number) => {
      const procedureInfo =
        procedureMap.get(codeStr) || ({} as AiProcedureCodeOutput);
      const appliedModifiers = 
        modifierPanelData?.suggestions
          ?.find((s) => s.procedureCode === codeStr)
          ?.suggestedModifiers.map((m) => m.modifier)
          .filter((mod): mod is string => mod !== null) || [];

      const rvuValue = procedureInfo.rvu;
      const baseRVU = typeof rvuValue === 'object' && rvuValue !== null 
        ? rvuValue 
        : { work: rvuValue || 0, pe: 0, mp: 0 };
      
      return {
        code: codeStr,
        description: procedureInfo.description || "",
        baseRVU: baseRVU,
        adjustedRVU: baseRVU, // This might need further logic if modifiers affect RVU directly here
        appliedModifiers: appliedModifiers,
        sequencePosition: index + 1,
        sequenceExplanation:
          rvuSequencing.sequencingRationale?.[index] ||
          rvuSequencing.recommendation ||
          "",
      };
    },
  );

  // Calculate total RVU
  const totalRVU = optimizedOrder.reduce(
    (sum, code) => {
      const baseRVU = code.baseRVU;
      if (typeof baseRVU === 'object' && baseRVU !== null) {
        return sum + (baseRVU.work || 0) + (baseRVU.pe || 0) + (baseRVU.mp || 0);
      }
      return sum + (baseRVU || 0);
    },
    0,
  );

  return {
    sequencing: {
      optimizedOrder,
      totalRVU: rvuSequencing.totalRVU || totalRVU,
      explanation:
        rvuSequencing.sequencingRationale?.join(". ") ||
        rvuSequencing.recommendation ||
        "",
      modifier51Applied: false,
    },
    flags: [],
  };
}

/**
 * Transform comprehensive RVU data from the new ComprehensiveRVUAgent
 */
function transformComprehensiveRvu(
  rvuResult: any,
  rvuCalculations: any[],
  modifierPanelData?: ModifierPanel,
): RVUPanel {
  const flags: any[] = [];

  // Transform calculations to optimized order
  const optimizedOrder = rvuCalculations.map((calc, index) => {
    const appliedModifiers =
      calc.modifierAdjustments?.map((adj: any) => adj.modifier) || [];

    // Add modifier suggestions from modifier panel if available
    const additionalModifiers =
      modifierPanelData?.suggestions
        ?.find((s) => s.procedureCode === calc.code)
        ?.suggestedModifiers.map((m) => m.modifier) || [];

    const allModifiers = [
      ...new Set([...appliedModifiers, ...additionalModifiers]),
    ].filter((mod): mod is string => mod !== null);

    // Check for flags based on calculation
    if (calc.flags && calc.flags.length > 0) {
      calc.flags.forEach((flag: string) => {
        flags.push({
          id: `${calc.code}-${flag}`,
          codeIndex: index,
          issue: flag.includes("sequence")
            ? "incorrect_sequence"
            : flag.includes("modifier")
              ? "modifier_51_error"
              : "addon_code_position",
          severity: flag.includes("critical")
            ? "high"
            : flag.includes("warning")
              ? "medium"
              : "low",
          message: `${calc.code}: ${flag}`,
        });
      });
    }

    return {
      code: calc.code,
      description: `${calc.code} - Procedure`, // Could be enhanced with actual descriptions
      baseRVU: calc.baseRVUs || { work: 0, pe: 0, mp: 0 },
      adjustedRVU: calc.adjustedRVUs || calc.baseRVUs || { work: 0, pe: 0, mp: 0 },
      appliedModifiers: allModifiers,
      sequencePosition: index + 1,
      sequenceExplanation: calc.flags?.join("; ") || "",
    };
  });

  // Check if modifier 51 should be applied
  const modifier51Applied = rvuCalculations.some((calc) =>
    calc.modifierAdjustments?.some((adj: any) => adj.modifier === "51"),
  );

  // Add summary-level flags
  if (
    rvuResult.summary.flaggedCodes &&
    rvuResult.summary.flaggedCodes.length > 0
  ) {
    rvuResult.summary.flaggedCodes.forEach((code: string) => {
      flags.push({
        id: `summary-${code}`,
        issue: "incorrect_sequence",
        severity: "WARNING" as const,
        message: `Code ${code} flagged for review`,
      });
    });
  }

  return {
    sequencing: {
      optimizedOrder,
      totalRVU: rvuResult.summary.totalAdjustedRVU || 0,
      explanation: rvuResult.processingMetadata
        ? `RVU calculations completed for ${rvuResult.contractor} in locality ${rvuResult.processingMetadata.localityNumber} (${rvuResult.processingMetadata.state}). ` +
          `Total payment estimate: ${rvuResult.summary.totalPayment?.toFixed(2) || "0.00"}. ` +
          (rvuResult.summary.alerts
            ? `${rvuResult.summary.alerts} alerts generated.`
            : "")
        : "Comprehensive RVU processing completed",
      modifier51Applied,
    },
    flags,
    // Add additional metadata for enhanced display
    geographicInfo: rvuResult.processingMetadata
      ? {
          locality: rvuResult.processingMetadata.localityNumber,
          state: rvuResult.processingMetadata.state,
          contractor: rvuResult.contractor,
        }
      : undefined,
    paymentSummary: {
      totalPayment: rvuResult.summary.totalPayment || 0,
      totalRVU: rvuResult.summary.totalAdjustedRVU || 0,
      alertCount: rvuResult.summary.alerts || 0,
    },
  };
}

/**
 * Transform modifier suggestions
 */
export function transformModifiers(
  modifierSuggestions: AiModifierSuggestionOutput[],
): ModifierPanel {
  // Add logging to validate assumptions about AI output structure
  console.log(
    "DEBUG: transformModifiers input:",
    JSON.stringify(modifierSuggestions, null, 2),
  );

  // Group modifiers by procedure code
  const groupedSuggestions = modifierSuggestions.reduce(
    (
      acc: ModifierPanel["suggestions"],
      suggestion: AiModifierSuggestionOutput,
    ) => {
      // Log each suggestion to understand the structure
      console.log(
        "DEBUG: Processing modifier suggestion:",
        JSON.stringify(suggestion, null, 2),
      );

      const procedureCode = (suggestion as any).linkedCptCode || suggestion.procedureCode;
      const existing = acc.find(
        (s) => s.procedureCode === procedureCode,
      );

      // Extract explanation/justification from multiple possible fields
      const explanation =
        suggestion.description ||
        suggestion.rationale ||
        suggestion.explanation ||
        suggestion.justification ||
        suggestion.reason ||
        "";

      // Extract full justification text
      const fullJustification =
        suggestion.rationale ||
        suggestion.fullJustification ||
        suggestion.detailedJustification ||
        suggestion.completeJustification ||
        suggestion.justificationText ||
        suggestion.fullReason ||
        explanation ||
        "";

      // Determine modifier type based on modifier code
      const getModifierType = (
        modifierCode: string | null,
      ): "Pricing" | "Informational" | "Statistical" | "HCPCS Level II" => {
        if (modifierCode === null) {
          return "Informational";
        }
        const pricingModifiers = [
          "22",
          "26",
          "50",
          "51",
          "52",
          "53",
          "54",
          "55",
          "56",
          "58",
          "59",
          "62",
          "66",
          "78",
          "79",
          "80",
          "81",
          "82",
          "AS",
          "TC",
        ];
        const informationalModifiers = [
          "LT",
          "RT",
          "E1",
          "E2",
          "E3",
          "E4",
          "FA",
          "F1",
          "F2",
          "F3",
          "F4",
          "F5",
          "F6",
          "F7",
          "F8",
          "F9",
          "TA",
          "T1",
          "T2",
          "T3",
          "T4",
          "T5",
          "T6",
          "T7",
          "T8",
          "T9",
        ];
        const statisticalModifiers = [
          "CA",
          "EP",
          "ET",
          "GA",
          "GC",
          "GE",
          "GF",
          "GG",
          "GH",
          "GJ",
          "GK",
          "GL",
          "GM",
          "GN",
          "GO",
          "GP",
          "GQ",
          "GR",
          "GS",
          "GT",
          "GU",
          "GV",
          "GW",
          "GX",
          "GY",
          "GZ",
        ];

        if (pricingModifiers.includes(modifierCode)) return "Pricing";
        if (informationalModifiers.includes(modifierCode))
          return "Informational";
        if (statisticalModifiers.includes(modifierCode)) return "Statistical";
        if (modifierCode.length > 2) return "HCPCS Level II";
        return "Pricing"; // Default
      };

      // Extract priority and confidence with better defaults
      const priority =
        suggestion.priority ||
        (suggestion.classification === "Required" ? 1 : 2) ||
        1;

      const confidence =
        suggestion.confidence ||
        (suggestion.classification === "Required" ? 0.95 : 0.8) ||
        0.9;

      const modifierInfo: StandardizedModifier = {
        linkedCptCode: (suggestion as any).linkedCptCode || suggestion.procedureCode || "99999",
        modifier: suggestion.modifier,
        description: explanation,
        evidence: suggestion.evidence || [],
        classification: suggestion.classification === "Required" ? ModifierClassifications.PRICING : ModifierClassifications.INFORMATIONAL,
        requiredDocumentation: false, // Default since requiredDocumentation doesn't exist on AiModifierSuggestionOutput
        feeAdjustment: "No adjustment",
        editType: ComplianceIssueTypes.NONE.toString(),
        rationale: fullJustification, // Use the extracted justification instead of empty string
      };

      console.log(
        "DEBUG: Created modifier info:",
        JSON.stringify(modifierInfo, null, 2),
      );

      if (existing) {
        // Check if the modifier already exists for this procedure code
        const isDuplicate = existing.suggestedModifiers.some(
          (m) => m.modifier === modifierInfo.modifier,
        );
        if (!isDuplicate) {
          existing.suggestedModifiers.push(modifierInfo as any);
        } else {
          console.log(
            `DEBUG: Skipping duplicate modifier ${modifierInfo.modifier} for procedure ${procedureCode}`,
          );
        }
      } else {
        acc.push({
          procedureCode: procedureCode,
          suggestedModifiers: [modifierInfo as any],
          lockedModifiers: [],
          finalSequence: [],
        });
      }

      return acc;
    },
    [],
  );

  console.log(
    "DEBUG: Final grouped suggestions:",
    JSON.stringify(groupedSuggestions, null, 2),
  );

  return {
    suggestions: groupedSuggestions,
    flags: [],
  };
}

/**
 * Transform AI output to grouped procedures structure (Phase 1 - Step 1.3)
 */
export function transformToGroupedProcedures(
  aiOutput: AiRawOutput,
  modifierPanelData: ModifierPanel,
  rvuPanelData: RVUPanel,
  workflowState?: StandardizedWorkflowState,
): CPTGroup[] {
  const allProcedureAndHcpcsCodes = (aiOutput.procedureCodes || []).concat(
    aiOutput.hcpcsCodes || [],
  );
  const diagnosisCodes = aiOutput.diagnosisCodes || [];
  const complianceIssues = aiOutput.complianceIssues || [];

  // Extract CCI results for compliance checking
  const cciResult = workflowState?.cciResult;

  const rvuMap = new Map<string, { 
    workRvu: { mp: number; pe: number; work: number }; 
    adjustedRvu: { mp: number; pe: number; work: number }; 
  }>();
  if (rvuPanelData?.sequencing?.optimizedOrder) {
    rvuPanelData.sequencing.optimizedOrder.forEach((item) => {
      rvuMap.set(item.code, {
        workRvu: item.baseRVU || { work: 0, pe: 0, mp: 0 },
        adjustedRvu: item.adjustedRVU || { work: 0, pe: 0, mp: 0 },
      });
    });
  }

  const groupedProcedures = allProcedureAndHcpcsCodes.map(
    (procedureCode, index) => {
      // Determine tag based on primary status and sequence
      let tag: "Primary" | "Secondary" | "Tertiary" = "Secondary";
      if (procedureCode.isPrimary) {
        tag = "Primary";
      } else if (
        index === 0 &&
        !allProcedureAndHcpcsCodes.some((p) => p.isPrimary)
      ) {
        tag = "Primary"; // First code is primary if none explicitly marked
      } else if (index < 2) {
        tag = "Secondary";
      } else {
        tag = "Tertiary";
      }

      // Find related ICD codes (for now, include all - could be refined with better logic)
      const relatedIcdCodes: EnhancedDiagnosisCode[] = diagnosisCodes.map(
        (icd: AiDiagnosisCodeOutput): EnhancedDiagnosisCode => {
          return {
            code: icd.code,
            description: icd.description,
            evidence: Array.isArray(icd.evidence)
              ? icd.evidence
              : icd.evidence
                ? [icd.evidence]
                : [],
            cptLinked: {
              code: procedureCode.code,
              description: procedureCode.description,
              units: 1,
              isPrimary: true,
              evidence: [],
              mueLimit: 1,
              modifiersLinked: [],
              icd10Linked: [],
              addOnLinked: [],
              claimType: undefined,
              mai: 1,
            } as EnhancedProcedureCode,
          } as EnhancedDiagnosisCode;
        },
      );

      // Find related modifiers from the already transformed modifierPanelData
      const relatedModifierGroup = modifierPanelData.suggestions.find(
        (group) => group.procedureCode === procedureCode.code,
      );
      const relatedModifiers: StandardizedModifier[] = relatedModifierGroup
        ? relatedModifierGroup.suggestedModifiers
        : [];

      // Check for compliance violations from multiple sources
      const generalComplianceViolations = complianceIssues.filter((issue) =>
        issue.affectedCodes?.includes(procedureCode.code),
      );

      // Check for PTP violations from both CCI result and AI output
      const ptpViolationsFromCCI =
        cciResult?.ptpFlags?.filter(
          (flag) =>
            flag.primaryCode === procedureCode.code ||
            flag.secondaryCode === procedureCode.code,
        ) || [];

      const ptpViolationsFromAI = complianceIssues.filter(
        (issue) =>
          issue.type === "PTP" &&
          issue.affectedCodes?.includes(procedureCode.code),
      );

      // Transform AI compliance issues to CPTGroup format
      const ptpViolations = [
        ...ptpViolationsFromCCI.map((flag) => {
          // Check if PTP violation should be reclassified based on applied modifiers
          const reclassifiedSeverity = reclassifyPTPViolationSeverity(
            flag.primaryCode,
            flag.secondaryCode,
            modifierPanelData,
            flag.severity,
          );

          return {
            primaryCode: flag.primaryCode,
            secondaryCode: flag.secondaryCode,
            modifierIndicator: flag.modifierIndicator,
            submittedModifiers: flag.submittedModifiers,
            issue:
              reclassifiedSeverity.severity === "INFO"
                ? reclassifiedSeverity.message
                : flag.issue,
            allowedModifiers: flag.allowedModifiers,
            effectiveDate: flag.effectiveDate,
            deletionDate: flag.deletionDate,
            rationale: flag.rationale,
            severity: reclassifiedSeverity.severity,
          };
        }),
        ...ptpViolationsFromAI.map((issue) => {
          const [code1, code2] = issue.affectedCodes || [];
          const primaryCode = code1 || procedureCode.code;
          const secondaryCode = code2 || "";

          // Check if PTP violation should be reclassified based on applied modifiers
          const originalSeverity =
            issue.severity === "ERROR"
              ? ("ERROR" as const)
              : ("WARNING" as const);
          const reclassifiedSeverity = reclassifyPTPViolationSeverity(
            primaryCode,
            secondaryCode,
            modifierPanelData,
            originalSeverity,
          );

          return {
            primaryCode: primaryCode,
            secondaryCode: secondaryCode,
            modifierIndicator: "0" as const,
            submittedModifiers: [],
            issue:
              reclassifiedSeverity.severity === "INFO"
                ? reclassifiedSeverity.message
                : issue.description,
            allowedModifiers: [],
            effectiveDate: new Date().toISOString(),
            deletionDate: undefined,
            rationale: issue.recommendation || "",
            severity: reclassifiedSeverity.severity,
          };
        }),
      ];

      // Check for MUE violations from both CCI result and AI output
      const mueViolationsFromCCI =
        cciResult?.mueFlags?.filter(
          (flag) => flag.code === procedureCode.code,
        ) || [];

      const mueViolationsFromAI = complianceIssues.filter(
        (issue) =>
          issue.type === "MUE" &&
          issue.affectedCodes?.includes(procedureCode.code),
      );

      const mueViolations = [
        ...mueViolationsFromCCI.map((flag) => ({
          code: flag.code,
          claimedUnits: flag.claimedUnits,
          maxUnits: flag.maxUnits,
          adjudicationIndicator: flag.adjudicationIndicator,
          issue: flag.issue,
          serviceType: flag.serviceType,
          severity: flag.severity,
        })),
        ...mueViolationsFromAI.map((issue) => {
          const limitMatch = issue.recommendation?.match(
            /exceed MUE limit \((\d+)\)/,
          );
          const claimedMatch = issue.recommendation?.match(
            /Units claimed \((\d+)\)/,
          );
          return {
            code: procedureCode.code,
            claimedUnits: claimedMatch ? parseInt(claimedMatch[1]) : 0,
            maxUnits: limitMatch ? parseInt(limitMatch[1]) : 0,
            adjudicationIndicator: "Unknown",
            issue: issue.description,
            serviceType: "Unknown",
            severity:
              issue.severity === "ERROR"
                ? ("ERROR" as const)
                : ("WARNING" as const),
          };
        }),
      ];

      // Check for Global Period violations from both CCI result and AI output
      const globalViolationsFromCCI =
        cciResult?.globalFlags?.filter(
          (flag) => flag.code === procedureCode.code,
        ) || [];

      const globalViolationsFromAI = complianceIssues.filter(
        (issue) =>
          (issue.type === "globalPeriod" || issue.type === "GlobalPeriod") &&
          issue.affectedCodes?.includes(procedureCode.code),
      );

      const globalViolations = [
        ...globalViolationsFromCCI.map((flag) => ({
          code: flag.code,
          globalPeriod: flag.globalPeriod,
          priorSurgeryDate: flag.priorSurgeryDate,
          currentServiceDate: flag.currentServiceDate,
          issue: flag.issue || flag.message,
          recommendedModifier: flag.recommendedModifier,
          severity: flag.severity,
          suggestedModifiers: flag.suggestedModifiers,
        })),
        ...globalViolationsFromAI.map((issue) => ({
          code: procedureCode.code,
          globalPeriod: "Unknown",
          priorSurgeryDate: "",
          currentServiceDate: "",
          issue: issue.description || issue.message,
          recommendedModifier:
            issue.recommendation?.match(/modifier (\w+)/)?.[1] || "",
          severity:
            issue.severity === "ERROR"
              ? ("ERROR" as const)
              : issue.severity === "WARNING"
                ? ("WARNING" as const)
                : ("INFO" as const),
          suggestedModifiers: issue.suggestedModifiers,
        })),
      ];

      // Check for RVU violations from CCI result
      const rvuViolationsFromCCI =
        cciResult?.rvuFlags?.filter(
          (flag) => flag.code === procedureCode.code,
        ) || [];

      const rvuViolationsFromAI = complianceIssues.filter(
        (issue) =>
          issue.type === "RVU" &&
          issue.affectedCodes?.includes(procedureCode.code),
      );

      const rvuViolations = [
        ...rvuViolationsFromCCI.map((flag) => ({
          code: flag.code,
          issue: flag.issue,
          severity: flag.severity,
        })),
        ...rvuViolationsFromAI.map((issue) => ({
          code: procedureCode.code,
          issue: issue.description || issue.message,
          severity: issue.severity === "ERROR" ? ("ERROR" as const) : ("WARNING" as const),
        })),
      ];

      // Only count ERROR and WARNING as violations, not INFO
      const hasViolation =
        generalComplianceViolations.some(
          (issue) => issue.severity === "ERROR",
        ) ||
        ptpViolations.some(
          (v) => v.severity === "ERROR" || v.severity === "WARNING",
        ) ||
        mueViolations.length > 0 ||
        globalViolations.some(
          (v) => v.severity === "ERROR" || v.severity === "WARNING",
        ) ||
        rvuViolations.some(
          (v) => v.severity === "ERROR" || v.severity === "WARNING",
        );

      // Determine overall compliance status
      const hasErrors =
        generalComplianceViolations.some(
          (issue) => issue.severity === "ERROR",
        ) ||
        ptpViolations.some((v) => v.severity === "ERROR") ||
        mueViolations.some((v) => v.severity === "ERROR") ||
        globalViolations.some((v) => v.severity === "ERROR") ||
        rvuViolations.some((v) => v.severity === "ERROR");

      const hasWarnings =
        generalComplianceViolations.some(
          (issue) => issue.severity === "WARNING",
        ) ||
        ptpViolations.some((v) => v.severity === "WARNING") ||
        mueViolations.some((v) => v.severity === "WARNING") ||
        globalViolations.some((v) => v.severity === "WARNING") ||
        rvuViolations.some((v) => v.severity === "WARNING");

      const complianceStatus: "info" | "warning" | "error" = hasErrors
        ? "error"
        : hasWarnings
          ? "warning"
          : "info";

      // Get RVU data for this procedure
      let rvuData = rvuMap.get(procedureCode.code);
      
      if (!rvuData) {
        // Handle different RVU data structures from the raw AI output
        let workRvu = 0;
        
        if (typeof procedureCode.rvu === 'number') {
          workRvu = procedureCode.rvu;
        } else if (procedureCode.rvu && typeof procedureCode.rvu === 'object') {
          // Handle structure like {mp: 0, pe: 0, work: 10.47}
          workRvu = procedureCode.rvu.work || 0;
        }
        
        const rvuValue = procedureCode.rvu;
        const baseRVUObj = typeof rvuValue === 'object' && rvuValue !== null 
          ? rvuValue 
          : { work: rvuValue || 0, pe: 0, mp: 0 };
          
        rvuData = {
          workRvu: {
            mp: baseRVUObj.mp || 0,
            pe: baseRVUObj.pe || 0,
            work: workRvu,
          },
          adjustedRvu: {
            mp: baseRVUObj.mp || 0,
            pe: baseRVUObj.pe || 0,
            work: workRvu,
          },
        };
      }

      return {
        cptCode: procedureCode.code,
        description: procedureCode.description,
        tag,
        icdCodes: relatedIcdCodes,
        modifiers: relatedModifiers,
        rvu: rvuData,
        compliance: {
          hasViolation,
          status: complianceStatus,
          violationDetails: 
            generalComplianceViolations.length > 0
              ? generalComplianceViolations[0].description
              : undefined,
          details: generalComplianceViolations.map((issue) => ({
            label: issue.type,
            text: issue.description,
          })),
          ptpViolations: ptpViolations.length > 0 ? ptpViolations : undefined,
          mueViolations: mueViolations.length > 0 ? mueViolations : undefined,
          globalViolations:
            globalViolations.length > 0 ? globalViolations : undefined,
          rvuViolations: rvuViolations.length > 0 ? rvuViolations : undefined,
        },
        complianceIssues: generalComplianceViolations.map((issue) => ({
          type: mapComplianceType(issue.type),
          description: issue.description,
          severity: mapSeverity(issue.severity),
          affectedCodes: issue.affectedCodes || [],
          recommendation: issue.recommendation || "",
          resolved: false,
          references: [],
        })),
        sourceNoteType: mapSourceNoteTypeToKey(
          procedureCode.sourceNoteType || "unknown",
        ),
        evidence: Array.isArray(procedureCode.evidence)
          ? procedureCode.evidence
          : procedureCode.evidence
            ? [procedureCode.evidence]
            : [],
        globalPeriod: procedureCode.globalPeriod || (procedureCode as any).globalDays,
        globalPeriodDescription: (procedureCode as any).globalPeriodDescription,
      };
    },
  );

  // Sort by adjustedRvu in descending order
  groupedProcedures.sort((a, b) => {
    const aTotal = (a.rvu.adjustedRvu?.work || 0) + (a.rvu.adjustedRvu?.pe || 0) + (a.rvu.adjustedRvu?.mp || 0);
    const bTotal = (b.rvu.adjustedRvu?.work || 0) + (b.rvu.adjustedRvu?.pe || 0) + (b.rvu.adjustedRvu?.mp || 0);
    return bTotal - aTotal;
  });

  return groupedProcedures;
}

/**
 * Helper function to reclassify PTP violations based on applied modifiers
 */
function reclassifyPTPViolationSeverity(
  primaryCode: string,
  secondaryCode: string,
  modifierPanelData: ModifierPanel,
  originalSeverity: "ERROR" | "WARNING" | "INFO",
): { severity: "ERROR" | "WARNING" | "INFO"; message: string } {
  // Modifiers that can reclassify PTP errors to INFO
  const ptpBypassModifiers = ["59", "XE", "XP", "XS", "XU", "25", "57"];

  // Find applied modifiers for both primary and secondary codes
  const primaryModifiers =
    modifierPanelData.suggestions.find(
      (group) => group.procedureCode === primaryCode,
    )?.suggestedModifiers || [];

  const secondaryModifiers =
    modifierPanelData.suggestions.find(
      (group) => group.procedureCode === secondaryCode,
    )?.suggestedModifiers || [];

  // Check if any bypass modifier is applied to either code
  const appliedBypassModifiers: { modifier: string; appliedTo: string }[] = [];

  // Check primary code modifiers
  primaryModifiers.forEach((mod) => {
    if (mod.modifier && ptpBypassModifiers.includes(mod.modifier)) {
      appliedBypassModifiers.push({
        modifier: mod.modifier,
        appliedTo: primaryCode,
      });
    }
  });

  // Check secondary code modifiers
  secondaryModifiers.forEach((mod) => {
    if (mod.modifier && ptpBypassModifiers.includes(mod.modifier)) {
      appliedBypassModifiers.push({
        modifier: mod.modifier,
        appliedTo: secondaryCode,
      });
    }
  });

  // If any bypass modifier is applied, reclassify to INFO
  if (appliedBypassModifiers.length > 0) {
    const relevantModifier = appliedBypassModifiers[0]; // Use the first found modifier
    return {
      severity: "INFO",
      message: `Column 2 code requires appropriate modifier when billed with Column 1 code. Modifier applied to ${relevantModifier.appliedTo}: ${relevantModifier.modifier}`,
    };
  }

  // No bypass modifier found, return original severity
  return {
    severity: originalSeverity,
    message: "", // Will use original message
  };
}

/**
 * Transform assistant/co-surgeon data from AI analysis
 */
export function transformAssistant(
  assistantAnalysis: AiAssistantAnalysisOutput | undefined,
): AssistantPanel {
  if (!assistantAnalysis) {
    return {
      assistants: [],
      flags: [],
    };
  }

  const assistants = [];

  // Add assistant surgeon if detected
  if (
    assistantAnalysis.assistantSurgeonDetected &&
    assistantAnalysis.assistantSurgeonName
  ) {
    // Determine the modifier based on the assignments
    const assistantModifier =
      assistantAnalysis.codeModifierAssignments?.find(
        (assignment: AiCodeModifierAssignmentOutput) =>
          assignment.assignedModifier === "80" ||
          assignment.assignedModifier === "82",
      )?.assignedModifier || "82";

    assistants.push({
      name: assistantAnalysis.assistantSurgeonName,
      role: "assistant" as const,
      codes:
        assistantAnalysis.codeModifierAssignments
          ?.filter(
            (assignment: AiCodeModifierAssignmentOutput) =>
              assignment.assignedModifier === "80" ||
              assignment.assignedModifier === "82",
          )
          ?.map(
            (assignment: AiCodeModifierAssignmentOutput) => assignment.code,
          ) || [],
      modifier: assistantModifier as "80" | "82",
      attestationRequired:
        assistantAnalysis.codeModifierAssignments?.some(
          (assignment: AiCodeModifierAssignmentOutput) =>
            assignment.attestationRequired,
        ) || false,
      attestationStatus: "pending" as const,
      evidence: assistantAnalysis.assistantEvidence
        ? [assistantAnalysis.assistantEvidence]
        : [],
      source: "AI" as const,
      sourceNoteType: mapSourceNoteTypeToKey(
        assistantAnalysis.sourceNoteType || "unknown",
      ),
    });
  }

  // Add co-surgeon if detected
  if (assistantAnalysis.coSurgeonDetected && assistantAnalysis.coSurgeonName) {
    assistants.push({
      name: assistantAnalysis.coSurgeonName,
      role: "co-surgeon" as const,
      codes:
        assistantAnalysis.codeModifierAssignments
          ?.filter(
            (assignment: AiCodeModifierAssignmentOutput) =>
              assignment.assignedModifier === "62",
          )
          ?.map(
            (assignment: AiCodeModifierAssignmentOutput) => assignment.code,
          ) || [],
      modifier: "62" as const,
      attestationRequired:
        assistantAnalysis.codeModifierAssignments?.some(
          (assignment: AiCodeModifierAssignmentOutput) =>
            assignment.attestationRequired,
        ) || false,
      attestationStatus: "pending" as const,
      evidence: assistantAnalysis.coSurgeonEvidence
        ? [assistantAnalysis.coSurgeonEvidence]
        : [],
      source: "AI" as const,
      sourceNoteType: mapSourceNoteTypeToKey(
        assistantAnalysis.sourceNoteType || "unknown",
      ),
    });
  }

  return {
    assistants,
    flags: [],
  };
}

/**
 * Transform summary data by aggregating from all other panels
 */
export function transformSummary(
  allPanelData: Omit<ComprehensiveDashboardState["panelData"], "summary">
): SummaryPanel {
  const panelTypes: Array<
    keyof Omit<
      ComprehensiveDashboardState["panelData"],
      "summary" | "groupedProcedures" | "additionalNoteOutputs"
    >
  > = [
    "demographics",
    "diagnosis",
    "procedure",
    "assistant",
    "modifier",
    "compliance",
    "rvu",
  ];

  return {
    panelSummaries: panelTypes.map((panelType) => {
      const panel = allPanelData[panelType];
      const flagCount = 
        panel && typeof panel === "object" && "flags" in panel
          ? panel.flags?.length || 0
          : 0;

      return {
        panelType,
        status: "clean" as const,
        flagCount,
        lastModified: new Date().toISOString(),
        modifiedBy: "AI",
      };
    }),
    overallStatus: "ready" as const,
    flags: [],
    workflow: {
      currentStep: "Review",
      nextAction: "Submit for approval",
      requiredActions: [],
      canSubmitToProvider: true,
      canFinalizeDirectly: false,
    },
  };
}

/**
 * Helper function to map source note type display names to keys
 */
function mapSourceNoteTypeToKey(sourceNoteType: string): string {
  const noteTypeMap: Record<string, string> = {
    "Operative Note": "operative_notes",
    "Admission Note": "admission_notes",
    "Discharge Note": "discharge_notes",
    "Pathology Note": "pathology_notes",
    "Progress Note": "progress_notes",
    "General Content": "content",
    // Add other mappings if necessary
  };
  // Return the mapped key, or the original string if no mapping is found
  // This handles cases where the AI might already provide the correct key or a new type
  return noteTypeMap[sourceNoteType] || sourceNoteType;
}

/**
 * Helper function to map compliance types
 */
function mapComplianceType(
  type: string,
): "CCI" | "MUE" | "LCD" | "GlobalPeriod" {
  switch (type?.toLowerCase()) {
    case "cci edit":
    case "cci":
      return "CCI";
    case "mue":
      return "MUE";
    case "lcd":
      return "LCD";
    case "global period":
    case "globalperiod":
      return "GlobalPeriod";
    default:
      return "CCI"; // Default fallback
  }
}

/**
 * Helper function to map severity levels
 */
function mapSeverity(severity: string): "ERROR" | "WARNING" | "INFO" {
  switch (severity?.toLowerCase()) {
    case "high":
    case "error":
      return "ERROR";
    case "medium":
    case "warning":
      return "WARNING";
    case "low":
    case "info":
      return "INFO";
    default:
      return "WARNING"; // Default fallback
  }
}

// --- Reconstruction Functions (PanelData back to AI-like output) ---

export function reconstructPanelDataToAiOutputFormat(
  panelData: ComprehensiveDashboardState["panelData"],
): AiRawOutput {
  if (!panelData) {
    console.error(
      "reconstructPanelDataToAiOutputFormat: panelData is null or undefined.",
    );
    return {}; // Handle cases where panelData might be undefined or null
  }

  const reconstructedOutput = {
    demographics: panelData.demographics
      ? reconstructDemographics(panelData.demographics)
      : {},
    encounter: panelData.demographics
      ? reconstructEncounter(panelData.demographics)
      : {},
    diagnosisCodes: panelData.diagnosis
      ? reconstructDiagnosis(panelData.diagnosis)
      : [],
    procedureCodes: panelData.procedure
      ? reconstructProcedure(panelData.procedure)
      : [],
    hcpcsCodes: panelData.procedure
      ? reconstructHcpcs(panelData.procedure)
      : [],
    // operativeNotes: panelData.assistant ? reconstructAssistant(panelData.assistant) : '', // Placeholder
    modifierSuggestions: panelData.modifier
      ? reconstructModifiers(panelData.modifier)
      : [],
    complianceIssues: panelData.compliance
      ? reconstructCompliance(panelData.compliance)
      : [],
    // Pass modifier data to reconstructRvu if it needs it, though current reconstructRvu doesn't use it.
    // For consistency with transformRvu, it could be added as an optional param if needed in future.
    rvuSequencing: panelData.rvu ? reconstructRvu(panelData.rvu) : {},
    // Summary panel is not typically reconstructed into ai_raw_output
  };

  console.log(
    "reconstructPanelDataToAiOutputFormat: Reconstructed AI Output:",
    JSON.stringify(reconstructedOutput, null, 2),
  );
  return reconstructedOutput;
}

function reconstructDemographics(
  panel: DemographicsPanel,
): AiDemographicsOutput {
  return {
    patientName: panel.patientInfo?.name,
    mrn: panel.patientInfo?.mrn,
    dateOfBirth: panel.patientInfo?.dateOfBirth,
    gender: panel.patientInfo?.gender,
    provider: panel.providerInfo?.name,
    providerSpecialty: panel.providerInfo?.specialty,
    npi: panel.providerInfo?.npi,
    facility: panel.encounterInfo?.facility,
  };
}

function reconstructEncounter(panel: DemographicsPanel): AiEncounterOutput {
  return {
    serviceDate: panel.encounterInfo?.serviceDate,
    admissionDate: panel.encounterInfo?.admissionDate,
    dischargeDate: panel.encounterInfo?.dischargeDate,
    visitType: panel.encounterInfo?.visitType,
  };
}

function reconstructDiagnosis(panel: DiagnosisPanel): AiDiagnosisCodeOutput[] {
  return (panel.codes || []).map((code) => ({
    code: code.code,
    description: code.description,
    isPrimary: true, // Default since EnhancedDiagnosisCode doesn't have isPrimary
    evidence: code.evidence || [],
    // These properties don't exist in EnhancedDiagnosisCode, using defaults
    includes: [],
    excludes: [],
    additionalCodesRequired: [],
    source: "AI", // Default source
  }));
}

function reconstructProcedure(panel: ProcedurePanel): AiProcedureCodeOutput[] {
  return (panel.codes || [])
    .filter((code) => /^\d{5}$/.test(code.code))
    .map((code) => ({
      code: code.code,
      description: code.description,
      evidence: code.evidence || [], // Both EnhancedProcedureCode and AiProcedureCodeOutput have evidence as array
      isPrimary: code.isPrimary,
      date: "", // EnhancedProcedureCode doesn't have a direct 'date' field
      rvu: code.rvu?.work || 0, // Map from the RVU object
      laterality: "", // EnhancedProcedureCode doesn't have laterality
      isAddOnCode: (code.addOnLinked?.length || 0) > 0, // Infer from addOnLinked
      isUnlistedCode: false, // Default for now
      exemptFromModifiers: [], // Default for now
      requiresParentCode: code.addOnLinked?.[0]?.code, // Infer from addOnLinked, maps to string
      globalPeriod: code.globalDays || "000", // Map globalDays to globalPeriod
      bilateralAllowed: false, // Default for now
      allowedModifiers: [], // Default for now since modifiersApplicable doesn't exist
      sourceNoteType: "", // EnhancedProcedureCode doesn't have sourceNoteType directly, use default
      source: "AI", // Default source, as rationale is not directly available on EnhancedProcedureCode
    }));
}

// function reconstructAssistant(panel: AssistantPanel): string {
//   // This is a placeholder. Reconstructing structured operative notes from panel data
//   // would be complex if the panel only stores a list of assistants.
//   // If the panel allows free-text editing of notes, that text would be returned.
//   // For now, returning a simple representation or assuming it's not directly reconstructed here.
//   return (panel.assistants || []).map(a => `Assistant: ${a.name} (NPI: ${a.npi || 'N/A'})`).join('\n');
// }

function reconstructModifiers(
  panel: ModifierPanel,
): AiModifierSuggestionOutput[] {
  const suggestions: AiModifierSuggestionOutput[] = [];
  (panel.suggestions || []).forEach((group) => {
    (group.suggestedModifiers || []).forEach((mod) => {
      // Extract procedureCode from linkedCptCode
      const procedureCode = mod.linkedCptCode || group.procedureCode;
      
      suggestions.push({
        procedureCode: procedureCode,
        modifier: mod.modifier,
        description: mod.description, // Use new 'description' field
        rationale: mod.description, // Use new 'description' as rationale placeholder
        explanation: mod.description, // Use new 'description' as explanation placeholder
        justification: mod.requiredDocumentation
          ? String(mod.requiredDocumentation)
          : mod.description, // Map from new fields
        fullJustification: mod.requiredDocumentation
          ? String(mod.requiredDocumentation)
          : mod.description, // Map from new fields
        detailedJustification: mod.requiredDocumentation
          ? String(mod.requiredDocumentation)
          : mod.description, // Map from new fields
        classification: mod.classification === ModifierClassifications.PRICING ? "Required" : "Suggested", // Map from new classification
        priority: 1, // Default priority, as no direct mapping in new type
        confidence: mod.evidence?.[0]?.confidence || 0.9, // Infer confidence from evidence
        required: mod.requiredDocumentation === true, // Infer from requiredDocumentation
        evidence: mod.evidence || [],
        sourceNoteType: "operative_notes", // Default source note type, as not in StandardizedModifier
      });
    });
  });
  return suggestions;
}

function reconstructCompliance(panel: CompliancePanel): any[] {
  return (panel.complianceIssues || []).map((issue) => ({
    type: issue.type, // Assuming type maps back directly, or needs reverse of mapComplianceType
    description: issue.description,
    severity: issue.severity, // Assuming severity maps back, or needs reverse of mapSeverity
    affectedCodes: issue.affectedCodes,
    recommendation: issue.recommendation,
    // 'resolved' status is important but might be handled differently than direct reconstruction
    // 'references' might also be part of the panel data to reconstruct
  }));
}

function reconstructRvu(panel: RVUPanel): any {
  if (!panel.sequencing) return {};
  return {
    optimalSequence: (panel.sequencing.optimizedOrder || []).map((code) => ({
      code: code.code,
      description: code.description,
      rvu: (code.baseRVU?.work || 0) + (code.baseRVU?.pe || 0) + (code.baseRVU?.mp || 0), // or adjustedRVU
    })),
    totalRVU: panel.sequencing.totalRVU,
    recommendation: panel.sequencing.explanation,
    // 'modifier51Applied' might be part of panel data
  };
}

function reconstructHcpcs(panel: ProcedurePanel): AiHCPCSCodeOutput[] {
  return (panel.codes || [])
    .filter((code) => /^[^A-Z]\d{4}$/.test(code.code))
    .map((code) => ({
      code: code.code,
      description: code.description,
      evidence: code.evidence || [],
      date: new Date().toISOString(),
      quantity: 1,
      units: "each",
      laterality: "",
      category: "Other",
      isTemporary: false,
      exemptFromModifiers: [], // Default empty array since modifiers property doesn't exist
      codeType: "HCPCS",
      sourceNoteType: "", // Default empty string since sourceNoteType doesn't exist on EnhancedProcedureCode
    }));
}


