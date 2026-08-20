"""
exp3_iaa_sample.py — Extract a stratified IAA sample from the Experiment 3
citation verification sheet for second-annotator validation.

Selects a balanced sample across verdict types (SUPPORTS/PARTIALLY/DOES_NOT_SUPPORT)
and source modalities (email/transcript).

Reads from:  data/experiment3/citation_verification_sheet_production_v2_annotated.csv
Writes to:   scripts/iaa/exp3_iaa_sheet.csv   ← give to second annotator

Usage:
    python3 scripts/iaa/exp3_iaa_sample.py
"""

import csv
import random
from pathlib import Path

# Get the project root (2 levels up from this script)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

SRC = PROJECT_ROOT / "data/experiment3/citation_verification_sheet_production_v2_annotated.csv"
OUT = SCRIPT_DIR / "exp3_iaa_sheet.csv"
OUT.parent.mkdir(parents=True, exist_ok=True)

VALID_VERDICTS = {"SUPPORTS", "PARTIALLY", "DOES_NOT_SUPPORT"}
RANDOM_SEED = 42
N_TOTAL = 20  # manageable for a second annotator

# Fixed sampling targets to ensure minority classes are represented
SAMPLE_TARGETS = {
    "DOES_NOT_SUPPORT": 4,
    "PARTIALLY": 3,
    "SUPPORTS": 13,  # Remaining to reach N_TOTAL
}


def main():
    with open(SRC, encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f)
                if r.get("annotator1_verdict", "").strip() in VALID_VERDICTS]

    print(f"Total annotated rows: {len(rows)}")

    # Stratify by verdict
    by_verdict: dict[str, list] = {v: [] for v in VALID_VERDICTS}
    for row in rows:
        by_verdict[row["annotator1_verdict"].strip()].append(row)

    for v, pool in by_verdict.items():
        print(f"  {v}: {len(pool)}")

    random.seed(RANDOM_SEED)
    sample = []

    # Fixed sampling to ensure minority classes are well-represented
    for verdict, target in SAMPLE_TARGETS.items():
        pool = by_verdict[verdict]
        n = min(target, len(pool))
        if n < target:
            print(f"  Warning: Only {n} {verdict} samples available (target: {target})")
        selected = random.sample(pool, n)
        sample.extend(selected)
        print(f"  Sampled {n} {verdict}")
    
    # Shuffle the final sample
    random.shuffle(sample)

    fieldnames = [
        "brd_id",
        "section",
        "sentence",
        "citation_count",
        "source_type",
        "snippet_1",
        "snippet_2",
        "snippet_3",
        "annotator1_verdict",   # YOUR verdict (hide from annotator 2)
        "annotator2_verdict",   # BLANK — second annotator fills this in
        "annotator2_notes",
    ]

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in sample:
            # Simply copy the snippet columns from the source CSV
            writer.writerow({
                "brd_id":            row["brd_id"],
                "section":           row["section"],
                "sentence":          row["sentence"],
                "citation_count":    row.get("citation_count", ""),
                "source_type":       row["source_type"],
                "snippet_1":         row.get("snippet_1", ""),
                "snippet_2":         row.get("snippet_2", ""),
                "snippet_3":         row.get("snippet_3", ""),
                "annotator1_verdict": row["annotator1_verdict"],
                "annotator2_verdict": "",
                "annotator2_notes":   "",
            })

    print(f"\nSampled {len(sample)} rows → {OUT}")
    print()
    print("IMPORTANT: Before giving to second annotator, hide the")
    print("annotator1_verdict column (or delete it from their copy).")
    print("Reveal it only after they have finished.")


if __name__ == "__main__":
    main()
