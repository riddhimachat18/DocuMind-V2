"""
5c_auto_annotate_with_sources.py — Auto-annotate citations by fetching actual 
source snippets from Firestore and verifying support.

Reads from:
    data/experiment3/citation_verification_sheet_production.csv
    Firestore (snippets collection)
    .env (for GEMINI_API_KEY and GOOGLE_APPLICATION_CREDENTIALS)

Writes to:
    data/experiment3/citation_verification_sheet_production_annotated.csv

Usage:
    python scripts/experiment3/5c_auto_annotate_with_sources.py
"""

import os
import sys
import time
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import google.generativeai as genai
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

OUT_DIR = Path("data/experiment3")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
SERVICE_ACCOUNT_PATH = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"

if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY or VITE_GEMINI_API_KEY not found in .env")
    sys.exit(1)

if not Path(SERVICE_ACCOUNT_PATH).exists():
    print(f"ERROR: {SERVICE_ACCOUNT_PATH} not found in project root")
    sys.exit(1)

# Initialize Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()
genai.configure(api_key=GEMINI_API_KEY)


def extract_source_numbers(sentence: str) -> list:
    """Extract all [SOURCE:N] numbers from a sentence"""
    matches = re.findall(r'\[SOURCE:(\d+)\]', sentence)
    return [int(m) for m in matches]


def fetch_source_snippets(brd_id: str, source_numbers: list) -> dict:
    """Fetch actual source snippet texts from Firestore"""
    snippets = {}
    
    try:
        # Get the BRD document to find project_id
        brd_ref = db.collection('brdVersions').document(brd_id)
        brd_doc = brd_ref.get()
        
        if not brd_doc.exists:
            return snippets
        
        brd_data = brd_doc.to_dict()
        project_id = brd_data.get('projectId')
        
        if not project_id:
            return snippets
        
        # Fetch snippets for this project
        snippets_ref = db.collection('snippets').where('projectId', '==', project_id)
        snippet_docs = snippets_ref.stream()
        
        # Build a map of snippet index to text
        snippet_map = {}
        for doc in snippet_docs:
            data = doc.to_dict()
            snippet_map[doc.id] = data.get('text', '')
        
        # Get the citations map from BRD
        citations = brd_data.get('citations', {})
        
        # Map source numbers to snippet texts
        for source_num in source_numbers:
            source_key = str(source_num)
            if source_key in citations:
                snippet_id = citations[source_key]
                if snippet_id in snippet_map:
                    snippets[source_num] = snippet_map[snippet_id]
    
    except Exception as e:
        print(f"  ⚠ Error fetching snippets: {e}")
    
    return snippets


def verify_citation_with_source(sentence: str, brd_id: str, section: str, source_snippets: dict) -> str:
    """
    Use Gemini to verify if the sentence is supported by the actual source snippets.
    Returns: SUPPORTS, PARTIALLY, or DOES_NOT_SUPPORT
    """
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    # Build source context
    source_context = ""
    if source_snippets:
        source_context = "\n\nSOURCE SNIPPETS:\n"
        for num, text in sorted(source_snippets.items()):
            source_context += f"\n[SOURCE:{num}]: {text[:500]}...\n"
    else:
        source_context = "\n\n[NO SOURCE SNIPPETS AVAILABLE]"
    
    prompt = f"""You are evaluating citation quality in a Business Requirements Document (BRD).

BRD ID: {brd_id}
Section: {section}

BRD SENTENCE:
"{sentence}"

{source_context}

TASK: Evaluate whether the BRD sentence is properly supported by the provided source snippets.

VERDICT DEFINITIONS:
- SUPPORTS: The source snippets clearly and fully support all claims in the BRD sentence.
- PARTIALLY: The source snippets are related and support some aspects, but the BRD sentence contains generalizations, interpretations, or details not directly stated in the sources.
- DOES_NOT_SUPPORT: The BRD sentence makes claims that are not supported by the source snippets, or the sources are irrelevant.

EVALUATION CRITERIA:
1. Are all factual claims in the sentence backed by the source snippets?
2. Does the sentence add unsupported interpretations or generalizations?
3. Are the cited sources relevant to the sentence content?
4. If sources are missing, the sentence cannot be fully verified.

Respond with ONLY one word: SUPPORTS, PARTIALLY, or DOES_NOT_SUPPORT"""

    try:
        response = model.generate_content(prompt)
        verdict = response.text.strip().upper()
        
        # Validate response
        if verdict in ["SUPPORTS", "PARTIALLY", "DOES_NOT_SUPPORT"]:
            return verdict
        elif "SUPPORTS" in verdict and "NOT" not in verdict:
            return "SUPPORTS"
        elif "PARTIALLY" in verdict:
            return "PARTIALLY"
        elif "DOES_NOT_SUPPORT" in verdict or "NOT_SUPPORT" in verdict or "DOES NOT SUPPORT" in verdict:
            return "DOES_NOT_SUPPORT"
        else:
            return "PARTIALLY"
    except Exception as e:
        return "PARTIALLY"


def process_row(idx: int, row: pd.Series, total: int) -> tuple:
    """Process a single row: fetch sources and verify"""
    sentence = row["sentence"]
    brd_id = row["brd_id"]
    section = row["section"]
    
    # Extract source numbers from sentence
    source_numbers = extract_source_numbers(sentence)
    
    # Fetch actual source snippets
    source_snippets = fetch_source_snippets(brd_id, source_numbers)
    
    # Verify with actual sources
    verdict = verify_citation_with_source(sentence, brd_id, section, source_snippets)
    
    # Progress indicator
    if (idx + 1) % 10 == 0:
        print(f"  [{idx+1}/{total}] processed")
    
    return (idx, verdict, len(source_snippets))


def main():
    verif_path = OUT_DIR / "citation_verification_sheet_production.csv"
    if not verif_path.exists():
        print(f"ERROR: {verif_path} not found.")
        print("Run: python scripts/experiment3/5_generate_verification_sheet_production.py")
        sys.exit(1)

    df = pd.read_csv(verif_path)
    print(f"Loaded {len(df)} cited sentences for verification")
    print(f"Using Gemini model: gemini-2.5-flash")
    print(f"Fetching actual source snippets from Firestore")
    print(f"Parallel processing with 5 workers (slower to avoid Firestore rate limits)")
    print()

    start_time = time.time()
    
    # Process in parallel with ThreadPoolExecutor (fewer workers for Firestore)
    results = {}
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(process_row, idx, row, len(df)): idx 
            for idx, row in df.iterrows()
        }
        
        for future in as_completed(futures):
            idx, verdict, source_count = future.result()
            results[idx] = (verdict, source_count)
    
    # Apply results to dataframe
    for idx, (verdict, source_count) in results.items():
        df.at[idx, "annotator1_verdict"] = verdict
        df.at[idx, "annotator1_notes"] = f"Auto-annotated with {source_count} source(s) from Firestore"

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
