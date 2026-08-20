# Experiment 4 - Quick Start Guide

## Prerequisites

1. **Python 3.8+** installed
2. **GEMINI_API_KEY** environment variable set
3. **20 documents** in `req_dataset/` folder (already present)

## Installation

```bash
# Install Python dependencies
pip install -r scripts/experiment4/requirements.txt
```

## Quick Run (Automated)

### On Windows:
```cmd
set GEMINI_API_KEY=your-key-here
scripts\experiment4\run_experiment.bat
```

### On Linux/Mac:
```bash
export GEMINI_API_KEY=your-key-here
chmod +x scripts/experiment4/run_experiment.sh
./scripts/experiment4/run_experiment.sh
```

## Manual Step-by-Step

### Step 1: Extract Requirements
```bash
python scripts/experiment4/1_extract_requirements.py
```
**Output**: `requirements_extracted.json` with classified requirements

### Step 2: Generate Annotation Sheet
```bash
python scripts/experiment4/2_generate_annotation_candidates.py
```
**Output**: `conflict_annotation_sheet.csv` with candidate pairs

### Step 3: Manual Annotation (REQUIRED)

1. Open `conflict_annotation_sheet.csv` in Excel/Google Sheets
2. Two annotators independently label each pair:
   - Column `annotator1_conflict`: YES or NO
   - Column `annotator2_conflict`: YES or NO
   - Column `conflict_type`: CONTRADICTION, OVERLAP, or NONE

3. Compute inter-annotator agreement:
```bash
python scripts/experiment4/compute_kappa.py
```

4. Resolve disagreements through discussion

5. Create final gold standard:
   - Add column `final_verdict` with resolved labels (YES/NO)
   - Save as `conflict_annotation_gold.csv`

### Step 4: Run Conflict Detector
```bash
python scripts/experiment4/3_run_conflict_detector.py
```
**Output**: `conflict_detection_results.json` with predictions

### Step 5: Compute Metrics
```bash
python scripts/experiment4/4_compute_metrics.py
```
**Output**: 
- `experiment4_report.txt` - Summary report
- `experiment4_detailed.csv` - Detailed results

## Expected Timeline

- **Step 1**: ~10-15 minutes (depends on API speed)
- **Step 2**: ~2-3 minutes
- **Step 3**: ~2-4 hours (manual annotation by 2 people)
- **Step 4**: ~5-10 minutes (depends on API speed)
- **Step 5**: <1 minute

**Total**: ~3-5 hours (mostly manual annotation)

## Output Files

```
scripts/experiment4/
├── requirements_extracted.json          # Classified requirements
├── conflict_annotation_sheet.csv        # Pairs for annotation
├── conflict_annotation_gold.csv         # Gold standard (manual)
├── conflict_detection_results.json      # Detector predictions
├── experiment4_report.txt               # Final metrics report
└── experiment4_detailed.csv             # Detailed results
```

## Troubleshooting

### "GEMINI_API_KEY not set"
```bash
# Windows
set GEMINI_API_KEY=your-key-here

# Linux/Mac
export GEMINI_API_KEY=your-key-here
```

### "No module named 'google.generativeai'"
```bash
pip install -r scripts/experiment4/requirements.txt
```

### "No text extracted from PDF"
Some PDFs may be scanned images. Try:
```bash
pip install pytesseract pillow
# Then install Tesseract OCR from https://github.com/tesseract-ocr/tesseract
```

### API Rate Limits
If you hit Gemini API rate limits, add delays in the scripts:
```python
import time
time.sleep(1)  # Add after each API call
```

## Expected Results

Based on baseline comparisons:
- **S3CDA**: F1 = 0.896
- **GPT-4o**: F1 = 0.594
- **DocuMind**: Target F1 > 0.70

Phase filtering efficiency:
- Phase 1 should filter ~95-98% of pairs
- Phase 2 should filter ~80-90% of Phase 1 candidates
