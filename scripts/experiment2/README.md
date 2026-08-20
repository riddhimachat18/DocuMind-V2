# Experiment 2 — BRD Generation Quality

Evaluates DocuMind's BRD output on 15 real Enron email threads across two tracks:

- **Track A** — Does DocuMind's algorithmic quality score correlate with human judgment? (Pearson r)
- **Track B** — Does the BRD capture the requirements that were in the source emails? (Recall via Gemini embeddings)

---

## Prerequisites

```bash
pip install firebase-admin google-generativeai pandas scipy numpy
export GEMINI_API_KEY="your-key"
export GOOGLE_APPLICATION_CREDENTIALS="documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"
```

Run all commands from the **project root** (`/Users/riddhimachaturvedi/DocuMind`).

---

## Steps

### Step 1 — Select candidate threads (~10 minutes)

Walks the full maildir, scores emails by keyword density, groups into threads.

```bash
python3 scripts/experiment2/1_select_threads.py
```

Output: `data/experiment2/candidate_threads.json` (top 20 threads)

---

### Step 2 — Review and pick 15 (~15 minutes manual)

```bash
python3 scripts/experiment2/2_review_candidates.py
```

Prints a readable preview of all 20 candidates. Read the subject and body preview for each. Edit the `KEEP = [...]` list in `2_review_candidates.py` with the 0-based indices of your 15 picks, then re-run. Picks should be genuinely project/system-related — trading systems, IT infrastructure, pipeline software, reporting tools. Reject HR, scheduling, and legal threads.

Output: `data/experiment2/selected_threads.json`

---

### Step 3 — Segment and auto-annotate for gold standard

```bash
python3 scripts/experiment2/3_segment_for_annotation.py
python3 scripts/experiment2/3b_auto_annotate.py
```

`3_segment_for_annotation.py` splits each thread into sentences and writes `annotation_sheet.csv`.

`3b_auto_annotate.py` pre-labels every sentence using the canonical few-shot Gemini classifier (the same one that achieved 0.824 macro-F1 in Experiment 4). Labels are mapped as:

| Classifier output | Gold label |
|-------------------|------------|
| REQUIREMENT | REQ |
| DECISION | DEC |
| CONSTRAINT | CON |
| NOISE | NONE |

Output: `data/experiment2/annotation_sheet_filled.csv`

Open this file in Excel or Google Sheets. Review and correct any labels that look wrong — focus on the REQ/DEC/CON rows, which are the ones that matter for recall. NONE rows rarely need correction. Save the file when done (keep the filename `annotation_sheet_filled.csv`).

The script is fully resumable — if interrupted, re-run and it picks up from the last checkpoint.

**This can run in parallel with Step 4.**

---

### Step 4 — Ingest and generate BRDs (~45–60 minutes)

```bash
python3 scripts/experiment2/4_ingest_and_generate.py
```

For each of the 15 threads: classifies chunks with the canonical few-shot prompt, stores non-NOISE snippets in Firestore, generates a BRD with citation tracking. Fully resumable if interrupted.

Output: `data/experiment2/exp2_brd_ids.json`

---

### Step 5 — Export BRDs from Firestore (~2 minutes)

```bash
python3 scripts/experiment2/5_export_brds.py
```

Output: `data/experiment2/brds_export.json`

---

### Step 6 — Human rating (~30 minutes manual)

```bash
python3 scripts/experiment2/6_human_rating.py
```

Output: `data/experiment2/rating_sheet.csv`

Open in Excel or Google Sheets. For each BRD, read the `brd_preview` column and assign a holistic `human_score` (1–5):

| Score | Meaning |
|-------|---------|
| 5 | Excellent: specific, grounded, well-structured |
| 4 | Good: mostly complete, minor gaps |
| 3 | Adequate: covers basics, some vagueness |
| 2 | Poor: significant gaps or hallucinated content |
| 1 | Unusable: does not reflect the source thread |

Save as `data/experiment2/rating_sheet_filled.csv` when done.

---

### Step 7 — Compute recall (~20 minutes, ~1500 Gemini embedding calls)

Requires `annotation_sheet_filled.csv` from Step 3.

```bash
python3 scripts/experiment2/7_compute_recall.py
```

Output: `data/experiment2/recall_results.json` and `recall_results.csv`

---

### Step 8 — Analyse

```bash
python3 scripts/experiment2/8_analyze.py
```

Output: `data/experiment2/exp2_report.txt`

Requires `rating_sheet_filled.csv` (Step 6) and `recall_results.csv` (Step 7).

---

## Output files

| File | Description |
|------|-------------|
| `candidate_threads.json` | Top 20 scored threads |
| `selected_threads.json` | Your 15 chosen threads |
| `annotation_sheet.csv` | Sentences for gold-standard labelling |
| `annotation_sheet_filled.csv` | Your completed annotation |
| `exp2_brd_ids.json` | Project + BRD ID manifest |
| `brds_export.json` | Full BRD text + quality scores |
| `rating_sheet.csv` | Human rating sheet (blank) |
| `rating_sheet_filled.csv` | Your completed ratings |
| `recall_results.csv` | Per-thread recall scores |
| `exp2_report.txt` | Final results report |
