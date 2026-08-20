"""
0_sanity_check.py — Quick XML parse test before running the full pipeline.
Run this first to confirm AMI word files are readable.

Usage:
    python3 scripts/experiment3/0_sanity_check.py
"""

import xml.etree.ElementTree as ET
from pathlib import Path

AMI_DIR = Path("data/ami_public_manual_1.6.2/words")

MEETING_IDS = [
    "ES2002a", "ES2003a", "ES2004a", "ES2005a", "ES2006a",
    "IS1000a", "IS1001a", "IS1003a",
    "TS3003a", "TS3004a",
]

print("=== AMI Sanity Check ===\n")

all_ok = True
for meeting_id in MEETING_IDS:
    files = sorted(AMI_DIR.glob(f"{meeting_id}.*.words.xml"))
    if not files:
        print(f"  MISSING: {meeting_id} — no word files found in {AMI_DIR}")
        all_ok = False
        continue

    total_words = 0
    for f in files:
        tree = ET.parse(f)
        root = tree.getroot()
        words = [w.text for w in root.findall(".//w") if w.text and w.text.strip()]
        total_words += len(words)

    sample_file = files[0]
    tree = ET.parse(sample_file)
    root = tree.getroot()
    sample_words = [w.text for w in root.findall(".//w") if w.text and w.text.strip()]
    print(f"  {meeting_id}: {len(files)} speakers, {total_words} total words")
    print(f"    Sample ({sample_file.name}): {' '.join(sample_words[:20])}")
    print()

if all_ok:
    print("All 10 meetings found. Ready to run 1_parse_ami.py.")
else:
    print("Fix missing meetings before proceeding.")
