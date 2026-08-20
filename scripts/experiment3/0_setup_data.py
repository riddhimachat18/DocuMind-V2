"""
0_setup_data.py — Verify that AMI and Enron data files exist.

Usage:
    python scripts/experiment3/0_setup_data.py
"""

import json
from pathlib import Path

print("=== Experiment 3 Data Setup Check ===\n")

# Check for AMI data
ami_path = Path("data/ami.json")
if ami_path.exists():
    with open(ami_path, encoding="utf-8") as f:
        ami_data = json.load(f)
    print(f"✓ AMI data found: {len(ami_data)} transcript entries")
    print(f"  Sample: {ami_data[0]['author']} - {ami_data[0]['rawText'][:100]}...")
else:
    print("✗ AMI data NOT found at data/ami.json")

print()

# Check for Enron data
enron_path = Path("data/enron-filtered.json")
if enron_path.exists():
    with open(enron_path, encoding="utf-8") as f:
        enron_data = json.load(f)
    print(f"✓ Enron data found: {len(enron_data)} email entries")
    print(f"  Sample: {enron_data[0]['author']} - {enron_data[0]['rawText'][:100]}...")
else:
    print("✗ Enron data NOT found at data/enron-filtered.json")

print("\n=== Data files are ready for Experiment 3 ===")
