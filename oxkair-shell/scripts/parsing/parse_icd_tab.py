import json
import os

def parse_icd_tab(input_file_path, output_directory):
    """
    Parses the monolithic ICD-tab.json file and outputs individual JSON files
    for each code.
    """
    if not os.path.exists(output_directory):
        os.makedirs(output_directory)

    with open(input_file_path, 'r', encoding='utf-8') as f:
        full_data = json.load(f)

    # The actual data is nested under "ICD10CM.tabular"
    data = full_data.get("ICD10CM.tabular", {})
    chapters = data.get("chapter", [])

    def extract_notes(note_obj):
        if isinstance(note_obj, dict) and "note" in note_obj:
            note_content = note_obj["note"]
            if isinstance(note_content, list):
                return [str(item) if not isinstance(item, dict) else item.get("note", "") for item in note_content]
            elif isinstance(note_content, dict) and "note" in note_content:
                return [str(note_content["note"])]
            else:
                return [str(note_content)]
        return []

    def process_diag_entry(entry, current_chapter_name, current_block_name):
        if not isinstance(entry, dict):
            return # Skip if entry is not a dictionary

        code = entry.get("name")
        description = entry.get("desc")
        
        if code and description:
            inclusion_terms = []
            if "inclusionTerm" in entry:
                inc_term = entry["inclusionTerm"]
                if isinstance(inc_term, dict) and "note" in inc_term:
                    note_content = inc_term["note"]
                    if isinstance(note_content, list):
                        inclusion_terms.extend(note_content)
                    else:
                        inclusion_terms.append(note_content)
                elif isinstance(inc_term, list):
                    for item in inc_term:
                        if isinstance(item, dict) and "note" in item:
                            note_content = item["note"]
                            if isinstance(note_content, list):
                                inclusion_terms.extend(note_content)
                            else:
                                inclusion_terms.append(note_content)
                elif isinstance(inc_term, str):
                    inclusion_terms.append(inc_term)

            excludes1_terms = None
            if "excludes1" in entry:
                exc1_term = entry["excludes1"]
                if isinstance(exc1_term, dict) and "note" in exc1_term:
                    note_content = exc1_term["note"]
                    if isinstance(note_content, list):
                        excludes1_terms = note_content
                    else:
                        excludes1_terms = [note_content]
                elif isinstance(exc1_term, list):
                    excludes1_terms = exc1_term
                elif isinstance(exc1_term, str):
                    excludes1_terms = [exc1_term]

            # Collect general notes from the entry if available
            notes_list = []
            if "notes" in entry:
                notes_list.extend(extract_notes(entry["notes"]))
            if "useAdditionalCode" in entry:
                notes_list.extend(extract_notes(entry["useAdditionalCode"]))
            if "codeAlso" in entry:
                notes_list.extend(extract_notes(entry["codeAlso"]))
            if "sevenChrDef" in entry:
                notes_list.extend(extract_notes(entry["sevenChrDef"]))
            
            # Combine all collected notes into a single string or None
            notes_str = "\n".join(notes_list) if notes_list else None

            individual_code_data = {
                "code": code,
                "description": description,
                "chapter": current_chapter_name,
                "block": current_block_name,
                "inclusionTerms": inclusion_terms if inclusion_terms else None,
                "excludes1": excludes1_terms,
                "notes": notes_str
            }
            
            output_file_path = os.path.join(output_directory, f"{code}.json")
            with open(output_file_path, 'w', encoding='utf-8') as outfile:
                json.dump(individual_code_data, outfile, indent=2)
            print(f"Created {output_file_path}")

        if "diag" in entry:
            for sub_entry in entry["diag"]:
                process_diag_entry(sub_entry, current_chapter_name, current_block_name)

    for chapter_entry in chapters:
        chapter_name = chapter_entry.get("name")
        sections = chapter_entry.get("section", [])
        
        for section_entry in sections:
            if not isinstance(section_entry, dict):
                continue # Skip if section_entry is not a dictionary
            block_name = section_entry.get("id")
            diagnoses = section_entry.get("diag", [])
            
            for diag_entry in diagnoses:
                process_diag_entry(diag_entry, chapter_name, block_name)

if __name__ == "__main__":
    input_file = "oxkair-shell/public/coder/data/Codes/ICD-tab.json"
    output_dir = "oxkair-shell/public/coder/data/Codes/processed_codes/"
    parse_icd_tab(input_file, output_dir)