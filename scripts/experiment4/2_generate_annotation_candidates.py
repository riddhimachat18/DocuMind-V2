"""
Experiment 4 - Step 2: Generate conflict annotation candidates
Uses cosine similarity (threshold 0.5) to pre-filter pairs for manual annotation
"""
import json
import csv
from pathlib import Path
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer

print("Loading embedding model...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# Load extracted requirements
input_file = Path("scripts/experiment4/requirements_extracted.json")
output_file = Path("scripts/experiment4/conflict_annotation_sheet.csv")

with open(input_file, 'r', encoding='utf-8') as f:
    docs = json.load(f)

print(f"Loaded {len(docs)} documents")

all_candidates = []
total_pairs = 0
candidate_pairs = 0

for doc in docs:
    doc_id = doc["doc_id"]
    reqs = doc["requirement_sentences"]
    
    if len(reqs) < 2:
        print(f"{doc_id}: Only {len(reqs)} requirements, skipping")
        continue
    
    print(f"\n{doc_id}: {len(reqs)} requirements")
    
    # Compute embeddings
    embeddings = model.encode(reqs, show_progress_bar=False)
    
    # Compute similarity matrix
    sim_matrix = cosine_similarity(embeddings)
    
    # Generate candidate pairs (similarity >= 0.5)
    doc_candidates = []
    doc_total_pairs = len(reqs) * (len(reqs) - 1) // 2
    
    for i in range(len(reqs)):
        for j in range(i + 1, len(reqs)):
            total_pairs += 1
            if sim_matrix[i][j] >= 0.50:  # Low threshold for annotation
                doc_candidates.append({
                    "doc_id": doc_id,
                    "req_i_idx": i,
                    "req_j_idx": j,
                    "req_i": reqs[i][:200],  # Truncate for CSV readability
                    "req_j": reqs[j][:200],
                    "cosine_sim": f"{sim_matrix[i][j]:.3f}",
                    "annotator1_conflict": "",  # YES / NO
                    "annotator2_conflict": "",  # YES / NO
                    "conflict_type": "",  # CONTRADICTION / OVERLAP / NONE
                    "notes": ""
                })
    
    all_candidates.extend(doc_candidates)
    candidate_pairs += len(doc_candidates)
    
    print(f"  Total pairs: {doc_total_pairs}")
    print(f"  Candidates (sim >= 0.5): {len(doc_candidates)} ({len(doc_candidates)/doc_total_pairs*100:.1f}%)")

# Write to CSV
with open(output_file, 'w', newline='', encoding='utf-8') as f:
    if all_candidates:
        writer = csv.DictWriter(f, fieldnames=all_candidates[0].keys())
        writer.writeheader()
        writer.writerows(all_candidates)

print(f"\n{'='*60}")
print(f"✓ Annotation sheet generated!")
print(f"  Total pairs across all docs: {total_pairs:,}")
print(f"  Candidate pairs (sim >= 0.5): {candidate_pairs:,} ({candidate_pairs/total_pairs*100:.1f}%)")
print(f"  Output: {output_file}")
print(f"\n  Next steps:")
print(f"  1. Have 2 annotators label 'annotator1_conflict' and 'annotator2_conflict' columns (YES/NO)")
print(f"  2. Label 'conflict_type' as CONTRADICTION, OVERLAP, or NONE")
print(f"  3. Compute inter-annotator agreement (Cohen's Kappa)")
print(f"  4. Resolve disagreements and create gold standard")
print(f"{'='*60}")
