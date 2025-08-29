import { z } from "zod";

// Define a minimal interface for the AI model service based on its usage
interface AIModelService {
  generateStructuredOutput<T>(
    prompt: string,
    schema: z.ZodType<T>,
  ): Promise<T>;
}
import { 
  Agents,
  EnhancedProcedureCode,
  Notes,
  ProcessingError,
  ProcessingErrorSeverity,
  StandardizedAgent,
  StandardizedAgentContext,
  StandardizedAgentResult,
  StandardizedEvidence,
  StandardizedWorkflowState,
  LCDCheckInput, LCDCheckOutput, LCDPolicyEvaluation,
} from "./newtypes";
import { WorkflowLogger } from "../../app/coder/lib/logging";
import { WISCONSIN_LCD_POLICIES } from "../data/lcd-policies";

export class LCDAgent implements StandardizedAgent {
  readonly name = Agents.LCD;
  readonly description = "Performs LCD checks and generates evidence.";
  readonly requiredServices: string[] = ["aiModel", "azureStorageService"];

  async execute(context: StandardizedAgentContext): Promise<StandardizedAgentResult> {
    const { state, logger, services } = context;
    const startTime = Date.now();

    logger.logAgentStart(this.name.toString(), state, context);

    try {
      // Progress tracking removed - no real-time updates

      // Validate prerequisites
      const validationResult = this.validateInput(state);
      if (!validationResult.isValid) {
        // Progress tracking removed
        return this.createFailureResult(validationResult.errors);
      }

      // Prepare input for LCD check
      const lcdInput = this.prepareLCDInput(state);
      logger.logInfo(this.name.toString(), "Prepared LCD input", {
        procedureCount: lcdInput.procedures.length,
        diagnosisCount: lcdInput.diagnoses.length,
        jurisdiction: lcdInput.macJurisdiction,
      });

      // Step 1: Load LCD policies based on state and diagnosis codes
      // Progress tracking removed

      const retrievalStartTime = Date.now();
      let policies: any[] = [];

      try {
        // Set macJurisdiction to "WI" for Wisconsin
        const macJurisdiction = "WI";

        // Load applicable LCD policies based on diagnosis codes
        policies = await this.loadApplicableLCDPolicies(macJurisdiction, lcdInput.diagnoses, logger, services);
      } catch (error: any) {
        logger.logWarn(
          this.name.toString(),
          "LCD policy loading failed, using fallback",
          {
            error: error.message,
            diagnosisCodes: lcdInput.diagnoses,
          },
        );

        // If loading fails, continue with empty policies
        policies = [];
      }

      const retrievalTime = Date.now() - retrievalStartTime;
      logger.logInfo(this.name.toString(), "Loaded LCD policies", {
        count: policies.length,
        executionTime: retrievalTime,
      });

      // Progress tracking removed

      // Step 2: AI-powered policy evaluation (only if policies are found)
      const synthesisStartTime = Date.now();
      let evaluations: LCDPolicyEvaluation[] = [];
      
      if (policies.length > 0) {
        evaluations = await this.evaluatePoliciesWithAI(
          lcdInput,
          policies,
          services.aiModel,
          logger,
        );
      } else {
        logger.logInfo(this.name.toString(), "No matching LCD policies found - skipping AI evaluation", {
          diagnosisCodes: lcdInput.diagnoses,
          macJurisdiction: lcdInput.macJurisdiction,
        });
      }
      
      const synthesisTime = Date.now() - synthesisStartTime;

      // Progress tracking removed

      // Step 3: Determine overall coverage status
      const lcdResult = this.synthesizeResults(lcdInput, evaluations, {
        retrievalTime,
        synthesisTime,
        policiesEvaluated: policies.length,
        cacheHit: false, // TODO: implement cache hit detection
        circuitBreakerTriggered:
          policies.length === 0 && evaluations.length === 0,
      });

      // Step 4: Generate evidence and return result
      const evidence = this.createEvidence(
        [],
        "LCD result summary",
        this.calculateOverallConfidence(evaluations),
        Notes.OPERATIVE,
        {
          type: "lcd_result",
          data: lcdResult,
        },
      );

      const executionTime = Date.now() - startTime;

      // Always return success=true to ensure workflow continues to other agents
      // LCD policy failures are treated as compliance issues, not workflow failures
      const result: StandardizedAgentResult = {
        success: true,
        evidence: [evidence],
        data: {
            ...lcdResult,
            confidence: this.calculateOverallConfidence(evaluations),
            agentSpecificData: {
                retrievalTime,
                synthesisTime,
                policiesEvaluated: policies.length,
                overallCoverageStatus: lcdResult.overallCoverageStatus,
                hasViolations:
                  lcdResult.overallCoverageStatus === "Fail" ||
                  lcdResult.overallCoverageStatus === "Partial",
                criticalIssuesCount: lcdResult.criticalIssues.length,
            }
        },
        errors: [], // Don't include LCD policy failures as errors - they're compliance issues
        metadata: {
          executionTime,
          version: "1.0",
          agentName: this.name,
        },
      };

      logger.logAgentEnd(this.name.toString(), result, executionTime);

      // Progress tracking removed

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      logger.logError(this.name.toString(), "LCD agent execution failed", {
        error,
        executionTime,
      });

      // Progress tracking removed

      const failureEvidence = this.createEvidence(
        [],
        `The LCD agent failed with an unrecoverable error: ${error.message}`,
        0,
        Notes.OPERATIVE,
        {
          type: "lcd_result",
          data: {
            overallCoverageStatus: "Fail",
            criticalIssues: [
              `The LCD agent failed with an unrecoverable error: ${error.message}`,
            ],
            recommendations: ["Manual review of LCD policies is required."],
            dateOfService: state.caseMeta.dateOfService.toISOString(),
            macJurisdiction: state.demographics.zipCode || "Unknown",
            evaluations: [],
            bestMatch: {
              policyId: "N/A",
              coverageStatus: "Unknown",
              confidence: 0,
            },
            processingMetadata: {
              retrievalTime: 0,
              synthesisTime: 0,
              policiesEvaluated: 0,
              cacheHit: false,
            },
          },
        },
      );

      return {
        success: true, // Always return true to allow other agents to run
        evidence: [failureEvidence],
        data: {
            ...(failureEvidence.content as any)?.data,
            agentSpecificData: {
                failed: true,
                error: error.message,
            }
        },
        errors: [
          this.createError(
            "LCD_EXECUTION_FAILED",
            error.message,
            ProcessingErrorSeverity.HIGH,
            error.context,
          ),
        ],
        metadata: {
          executionTime,
          version: "1.0",
          agentName: this.name,
        },
      };
    }
  }

  private validateInput(state: StandardizedWorkflowState): {
    isValid: boolean;
    errors: ProcessingError[];
  } {
    const errors: ProcessingError[] = [];

    if (!state.procedureCodes || state.procedureCodes.length === 0) {
      errors.push(
        this.createError(
          "MISSING_PROCEDURE_CODES",
          "No procedure codes found for LCD evaluation",
          ProcessingErrorSeverity.HIGH,
        ),
      );
    }

    if (!state.caseMeta?.dateOfService) {
      errors.push(
        this.createError(
          "MISSING_DATE_OF_SERVICE",
          "Date of service required for LCD evaluation",
          ProcessingErrorSeverity.HIGH,
        ),
      );
    }
    if (
      !state.caseNotes?.primaryNoteText ||
      state.caseNotes.primaryNoteText.trim().length === 0
    ) {
      errors.push(
        this.createError(
          "MISSING_NOTE_TEXT",
          "Clinical note text required for LCD criteria evaluation",
          ProcessingErrorSeverity.MEDIUM,
        ),
      );
    }

    return { isValid: errors.length === 0, errors };
  }

  private prepareLCDInput(state: StandardizedWorkflowState): LCDCheckInput {
    const proceduresEvidence = state.allEvidence.find(
      (e) => (e.content as any)?.type === "procedure_codes",
    );

    const evidenceProcs = (proceduresEvidence?.content as any)?.data as
      | EnhancedProcedureCode[]
      | undefined;

    const procedures = evidenceProcs || state.procedureCodes || [];

    // Extract diagnosis codes from the linked ICD codes on each procedure
    // This is the primary source in the new workflow
    const diagnoses: string[] = [];
    procedures.forEach(proc => {
      if (proc.icd10Linked && proc.icd10Linked.length > 0) {
        proc.icd10Linked.forEach(icd => {
          if (!diagnoses.includes(icd.code)) {
            diagnoses.push(icd.code);
          }
        });
      }
    });

    // Fallback to the old method if no linked ICD codes are found
    if (diagnoses.length === 0 && state.diagnosisCodes && state.diagnosisCodes.length > 0) {
      diagnoses.push(...state.diagnosisCodes.map((diag) => diag.code));
    }

    return {
      dateOfService: new Date(state.caseMeta.dateOfService).toISOString(),
      macJurisdiction: "WI", // Fixed to Wisconsin as per the plan
      procedures: procedures.map((proc) => ({
        code: proc.code,
        description: proc.description || "",
        modifiers: proc.modifiersLinked?.map(m => m.modifier).filter(m => m !== null) as string[] || [],
        units: proc.units || 1,
        icd10Linked: proc.icd10Linked?.map(icd => ({
          code: icd.code,
          description: icd.description
        })) || []
      })),
      diagnoses: diagnoses,
      noteText: state.caseNotes.primaryNoteText,
      caseId: state.caseMeta.caseId,
    };
  }

  private async evaluatePoliciesWithAI(
    input: LCDCheckInput,
    policies: any[],
    aiService: AIModelService,
    logger: WorkflowLogger,
  ): Promise<LCDPolicyEvaluation[]> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = await this.buildUserPrompt(input, policies, logger);

    logger.logInfo(this.name.toString(), "Sending LCD evaluation request to AI", {
      policiesCount: policies.length,
      promptLength: userPrompt.length,
    });

    try {
      // Define the JSON schema for LCDPolicyEvaluation wrapped in an object
      const lcdPolicyEvaluationSchema = z.object({
        evaluations: z.array(
          z.object({
            policyId: z.string(),
            title: z.string(),
            jurisdiction: z.string(),
            score: z.number(),
            coverageStatus: z.enum(["Pass", "Fail", "Unknown"]),
            unmetCriteria: z.array(
              z.object({
                criterion: z.string(),
                description: z.string(),
                action: z.string(),
                severity: z.enum(["Critical", "Warning", "Info"]),
              }),
            ),
            effectiveDate: z.string(),
            policy: z.string(),
            specificEvidence: z.string(),
            neededAdditionalDocumentation: z.string(),
          }),
        ),
      });

      // Combine system and user prompts into a single prompt
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;

      const response = await aiService.generateStructuredOutput<{ 
        evaluations: LCDPolicyEvaluation[];
      }>(combinedPrompt, lcdPolicyEvaluationSchema);

      logger.logDebug(this.name.toString(), "Raw AI Result for LCD Evaluations:", {
        aiResult: JSON.stringify(response, null, 2),
      });

      const evaluations = response.evaluations;

      logger.logInfo(this.name.toString(), "AI evaluation completed", {
        evaluationsCount: evaluations.length,
        passCount: evaluations.filter((e) => e.coverageStatus === "Pass")
          .length,
        failCount: evaluations.filter((e) => e.coverageStatus === "Fail")
          .length,
      });

      return evaluations;
    } catch (error: any) {
      logger.logError(this.name.toString(), "AI evaluation failed", { error });

      // For critical AI failures, we should still provide fallback results
      // but ensure the error is properly logged and reported
      const fallbackEvaluations: LCDPolicyEvaluation[] = policies.map(
        (policy, index) => ({
          policyId: policy.lcd_id || `Policy_${index + 1}`,
          title: policy.lcd_information?.document_information?.lcd_title || `LCD Policy ${index + 1}`,
          jurisdiction: "WI",
          score: policy.score || 0,
          coverageStatus: "Unknown" as const,
          unmetCriteria: [
            {
              criterion: "AI_EVALUATION_FAILED",
              description:
                "AI evaluation service unavailable - manual review required",
              action: "Perform manual LCD policy evaluation",
              severity: "Critical" as const,
            },
          ],
          effectiveDate: policy.lcd_information?.document_information?.original_effective_date || "Unknown",
          policy:
            "AI evaluation failed - policy content available but not evaluated",
          specificEvidence: "Unable to evaluate due to AI service failure",
          neededAdditionalDocumentation:
            "Manual review required to determine coverage requirements",
        }),
      );

      logger.logWarn(
        this.name.toString(),
        "Using fallback LCD evaluations due to AI failure",
        {
          fallbackCount: fallbackEvaluations.length,
          originalError: error.message,
        },
      );

      return fallbackEvaluations;
    }
  }

  private buildSystemPrompt(): string {
    return `You are a medical coding expert specializing in Local Coverage Determination (LCD) policy evaluation.

Your task is to evaluate physician notes against LCD policies and determine coverage eligibility based on diagnosis code matches.

For each LCD policy provided, you will receive:
- Policy title and coverage guidance (when found and available)
- Pre-selected policies based on matching diagnosis codes from the clinical note
- Complete policy context including coverage criteria and requirements

For each LCD policy provided:
1. The policy has been pre-selected based on matching diagnosis codes from the clinical note
2. Use the policy title and coverage guidance provided to understand the specific requirements
3. Carefully review the coverage guidance criteria listed in the policy
4. Examine the physician note for evidence supporting each criterion
5. Determine if the note meets, partially meets, or fails to meet each criterion
6. Assign an overall coverage status: Pass, Fail, or Unknown
7. For any unmet criteria, provide specific actions needed
8. Extract the policy text, the specific evidence from the note, and any needed additional documentation

Guidelines:
- Be conservative in your evaluation - if evidence is ambiguous, mark as unmet
- Focus on explicit documentation in the note, not implied information
- Consider the specific wording of LCD criteria (e.g., "must have", "should include")
- Provide actionable feedback for unmet criteria
- Since policies are pre-filtered by diagnosis code matches, focus on evaluating the specific coverage criteria rather than general applicability
- A 'Fail' status should be assigned if there is a direct violation of specific policy criteria or missing required documentation
- A 'Pass' status should be assigned when all policy criteria are met with adequate documentation
- Use 'Unknown' when criteria cannot be determined from available documentation
- If no matching policies are found, no AI API call should be made

Return your evaluation as a JSON object with an 'evaluations' property containing an array of LCDPolicyEvaluation objects.`;
  }

  private async buildUserPrompt(
    input: LCDCheckInput,
    policies: any[],
    logger: WorkflowLogger,
  ): Promise<string> {
    const policyDetails = policies.map((policy, index) => {
      logger.logDebug(this.name.toString(), "Processing policy for prompt", {
        lcdId: policy.lcd_id,
        title: policy.lcd_information?.document_information?.lcd_title,
        hasCoverageGuidance: !!(policy.lcd_information?.coverage_guidance),
        matchedDiagnosisCodes: policy.matchedDiagnosisCodes,
      });

      // Extract coverage guidance directly from the JSON structure
      const coverageGuidance = policy.lcd_information?.coverage_guidance || "No coverage guidance available";

      // Get policy metadata
      const policyId = policy.lcd_id || `Policy_${index + 1}`;
      const title = policy.lcd_information?.document_information?.lcd_title || `LCD Policy ${index + 1}`;
      const effectiveDate = policy.lcd_information?.document_information?.original_effective_date || "Unknown";
      const matchedCodes = policy.matchedDiagnosisCodes || [];

      logger.logDebug(this.name.toString(), "Extracted coverage guidance", {
        policyId,
        coverageGuidanceLength: coverageGuidance.length,
        matchedCodesCount: matchedCodes.length,
      });

      return `
Policy ${index + 1}:
- Policy ID: ${policyId}
- Title: ${title}
- Jurisdiction: WI (Wisconsin)
- Effective Date: ${effectiveDate}
- Matched Diagnosis Codes: ${matchedCodes.join(", ")}
- Relevance Score: ${policy.score}

Coverage Guidance:
${coverageGuidance}
`;
    });

    // Add context about CPT-ICD linkage
    const cptIcdContext = input.procedures.map(proc => {
      const linkedIcds = proc.icd10Linked || [];
      return `- Procedure ${proc.code}: Linked to ICD codes ${linkedIcds.map(icd => icd.code).join(", ")}`;
    }).join("\n");

    return `Please evaluate the following physician note against the provided LCD policies that have been pre-selected based on diagnosis code matches:

**Case Information:**
- Date of Service: ${input.dateOfService}
- MAC Jurisdiction: WI (Wisconsin)
- Procedure Codes: ${input.procedures
        .map(
          (p) =>
            `${p.code}${p.modifiers.length ? ` (${p.modifiers.join(", ")})` : ""}`,
        )
        .join(", ")}
- Diagnosis Codes: ${input.diagnoses.join(", ")}

**CPT-ICD Linkage Context:**
${cptIcdContext}

**Physician Note:**
${input.noteText}

**LCD Policies to Evaluate:**
${policyDetails.join("\n---\n")}

**Important Notes:**
- Each policy listed above has been pre-selected because it contains coverage criteria that match one or more of the diagnosis codes from this case
- Focus your evaluation on whether the physician note provides adequate documentation to meet the specific coverage criteria outlined in each policy
- Pay special attention to the "Matched Diagnosis Codes" for each policy as these indicate why the policy is relevant to this case
- Consider the specific CPT-ICD linkage context when evaluating policy applicability

Please provide your evaluation as a JSON object with an 'evaluations' property containing an array of LCDPolicyEvaluation objects.`;
  }

  private synthesizeResults(
    input: LCDCheckInput,
    evaluations: LCDPolicyEvaluation[],
    metadata: any,
  ): LCDCheckOutput {
    // Handle circuit breaker or service failure cases
    if (evaluations.length === 0) {
      const fallbackRecommendations = [
        "Manual LCD policy review required due to service unavailability",
        "Verify coverage requirements with MAC jurisdiction",
        "Consider reprocessing when LCD service is restored",
      ];

      const fallbackIssues = metadata.circuitBreakerTriggered
        ? [
          "LCD service circuit breaker activated - policies could not be retrieved",
        ]
        : ["No LCD policies found for the provided criteria"];

      return {
        dateOfService: input.dateOfService,
        macJurisdiction: input.macJurisdiction,
        evaluations: [],
        bestMatch: {
          policyId: "N/A",
          coverageStatus: "Unknown",
          confidence: 0,
        },
        overallCoverageStatus: "Unknown",
        criticalIssues: fallbackIssues,
        recommendations: fallbackRecommendations,
        processingMetadata: {
          ...metadata,
          fallbackMode: true,
        },
      };
    }

    // Determine best match (highest score with Pass status, or highest score overall)
    const passEvaluations = evaluations.filter(
      (e) => e.coverageStatus === "Pass",
    );
    const bestMatch = 
      passEvaluations.length > 0
        ? passEvaluations.reduce((best, current) =>
          current.score > best.score ? current : best,
        )
        : evaluations.reduce((best, current) =>
          current.score > best.score ? current : best,
        );

    // Determine overall coverage status
    const overallStatus = this.determineOverallStatus(evaluations);

    // Collect critical issues and recommendations
    // Convert critical issues to strings as required by the LCDCheckOutput interface
    const criticalIssues = evaluations
      .flatMap((e) => e.unmetCriteria.filter((c) => c.severity === "Critical"))
      .map((c) => `${c.criterion}: ${c.description}`);
      
    const recommendations = evaluations
      .flatMap((e) => e.unmetCriteria)
      .map((c) => c.action)
      .filter((action, index, arr) => arr.indexOf(action) === index); // Remove duplicates

    // Add policy-specific recommendations for failed evaluations
    evaluations.forEach((evaluation) => {
      if (evaluation.coverageStatus === "Fail") {
        recommendations.push(
          `Policy: ${evaluation.policy}`,
          `Specific Evidence: ${evaluation.specificEvidence}`,
          `Needed Additional Documentation: ${evaluation.neededAdditionalDocumentation}`,
        );
      }
    });

    return {
      dateOfService: input.dateOfService,
      macJurisdiction: input.macJurisdiction,
      evaluations,
      bestMatch: {
        policyId: bestMatch.policyId,
        coverageStatus: bestMatch.coverageStatus,
        confidence: bestMatch.score,
      },
      overallCoverageStatus: overallStatus,
      criticalIssues,
      recommendations,
      processingMetadata: metadata,
    };
  }

  private determineOverallStatus(
    evaluations: LCDPolicyEvaluation[],
  ): "Pass" | "Fail" | "Partial" | "Unknown" {
    if (evaluations.length === 0) return "Unknown";

    const passCount = evaluations.filter(
      (e) => e.coverageStatus === "Pass",
    ).length;
    const failCount = evaluations.filter(
      (e) => e.coverageStatus === "Fail",
    ).length;

    if (passCount > 0 && failCount === 0) return "Pass";
    if (passCount === 0 && failCount > 0) return "Fail";
    if (passCount > 0 && failCount > 0) return "Partial";
    return "Unknown";
  }

  private calculateOverallConfidence(
    evaluations: LCDPolicyEvaluation[],
  ): number {
    if (evaluations.length === 0) return 0;

    const avgScore =
      evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;
    const statusConfidence =
      evaluations.filter((e) => e.coverageStatus !== "Unknown").length /
      evaluations.length;

    return (avgScore + statusConfidence) / 2;
  }

  private createError(
    code: string,
    message: string,
    severity: ProcessingErrorSeverity,
    context?: Record<string, any>,
  ): ProcessingError {
    return {
      message: `${code}: ${message}`,
      severity: severity,
      source: this.name.toString(),
      timestamp: new Date(),
      context,
    };
  }



  private async loadApplicableLCDPolicies(
    macJurisdiction: string,
    diagnosisCodes: string[],
    logger: WorkflowLogger,
    services: Record<string, any>,
  ): Promise<any[]> {
    const applicablePolicies: any[] = [];

    try {
      // Read the state JSON file using Azure Storage Service
      const stateFilePath = `LCD/${macJurisdiction}.json`;

      logger.logInfo(this.name.toString(), "Loading state LCD file", {
        filePath: stateFilePath,
        macJurisdiction,
      });

      // const stateFileContent = await services.azureStorageService.getFileContent(stateFilePath);
      const stateFileContent = WISCONSIN_LCD_POLICIES; // For testing purposes, use the hardcoded policies
      const stateData = JSON.parse(stateFileContent);

      logger.logInfo(this.name.toString(), "Parsed state data", {
        state: stateData.state,
        abbreviation: stateData.abbreviation,
        policiesCount: stateData.policies?.length || 0,
      });

      // Iterate through policies to find matches with diagnosis codes
      for (const policy of stateData.policies || []) {
        const matchedCodes: string[] = [];

        // Check associated documents for diagnosis code matches
        const relatedDocs = policy.associated_documents?.related_local_coverage_documents || [];

        for (const doc of relatedDocs) {
          const articleContent = doc.article_content || {};

          // Check Group 1 Paragraph codes
          const group1Codes = articleContent["Group 1 Paragraph"]?.codes || [];

          for (const codeObj of group1Codes) {
            if (diagnosisCodes.includes(codeObj.code)) {
              matchedCodes.push(codeObj.code);
            }
          }
        }

        // If we found matching diagnosis codes, load the full policy
        if (matchedCodes.length > 0) {
          logger.logInfo(this.name.toString(), "Found matching policy", {
            lcdId: policy.lcd_id,
            title: policy.title,
            matchedCodes,
          });

          try {
            const fullPolicy = await this.loadFullLCDPolicy(policy.lcd_id, logger, services);
            if (fullPolicy) {
              applicablePolicies.push({
                ...fullPolicy,
                matchedDiagnosisCodes: matchedCodes,
                score: 0.9, // High relevance since it's based on exact diagnosis code match
              });
            }
          } catch (error: any) {
            logger.logWarn(this.name.toString(), "Failed to load full policy", {
              lcdId: policy.lcd_id,
              error: error.message,
            });
          }
        }
      }

      logger.logInfo(this.name.toString(), "Loaded applicable LCD policies", {
        totalApplicable: applicablePolicies.length,
        diagnosisCodesChecked: diagnosisCodes.length,
      });

      return applicablePolicies;
    } catch (error: any) {
      logger.logError(this.name.toString(), "Failed to load applicable LCD policies", {
        error: error.message,
        macJurisdiction,
        diagnosisCodes,
      });
      throw error;
    }
  }

  private async loadFullLCDPolicy(lcdId: string, logger: WorkflowLogger, services: Record<string, any>): Promise<any | null> {
    try {
      const policyFilePath = `LCD/pages/${lcdId}.json`;

      logger.logDebug(this.name.toString(), "Loading full LCD policy", {
        lcdId,
        filePath: policyFilePath,
      });

      const policyContent = await services.azureStorageService.getFileContent(policyFilePath);
      const policyData = JSON.parse(policyContent);

      logger.logInfo(this.name.toString(), "Successfully loaded full LCD policy", {
        lcdId: policyData.lcd_id,
        title: policyData.lcd_information?.document_information?.lcd_title,
        hasCoverageGuidance: !!(policyData.lcd_information?.coverage_guidance),
      });

      return policyData;
    } catch (error: any) {
      logger.logWarn(this.name.toString(), "Failed to load full LCD policy file", {
        lcdId,
        error: error.message,
      });
      return null;
    }
  }

  private createFailureResult(
    errors: ProcessingError[],
    evidence: StandardizedEvidence[] = [],
    executionTime: number = 0,
  ): StandardizedAgentResult {
    return {
        success: false,
        evidence,
        data: {
            reason: "Input validation failed or other pre-execution error.",
        },
        errors,
        metadata: {
            executionTime,
            version: "1.0",
            agentName: this.name,
        }
    };
  }

  private createEvidence(
    verbatimEvidence: string[],
    rationale: string,
    confidence: number,
    sourceNote: Notes,
    content?: Record<string, any>,
  ): StandardizedEvidence {
    return {
      verbatimEvidence,
      rationale,
      confidence,
      sourceNote,
      sourceAgent: this.name,
      content,
    };
  }
}
