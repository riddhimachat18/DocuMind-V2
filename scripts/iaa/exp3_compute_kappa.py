"""
exp3_compute_kappa.py — Compute Cohen's κ for Experiment 3 citation
verification IAA validation.

Reads from:  scripts/iaa/exp3_iaa_sheet.csv   (filled by second annotator)
Prints:      κ, confusion matrix, disagreement analysis

Usage:
    python3 scripts/iaa/exp3_compute_kappa.py
"""

import csv
from pathlib import Path
from collections import Counter

import pandas as pd
from sklearn.metrics import cohen_kappa_score, confusion_matrix

SHEET = Path("scripts/iaa/exp3_iaa_sheet.csv")
VALID_LABELS = ["SUPPORTS", "PARTIALLY", "DOES_NOT_SUPPORT"]


def main():
    df = pd.read_csv(SHEET)

    df["annotator1_verdict"] = df["annotator1_verdict"].str.strip().str.upper()
    df["annotator2_verdict"] = df["annotator2_verdict"].str.strip().str.upper()

    filled = df[df["annotator2_verdict"].isin(VALID_LABELS)].copy()
    missing = len(df) - len(filled)
    if missing > 0:
        print(f"WARNING: {missing} rows have no annotator2 verdict — excluded")

    if len(filled) < 5:
        print("ERROR: fewer than 5 labelled rows. Fill in annotator2_verdict first.")
        return

    a1 = filled["annotator1_verdict"].tolist()
    a2 = filled["annotator2_verdict"].tolist()

    kappa = cohen_kappa_score(a1, a2)

    print(f"=== Experiment 3 — Citation Verification IAA ===")
    print(f"n (citations):     {len(filled)}")
    print(f"Cohen's κ:         {kappa:.3f}")

    if kappa >= 0.80:
        interpretation = "substantial agreement — citation accuracy claim is reliable"
    elif kappa >= 0.60:
        interpretation = "moderate agreement — note disagreement patterns"
    else:
        interpretation = "fair/poor agreement — discuss as limitation"
    print(f"Interpretation:    {interpretation}")

    print()
    print("Confusion matrix (rows=annotator1, cols=annotator2):")
    cm = confusion_matrix(a1, a2, labels=VALID_LABELS)
    header = f"{'':22}" + "".join(f"{l:>22}" for l in VALID_LABELS)
    print(header)
    for i, row_label in enumerate(VALID_LABELS):
        row_str = f"{row_label:22}" + "".join(f"{cm[i][j]:>22}" for j in range(len(VALID_LABELS)))
        print(row_str)

    print()
    disagree = filled[filled["annotator1_verdict"] != filled["annotator2_verdict"]]
    print(f"Disagreements: {len(disagree)}/{len(filled)} ({len(disagree)/len(filled)*100:.1f}%)")
    if len(disagree) > 0:
        pairs = Counter(zip(disagree["annotator1_verdict"], disagree["annotator2_verdict"]))
        for (a, b), count in pairs.most_common():
            print(f"  A1={a} vs A2={b}: {count}")


if __name__ == "__main__":
    main()
