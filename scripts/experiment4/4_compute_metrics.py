"""
Experiment 4 - Step 4: Compute precision, recall, F1 against gold standard
Compare with S3CDA and GPT-4o baselines
"""
import json
import pandas as pd
from pathlib import Path
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix

# Load gold standard (after manual annotation and resolution)
gold_file = Path("scripts/experiment4/conflict_annotation_gold.csv")
results_file = Path("scripts/experiment4/conflict_detection_results_sample.json")
output_file = Path("scripts/experiment4/experiment4_report.txt")

if not gold_file.exists():
    print(f"ERROR: Gold standard file not found: {gold_file}")
    print("\nPlease complete manual annotation first:")
    print("1. Open conflict_annotation_sheet.csv")
    print("2. Have 2 annotators label conflicts (YES/NO)")
    print("3. Compute Cohen's Kappa for inter-annotator agreement")
    print("4. Resolve disagreements")
    print("5. Save final gold standard as conflict_annotation_gold.csv")
    print("   Required columns: doc_id, req_i_idx, req_j_idx, final_verdict (YES/NO)")
    exit(1)

# Load gold standard
print("Loading gold standard...")
gold_df = pd.read_csv(gold_file)

# Create pair key for matching
gold_df["pair_key"] = gold_df.apply(
    lambda r: f"{r['doc_id']}_{min(r['req_i_idx'], r['req_j_idx'])}_{max(r['req_i_idx'], r['req_j_idx'])}", 
    axis=1
)
gold_df["is_conflict"] = gold_df["final_verdict"].str.upper() == "YES"

print(f"  Total annotated pairs: {len(gold_df)}")
print(f"  Conflicts in gold standard: {gold_df['is_conflict'].sum()}")

# Load DocuMind predictions
print("\nLoading DocuMind predictions...")
with open(results_file, 'r', encoding='utf-8') as f:
    results = json.load(f)

predicted_conflicts = set()
phase1_total = 0
phase2_total = 0
all_pairs_total = len(results)

for result in results:
    if result.get("phase1_pass", False):
        phase1_total += 1
    if result.get("phase2_conflict", False):
        phase2_total += 1
        # Create pair key
        key = f"{result['doc_id']}_{min(result['req_i_idx'], result['req_j_idx'])}_{max(result['req_i_idx'], result['req_j_idx'])}"
        predicted_conflicts.add(key)

print(f"  Total pairs evaluated: {all_pairs_total:,}")
print(f"  Phase 1 candidates: {phase1_total:,}")
print(f"  Phase 2 confirmed: {phase2_total:,}")

# Align predictions with gold standard
gold_df["predicted"] = gold_df["pair_key"].isin(predicted_conflicts)

y_true = gold_df["is_conflict"].astype(int)
y_pred = gold_df["predicted"].astype(int)

# Compute metrics
precision = precision_score(y_true, y_pred, zero_division=0)
recall = recall_score(y_true, y_pred, zero_division=0)
f1 = f1_score(y_true, y_pred, zero_division=0)

# Confusion matrix
tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

# Generate report
report = f"""{'='*70}
EXPERIMENT 4 — CONFLICT DETECTION EVALUATION
{'='*70}

DATASET
-------
Documents evaluated:        {len(results)}
Total requirement pairs:    {all_pairs_total:,}
Annotated pairs:            {len(gold_df):,}
True conflicts (gold):      {gold_df['is_conflict'].sum()}

PHASE FILTERING PERFORMANCE
----------------------------
Phase 1 candidates:         {phase1_total:,} ({phase1_total/all_pairs_total*100:.2f}% of all pairs)
Phase 2 confirmed:          {phase2_total:,} ({phase2_total/phase1_total*100:.1f}% of phase1)
Phase 1→2 reduction:        {(1 - phase2_total/phase1_total)*100:.1f}% filtered out by LLM

CONFLICT DETECTION METRICS
---------------------------
Precision:                  {precision:.3f}
Recall:                     {recall:.3f}
F1 Score:                   {f1:.3f}

Confusion Matrix:
  True Negatives (TN):      {tn}
  False Positives (FP):     {fp}
  False Negatives (FN):     {fn}
  True Positives (TP):      {tp}

BASELINE COMPARISON
-------------------
DocuMind (Two-Phase):       F1 = {f1:.3f}
S3CDA (Baseline):           F1 = 0.896
GPT-4o (Baseline):          F1 = 0.594

ANALYSIS
--------
"""

if f1 > 0.896:
    report += f"✓ DocuMind OUTPERFORMS S3CDA by {(f1-0.896)*100:.1f} F1 points\n"
elif f1 > 0.594:
    report += f"✓ DocuMind outperforms GPT-4o but below S3CDA\n"
    report += f"  Gap to S3CDA: {(0.896-f1)*100:.1f} F1 points\n"
else:
    report += f"⚠ DocuMind below both baselines\n"

report += f"\nPhase 1 (semantic similarity) filters out {(1-phase1_total/all_pairs_total)*100:.1f}% of pairs\n"
report += f"Phase 2 (LLM verification) filters out {(1-phase2_total/phase1_total)*100:.1f}% of phase1 candidates\n"
report += f"Overall: Only {phase2_total/all_pairs_total*100:.3f}% of all pairs flagged as conflicts\n"

report += f"\n{'='*70}\n"

# Print and save report
print("\n" + report)

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(report)

print(f"✓ Report saved to: {output_file}")

# Save detailed results
detailed_file = Path("scripts/experiment4/experiment4_detailed.csv")
gold_df.to_csv(detailed_file, index=False)
print(f"✓ Detailed results saved to: {detailed_file}")
