"""
8_analyze.py — Compute Experiment 2 results.

Track A: Pearson correlation between DocuMind's algorithmic quality score
         and expert human holistic rating (1–5 per BRD, n=15).

Track B: Mean requirement recall across 15 threads using Gemini embedding
         similarity against the annotated gold standard.

Reads from:
    data/experiment2/brds_export.json
    data/experiment2/rating_sheet_filled.csv
    data/experiment2/recall_results.csv

Writes to:
    data/experiment2/exp2_report.txt

Usage:
    python3 scripts/experiment2/8_analyze.py
"""

import csv
import json
import sys
from pathlib import Path

import pandas as pd
from scipy.stats import pearsonr

OUT_DIR = Path("data/experiment2")


def pct(n, total):
    return f"{n/total*100:.1f}%" if total > 0 else "0.0%"


def main():
    sep = "=" * 70

    # ── Load data ─────────────────────────────────────────────────────────────
    brds_path = OUT_DIR / "brds_export.json"
    rating_path = OUT_DIR / "rating_sheet_filled.csv"
    recall_path = OUT_DIR / "recall_results.csv"

    missing = [p for p in [brds_path, rating_path, recall_path] if not p.exists()]
    if missing:
        for p in missing:
            print(f"ERROR: {p.name} not found.")
        print("\nRun the preceding steps first.")
        sys.exit(1)

    with open(brds_path, encoding="utf-8") as f:
        brds = json.load(f)

    rating_df = pd.read_csv(rating_path)
    recall_df = pd.read_csv(recall_path)

    # ── Track A: algorithmic vs human correlation ─────────────────────────────
    rating_df = rating_df.dropna(subset=["human_score"])
    rating_df["human_score"] = pd.to_numeric(rating_df["human_score"], errors="coerce")
    rating_df = rating_df.dropna(subset=["human_score"])

    algo_lookup = {b["threadId"]: b.get("qualityScore") for b in brds}
    rating_df["algo_score"] = rating_df["thread_id"].map(algo_lookup)
    rating_df = rating_df.dropna(subset=["algo_score"])

    n_track_a = len(rating_df)
    r, p_val = pearsonr(rating_df["algo_score"], rating_df["human_score"])

    # ── Track B: requirement recall ───────────────────────────────────────────
    # Exclude threads where gold standard is unreliable (T08: annotation contamination)
    EXCLUDE_FROM_RECALL = {"T08"}
    recall_df = recall_df[~recall_df["thread_id"].isin(EXCLUDE_FROM_RECALL)].copy()

    n_track_b = len(recall_df)
    mean_recall = recall_df["recall"].mean()
    std_recall  = recall_df["recall"].std()
    total_gold  = recall_df["total_gold"].sum()
    total_recalled = recall_df["recalled"].sum()

    # ── Build report ──────────────────────────────────────────────────────────
    lines = [
        sep,
        "EXPERIMENT 2 — BRD Generation Quality",
        f"Threads evaluated:        {n_track_a}",
        sep,
        "",
        "── Track A: Algorithmic Score vs Human Rating ─────────────────────────",
        f"n (BRDs rated):           {n_track_a}",
        f"Pearson r:                {r:.3f}",
        f"p-value:                  {p_val:.4f}",
        f"Significant (p < 0.05):   {'YES' if p_val < 0.05 else 'NO'}",
        f"Target (r > 0.60):        {'PASSED' if r > 0.60 else 'FAILED'}",
        "",
        "  Algorithmic score range: "
        f"{rating_df['algo_score'].min():.0f} – {rating_df['algo_score'].max():.0f}  (LLM evaluator overall, 0-100)",
        "  Human score range:       "
        f"{rating_df['human_score'].min():.0f} – {rating_df['human_score'].max():.0f}  (holistic 1-5)",
        "",
        "  Per-BRD scores:",
        f"  {'Thread':<8} {'Subject':<40} {'Algo':>6} {'Human':>6}",
        "  " + "-" * 62,
    ]

    for _, row in rating_df.sort_values("thread_id").iterrows():
        subj = str(row.get("thread_subject", ""))[:38]
        lines.append(
            f"  {row['thread_id']:<8} {subj:<40} "
            f"{row['algo_score']:>6.0f} {row['human_score']:>6.0f}"
        )

    lines += [
        "",
        "── Track B: Requirement Recall ────────────────────────────────────────",
        f"n (threads):              {n_track_b}  (T08 excluded — annotation contamination)",
        f"Total gold sentences:     {total_gold}",
        f"Total recalled:           {total_recalled} ({pct(total_recalled, total_gold)})",
        f"Mean recall:              {mean_recall:.3f}",
        f"Std dev:                  {std_recall:.3f}",
        f"Similarity threshold:     0.85 (cosine, gemini-embedding-001)",
        "",
        "  Per-thread recall:",
        f"  {'Thread':<8} {'Gold':>6} {'Recalled':>10} {'Recall':>8}",
        "  " + "-" * 36,
    ]

    for _, row in recall_df.sort_values("thread_id").iterrows():
        lines.append(
            f"  {row['thread_id']:<8} {int(row['total_gold']):>6} "
            f"{int(row['recalled']):>10} {row['recall']:>8.3f}"
        )

    lines += ["", sep]

    report = "\n".join(lines)
    print(report)

    out_path = OUT_DIR / "exp2_report.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nReport saved → {out_path}")


if __name__ == "__main__":
    main()
