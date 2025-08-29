export const MODIFIER_DETAILS_PROMPT = `
---
Modifier Categories & When to Apply:

1. Pricing Modifiers (Affect reimbursement amount)
| Modifier | Description | When to Apply / Notes |
| --- | --- | --- |
| 21 | Prolonged Evaluation and Management | Rare, only for unusually lengthy visits/procedures. |
| 22 | Increased Procedural Services | When documentation supports extra work/complexity (but **never on unlisted codes**). |
| 26 | Professional Component | For interpreting physician work (not the facility/technical part). |
| 50 | Bilateral Procedure | Procedure done on both sides; not all codes allow. Check code list. |
| 52 | Reduced Services | If the service was partially reduced. |
| 53 | Discontinued Procedure | When a procedure is started but not completed. |
| 60 | Individualized Service | Rare, institution specific. |
| 62 | Co-surgeon | When two surgeons (different specialties) work together; documentation required. |
| 63 | Procedure on infants <4kg | For infants less than 4kg on eligible codes; **increase fee 25%**. |
| 80, 82 | Assistant Surgeon | When an assistant is present. **82 requires attestation for Medicare; see doc**. |
| P1-P6 | Anesthesia Risk | By anesthesia provider, for patient risk. |

2. Payment-Eligible Modifiers (Often used to communicate something special has occurred)
| Modifier | Description | When to Apply / Notes |
| --- | --- | --- |
| 24 | Unrelated E&M during postop period | New E/M not related to original procedure. |
| 25 | Significant, Separately Identifiable E/M | E/M on same day as procedure (distinct from the procedure). |
| 51 | Multiple Procedures | Attach to **lowest RVU** code when >1 non-add-on procedure. Never for add-on codes. |
| 57 | Decision for Surgery | E/M led directly to the surgery; use for major procedures. |
| 58 | Staged/Related Procedure or Service | Re-op or related surgery during global period (planned/anticipated). |
| 59 | Distinct Procedural Service | Used when multiple, distinct sites/services—CCI edit allows use. |
| 76, 77 | Repeat Procedure | 76: Same provider; 77: Different provider. |
| 78 | Unplanned Return to OR (Global) | Unplanned surgery during the global period; fee not increased. |
| 79 | Unrelated Procedure (Global) | Unrelated surgery during global period. |
| 91 | Repeat Clinical Diagnostic Lab Test | For labs only. |

3. Location Modifiers (Used for side, digit, or site specificity)
| Modifier | Description | When to Apply / Notes |
| --- | --- | --- |
| E1-E4 | Eyelids (left upper, etc.) | For eye procedures, as appropriate. |
| FA | Thumb (right hand) | For thumb. |
| F1-F9 | Fingers (left/right 2nd–5th) | Use as appropriate for fingers. |
| LC, LD | Coronary artery branches | For cardiac cath procedures. |
| LT | Left side | Only if code is side-specific and op note supports. |
| RC | Right coronary | For cath/heart. |
| RT | Right side | Only if code is side-specific and op note supports. |
| TA | Great toe (left foot) | For toe. |
| T1-T9 | Toes (right/left 2nd–5th) | For toes. |

4. Informational/Other Modifiers (Used for documentation or billing only, not affecting payment directly)
| Modifier | Description | When to Apply / Notes |
| --- | --- | --- |
| GC | Resident involvement | **Used for all teaching cases**, regardless of payer; document attending supervision. |
| XTS | Medicaid 6+ Hour Surgery | For Medicaid cases where surgery > 6 hours; policy-driven. |

Special Situations / Documentation Requirements:
- **22:** Needs detailed op note & special form for Medicare.
- **62:** Co-surgeon statement/documentation required.
- **82:** Assistant attestation form (esp. Medicare).
- **63:** Infant <4kg, only for allowed codes; fee increased.
- **51:** Only on lowest RVU code; never on add-on codes.
- **Unlisted Codes:** Only **62 and 82** can be used; never use 22 or others on unlisted.
- **Add-on Codes:** Do **not** use 51, 50, 59, etc. unless specifically allowed.

Sequence Rules (Order of Reporting):
- Pricing before payment, then location modifiers—**except** for global package exceptions (e.g., 22-62, 22-50, 62-78, 63-78, 63-79, 22-63, 62-51, etc.).
- **Location modifiers always last.**
- **Payment-eligible before location.**
- Use explicit order for known combos when present.

Other Reminders:
- **Bilateral (50):** Only if code allows; may affect primary/secondary status and RVU calculation.
- **Modifier 51:** Always lowest RVU (not lowest charge). Recalculate RVUs if bilateral (50) is used.
- **Global period modifiers (58/78/79):** Only when within global period from prior surgery.
- **GC:** Always if resident involved, regardless of payer.
- **XTS:** Only for Medicaid >6 hr surgery.
---
`;