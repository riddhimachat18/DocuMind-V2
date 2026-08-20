# Experiment 4 - Inter-Annotator Agreement (IAA) Validation

This folder contains scripts for validating the Experiment 4 conflict detection gold standard through inter-annotator agreement analysis.

## Overview

To validate the reliability of our conflict annotations, we:
1. Extract a stratified sample of 90 requirement pairs from the 409-pair gold standard
2. Have a second annotator independently label these pairs
3. Compute Cohen's κ to measure agreement
4. Report κ in the paper as validation of the gold standard quality

## Files

### Scripts

- **`exp4_iaa_sample.py`** - Extracts stratified sample from gold standard
- **`exp4_compute_kappa.py`** - Computes Cohen's κ and generates report

### Data Files (Generated)

- **`exp4_iaa_sheet_full.csv`** - Full annotation sheet with both annotator labels (for κ computation)
- **`exp4_iaa_sheet.csv`** - Blind sheet for second annotator (annotator1 labels removed)
- **`exp4_kappa_report.txt`** - Final IAA report with κ, confusion matrix, and disagreements

## Workflow

### Step 1: Extract Sample

```bash
python scripts/iaa/exp4_iaa_sample.py
```

This reads `scripts/experiment4/conflict_annotation_gold.csv` and creates:
- A stratified sample of 90 pairs:
  - 30 CONTRADICTION
  - 40 OVERLAP
  - 10 IMPLICIT
  - 10 NO_CONFLICT
- Two CSV files: full sheet (with labels) and blind sheet (without labels)

### Step 2: Second Annotator Labels

1. Give `exp4_iaa_sheet.csv` to the second annotator
2. They fill in the `annotator2_label` column using the annotation guide below
3. They can use `annotator2_notes` for uncertainty or edge cases

### Step 3: Merge Annotations

Copy the `annotator2_label` and `annotator2_notes` columns from the completed `exp4_iaa_sheet.csv` into `exp4_iaa_sheet_full.csv`.

### Step 4: Compute Cohen's κ

```bash
python scripts/iaa/exp4_compute_kappa.py
```

This generates:
- Cohen's κ score
- Confusion matrix
- Agreement rate
- Disagreement breakdown
- Saves report to `exp4_kappa_report.txt`

## Annotation Guide

For each requirement pair, assign ONE of these labels:

### CONTRADICTION
Two requirements that cannot both be satisfied simultaneously.

**Example:**
- Req A: "System must support Windows only"
- Req B: "System must support Linux"

### OVERLAP
Two requirements describing the same behaviour, possibly redundant.

**Example:**
- Req A: "User can log in with email"
- Req B: "System allows email-based authentication"

### IMPLICIT
One requirement silently assumes something the other violates.

**Example:**
- Req A: "System stores all data in cloud database"
- Req B: "System must work completely offline"
(First assumes network connectivity, second forbids it)

### NO_CONFLICT
Independent requirements with no relationship or conflict.

**Example:**
- Req A: "UI must use blue color scheme"
- Req B: "System logs all errors to file"

## Interpreting Cohen's κ

| κ Range | Interpretation |
|---------|----------------|
| < 0.00 | No agreement |
| 0.00-0.20 | Slight agreement |
| 0.21-0.40 | Fair agreement |
| 0.41-0.60 | Moderate agreement |
| 0.61-0.80 | Substantial agreement |
| 0.81-1.00 | Almost perfect agreement |

For research validation, κ > 0.60 is generally considered acceptable, with κ > 0.80 indicating excellent reliability.

## For the Paper

Report the following in your methodology section:

> "To validate the reliability of our gold standard annotations, we conducted an inter-annotator agreement study. A second annotator independently labeled a stratified sample of 90 requirement pairs (30 CONTRADICTION, 40 OVERLAP, 10 IMPLICIT, 10 NO_CONFLICT) from our 409-pair gold standard. Cohen's κ was computed to measure agreement, yielding κ = [YOUR_VALUE], indicating [substantial/almost perfect] agreement and validating the quality of our gold standard."

## Notes

- Random seed is set to 42 for reproducibility
- Stratified sampling ensures balanced representation of all conflict types
- The blind sheet prevents bias by hiding the first annotator's labels
- Disagreements are logged for discussion and potential guideline refinement
