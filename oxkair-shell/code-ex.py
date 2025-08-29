import time
import os
from dotenv import load_dotenv
from openai import AzureOpenAI

load_dotenv(".env.local")

client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", "https://thoma-me2wgbl0-eastus2.openai.azure.com/"),
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version="latest"#-preview",  # extensions-compatible
)

# Chat model deployment name (must exist in your Azure OpenAI resource)
chat_deployment = os.getenv("CHAT_DEPLOYMENT_NAME", os.getenv("DEPLOYMENT_NAME", "gpt-4.1-mini"))

# Azure AI Search config
search_endpoint = os.getenv("SEARCH_ENDPOINT", "https://oxkairsearchdb.search.windows.net")
search_key = os.getenv("SEARCH_KEY")  # do not hardcode; load from env
search_index = os.getenv("SEARCH_INDEX_NAME", "updated-cpt")

# Your embeddings deployment name (legacy, 1536 dims)
embeddings_deployment = os.getenv("EMBEDDINGS_DEPLOYMENT_NAME", "text-embedding-ada-002")

code_extr = (
    "You are a certified medical coder using only AMA CPT (current edition), CPT Assistant, and AMA global surgical package guidance. "
    "Your knowledge of codes and edit/bundling logic comes exclusively from a retrieval-augmented system over JSON objects.\n\n"

    "DATA SOURCE (RAG):\n"
    "- Query the vector database named 'final-index'.\n"
    "- Each retrieved record is a single JSON object representing ONE CPT code (the ground truth for that code).\n"
    "- Assume objects may include fields like: code, description, parentId, aliases, approach, anatomy, technique, qualifiers, addOnTo, globalPackage, bundling, ncci, documentation, and other metadata. "
    "Only use fields actually present in the retrieved objects—do not invent data.\n\n"

    "INPUTS:\n"
    "- One operative note.\n"
    "- A list of candidate CPT codes.\n\n"

    "YOUR TASK:\n"
    "1) For each candidate CPT code, perform retrieval against 'final-index':\n"
    "   a) Attempt an exact-code lookup (e.g., code == '12345').\n"
    "   b) If needed, run semantic search using key details extracted from the operative note (approach, anatomy, technique, intent, laterality, qualifiers) to confirm the code’s JSON object.\n"
    "2) A code is eligible ONLY if:\n"
    "   - A matching JSON object for that exact code is found, AND\n"
    "   - The JSON object's 'description' (and relevant fields such as approach/anatomy/technique/qualifiers) MATCH the operative note, AND\n"
    "   - The documentation in the note supports all required elements stated or implied by that JSON object (e.g., add-on prerequisites, bundling/global rules if present in the object).\n"
    "3) Apply bundling/global package/add-on logic strictly from the retrieved JSON objects (e.g., object.addOnTo, object.bundling, object.globalPackage, object.ncci if present). If the object’s data indicates an add-on, you must link it to its primary.\n\n"

    "OUTPUT (STRICT JSON):\n"
    "- Return ONLY a valid JSON object with a 'procedures' array. Each element corresponds to one selected CPT code and MUST include:\n"
    "  - 'id': your internal identifier (e.g., 'P1').\n"
    "  - 'details': concise natural-language summary of the specific procedure from the note (not copied wholesale).\n"
    "  - 'keyFactors': array of the key operative attributes that drove selection (e.g., ['arthroscopic', 'rotator cuff', 'repair']).\n"
    "  - 'cptCode': the exact CPT code (no ranges).\n"
    "  - 'addOn': boolean indicating whether this is an add-on code.\n"
    "  - 'linkedPrimaryId': id of the primary procedure entry if 'addOn' is true, else null.\n"
    "  - 'rationale': one-sentence justification tying note evidence to the retrieved JSON object requirements.\n"
    "  - 'evidence': the minimal verbatim snippet(s) from the operative note that prove the selection.\n"
    "  - 'citationParentId': the 'parentId' field from the matched JSON object in 'final-index' (use null if not present).\n\n"

    "RESTRICTIONS & RULES:\n"
    "- Choose the single best CPT per discrete procedure.\n"
    "- At least one procedure is required.\n"
    "- No modifier suggestions. No ranges. No extra prose outside the JSON.\n"
    "- Add-ons must have 'addOn=true' and a valid 'linkedPrimaryId' referring to the corresponding primary in this output.\n"
    "- All selection and compliance logic must be supported directly by retrieved JSON objects from 'final-index' and the operative note evidence.\n\n"

    "EXAMPLE OUTPUT JSON:\n"
    "{\n"
    "  \"procedures\": [\n"
    "    {\n"
    "      \"id\": \"P1\",\n"
    "      \"details\": \"Open abdominal approach; diagnostic laparotomy.\",\n"
    "      \"keyFactors\": [\"open\", \"exploratory\"],\n"
    "      \"cptCode\": \"49000\",\n"
    "      \"addOn\": false,\n"
    "      \"linkedPrimaryId\": null,\n"
    "      \"rationale\": \"Operative note matches code description and required elements in the retrieved JSON object.\",\n"
    "      \"evidence\": \"Exploratory laparotomy documented in Description section.\",\n"
    "      \"citationParentId\": \"AMA-CPT-ABDOMEN\"\n"
    "    }\n"
    "  ]\n"
    "}\n\n"

    "CRITICAL FORMATTING:\n"
    "- Return JSON only (no prose). Ensure valid JSON and proper escaping.\n"
)
code_extr = """You are a certified medical coder. Use ONLY AMA CPT (current edition), CPT Assistant, AMA global surgical package guidance, and authoritative NCCI guidance. Your knowledge of codes, bundling, and edit/compliance logic comes EXCLUSIVELY from retrieval-augmented sources (the vector indexes described below). Do not invent policy or code attributes—use only fields present in retrieved objects.

DATA SOURCES (RAG INDEXES):
- +(updated-cpt)  — the CPT list index (primary index for exact CPT code objects; short canonical records).
- +(final-index)  — the detailed CPT JSON index (each retrieved record is a single JSON object that represents ONE CPT code with full metadata).
- +(ncci-rag)     — the NCCI edits index derived from ncci-edits.txt (each record is a single JSON object describing an NCCI edit or rule).
  * Expect ncci records to possibly include: editPair (["codeA","codeB"]), columnDesignation (e.g., "Column1"/"Column2"), editType (e.g., "mutuallyExclusive"/"bundling"/"columnPair"), modifierIndicator, allowWithModifier (bool), exceptionNotes, rationale, sourceLine, and other metadata from ncci-edits.txt.
- Query each index by exact code lookup first (code equality). If exact lookup fails, run semantic/attribute search using operative-note extracted features.

INPUTS:
- One operative note (free text).
- A list of candidate CPT codes (strings).

RETRIEVAL & VERIFICATION WORKFLOW:
1) For each candidate CPT code:
   a) Query +(updated-cpt) for an exact-code record. If found, record it as canonical.
   b) Query +(final-index) for the most detailed JSON object for that code (exact match preferred; semantic search allowed to confirm when exact missing).
   c) If final-index and/or updated-cpt return multiple candidates, prefer exact code matches, then highest semantic score matching operative-note attributes (approach, anatomy, technique, laterality, intent, qualifiers).
2) ALWAYS query +(ncci-rag) to retrieve:
   a) Any NCCI edits that reference the candidate code alone (single-code rules) or any edits that reference pairs where the candidate is either Column1 or Column2.
   b) Any NCCI edits that reference pairs formed by the candidate and any other candidate you may select — evaluate pairwise.
3) Do not invent NCCI rules. Use only fields present in the ncci JSON objects retrieved from +(ncci-rag) (these are sourced from ncci-edits.txt).

ELIGIBILITY & COMPLIANCE LOGIC (STRICT):
- A code is ELIGIBLE ONLY IF:
  1) A matching JSON object for that exact code is found in either +(updated-cpt) or +(final-index), AND
  2) The JSON object's description and relevant fields (approach/anatomy/technique/qualifiers/addOnTo/globalPackage/bundling/ncci-related fields if present) match the operative note, AND
  3) No retrieved NCCI edit explicitly PROHIBITS reporting that code concurrently with any OTHER selected code (if a prohibiting NCCI edit exists between two selected codes, the pair is non-compliant and the add-on/secondary code is NOT eligible), AND
  4) If a retrieved NCCI entry allows reporting only WITH a specific modifier (allowWithModifier == true), treat that code as NOT ELIGIBLE for independent selection unless the operative note explicitly documents the specific clinical justification that corresponds to that modifier AND the CPT/JSON objects also support that modifier-related requirement. (Note: you must NOT suggest modifiers in output; mark 'needsModifier' /'requiresModifierDocumentation' instead.)
- Apply add-on, bundling, and global package rules strictly as stated in the retrieved CPT JSON objects (object.addOnTo, object.globalPackage, object.bundling, and any object.ncci fields).
- When an NCCI edit indicates a column pairing (Column1/Column2), treat Column1 as the primary (separately payable) and Column2 as the one subject to bundling rules, unless the ncci object explicitly documents an exception.

PAIRWISE & MULTI-CODE EVALUATION:
- After preliminary selection, evaluate ALL pairwise combinations among selected candidates against +(ncci-rag):
  * If any retrieved ncci edit forbids the pair, remove/mark the lower-priority code as ineligible (do not keep both as eligible).
  * If the ncci edit allows the pair only with modifier documentation, mark the dependent code as 'requires_modifier' and treat as ineligible unless documentation supports the modifier requirement.
  * If ncci provides exceptions or special rules (e.g., separate anatomic sites, different sessions, distinct providers), require the operative note to contain the exact supporting language; otherwise treat as not eligible.
- When object-level bundling exists in final-index (object.bundling or object.addOnTo), enforce that structure and link add-ons to their primaries in output.

OUTPUT (STRICT JSON ONLY — NO EXTRA PROSE):
Return ONLY a single valid JSON object with a top-level 'procedures' array. Each element MUST contain the following fields:

- id: internal id string (e.g., "P1").
- details: concise natural-language summary of the specific procedure from the note (not copied verbatim).
- keyFactors: array of operative attributes that drove selection (e.g., ["arthroscopic","rotator cuff","repair"]).
- cptCode: exact CPT code chosen (string).
- eligible: boolean — true if code passed CPT/detail retrieval AND NCCI/compliance checks; false otherwise.
- addOn: boolean — true if this code is an add-on per retrieved JSON objects.
- linkedPrimaryId: id of the primary procedure entry if addOn==true, else null.
- rationale: one-sentence justification tying operative-note evidence to the retrieved CPT JSON object's required elements.
- evidence: minimal verbatim snippet(s) from the operative note that prove the selection (array of strings if multiple).
- citationParentId: the 'parentId' field from the matched JSON object in +(final-index) or +(updated-cpt) (null if not present).
- ncciChecks: array of objects for each relevant NCCI edit consulted that affected this code. Each object MUST include:
    - editId: identifier from the ncci JSON object (if present) or an autogenerated short id.
    - pair: ["codeA","codeB"] the codes involved in the NCCI entry.
    - columnDesignation: e.g., "Column1" or "Column2" (if present).
    - editType: value from ncci object (e.g., "bundling","mutuallyExclusive","columnPair","exception").
    - allowWithModifier: boolean (if present).
    - action: one of ["noConflict","blocked","requires_modifier","exception_allows"] — the action you applied based on the note and retrieved data.
    - ncciEvidence: minimal verbatim snippet from the ncci JSON object (e.g., exceptionNotes or sourceLine) that justifies the action.
- compliance: object summarizing compliance outcome for THIS procedure:
    - status: one of ["compliant","noncompliant","requires_modifier_documentation","manual_review_needed"].
    - complianceRationale: one-sentence explanation derived only from retrieved CPT and NCCI JSON objects and the operative note evidence.
    - complianceSources: array of source identifiers (e.g., names of the indexes/objects used: "final-index:<id>", "ncci-rag:<editId>").

GLOBAL RULES & RESTRICTIONS:
- Choose the single best CPT per discrete procedure; prefer higher-level codes only if clearly supported by note + retrieved JSON metadata.
- At least one procedure must be present in output.
- No modifier suggestions. Do NOT add modifiers in cptCode. If a modifier would be required by NCCI, mark 'requires_modifier_documentation' and set eligible=false unless documentation supports it.
- No ranges. No freeform prose outside the JSON.
- All selection, bundling, and compliance decisions MUST be traceable to (and supported by) retrieved JSON objects from +(updated-cpt), +(final-index), and +(ncci-rag) and to verbatim evidence from the operative note.
- If conflicting authoritative retrievals exist (e.g., final-index indicates separate-payable but ncci-rag edit blocks), NCCI edits take precedence for bundling/compliance decisions. Reflect this in 'compliance' and 'ncciChecks'.
- If you cannot fully resolve an NCCI conflict from the retrieved objects and operative note, mark compliance.status = "manual_review_needed" and include the minimal reason and the ncciChecks that caused ambiguity.

EXAMPLE OUTPUT JSON (illustrative):
{
  "procedures": [
    {
      "id": "P1",
      "details": "Open abdominal exploratory for suspected perforation",
      "keyFactors": ["open","exploratory","abdomen"],
      "cptCode": "49000",
      "eligible": true,
      "addOn": false,
      "linkedPrimaryId": null,
      "rationale": "Operative note documents open exploratory laparotomy matching required elements in the retrieved CPT JSON.",
      "evidence": ["Exploratory laparotomy through midline incision"],
      "citationParentId": "AMA-CPT-ABDOMEN",
      "ncciChecks": [
        {
          "editId": "NCCI-1234",
          "pair": ["49000","49002"],
          "columnDesignation": "Column1/Column2",
          "editType": "columnPair",
          "allowWithModifier": false,
          "action": "noConflict",
          "ncciEvidence": "No prohibiting edit found for 49000 when paired with 49002 in the retrieved ncci record."
        }
      ],
      "compliance": {
        "status": "compliant",
        "complianceRationale": "No NCCI edits prohibit this code in combination and CPT JSON object requirements are met by documentation.",
        "complianceSources": ["final-index:AMA-CPT-ABDOMEN","ncci-rag:NCCI-1234"]
      }
    }
  ]
}

CRITICAL FORMATTING:
- Return JSON only (no prose). Ensure valid JSON and proper escaping.
- Every factual assertion about eligibility, bundling, or compliance must cite data that came from retrieved JSON objects (final-index/updated-cpt/ncci-rag) or verbatim operative-note evidence (these appear in 'evidence' and 'ncciChecks.ncciEvidence' and 'complianceSources').

IMPLEMENTATION NOTES (for the agent that will run this prompt):
- Query order preference: exact code lookup in +(updated-cpt) -> +(final-index) exact -> +(final-index) semantic -> +(ncci-rag) semantic/exact for single code and pairwise.
- When presenting ncciChecks.editId or complianceSources, surface the unique identifier included in the retrieved object (if present) so downstream reviewers can find the exact ncci-edits.txt line.
- Keep the prompt string editable and concise in structure—this string is intended to be dropped into the coding agent's configuration unchanged."""


med_note = (
"NOTE:"
    "PREOPERATIVE DIAGNOSIS:\n"
    "Massive recurrent ventral incisional hernia \n"
    "\n"
    "POSTOPERATIVE DIAGNOSIS:\n"
    "Massive incarcerated recurrent ventral incisional hernia measuring 15 x 30 cm M2 through M4.\n"
    "\n"
    "PROCEDURES:\n"
    "1. 1. Exploratory laparotomy with lysis of adhesiosn \n"
    "2. 2. Excisional debridement of nonviable muscle and fascia of abdominal wall including infected mesh, suture, and tacks \n"
    "3. 3. Ventral incisional hernia repair with bridging Phasix ST mesh 10x4cm\n"
    "4. 4. Disposable negative pressure wound therapy placement 50cm2.\n"
    "\n"
    "ANESTHESIA:\n"
    "General endotracheal, local.\n"
    "\n"
    "ESTIMATED BLOOD LOSS:\n"
    "200.\n"
    "\n"
    "COMPLICATIONS:\n"
    "None apparent.\n"
    "\n"
    "SPECIMENS:\n"
    "Excisional debridement and surgical foreign body\n"
    "\n"
    "Edwin Raymond Pynenberg is a 69 year old male with a symptomatic recurrent massive ventral incisional hernia and recurrent metastatic colon cancer of the liver. He was scheduled for resection of the liver mets and I was asked to assist with entry and closure given the complex abdominal wall.  All risks and benefits were discussed with the patient and operative consent was obtained.\n"
    "\n"
    "The patient was taken to the OR and transferred to the OR table in supine position. A preop time-out was performed and all were in agreement. Patient received preoperative antibiotics and heparin. SCDs were placed. General endotracheal anesthesia was induced. A Foley catheter was placed. We began with an upper abdominal midline laparotomy and entered the abdomen safely. We encountered the hernia sac. We incised this. We encountered dense omental adhesions. We performed an extensive adhesiolysis. Of note modifier 22 should be added for complexity of the case due to the multiple recurrent hernias, and patient body habitus, all of which increased operative difficulty. \n"
    "\n"
    "Once we had taken down the midline we performed a complete intraabdominal adhesiolysis. Once we performed that, we performed excisional debridement of nonviable muscle, fascia, subcutaneous tissue and hernia sac.  There was one full-thickness enterotomy which was repaired with 3-0 vicryl sutures transversely.  This was inherent with the complexity of the case. I then turned the case over to Dr. Weber for her portion of the case.  \n"
    "\n"
    "After Dr. Weber's portion I then assumed control of the case.  All counts were reported correct. We then debrided the old surgical foreign body and nonviable muscle and fascia until we got back to healthy tissue. We were then left with the abdominal wall and healthy native fascia.  We then took our healthy anterior fascial edges bilaterally and closed with interrupted figure-of-eight #1 PDS sutures. This brought the fascia together nicely without significant tension except for a small 10x2cm area in the M3 zone where I felt the tension would be too great for a durable closure.  We chose to suture in a bridge of Phasix ST mesh with the coated side against the viscera.  We used #1 Prolene to suture this in circumferentially. We then irrigated with 2L irrisept  and then washed with saline.  We placed a drain in the subq space and then closed the skin with staples with disposable NPWT over the top.  \n"
    "\n"
    "I was present and scrubbed for the duration of the case. All counts were reported as correct to me at the completion of the case.\n"
)
codes = (
"49000 - Exploratory laparotomy",
"44005 - Enterolysis (lysis of adhesions)",
"11043 - Debridement, muscle/fascia (first 20 sq cm)",
"11046 - Debridement, muscle/fascia (each additional 20 sq cm)",
"49566 - Repair recurrent incarcerated ventral incisional hernia",
"49568 - Mesh/prosthesis implantation for ventral/incisional hernia",
"44602 - Suture repair of small intestine perforation (enterotomy)",
"97605 - Negative pressure wound therapy, ≤50 sq cm",
)



messages = [
    {"role": "user", "content": "this a test, say OK, and look up the code for laparascopy and return what the rag returns you."}
]


# ⏱️ Start timer
start_time = time.perf_counter()

response = client.chat.completions.create(
    model=chat_deployment,
    messages=messages,
    # temperature=0.1,
    extra_body={
        "data_sources": [{
            "type": "azure_search",
            "parameters": {
                "endpoint": search_endpoint,
                "index_name": search_index,
                "query_type": "simple",
                # "semantic_configuration": "updated-cpt-semantic-configuration",
                "embedding_dependency": {
                    "type": "deployment_name",
                    "deployment_name": embeddings_deployment  # "text-embedding-ada-002"
                },
                "fields_mapping": {
                # The text the model should read
                "content_fields": ["DESCRIPTION"],
                # The vector field(s) used for ANN search
                "vector_fields": ["DESCRIPTIONVector"],
                # What to display as a title in citations
                "title_field": "HCPCS",
                # Optional: include if you want to surface where it came from
                "filepath_field": "parent_id"
                # If you later add a URL field, e.g. "url_field": "source_url"
        },
                "in_scope": True,
                "strictness": 3,
                "top_n_documents": 5,
                "authentication": {
                    "type": "api_key",
                    "key": search_key
                }
            }
        }]
    }
)

print(response.choices[0].message.content)



# ⏱️ End timer
end_time = time.perf_counter()
elapsed = end_time - start_time

print(response.choices[0].message.content)
print(f"\n⏱️ Call took {elapsed:.2f} seconds")