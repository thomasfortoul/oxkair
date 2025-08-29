import os
import json
import re

def extract_hcpcs_codes(json_dir, output_md_file):
    """
    Extracts the 'code' field from all JSON files in a directory
    and writes them to a Markdown file.
    """
    codes = []
    code_pattern = re.compile(r"^[A-Z0-9]+-[A-Z0-9]+\.json$")

    for filename in os.listdir(json_dir):
        if code_pattern.match(filename):
            filepath = os.path.join(json_dir, filename)
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    if "code" in data and "description" in data:
                        code = data['code']
                        description = data['description']
                        # Remove the code from the beginning of the description if it's present
                        if description.startswith(code + " "):
                            description = description[len(code) + 1:].strip()
                        codes.append(f"{code}: {description}")
            except json.JSONDecodeError:
                print(f"Error decoding JSON from {filepath}")
            except Exception as e:
                print(f"An error occurred while reading {filepath}: {e}")

    codes.sort() # Sort the codes alphabetically

    with open(output_md_file, 'w') as f:
        f.write("# HCPCS Codes and Descriptions\n\n")
        for code_info in codes:
            f.write(f"- {code_info}\n")

if __name__ == "__main__":
    json_directory = "oxkair-shell/public/coder/data/Codes/hcpcs_json"
    output_markdown_file = "hcpcs_codes.md"
    extract_hcpcs_codes(json_directory, output_markdown_file)
    print(f"Extracted HCPCS codes to {output_markdown_file}")