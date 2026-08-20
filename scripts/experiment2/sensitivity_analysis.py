"""
sensitivity_analysis.py — Sensitivity analysis on the heuristic quality scorer
weights for the 15 Enron BRDs from Experiment 2.

The heuristic scorer (ported from generateBrd.ts) has two tunable penalties:
  - conflict_penalty: points deducted per open conflict (baseline: 10)
  - modal_penalty:    points deducted per vague/modal word (baseline: 0.5)

This script varies:
  conflict_penalty ∈ {5, 8, 12}
  modal_penalty    ∈ {2, 3, 5}

For each of the 9 configurations it:
  1. Recomputes heuristic scores for all 15 BRDs
  2. Computes Pearson r against human ratings
  3. Computes Spearman ρ against the baseline configuration (10, 0.5)
  4. Reports whether rank ordering is stable

Reads from:
    data/experiment2/brds_export.json
    data/experiment2/rating_sheet_filled.csv

Writes to:
    data/experiment2/sensitivity_results.txt

Usage:
    python3 scripts/experiment2/sensitivity_analysis.py
"""

import json
import re
import sys
from itertools import product
from pathlib import Path

import pandas as pd
from scipy.stats import pearsonr, spearmanr

OUT_DIR = Path("data/experiment2")

# ── Heuristic scorer (ported from generateBrd.ts) ─────────────────────────────

VAGUE_WORDS = [
    "maybe", "should", "might", "could", "typically", "generally",
    "usually", "often", "sometimes", "probably", "possibly", "perhaps",
]

SECTION_KEYS = [
    "executiveSummary", "stakeholderRegister", "functionalReqs",
    "nfrReqs", "assumptions", "successMetrics",
]


def is_meaningful(text: str) -> bool:
    if not text or len(text.strip()) < 20:
        return False
    filler = ["to be determined", "tbd", "n/a", "none", "todo", "coming soon"]
    return not any(f in text.lower() for f in filler)


def extract_reqs(text: str) -> list[str]:
    if not text:
        return []
    return [
        line.strip() for line in text.split("\n")
        if re.match(r"^[-*•]\s+", line)
        or re.match(r"^\d+\.\s+", line)
        or re.match(r"^[A-Z]{2,3}-\d+", line.strip())
    ]


def has_measurable(req: str) -> bool:
    return bool(re.search(
        r"\d+|<|>|<=|>=|within|under|over|at least|at most|maximum|minimum",
        req, re.I
    ))


def heuristic_score(
    sections: dict,
    open_conflict_count: int = 0,
    conflict_penalty: float = 10.0,
    modal_penalty: float = 0.5,
) -> dict:
    """
    Parameterised port of computeQualityScore from generateBrd.ts.

    conflict_penalty: points deducted per open conflict (baseline 10)
    modal_penalty:    points deducted per vague word found (baseline 0.5)
    """
    # ── Completeness (40 pts) ─────────────────────────────────────────────────
    present = sum(1 for k in SECTION_KEYS if is_meaningful(sections.get(k, "")))
    completeness = round((present / 6) * 40)

    # ── Consistency (40 pts) ──────────────────────────────────────────────────
    all_text = " ".join(v for v in sections.values() if v).lower()
    consistency = 40.0
    consistency -= open_conflict_count * conflict_penalty
    for terms in [
        ["user", "customer", "client"],
        ["system", "application", "platform", "product"],
    ]:
        if sum(1 for t in terms if t in all_text) > 1:
            consistency -= 5
    consistency = max(0.0, consistency)

    # ── Clarity (20 pts) ──────────────────────────────────────────────────────
    clarity = 20.0
    vague_count = sum(
        1 for w in VAGUE_WORDS
        if re.search(rf"\b{w}\b", all_text, re.I)
    )
    clarity -= min(vague_count * modal_penalty, 5.0)

    reqs = extract_reqs(sections.get("functionalReqs", ""))
    if reqs:
        unmeasurable = sum(1 for r in reqs if not has_measurable(r))
        clarity = round(clarity * (1 - unmeasurable / len(reqs)))

    long_reqs = [r for r in reqs if len(r.split()) > 50]
    clarity -= len(long_reqs) * 2
    clarity = max(0.0, round(clarity))

    total = completeness + consistency + clarity
    return {
        "completeness": completeness,
        "consistency":  round(consistency),
        "clarity":      round(clarity),
        "total":        round(total),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    brds_path   = OUT_DIR / "brds_export.json"
    rating_path = OUT_DIR / "rating_sheet_filled.csv"

    for p in [brds_path, rating_path]:
        if not p.exists():
            print(f"ERROR: {p} not found")
            sys.exit(1)

    with open(brds_path, encoding="utf-8") as f:
        brds = json.load(f)

    rating_df = pd.read_csv(rating_path)
    rating_df["human_score"] = pd.to_numeric(
        rating_df["human_score"], errors="coerce"
    )
    rating_df = rating_df.dropna(subset=["human_score"])
    human_lookup = dict(zip(rating_df["thread_id"], rating_df["human_score"]))

    # Only keep BRDs that have a human rating
    scored_brds = [b for b in brds if b["threadId"] in human_lookup]
    print(f"BRDs with human ratings: {len(scored_brds)}")

    # Parameter grid
    conflict_penalties = [5, 8, 12]
    modal_penalties    = [2, 3, 5]
    baseline           = (10, 0.5)   # original weights from generateBrd.ts

    # Compute baseline scores first (for rank stability comparison)
    baseline_scores = {
        b["threadId"]: heuristic_score(
            b["sections"],
            conflict_penalty=baseline[0],
            modal_penalty=baseline[1],
        )["total"]
        for b in scored_brds
    }
    baseline_vec = [baseline_scores[b["threadId"]] for b in scored_brds]
    human_vec    = [human_lookup[b["threadId"]] for b in scored_brds]

    results = []

    sep = "=" * 72
    lines = [
        sep,
        "SENSITIVITY ANALYSIS — Heuristic Quality Scorer Weight Variation",
        f"BRDs evaluated: {len(scored_brds)}",
        f"Baseline weights: conflict_penalty={baseline[0]}, modal_penalty={baseline[1]}",
        sep,
        "",
        f"{'Config':<28} {'Pearson r':>10} {'p-value':>10} {'Spearman ρ':>12} {'Score range':>14}",
        "-" * 72,
    ]

    for cp, mp in product(conflict_penalties, modal_penalties):
        config_scores = {
            b["threadId"]: heuristic_score(
                b["sections"],
                conflict_penalty=cp,
                modal_penalty=mp,
            )["total"]
            for b in scored_brds
        }
        score_vec = [config_scores[b["threadId"]] for b in scored_brds]

        r, p_val   = pearsonr(score_vec, human_vec)
        rho, _     = spearmanr(score_vec, baseline_vec)
        score_min  = min(score_vec)
        score_max  = max(score_vec)

        label = f"cp={cp}, mp={mp}"
        is_baseline = (cp == baseline[0] and mp == baseline[1])
        marker = " ← baseline" if is_baseline else ""

        lines.append(
            f"{label:<28} {r:>10.3f} {p_val:>10.4f} {rho:>12.3f} "
            f"{score_min:>5}–{score_max:<5}{marker}"
        )

        results.append({
            "conflict_penalty": cp,
            "modal_penalty":    mp,
            "pearson_r":        round(r, 4),
            "p_value":          round(p_val, 4),
            "spearman_rho_vs_baseline": round(rho, 4),
            "score_min":        score_min,
            "score_max":        score_max,
            "scores":           config_scores,
        })

    # Summary statistics
    r_values   = [x["pearson_r"] for x in results]
    rho_values = [x["spearman_rho_vs_baseline"] for x in results]
    best       = max(results, key=lambda x: x["pearson_r"])

    lines += [
        "",
        "── Summary ────────────────────────────────────────────────────────────",
        f"Pearson r range:          {min(r_values):.3f} – {max(r_values):.3f}",
        f"Best r:                   {best['pearson_r']:.3f} "
        f"(cp={best['conflict_penalty']}, mp={best['modal_penalty']})",
        f"Spearman ρ vs baseline:   {min(rho_values):.3f} – {max(rho_values):.3f}",
        "",
    ]

    min_rho = min(rho_values)
    if min_rho >= 0.90:
        stability = (
            f"STABLE: minimum Spearman ρ = {min_rho:.3f} ≥ 0.90 across all "
            f"9 configurations. Rank ordering is consistent regardless of weight choice."
        )
    elif min_rho >= 0.75:
        stability = (
            f"MOSTLY STABLE: minimum Spearman ρ = {min_rho:.3f}. Minor rank "
            f"reordering occurs at extreme weight values."
        )
    else:
        stability = (
            f"UNSTABLE: minimum Spearman ρ = {min_rho:.3f} < 0.75. Weight "
            f"choice substantially affects BRD rank ordering."
        )

    lines += [
        f"Rank stability verdict:   {stability}",
        "",
        "── Per-BRD scores across all configurations ───────────────────────────",
    ]

    # Per-BRD table
    configs = [(cp, mp) for cp, mp in product(conflict_penalties, modal_penalties)]
    header = f"{'Thread':<8} {'Human':>6}" + "".join(
        f"  cp{cp}/mp{mp}" for cp, mp in configs
    )
    lines.append(header)
    lines.append("-" * len(header))

    for b in sorted(scored_brds, key=lambda x: x["threadId"]):
        tid = b["threadId"]
        row = f"{tid:<8} {human_lookup[tid]:>6}"
        for cp, mp in configs:
            cfg = next(x for x in results
                       if x["conflict_penalty"] == cp and x["modal_penalty"] == mp)
            row += f"  {cfg['scores'][tid]:>8}"
        lines.append(row)

    lines.append("")
    lines.append(sep)

    report = "\n".join(lines)
    print(report)

    out_path = OUT_DIR / "sensitivity_results.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nSaved → {out_path}")


if __name__ == "__main__":
    main()
