/**
 * Enhanced validation functions that use the policy table
 * This file extends the ai-workflow.ts with policy-driven validation
 */

import type { AppliedModifier } from "./ai-workflow-types"
import type { EnhancedProcedureCode } from "../../../lib/agents/newtypes"
import {
  isModifierAllowedForCode,
  getDocumentationRequirement,
  getFeeAdjustment,
  getCodeProperties,
} from "./modifier-policy-table"
import {
  areModifiersExclusive,
  sortModifiersBySequencingRules,
  checkModifierConflicts,
  getConflictExplanation,
} from "./modifier-conflict-sequencing"

/**
 * Enhanced validation function that uses the policy table and conflict detection
 * @param procedureCode The procedure code object
 * @param modifier The modifier to validate
 * @param currentModifiers Currently applied modifiers
 * @param patientInfo Optional patient information
 * @param payer Optional payer information
 * @returns Validation result
 */
export function validateModifierWithPolicy(
  procedureCode: EnhancedProcedureCode,
  modifier: string,
  currentModifiers: AppliedModifier[] = [],
  patientInfo?: { weight?: number; age?: number },
  payer?: string,
): {
  isValid: boolean
  reason?: string
  warning?: string
  feeAdjustment?: string
  documentationRequired?: string
  conflictsWith?: string[]
} {
  // First check the policy table
  const policyCheck = isModifierAllowedForCode(procedureCode.code, modifier, payer)

  if (!policyCheck.isAllowed) {
    return {
      isValid: false,
      reason: policyCheck.reason || `Modifier ${modifier} is not allowed for code ${procedureCode.code} per policy`,
    }
  }

  // Check if modifier is already applied
  const currentModifierCodes = currentModifiers.map((am) => am.modifier)
  if (currentModifierCodes.includes(modifier)) {
    return {
      isValid: false,
      reason: `Modifier ${modifier} is already applied to this procedure code.`,
    }
  }

  // Special validation for add-on codes
  // Note: In the new type system, we need to check if the code has addOnLinked codes
  const isAddOnCode = procedureCode.addOnLinked && procedureCode.addOnLinked.length > 0;
  if (isAddOnCode) {
    if (modifier === "51") {
      return {
        isValid: false,
        reason: `Modifier 51 (Multiple Procedures) is not allowed on add-on codes.`,
      }
    }

    if (modifier === "50") {
      return {
        isValid: false,
        reason: `Modifier 50 (Bilateral Procedure) should not be used with add-on code ${procedureCode.code}. Report the code twice instead.`,
      }
    }

    // For add-on codes, we check if modifier 59 is in the applicable modifiers
    if (modifier === "59" && (!procedureCode.modifiersApplicable || !procedureCode.modifiersApplicable.includes("59"))) {
      return {
        isValid: false,
        reason: `Modifier 59 (Distinct Procedural Service) is not typically allowed on add-on codes unless specifically permitted by policy.`,
      }
    }
  }

  // Special validation for unlisted codes
  // Note: In the new type system, we might need to determine this differently
  const isUnlistedCode = procedureCode.description.toLowerCase().includes("unlisted");
  if (isUnlistedCode && modifier === "22") {
    return {
      isValid: false,
      reason: `Modifier 22 (Increased Procedural Services) cannot be used with unlisted code ${procedureCode.code}.`,
    }
  }

  // Special validation for modifier 25
  if (modifier === "25") {
    // Check if this is an E/M code (99xxx)
    if (!procedureCode.code.startsWith("99")) {
      return {
        isValid: false,
        reason: `Modifier 25 can only be applied to E/M codes (99xxx series).`,
      }
    }
  }

  // Special validation for modifier 57
  if (modifier === "57") {
    // Check if this is an E/M code (99xxx)
    if (!procedureCode.code.startsWith("99")) {
      return {
        isValid: false,
        reason: `Modifier 57 can only be applied to E/M codes (99xxx series).`,
      }
    }

    // Ideally we would check if there's a major procedure with 90-day global period
    // but we'll just add a warning for now
    return {
      isValid: true,
      warning: "Ensure this E/M service is for the decision to perform a major procedure (90-day global period).",
      documentationRequired: "Documentation of decision for major surgery",
    }
  }

  // Special validation for modifiers 76 and 77
  if (modifier === "76" || modifier === "77") {
    // Check if this is an E/M code (99xxx)
    if (procedureCode.code.startsWith("99")) {
      return {
        isValid: false,
        reason: `Modifier ${modifier} should not be used on E/M codes.`,
      }
    }
  }

  // Check for special modifiers with patient requirements
  if (modifier === "63" && patientInfo?.weight && patientInfo.weight >= 4) {
    return {
      isValid: false,
      reason: `Modifier 63 can only be used for infants less than 4kg. Current patient weight: ${patientInfo.weight}kg`,
    }
  }

  // Check for conflicts with existing modifiers
  const conflictingModifiers: string[] = []
  for (const existingModifier of currentModifierCodes) {
    if (areModifiersExclusive(modifier, existingModifier)) {
      conflictingModifiers.push(existingModifier)
    }
  }

  if (conflictingModifiers.length > 0) {
    conflictingModifiers.map(
      (conflictMod) => `${conflictMod}: ${getConflictExplanation(modifier, conflictMod)}`,
    )

    return {
      isValid: false,
      reason: `Modifier ${modifier} conflicts with existing modifier(s): ${conflictingModifiers.join(", ")}`,
      conflictsWith: conflictingModifiers,
    }
  }

  // Get documentation requirements and fee adjustments from policy
  const documentationRequired = getDocumentationRequirement(procedureCode.code, modifier, payer)
  const feeAdjustment = getFeeAdjustment(procedureCode.code, modifier)

  return {
    isValid: true,
    warning: documentationRequired ? `Documentation required: ${documentationRequired}` : undefined,
    feeAdjustment,
    documentationRequired: documentationRequired || undefined,
  }
}

/**
 * Enhances a procedure code with policy-driven properties
 * @param procedureCode The procedure code to enhance
 * @returns Enhanced procedure code with policy properties
 */
export function enhanceProcedureCodeWithPolicy(procedureCode: EnhancedProcedureCode): EnhancedProcedureCode {
  const codeProperties = getCodeProperties(procedureCode.code)

  return {
    ...procedureCode,
    // Update properties to match the new EnhancedProcedureCode interface
    isPrimary: procedureCode.isPrimary ?? false, // Default to false if not set
    // Map old properties to new ones where applicable
    modifiersApplicable: codeProperties.allowedModifiers || procedureCode.modifiersApplicable,
    // Note: Some properties may not have direct equivalents in the new type system
  }
}

/**
 * Gets all allowed modifiers for a procedure code based on policy
 * @param procedureCode The procedure code
 * @param payer Optional payer
 * @returns Array of allowed modifiers
 */
export function getAllowedModifiersForCode(procedureCode: EnhancedProcedureCode): string[] {
  const codeProperties = getCodeProperties(procedureCode.code)
  return codeProperties.allowedModifiers || []
}

/**
 * Gets all exempt modifiers for a procedure code based on policy
 * @param procedureCode The procedure code
 * @param payer Optional payer
 * @returns Array of exempt modifiers
 */
export function getExemptModifiersForCode(procedureCode: EnhancedProcedureCode): string[] {
  const codeProperties = getCodeProperties(procedureCode.code)
  return codeProperties.exemptModifiers || []
}

/**
 * Properly sequences a list of applied modifiers according to sequencing rules
 * @param appliedModifiers List of applied modifiers
 * @returns Properly sequenced list of applied modifiers
 */
export function sequenceAppliedModifiers(appliedModifiers: AppliedModifier[]): AppliedModifier[] {
  if (appliedModifiers.length <= 1) return appliedModifiers

  // Extract modifier codes
  const modifierCodes = appliedModifiers.map((am) => am.modifier)

  // Sort the modifier codes according to sequencing rules
  const sortedCodes = sortModifiersBySequencingRules(modifierCodes)

  // Reorder the applied modifiers based on the sorted codes
  return sortedCodes.map((code) => appliedModifiers.find((am) => am.modifier === code)!)
}

/**
 * Checks for conflicts in a set of applied modifiers
 * @param appliedModifiers Array of applied modifiers to check
 * @returns Object with conflicts information
 */
export function checkAppliedModifierConflicts(appliedModifiers: AppliedModifier[]): {
  hasConflicts: boolean
  conflicts: Array<{
    modifier1: string
    modifier2: string
    explanation: string
  }>
} {
  const modifierCodes = appliedModifiers.map((am) => am.modifier)
  const { hasConflicts, conflicts } = checkModifierConflicts(modifierCodes)

  if (!hasConflicts) {
    return { hasConflicts: false, conflicts: [] }
  }

  // Add explanations to conflicts
  const conflictsWithExplanations = conflicts.map((conflict) => ({
    ...conflict,
    explanation: getConflictExplanation(conflict.modifier1, conflict.modifier2),
  }))

  return {
    hasConflicts: true,
    conflicts: conflictsWithExplanations,
  }
}

/**
 * Checks if the modifiers are in the correct sequence
 * @param appliedModifiers Array of applied modifiers to check
 * @returns Object with sequencing information
 */
export function checkModifierSequencing(appliedModifiers: AppliedModifier[]): {
  isCorrectSequence: boolean
  correctSequence: AppliedModifier[]
} {
  if (appliedModifiers.length <= 1) {
    return { isCorrectSequence: true, correctSequence: appliedModifiers }
  }

  const correctSequence = sequenceAppliedModifiers(appliedModifiers)
  const currentSequence = appliedModifiers.map((am) => am.modifier).join(",")
  const properSequence = correctSequence.map((am) => am.modifier).join(",")

  return {
    isCorrectSequence: currentSequence === properSequence,
    correctSequence,
  }
}

/**
 * Finds the procedure code with the lowest RVU from a list of codes
 * @param procedureCodes Array of procedure codes
 * @returns The procedure code with the lowest RVU
 */
export function getLowestRVUCode(procedureCodes: EnhancedProcedureCode[]): EnhancedProcedureCode | null {
  if (!procedureCodes || procedureCodes.length === 0) return null

  // Filter out add-on codes as they should not receive modifier 51
  // Note: In the new type system, we check if the code has addOnLinked codes
  const nonAddOnCodes = procedureCodes.filter((code) => !code.addOnLinked || code.addOnLinked.length === 0);

  if (nonAddOnCodes.length === 0) return null

  // Sort by RVU in ascending order
  // Note: In the new type system, RVU is in the rvu object
  const sortedCodes = [...nonAddOnCodes].sort((a, b) => {
    const rvuA = a.rvu?.work || 0;
    const rvuB = b.rvu?.work || 0;
    return rvuA - rvuB;
  });

  // Return the code with the lowest RVU
  return sortedCodes[0]
}

/**
 * Validates if modifier 51 can be applied to a procedure code based on RVU
 * @param procedureCode The procedure code to check
 * @param allProcedureCodes All procedure codes in the case
 * @returns Validation result
 */
export function validateModifier51Placement(
  procedureCode: EnhancedProcedureCode,
  allProcedureCodes: EnhancedProcedureCode[],
): {
  isValid: boolean
  reason?: string
} {
  // If there's only one procedure code, modifier 51 is not needed
  if (allProcedureCodes.length <= 1) {
    return {
      isValid: false,
      reason: "Modifier 51 is not needed when only one procedure is reported.",
    }
  }

  // Check if this is an add-on code
  // Note: In the new type system, we check if the code has addOnLinked codes
  const isAddOnCode = procedureCode.addOnLinked && procedureCode.addOnLinked.length > 0;
  if (isAddOnCode) {
    return {
      isValid: false,
      reason: "Modifier 51 cannot be applied to add-on codes.",
    }
  }

  // Get the code with the lowest RVU
  const lowestRVUCode = getLowestRVUCode(allProcedureCodes)

  // If this is not the code with the lowest RVU, it should not get modifier 51
  if (lowestRVUCode && lowestRVUCode.code !== procedureCode.code) {
    return {
      isValid: false,
      reason: `Modifier 51 should only be applied to the code with the lowest RVU (${lowestRVUCode.code}).`,
    }
  }

  return { isValid: true }
}