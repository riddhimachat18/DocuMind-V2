"""
exp3_iaa_sample.py — Extract a stratified IAA sample from the Experiment 3
citation verification sheet for second-annotator validation.

Selects a balanced sample across verdict types (SUPPORTS/PARTIALLY/DOES_NOT_SUPPORT)
and source modalities (email/transcript).

Reads from:  data/experiment3/citation_verification_sheet_annotated.csv
Writes to:   scripts/iaa/exp3_iaa_sheet.csv   ← give to second annotator

Usage:
    python3 scripts/iaa/exp3_iaa_sample.py
"""

import csv
import random
from pathlib import Path

SRC = Path("data/experiment3/citation_verification_sheet_annotated.csv")
OUT = Path("scripts/iaa/exp3_iaa_sheet.csv")
OUT.parent.mkdir(parents=True, exist_ok=True)

VALID_VERDICTS = {"SUPPORTS", "PARTIALLY", "DOES_NOT_SUPPORT"}
RANDOM_SEED = 42
N_TOTAL = 20  # manageable for a second annotator


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

    # Proportional sampling, minimum 1 per class
    total = len(rows)
    for verdict, pool in by_verdict.items():
        n = max(1, round(N_TOTAL * len(pool) / total))
        n = min(n, len(pool))
        sample.extend(random.sample(pool, n))

    # Trim to N_TOTAL if over
    random.shuffle(sample)
    sample = sample[:N_TOTAL]

    fieldnames = [
        "brd_id",
        "source_type",
        "source_label",
        "section",
        "brd_sentence",
        "source_snippet_1",
        "source_snippet_2",
        "annotator1_verdict",   # YOUR verdict (hide from annotator 2)
        "annotator2_verdict",   # BLANK — second annotator fills this in
        "annotator2_notes",
    ]

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in sample:
            writer.writerow({
                "brd_id":            row["brd_id"],
                "source_type":       row["source_type"],
                "source_label":      row.get("source_label", ""),
                "section":           row["section"],
                "brd_sentence":      row["brd_sentence"],
                "source_snippet_1":  row.get("source_snippet_1", ""),
                "source_snippet_2":  row.get("source_snippet_2", ""),
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
