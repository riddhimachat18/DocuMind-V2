"""
exp2_compute_kappa.py — Compute Cohen's κ for Experiment 2 Track B
gold standard validation.

Reads from:  scripts/iaa/exp2_iaa_sheet.csv   (filled by second annotator)
Prints:      κ, confusion matrix, disagreement analysis

Usage:
    python3 scripts/iaa/exp2_compute_kappa.py
"""

import csv
from pathlib import Path
from collections import Counter

import pandas as pd
from sklearn.metrics import cohen_kappa_score, confusion_matrix

SHEET = Path("scripts/iaa/exp2_iaa_sheet.csv")
VALID_LABELS = {"REQ", "DEC", "CON", "NONE"}


def main():
    df = pd.read_csv(SHEET)

    # Normalise
    df["annotator1_label"] = df["annotator1_label"].str.strip().str.upper()
    df["annotator2_label"] = df["annotator2_label"].str.strip().str.upper()

    # Drop rows where annotator2 hasn't filled in a label
    filled = df[df["annotator2_label"].isin(VALID_LABELS)].copy()
    missing = len(df) - len(filled)
    if missing > 0:
        print(f"WARNING: {missing} rows have no annotator2 label — excluded")

    if len(filled) < 10:
        print("ERROR: fewer than 10 labelled rows. Fill in annotator2_label first.")
        return

    a1 = filled["annotator1_label"].tolist()
    a2 = filled["annotator2_label"].tolist()

    kappa = cohen_kappa_score(a1, a2)
    labels = sorted({"REQ", "DEC", "CON", "NONE"})

    print(f"=== Experiment 2 — Track B Gold Standard IAA ===")
    print(f"n (sentences):     {len(filled)}")
    print(f"Cohen's κ:         {kappa:.3f}")

    if kappa >= 0.80:
        interpretation = "substantial agreement — gold standard is reliable"
    elif kappa >= 0.60:
        interpretation = "moderate agreement — note disagreement patterns"
    else:
        interpretation = "fair/poor agreement — discuss as limitation"
    print(f"Interpretation:    {interpretation}")

    print()
    print("Confusion matrix (rows=annotator1, cols=annotator2):")
    cm = confusion_matrix(a1, a2, labels=labels)
    header = f"{'':6}" + "".join(f"{l:>6}" for l in labels)
    print(header)
    for i, row_label in enumerate(labels):
        row_str = f"{row_label:6}" + "".join(f"{cm[i][j]:>6}" for j in range(len(labels)))
        print(row_str)

    print()
    print("Disagreements:")
    disagree = filled[filled["annotator1_label"] != filled["annotator2_label"]]
    print(f"  Total: {len(disagree)}/{len(filled)} ({len(disagree)/len(filled)*100:.1f}%)")
    if len(disagree) > 0:
        pairs = Counter(zip(disagree["annotator1_label"], disagree["annotator2_label"]))
        for (a, b), count in pairs.most_common():
            print(f"  A1={a} vs A2={b}: {count}")
        print()
        print("Sample disagreements (first 5):")
        for _, row in disagree.head(5).iterrows():
            print(f"  [{row['thread_id']}] A1={row['annotator1_label']} A2={row['annotator2_label']}")
            print(f"    {row['sentence'][:100]}")


if __name__ == "__main__":
    main()
