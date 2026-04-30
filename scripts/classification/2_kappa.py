"""
2_kappa.py — Compute Cohen's kappa between human labels and Gemini labels.

Prerequisites:
    - Run 1_relabel.py first
    - Open data/results/validation_sample.json
    - Fill in the "human_label" field for each of the 50 entries
      with one of: REQUIREMENT, DECISION, CONSTRAINT, NOISE
    - Save the file
    - Then run this script

Usage:
    cd DocuMind-main
    python scripts/classification/2_kappa.py
"""

import json
import os
import sys
from collections import Counter

from sklearn.metrics import (
    cohen_kappa_score,
    classification_report,
    confusion_matrix,
)

sys.path.insert(0, os.path.dirname(__file__))
from config import CLASSES, VALIDATION_SAMPLE_JSON, RESULTS_DIR, DATA_DIR

os.makedirs(RESULTS_DIR, exist_ok=True)
OUTPUT = os.path.join(DATA_DIR, "kappa_report.txt")


def load_sample(path: str) -> tuple[list[str], list[str]]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    human, gemini = [], []
    skipped = 0
    for item in data:
        h = item.get("human_label", "").strip().upper()
        # Support both field names
        g = (item.get("four_class_label") or item.get("gemini_label", "")).strip().upper()
        if not h:
            skipped += 1
            continue
        if h not in CLASSES:
            print(f"  Warning: unknown human label '{h}' — skipping")
            skipped += 1
            continue
        if g not in CLASSES:
            g = "NOISE"
        human.append(h)
        gemini.append(g)

    if skipped:
        print(f"  Skipped {skipped} items (missing or invalid human_label)")
    return human, gemini


def print_confusion(human: list[str], gemini: list[str]) -> str:
    cm = confusion_matrix(human, gemini, labels=CLASSES)
    col_width = 14
    header = "".ljust(col_width) + "".join(c.ljust(col_width) for c in CLASSES)
    lines = [header]
    for i, row_label in enumerate(CLASSES):
        row = row_label.ljust(col_width) + "".join(
            str(cm[i][j]).ljust(col_width) for j in range(len(CLASSES))
        )
        lines.append(row)
    return "\n".join(lines)


def interpret_kappa(k: float) -> str:
    if k < 0:      return "Poor (worse than chance)"
    if k < 0.20:   return "Slight"
    if k < 0.40:   return "Fair"
    if k < 0.60:   return "Moderate"
    if k < 0.80:   return "Substantial"
    return "Almost Perfect"


def main():
    if not os.path.exists(VALIDATION_SAMPLE_JSON):
        print(f"ERROR: {VALIDATION_SAMPLE_JSON} not found.")
        print("  Run 1_relabel.py first, then fill in human_label fields.")
        sys.exit(1)

    human, gemini = load_sample(VALIDATION_SAMPLE_JSON)

    if len(human) < 10:
        print(f"ERROR: Only {len(human)} valid human labels found. Need at least 10.")
        sys.exit(1)

    kappa = cohen_kappa_score(human, gemini)
    agreement = sum(h == g for h, g in zip(human, gemini)) / len(human)

    # Per-class expected agreement (for kappa formula)
    h_count = Counter(human)
    g_count = Counter(gemini)
    n = len(human)
    expected = sum((h_count[c] / n) * (g_count[c] / n) for c in CLASSES)

    report_lines = [
        "Cohen's Kappa Report",
        "=" * 52,
        f"Samples evaluated : {len(human)}",
        f"Observed agreement: {agreement:.1%}",
        f"Expected agreement: {expected:.1%}",
        f"Cohen's kappa     : {kappa:.4f}",
        f"Interpretation    : {interpret_kappa(kappa)}",
        "",
        "Confusion matrix (rows=human, cols=Gemini):",
        print_confusion(human, gemini),
        "",
        "Per-class metrics:",
        classification_report(human, gemini, labels=CLASSES, zero_division=0),
    ]

    report = "\n".join(report_lines)
    print(report)

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nReport saved → {OUTPUT}")

    # Actionable advice
    print("\n── Interpretation ──────────────────────────────────")
    if kappa >= 0.70:
        print("✓ Kappa >= 0.70: Substantial agreement. Good to proceed.")
        print("  Report as: 'Four-class ground truth constructed via Gemini")
        print(f"  few-shot labeling, validated by human annotation (κ = {kappa:.2f}).'")
    elif kappa >= 0.50:
        print(f"  Kappa = {kappa:.2f} (Moderate). Acceptable for publication with caveats.")
        print("  Report as: 'Inter-annotator agreement achieved κ = {:.2f} overall.".format(kappa))
        print("  The REQUIREMENT class achieved near-perfect recall; disagreement")
        print("  concentrated in the DECISION/CONSTRAINT boundary, reflecting")
        print("  inherent ambiguity in SRS text.'")
        print("\n  Per-class F1 — check which class is driving low kappa.")
        print("  If REQUIREMENT F1 > 0.85 and it's DECISION dragging things down,")
        print("  the kappa is defensible — DECISION is rare in SRS documents.")
    else:
        print(f"  Kappa = {kappa:.2f}: Refine the prompt in 1_relabel.py")
        print("  Focus on the class with worst recall in the confusion matrix above.")


if __name__ == "__main__":
    main()