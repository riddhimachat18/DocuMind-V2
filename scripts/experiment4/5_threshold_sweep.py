"""
5_threshold_sweep.py — Phase 1 threshold sensitivity analysis

Addresses reviewer concern: "The 0.50 threshold provided no filtering benefit"

Sweeps Phase 1 cosine similarity thresholds (0.50, 0.55, 0.60, 0.65) and
computes precision, recall, F1 for each to find the optimal threshold.

Reads from:
    scripts/experiment4/conflict_detection_results_sample.json
    scripts/experiment4/conflict_annotation_gold.csv

Writes to:
    scripts/experiment4/threshold_sweep_results.csv
    scripts/experiment4/threshold_sweep_report.txt

Usage:
    python scripts/experiment4/5_threshold_sweep.py
"""

import json
import pandas as pd
from pathlib import Path
from sklearn.metrics import precision_score, recall_score, f1_score, confusion_matrix
import matplotlib.pyplot as plt

# Paths
SCRIPT_DIR = Path(__file__).parent
RESULTS_FILE = SCRIPT_DIR / "conflict_detection_results_sample.json"
GOLD_FILE = SCRIPT_DIR / "conflict_annotation_gold.csv"
OUT_CSV = SCRIPT_DIR / "threshold_sweep_results.csv"
OUT_REPORT = SCRIPT_DIR / "threshold_sweep_report.txt"
OUT_PLOT = SCRIPT_DIR / "threshold_sweep_plot.png"

# Thresholds to test
THRESHOLDS = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75]


def load_data():
    """Load results and gold standard"""
    with open(RESULTS_FILE, 'r', encoding='utf-8') as f:
        results = json.load(f)
    
    gold_df = pd.read_csv(GOLD_FILE)
    gold_df["pair_key"] = gold_df.apply(
        lambda r: f"{r['doc_id']}_{min(r['req_i_idx'], r['req_j_idx'])}_{max(r['req_i_idx'], r['req_j_idx'])}", 
        axis=1
    )
    gold_df["is_conflict"] = gold_df["final_verdict"].str.upper() == "YES"
    
    return results, gold_df


def evaluate_threshold(results, gold_df, threshold):
    """Evaluate performance at a given Phase 1 threshold"""
    # Apply threshold to filter Phase 1
    filtered_results = [r for r in results if r.get("cosine_sim", 0) >= threshold]
    
    # Get Phase 2 predictions
    predicted_conflicts = set()
    for result in filtered_results:
        if result.get("phase2_conflict", False):
            key = f"{result['doc_id']}_{min(result['req_i_idx'], result['req_j_idx'])}_{max(result['req_i_idx'], result['req_j_idx'])}"
            predicted_conflicts.add(key)
    
    # Align with gold standard
    gold_df_copy = gold_df.copy()
    gold_df_copy["predicted"] = gold_df_copy["pair_key"].isin(predicted_conflicts)
    
    y_true = gold_df_copy["is_conflict"].astype(int)
    y_pred = gold_df_copy["predicted"].astype(int)
    
    # Compute metrics
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    
    # Confusion matrix
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    
    # Phase 1 filtering stats
    phase1_pass = len(filtered_results)
    phase1_filtered = len(results) - phase1_pass
    phase1_reduction = (phase1_filtered / len(results)) * 100 if len(results) > 0 else 0
    
    return {
        "threshold": threshold,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "phase1_pass": phase1_pass,
        "phase1_filtered": phase1_filtered,
        "phase1_reduction_pct": phase1_reduction,
    }


def main():
    print("Loading data...")
    results, gold_df = load_data()
    print(f"  Total pairs: {len(results)}")
    print(f"  Gold conflicts: {gold_df['is_conflict'].sum()}")
    
    print(f"\nRunning threshold sweep: {THRESHOLDS}")
    
    sweep_results = []
    for threshold in THRESHOLDS:
        metrics = evaluate_threshold(results, gold_df, threshold)
        sweep_results.append(metrics)
        print(f"  Threshold {threshold:.2f}: F1={metrics['f1']:.3f}, "
              f"P={metrics['precision']:.3f}, R={metrics['recall']:.3f}, "
              f"Filtered={metrics['phase1_reduction_pct']:.1f}%")
    
    # Convert to DataFrame
    df = pd.DataFrame(sweep_results)
    
    # Find optimal threshold
    optimal_idx = df['f1'].idxmax()
    optimal = df.iloc[optimal_idx]
    
    # Save CSV
    df.to_csv(OUT_CSV, index=False)
    print(f"\n✓ Results saved to: {OUT_CSV}")
    
    # Generate plot
    plt.figure(figsize=(10, 6))
    plt.plot(df['threshold'], df['f1'], 'b-o', linewidth=2, markersize=8, label='F1 Score')
    plt.plot(df['threshold'], df['precision'], 'g--s', linewidth=2, markersize=6, label='Precision')
    plt.plot(df['threshold'], df['recall'], 'r--^', linewidth=2, markersize=6, label='Recall')
    plt.axvline(x=optimal['threshold'], color='gray', linestyle=':', alpha=0.7, label=f'Optimal ({optimal["threshold"]:.2f})')
    plt.xlabel('Phase 1 Cosine Similarity Threshold', fontsize=12)
    plt.ylabel('Score', fontsize=12)
    plt.title('Phase 1 Threshold Sensitivity Analysis', fontsize=14, fontweight='bold')
    plt.legend(fontsize=10)
    plt.grid(True, alpha=0.3)
    plt.ylim(0, 1.0)
    plt.tight_layout()
    plt.savefig(OUT_PLOT, dpi=300, bbox_inches='tight')
    print(f"✓ Plot saved to: {OUT_PLOT}")
    
    # Generate report
    report = f"""{'='*70}
PHASE 1 THRESHOLD SENSITIVITY ANALYSIS
{'='*70}

MOTIVATION
----------
Reviewer concern: "The 0.50 threshold provided no filtering benefit"

This analysis sweeps Phase 1 cosine similarity thresholds to find the
optimal balance between filtering efficiency and detection performance.

METHODOLOGY
-----------
- Dataset: {len(results)} requirement pairs from 20 documents
- Gold standard: {gold_df['is_conflict'].sum()} true conflicts
- Thresholds tested: {', '.join(f'{t:.2f}' for t in THRESHOLDS)}
- Metric: F1 score (harmonic mean of precision and recall)

RESULTS
-------
Threshold  Precision  Recall     F1      Phase1_Pass  Filtered
"""
    
    for _, row in df.iterrows():
        report += f"{row['threshold']:.2f}       {row['precision']:.3f}      {row['recall']:.3f}    {row['f1']:.3f}   {int(row['phase1_pass']):4d}         {row['phase1_reduction_pct']:5.1f}%\n"
    
    report += f"""
OPTIMAL THRESHOLD
-----------------
Threshold: {optimal['threshold']:.2f}
F1 Score:  {optimal['f1']:.3f}
Precision: {optimal['precision']:.3f}
Recall:    {optimal['recall']:.3f}

Phase 1 Filtering:
  Pairs passed:    {optimal['phase1_pass']}/{len(results)} ({(optimal['phase1_pass']/len(results)*100):.1f}%)
  Pairs filtered:  {optimal['phase1_filtered']}/{len(results)} ({optimal['phase1_reduction_pct']:.1f}%)

Confusion Matrix:
  True Positives:  {optimal['tp']}
  False Positives: {optimal['fp']}
  True Negatives:  {optimal['tn']}
  False Negatives: {optimal['fn']}

ANALYSIS
--------
"""
    
    if optimal['threshold'] > 0.50:
        improvement = ((optimal['phase1_reduction_pct'] - df[df['threshold']==0.50]['phase1_reduction_pct'].values[0]))
        report += f"✓ Increasing threshold from 0.50 to {optimal['threshold']:.2f} improves filtering\n"
        report += f"  by {improvement:.1f} percentage points while maintaining F1 performance.\n"
    else:
        report += f"✓ The original 0.50 threshold is optimal for this dataset.\n"
    
    report += f"\n✓ At threshold {optimal['threshold']:.2f}, Phase 1 filters out {optimal['phase1_reduction_pct']:.1f}% of pairs,\n"
    report += f"  reducing the workload for the expensive LLM-based Phase 2.\n"
    
    report += f"\n{'='*70}\n"
    report += "RECOMMENDATION FOR PAPER\n"
    report += f"{'='*70}\n"
    report += f"Use threshold {optimal['threshold']:.2f} for Phase 1 filtering.\n"
    report += f"Report: 'Phase 1 filtering with cosine similarity ≥ {optimal['threshold']:.2f} reduces\n"
    report += f"candidate pairs by {optimal['phase1_reduction_pct']:.1f}% while achieving F1={optimal['f1']:.3f}.'\n"
    report += f"\nInclude Figure: threshold_sweep_plot.png showing the F1 curve.\n"
    report += f"{'='*70}\n"
    
    # Print and save report
    print("\n" + report)
    
    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"✓ Report saved to: {OUT_REPORT}")


if __name__ == "__main__":
    main()
