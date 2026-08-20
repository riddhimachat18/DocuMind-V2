# Experiment 3 — Traceability Coverage

Measures what percentage of BRD sentences have citations back to source
snippets, manually verifies 50 sampled citations for accuracy, and uses
uncited sentences as a hallucination proxy.

**Sources:** 10 Enron email threads + 10 AMI meeting transcripts  
**Output:** Coverage %, citation accuracy %, inter-annotator κ

---

## Prerequisites

### Python packages

```bash
pip install firebase-admin google-generativeai pandas scikit-learn nltk
```

### Environment variables

```bash
export GEMINI_API_KEY="your-gemini-api-key"
export GOOGLE_APPLICATION_CREDENTIALS="documind-6c687-firebase-adminsdk-fbsvc-20a940148c.json"
```

The service account JSON file must be in the **project root** (same level as
`package.json`). It is already there — do not move it.

### AMI corpus

The corpus must be at:
```
data/ami_public_manual_1.6.2/words/
```
This is already present on your machine. All scripts use paths relative to
the **project root**, so run every command from there.

---

## Step-by-step instructions

Run all commands from the **project root** (`/Users/riddhimachaturvedi/DocuMind`).

---

### Step 0 — Sanity check (2 minutes)

Verify all 10 AMI meeting files are readable before doing anything else.

```bash
python3 scripts/experiment3/0_sanity_check.py
```

Expected output: 10 meetings listed, each with word counts and a sample
sentence. If any meeting shows `MISSING`, stop and check the `words/` path.

---

### Step 1 — Parse AMI transcripts (~2 minutes)

Converts the word-level XML files into utterance-grouped transcripts.

```bash
python3 scripts/experiment3/1_parse_ami.py
```

Output: `data/experiment3/ami_transcripts.json`  
Each record has `meeting_id`, `transcript` (speaker-prefixed utterances),
and `utterance_count`.

---

### Step 2 — Prepare Enron threads (~10 seconds)

Selects the 10 longest, deduplicated Enron email threads from the existing
filtered dataset.

```bash
python3 scripts/experiment3/2_prepare_enron.py
```

Output: `data/experiment3/enron_threads.json`  
Prints the subject line and character count for each selected thread.

---

### Step 3 — Ingest and generate BRDs (~45–90 minutes)

This is the main pipeline step. For each of the 20 sources it:
1. Creates a Firestore project document
2. Classifies each text chunk with the canonical few-shot Gemini prompt
3. Stores non-NOISE snippets in Firestore
4. Generates a BRD with citation tracking
5. Records the `brdVersionId` in the manifest file

```bash
python3 scripts/experiment3/3_ingest_and_generate.py
```

Output: `data/experiment3/exp3_brd_ids.json`

**This step makes ~2000 Gemini API calls. It will take 45–90 minutes
depending on rate limits.** The script processes sources sequentially with
a 1-second pause between each to avoid quota errors. If it gets interrupted,
re-running it will skip projects that already have snippets (Firestore
writes are idempotent by project ID).

---

### Step 4 — Extract citation data from Firestore (~5 minutes)

Pulls every BRD sentence and checks whether it has a citation in the
`citations` map.

```bash
python3 scripts/experiment3/4_extract_citations.py
```

Output: `data/experiment3/citation_data.csv`  
Prints a summary of coverage % overall, by source type, and by section.

---

### Step 5 — Sample 50 citations for manual verification (~5 minutes)

Stratified sample: 25 from email BRDs, 25 from transcript BRDs.
Fetches the actual source snippet text so annotators can judge support.

```bash
python3 scripts/experiment3/5_sample_citations.py
```

Output: `data/experiment3/citation_verification_sheet.csv`

**Manual annotation required:**  
Open the CSV in Excel or Google Sheets. For each row, two annotators
independently fill in:

| Column | Values |
|--------|--------|
| `annotator1_verdict` | `SUPPORTS` / `PARTIALLY` / `DOES_NOT_SUPPORT` |
| `annotator2_verdict` | `SUPPORTS` / `PARTIALLY` / `DOES_NOT_SUPPORT` |
| `annotator1_notes` | optional free text |
| `annotator2_notes` | optional free text |

**Verdict definitions:**
- `SUPPORTS` — the source snippet clearly supports the BRD sentence
- `PARTIALLY` — the snippet is related but only partially supports it
- `DOES_NOT_SUPPORT` — the snippet does not support the BRD sentence

Save the filled file as `data/experiment3/citation_verification_sheet.csv`
(overwrite in place).

---

### Step 6 — Analyse results (~30 seconds)

```bash
python3 scripts/experiment3/6_analyze.py
```

Output: `data/experiment3/exp3_report.txt`  
Prints and saves:
- Traceability coverage % (overall, by source type, by section)
- Hallucination proxy (uncited sentence count and breakdown)
- Inter-annotator κ
- Citation accuracy (SUPPORTS / PARTIALLY / DOES_NOT_SUPPORT rates)
- Effective accuracy (SUPPORTS + PARTIALLY combined)

You can run Step 6 before annotation is complete — it will skip the
citation accuracy section and note that the verification sheet is missing.

---

## Output files

| File | Description |
|------|-------------|
| `data/experiment3/ami_transcripts.json` | Parsed AMI utterances |
| `data/experiment3/enron_threads.json` | Selected Enron threads |
| `data/experiment3/exp3_brd_ids.json` | Project + BRD ID manifest |
| `data/experiment3/citation_data.csv` | All BRD sentences with citation flags |
| `data/experiment3/citation_verification_sheet.csv` | 50-row annotation sheet |
| `data/experiment3/exp3_report.txt` | Final results report |

---

## Firestore cleanup (after experiment)

The experiment creates 20 project documents and their associated snippets
and BRD versions. To clean up:

```bash
# List all exp3 projects
firebase firestore:delete --project documind-6c687 \
  --recursive /projects/exp3-email-enron_0
# ... repeat for each project ID in exp3_brd_ids.json
```

Or filter by `experiment == "exp3"` in the Firestore console and delete
in bulk.
