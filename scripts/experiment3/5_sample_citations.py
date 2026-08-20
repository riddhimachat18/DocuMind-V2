"""
5_sample_citations.py — Sample 50 cited sentences for manual verification.

Stratified: 25 from email BRDs, 25 from transcript BRDs.
Fetches the actual source snippet text from Firestore for each citation
so annotators can judge whether the snippet supports the BRD sentence.

Reads from:
    data/experiment3/citation_data.csv

Writes to:
    data/experiment3/citation_verification_sheet.csv   ← give to annotators

Annotators fill in:
    annotator_verdict: SUPPORTS | PARTIALLY | DOES_NOT_SUPPORT
    annotator_notes:   free text

Usage:
    export GOOGLE_APPLICATION_CREDENTIALS="documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"
    python3 scripts/experiment3/5_sample_citations.py
"""

import ast
import json
import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd

CRED_FILE = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"
OUT_DIR = Path("data/experiment3")
N_PER_SOURCE = 25   # 25 email + 25 transcript = 50 total
RANDOM_SEED = 42


def fetch_snippet_text(db, snippet_id: str) -> str:
    try:
        doc = db.collection("snippets").document(snippet_id).get()
        if doc.exists:
            d = doc.to_dict()
            return d.get("rawText") or d.get("text") or "NOT FOUND"
        return "NOT FOUND"
    except Exception as e:
        return f"ERROR: {e}"


def main():
    if not os.path.exists(CRED_FILE):
        print(f"ERROR: {CRED_FILE} not found")
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_FILE)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    df = pd.read_csv(OUT_DIR / "citation_data.csv")
    cited = df[df["has_citation"] == True].copy()

    email_pool = cited[cited["source_type"] == "email"]
    transcript_pool = cited[cited["source_type"] == "transcript"]

    n_email = min(N_PER_SOURCE, len(email_pool))
    n_transcript = min(N_PER_SOURCE, len(transcript_pool))

    if n_email < N_PER_SOURCE:
        print(f"  WARNING: only {n_email} cited email sentences available (wanted {N_PER_SOURCE})")
    if n_transcript < N_PER_SOURCE:
        print(f"  WARNING: only {n_transcript} cited transcript sentences available (wanted {N_PER_SOURCE})")

    email_sample = email_pool.sample(n_email, random_state=RANDOM_SEED)
    transcript_sample = transcript_pool.sample(n_transcript, random_state=RANDOM_SEED)
    sample = pd.concat([email_sample, transcript_sample]).reset_index(drop=True)

    print(f"Sampled {len(sample)} citations ({n_email} email + {n_transcript} transcript)")
    print("Fetching source snippets from Firestore...")

    rows = []
    for i, row in sample.iterrows():
        # cited_snippet_ids is stored as a Python list repr string
        try:
            snippet_ids = ast.literal_eval(row["cited_snippet_ids"])
        except Exception:
            snippet_ids = []

        snippets = [fetch_snippet_text(db, sid) for sid in snippet_ids[:2]]
        while len(snippets) < 2:
            snippets.append("")

        rows.append({
            "brd_id": row["brd_id"],
            "source_type": row["source_type"],
            "source_label": row["source_label"],
            "section": row["section"],
            "brd_sentence": row["sentence"],
            "source_snippet_1": snippets[0],
            "source_snippet_2": snippets[1],
            # Single Annotator
            "annotator1_verdict": "",   # SUPPORTS / PARTIALLY / DOES_NOT_SUPPORT
            "annotator1_notes": "",
        })

        if (i + 1) % 10 == 0:
            print(f"  {i+1}/{len(sample)} done")

    out_df = pd.DataFrame(rows)
    out_path = OUT_DIR / "citation_verification_sheet.csv"
    out_df.to_csv(out_path, index=False)
    print(f"\nExported {len(out_df)} rows → {out_path}")
    print("Next: fill in annotator1_verdict, then save as citation_verification_sheet_annotated.csv")
    print("Then run: python scripts/experiment3/6_analyze.py")


if __name__ == "__main__":
    main()
