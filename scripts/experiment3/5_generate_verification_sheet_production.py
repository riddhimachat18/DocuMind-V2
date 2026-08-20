"""
5_generate_verification_sheet_production.py — Export cited sentences for manual verification.

Reads from:
    data/experiment3/citation_data_production.csv

Writes to:
    data/experiment3/citation_verification_sheet_production.csv

Usage:
    python scripts/experiment3/5_generate_verification_sheet_production.py
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
        "brd_id", "section", "sentence", "citation_count", "source_type"
    ]].copy()
    
    # Add annotation columns
    verif_df["annotator1_verdict"] = ""
    verif_df["annotator1_notes"] = ""
    
    # Save
    out_path = OUT_DIR / "citation_verification_sheet_production.csv"
    verif_df.to_csv(out_path, index=False, encoding="utf-8")
    
    print(f"Exported {len(verif_df)} cited sentences → {out_path}")
    print(f"\nNext steps:")
    print(f"1. Open {out_path}")
    print(f"2. Fill in 'annotator1_verdict' column with: SUPPORTS, PARTIALLY, or DOES_NOT_SUPPORT")
    print(f"3. Save as: citation_verification_sheet_production_annotated.csv")
    print(f"4. Run: python scripts/experiment3/6_analyze_production.py")


if __name__ == "__main__":
    main()
