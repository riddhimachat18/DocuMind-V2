"""
6_analyze.py — Compute Experiment 3 results: traceability coverage,
hallucination proxy, and citation accuracy (single expert annotator).

Reads from:
    data/experiment3/citation_data.csv
    data/experiment3/citation_verification_sheet_annotated.csv

Writes to:
    data/experiment3/exp3_report.txt

Usage:
    python3 scripts/experiment3/6_analyze.py
"""

import sys
from pathlib import Path

import pandas as pd

OUT_DIR = Path("data/experiment3")
VERIF_PATH = OUT_DIR / "citation_verification_sheet_annotated.csv"
VERDICT_LABELS = ["SUPPORTS", "PARTIALLY", "DOES_NOT_SUPPORT"]


def pct(n, total):
    return f"{n}/{total} ({n/total*100:.1f}%)" if total > 0 else "0/0 (0.0%)"


def main():
    # ── Load citation coverage data ───────────────────────────────────────────
    cite_path = OUT_DIR / "citation_data.csv"
    if not cite_path.exists():
        print(f"ERROR: {cite_path} not found. Run 4_extract_citations.py first.")
        sys.exit(1)

    cite_df = pd.read_csv(cite_path)
    total_sentences = len(cite_df)
    cited = cite_df["has_citation"].sum()
    uncited = total_sentences - cited

    # ── Load annotation data ──────────────────────────────────────────────────
    if not VERIF_PATH.exists():
        print(f"ERROR: {VERIF_PATH} not found.")
        sys.exit(1)

    verif_df = pd.read_csv(VERIF_PATH)
    verif_df = verif_df[verif_df["annotator1_verdict"].isin(VERDICT_LABELS)].copy()
    verif_df["verdict"] = verif_df["annotator1_verdict"]

    n_verified = len(verif_df)
    if n_verified == 0:
        print("ERROR: no valid verdicts found in annotated sheet.")
        sys.exit(1)

    supports  = (verif_df["verdict"] == "SUPPORTS").sum()
    partially = (verif_df["verdict"] == "PARTIALLY").sum()
    does_not  = (verif_df["verdict"] == "DOES_NOT_SUPPORT").sum()
    effective = supports + partially

    # ── Build report ──────────────────────────────────────────────────────────
    sep = "=" * 70
    lines = [
        sep,
        "EXPERIMENT 3 — Traceability Coverage & Citation Accuracy",
        f"BRDs generated:           {cite_df['brd_id'].nunique()}",
        f"  Email BRDs:             {cite_df[cite_df['source_type']=='email']['brd_id'].nunique()}",
        f"  Transcript BRDs:        {cite_df[cite_df['source_type']=='transcript']['brd_id'].nunique()}",
        sep,
        "",
        "── 1. Traceability Coverage ───────────────────────────────────────────",
        f"Total BRD sentences:      {total_sentences}",
        f"Cited sentences:          {pct(cited, total_sentences)}",
        f"Uncited sentences:        {pct(uncited, total_sentences)}",
        "",
        "  By source modality:",
    ]

    for src in ["email", "transcript"]:
        sub = cite_df[cite_df["source_type"] == src]
        if len(sub) == 0:
            continue
        c = sub["has_citation"].sum()
        lines.append(f"    {src:<12}  {pct(c, len(sub))} cited")

    lines += ["", "  By BRD section:"]
    by_section = cite_df.groupby("section")["has_citation"].agg(["sum", "count"])
    for sec, row in by_section.sort_values("count", ascending=False).iterrows():
        lines.append(f"    {sec:<24}  {pct(int(row['sum']), int(row['count']))} cited")

    lines += [
        "",
        "── 2. Hallucination Proxy (uncited sentences) ─────────────────────────",
        f"Uncited sentences:        {pct(uncited, total_sentences)}",
        "  (Sentences with no citation to a source snippet — upper-bound",
        "   estimate of unsupported generation.)",
        "",
        "  Uncited by section:",
    ]
    unc_by_sec = cite_df[~cite_df["has_citation"]].groupby("section").size() \
                     .sort_values(ascending=False)
    for sec, count in unc_by_sec.items():
        total_in_sec = len(cite_df[cite_df["section"] == sec])
        lines.append(f"    {sec:<24}  {pct(count, total_in_sec)} uncited")

    lines += [
        "",
        "── 3. Citation Accuracy (Expert Annotation) ───────────────────────────",
        f"Verified citations:       {n_verified}",
        f"Annotator:                Single expert annotator (system author)",
        f"Note: Inter-annotator agreement not measured; left for future work.",
        "",
        f"SUPPORTS:                 {pct(supports, n_verified)}",
        f"PARTIALLY:                {pct(partially, n_verified)}",
        f"DOES_NOT_SUPPORT:         {pct(does_not, n_verified)}",
        "",
        f"Effective accuracy        {pct(effective, n_verified)}",
        f"(SUPPORTS + PARTIALLY)",
        "",
        "  By source modality:",
    ]

    for src in ["email", "transcript"]:
        sub = verif_df[verif_df["source_type"] == src] \
              if "source_type" in verif_df.columns else pd.DataFrame()
        if len(sub) == 0:
            continue
        s = (sub["verdict"] == "SUPPORTS").sum()
        p = (sub["verdict"] == "PARTIALLY").sum()
        d = (sub["verdict"] == "DOES_NOT_SUPPORT").sum()
        eff = s + p
        lines.append(
            f"    {src:<12}  SUPPORTS={pct(s,len(sub))}  "
            f"PARTIALLY={pct(p,len(sub))}  "
            f"DOES_NOT_SUPPORT={pct(d,len(sub))}  "
            f"effective={pct(eff,len(sub))}"
        )

    lines += ["", "  By BRD section:"]
    for sec in verif_df["section"].unique():
        sub = verif_df[verif_df["section"] == sec]
        s = (sub["verdict"] == "SUPPORTS").sum()
        p = (sub["verdict"] == "PARTIALLY").sum()
        eff = s + p
        lines.append(
            f"    {sec:<24}  n={len(sub)}  "
            f"SUPPORTS={s}  PARTIALLY={p}  "
            f"effective={pct(eff, len(sub))}"
        )

    lines += ["", sep]

    report = "\n".join(lines)
    print(report)

    out_path = OUT_DIR / "exp3_report.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"\nReport saved → {out_path}")


if __name__ == "__main__":
    main()
