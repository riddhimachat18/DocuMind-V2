"""
exp3_compute_kappa.py — Compute Cohen's κ for Experiment 3 citation
verification IAA validation.

Reads from:  scripts/iaa/exp3_iaa_sheet.csv   (filled by second annotator)
Writes to:   scripts/iaa/exp3_kappa_report.txt
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
OUT_REPORT = Path("scripts/iaa/exp3_kappa_report.txt")
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
    
    # Calculate agreement rate
    agreements = sum(1 for x, y in zip(a1, a2) if x == y)
    agreement_rate = agreements / len(filled)

    # Build report
    report = f"""{'='*70}
EXPERIMENT 3 — CITATION VERIFICATION IAA REPORT
{'='*70}

DATASET
-------
Total citations annotated:  {len(filled)}
Agreements:                 {agreements} ({agreement_rate*100:.1f}%)
Disagreements:              {len(filled) - agreements} ({(1-agreement_rate)*100:.1f}%)

COHEN'S KAPPA
-------------
κ = {kappa:.3f}

Interpretation:
  κ < 0.00   : No agreement
  0.00-0.20  : Slight agreement
  0.21-0.40  : Fair agreement
  0.41-0.60  : Moderate agreement
  0.61-0.80  : Substantial agreement
  0.81-1.00  : Almost perfect agreement

"""

    if kappa >= 0.80:
        interpretation = "Almost perfect agreement - citation accuracy claim is highly reliable"
        report += f"✓ {interpretation}\n"
    elif kappa >= 0.60:
        interpretation = "Substantial agreement - citation accuracy claim is reliable"
        report += f"✓ {interpretation}\n"
    elif kappa >= 0.40:
        interpretation = "Moderate agreement - acceptable for exploratory research"
        report += f"✓ {interpretation}\n"
    else:
        interpretation = "Fair/poor agreement - discuss as limitation"
        report += f"⚠ {interpretation}\n"

    report += f"\n{'='*70}\n"
    report += "CONFUSION MATRIX\n"
    report += f"{'='*70}\n\n"
    report += "Rows = Annotator 1, Columns = Annotator 2\n\n"
    
    cm = confusion_matrix(a1, a2, labels=VALID_LABELS)
    header = f"{'':22}" + "".join(f"{l:>22}" for l in VALID_LABELS)
    report += header + "\n"
    report += "-" * len(header) + "\n"
    for i, row_label in enumerate(VALID_LABELS):
        row_str = f"{row_label:22}" + "".join(f"{cm[i][j]:>22}" for j in range(len(VALID_LABELS)))
        report += row_str + "\n"

    report += f"\n{'='*70}\n"
    report += "LABEL DISTRIBUTION\n"
    report += f"{'='*70}\n\n"
    
    count1 = Counter(a1)
    count2 = Counter(a2)
    
    report += "Label                Annotator1    Annotator2\n"
    report += "-" * 45 + "\n"
    for label in VALID_LABELS:
        report += f"{label:20} {str(count1[label]):13} {count2[label]}\n"

    disagree = filled[filled["annotator1_verdict"] != filled["annotator2_verdict"]]
    
    if len(disagree) > 0:
        report += f"\n{'='*70}\n"
        report += f"DISAGREEMENTS ({len(disagree)} citations)\n"
        report += f"{'='*70}\n\n"
        
        pairs = Counter(zip(disagree["annotator1_verdict"], disagree["annotator2_verdict"]))
        for (a, b), count in pairs.most_common():
            report += f"  A1={a} vs A2={b}: {count}\n"
        
        # Show first few disagreement examples
        report += f"\nExample Disagreements:\n\n"
        for idx, row in disagree.head(5).iterrows():
            report += f"BRD ID: {row['brd_id']}\n"
            report += f"  Sentence: {row['sentence'][:100]}...\n"
            report += f"  Annotator1: {row['annotator1_verdict']}\n"
            report += f"  Annotator2: {row['annotator2_verdict']}\n"
            report += "\n"

    report += f"{'='*70}\n"
    report += "RECOMMENDATION FOR PAPER\n"
    report += f"{'='*70}\n\n"
    report += f"Report Cohen's κ = {kappa:.3f} as validation of citation verification.\n"
    report += f"Sample: {len(filled)} citations stratified across verdict types.\n"
    report += f"Agreement rate: {agreement_rate*100:.1f}%\n"
    report += f"\nInterpretation: {interpretation}\n"
    report += f"{'='*70}\n"

    # Print to console
    print(report)
    
    # Save to file
    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"\n✓ Report saved to: {OUT_REPORT}")


if __name__ == "__main__":
    main()
