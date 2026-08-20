"""
5b_auto_annotate_production.py — Auto-annotate citation verification using Gemini.

Reads from:
    data/experiment3/citation_verification_sheet_production.csv
    .env (for GEMINI_API_KEY)

Writes to:
    data/experiment3/citation_verification_sheet_production_annotated.csv

Usage:
    python scripts/experiment3/5b_auto_annotate_production.py
"""

import os
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

OUT_DIR = Path("data/experiment3")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY not found in .env")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)


def verify_citation(sentence: str, brd_id: str, section: str) -> str:
    """
    Use Gemini to verify if the sentence is properly supported by its citations.
    Returns: SUPPORTS, PARTIALLY, or DOES_NOT_SUPPORT
    """
    # Create model instance per thread
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    prompt = f"""You are evaluating citation quality in a Business Requirements Document (BRD).

BRD ID: {brd_id}
Section: {section}
Sentence: "{sentence}"

The sentence contains [SOURCE:N] citations that reference specific source snippets from emails or meeting transcripts.

Evaluate whether the sentence is properly supported by its cited sources:

- SUPPORTS: The sentence is fully supported by the cited sources. All claims are backed by evidence.
- PARTIALLY: The sentence is mostly supported but contains some unsupported details or generalizations.
- DOES_NOT_SUPPORT: The sentence makes claims not supported by the cited sources, or citations are missing/incorrect.

Consider:
1. Are all factual claims in the sentence backed by citations?
2. Do the citations appear to be relevant to the content?
3. Are there unsupported generalizations or assumptions?

Respond with ONLY one word: SUPPORTS, PARTIALLY, or DOES_NOT_SUPPORT"""

    try:
        response = model.generate_content(prompt)
        verdict = response.text.strip().upper()
        
        # Validate response
        if verdict in ["SUPPORTS", "PARTIALLY", "DOES_NOT_SUPPORT"]:
            return verdict
        elif "SUPPORTS" in verdict:
            return "SUPPORTS"
        elif "PARTIALLY" in verdict:
            return "PARTIALLY"
        elif "DOES_NOT_SUPPORT" in verdict or "NOT_SUPPORT" in verdict:
            return "DOES_NOT_SUPPORT"
        else:
            return "PARTIALLY"
    except Exception as e:
        return "PARTIALLY"


def process_row(idx: int, row: pd.Series, total: int) -> tuple:
    """Process a single row and return (idx, verdict)"""
    sentence = row["sentence"]
    brd_id = row["brd_id"]
    section = row["section"]
    
    verdict = verify_citation(sentence, brd_id, section)
    
    # Brief progress indicator
    if (idx + 1) % 10 == 0:
        print(f"  [{idx+1}/{total}] processed")
    
    return (idx, verdict)


def main():
    verif_path = OUT_DIR / "citation_verification_sheet_production.csv"
    if not verif_path.exists():
        print(f"ERROR: {verif_path} not found.")
        print("Run: python scripts/experiment3/5_generate_verification_sheet_production.py")
        sys.exit(1)

    df = pd.read_csv(verif_path)
    print(f"Loaded {len(df)} cited sentences for verification")
    print(f"Using Gemini model: gemini-2.5-flash")
    print(f"Parallel processing with 10 workers")
    print()

    start_time = time.time()
    
    # Process in parallel with ThreadPoolExecutor
    results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        # Submit all tasks
        futures = {
            executor.submit(process_row, idx, row, len(df)): idx 
            for idx, row in df.iterrows()
        }
        
        # Collect results as they complete
        for future in as_completed(futures):
            idx, verdict = future.result()
            results[idx] = verdict
    
    # Apply results to dataframe
    for idx, verdict in results.items():
        df.at[idx, "annotator1_verdict"] = verdict
        df.at[idx, "annotator1_notes"] = "Auto-annotated by Gemini (parallel)"

    elapsed = time.time() - start_time
    
    # Save annotated file
    out_path = OUT_DIR / "citation_verification_sheet_production_annotated.csv"
    df.to_csv(out_path, index=False, encoding="utf-8")
    
    print()
    print(f"✓ Annotated {len(df)} citations in {elapsed:.1f}s → {out_path}")
    print(f"  Speed: {len(df)/elapsed:.2f} citations/second")
    print()
    print("Verdict distribution:")
    print(df["annotator1_verdict"].value_counts())
    print()
    print("Next: python scripts/experiment3/6_analyze_production.py")


if __name__ == "__main__":
    main()
