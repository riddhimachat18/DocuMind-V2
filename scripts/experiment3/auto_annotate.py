"""
auto_annotate.py — Automatically annotate citations using Gemini.

Usage:
    python scripts/experiment3/auto_annotate.py
"""

import os
import pandas as pd
from pathlib import Path
import google.generativeai as genai
import time

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyCTefcnMSgje3n6e7Vq4aeMPOZzqgabOpw")
OUT_DIR = Path("data/experiment3")

ANNOTATION_PROMPT = """You are evaluating whether a source snippet supports a BRD sentence.

BRD Sentence: "{brd_sentence}"

Source Snippet 1: "{snippet1}"

Source Snippet 2: "{snippet2}"

Does the source evidence SUPPORT the BRD sentence?

Respond with ONLY ONE WORD:
- SUPPORTS: The source directly supports the BRD sentence
- PARTIALLY: The source partially supports or relates to the BRD sentence
- DOES_NOT_SUPPORT: The source does not support the BRD sentence

Answer:"""


def annotate_citation(brd_sentence: str, snippet1: str, snippet2: str, model) -> str:
    """Use Gemini to annotate a citation."""
    # Handle NaN values
    snippet1 = str(snippet1) if pd.notna(snippet1) else "N/A"
    snippet2 = str(snippet2) if pd.notna(snippet2) else "N/A"
    
    prompt = ANNOTATION_PROMPT.format(
        brd_sentence=str(brd_sentence)[:300],
        snippet1=snippet1[:300],
        snippet2=snippet2[:300]
    )
    
    try:
        resp = model.generate_content(prompt)
        verdict = resp.text.strip().upper()
        
        # Validate verdict
        if "SUPPORTS" in verdict and "NOT" not in verdict:
            return "SUPPORTS"
        elif "PARTIALLY" in verdict:
            return "PARTIALLY"
        elif "DOES_NOT_SUPPORT" in verdict or "NOT" in verdict:
            return "DOES_NOT_SUPPORT"
        else:
            return "PARTIALLY"  # Default to PARTIALLY if unclear
    except Exception as e:
        print(f"    Error annotating: {e}")
        return "PARTIALLY"


def main():
    # Load citation verification sheet
    input_path = OUT_DIR / "citation_verification_sheet.csv"
    if not input_path.exists():
        print(f"ERROR: {input_path} not found")
        return
    
    df = pd.read_csv(input_path)
    print(f"Loaded {len(df)} citations to annotate")
    
    # Init Gemini
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    # Annotate each row
    print("\nAnnotating citations...")
    for idx, row in df.iterrows():
        print(f"  {idx+1}/{len(df)}: {row['section']} - {row['source_type']}")
        
        verdict = annotate_citation(
            row['brd_sentence'],
            row['source_snippet_1'],
            row['source_snippet_2'],
            model
        )
        
        df.at[idx, 'annotator1_verdict'] = verdict
        df.at[idx, 'annotator1_notes'] = "Auto-annotated by Gemini"
        
        time.sleep(0.5)  # Rate limiting
    
    # Save annotated file
    output_path = OUT_DIR / "citation_verification_sheet_annotated.csv"
    df.to_csv(output_path, index=False)
    
    print(f"\n✓ Annotated {len(df)} citations")
    print(f"✓ Saved to: {output_path}")
    
    # Show verdict distribution
    print("\nVerdict Distribution:")
    print(df['annotator1_verdict'].value_counts())
    
    print("\nNext: Run python scripts/experiment3/6_analyze.py")


if __name__ == "__main__":
    main()
