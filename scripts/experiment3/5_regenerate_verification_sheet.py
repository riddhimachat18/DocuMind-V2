"""
5_regenerate_verification_sheet.py — Regenerate verification sheet with new filename.

Reads from:
    data/experiment3/citation_data_production.csv

Writes to:
    data/experiment3/citation_verification_sheet_production_v2.csv

Usage:
    python scripts/experiment3/5_regenerate_verification_sheet.py
"""

import sys
from pathlib import Path
import pandas as pd

OUT_DIR = Path("data/experiment3")


def main():
    cite_path = OUT_DIR / "citation_data_production.csv"
    if not cite_path.exists():
        print(f"ERROR: {cite_path} not found.")
        sys.exit(1)

    cite_df = pd.read_csv(cite_path)
    
    # Filter only cited sentences
    cited_df = cite_df[cite_df["has_citation"] == True].copy()
    
    if len(cited_df) == 0:
        print("No cited sentences found.")
        sys.exit(1)
    
    # Prepare verification sheet
    verif_df = cited_df[[
        "brd_id", "section", "sentence", "citation_count", "source_type", "cited_snippet_ids"
    ]].copy()
    
    # Add annotation columns
    verif_df["annotator1_verdict"] = ""
    verif_df["annotator1_notes"] = ""
    
    # Save with new filename
    out_path = OUT_DIR / "citation_verification_sheet_production_v2.csv"
    verif_df.to_csv(out_path, index=False, encoding="utf-8")
    
    print(f"✓ Exported {len(verif_df)} cited sentences → {out_path}")
    print(f"\nBreakdown by section:")
    for section in verif_df["section"].value_counts().sort_index().items():
        print(f"  {section[0]:<25} {section[1]:>3} citations")
    
    print(f"\nNext step: Run auto-annotation")
    print(f"  python scripts/experiment3/5d_auto_annotate_proper.py")


if __name__ == "__main__":
    main()
