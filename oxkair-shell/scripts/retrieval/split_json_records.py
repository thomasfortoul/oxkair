#!/usr/bin/env python3
import os
import json

# Path to your big JSON file
INPUT_FILE = "public/coder/data/RVU/physician_fee_schedule_processed.json"
# Directory where individual JSONs will go
OUTPUT_DIR = "public/coder/data/RVU/records"

def main():
    # 1. Ensure the output folder exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 2. Load the master JSON
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # 3. Write one file per record, named <HCPCS>.json
    for code, record in data.items():
        out_path = os.path.join(OUTPUT_DIR, f"{code}.json")
        with open(out_path, "w", encoding="utf-8") as out:
            json.dump(record, out, ensure_ascii=False, indent=2)
    
    print(f"✅ Split {len(data)} records into {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
