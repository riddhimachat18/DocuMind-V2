"""
7_domain_breakdown.py — Per-domain conflict detection analysis

Addresses reviewer concern about external validity across domains.

Breaks down conflict detection results by document domain:
  - Transportation (e.g., Clarus, Pontis)
  - Embedded Systems (e.g., SCE API, Watcom)
  - Web/E-commerce (e.g., Gamma J, E-procurement)
  - Infrastructure (e.g., PNNL, NLM)

Reads from:
    scripts/experiment4/conflict_detection_results_sample.json
    scripts/experiment4/conflict_annotation_gold.csv
    scripts/experiment4/document_domains.json (domain mapping)

Writes to:
    scripts/experiment4/domain_breakdown_results.csv
    scripts/experiment4/domain_breakdown_report.txt

Usage:
    python scripts/experiment4/7_domain_breakdown.py
"""

import json
import pandas as pd
from pathlib import Path
from sklearn.metrics import precision_score, recall_score, f1_score
from collections import defaultdict

# Paths
SCRIPT_DIR = Path(__file__).parent
RESULTS_FILE = SCRIPT_DIR / "conflict_detection_results_sample.json"
GOLD_FILE = SCRIPT_DIR / "conflict_annotation_gold.csv"
DOMAIN_FILE = SCRIPT_DIR / "document_domains.json"
OUT_CSV = SCRIPT_DIR / "domain_breakdown_results.csv"
OUT_REPORT = SCRIPT_DIR / "domain_breakdown_report.txt"

# Default domain mapping based on document names
# Update this based on your actual corpus
DEFAULT_DOMAINS = {
    # Transportation
    "2005 - clarus low": "Transportation",
    "2005 - pontis": "Transportation",
    "2007 - puget sound": "Transportation",
    
    # Embedded Systems
    "2002 - sce api": "Embedded Systems",
    "2004 - watcom gui": "Embedded Systems",
    "2004 - watcom": "Embedded Systems",
    "2006 - eirene sys 15": "Embedded Systems",
    
    # Web/E-commerce
    "0000 - gamma j": "Web/E-commerce",
    "2001 - beyond": "Web/E-commerce",
    "2004 - e-procurement": "Web/E-commerce",
    "2004 - jse": "Web/E-commerce",
    
    # Infrastructure
    "2003 - pnnl": "Infrastructure",
    "2007 - nlm": "Infrastructure",
    "2005 - microcare": "Infrastructure",
    
    # Inventory/Management
    "0000 - inventory": "Inventory/Management",
    "2001 - elsfork": "Inventory/Management",
}


def load_domain_mapping():
    """Load or create domain mapping"""
    if DOMAIN_FILE.exists():
        with open(DOMAIN_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    else:
        # Create default mapping file
        with open(DOMAIN_FILE, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_DOMAINS, f, indent=2)
        print(f"Created default domain mapping: {DOMAIN_FILE}")
        print("Update this file to match your corpus domains.")
        return DEFAULT_DOMAINS


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


def assign_domains(results, gold_df, domain_mapping):
    """Assign domain to each result and gold entry"""
    for result in results:
        doc_id = result['doc_id']
        result['domain'] = domain_mapping.get(doc_id, "Unknown")
    
    gold_df['domain'] = gold_df['doc_id'].map(lambda x: domain_mapping.get(x, "Unknown"))
    
    return results, gold_df


def evaluate_domain(results_subset, gold_subset):
    """Evaluate performance for a specific domain"""
    # Get predictions
    predicted_conflicts = set()
    for result in results_subset:
        if result.get("phase2_conflict", False):
            key = f"{result['doc_id']}_{min(result['req_i_idx'], result['req_j_idx'])}_{max(result['req_i_idx'], result['req_j_idx'])}"
            predicted_conflicts.add(key)
    
    # Align with gold
    gold_subset_copy = gold_subset.copy()
    gold_subset_copy["predicted"] = gold_subset_copy["pair_key"].isin(predicted_conflicts)
    
    y_true = gold_subset_copy["is_conflict"].astype(int)
    y_pred = gold_subset_copy["predicted"].astype(int)
    
    # Compute metrics
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "total_pairs": len(gold_subset),
        "true_conflicts": y_true.sum(),
        "predicted_conflicts": y_pred.sum(),
    }


def main():
    print("Loading data...")
    results, gold_df = load_data()
    
    print("Loading domain mapping...")
    domain_mapping = load_domain_mapping()
    
    print("Assigning domains...")
    results, gold_df = assign_domains(results, gold_df, domain_mapping)
    
    # Get unique domains
    domains = sorted(set(domain_mapping.values()))
    print(f"\nDomains found: {', '.join(domains)}")
    
    # Evaluate per domain
    print("\nEvaluating per domain...")
    domain_results = []
    
    for domain in domains:
        results_subset = [r for r in results if r.get('domain') == domain]
        gold_subset = gold_df[gold_df['domain'] == domain]
        
        if len(gold_subset) == 0:
            continue
        
        metrics = evaluate_domain(results_subset, gold_subset)
        metrics['domain'] = domain
        domain_results.append(metrics)
        
        print(f"  {domain}: F1={metrics['f1']:.3f}, "
              f"Pairs={metrics['total_pairs']}, "
              f"Conflicts={metrics['true_conflicts']}")
    
    # Overall performance
    overall_metrics = evaluate_domain(results, gold_df)
    overall_metrics['domain'] = 'Overall'
    domain_results.append(overall_metrics)
    
    # Convert to DataFrame
    df = pd.DataFrame(domain_results)
    df = df[['domain', 'precision', 'recall', 'f1', 'total_pairs', 'true_conflicts', 'predicted_conflicts']]
    
    # Save CSV
    df.to_csv(OUT_CSV, index=False)
    print(f"\n✓ Results saved to: {OUT_CSV}")
    
    # Generate report
    report = f"""{'='*70}
PER-DOMAIN CONFLICT DETECTION ANALYSIS
{'='*70}

MOTIVATION
----------
Reviewer concern: "External validity across different requirement domains"

This analysis breaks down conflict detection performance by document domain
to assess generalization across transportation, embedded systems, web, and
infrastructure requirements.

METHODOLOGY
-----------
Total documents: {len(set(gold_df['doc_id']))}
Total pairs: {len(gold_df)}
True conflicts: {gold_df['is_conflict'].sum()}

Domains:
"""
    
    for domain in domains:
        count = len(gold_df[gold_df['domain'] == domain])
        conflicts = gold_df[gold_df['domain'] == domain]['is_conflict'].sum()
        report += f"  {domain}: {count} pairs, {conflicts} conflicts\n"
    
    report += f"""
RESULTS BY DOMAIN
-----------------

Domain                  Precision  Recall     F1      Pairs  Conflicts
"""
    
    for _, row in df.iterrows():
        report += f"{row['domain']:23s} {row['precision']:.3f}      {row['recall']:.3f}    {row['f1']:.3f}   {row['total_pairs']:4d}   {row['true_conflicts']:4d}\n"
    
    # Analysis
    report += f"""
ANALYSIS
--------
"""
    
    # Exclude 'Overall' for domain-specific analysis
    domain_df = df[df['domain'] != 'Overall']
    
    if len(domain_df) > 0:
        best_domain = domain_df.loc[domain_df['f1'].idxmax()]
        worst_domain = domain_df.loc[domain_df['f1'].idxmin()]
        
        report += f"Best performing domain:  {best_domain['domain']} (F1={best_domain['f1']:.3f})\n"
        report += f"Worst performing domain: {worst_domain['domain']} (F1={worst_domain['f1']:.3f})\n"
        report += f"Performance variance:    {domain_df['f1'].std():.3f} (std dev)\n"
        
        # Check if performance is consistent
        if domain_df['f1'].std() < 0.10:
            report += f"\n✓ Performance is consistent across domains (low variance)\n"
            report += f"  This suggests good generalization to different requirement types.\n"
        else:
            report += f"\n⚠ Performance varies significantly across domains\n"
            report += f"  Consider domain-specific tuning or additional training data.\n"
        
        # Domain-specific insights
        report += f"\nDomain-Specific Insights:\n"
        for _, row in domain_df.iterrows():
            if row['f1'] > overall_metrics['f1'] + 0.05:
                report += f"  ✓ {row['domain']}: Above-average performance\n"
            elif row['f1'] < overall_metrics['f1'] - 0.05:
                report += f"  ⚠ {row['domain']}: Below-average performance\n"
    
    report += f"""
{'='*70}
RECOMMENDATION FOR PAPER
{'='*70}
Include domain breakdown table showing:
- Performance across transportation, embedded, web, infrastructure domains
- Demonstrates external validity (or identifies domain-specific challenges)
- Shows system generalizes beyond single domain

If variance is low:
  "Performance is consistent across domains (σ={domain_df['f1'].std():.3f}),
   demonstrating generalization to diverse requirement types."

If variance is high:
  "Performance varies by domain, with {best_domain['domain']} achieving
   F1={best_domain['f1']:.3f} and {worst_domain['domain']} achieving
   F1={worst_domain['f1']:.3f}. This suggests opportunities for
   domain-specific optimization."
{'='*70}
"""
    
    # Print and save
    print("\n" + report)
    
    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"✓ Report saved to: {OUT_REPORT}")


if __name__ == "__main__":
    main()
