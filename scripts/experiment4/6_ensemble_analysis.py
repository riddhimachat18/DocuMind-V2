"""
6_ensemble_analysis.py — Ensemble conflict detection analysis

Addresses reviewer concern about combining DocuMind with S3CDA baseline.

Computes ensemble performance using:
  - Union: Flag if EITHER DocuMind OR S3CDA detects conflict (high recall)
  - Intersection: Flag if BOTH DocuMind AND S3CDA detect conflict (high precision)

Reads from:
    scripts/experiment4/conflict_detection_results_sample.json
    scripts/experiment4/conflict_annotation_gold.csv
    scripts/experiment4/s3cda_predictions.csv (if available)

Writes to:
    scripts/experiment4/ensemble_results.txt

Usage:
    python scripts/experiment4/6_ensemble_analysis.py
"""

import json
import pandas as pd
from pathlib import Path
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix

# Paths
SCRIPT_DIR = Path(__file__).parent
RESULTS_FILE = SCRIPT_DIR / "conflict_detection_results_sample.json"
GOLD_FILE = SCRIPT_DIR / "conflict_annotation_gold.csv"
S3CDA_FILE = SCRIPT_DIR / "s3cda_predictions.csv"  # Create this if you have S3CDA results
OUT_REPORT = SCRIPT_DIR / "ensemble_results.txt"


def load_data():
    """Load DocuMind results and gold standard"""
    with open(RESULTS_FILE, 'r', encoding='utf-8') as f:
        results = json.load(f)
    
    gold_df = pd.read_csv(GOLD_FILE)
    gold_df["pair_key"] = gold_df.apply(
        lambda r: f"{r['doc_id']}_{min(r['req_i_idx'], r['req_j_idx'])}_{max(r['req_i_idx'], r['req_j_idx'])}", 
        axis=1
    )
    gold_df["is_conflict"] = gold_df["final_verdict"].str.upper() == "YES"
    
    return results, gold_df


def get_documind_predictions(results):
    """Extract DocuMind conflict predictions"""
    predicted = set()
    for result in results:
        if result.get("phase2_conflict", False):
            key = f"{result['doc_id']}_{min(result['req_i_idx'], result['req_j_idx'])}_{max(result['req_i_idx'], result['req_j_idx'])}"
            predicted.add(key)
    return predicted


def load_s3cda_predictions():
    """Load S3CDA predictions if available"""
    if not S3CDA_FILE.exists():
        print(f"\nWARNING: {S3CDA_FILE} not found")
        print("To run ensemble analysis, you need S3CDA predictions.")
        print("\nOptions:")
        print("1. Contact Malik et al. for their predictions on your corpus")
        print("2. Run S3CDA (open source) on your 409 pairs")
        print("3. Create s3cda_predictions.csv with columns: pair_key, s3cda_conflict")
        print("\nFor now, simulating S3CDA with baseline F1=0.896 from paper...")
        return None
    
    s3cda_df = pd.read_csv(S3CDA_FILE)
    return set(s3cda_df[s3cda_df['s3cda_conflict'] == True]['pair_key'])


def evaluate_predictions(gold_df, predicted_conflicts):
    """Compute metrics for a set of predictions"""
    gold_df_copy = gold_df.copy()
    gold_df_copy["predicted"] = gold_df_copy["pair_key"].isin(predicted_conflicts)
    
    y_true = gold_df_copy["is_conflict"].astype(int)
    y_pred = gold_df_copy["predicted"].astype(int)
    
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
    }


def simulate_s3cda_baseline(gold_df):
    """
    Simulate S3CDA predictions to achieve F1≈0.896 as reported in paper.
    This is a placeholder until real S3CDA predictions are available.
    """
    # S3CDA reported: F1=0.896
    # We'll simulate by selecting conflicts with high confidence
    # This is just for demonstration - replace with actual S3CDA results
    
    true_conflicts = gold_df[gold_df['is_conflict']]['pair_key'].tolist()
    
    # Simulate S3CDA catching ~90% of conflicts with ~90% precision
    import random
    random.seed(42)
    
    # Catch 90% of true conflicts (high recall)
    s3cda_tp = random.sample(true_conflicts, int(len(true_conflicts) * 0.90))
    
    # Add some false positives to get precision ~90%
    false_conflicts = gold_df[~gold_df['is_conflict']]['pair_key'].tolist()
    num_fp = int(len(s3cda_tp) * 0.10)  # 10% FP rate
    s3cda_fp = random.sample(false_conflicts, min(num_fp, len(false_conflicts)))
    
    return set(s3cda_tp + s3cda_fp)


def main():
    print("Loading data...")
    results, gold_df = load_data()
    print(f"  Total pairs: {len(results)}")
    print(f"  Gold conflicts: {gold_df['is_conflict'].sum()}")
    
    # Get DocuMind predictions
    documind_conflicts = get_documind_predictions(results)
    print(f"  DocuMind predictions: {len(documind_conflicts)}")
    
    # Get S3CDA predictions
    s3cda_conflicts = load_s3cda_predictions()
    
    if s3cda_conflicts is None:
        print("\nSimulating S3CDA baseline (F1≈0.896)...")
        s3cda_conflicts = simulate_s3cda_baseline(gold_df)
        is_simulated = True
    else:
        print(f"  S3CDA predictions: {len(s3cda_conflicts)}")
        is_simulated = False
    
    # Evaluate individual systems
    print("\nEvaluating individual systems...")
    documind_metrics = evaluate_predictions(gold_df, documind_conflicts)
    s3cda_metrics = evaluate_predictions(gold_df, s3cda_conflicts)
    
    # Ensemble: Union (either system flags it)
    union_conflicts = documind_conflicts.union(s3cda_conflicts)
    union_metrics = evaluate_predictions(gold_df, union_conflicts)
    
    # Ensemble: Intersection (both systems flag it)
    intersection_conflicts = documind_conflicts.intersection(s3cda_conflicts)
    intersection_metrics = evaluate_predictions(gold_df, intersection_conflicts)
    
    # Generate report
    report = f"""{'='*70}
ENSEMBLE CONFLICT DETECTION ANALYSIS
{'='*70}

MOTIVATION
----------
Reviewer suggestion: Combine DocuMind with S3CDA baseline for improved
performance through ensemble methods.

METHODOLOGY
-----------
Dataset: {len(results)} requirement pairs, {gold_df['is_conflict'].sum()} true conflicts

Ensemble Strategies:
  1. UNION: Flag if EITHER DocuMind OR S3CDA detects conflict
     → Maximizes recall (catches more conflicts)
  
  2. INTERSECTION: Flag if BOTH DocuMind AND S3CDA detect conflict
     → Maximizes precision (reduces false positives)

{'NOTE: S3CDA results are SIMULATED based on reported F1=0.896' if is_simulated else 'Using actual S3CDA predictions'}
{'Replace with real S3CDA predictions for final paper.' if is_simulated else ''}

RESULTS
-------

System              Precision  Recall     F1      TP   FP   TN   FN
"""
    
    systems = [
        ("DocuMind (Two-Phase)", documind_metrics),
        ("S3CDA (Baseline)", s3cda_metrics),
        ("Ensemble: Union", union_metrics),
        ("Ensemble: Intersection", intersection_metrics),
    ]
    
    for name, metrics in systems:
        report += f"{name:23s} {metrics['precision']:.3f}      {metrics['recall']:.3f}    {metrics['f1']:.3f}   {metrics['tp']:3d}  {metrics['fp']:3d}  {metrics['tn']:3d}  {metrics['fn']:3d}\n"
    
    report += f"""
ANALYSIS
--------
"""
    
    # Compare DocuMind vs S3CDA
    if documind_metrics['f1'] > s3cda_metrics['f1']:
        report += f"✓ DocuMind outperforms S3CDA baseline by {(documind_metrics['f1'] - s3cda_metrics['f1'])*100:.1f} F1 points\n"
    else:
        report += f"⚠ DocuMind F1 is {(s3cda_metrics['f1'] - documind_metrics['f1'])*100:.1f} points below S3CDA\n"
    
    # Union analysis
    recall_gain = (union_metrics['recall'] - max(documind_metrics['recall'], s3cda_metrics['recall'])) * 100
    report += f"\nUnion Ensemble:\n"
    report += f"  Recall: {union_metrics['recall']:.3f} (gain: {recall_gain:+.1f} points)\n"
    report += f"  F1: {union_metrics['f1']:.3f}\n"
    if union_metrics['recall'] > documind_metrics['recall']:
        report += f"  ✓ Recovers {union_metrics['tp'] - documind_metrics['tp']} additional conflicts\n"
    
    # Intersection analysis
    precision_gain = (intersection_metrics['precision'] - max(documind_metrics['precision'], s3cda_metrics['precision'])) * 100
    report += f"\nIntersection Ensemble:\n"
    report += f"  Precision: {intersection_metrics['precision']:.3f} (gain: {precision_gain:+.1f} points)\n"
    report += f"  F1: {intersection_metrics['f1']:.3f}\n"
    if intersection_metrics['precision'] > documind_metrics['precision']:
        report += f"  ✓ Reduces false positives by {documind_metrics['fp'] - intersection_metrics['fp']}\n"
    
    report += f"""
COMPLEMENTARITY ANALYSIS
------------------------
DocuMind-only conflicts:  {len(documind_conflicts - s3cda_conflicts)}
S3CDA-only conflicts:     {len(s3cda_conflicts - documind_conflicts)}
Both systems agree:       {len(intersection_conflicts)}

Agreement rate: {len(intersection_conflicts) / len(union_conflicts) * 100:.1f}%
"""
    
    report += f"""
{'='*70}
RECOMMENDATION FOR PAPER
{'='*70}
"""
    
    if is_simulated:
        report += """
1. Obtain actual S3CDA predictions on your 409 pairs:
   - Contact Malik et al. for their tool/predictions
   - Or run S3CDA (open source) on your corpus
   
2. Re-run this script with real S3CDA predictions

3. Report ensemble results in Table VII:
   - Show DocuMind, S3CDA, Union, and Intersection
   - Highlight that Union improves recall
   - Highlight that Intersection improves precision
   
4. Even if ensemble doesn't beat S3CDA alone, showing the
   complementarity and trade-offs is valuable.
"""
    else:
        report += f"""
Include in paper:
- Table VII variant showing all four systems
- Discuss complementarity: {len(documind_conflicts - s3cda_conflicts)} unique DocuMind detections
- Union ensemble for high-recall scenarios (code review)
- Intersection ensemble for high-precision scenarios (automated flagging)
"""
    
    report += f"{'='*70}\n"
    
    # Print and save
    print("\n" + report)
    
    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"✓ Report saved to: {OUT_REPORT}")
    
    if is_simulated:
        print("\n⚠ IMPORTANT: Replace simulated S3CDA predictions with real results!")


if __name__ == "__main__":
    main()
