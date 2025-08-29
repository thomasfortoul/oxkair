/**
 * Prompt templates for the Modifier Assignment Agent
 */

import {
  CCIResult,
  ProcedureLineItem,
  WorkflowState,
} from "../types.ts";

/**
 * Builds the prompt for Phase 1 modifier assignment (distinct-service modifiers) - BATCH VERSION
 */
export const buildPhase1ModifierPrompt_Batch = (
  state: WorkflowState,
  lineItems: ProcedureLineItem[],
  cciResult?: CCIResult,
): string => {
  const fullNoteText = [
    state.caseNotes.primaryNoteText,
    ...state.caseNotes.additionalNotes.map((note) => note.content),
  ].filter(Boolean).join("\n\n") || "N/A";

  const lineItemsContext = lineItems.map(item => 
    `Line ID: ${item.lineId}, Procedure: ${item.procedureCode}, Units: ${item.units}`
  ).join("\n");

  const cciContext = cciResult ? 
    `CCI Conflict Details: ${JSON.stringify(cciResult.ptpFlags.filter(flag => 
      lineItems.some(item => flag.primaryCode === item.procedureCode || flag.secondaryCode === item.procedureCode)
    ), null, 2)}` : "No CCI conflicts detected";

  return `
You are an expert, certified medical coder—working strictly from CMS NCCI Policy Manual, current CPT®, and CPT Assistant guidance. Your task: decide whether a distinct-service modifier (-XE, -XS, -XP, -XU, or -59) is warranted for a procedure on this claim line, then output a single JSON object as specified—nothing else.

CMS / NCCI RULES TO APPLY
A modifier is allowed only when one non-overlapping criterion is met and the documentation clearly supports it:
* -XE — Separate Encounter
    * Distinct because it occurred during a separate session on the same date of service.
    * Shortcut cue words: “later that day,” “return visit,” distinct time stamp.
* -XS — Separate Structure
    * Distinct because it was performed on a separate anatomical site or organ.
    * Shortcut cue words: “left knee vs right knee,” “different quadrant.”
* -XP — Separate Practitioner
    * Distinct because it was performed by a different clinician.
    * Shortcut cue words: distinct provider signature / NPI.
* -XU — Unusual Non-Overlapping Service
    * Distinct because it does not overlap the usual components of another service.
    * Shortcut cue words: “independent component,” “not integral.”
* -59 — Distinct Procedural Service (catch-all)
    * Use only when none of the X-modifiers accurately describe the scenario.
Never apply these modifiers to E/M codes; use -25 for separate E/M services instead.

INTERNAL CHECKLIST (do not output)
1. Scan the note and CCI context for clear evidence of one of the above criteria.
2. Reject a modifier if documentation is ambiguous or overlaps bundled components.
3. Choose the most specific X-modifier; use -59 only as a fallback.
4. Capture verbatim evidence (no ellipses) supporting the choice.

OUTPUT—return only this JSON
{
  "assignments": [
    {
      "lineId": "<string>",          // e.g. "12345-line-1"
      "modifiers": [
        {
          "modifier": "<string>",   // XE, XS, XP, XU, 59, or null
          "rationale": "<string>",   // concise reason
          "evidence": [
            {
              "description": "<string>",     // where/what the evidence is
              "excerpt": "<verbatim text from note>"
            }
          ]
        }
        // …other modifiers for this line
      ]
    }
    // …other line items
  ]
}

If no distinct-service modifier is justified, set "modifier": null and leave "rationale" and "evidence" as empty strings.

INPUTS
* Clinical Note: ${fullNoteText}
* CCI Context (PTP & MUE): ${cciContext}
    * MUE exceeds line limit but is MAI = 1 (eligible for override).
`;
}

/**
 * Builds the prompt for Phase 2 modifier assignment (ancillary modifiers) - BATCH VERSION
 */
export const buildPhase2ModifierPrompt_Batch = (
  state: WorkflowState,
  lineItems: ProcedureLineItem[],
): string => {
  const fullNoteText = [
    state.caseNotes.primaryNoteText,
    ...state.caseNotes.additionalNotes.map((note) => note.content),
  ].filter(Boolean).join("\n\n") || "N/A";

  const lineItemsContext = lineItems.map(item => {
    const existingModifiers = [
      ...item.phase1Modifiers.map(m => m.modifier),
    ].join(", ");
    return `Line ID: ${item.lineId}, Procedure: ${item.procedureCode}, Units: ${item.units}, Existing Phase 1 Modifiers: ${existingModifiers || "None"}`;
  }).join("\n");

  return `
You are an expert, certified medical coder—working strictly from the current CPT®, CPT Assistant, AMA global-package guidance, and CMS payer rules—tasked with reviewing a single operative or procedural note and identifying ancillary (non-distinct-service) modifiers that legitimately apply to each billed line item.

PRE-PROCESSING (internal; do not output)
1. Normalize common headings (case-insensitive) so evidence is easy to locate:
    * OPERATION / PROCEDURE / SURGICAL PROCEDURE / PROCEDURES PERFORMED
    * DETAILS OF PROCEDURE / TECHNIQUE / DESCRIPTION OF PROCEDURE
    * INDICATIONS
    * FINDINGS
    * ASSISTANT / ASSISTANT SURGEON / SURGICAL TEAM
    * COMPLICATIONS
    * ESTIMATED BLOOD LOSS (EBL)
    * TIME IN / OUT / TOTAL TIME
    * POST-OPERATIVE DIAGNOSIS / PLAN
2. Segment the note by these headings. Within each segment, highlight phrases that commonly support modifiers, e.g.
    * “assistant surgeon,” “two surgeons,” “resident unavailable” → Mod 62/80/81/82/66
    * “procedure aborted,” “unable to complete,” “converted to open” → Mod 52/53/73/74
    * “returned to OR,” “post-op bleed,” “unplanned” → Mod 78
    * “second-look,” “planned stage” → Mod 58
    * “unrelated procedure,” “different operative site” → Mod 79
    * “left,” “right,” “both sides,” “bilateral” → Mod RT/LT/50
    * “extra time,” “prolonged,” “unusually complex,” “greater than typical,” “significant additional work” → Mod 22
    * Decision-making verbiage in INDICATIONS or PLAN on same date as surgery → Mod 57
    * Separate E/M language on DOS → Mod 25; unrelated E/M in global → Mod 24
3. Normalize synonyms & abbreviations (e.g., “EBL,” “Abd.” → abdominal; “Bx” → biopsy).

INTERNAL REASONING (do not output)
1. For each line item
    a. Compare operative details to the line's CPT description.
    b. Cross-reference normalized evidence snippets.
2. When a modifier is justified:
    a. Capture verbatim evidence (exact wording, no ellipses).
    b. Explain the rationale in one concise phrase.

Line Items:
${lineItemsContext}

MODIFIER REFERENCE (focus on ancillary, non-distinct-service)
Unusual / Extended Service
* 22 - Increased Procedural Services: Used when the physician documents exceptionally extra time, effort, and/or complexity that goes well beyond the usual work required for the procedure.

Global-Period & Staged Services
* 24 - Unrelated E/M Service During a Postoperative Period: An evaluation & management (E/M) service that is unrelated to the original procedure and provided during its postoperative global period.
* 25 - Significant, Separately Identifiable E/M Service on the Same Day of a Procedure: A distinct E/M service, above and beyond the usual pre-/post-operative care inherent in the procedure, performed on the same date.
* 57 - Decision for Surgery: An E/M encounter that results in the initial decision to perform a major surgery (global period = 90 days) on the day before or the day of that surgery.
* 58 - Staged or Related Procedure or Service During the Postoperative Period: A planned, prospectively staged, more extensive, or therapy-following procedure performed during the global period of the first surgery.
* 78 - Unplanned Return to the Operating/Procedure Room for a Related Procedure During the Global Period: A return to the OR/procedure room by the same surgeon for a complication or related issue from the initial surgery.
* 79 - Unrelated Procedure or Service by the Same Physician During the Postoperative Period: A procedure performed during the global period that is unrelated to the original surgery.

Reduced or Discontinued Services
* 52 - Reduced Services: The procedure is partially reduced or not fully completed at the physician’s discretion.
* 53 - Discontinued Procedure: The procedure is started but stopped after anesthesia induction or surgical prep because of extenuating circumstances or patient well-being.
* 73 - Discontinued Outpatient Hospital/ASC Procedure Prior to Anesthesia: In an outpatient hospital or ASC, the procedure is cancelled after patient preparation but before anesthesia is given.
* 74 - Discontinued Outpatient Hospital/ASC Procedure After Anesthesia: In an outpatient hospital or ASC, the procedure is terminated after anesthesia has been administered.

Assistants & Surgical Teams
* 62 - Two Surgeons: Two primary surgeons of different specialties perform distinct parts of a single procedure.
* 66 - Surgical Team: A formally organized, coordinated team of surgeons is required for a complex procedure (payer-specific).
* 80 - Assistant Surgeon: A qualified physician actively assists the primary surgeon.
* 81 - Minimum Assistant Surgeon: A qualified physician provides minimal surgical assistance.
* 82 - Assistant Surgeon (When Resident Unavailable): A qualified physician assists because a qualified resident surgeon was not available.

Laterality
* 50 - Bilateral Procedure: The same procedure is performed on both sides of the body during the same session. (when bundled together — same line item)
* RT - Right Side: Procedure performed on the right side of the body. (for separate bundling — different line items)
* LT - Left Side: Procedure performed on the left side of the body (for separate bundling — different line items

OUTPUT SPECIFICATION
Return only the JSON object—no markdown, code fences, or commentary.
{
  "assignments": [
    {
      "lineId": "<string>",          // e.g. "12345-line-1"
      "modifiers": [
        {
          "modifier": "<string>",    // e.g. "25"
          "rationale": "<string>",   // concise reason
          "evidence": [
            {
              "description": "<string>",     // where/what the evidence is
              "excerpt": "<verbatim text from note>"
            }
          ]
        }
        // …other modifiers for this line
      ]
    }
    // …other line items
  ]
}
If a line item has no applicable ancillary modifiers, include it with an empty "modifiers": [] array.

Clinical Context:${fullNoteText}
`;
}