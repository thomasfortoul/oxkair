/**
 * Modifier Conflict and Sequencing Rules
 *
 * This file contains comprehensive rules for:
 * 1. Mutually exclusive modifiers
 * 2. Modifier sequencing logic
 * 3. Special sequencing combinations
 */

/**
 * Mutually exclusive modifier pairs
 * These modifiers cannot be used together on the same procedure code
 */
export const MUTUALLY_EXCLUSIVE_MODIFIERS: [string, string][] = [
  // Anatomical location conflicts
  ["RT", "LT"], // Right side vs Left side
  ["RT", "50"], // Right side vs Bilateral
  ["LT", "50"], // Left side vs Bilateral
  ["E1", "E3"], // Upper left eyelid vs Upper right eyelid
  ["E2", "E4"], // Lower left eyelid vs Lower right eyelid
  ["FA", "F5"], // Right thumb vs Left thumb
  ["TA", "T5"], // Left great toe vs Right great toe

  // Service type conflicts
  ["26", "TC"], // Professional component vs Technical component
  ["52", "53"], // Reduced services vs Discontinued procedure
  ["54", "55"], // Surgical care only vs Postoperative management only
  ["54", "56"], // Surgical care only vs Preoperative management only
  ["55", "56"], // Postoperative management only vs Preoperative management only

  // Assistant surgeon conflicts
  ["80", "81"], // Assistant surgeon vs Minimum assistant surgeon
  ["80", "82"], // Assistant surgeon vs Assistant surgeon (when qualified resident not available)
  ["81", "82"], // Minimum assistant surgeon vs Assistant surgeon (when qualified resident not available)
  ["80", "AS"], // Assistant surgeon vs PA, NP, or CNS services for assistant at surgery
  ["81", "AS"], // Minimum assistant surgeon vs PA, NP, or CNS services for assistant at surgery
  ["82", "AS"], // Assistant surgeon (when qualified resident not available) vs PA, NP, or CNS services

  // Surgeon role conflicts
  ["62", "66"], // Two surgeons vs Surgical team
  ["62", "80"], // Two surgeons vs Assistant surgeon
  ["62", "81"], // Two surgeons vs Minimum assistant surgeon
  ["62", "82"], // Two surgeons vs Assistant surgeon (when qualified resident not available)
  ["66", "80"], // Surgical team vs Assistant surgeon
  ["66", "81"], // Surgical team vs Minimum assistant surgeon
  ["66", "82"], // Surgical team vs Assistant surgeon (when qualified resident not available)

  // Repeat procedure conflicts
  ["76", "77"], // Repeat procedure by same physician vs Repeat procedure by different physician

  // Global period conflicts
  ["58", "78"], // Staged/related procedure vs Unplanned return to OR
  ["58", "79"], // Staged/related procedure vs Unrelated procedure
  ["78", "79"], // Unplanned return to OR vs Unrelated procedure

  // NCCI edit bypass conflicts (use only one)
  ["59", "XE"], // Distinct procedural service vs Separate encounter
  ["59", "XP"], // Distinct procedural service vs Separate practitioner
  ["59", "XS"], // Distinct procedural service vs Separate structure
  ["59", "XU"], // Distinct procedural service vs Unusual non-overlapping service
  ["XE", "XP"], // Separate encounter vs Separate practitioner
  ["XE", "XS"], // Separate encounter vs Separate structure
  ["XE", "XU"], // Separate encounter vs Unusual non-overlapping service
  ["XP", "XS"], // Separate practitioner vs Separate structure
  ["XP", "XU"], // Separate practitioner vs Unusual non-overlapping service
  ["XS", "XU"], // Separate structure vs Unusual non-overlapping service

  // Telehealth conflicts
  ["95", "GT"], // Synchronous telemedicine vs Interactive audio and video telecommunication

  // E/M conflicts
  ["24", "25"], // Unrelated E/M during postoperative period vs Significant, separately identifiable E/M

  // ABN conflicts
  ["GX", "GZ"], // Notice of liability issued, voluntary vs Item/service expected to be denied
]

/**
 * Modifier categories for sequencing
 */
export enum ModifierCategory {
  PRICING = 1, // Highest priority
  PAYMENT = 2,
  LOCATION = 3,
  INFORMATIONAL = 4, // Lowest priority
}

/**
 * Mapping of modifiers to their categories for sequencing
 */
export const MODIFIER_CATEGORY_MAP: Record<string, ModifierCategory> = {
  // PRICING MODIFIERS (affect reimbursement amount)
  "21": ModifierCategory.PRICING, // Prolonged E/M service
  "22": ModifierCategory.PRICING, // Increased procedural service
  "23": ModifierCategory.PRICING, // Unusual anesthesia
  "26": ModifierCategory.PRICING, // Professional component
  "50": ModifierCategory.PRICING, // Bilateral procedure
  "52": ModifierCategory.PRICING, // Reduced services
  "53": ModifierCategory.PRICING, // Discontinued procedure
  "54": ModifierCategory.PRICING, // Surgical care only
  "55": ModifierCategory.PRICING, // Postoperative management only
  "56": ModifierCategory.PRICING, // Preoperative management only
  "60": ModifierCategory.PRICING, // Altered surgical field
  "62": ModifierCategory.PRICING, // Two surgeons
  "63": ModifierCategory.PRICING, // Procedure on infants <4kg
  "66": ModifierCategory.PRICING, // Surgical team
  "80": ModifierCategory.PRICING, // Assistant surgeon
  "81": ModifierCategory.PRICING, // Minimum assistant surgeon
  "82": ModifierCategory.PRICING, // Assistant surgeon (when qualified resident not available)
  AS: ModifierCategory.PRICING, // PA, NP, or CNS services for assistant at surgery
  TC: ModifierCategory.PRICING, // Technical component
  P1: ModifierCategory.PRICING, // Normal healthy patient
  P2: ModifierCategory.PRICING, // Patient with mild systemic disease
  P3: ModifierCategory.PRICING, // Patient with severe systemic disease
  P4: ModifierCategory.PRICING, // Patient with severe systemic disease that is a constant threat to life
  P5: ModifierCategory.PRICING, // Moribund patient who is not expected to survive
  P6: ModifierCategory.PRICING, // Declared brain-dead patient

  // PAYMENT MODIFIERS (communicate that something special has occurred)
  "24": ModifierCategory.PAYMENT, // Unrelated E/M during postoperative period
  "25": ModifierCategory.PAYMENT, // Significant, separately identifiable E/M service
  "27": ModifierCategory.PAYMENT, // Multiple same-date outpatient hospital E/M
  "51": ModifierCategory.PAYMENT, // Multiple procedures
  "57": ModifierCategory.PAYMENT, // Decision for surgery
  "58": ModifierCategory.PAYMENT, // Staged/related procedure
  "59": ModifierCategory.PAYMENT, // Distinct procedural service
  "76": ModifierCategory.PAYMENT, // Repeat procedure by same physician
  "77": ModifierCategory.PAYMENT, // Repeat procedure by different physician
  "78": ModifierCategory.PAYMENT, // Unplanned return to OR
  "79": ModifierCategory.PAYMENT, // Unrelated procedure
  "91": ModifierCategory.PAYMENT, // Repeat lab test
  XE: ModifierCategory.PAYMENT, // Separate encounter
  XP: ModifierCategory.PAYMENT, // Separate practitioner
  XS: ModifierCategory.PAYMENT, // Separate structure
  XU: ModifierCategory.PAYMENT, // Unusual non-overlapping service

  // LOCATION MODIFIERS (anatomical site)
  RT: ModifierCategory.LOCATION, // Right side
  LT: ModifierCategory.LOCATION, // Left side
  E1: ModifierCategory.LOCATION, // Upper left eyelid
  E2: ModifierCategory.LOCATION, // Lower left eyelid
  E3: ModifierCategory.LOCATION, // Upper right eyelid
  E4: ModifierCategory.LOCATION, // Lower right eyelid
  FA: ModifierCategory.LOCATION, // Thumb (right hand)
  F1: ModifierCategory.LOCATION, // Index finger (left hand)
  F2: ModifierCategory.LOCATION, // Middle finger (left hand)
  F3: ModifierCategory.LOCATION, // Ring finger (left hand)
  F4: ModifierCategory.LOCATION, // Little finger (left hand)
  F5: ModifierCategory.LOCATION, // Thumb (left hand)
  F6: ModifierCategory.LOCATION, // Index finger (right hand)
  F7: ModifierCategory.LOCATION, // Middle finger (right hand)
  F8: ModifierCategory.LOCATION, // Ring finger (right hand)
  F9: ModifierCategory.LOCATION, // Little finger (right hand)
  TA: ModifierCategory.LOCATION, // Great toe (left foot)
  T1: ModifierCategory.LOCATION, // Second digit (left foot)
  T2: ModifierCategory.LOCATION, // Third digit (left foot)
  T3: ModifierCategory.LOCATION, // Fourth digit (left foot)
  T4: ModifierCategory.LOCATION, // Fifth digit (left foot)
  T5: ModifierCategory.LOCATION, // Great toe (right foot)
  T6: ModifierCategory.LOCATION, // Second digit (right foot)
  T7: ModifierCategory.LOCATION, // Third digit (right foot)
  T8: ModifierCategory.LOCATION, // Fourth digit (right foot)
  T9: ModifierCategory.LOCATION, // Fifth digit (right foot)
  LC: ModifierCategory.LOCATION, // Left circumflex coronary artery
  LD: ModifierCategory.LOCATION, // Left anterior descending coronary artery
  RC: ModifierCategory.LOCATION, // Right coronary artery
  LM: ModifierCategory.LOCATION, // Left main coronary artery
  RI: ModifierCategory.LOCATION, // Ramus intermedius coronary artery

  // INFORMATIONAL MODIFIERS (documentation or billing only)
  GC: ModifierCategory.INFORMATIONAL, // Resident involvement
  GV: ModifierCategory.INFORMATIONAL, // Attending physician not employed by hospice
  GW: ModifierCategory.INFORMATIONAL, // Service not related to terminal condition
  GX: ModifierCategory.INFORMATIONAL, // Notice of liability issued, voluntary
  GY: ModifierCategory.INFORMATIONAL, // Item/service statutorily excluded
  GZ: ModifierCategory.INFORMATIONAL, // Item/service expected to be denied
  JW: ModifierCategory.INFORMATIONAL, // Drug amount discarded/not administered
  KX: ModifierCategory.INFORMATIONAL, // Requirements in medical policy have been met
  PT: ModifierCategory.INFORMATIONAL, // Colorectal screening converted to diagnostic
  QW: ModifierCategory.INFORMATIONAL, // CLIA waived test
  XTS: ModifierCategory.INFORMATIONAL, // Medicaid 6+ Hour Surgery
  "33": ModifierCategory.INFORMATIONAL, // Preventive service
  "95": ModifierCategory.INFORMATIONAL, // Synchronous telemedicine service
  GT: ModifierCategory.INFORMATIONAL, // Via interactive audio and video telecommunication
}

/**
 * Special sequencing rules for specific modifier combinations
 * These override the default category-based sequencing
 * Based on Sherri's documentation and industry standards
 */
export const SPECIAL_SEQUENCING_RULES: Record<string, string[]> = {
  // Format: "ModifierA-ModifierB": [correct sequence]
  // Special combinations from Sherri's documentation
  "22-62": ["22", "62"], // Increased procedural service + Two surgeons
  "22-50": ["22", "50"], // Increased procedural service + Bilateral procedure
  "62-78": ["78", "62"], // Two surgeons + Unplanned return to OR (global period exception)
  "63-78": ["78", "63"], // Procedure on infants + Unplanned return to OR (global period exception)
  "63-79": ["79", "63"], // Procedure on infants + Unrelated procedure (global period exception)
  "22-63": ["22", "63"], // Increased procedural service + Procedure on infants
  "62-51": ["62", "51"], // Two surgeons + Multiple procedures
  "50-62": ["50", "62"], // Bilateral procedure + Two surgeons
  "50-78": ["78", "50"], // Bilateral procedure + Unplanned return to OR (global period exception)
  "50-79": ["79", "50"], // Bilateral procedure + Unrelated procedure (global period exception)
  "82-51": ["82", "51"], // Assistant surgeon + Multiple procedures
  "50-82": ["50", "82"], // Bilateral procedure + Assistant surgeon
  "63-82": ["63", "82"], // Procedure on infants + Assistant surgeon
  "22-78": ["78", "22"], // Increased procedural service + Unplanned return to OR (global period exception)
  "82-59": ["82", "59"], // Assistant surgeon + Distinct procedural service

  // Additional common special cases
  "50-LT": ["50"], // Bilateral procedure overrides LT (left side)
  "50-RT": ["50"], // Bilateral procedure overrides RT (right side)
  "80-AS": ["80"], // Assistant surgeon overrides PA/NP assistant
  "59-XE": ["XE"], // Prefer more specific X{EPSU} modifiers over 59
  "59-XP": ["XP"],
  "59-XS": ["XS"],
  "59-XU": ["XU"],
}

/**
 * Checks if two modifiers are mutually exclusive
 * @param modifier1 First modifier
 * @param modifier2 Second modifier
 * @returns True if the modifiers are mutually exclusive
 */
export function areModifiersExclusive(modifier1: string, modifier2: string): boolean {
  return MUTUALLY_EXCLUSIVE_MODIFIERS.some(
    ([mod1, mod2]) => (mod1 === modifier1 && mod2 === modifier2) || (mod1 === modifier2 && mod2 === modifier1),
  )
}

/**
 * Gets the category for a modifier
 * @param modifier The modifier
 * @returns The modifier category
 */
export function getModifierCategory(modifier: string): ModifierCategory {
  return MODIFIER_CATEGORY_MAP[modifier] || ModifierCategory.INFORMATIONAL
}

/**
 * Sorts modifiers according to sequencing rules
 * @param modifiers Array of modifiers to sort
 * @returns Sorted array of modifiers
 */
export function sortModifiersBySequencingRules(modifiers: string[]): string[] {
  if (modifiers.length <= 1) return modifiers

  // Check for special sequencing rules first
  for (const [combo, sequence] of Object.entries(SPECIAL_SEQUENCING_RULES)) {
    const [mod1, mod2] = combo.split("-")
    if (modifiers.includes(mod1) && modifiers.includes(mod2)) {
      // If we have a special rule for these two modifiers, apply it
      // and remove these modifiers from the list to be sorted
      const remainingModifiers = modifiers.filter((m) => m !== mod1 && m !== mod2)

      // Sort the remaining modifiers and combine with the special sequence
      const sortedRemaining = sortModifiersByCategory(remainingModifiers)
      return [...sequence, ...sortedRemaining]
    }
  }

  // If no special rules apply, sort by category
  return sortModifiersByCategory(modifiers)
}

/**
 * Sorts modifiers by category
 * @param modifiers Array of modifiers to sort
 * @returns Sorted array of modifiers
 */
function sortModifiersByCategory(modifiers: string[]): string[] {
  return [...modifiers].sort((a, b) => {
    const catA = getModifierCategory(a)
    const catB = getModifierCategory(b)
    return catA - catB
  })
}

/**
 * Checks for conflicts in a set of modifiers
 * @param modifiers Array of modifiers to check
 * @returns Object with conflicts information
 */
export function checkModifierConflicts(modifiers: string[]): {
  hasConflicts: boolean
  conflicts: Array<{ modifier1: string; modifier2: string }>
} {
  const conflicts: Array<{ modifier1: string; modifier2: string }> = []

  // Check each pair of modifiers for conflicts
  for (let i = 0; i < modifiers.length; i++) {
    for (let j = i + 1; j < modifiers.length; j++) {
      if (areModifiersExclusive(modifiers[i], modifiers[j])) {
        conflicts.push({
          modifier1: modifiers[i],
          modifier2: modifiers[j],
        })
      }
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  }
}

/** Convenience wrapper used by policy helpers */
export function sequenceModifierCodes(modifiers: string[]): string[] {
  return sortModifiersBySequencingRules(modifiers)
}

/**
 * Gets a human-readable explanation for why two modifiers conflict
 * @param modifier1 First modifier
 * @param modifier2 Second modifier
 * @returns Explanation string
 */
export function getConflictExplanation(modifier1: string, modifier2: string): string {
  // Anatomical location conflicts
  if ((modifier1 === "RT" && modifier2 === "LT") || (modifier1 === "LT" && modifier2 === "RT")) {
    return "A procedure cannot be performed on both the right and left sides simultaneously when reported with a single code."
  }

  if (
    (modifier1 === "50" && (modifier2 === "RT" || modifier2 === "LT")) ||
    (modifier2 === "50" && (modifier1 === "RT" || modifier1 === "LT"))
  ) {
    return "Modifier 50 (Bilateral) cannot be used with RT or LT modifiers. Use modifier 50 alone for bilateral procedures."
  }

  if ((modifier1 === "E1" && modifier2 === "E3") || (modifier1 === "E3" && modifier2 === "E1")) {
    return "Cannot report both upper left eyelid (E1) and upper right eyelid (E3) with a single code."
  }

  if ((modifier1 === "E2" && modifier2 === "E4") || (modifier1 === "E4" && modifier2 === "E2")) {
    return "Cannot report both lower left eyelid (E2) and lower right eyelid (E4) with a single code."
  }

  // Service type conflicts
  if ((modifier1 === "26" && modifier2 === "TC") || (modifier1 === "TC" && modifier2 === "26")) {
    return "Cannot report both professional component (26) and technical component (TC) on the same code."
  }

  if ((modifier1 === "52" && modifier2 === "53") || (modifier1 === "53" && modifier2 === "52")) {
    return "Cannot report both reduced services (52) and discontinued procedure (53) on the same code."
  }

  // Surgeon role conflicts
  if ((modifier1 === "62" && modifier2 === "66") || (modifier1 === "66" && modifier2 === "62")) {
    return "Cannot report both two surgeons (62) and surgical team (66) on the same code."
  }

  if (
    (modifier1 === "62" && ["80", "81", "82", "AS"].includes(modifier2)) ||
    (modifier2 === "62" && ["80", "81", "82", "AS"].includes(modifier1))
  ) {
    return "Cannot report both co-surgeon (62) and assistant surgeon modifiers on the same code."
  }

  // Assistant surgeon conflicts
  if (["80", "81", "82", "AS"].includes(modifier1) && ["80", "81", "82", "AS"].includes(modifier2)) {
    return "Cannot report multiple assistant surgeon modifiers on the same code."
  }

  // Repeat procedure conflicts
  if ((modifier1 === "76" && modifier2 === "77") || (modifier1 === "77" && modifier2 === "76")) {
    return "Cannot report both repeat by same physician (76) and repeat by different physician (77) on the same code."
  }

  // Global period conflicts
  if (["58", "78", "79"].includes(modifier1) && ["58", "78", "79"].includes(modifier2)) {
    return "Cannot report multiple global period modifiers on the same code."
  }

  // NCCI edit bypass conflicts
  if (["59", "XE", "XP", "XS", "XU"].includes(modifier1) && ["59", "XE", "XP", "XS", "XU"].includes(modifier2)) {
    return "Cannot report multiple NCCI edit bypass modifiers on the same code. Use the most specific X{EPSU} modifier."
  }

  // Telehealth conflicts
  if ((modifier1 === "95" && modifier2 === "GT") || (modifier1 === "GT" && modifier2 === "95")) {
    return "Cannot report both synchronous telemedicine (95) and interactive audio/video telecommunication (GT) on the same code."
  }

  // E/M conflicts
  if ((modifier1 === "24" && modifier2 === "25") || (modifier1 === "25" && modifier2 === "24")) {
    return "Cannot report both unrelated E/M during postoperative period (24) and significant, separately identifiable E/M (25) on the same code."
  }

  // ABN conflicts
  if ((modifier1 === "GX" && modifier2 === "GZ") || (modifier1 === "GZ" && modifier2 === "GX")) {
    return "Cannot report both voluntary notice of liability (GX) and expected denial (GZ) on the same code."
  }

  // Default explanation
  return `Modifiers ${modifier1} and ${modifier2} are mutually exclusive and cannot be used together.`
}

/**
 * Gets a human-readable explanation for a special sequencing rule
 * @param modifier1 First modifier
 * @param modifier2 Second modifier
 * @returns Explanation string
 */
export function getSequencingExplanation(modifier1: string, modifier2: string): string {
  const combo = `${modifier1}-${modifier2}`
  const reverseCombo = `${modifier2}-${modifier1}`

  if (SPECIAL_SEQUENCING_RULES[combo]) {
    const sequence = SPECIAL_SEQUENCING_RULES[combo]
    return `Modifiers ${sequence.join(", ")} should be sequenced in this order.`
  }

  if (SPECIAL_SEQUENCING_RULES[reverseCombo]) {
    const sequence = SPECIAL_SEQUENCING_RULES[reverseCombo]
    return `Modifiers ${sequence.join(", ")} should be sequenced in this order.`
  }

  // Default to category-based explanation
  const cat1 = getModifierCategory(modifier1)
  const cat2 = getModifierCategory(modifier2)

  if (cat1 < cat2) {
    return `Modifier ${modifier1} (${ModifierCategory[cat1]}) should come before ${modifier2} (${ModifierCategory[cat2]}).`
  } else if (cat2 < cat1) {
    return `Modifier ${modifier2} (${ModifierCategory[cat2]}) should come before ${modifier1} (${ModifierCategory[cat1]}).`
  } else {
    return `Modifiers ${modifier1} and ${modifier2} are in the same category (${ModifierCategory[cat1]}).`
  }
}