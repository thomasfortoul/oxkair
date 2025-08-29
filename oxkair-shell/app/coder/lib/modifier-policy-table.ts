/**
 * Modifier Policy Table
 *
 * This file defines the policy-driven rules for modifier application to CPT/HCPCS codes.
 * It serves as a centralized configuration for allowed modifiers, exempt modifiers,
 * and documentation requirements for specific code ranges or individual codes.
 */
import { sortModifiersBySequencingRules } from './modifier-conflict-sequencing'

/**
 * Modifier categories based on industry standards
 */
export const MODIFIER_CATEGORIES = {
  PRICING: ["22", "26", "50", "52", "53", "54", "55", "56", "62", "63", "66", "80", "81", "82", "TC"],
  PAYMENT_ELIGIBLE: ["25", "51", "57", "58", "59", "76", "77", "78", "79", "XE", "XP", "XS", "XU", "91"],
  LOCATION: [
    "RT",
    "LT",
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
    "LC",
    "LD",
    "RC",
    "LM",
    "RI",
  ],
  INFORMATIONAL: ["GC", "GW", "GV", "GX", "GY", "GZ", "JW", "KX", "QW", "XTS", "33", "95", "GT"],
}

/**
 * Modifier sequence rules based on Medicare guidelines
 */
export const MODIFIER_SEQUENCE_RULES = {
  // Pricing modifiers must come first
  FIRST_POSITION: MODIFIER_CATEGORIES.PRICING,
  // Informational modifiers come after pricing modifiers
  SECOND_POSITION: [
    ...MODIFIER_CATEGORIES.PAYMENT_ELIGIBLE,
    ...MODIFIER_CATEGORIES.LOCATION,
    ...MODIFIER_CATEGORIES.INFORMATIONAL,
  ],
}

/**
 * Interface for a single policy rule entry
 */
export interface ModifierPolicyRule {
  /** CPT/HCPCS code or code range (e.g., "29800-29999" for a range) */
  codePattern: string

  /** Description of the code or code range for reference */
  description: string

  /** List of modifiers explicitly allowed for this code/range */
  allowedModifiers: string[]

  /** List of modifiers explicitly forbidden for this code/range */
  exemptModifiers: string[]

  /** Special documentation requirements for specific modifiers with this code */
  documentationRequirements?: Record<string, string>

  /** Whether bilateral modifier (50) is allowed */
  bilateralAllowed?: boolean

  /** Whether this is an add-on code */
  isAddOnCode?: boolean

  /** Whether this is an unlisted code */
  isUnlistedCode?: boolean

  /** Global period in days (0, 10, or 90) */
  globalPeriod?: number

  /** Parent code required (for add-on codes) */
  requiresParentCode?: string

  /** Fee adjustment rules for specific modifiers */
  feeAdjustments?: Record<string, string>

  /** Payer-specific rules */
  payerRules?: Record<
    string,
    {
      allowedModifiers?: string[]
      exemptModifiers?: string[]
      documentationRequirements?: Record<string, string>
    }
  >

  /** PC/TC indicator (0-9) for professional/technical component split */
  pcTcIndicator?: number

  /** Multiple procedure indicator (0-9) for multiple procedure payment rules */
  multipleProceduralIndicator?: number

  /** Bilateral surgery indicator (0-9) for bilateral procedure payment rules */
  bilateralSurgeryIndicator?: number

  /** Assistant surgery indicator (0-9) for assistant surgery payment rules */
  assistantSurgeryIndicator?: number

  /** Co-surgery indicator (0-9) for co-surgery payment rules */
  coSurgeryIndicator?: number

  /** Team surgery indicator (0-9) for team surgery payment rules */
  teamSurgeryIndicator?: number
}

/**
 * The main policy table - an array of policy rules
 */
export const MODIFIER_POLICY_TABLE: ModifierPolicyRule[] = [
  // Arthroscopy procedures (29800-29999)
  {
    codePattern: "29800-29999",
    description: "Arthroscopy procedures",
    allowedModifiers: [
      "22",
      "23",
      "50",
      "51",
      "52",
      "59",
      "62",
      "66",
      "78",
      "79",
      "80",
      "81",
      "82",
      "RT",
      "LT",
      "XE",
      "XS",
      "XP",
      "XU",
    ],
    exemptModifiers: ["53", "54", "55", "56", "57"],
    bilateralAllowed: true,
    globalPeriod: 90,
    documentationRequirements: {
      "22": "Detailed documentation of increased complexity, time, or difficulty. Special form required for Medicare.",
      "62": "Co-surgeon statement and documentation required",
    },
    feeAdjustments: {
      "50": "150% of base rate",
      "62": "62.5% of base rate (each surgeon)",
    },
  },

  // Unlisted arthroscopy procedure (29999)
  {
    codePattern: "29999",
    description: "Unlisted arthroscopy procedure",
    allowedModifiers: ["62", "82", "80", "81", "AS", "59", "XE", "XP", "XS", "XU", "RT", "LT"],
    exemptModifiers: ["22", "51", "50", "52", "53"],
    isUnlistedCode: true,
    globalPeriod: 0,
    documentationRequirements: {
      "62": "Co-surgeon statement and documentation required",
      "82": "Assistant surgeon attestation form (especially for Medicare)",
    },
  },

  // Add-on code example (33508)
  {
    codePattern: "33508",
    description:
      "Endoscopy, surgical, including video-assisted harvest of vein(s) for coronary artery bypass procedure",
    allowedModifiers: ["62", "80", "81", "82", "XE", "XP", "XS", "XU"],
    exemptModifiers: ["51", "50", "22", "52", "53", "58", "78", "79", "76", "77"],
    isAddOnCode: true,
    requiresParentCode: "33510-33523",
    documentationRequirements: {
      "62": "Co-surgeon statement and documentation required",
    },
  },

  // Orthopedic procedures (20000-29999)
  {
    codePattern: "20000-29999",
    description: "Orthopedic procedures",
    allowedModifiers: [
      "22",
      "50",
      "51",
      "52",
      "59",
      "62",
      "66",
      "78",
      "79",
      "80",
      "81",
      "82",
      "RT",
      "LT",
      "XE",
      "XS",
      "XP",
      "XU",
    ],
    exemptModifiers: [],
    globalPeriod: 90,
    documentationRequirements: {
      "22": "Detailed documentation of increased complexity, time, or difficulty. Special form required for Medicare.",
    },
  },

  // Neonatal intensive care (99468-99469)
  {
    codePattern: "99468-99469",
    description: "Neonatal intensive care",
    allowedModifiers: ["63", "25", "57", "GC"],
    exemptModifiers: ["50", "51", "52", "53"],
    documentationRequirements: {
      "63": "Documentation that infant is less than 4kg",
      GC: "Documentation of resident involvement and attending supervision",
    },
    feeAdjustments: {
      "63": "125% of base rate",
    },
  },

  // E/M codes (99201-99499)
  {
    codePattern: "99201-99499",
    description: "Evaluation and Management services",
    allowedModifiers: ["24", "25", "57", "GC", "XE", "XP", "XS", "XU"],
    exemptModifiers: ["50", "51", "52", "53", "62", "80", "81", "82"],
    documentationRequirements: {
      "25": "Documentation of significant, separately identifiable E/M service",
      GC: "Documentation of resident involvement and attending supervision",
    },
  },

  // Bilateral-eligible procedures
  {
    codePattern: "27130",
    description: "Total hip arthroplasty",
    allowedModifiers: [
      "22",
      "50",
      "51",
      "52",
      "59",
      "62",
      "66",
      "78",
      "79",
      "80",
      "81",
      "82",
      "RT",
      "LT",
      "XE",
      "XS",
      "XP",
      "XU",
    ],
    exemptModifiers: [],
    bilateralAllowed: true,
    globalPeriod: 90,
    feeAdjustments: {
      "50": "150% of base rate",
      "62": "62.5% of base rate (each surgeon)",
    },
  },

  // Bilateral-ineligible procedures
  {
    codePattern: "22551",
    description: "Arthrodesis, anterior interbody, cervical",
    allowedModifiers: ["22", "51", "52", "59", "62", "66", "78", "79", "80", "81", "82", "XE", "XS", "XP", "XU"],
    exemptModifiers: ["50"],
    bilateralAllowed: false,
    globalPeriod: 90,
  },

  // Medicaid-specific rules
  {
    codePattern: "47562-47620",
    description: "Laparoscopic cholecystectomy procedures",
    allowedModifiers: ["22", "51", "52", "53", "59", "62", "66", "78", "79", "80", "81", "82", "XE", "XS", "XP", "XU"],
    exemptModifiers: ["50"],
    globalPeriod: 90,
    payerRules: {
      Medicaid: {
        allowedModifiers: [
          "22",
          "51",
          "52",
          "53",
          "59",
          "62",
          "66",
          "78",
          "79",
          "80",
          "81",
          "82",
          "XE",
          "XS",
          "XP",
          "XU",
          "XTS",
        ],
        documentationRequirements: {
          XTS: "Documentation that surgery lasted more than 6 hours",
        },
      },
    },
  },
  // E/M codes with 25 modifier
  {
    codePattern: "99201-99499",
    description: "Evaluation and Management services",
    allowedModifiers: ["24", "25", "27", "57", "GC", "XE", "XP", "XS", "XU", "33", "95", "GT", "GW", "GV"],
    exemptModifiers: ["50", "51", "52", "53", "54", "55", "56", "62", "66", "76", "77", "80", "81", "82", "TC"],
    documentationRequirements: {
      "25": "Documentation must clearly show that the provider performed extra E/M work beyond the usual work required for the other procedure or service on the same date.",
      "57": "Documentation must support that this was a decision for major surgery (90-day global period).",
      GC: "Documentation of resident involvement and attending supervision",
      GW: "Documentation that service is not related to the hospice patient's terminal condition",
      GV: "Documentation that provider is the attending physician not employed by hospice",
    },
  },

  // Colonoscopy procedures with special modifier rules
  {
    codePattern: "45378-45398",
    description: "Colonoscopy procedures",
    allowedModifiers: [
      "22",
      "52",
      "53",
      "58",
      "59",
      "73",
      "74",
      "76",
      "77",
      "78",
      "79",
      "XE",
      "XP",
      "XS",
      "XU",
      "PT",
      "33",
    ],
    exemptModifiers: ["50", "63"],
    documentationRequirements: {
      "53": "Documentation of the reason for termination of the procedure due to extenuating circumstances",
      "73": "Documentation of discontinuation prior to anesthesia (facility only)",
      "74": "Documentation of discontinuation after anesthesia (facility only)",
      "33": "Documentation that this was a preventive service",
    },
    pcTcIndicator: 0, // Global service only
    globalPeriod: 0,
  },

  // Radiology procedures with PC/TC split
  {
    codePattern: "70000-79999",
    description: "Radiology procedures",
    allowedModifiers: ["26", "TC", "50", "52", "59", "XE", "XP", "XS", "XU", "RT", "LT"],
    exemptModifiers: ["53", "63"],
    pcTcIndicator: 1, // Diagnostic tests with professional and technical components
    documentationRequirements: {
      "26": "Documentation of the professional interpretation and report",
      TC: "Documentation of the technical component",
    },
  },

  // Hospice-related services
  {
    codePattern: "99490-99491",
    description: "Chronic Care Management services",
    allowedModifiers: ["GV", "GW"],
    exemptModifiers: [],
    documentationRequirements: {
      GV: "Documentation that provider is the attending physician not employed by hospice",
      GW: "Documentation that service is not related to the hospice patient's terminal condition",
    },
  },

  // Telehealth services
  {
    codePattern: "99201-99499",
    description: "Telehealth-eligible E/M services",
    allowedModifiers: ["95", "GT"],
    exemptModifiers: [],
    documentationRequirements: {
      "95": "Documentation that service was rendered via real-time interactive audio and video telecommunications system",
      GT: "Documentation that service was rendered via interactive audio and video telecommunication systems (for institutional claims)",
    },
  },
]

/**
 * Checks if a CPT/HCPCS code matches a pattern (exact match or range)
 * @param code The code to check
 * @param pattern The pattern to match against (e.g., "29800-29999" or "29999")
 * @returns True if the code matches the pattern
 */
export function codeMatchesPattern(code: string, pattern: string): boolean {
  // Exact match
  if (pattern === code) {
    return true
  }

  // Range match (e.g., "29800-29999")
  if (pattern.includes("-")) {
    const [start, end] = pattern.split("-")
    const codeNum = Number.parseInt(code, 10)
    const startNum = Number.parseInt(start, 10)
    const endNum = Number.parseInt(end, 10)

    return codeNum >= startNum && codeNum <= endNum
  }

  return false
}

/**
 * Gets all policy rules that apply to a specific CPT/HCPCS code
 * @param code The CPT/HCPCS code to check
 * @returns Array of applicable policy rules
 */
export function getPolicyRulesForCode(code: string): ModifierPolicyRule[] {
  return MODIFIER_POLICY_TABLE.filter((rule) => codeMatchesPattern(code, rule.codePattern))
}

/**
 * Checks if a modifier is allowed for a specific CPT/HCPCS code
 * @param code The CPT/HCPCS code
 * @param modifier The modifier to check
 * @param payer Optional payer for payer-specific rules
 * @returns Object with isAllowed flag and reason
 */
export function isModifierAllowedForCode(
  code: string,
  modifier: string,
  payer?: string,
): { isAllowed: boolean; reason?: string } {
  const rules = getPolicyRulesForCode(code)

  if (rules.length === 0) {
    return { isAllowed: true, reason: "No specific policy rules found for this code" }
  }

  // Check each applicable rule
  for (const rule of rules) {
    // Check payer-specific rules first if payer is provided
    if (payer && rule.payerRules && rule.payerRules[payer]) {
      const payerRule = rule.payerRules[payer]

      if (payerRule.exemptModifiers && payerRule.exemptModifiers.includes(modifier)) {
        return {
          isAllowed: false,
          reason: `Modifier ${modifier} is explicitly forbidden for code ${code} with payer ${payer}`,
        }
      }

      if (payerRule.allowedModifiers && payerRule.allowedModifiers.includes(modifier)) {
        return { isAllowed: true }
      }
    }

    // Check general rules
    if (rule.exemptModifiers.includes(modifier)) {
      return {
        isAllowed: false,
        reason: `Modifier ${modifier} is explicitly forbidden for code ${code} (${rule.description})`,
      }
    }

    // Special case for bilateral modifier
    if (modifier === "50" && rule.bilateralAllowed === false) {
      return {
        isAllowed: false,
        reason: `Bilateral modifier (50) is not allowed for code ${code} (${rule.description})`,
      }
    }

    // Special case for add-on codes
    if (rule.isAddOnCode) {
      // Add-on codes should not use modifier 51
      if (modifier === "51") {
        return {
          isAllowed: false,
          reason: `Modifier 51 is not allowed for add-on code ${code}`,
        }
      }

      // Add-on codes should not use modifier 50 (use the code twice instead)
      if (modifier === "50") {
        return {
          isAllowed: false,
          reason: `Modifier 50 should not be used with add-on code ${code}. Report the code twice instead.`,
        }
      }
    }

    // Special case for unlisted codes
    if (rule.isUnlistedCode && !rule.allowedModifiers.includes(modifier)) {
      return {
        isAllowed: false,
        reason: `Modifier ${modifier} is not allowed for unlisted code ${code} (${rule.description})`,
      }
    }

    // Special case for PC/TC modifiers
    if ((modifier === "26" || modifier === "TC") && rule.pcTcIndicator) {
      if (rule.pcTcIndicator === 0) {
        return {
          isAllowed: false,
          reason: `Modifier ${modifier} is not allowed for code ${code} as it does not have a professional/technical component split`,
        }
      }
      if (rule.pcTcIndicator === 2 && modifier === "26") {
        return {
          isAllowed: false,
          reason: `Modifier 26 is not allowed for code ${code} as it is a professional component only`,
        }
      }
      if (rule.pcTcIndicator === 3 && modifier === "TC") {
        return {
          isAllowed: false,
          reason: `Modifier TC is not allowed for code ${code} as it is a technical component only`,
        }
      }
      if (rule.pcTcIndicator === 4) {
        return {
          isAllowed: false,
          reason: `Modifiers 26 and TC are not allowed for code ${code} as it is a global test only`,
        }
      }
    }

    if (rule.allowedModifiers.includes(modifier)) {
      return { isAllowed: true }
    }
  }

  // If we get here, no rule explicitly allowed the modifier
  return {
    isAllowed: false,
    reason: `Modifier ${modifier} is not in the allowed list for code ${code}`,
  }
}

/**
 * Gets documentation requirements for a specific code and modifier
 * @param code The CPT/HCPCS code
 * @param modifier The modifier
 * @param payer Optional payer for payer-specific requirements
 * @returns Documentation requirement string or undefined
 */
export function getDocumentationRequirement(code: string, modifier: string, payer?: string): string | undefined {
  const rules = getPolicyRulesForCode(code)

  for (const rule of rules) {
    // Check payer-specific requirements first
    if (payer && rule.payerRules && rule.payerRules[payer]?.documentationRequirements?.[modifier]) {
      return rule.payerRules[payer].documentationRequirements[modifier]
    }

    // Check general requirements
    if (rule.documentationRequirements && rule.documentationRequirements[modifier]) {
      return rule.documentationRequirements[modifier]
    }
  }

  return undefined
}

/**
 * Gets fee adjustment for a specific code and modifier
 * @param code The CPT/HCPCS code
 * @param modifier The modifier
 * @returns Fee adjustment string or undefined
 */
export function getFeeAdjustment(code: string, modifier: string): string | undefined {
  const rules = getPolicyRulesForCode(code)

  for (const rule of rules) {
    if (rule.feeAdjustments && rule.feeAdjustments[modifier]) {
      return rule.feeAdjustments[modifier]
    }
  }

  return undefined
}

/**
 * Gets all code properties from the policy table
 * @param code The CPT/HCPCS code
 * @returns Combined properties from all matching rules
 */
export function getCodeProperties(code: string): {
  isAddOnCode?: boolean
  isUnlistedCode?: boolean
  globalPeriod?: number
  bilateralAllowed?: boolean
  requiresParentCode?: string
  allowedModifiers: string[]
  exemptModifiers: string[]
  documentationRequirements: Record<string, string>
  feeAdjustments: Record<string, string>
} {
  const rules = getPolicyRulesForCode(code)

  // Default values
  const result = {
    isAddOnCode: undefined as boolean | undefined,
    isUnlistedCode: undefined as boolean | undefined,
    globalPeriod: undefined as number | undefined,
    bilateralAllowed: undefined as boolean | undefined,
    requiresParentCode: undefined as string | undefined,
    allowedModifiers: [] as string[],
    exemptModifiers: [] as string[],
    documentationRequirements: {} as Record<string, string>,
    feeAdjustments: {} as Record<string, string>,
  }

  // Combine all matching rules
  for (const rule of rules) {
    // For boolean/value properties, take the most specific one (assuming more specific rules come later)
    if (rule.isAddOnCode !== undefined) result.isAddOnCode = rule.isAddOnCode
    if (rule.isUnlistedCode !== undefined) result.isUnlistedCode = rule.isUnlistedCode
    if (rule.globalPeriod !== undefined) result.globalPeriod = rule.globalPeriod
    if (rule.bilateralAllowed !== undefined) result.bilateralAllowed = rule.bilateralAllowed
    if (rule.requiresParentCode !== undefined) result.requiresParentCode = rule.requiresParentCode

    // For arrays and objects, merge them
    result.allowedModifiers = [...new Set([...result.allowedModifiers, ...rule.allowedModifiers])]
    result.exemptModifiers = [...new Set([...result.exemptModifiers, ...rule.exemptModifiers])]

    if (rule.documentationRequirements) {
      result.documentationRequirements = {
        ...result.documentationRequirements,
        ...rule.documentationRequirements,
      }
    }

    if (rule.feeAdjustments) {
      result.feeAdjustments = {
        ...result.feeAdjustments,
        ...rule.feeAdjustments,
      }
    }
  }

  return result
}

/**
 * Gets the correct sequence for modifiers based on Medicare rules
 * @param modifiers Array of modifiers to sequence
 * @returns Properly sequenced array of modifiers
 */
export function getCorrectModifierSequence(modifiers: string[]): string[] {
  if (!modifiers || modifiers.length <= 1) return modifiers

  // Defer to the conflict/sequence helper which implements category-based
  // ordering and special sequencing rules defined by policy (e.g. 62-51, 50-RT).
  // Remove duplicates before sorting.
  return sortModifiersBySequencingRules([...new Set(modifiers)])
}