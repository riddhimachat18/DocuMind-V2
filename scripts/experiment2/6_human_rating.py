"""
6_human_rating.py — Generate a human rating sheet: one row per BRD.

You read each BRD (the fullBrdText preview) and assign a holistic quality
score from 1–5:
    5 — Excellent: well-structured, specific, clearly grounded in the source
    4 — Good: mostly complete, minor gaps or vague statements
    3 — Adequate: covers the basics but missing key requirements or too generic
    2 — Poor: significant gaps, hallucinated content, or wrong domain
    1 — Unusable: does not reflect the source thread at all

Reads from:  data/experiment2/brds_export.json
Writes to:   data/experiment2/rating_sheet.csv

After filling in human_score for all 15 rows, save as
data/experiment2/rating_sheet_filled.csv and run 8_analyze.py.

Usage:
    python3 scripts/experiment2/6_human_rating.py
"""

import csv
import json
from pathlib import Path

OUT_DIR = Path("data/experiment2")


def main():
    src = OUT_DIR / "brds_export.json"
    if not src.exists():
        print("ERROR: brds_export.json not found. Run 5_export_brds.py first.")
        return

    with open(src, encoding="utf-8") as f:
        brds = json.load(f)

    rows = []
    for brd in brds:
        preview = brd.get("fullBrdText", "")[:600].replace("\n", " ").strip()
        rows.append({
            "thread_id":          brd["threadId"],
            "brd_id":             brd["brdId"],
            "thread_subject":     brd["threadSubject"],
            "algo_overall":       brd.get("qualityScore", ""),
            "algo_completeness":  brd.get("completeness", ""),
            "algo_consistency":   brd.get("consistency", ""),
            "algo_clarity":       brd.get("clarity", ""),
            "algo_evidence":      brd.get("evidence", ""),
            "brd_preview":        preview,
            # Fill in these four (0-100 each), then set human_score = average
            "completeness_score": "",
            "clarity_score":      "",
            "consistency_score":  "",
            "evidence_score":     "",
            "human_score":        "",   # overall: average of the four above
            "human_notes":        "",
        })

    out_path = OUT_DIR / "rating_sheet.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated rating sheet ({len(rows)} BRDs) → {out_path}")
    print()
    print("Instructions:")
    print("  1. Open rating_sheet.csv in Excel or Google Sheets.")
    print("  2. For each row, read the brd_preview column.")
    print("  3. Fill in human_score (1–5) based on overall BRD quality.")
    print("  4. Save as rating_sheet_filled.csv when done.")
    print()
    print("Score guide (0-100 per criterion):")
    print("  completeness_score — all 6 sections present and substantive")
    print("  clarity_score      — specific language, SHALL/MUST, named systems")
    print("  consistency_score  — no contradictions, consistent terminology")
    print("  evidence_score     — claims traceable to source emails (most important)")
    print("  human_score        — overall: average of the four scores above")


if __name__ == "__main__":
    main()
