"""
4_extract_citations_production.py — Extract citations from production-quality BRDs.

Reads from:
    data/experiment3/exp3_production_brd_ids.json

Writes to:
    data/experiment3/citation_data_production.csv

Usage:
    python scripts/experiment3/4_extract_citations_production.py
"""

import json
import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd

CRED_FILE = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"
OUT_DIR = Path("data/experiment3")


def sent_split(text: str) -> list[str]:
    """Simple regex sentence splitter."""
    import re
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
    return [p.strip() for p in parts if p.strip()]


def main():
    if not os.path.exists(CRED_FILE):
        print(f"ERROR: {CRED_FILE} not found")
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_FILE)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    with open(OUT_DIR / "exp3_production_brd_ids.json", encoding="utf-8") as f:
        brd_entries = json.load(f)

    results = []

    for entry in brd_entries:
        brd_doc = db.collection("brdVersions").document(entry["brdId"]).get()
        if not brd_doc.exists:
            print(f"  WARNING: BRD {entry['brdId']} not found, skipping")
            continue

        data = brd_doc.to_dict()
        citations: dict = data.get("citations", {})
        sections: dict = data.get("sections", {})

        sentence_count = 0
        for section_name, section_text in sections.items():
            if not section_text:
                continue
            sentences = sent_split(section_text)
            for sent in sentences:
                sent = sent.strip()
                if len(sent) < 20:
                    continue
                cited_snippets = citations.get(sent, [])
                results.append({
                    "brd_id": entry["brdId"],
                    "project_id": entry["projectId"],
                    "source_type": entry["source_type"],
                    "section": section_name,
                    "sentence": sent,
                    "citation_count": len(cited_snippets),
                    "cited_snippet_ids": str(cited_snippets),
                    "has_citation": len(cited_snippets) > 0,
                })
                sentence_count += 1

        print(f"  {entry['brdId']} ({entry['source_type']}): {sentence_count} sentences")

    df = pd.DataFrame(results)
    out_path = OUT_DIR / "citation_data_production.csv"
    df.to_csv(out_path, index=False)

    print(f"\n=== PRODUCTION-QUALITY RESULTS ===")
    print(f"Total sentences:  {len(df)}")
    print(f"Cited sentences:  {df['has_citation'].sum()} ({df['has_citation'].mean()*100:.1f}%)")
    print(f"Uncited (proxy):  {(~df['has_citation']).sum()} ({(~df['has_citation']).mean()*100:.1f}%)")
    print(f"\nBy source type:")
    print(df.groupby("source_type")["has_citation"].agg(['sum', 'count', 'mean']))
    print(f"\nBy section:")
    print(df.groupby("section")["has_citation"].agg(['sum', 'count', 'mean']))
    print(f"\nSaved → {out_path}")


if __name__ == "__main__":
    main()
