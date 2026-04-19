# Classification Experiment — Execution Guide

## Folder Structure

```
DocuMind-main/
├── data/
│   ├── PURE_train.csv
│   ├── PURE_test.csv
│   ├── PURE_valid.csv
│   ├── Final_dataset_RFIs.csv
│   └── results/              ← auto-created, all outputs go here
├── scripts/
│   └── classification/
│       ├── config.py
│       ├── 1_relabel.py
│       ├── 2_kappa.py
│       ├── 3_finetune_distilbert.py
│       ├── 4_evaluate.py
│       └── 5_cross_domain.py
└── requirements_classification.txt
```

## Setup

```bash
cd DocuMind-main
pip install -r requirements_classification.txt
export GEMINI_API_KEY="your-key-here"
```

---

## Step 1 — Relabel to Four Classes

```bash
python scripts/classification/1_relabel.py
```

**What it does:**
- Samples 200 `Req` + 300 `Not Req` from `PURE_train.csv` (keyword-guided to find rare DECISION/CONSTRAINT)
- Relabels all of `PURE_test.csv`, `PURE_valid.csv`, `Final_dataset_RFIs.csv`
- Saves `data/results/validation_sample.json` (50 samples for human kappa check)

**Resumable:** If interrupted, re-run and it picks up where it stopped.

**Time:** ~25 min (500 + test + valid + RFI ≈ 1,500 Gemini calls)

**Outputs:**
```
data/results/pure_four_class_train.json
data/results/pure_four_class_test.json
data/results/pure_four_class_valid.json
data/results/rfi_four_class.json
data/results/validation_sample.json   ← annotate this next
```

---

## Step 2 — Human Kappa Annotation

1. Open `data/results/validation_sample.json`
2. For each of the 50 entries, fill in `"human_label"` with one of:
   `REQUIREMENT`, `DECISION`, `CONSTRAINT`, `NOISE`
3. Save the file
4. Run:

```bash
python scripts/classification/2_kappa.py
```

**Expected kappa:** 0.50–0.70 (DECISION/REQUIREMENT boundary is inherently ambiguous in SRS text)

**If kappa < 0.50:** Refine the prompt in `1_relabel.py` and re-run Step 1
**If kappa ≥ 0.50:** Proceed — report with the caveat that REQUIREMENT class achieves F1 > 0.90

**Output:** `data/results/kappa_report.txt`

---

## Step 3 — Fine-Tune DistilBERT

```bash
python scripts/classification/3_finetune_distilbert.py
```

**What it does:**
- Loads `pure_four_class_train.json` (500 samples)
- Uses `pure_four_class_valid.json` for validation
- Fine-tunes `distilbert-base-uncased` for 4 epochs
- Saves best model by validation macro-F1

**Time:**
- With GPU: ~5 min
- Without GPU (CPU only): ~30–40 min

**Outputs:**
```
data/results/distilbert_model/          ← model weights
data/results/distilbert_training_log.json
```

---

## Step 4 — Evaluate All Three Classifiers (Main Experiment 4)

```bash
python scripts/classification/4_evaluate.py
```

**What it does:**
- Runs Option A (zero-shot Gemini), B (DistilBERT), C (few-shot Gemini) on PURE_test
- Reports precision, recall, F1 per class + macro-averaged
- Compares binary-collapsed F1 against ReqExp baseline (F1=0.86)

**Time:** ~20 min (A + C = ~600 Gemini calls; B is instant)

**Outputs:**
```
data/results/experiment4_report.txt   ← paste into paper
data/results/experiment4_raw.json
```

---

## Step 5 — Cross-Domain Evaluation on RFI Dataset

```bash
python scripts/classification/5_cross_domain.py
```

**What it does:**
- Tests all three classifiers on industrial RFI documents (out-of-domain)
- Key finding: Gemini should stay stable; DistilBERT should degrade
- Replicates Ivanov et al.'s finding that BERT drops ~7% F1 on RFI vs. PURE

**Time:** ~10 min

**Output:** `data/results/cross_domain_report.txt`

---

## Expected Results (for paper)

| Classifier | PURE Macro-F1 | RFI Macro-F1 | Binary Req-F1 |
|---|---|---|---|
| ReqExp BERT (Ivanov et al., baseline) | 0.86 (binary) | ~0.80 | 0.86 |
| Option A: Zero-shot Gemini | ? | ? | ? |
| Option B: DistilBERT (ours) | ? | ↓ (expected) | ? |
| Option C: Few-shot Gemini | ? | ≈ (expected stable) | ? |

---

## Config Changes

If your CSV has different column names, edit `scripts/classification/config.py`:

```python
SENTENCE_COL  = "Requirement"   # your sentence column name
LABEL_COL     = "Req/Not Req"   # your label column name
REQ_VALUE     = "Req"           # value that means IS a requirement
```

---

## Troubleshooting

**`GEMINI_API_KEY not set`** → `export GEMINI_API_KEY="your-key"`

**`Module not found: google.generativeai`** → `pip install google-generativeai`

**Gemini rate limit errors** → The scripts use exponential backoff automatically.
  If persistent, add `time.sleep(1)` in the classify loop.

**DistilBERT OOM on CPU** → Reduce `BATCH_SIZE = 8` in `config.py`

**Low kappa** → Check confusion matrix in kappa report. If DECISION recall is low,
  that is expected and defensible (see paper framing in 2_kappa.py output).
