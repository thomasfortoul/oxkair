#!/usr/bin/env python3
"""
Script to parse `cci_practitioner.json` and split its `cci_edits` entries into
individual JSON files, one per code, in a new `practitioner_codes` folder.
"""
import json
import os
import sys


def parse_cci_practitioner(json_file_path: str) -> None:
    """
    Parses the specified cci_practitioner.json file and creates a subfolder
    `practitioner_codes` alongside it, containing one JSON file per code.

    :param json_file_path: Path to the input JSON file.
    """
    # Determine base directory and output folder path
    base_dir = os.path.dirname(os.path.abspath(json_file_path))
    output_folder = os.path.join(base_dir, 'practitioner_codes')

    # Create the output folder if it doesn't exist
    os.makedirs(output_folder, exist_ok=True)
    print(f"Using output directory: {output_folder}")

    # Load the JSON file
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Input file not found: {json_file_path}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Failed to parse JSON: {e}")
        sys.exit(1)

    # Extract the cci_edits section
    edits = data.get('cci_edits')
    if not isinstance(edits, dict):
        print("Error: Expected top-level key 'cci_edits' with a dictionary value.")
        sys.exit(1)

    # Write each code's details to its own file
    for code, details in edits.items():
        filename = f"{code}.json"
        output_path = os.path.join(output_folder, filename)
        try:
            with open(output_path, 'w', encoding='utf-8') as out_f:
                json.dump(details, out_f, indent=4)
        except IOError as e:
            print(f"Warning: Could not write {output_path}: {e}")

    print("Done: individual code files created.")


if __name__ == '__main__':
    # Default path; adjust if needed or pass as first argument
    default_path = os.path.join(
        'oxkair-shell', 'public', 'coder', 'data', 'CCI', 'cci_hospital.json'
    )
    input_path = sys.argv[1] if len(sys.argv) > 1 else default_path
    parse_cci_practitioner(input_path)
