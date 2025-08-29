// /
//   Prompt templates for the Modifier Assignment Agent
//  /

import {
  StandardizedWorkflowState,
  ProcedureLineItem,
} from "../newtypes";
import {
  CCIResult,
} from "../../services/service-types";
import {
  PreVettedModifier,
  formatModifierForPrompt,
} from "../modifier-data-loader";

// /
//   Builds the prompt for Phase 1 modifier assignment (distinct-service modifiers) - BATCH VERSION
//  /
export const buildPhase1ModifierPrompt_Batch = (
  state: StandardizedWorkflowState,
  lineItems: (ProcedureLineItem & { allowedModifiers: PreVettedModifier[] })[],
  cciResult?: CCIResult,
): string => {
  const fullNoteText =
    [
      state.caseNotes.primaryNoteText,
      ...state.caseNotes.additionalNotes.map((note) => note.content),
    ]
      .filter(Boolean)
      .join("\n\n") || "N/A";

  const lineItemsContext = lineItems
    .map((item: any) => {
      const allowedModifiersText = item.allowedModifiers && item.allowedModifiers.length > 0
        ? `Allowed Compliance Modifiers: ${item.allowedModifiers.map((m: any) => m.code).join(", ")}`
        : "No compliance modifiers allowed for this procedure";
      
      // Include rationale and description for codes that need Phase 1 processing
      const rationale = item.phase1Rationale ? `Rationale: ${item.phase1Rationale}` : "";
      const description = item.procedureDescription ? `Description: ${item.procedureDescription}` : "";
      
      return `Line ID: ${item.lineId}
Procedure: ${item.procedureCode}
Units: ${item.units}
${description}
${rationale}
${allowedModifiersText}`;
    })
    .join("\n");

  // Generate applicable modifiers section with descriptions and guidance
  const applicableModifiersSection = (() => {
    const allModifiers = new Map<string, PreVettedModifier>();
    
    // Collect all unique modifiers across all line items
    lineItems.forEach(item => {
      item.allowedModifiers.forEach(modifier => {
        allModifiers.set(modifier.code, modifier);
      });
    });

    if (allModifiers.size === 0) {
      return "No applicable modifiers available for these procedures.";
    }

    const modifierDescriptions = Array.from(allModifiers.values())
      .map(modifier => formatModifierForPrompt(modifier))
      .join("\n\n");

    return `Applicable Modifiers:\n${modifierDescriptions}`;
  })();

  const relevantFlags = cciResult?.ptpFlags
    ? cciResult.ptpFlags.filter((flag) =>
        lineItems.some(
          (item) =>
            flag.primaryCode === item.procedureCode ||
            flag.secondaryCode === item.procedureCode
        )
      )
    : [];

  const cciContext = relevantFlags.length > 0
    ? `PTP Edits (CCI Conflict Details): ${JSON.stringify(relevantFlags, null, 2)}`
    : "No PTP/CCI conflicts found for these line items.";

  const mueLineItems = lineItems.map((item: any) => {
    const originalProc = state.procedureCodes?.find(p => p.code === item.procedureCode);
    if (originalProc && originalProc.mai === 1 && originalProc.units > (originalProc.mueLimit || 0)) {
      // Extract rationale from enhanced procedure code if available (note: rationale not available in EnhancedProcedureCode)
      const rationale = "Standards of medical/surgical practice";
      return `Line ${item.lineId}: Procedure ${item.procedureCode} has MAI=1, requested ${originalProc.units} units, MUE limit ${originalProc.mueLimit || 'undefined'}. Rationale for edit: "${rationale}"`;
    }
    return null;
  }).filter(Boolean);

  const mueContext = mueLineItems.length > 0
    ? `MUE Edits (violations with MAI = 1):\n${mueLineItems.join('\n')}`
    : "";

  return `
You are an expert, certified medical coder. Your task is to analyze clinical documentation for specific medical billing edits. All line items provided to you are pre-screened and have one of two issues:
1.  A PTP/CCI conflict where the Modifier Indicator (MI) is 1.
2.  An MUE violation where the Medically Unlikely Edit Adjudication Indicator (MAI) is 1.

For each line item, analyze the documentation to determine if a bypass is justified and provide a clear rationale with evidence.
CRITICAL INSTRUCTION: You MUST use ncci_edits.txt to justify use of modifiers (for PTP and MUE) by looking up the CPT code and its description or overall category (i.e. surgery) and when modifiers apply. Ensure to thoroughly analyze the information and evaluate the best use of such modifiers.
Line Items:
${lineItemsContext}

## Analysis Workflow
# Step 1. For PTP/CCI Edits (MI = 1)
Determine if a distinct procedural service modifier is justified to bypass the edit. The modifier ONLY applies to the Column 2 (secondary) code.

IMPORTANT: You may ONLY select modifiers from the NCCI/PTP modifiers list provided. If no appropriate modifier from the allowed list applies, set "modifier": null.

For this PTP-specific step, you MUST USE PTP_modifiers.txt from the ncci-rag vector database for reference on when to use these modifiers.
Use the most specific modifier that applies from the allowed list. When multiple modifiers could apply, choose the one that most accurately describes the circumstances documented in the clinical note.

NCCI/PTP modifiers available: 27, 59, XE, XS, XP, XU
-27: Multiple Outpatient Hospital E/M Encounters on the Same Date
-59: Distinct Procedural Service (catch-all when X modifiers don't apply, preferably use other ones)
-XE: Separate Encounter - distinct because it occurred during a separate session on the same date
-XS: Separate Structure - distinct because it was performed on a separate anatomical site or organ
-XP: Separate Practitioner - distinct because it was performed by a different clinician
-XU: Unusual Non-overlapping Service - distinct because it does not overlap the usual components of another service

You MUST reference both the ncci_edits.txt and the PTP_modifiers.txt for guidance on use of these modifiers and evaluating whether or not they're applicable based on the operative note documentation of the executed procedure, and the modifier conditions and guidelines.

PTP Issues (CCI conflicts with MI = 1):
${cciContext}

# Step 2. For MUE Edits (MAI = 1)
Your goal is to determine if the clinical documentation supports billing for a number of units greater than the standard limit. You will not split lines; you will only determine if the documentation is sufficient.

MUE Edit Processing Steps:
1. Evaluate the MAI reason for the specific code from the rationale provided
2. Choose the modifier that accurately describes the clinical situation (anatomic → RT/LT, distinct procedure → XE/XS/XP/XU/59, repeat lab → 91, repeat procedure → 76/77, etc.). Don't use a modifier just to "bypass" an edit.
   -Anatomic modifiers: E1-E4, FA, F1-F9, TA, T1-T9, LT, RT, LC, LD, RC, LM, RI 
   -Distinct Procedure modifiers: 27, 59, 91, XE, XS, XP, XU 
   - This is not an exhaustive list of applicable modifiers. Refer to modifier_guidelines.txt for all modifier's definitions and descriptions (using the ncci-rag database file search)
   - The use of such a modifier MUST be justified by the operative note provided, and allowed by the guidelines in ncci_edits.txt.
3. Document thoroughly why each line is separate — clinical notes must support the modifier choice. CMS/MACs will request records if they review the claim.

-Set "documentationSupportsBypass": true if the note clearly justifies the extra units.
    -Sufficient Evidence: Explicitly lists distinct anatomical sites (e.g., "three polyps removed from the sigmoid, descending, and transverse colon"), specifies laterality ("bilateral procedures on left and right knees"), or details separate encounters on the same day.

-Set "documentationSupportsBypass": false if the note is ambiguous or lacks justification.
    -Insufficient Evidence: Vague terms like "multiple," "x2," or "repeat" without specific, distinct details are not enough.

MUE Issues (violations with MAI = 1):
${mueContext}

---
## Evidence and Rationale Rules
-Quote Verbatim: All evidence MUST be a direct quote from the clinical note. Do not paraphrase or summarize.
-Concise Rationale: Keep rationale to 1-2 sentences maximum. Briefly state why the modifier applies based on the operative note and guidelines.
    -Example: "Modifier XS applies due to procedures on distinct anatomical sites per NCCI guidelines."
-No Support: If documentation does not support a bypass, state this clearly in your rationale. Set "modifier": null and "documentationSupportsBypass": false.

## Clinical Note
${fullNoteText}


## OUTPUT
Return ONLY the following JSON structure. Provide an assignment for EVERY line item.
- For PTP decisions, the modifier applies to the Column 2 code only. Set \"code\" to that Column 2 CPT.
- For MUE decisions, set \"code\" to the CPT experiencing the overage. Do not split or truncate lines here; only judge documentation sufficiency.
- Produce assignments for every input line. If a line has both PTP and MUE issues, return two assignments (same \"lineId\"): one with \"editType\": \"PTP\" and one with \"editType\": \"MUE\".

{
  "assignments": [
    {
      "lineId": "<string>",
      "modifier": "<string or null>",
      "rationale": "<string>",       // 1-2 sentence explanation
      "documentationSupportsBypass": <true|false>,
      "code": "<string>",
      "editType": "<PTP or MUE>",
      "evidence": [
        {
          "excerpt": "<verbatim text from note>",
          "sourceNoteType": "<string>"
        }
      ]
    }
  ]
}
`.trim();
};

// /
//   Builds the prompt for Phase 2 modifier assignment (ancillary modifiers) - BATCH VERSION
//  /
export const buildPhase2ModifierPrompt_Batch = (
  state: StandardizedWorkflowState,
  lineItems: (ProcedureLineItem & { allowedModifiers: PreVettedModifier[] })[],
): string => {
  const fullNoteText = [
    state.caseNotes.primaryNoteText,
    ...state.caseNotes.additionalNotes.map((note) => note.content),
  ].filter(Boolean).join("\n\n") || "N/A";

  const lineItemsContext = lineItems.map((item: any) => {
    const existingModifiers = [
      ...item.phase1Modifiers.map((m: any) => `${m.modifier} (${m.rationale})`),
    ].join(", ");
    
    const allowedModifiersText = item.allowedModifiers && item.allowedModifiers.length > 0
      ? `Allowed Modifiers: ${item.allowedModifiers.map((m: any) => m.code).join(", ")}`
      : "No ancillary modifiers allowed for this procedure";
    
    // Get procedure description from enhanced procedure code
    const originalProc = state.procedureCodes?.find(p => p.code === item.procedureCode);
    const procedureDescription = originalProc?.description || `Procedure ${item.procedureCode}`;
    
    // Include modifier explanation from CPT agent
    const modifierExplanation = originalProc?.modifierExplanation 
      ? `Potential modifiers (use as recommendation only): ${originalProc.modifierExplanation}` 
      : "";
    
    // Include any compliance flags or special circumstances from Phase 1
    const complianceInfo = item.complianceFlag 
      ? `Compliance Note: ${item.complianceFlag.message}` 
      : "";
    
    return `Line ID: ${item.lineId}
Code: ${item.procedureCode}
Description: ${procedureDescription}
Units: ${item.units}
${modifierExplanation}
Existing Phase 1 Modifiers: ${existingModifiers || "None"}
${complianceInfo}
${allowedModifiersText}`;
  }).join("\n");

  // Generate applicable modifiers section with descriptions and guidance
  const applicableModifiersSection = (() => {
    const allModifiers = new Map<string, PreVettedModifier>();
    
    // Collect all unique modifiers across all line items
    lineItems.forEach(item => {
      item.allowedModifiers.forEach(modifier => {
        allModifiers.set(modifier.code, modifier);
      });
    });

    if (allModifiers.size === 0) {
      return "No applicable modifiers available for these procedures.";
    }

    const modifierDescriptions = Array.from(allModifiers.values())
      .map(modifier => formatModifierForPrompt(modifier))
      .join("\n\n");

    return `Applicable Modifiers:\n${modifierDescriptions}`;
  })();

  return `
You are an expert, certified medical coder—working strictly from the current CPT Assistant, AMA global-package guidance, and CMS payer rules—tasked with reviewing clinical notes and identifying ancillary (non-compliance) modifiers that legitimately apply to each billed line item.

CRITICAL INSTRUCTIONS:
-You MUST use modifier_guidelines.txt to find the definition and notes on when to use specific modifiers
-You MUST refer back to ncci_edits.txt to justify the use of a specific modifier for the situation as determined by the operative note
-IMPORTANT: Use the "CPT Agent Modifier Analysis" provided for each procedure as context for your modifier decisions. This analysis was generated during CPT code selection and provides insights into potential modifiers based on the documentation.
-Thoroughly verify that the line items created and modifiers appended in Phase 1 are properly considered in Phase 2
-Provide clear rationale for why each modifier is applied, including why procedures may be unbundled into multiple line items

INTERNAL REASONING (do not output)
1. Review Phase 1 Results: Understand what modifiers were already applied and why
2. Normalize headings (case-insensitive): ASSISTANT, OPERATION/PROCEDURE; DETAILS/TECHNIQUE; INDICATIONS/FINDINGS/ASSISTANT ...
3. Segment the note by these headings. Within each segment, highlight phrases that commonly support modifiers (only select modifiers from the "MODIFIER CATEGORIES & DESCRIPTIONS" below)
4. Cross-reference with modifier_guidelines.txt and ncci_edits.txt for specific guidance
5. Validate modifer for the CPT code, link operative note evidence and confirm compliance guidelines support the modifier.

CPT codes:
${lineItemsContext}

## MODIFIER CATEGORIES & DESCRIPTIONS 
# Assistants & Surgical Teams (look for "ASSISTANT"))
-62 — Two Surgeons: Two primary surgeons share a complex procedure
-66 — Surgical Team: Multispecialty surgical team performs together
-80 — Assistant Surgeon: Qualified provider assists primary surgeon 
-81 — Minimum Assistant Surgeon: Limited assistant role during surgery
-82 — Assistant Surgeon (Resident Unavailable): Assistant steps in when resident unavailable

# Laterality & Anatomic Sites
-50 — Bilateral: Same procedure on both sides in one session
-RT/LT — Right/Left: Procedure performed on right or left side
-E1-E4: Eyelid site 
-F1-F9, FA-F9: Finger site 
-T1-T9, TA/T5: Toe site 
-LC, LD, LM, RC, RI: Coronary artery site

# Anesthesia
-23 — Unusual Anesthesia: General anesthesia used when not typical
-47 — Surgeon Provided Anesthesia: Operating surgeon administers anesthesia
-P1-P6: Anesthesia risk status (healthy → brain-dead donor)

# E/M & Postoperative Care
-24 — Unrelated E/M During Postop: Visit unrelated to recent surgery
-25 — Significant E/M Same Day as Procedure: Separate E/M beyond usual peri-procedural care
-27 — Multiple Outpatient Encounters Same Day: Hospital-only; distinct visits in different departments
-57 — E/M Resulting in Major Surgery Decision: Visit led to decision for surgery

# Surgical Staging, Changes & Discontinuations
-52 — Reduced Services: Procedure partially completed
-53 — Discontinued Procedure: Stopped due to patient safety
-54 — Surgical Care Only: Only performed operation
-55 — Postop Care Only: Only provided recovery/follow-up
-56 — Preop Care Only: Only performed pre-surgical evaluation
-58 — Staged/Planned/More Extensive Procedure: Planned or expanded follow-up surgery
-73/74: Facility-only cancelled/aborted procedures (pre- or post-anesthesia)

# Repeat & Related Procedures
-76 — Repeat Procedure by Same Physician: Same provider repeats service same day
-77 — Repeat Procedure by Another Physician: Different provider repeats service same day
-78 — Unplanned Return to OR for Related Procedure: Postop complication requires reoperation
-79 — Unrelated Procedure During Postop Period: New, unrelated surgery in postop window

# Special Circumstances
-22 — Increased Procedural Service: Unusually difficult or time-intensive service
-32 — Mandated Services: Service required by third party
-33 — Preventive Service: Preventive care per USPSTF or mandate
-63 — Procedure on Infant ≤4kg: Extra work for neonates
-99 — Multiple Modifiers: More than one modifier applies

## OUTPUT SPECIFICATION
Return only a JSON in this format. 
- Provide clear rationale for each modifier assignment, including references to why procedures may have been split or modified in Phase 1.
- Capture verbatim evidence (1-2 sentences, exact wording, no ellipses)
{
  "assignments": [
  {
  "lineId": "<string>",          // e.g. "12345-line-1"
  "modifiers": [
  {
  "modifier": "<string>",    // e.g. "25"
  "rationale": "<string>",   // 1-2 sentence explanation referencing guidelines and operative note
  "description": "<string>", // Brief description of what this modifier represents
  "evidence": [
    {
      "description": "<string>",     // where/what the evidence is
      "excerpt": "<verbatim text from note>"  // 1-2 verbatim sentences as evidence (exact wording, separate by ';')
    }
  ]
  }
  // …other modifiers for this line
]
}
// …other line items
]
}

Important Notes:
- Return ONLY the above JSON object, no other prose or text. Ensure correct string escaping.
- Provide clear rationale for why certain procedures were unbundled or modified
- Always specific guidelines from modifier_guidelines.txt and ncci_edits.txt 

Clinical Note:
${fullNoteText}
`;
}