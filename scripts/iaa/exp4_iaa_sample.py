"""
exp4_iaa_sample.py — Extract a stratified IAA sample from the Experiment 4
conflict detection gold standard for second-annotator validation.

Selects a balanced sample across conflict types:
  - 30 CONTRADICTION
  - 40 OVERLAP
  - 10 IMPLICIT
  - 10 NO_CONFLICT

Reads from:  scripts/experiment4/conflict_annotation_gold.csv
Writes to:   
  - scripts/iaa/exp4_iaa_sheet_full.csv (with annotator1 labels for later κ computation)
  - scripts/iaa/exp4_iaa_sheet.csv (blind sheet for annotator2, labels removed)

Usage:
    python scripts/iaa/exp4_iaa_sample.py
"""

import csv
import random
from pathlib import Path

# Get the project root (2 levels up from this script)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent

SRC = PROJECT_ROOT / "scripts/experiment4/conflict_annotation_gold.csv"
OUT_FULL = SCRIPT_DIR / "exp4_iaa_sheet_full.csv"
OUT_BLIND = SCRIPT_DIR / "exp4_iaa_sheet.csv"

# Stratified sampling targets
SAMPLE_TARGETS = {
    "CONTRADICTION": 30,
    "OVERLAP": 40,
    "IMPLICIT": 10,
    "NO_CONFLICT": 10,
}
RANDOM_SEED = 42


def main():
    print(f"Reading gold standard from: {SRC}")
    
    with open(SRC, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    print(f"Total annotated pairs: {len(rows)}")
    
    # Map final_verdict to conflict types
    # YES verdict has conflict_type, NO verdict maps to NO_CONFLICT
    by_type = {
        "CONTRADICTION": [],
        "OVERLAP": [],
        "IMPLICIT": [],
        "NO_CONFLICT": [],
    }
    
    for row in rows:
        verdict = row.get("final_verdict", "").strip().upper()
        conflict_type = row.get("conflict_type", "").strip().upper()
        
        if verdict == "YES":
            # Conflict exists - use the conflict_type
            if conflict_type in by_type:
                by_type[conflict_type].append(row)
            else:
                # Unknown conflict type, skip or log
                print(f"Warning: Unknown conflict_type '{conflict_type}' for pair {row.get('doc_id')}")
        elif verdict == "NO":
            # No conflict
            by_type["NO_CONFLICT"].append(row)
    
    print("\nDistribution in gold standard:")
    for ctype, pool in by_type.items():
        print(f"  {ctype}: {len(pool)}")
    
    # Stratified sampling
    random.seed(RANDOM_SEED)
    sample = []
    
    for ctype, target in SAMPLE_TARGETS.items():
        pool = by_type[ctype]
        n = min(target, len(pool))
        if n < target:
            print(f"\nWarning: Only {n} {ctype} pairs available (target: {target})")
        selected = random.sample(pool, n)
        sample.extend(selected)
        print(f"  Sampled {n} {ctype} pairs")
    
    random.shuffle(sample)
    print(f"\nTotal sample size: {len(sample)}")
    
    # Define output fieldnames
    fieldnames_full = [
        "pair_id",
        "doc_id",
        "req_i_idx",
        "req_j_idx",
        "requirement_A",
        "requirement_B",
        "cosine_sim",
        "annotator1_label",      # For κ computation later
        "annotator2_label",      # Blank - second annotator fills
        "annotator2_notes",
    ]
    
    fieldnames_blind = [
        "pair_id",
        "doc_id",
        "req_i_idx",
        "req_j_idx",
        "requirement_A",
        "requirement_B",
        "cosine_sim",
        "annotator2_label",      # Blank - second annotator fills
        "annotator2_notes",
    ]
    
    # Write full sheet (with annotator1 labels)
    with open(OUT_FULL, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames_full)
        writer.writeheader()
        
        for idx, row in enumerate(sample, 1):
            # Determine annotator1_label
            verdict = row.get("final_verdict", "").strip().upper()
            if verdict == "YES":
                label = row.get("conflict_type", "").strip().upper()
            else:
                label = "NO_CONFLICT"
            
            writer.writerow({
                "pair_id": f"P{idx:03d}",
                "doc_id": row["doc_id"],
                "req_i_idx": row["req_i_idx"],
                "req_j_idx": row["req_j_idx"],
                "requirement_A": row["req_i"],
                "requirement_B": row["req_j"],
                "cosine_sim": row.get("cosine_sim", ""),
                "annotator1_label": label,
                "annotator2_label": "",
                "annotator2_notes": "",
            })
    
    print(f"\n✓ Full sheet saved to: {OUT_FULL}")
    
    # Write blind sheet (without annotator1 labels)
    with open(OUT_BLIND, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames_blind)
        writer.writeheader()
        
        for idx, row in enumerate(sample, 1):
            writer.writerow({
                "pair_id": f"P{idx:03d}",
                "doc_id": row["doc_id"],
                "req_i_idx": row["req_i_idx"],
                "req_j_idx": row["req_j_idx"],
                "requirement_A": row["req_i"],
                "requirement_B": row["req_j"],
                "cosine_sim": row.get("cosine_sim", ""),
                "annotator2_label": "",
                "annotator2_notes": "",
            })
    
    print(f"✓ Blind sheet saved to: {OUT_BLIND}")
    
    print("\n" + "="*70)
    print("ANNOTATION GUIDE FOR SECOND ANNOTATOR")
    print("="*70)
    print("""
For each requirement pair, assign ONE of these labels:

CONTRADICTION
  Two requirements that cannot both be satisfied simultaneously.
  Example: "System must support Windows only" vs "System must support Linux"

OVERLAP
  Two requirements describing the same behaviour, possibly redundant.
  Example: "User can log in with email" vs "System allows email-based login"

IMPLICIT
  One requirement silently assumes something the other violates.
  Example: "System stores data locally" vs "System must work offline"
  (First assumes network, second forbids it)

NO_CONFLICT
  Independent requirements with no relationship or conflict.
  Example: "UI must be blue" vs "System logs errors to file"

Fill in the 'annotator2_label' column with one of these four labels.
Use 'annotator2_notes' for any uncertainty or edge cases.
""")
    print("="*70)


if __name__ == "__main__":
    main()
