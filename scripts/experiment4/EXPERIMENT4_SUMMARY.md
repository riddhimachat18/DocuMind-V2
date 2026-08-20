# Experiment 4: Conflict Detection Evaluation - Summary

## Objective
Evaluate DocuMind's two-phase conflict detector against S3CDA (F1=0.896) and GPT-4o (F1=0.594) baselines using 20 documents from `req_dataset/`.

## Methodology

### Dataset
- **Source**: 20 documents from `req_dataset/` (PDF, DOC, DOCX, RTF)
- **Classification**: Uses exact few-shot prompt from `classifyText.ts`
- **Focus**: Only REQUIREMENT-class sentences (excludes DECISION, CONSTRAINT, NOISE)

### Two-Phase Conflict Detection

**Phase 1: Semantic Similarity Filtering**
- Embedding model: `all-MiniLM-L6-v2`
- Threshold: 0.82 (cosine similarity)
- Purpose: Fast pre-filtering to reduce candidate pairs

**Phase 2: LLM Verification**
- Model: Gemini 2.5 Flash
- Purpose: Verify if semantically similar pairs actually conflict
- Output: Binary decision + explanation

### Evaluation Process

1. **Extract Requirements** (Step 1)
   - Parse 20 documents
   - Classify sentences using Gemini with few-shot prompt
   - Extract only REQUIREMENT sentences

2. **Generate Annotation Candidates** (Step 2)
   - Compute cosine similarity for all requirement pairs
   - Filter pairs with similarity ≥ 0.5 for manual annotation
   - Reduces annotation workload by ~90%

3. **Manual Annotation** (Step 3)
   - Two independent annotators label each candidate pair
   - Labels: YES (conflict) or NO (no conflict)
   - Conflict types: CONTRADICTION, OVERLAP, NONE
   - Compute Cohen's Kappa for inter-annotator agreement
   - Resolve disagreements to create gold standard

4. **Run Conflict Detector** (Step 4)
   - Apply two-phase detection to all requirement pairs
   - Log Phase 1 candidates and Phase 2 confirmations
   - Track filtering ratios

5. **Compute Metrics** (Step 5)
   - Compare predictions against gold standard
   - Compute Precision, Recall, F1
   - Compare with S3CDA and GPT-4o baselines
   - Analyze phase filtering efficiency

## Key Metrics

### Performance Metrics
- **Precision**: TP / (TP + FP)
- **Recall**: TP / (TP + FN)
- **F1 Score**: 2 × (Precision × Recall) / (Precision + Recall)

### Efficiency Metrics
- **Phase 1 Filtering Rate**: % of pairs filtered by semantic similarity
- **Phase 2 Filtering Rate**: % of Phase 1 candidates rejected by LLM
- **Overall Efficiency**: % of total pairs flagged as conflicts

### Baseline Comparison
- **S3CDA**: F1 = 0.896 (state-of-the-art)
- **GPT-4o**: F1 = 0.594 (LLM baseline)
- **DocuMind**: Target F1 > 0.70

## Files Created

### Scripts
- `1_extract_requirements.py` - Extract and classify requirements
- `2_generate_annotation_candidates.py` - Generate annotation sheet
- `3_run_conflict_detector.py` - Run two-phase detector
- `4_compute_metrics.py` - Compute P/R/F1 metrics
- `compute_kappa.py` - Compute inter-annotator agreement
- `run_experiment.sh` / `run_experiment.bat` - Master scripts

### Documentation
- `README.md` - Detailed documentation
- `QUICKSTART.md` - Quick start guide
- `EXPERIMENT4_SUMMARY.md` - This file
- `requirements.txt` - Python dependencies

### Output Files (Generated)
- `requirements_extracted.json` - Classified requirements
- `conflict_annotation_sheet.csv` - Pairs for annotation
- `conflict_annotation_gold.csv` - Gold standard (manual)
- `conflict_detection_results.json` - Detector predictions
- `experiment4_report.txt` - Final metrics report
- `experiment4_detailed.csv` - Detailed results

## Usage

### Quick Start
```bash
# Set API key
export GEMINI_API_KEY=your-key-here

# Run full experiment (requires manual annotation pause)
./scripts/experiment4/run_experiment.sh
```

### Step-by-Step
```bash
# Step 1: Extract requirements
python scripts/experiment4/1_extract_requirements.py

# Step 2: Generate annotation candidates
python scripts/experiment4/2_generate_annotation_candidates.py

# Step 3: Manual annotation (see QUICKSTART.md)
# ... annotate conflict_annotation_sheet.csv ...
python scripts/experiment4/compute_kappa.py
# ... create conflict_annotation_gold.csv ...

# Step 4: Run detector
python scripts/experiment4/3_run_conflict_detector.py

# Step 5: Compute metrics
python scripts/experiment4/4_compute_metrics.py
```

## Expected Timeline
- **Automated steps**: ~20-30 minutes
- **Manual annotation**: ~2-4 hours (2 annotators)
- **Total**: ~3-5 hours

## Success Criteria
1. **F1 Score**: > 0.70 (above GPT-4o baseline)
2. **Phase 1 Efficiency**: Filter > 95% of pairs
3. **Phase 2 Efficiency**: Filter > 80% of Phase 1 candidates
4. **Inter-Annotator Agreement**: Cohen's Kappa > 0.60

## Notes
- Uses exact few-shot prompt from `classifyText.ts` (DO NOT MODIFY)
- Classification prompt achieved 0.824 macro-F1 in previous experiments
- Two-phase approach balances accuracy and efficiency
- Manual annotation is critical for gold standard quality
