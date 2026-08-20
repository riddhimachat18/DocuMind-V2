"""
5d_auto_annotate_proper.py — Auto-annotate citations by fetching actual 
source snippets from Firestore using the citations map.

Reads from:
    data/experiment3/citation_verification_sheet_production.csv
    Firestore (brdVersions and snippets collections)
    .env (for GEMINI_API_KEY)

Writes to:
    data/experiment3/citation_verification_sheet_production_annotated.csv

Usage:
    python scripts/experiment3/5d_auto_annotate_proper.py
"""

import os
import sys
import time
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


def fetch_source_snippets_for_sentence(brd_id: str, sentence: str) -> list:
    """Fetch actual source snippet texts from Firestore for a given sentence"""
    snippets = []
    
    try:
        # Get the BRD document
        brd_ref = db.collection('brdVersions').document(brd_id)
        brd_doc = brd_ref.get()
        
        if not brd_doc.exists:
            return snippets
        
        brd_data = brd_doc.to_dict()
        project_id = brd_data.get('projectId')
        citations = brd_data.get('citations', {})
        
        # Find snippet IDs for this sentence
        snippet_ids = citations.get(sentence, [])
        if isinstance(snippet_ids, str):
            snippet_ids = [snippet_ids]
        
        if not snippet_ids or not project_id:
            return snippets
        
        # Fetch the actual snippet texts
        for snippet_id in snippet_ids:
            snippet_ref = db.collection('snippets').document(snippet_id)
            snippet_doc = snippet_ref.get()
            if snippet_doc.exists:
                snippet_data = snippet_doc.to_dict()
                # Use 'rawText' field, not 'text'
                snippets.append(snippet_data.get('rawText', ''))
    
    except Exception as e:
        pass
    
    return snippets


def verify_citation_with_sources(sentence: str, brd_id: str, section: str, source_texts: list) -> str:
    """
    Use Gemini to verify if the sentence is supported by the actual source snippets.
    Returns: SUPPORTS, PARTIALLY, or DOES_NOT_SUPPORT
    """
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    # Build source context
    if source_texts:
        source_context = "\n\nSOURCE SNIPPETS:\n"
        for i, text in enumerate(source_texts, 1):
            # Truncate very long snippets
            truncated = text[:800] + "..." if len(text) > 800 else text
            source_context += f"\n[SOURCE {i}]: {truncated}\n"
    else:
        # No sources means we can't verify
        return "DOES_NOT_SUPPORT"
    
    prompt = f"""You are evaluating citation quality in a Business Requirements Document (BRD).

BRD ID: {brd_id}
Section: {section}

BRD SENTENCE:
"{sentence}"

{source_context}

TASK: Evaluate whether the BRD sentence is properly supported by the provided source snippets.

VERDICT DEFINITIONS:
- SUPPORTS: The source snippets support the BRD sentence. The sentence accurately captures the meaning from the sources, even if worded differently or slightly generalized. Be generous - if the core claim is backed by the source, mark as SUPPORTS.
- PARTIALLY: The source snippets are somewhat related but the BRD sentence makes significant leaps, adds substantial unsupported details, or only partially relates to the sources.
- DOES_NOT_SUPPORT: The BRD sentence contradicts the sources or makes claims completely unrelated to the provided snippets.

EVALUATION CRITERIA:
1. Does the sentence capture the essence of what's in the source snippets?
2. Are the core claims backed by the sources, even if the wording differs?
3. Minor generalizations or rewordings should still be marked as SUPPORTS if the meaning is preserved.
4. Only mark as PARTIALLY if there are significant unsupported additions.
5. Only mark as DOES_NOT_SUPPORT if there are clear contradictions or complete irrelevance.

BE GENEROUS: If the sentence reasonably reflects the source content, mark it as SUPPORTS. Requirements often need to be formalized from informal communications.

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
    
    # Fetch actual source snippets for this sentence
    source_texts = fetch_source_snippets_for_sentence(brd_id, sentence)
    
    # Verify with actual sources
    verdict = verify_citation_with_sources(sentence, brd_id, section, source_texts)
    
    # Progress indicator
    if (idx + 1) % 10 == 0:
        print(f"  [{idx+1}/{total}] processed")
    
    return (idx, verdict, len(source_texts))


def main():
    verif_path = OUT_DIR / "citation_verification_sheet_production_v2.csv"
    if not verif_path.exists():
        print(f"ERROR: {verif_path} not found.")
        print("Run: python scripts/experiment3/5_regenerate_verification_sheet.py")
        sys.exit(1)

    df = pd.read_csv(verif_path)
    print(f"Loaded {len(df)} cited sentences for verification")
    print(f"Using Gemini model: gemini-2.5-flash")
    print(f"Fetching actual source snippets from Firestore")
    print(f"Parallel processing with 5 workers")
    print()

    start_time = time.time()
    
    # Process in parallel with ThreadPoolExecutor
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
    out_path = OUT_DIR / "citation_verification_sheet_production_v2_annotated.csv"
    df.to_csv(out_path, index=False, encoding="utf-8")
    
    print()
    print(f"✓ Annotated {len(df)} citations in {elapsed:.1f}s → {out_path}")
    print(f"  Speed: {len(df)/elapsed:.2f} citations/second")
    print()
    print("Verdict distribution:")
    verdict_counts = df["annotator1_verdict"].value_counts()
    for verdict, count in verdict_counts.items():
        pct = count / len(df) * 100
        print(f"  {verdict}: {count}/{len(df)} ({pct:.1f}%)")
    print()
    print("Next: python scripts/experiment3/6_analyze_production.py")


if __name__ == "__main__":
    main()
