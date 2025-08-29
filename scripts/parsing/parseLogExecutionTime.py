#!/usr/bin/env python3
"""
parse_workflow_summary.py

Locate the latest workflow directory under ../oxkair-shell/testing/automated_results,
load its workflow_summary.log (JSON), extract all executionTrace entries with executionTime,
then output:
 1. Chronological list of trace events (component and stepId) with durations.
 2. Ordered list by longest executionTime first.

Usage:
    python parse_workflow_summary.py
"""
import os
import json
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent / 'oxkair-shell' / 'testing' / 'automated_results'


def find_latest_dir(base_dir):
    # List directories sorted by name (ISO timestamp)
    dirs = [d for d in base_dir.iterdir() if d.is_dir()]
    if not dirs:
        raise FileNotFoundError(f"No subdirectories in {base_dir}")
    latest = sorted(dirs)[-1]
    return latest


def load_summary(latest_dir):
    # Find any subdirectory in latest_dir instead of hardcoding 'Case_17'
    case_dirs = [d for d in latest_dir.iterdir() if d.is_dir()]
    if not case_dirs:
        raise FileNotFoundError(f"No case directories found in {latest_dir}")
    
    # Use the first case directory found
    case_dir = case_dirs[0]
    summary_path = case_dir / 'workflow_summary.log'
    
    if not summary_path.exists():
        raise FileNotFoundError(f"Summary file not found: {summary_path}")
    with open(summary_path, 'r') as f:
        return json.load(f)


def parse_traces(summary):
    entries = []
    for trace in summary.get('executionTrace', []):
        meta = trace.get('metadata', {})
        exec_time = meta.get('executionTime')
        if exec_time is None:
            continue
        ts = trace.get('timestamp')
        # Convert ms timestamp to ISO
        try:
            ts_iso = datetime.fromtimestamp(ts / 1000).isoformat()
        except Exception:
            ts_iso = str(ts)
        component = trace.get('component')
        step_id = trace.get('stepId', '')
        entries.append({
            'timestamp': ts_iso,
            'component': component,
            'stepId': step_id,
            'duration': exec_time
        })
    return entries


def print_reports(entries):
    # Chronological by timestamp
    chrono = sorted(entries, key=lambda x: x['timestamp'])
    # By duration descending
    by_dur = sorted(entries, key=lambda x: x['duration'], reverse=False)

    print("Chronological execution traces with durations:")
    for e in chrono:
        print(f"{e['component']} ({e['stepId']}): {e['duration']}ms")

    print("\nTop longest executions:")
    for e in by_dur:
        print(f"{e['duration']}ms - {e['component']} - ({e['stepId']})")


def main():
    latest = find_latest_dir(BASE_DIR)
    summary = load_summary(latest)
    entries = parse_traces(summary)
    if not entries:
        print("No executionTime entries found in executionTrace.")
    else:
        print_reports(entries)


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"Error: {e}")
        exit(1)
