"""
exp4_compute_kappa.py — Compute Cohen's κ for Experiment 4 IAA validation.

After the second annotator completes exp4_iaa_sheet.csv, this script:
  1. Loads both annotator labels from exp4_iaa_sheet_full.csv
  2. Computes Cohen's κ using sklearn
  3. Prints confusion matrix and disagreement breakdown
  4. Saves a report

Reads from:  scripts/iaa/exp4_iaa_sheet_full.csv (with both annotator labels filled)
Writes to:   scripts/iaa/exp4_kappa_report.txt

Usage:
    python scripts/iaa/exp4_compute_kappa.py
"""

import csv
from pathlib import Path
from sklearn.metrics import cohen_kappa_score, confusion_matrix
import numpy as np

# Get the project root
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

SRC = SCRIPT_DIR / "exp4_iaa_sheet_full.csv"
OUT = SCRIPT_DIR / "exp4_kappa_report.txt"

VALID_LABELS = {"CONTRADICTION", "OVERLAP", "IMPLICIT", "NO_CONFLICT"}


def main():
    if not SRC.exists():
        print(f"ERROR: File not found: {SRC}")
        print("\nPlease ensure:")
        print("1. exp4_iaa_sample.py has been run to generate exp4_iaa_sheet_full.csv")
        print("2. Second annotator has filled in annotator2_label column")
        print("3. You've copied their labels back into exp4_iaa_sheet_full.csv")
        return
    
    print(f"Reading annotations from: {SRC}")
    
    with open(SRC, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    print(f"Total pairs: {len(rows)}")
    
    # Extract labels
    annotator1_labels = []
    annotator2_labels = []
    valid_rows = []
    
    for row in rows:
        label1 = row.get("annotator1_label", "").strip().upper()
        label2 = row.get("annotator2_label", "").strip().upper()
        
        if not label1 or not label2:
            print(f"Warning: Missing label for pair {row.get('pair_id')} - skipping")
            continue
        
        if label1 not in VALID_LABELS or label2 not in VALID_LABELS:
            print(f"Warning: Invalid label for pair {row.get('pair_id')} - skipping")
            continue
        
        annotator1_labels.append(label1)
        annotator2_labels.append(label2)
        valid_rows.append(row)
    
    if len(valid_rows) == 0:
        print("\nERROR: No valid annotations found!")
        print("Ensure annotator2_label column is filled with valid labels:")
        print("  CONTRADICTION, OVERLAP, IMPLICIT, NO_CONFLICT")
        return
    
    print(f"Valid annotations: {len(valid_rows)}")
    
    # Compute Cohen's κ
    kappa = cohen_kappa_score(annotator1_labels, annotator2_labels)
    
    # Compute confusion matrix
    labels_sorted = sorted(VALID_LABELS)
    cm = confusion_matrix(annotator1_labels, annotator2_labels, labels=labels_sorted)
    
    # Calculate agreement
    agreements = sum(1 for l1, l2 in zip(annotator1_labels, annotator2_labels) if l1 == l2)
    agreement_rate = agreements / len(valid_rows)
    
    # Find disagreements
    disagreements = []
    for row, l1, l2 in zip(valid_rows, annotator1_labels, annotator2_labels):
        if l1 != l2:
            disagreements.append({
                "pair_id": row["pair_id"],
                "annotator1": l1,
                "annotator2": l2,
                "req_A": row["requirement_A"][:80] + "..." if len(row["requirement_A"]) > 80 else row["requirement_A"],
                "req_B": row["requirement_B"][:80] + "..." if len(row["requirement_B"]) > 80 else row["requirement_B"],
            })
    
    # Generate report
    report = f"""{'='*70}
EXPERIMENT 4 — INTER-ANNOTATOR AGREEMENT (IAA) REPORT
{'='*70}

DATASET
-------
Total pairs annotated:      {len(valid_rows)}
Agreements:                 {agreements} ({agreement_rate*100:.1f}%)
Disagreements:              {len(disagreements)} ({(1-agreement_rate)*100:.1f}%)

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
    
    if kappa < 0.00:
        report += "⚠ No agreement - review annotation guidelines\n"
    elif kappa < 0.21:
        report += "⚠ Slight agreement - annotation guidelines may need clarification\n"
    elif kappa < 0.41:
        report += "⚠ Fair agreement - consider refining definitions\n"
    elif kappa < 0.61:
        report += "✓ Moderate agreement - acceptable for exploratory research\n"
    elif kappa < 0.81:
        report += "✓ Substantial agreement - good reliability\n"
    else:
        report += "✓ Almost perfect agreement - excellent reliability\n"
    
    report += f"\n{'='*70}\n"
    report += "CONFUSION MATRIX\n"
    report += f"{'='*70}\n\n"
    report += "Rows = Annotator 1, Columns = Annotator 2\n\n"
    
    # Format confusion matrix
    header = "".ljust(18) + "".join(label[:12].ljust(14) for label in labels_sorted)
    report += header + "\n"
    report += "-" * len(header) + "\n"
    
    for i, label1 in enumerate(labels_sorted):
        row_str = label1[:16].ljust(18)
        for j, label2 in enumerate(labels_sorted):
            row_str += str(cm[i][j]).ljust(14)
        report += row_str + "\n"
    
    report += f"\n{'='*70}\n"
    report += "LABEL DISTRIBUTION\n"
    report += f"{'='*70}\n\n"
    
    from collections import Counter
    count1 = Counter(annotator1_labels)
    count2 = Counter(annotator2_labels)
    
    report += "Label            Annotator1    Annotator2\n"
    report += "-" * 45 + "\n"
    for label in labels_sorted:
        report += f"{label[:16].ljust(16)} {str(count1[label]).ljust(13)} {count2[label]}\n"
    
    if disagreements:
        report += f"\n{'='*70}\n"
        report += f"DISAGREEMENTS ({len(disagreements)} pairs)\n"
        report += f"{'='*70}\n\n"
        
        for d in disagreements[:20]:  # Show first 20
            report += f"Pair: {d['pair_id']}\n"
            report += f"  Annotator1: {d['annotator1']}\n"
            report += f"  Annotator2: {d['annotator2']}\n"
            report += f"  Req A: {d['req_A']}\n"
            report += f"  Req B: {d['req_B']}\n"
            report += "\n"
        
        if len(disagreements) > 20:
            report += f"... and {len(disagreements) - 20} more disagreements\n"
    
    report += f"\n{'='*70}\n"
    report += "RECOMMENDATION FOR PAPER\n"
    report += f"{'='*70}\n\n"
    report += f"Report Cohen's κ = {kappa:.3f} as validation of the gold standard.\n"
    report += f"Sample: {len(valid_rows)} requirement pairs stratified across conflict types.\n"
    report += f"Agreement rate: {agreement_rate*100:.1f}%\n"
    
    # Print to console
    print("\n" + report)
    
    # Save to file
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(report)
    
    print(f"✓ Report saved to: {OUT}")


if __name__ == "__main__":
    main()
