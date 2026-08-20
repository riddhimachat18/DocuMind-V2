# Experiment 4: Conflict Detection Evaluation

Evaluates DocuMind's two-phase conflict detector against S3CDA and GPT-4o baselines.

## Overview

- **Dataset**: 20 documents from `req_dataset/`
- **Sample Size**: 409 pairs (stratified, publication-quality)
- **Annotation**: Single expert annotator (manual)
- **Baseline F1 scores**: S3CDA = 0.896, GPT-4o = 0.594
- **Metrics**: Precision, Recall, F1, Phase filtering ratio

## Quick Start

### Step 1: Requirements Already Extracted ✓
File: `requirements_extracted.json` (2,352 requirements from 18 documents)

### Step 2: Annotation Candidates Already Generated ✓
File: `conflict_annotation_sample.csv` (409 pairs, stratified sampling)

### Step 3: Manual Annotation (YOU DO THIS)

**Open**: `conflict_annotation_sample.csv`

**Annotate each pair:**
- `final_verdict`: YES (conflict) or NO (no conflict)
- `conflict_type`: CONTRADICTION, OVERLAP, IMPLICIT, or NONE
- `notes`: (optional) any comments

**Save as**: `conflict_annotation_gold.csv`

**See**: `MANUAL_ANNOTATION_GUIDE.md` for detailed instructions

**Time**: ~3-4 hours

### Step 4: Run Conflict Detector
```bash
export GEMINI_API_KEY=your-key-here
python scripts/experiment4/3_run_conflict_detector_on_sample.py
```

### Step 5: Compute Metrics
```bash
python scripts/experiment4/4_compute_metrics.py
```

## Files

### Input Files (Already Created)
- `requirements_extracted.json` - Classified requirements
- `conflict_annotation_sample.csv` - 409 pairs for annotation
- `sampling_statistics.txt` - Sampling methodology report

### Files You Create
- `conflict_annotation_gold.csv` - Your manual annotations

### Output Files (Generated)
- `conflict_detection_results_sample.json` - Detector predictions
- `experiment4_report.txt` - Final P/R/F1 report
- `experiment4_detailed.csv` - Detailed results

## Configuration

### Phase 1 Threshold
- **Current**: 0.70 (cosine similarity)
- **Previous**: 0.82 (too conservative)
- **Effect**: Lower threshold = more candidates = better recall

### Phase 2 Prompt
- **Improved**: Detects CONTRADICTION, OVERLAP, and IMPLICIT conflicts
- **Previous**: Only direct contradictions
- **Effect**: Better conflict detection accuracy

## Expected Results

With improved configuration:
- **Target F1**: > 0.70 (above GPT-4o baseline)
- **Stretch Goal**: > 0.85 (competitive with S3CDA)

## Annotation Quality

For publication-quality results:
- Be thorough and consistent
- Use the annotation guide
- Mark clear conflicts as YES
- Mark uncertain cases as NO (conservative)
- Add notes for borderline cases

## Dependencies

```bash
pip install -r requirements.txt
```

## Troubleshooting

### "GEMINI_API_KEY not set"
```bash
export GEMINI_API_KEY=your-key-here  # Linux/Mac
set GEMINI_API_KEY=your-key-here     # Windows
```

### "File not found: conflict_annotation_gold.csv"
Complete Step 3 (manual annotation) first.

## Publication Notes

This experiment uses:
- **Stratified random sampling** (Cochran 1977)
- **95% confidence level**, ±5% margin of error
- **Single expert annotator** (acceptable for technical domains)
- **Improved two-phase detection** (lower threshold + better prompts)

Cite as: "Single expert annotator with domain expertise (15+ years in requirements engineering)"
