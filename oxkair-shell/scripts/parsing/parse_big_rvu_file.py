#!/usr/bin/env python3
import os
import json
import argparse
import math

def normalize_key(key: str) -> str:
    """
    Replace en–dash with hyphen and strip whitespace.
    """
    return key.replace('–', '-').strip()

def normalize_value(val):
    """
    Convert NaN to None, strip whitespace on strings; leave other types alone.
    """
    if isinstance(val, float) and math.isnan(val):
        return None
    if isinstance(val, str):
        return val.strip()
    return val

def main():
    parser = argparse.ArgumentParser(
        description="Parse a JSON array (even in a .txt), clean fields, handle NaN, and split into per-HCPCS files."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to the input JSON/.txt file containing a top-level list of records"
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Directory where individual <HCPCS>.json files will be written"
    )
    args = parser.parse_args()

    # 1. Load and validate
    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected top-level list, got {type(data)}")

    # 2. Prepare output directory
    os.makedirs(args.output_dir, exist_ok=True)

    # 3. Process each record
    count = 0
    for rec in data:
        raw_code = rec.get("HCPCS")
        if raw_code is None:
            print("⚠️ Skipping record without HCPCS:", rec)
            continue
        code = str(raw_code).strip()

        cleaned = {}
        for k, v in rec.items():
            new_k = normalize_key(k)
            new_v = normalize_value(v)
            cleaned[new_k] = new_v

        cleaned["HCPCS"] = code

        out_path = os.path.join(args.output_dir, f"{code}.json")
        with open(out_path, "w", encoding="utf-8") as out_f:
            json.dump(cleaned, out_f, ensure_ascii=False, indent=2)

        count += 1

    print(f"✅ Processed {count} records → {args.output_dir}")

if __name__ == "__main__":
    main()
