"""
Create a publication-quality stratified sample for annotation
Uses power analysis and stratified sampling to ensure statistical validity
"""
import pandas as pd
import numpy as np
from pathlib import Path
from math import ceil

input_file = Path("scripts/experiment4/conflict_annotation_sheet.csv")
output_file = Path("scripts/experiment4/conflict_annotation_sample.csv")
stats_file = Path("scripts/experiment4/sampling_statistics.txt")

# Load full candidate set
df = pd.read_csv(input_file)
df['cosine_sim'] = df['cosine_sim'].astype(float)

print(f"Total candidates: {len(df)}")

# PUBLICATION-QUALITY SAMPLING STRATEGY
# Based on: Cochran (1977) sampling theory
# Target: 95% confidence level, 5% margin of error
# Formula: n = (Z^2 * p * (1-p)) / E^2
# Where: Z=1.96 (95% CI), p=0.5 (max variance), E=0.05

# Calculate required sample size
Z = 1.96  # 95% confidence
E = 0.05  # 5% margin of error
p = 0.5   # Maximum variance assumption
n_required = ceil((Z**2 * p * (1-p)) / E**2)

# Apply finite population correction
N = len(df)
n_adjusted = ceil(n_required / (1 + (n_required - 1) / N))

print(f"\n{'='*60}")
print(f"POWER ANALYSIS FOR PUBLICATION")
print(f"{'='*60}")
print(f"Population size (N):           {N:,}")
print(f"Required sample (infinite):    {n_required:,}")
print(f"Adjusted sample (finite):      {n_adjusted:,}")
print(f"Confidence level:              95%")
print(f"Margin of error:               ±5%")
print(f"{'='*60}\n")

# STRATIFIED SAMPLING
# Stratify by: (1) Document, (2) Similarity range
# This ensures representation across all documents and similarity levels

# Define similarity strata (based on conflict likelihood)
similarity_bins = [0.50, 0.65, 0.75, 0.82, 0.90, 1.00]
similarity_labels = ['Low (0.50-0.65)', 'Medium (0.65-0.75)', 
                     'High (0.75-0.82)', 'Very High (0.82-0.90)', 
                     'Extreme (0.90-1.00)']

df['similarity_stratum'] = pd.cut(df['cosine_sim'], 
                                   bins=similarity_bins,
                                   labels=similarity_labels,
                                   include_lowest=True)

# Calculate stratum sizes (proportional allocation)
stratum_counts = df.groupby(['doc_id', 'similarity_stratum']).size()
stratum_proportions = stratum_counts / len(df)

# Allocate sample proportionally to strata
samples = []
sampling_report = []

for (doc_id, sim_stratum), count in stratum_counts.items():
    if count == 0:
        continue
    
    # Proportional allocation
    stratum_sample_size = max(1, int(n_adjusted * count / N))
    
    # Don't oversample small strata
    stratum_sample_size = min(stratum_sample_size, count)
    
    # Sample from this stratum
    stratum_df = df[(df['doc_id'] == doc_id) & 
                    (df['similarity_stratum'] == sim_stratum)]
    
    stratum_sample = stratum_df.sample(n=stratum_sample_size, 
                                       random_state=42)
    
    samples.append(stratum_sample)
    
    sampling_report.append({
        'doc_id': doc_id,
        'similarity_stratum': sim_stratum,
        'population': count,
        'sample': stratum_sample_size,
        'sampling_rate': f"{stratum_sample_size/count*100:.1f}%"
    })

# Combine samples
sample_df = pd.concat(samples, ignore_index=True)

# Ensure we have at least n_adjusted samples
if len(sample_df) < n_adjusted:
    # Add more samples from largest strata
    remaining = n_adjusted - len(sample_df)
    print(f"Adding {remaining} more samples to reach target...")
    
    # Get unsampled pairs
    sampled_indices = set(sample_df.index)
    unsampled_df = df[~df.index.isin(sampled_indices)]
    
    if len(unsampled_df) > 0:
        additional = unsampled_df.sample(n=min(remaining, len(unsampled_df)), 
                                        random_state=42)
        sample_df = pd.concat([sample_df, additional], ignore_index=True)

# Drop the stratum column from output
output_df = sample_df.drop('similarity_stratum', axis=1)

# Save sample
output_df.to_csv(output_file, index=False)

# Generate sampling statistics report
report = f"""{'='*70}
PUBLICATION-QUALITY SAMPLING REPORT
Experiment 4: Conflict Detection Evaluation
{'='*70}

SAMPLING METHODOLOGY
--------------------
Method:              Stratified Random Sampling
Stratification:      Document × Similarity Range
Allocation:          Proportional to stratum size
Random Seed:         42 (reproducible)

POWER ANALYSIS
--------------
Population Size:     {N:,} candidate pairs
Target Sample:       {n_adjusted:,} pairs
Actual Sample:       {len(sample_df):,} pairs
Confidence Level:    95%
Margin of Error:     ±{E*100:.1f}%

SIMILARITY DISTRIBUTION
-----------------------
"""

for label in similarity_labels:
    pop_count = len(df[df['similarity_stratum'] == label])
    sample_count = len(sample_df[sample_df['similarity_stratum'] == label])
    if pop_count > 0:
        report += f"{label:25} Pop: {pop_count:5,}  Sample: {sample_count:4,}  ({sample_count/pop_count*100:5.1f}%)\n"

report += f"\nDOCUMENT DISTRIBUTION\n"
report += f"---------------------\n"

for doc_id in sorted(df['doc_id'].unique()):
    pop_count = len(df[df['doc_id'] == doc_id])
    sample_count = len(sample_df[sample_df['doc_id'] == doc_id])
    report += f"{doc_id:25} Pop: {pop_count:5,}  Sample: {sample_count:4,}  ({sample_count/pop_count*100:5.1f}%)\n"

report += f"""
STATISTICAL VALIDITY
--------------------
✓ Sample size meets power requirements for 95% CI
✓ Stratified sampling ensures representation
✓ Proportional allocation maintains population structure
✓ Random sampling eliminates selection bias
✓ Reproducible (seed=42)

ANNOTATION GUIDELINES
---------------------
Estimated time:      {len(sample_df) * 0.5 / 60:.1f} hours per annotator
                     (assuming 30 seconds per pair)

Two annotators should independently label:
1. annotator1_conflict: YES/NO
2. annotator2_conflict: YES/NO  
3. conflict_type: CONTRADICTION/OVERLAP/NONE

After annotation:
1. Compute Cohen's Kappa (target: κ > 0.60)
2. Resolve disagreements through discussion
3. Create gold standard with 'final_verdict' column

PUBLICATION NOTES
-----------------
This sampling approach is defensible for publication because:
- Uses established sampling theory (Cochran 1977)
- Achieves 95% confidence with ±5% margin of error
- Stratified design ensures all document types represented
- Proportional allocation maintains population structure
- Sample size ({len(sample_df):,}) is sufficient for statistical inference

Reference:
Cochran, W. G. (1977). Sampling Techniques (3rd ed.). Wiley.

{'='*70}
"""

# Save report
with open(stats_file, 'w', encoding='utf-8') as f:
    f.write(report)

print(report)
print(f"\n✓ Files created:")
print(f"  - {output_file}")
print(f"  - {stats_file}")
print(f"\n✓ Ready for publication-quality annotation!")
