"""
8_add_snippet_texts.py — Add actual snippet texts to the annotated CSV file.

Reads the existing citation_verification_sheet_production_v2_annotated.csv,
fetches the actual snippet texts from Firestore, and adds them as new columns.

Reads from:
    data/experiment3/citation_verification_sheet_production_v2_annotated.csv
    Firestore (brdVersions and snippets collections)
    .env (for Firebase credentials)

Writes to:
    data/experiment3/citation_verification_sheet_production_v2_annotated.csv (updated)

Usage:
    python scripts/experiment3/8_add_snippet_texts.py
"""

import os
import sys
import ast
from pathlib import Path
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

OUT_DIR = Path("data/experiment3")

# Initialize Firebase using credentials from environment or default path
if not firebase_admin._apps:
    service_account_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if not service_account_path:
        service_account_path = "documind-6c687-firebase-adminsdk-fbsvc-fb1719410b.json"
    
    if not Path(service_account_path).exists():
        print(f"ERROR: Service account file not found: {service_account_path}")
        print("Set GOOGLE_APPLICATION_CREDENTIALS in .env or ensure the default file exists")
        sys.exit(1)
    
    cred = credentials.Certificate(service_account_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()


def fetch_snippet_texts(brd_id: str, snippet_ids: list) -> dict:
    """Fetch actual snippet texts from Firestore given snippet IDs"""
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
        
        # Fetch all snippets for this project
        snippets_ref = db.collection('snippets').where('projectId', '==', project_id)
        snippet_docs = snippets_ref.stream()
        
        # Build a map of snippet ID to text
        snippet_map = {}
        for doc in snippet_docs:
            data = doc.to_dict()
            # Try both 'text' and 'rawText' fields
            text = data.get('text') or data.get('rawText', '')
            snippet_map[doc.id] = text
        
        # Get the requested snippets
        for idx, snippet_id in enumerate(snippet_ids, 1):
            if snippet_id in snippet_map:
                snippets[f"snippet_{idx}"] = snippet_map[snippet_id]
    
    except Exception as e:
        print(f"  ⚠ Error fetching snippets for {brd_id}: {e}")
    
    return snippets


def main():
    csv_path = OUT_DIR / "citation_verification_sheet_production_v2_annotated.csv"
    
    if not csv_path.exists():
        print(f"ERROR: {csv_path} not found")
        sys.exit(1)
    
    print(f"Reading {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} rows")
    
    # Add new columns for snippet texts
    df['snippet_1'] = ''
    df['snippet_2'] = ''
    df['snippet_3'] = ''
    
    print("\nFetching snippet texts from Firestore...")
    
    for idx, row in df.iterrows():
        snippet_ids_str = row.get("cited_snippet_ids", "")
        snippet_ids = []
        
        try:
            # Handle string representation of list like "['id1', 'id2']"
            if snippet_ids_str and isinstance(snippet_ids_str, str):
                snippet_ids = ast.literal_eval(snippet_ids_str)
        except Exception as e:
            print(f"  ⚠ Row {idx}: Could not parse snippet IDs: {snippet_ids_str}")
            continue
        
        if not snippet_ids:
            continue
        
        # Fetch actual snippet texts from Firestore
        snippet_texts = fetch_snippet_texts(row["brd_id"], snippet_ids)
        
        # Update the dataframe
        df.at[idx, 'snippet_1'] = snippet_texts.get('snippet_1', '')
        df.at[idx, 'snippet_2'] = snippet_texts.get('snippet_2', '')
        df.at[idx, 'snippet_3'] = snippet_texts.get('snippet_3', '')
        
        # Progress indicator
        if (idx + 1) % 50 == 0:
            print(f"  Processed {idx + 1}/{len(df)} rows")
    
    # Save updated CSV
    df.to_csv(csv_path, index=False, encoding='utf-8')
    
    print(f"\n✓ Updated {csv_path}")
    print(f"  Added snippet_1, snippet_2, snippet_3 columns with actual text")
    
    # Show statistics
    non_empty_1 = (df['snippet_1'] != '').sum()
    non_empty_2 = (df['snippet_2'] != '').sum()
    non_empty_3 = (df['snippet_3'] != '').sum()
    
    print(f"\nSnippet statistics:")
    print(f"  Rows with snippet_1: {non_empty_1}/{len(df)} ({non_empty_1/len(df)*100:.1f}%)")
    print(f"  Rows with snippet_2: {non_empty_2}/{len(df)} ({non_empty_2/len(df)*100:.1f}%)")
    print(f"  Rows with snippet_3: {non_empty_3}/{len(df)} ({non_empty_3/len(df)*100:.1f}%)")


if __name__ == "__main__":
    main()
