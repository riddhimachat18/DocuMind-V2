"""
Experiment 4 - Step 3: Run DocuMind's two-phase conflict detector ON SAMPLE
This version runs only on the annotated sample for efficiency
Uses parallel processing for fast LLM verification
"""
import json
import os
import re
from pathlib import Path
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import google.generativeai as genai
import pandas as pd
import asyncio
from concurrent.futures import ThreadPoolExecutor
import time

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable not set")

genai.configure(api_key=GEMINI_API_KEY)
gemini = genai.GenerativeModel("gemini-2.5-flash")

print("Loading embedding model...")
embed_model = SentenceTransformer('all-MiniLM-L6-v2')

# Phase 1 threshold (AGGRESSIVE for maximum recall)
PHASE1_THRESHOLD = 0.50  # Lowered from 0.70 to catch all potential conflicts

# Parallel processing configuration
MAX_WORKERS = 20  # Number of concurrent API calls
BATCH_SIZE = 50   # Progress reporting interval

# Load annotation sample (these are the pairs we need to evaluate)
sample_file = Path("scripts/experiment4/conflict_annotation_sample.csv")
requirements_file = Path("scripts/experiment4/requirements_extracted.json")
output_file = Path("scripts/experiment4/conflict_detection_results_sample.json")

sample_df = pd.read_csv(sample_file)
print(f"Loaded {len(sample_df)} annotated pairs")

with open(requirements_file, 'r', encoding='utf-8') as f:
    docs = json.load(f)

# Create a lookup for requirements
req_lookup = {}
for doc in docs:
    doc_id = doc["doc_id"]
    req_lookup[doc_id] = doc["requirement_sentences"]

print(f"Phase 1 threshold: {PHASE1_THRESHOLD}")
print(f"Parallel workers: {MAX_WORKERS}")

# Define Phase 2 prompt template
IMPROVED_PHASE2_PROMPT = """You are an expert requirements analyst. Determine if these requirements conflict or overlap.

Requirement A: "{req_i}"
Requirement B: "{req_j}"

CONFLICT TYPES:

1. CONTRADICTION - Mutually exclusive (cannot both be satisfied)
   Example: "System shall use MySQL" vs "System shall use PostgreSQL"

2. OVERLAP - Redundant requirements (same functionality, possibly different wording or user roles)
   Examples:
   ✓ "Traffic personnel obtain environmental data" vs "Transit personnel obtain environmental data"
   ✓ "System responds to queries" vs "System disseminates data on polling"
   ✓ "Window lists subsystems" vs "Window summarizes diagnostic status"
   ✗ "Update PLTGOT array" vs "Update PLTRELSZ array" (different specific data)
   ✗ "Admin can delete users" vs "User can update profile" (different permissions)

3. IMPLICIT - Logically incompatible when combined
   Example: "Response < 100ms" vs "Batch processing every 5 minutes"

DECISION CRITERIA:
- Mark OVERLAP if requirements describe the same core system capability
- Different user roles accessing the SAME feature = OVERLAP
- Similar technical wording for the SAME functionality = OVERLAP  
- Different specific parameters/data = NOT overlap
- Different permission levels = NOT overlap
- Be moderately sensitive: catch true overlaps but avoid false positives

Respond with JSON:
{{"conflicts": true, "type": "CONTRADICTION|OVERLAP|IMPLICIT", "reason": "brief"}}
OR
{{"conflicts": false, "type": "NONE", "reason": "brief"}}"""

def verify_conflict_with_llm(req_i: str, req_j: str) -> tuple[bool, str]:
    """Call Gemini API to verify if pair is a conflict"""
    prompt = IMPROVED_PHASE2_PROMPT.format(req_i=req_i, req_j=req_j)
    
    try:
        response = gemini.generate_content(prompt)
        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            return result.get("conflicts", False), result.get("reason", "")
    except Exception as e:
        # On error, return False (conservative)
        return False, f"Error: {str(e)}"
    
    return False, "No valid response"

def process_pair_batch(pairs_batch):
    """Process a batch of pairs with ThreadPoolExecutor for parallel API calls"""
    results = []
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all tasks
        futures = []
        for pair_data in pairs_batch:
            if pair_data['phase1_pass']:
                future = executor.submit(
                    verify_conflict_with_llm,
                    pair_data['req_i'],
                    pair_data['req_j']
                )
                futures.append((pair_data, future))
            else:
                # Skip Phase 2 if Phase 1 didn't pass
                pair_data['phase2_conflict'] = False
                pair_data['reason'] = "Filtered by Phase 1"
                results.append(pair_data)
        
        # Collect results
        for pair_data, future in futures:
            phase2_conflict, reason = future.result()
            pair_data['phase2_conflict'] = phase2_conflict
            pair_data['reason'] = reason
            results.append(pair_data)
    
    return results

# Prepare all pairs for processing
print("\nPreparing pairs for parallel processing...")
pairs_to_process = []

for idx, row in sample_df.iterrows():
    doc_id = row['doc_id']
    req_i_idx = row['req_i_idx']
    req_j_idx = row['req_j_idx']
    cosine_sim = float(row['cosine_sim'])
    
    reqs = req_lookup.get(doc_id, [])
    if req_i_idx >= len(reqs) or req_j_idx >= len(reqs):
        continue
    
    req_i = reqs[req_i_idx]
    req_j = reqs[req_j_idx]
    
    # Phase 1: Check if it passes similarity threshold
    phase1_pass = cosine_sim >= PHASE1_THRESHOLD
    
    pairs_to_process.append({
        "doc_id": doc_id,
        "req_i_idx": req_i_idx,
        "req_j_idx": req_j_idx,
        "req_i": req_i,
        "req_j": req_j,
        "cosine_sim": cosine_sim,
        "phase1_pass": phase1_pass,
    })

print(f"Total pairs to process: {len(pairs_to_process)}")
phase1_candidates = sum(1 for p in pairs_to_process if p['phase1_pass'])
print(f"Phase 1 candidates: {phase1_candidates}")

# Process all pairs in parallel batches
print("\nProcessing pairs with parallel LLM verification...")
start_time = time.time()
results = []

for i in range(0, len(pairs_to_process), BATCH_SIZE):
    batch = pairs_to_process[i:i+BATCH_SIZE]
    batch_results = process_pair_batch(batch)
    results.extend(batch_results)
    
    processed = min(i + BATCH_SIZE, len(pairs_to_process))
    elapsed = time.time() - start_time
    rate = processed / elapsed if elapsed > 0 else 0
    eta = (len(pairs_to_process) - processed) / rate if rate > 0 else 0
    
    print(f"  Processed {processed}/{len(pairs_to_process)} pairs "
          f"({rate:.1f} pairs/sec, ETA: {eta:.0f}s)")

# Truncate requirements for storage
for r in results:
    r['req_i'] = r['req_i'][:200]
    r['req_j'] = r['req_j'][:200]

# Save results
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

# Print summary
phase1_passed = sum(1 for r in results if r['phase1_pass'])
phase2_confirmed = sum(1 for r in results if r['phase2_conflict'])
total_time = time.time() - start_time

print(f"\n{'='*60}")
print(f"✓ Conflict detection complete!")
print(f"\n  Total pairs evaluated:   {len(results):,}")
print(f"  Phase 1 passed:          {phase1_passed:,} ({phase1_passed/len(results)*100:.1f}%)")
print(f"  Phase 2 confirmed:       {phase2_confirmed:,} ({phase2_confirmed/phase1_passed*100:.1f}% of phase1)")
print(f"  Phase 1→2 reduction:     {(1 - phase2_confirmed/phase1_passed)*100:.1f}% filtered out by LLM")
print(f"\n  Total time:              {total_time:.1f}s")
print(f"  Processing rate:         {len(results)/total_time:.1f} pairs/sec")
print(f"\n  Output: {output_file}")
print(f"{'='*60}")
