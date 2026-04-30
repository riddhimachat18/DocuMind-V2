"""
1_relabel.py — Relabel PURE and RFI datasets to four-class taxonomy
using Gemini few-shot prompting.

Processes:
    PURE_train  → stratified 500-sample → pure_four_class_train.json
    PURE_test   → full dataset           → pure_four_class_test.json
    PURE_valid  → full dataset           → pure_four_class_valid.json
    RFI         → full dataset           → rfi_four_class.json

Also exports validation_sample.json (50 random train samples)
for human kappa annotation.

Resumes automatically if interrupted — existing output is never re-processed.

Usage:
    cd DocuMind-main
    export GEMINI_API_KEY="your-key"
    python scripts/classification/1_relabel.py
"""

import json
import os
import random
import sys
import time
from collections import Counter

import pandas as pd
import google.generativeai as genai

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    SENTENCE_COL, LABEL_COL, REQ_VALUE,
    RFI_CSV, RFI_SENTENCE_COL, RFI_REQ_VALUES,
    CLASSES,
    PURE_TRAIN_CSV, PURE_TEST_CSV, PURE_VALID_CSV,
    FOUR_CLASS_TRAIN_JSON, FOUR_CLASS_TEST_JSON,
    FOUR_CLASS_VALID_JSON, RFI_FOUR_CLASS_JSON,
    VALIDATION_SAMPLE_JSON,
    SAMPLE_REQUIREMENTS, SAMPLE_NON_REQUIREMENTS, VALIDATION_SAMPLE_SIZE,
    GEMINI_MODEL, GEMINI_API_KEY,
    RESULTS_DIR,
)

os.makedirs(RESULTS_DIR, exist_ok=True)

# ── Gemini setup ──────────────────────────────────────────────────────────────
if not GEMINI_API_KEY:
    print("ERROR: set GEMINI_API_KEY environment variable")
    sys.exit(1)

genai.configure(api_key=GEMINI_API_KEY)
gemini = genai.GenerativeModel(GEMINI_MODEL)

# ── Four-class few-shot prompt ────────────────────────────────────────────────
# Canonical prompt from 4_evaluate.py — the one that produced 0.824 macro-F1.
PROMPT_TEMPLATE = """Classify the following sentence into exactly one of these four classes:
REQUIREMENT, DECISION, CONSTRAINT, NOISE.
Definitions and examples:
REQUIREMENT — A functional or non-functional capability the system must provide.
Usually contains modal verbs: shall, must, will, should, needs to.
Examples:
  - "The system shall allow users to reset their password via email."
  - "The application must support offline mode for mobile users."
  - "Response time shall not exceed 200ms under normal load."
DECISION — A design or architectural choice already made. Past tense or
definitive statements about technology, approach, or design selected.
Examples:
  - "The team decided to use PostgreSQL as the primary database."
  - "OAuth 2.0 has been selected for authentication."
  - "The architecture will follow a microservices pattern."
  - "Access to the database will be via the training application rather than the production application."
  - "The system will use a three-tier architecture."
  - "It was agreed that React will be used for the frontend."
CONSTRAINT — A limitation, boundary, or restriction imposed from outside
the system — budget, regulatory, time, platform, or organisational.
Examples:
  - "The system must comply with GDPR data protection regulations."
  - "The project budget is capped at $200,000."
  - "The solution must be deployable on Google Cloud Platform only."
  - "Development must be completed by Q3 2024."
  - "Access to the DBMS may only be via the training application, not the production system."
  - "The system is limited to operating within the existing network infrastructure."
  - "Only approved third-party libraries may be used."
NOISE — Everything else: greetings, meeting logistics, filler text,
section headers, metadata, opinions without requirement content.
Examples:
  - "Please find the agenda attached."
  - "This document was last updated on March 2023."
  - "The following section describes the system overview."
  - "Thank you for your participation."
Rules:
- If a sentence has both requirement and constraint content, choose REQUIREMENT.
- If uncertain between DECISION and REQUIREMENT, look for past tense or "will be/has been selected/decided/agreed" → DECISION.
- If the sentence describes an external limitation or boundary NOT under the system's control → CONSTRAINT.
- If the sentence uses "shall/must/should" for a system capability → REQUIREMENT.
- Non-requirements from the original dataset can be CONSTRAINT, DECISION, or NOISE.
- Return ONLY the label word. No explanation. No punctuation.

Sentence: "{sentence}"

Label:"""


def classify(sentence: str) -> str:
    """Call Gemini to classify one sentence. Returns one of CLASSES."""
    prompt = PROMPT_TEMPLATE.format(sentence=sentence.strip()[:500])
    for attempt in range(3):
        try:
            response = gemini.generate_content(prompt)
            raw = response.text.strip().upper().split()[0] if response.text.strip() else ""
            # Normalise — model sometimes returns partial matches
            for cls in CLASSES:
                if raw.startswith(cls[:4]):
                    return cls
            return "NOISE"
        except Exception as e:
            wait = 2 ** attempt
            print(f"    Gemini error (attempt {attempt+1}/3): {e} — retrying in {wait}s")
            time.sleep(wait)
    return "NOISE"


def load_json(path: str) -> list[dict]:
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return []


def save_json(data: list[dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def relabel(
    sentences: list[str],
    original_labels: list[str],
    output_path: str,
    tag: str,
) -> list[dict]:
    """
    Classify a list of sentences and save results.
    Resumes from existing output file.
    """
    existing = load_json(output_path)
    done_set = {r["sentence"] for r in existing}
    results  = existing.copy()

    remaining_idx = [i for i, s in enumerate(sentences) if s not in done_set]
    total = len(sentences)

    print(f"\n  {tag}: {total} total, {len(existing)} done, {len(remaining_idx)} remaining")

    for count, i in enumerate(remaining_idx):
        sentence = sentences[i]
        label    = classify(sentence)
        results.append({
            "sentence":       sentence,
            "original_label": original_labels[i],
            "gemini_label":   label,
        })

        if (count + 1) % 25 == 0:
            save_json(results, output_path)
            print(f"    [{len(existing) + count + 1}/{total}] checkpoint saved")

    save_json(results, output_path)
    dist = Counter(r["gemini_label"] for r in results)
    print(f"  Distribution: {dict(dist)}")
    return results


# ── Loaders ───────────────────────────────────────────────────────────────────

def load_pure(csv_path: str) -> pd.DataFrame:
    """Load PURE CSV. First column is unnamed index."""
    df = pd.read_csv(csv_path, index_col=0)
    # Strip whitespace from column names and values
    df.columns = df.columns.str.strip()
    df[SENTENCE_COL] = df[SENTENCE_COL].astype(str).str.strip()
    df[LABEL_COL]    = df[LABEL_COL].astype(str).str.strip()
    return df


def load_rfi(csv_path: str) -> pd.DataFrame:
    """
    Load RFI CSV. Has duplicate column name 'Req/Not Req'.
    Values are '1'/'0' or 'yes'/'no'.
    """
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    df[RFI_SENTENCE_COL] = df[RFI_SENTENCE_COL].astype(str).str.strip()
    # Use the column at position 2 for the label (first 'Req/Not Req')
    label_col_name = df.columns[2]
    df["_label"] = df[label_col_name].astype(str).str.strip()
    return df


# ── Keyword scoring for non-req oversampling ──────────────────────────────────

DECISION_KEYWORDS    = ["decided", "selected", "will use", "has been", "chosen",
                        "agreed", "architecture", "framework", "platform",
                        "technology", "approach", "using", "adopting"]
CONSTRAINT_KEYWORDS  = ["only", "must not", "limited to", "comply", "compliance",
                        "regulation", "budget", "deadline", "not allowed",
                        "restricted", "restriction", "prohibited", "gdpr",
                        "iso", "standard", "policy", "policies", "legal",
                        "within", "cannot exceed", "no more than"]


def keyword_score(sentence: str) -> tuple[int, int]:
    """Returns (decision_score, constraint_score) for a sentence."""
    s = sentence.lower()
    d = sum(1 for kw in DECISION_KEYWORDS if kw in s)
    c = sum(1 for kw in CONSTRAINT_KEYWORDS if kw in s)
    return d, c


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    random.seed(42)

    # ── PURE_train: stratified 500-sample ─────────────────────────────────────
    print("\n" + "="*60)
    print("1a. Sampling from PURE_train")
    df_train = load_pure(PURE_TRAIN_CSV)
    print(f"  Total rows: {len(df_train)}")
    print(f"  Label dist: {df_train[LABEL_COL].value_counts().to_dict()}")

    req_rows     = df_train[df_train[LABEL_COL] == REQ_VALUE]
    non_req_rows = df_train[df_train[LABEL_COL] != REQ_VALUE]

    # Sample requirements
    req_sample = req_rows.sample(
        n=min(SAMPLE_REQUIREMENTS, len(req_rows)), random_state=42
    )

    # Keyword-guided non-req oversampling
    non_req_scored = non_req_rows.copy()
    non_req_scored["_d"], non_req_scored["_c"] = zip(
        *non_req_scored[SENTENCE_COL].map(keyword_score)
    )

    likely_decision   = non_req_scored[non_req_scored["_d"] > 0].sample(
        n=min(60, len(non_req_scored[non_req_scored["_d"] > 0])), random_state=42
    )
    likely_constraint = non_req_scored[non_req_scored["_c"] > 0].sample(
        n=min(60, len(non_req_scored[non_req_scored["_c"] > 0])), random_state=42
    )
    already_selected  = set(likely_decision.index) | set(likely_constraint.index)
    remaining_non_req = non_req_scored[~non_req_scored.index.isin(already_selected)]
    n_remaining       = SAMPLE_NON_REQUIREMENTS - len(likely_decision) - len(likely_constraint)
    plain_non_req     = remaining_non_req.sample(
        n=min(max(n_remaining, 0), len(remaining_non_req)), random_state=42
    )

    train_sample = pd.concat([req_sample, likely_decision, likely_constraint, plain_non_req])
    train_sample = train_sample.sample(frac=1, random_state=42)  # shuffle

    print(f"  Sample: {len(req_sample)} req + {len(likely_decision)} likely-decision "
          f"+ {len(likely_constraint)} likely-constraint + {len(plain_non_req)} other "
          f"= {len(train_sample)} total")

    sentences_train = train_sample[SENTENCE_COL].tolist()
    labels_train    = train_sample[LABEL_COL].tolist()

    train_results = relabel(sentences_train, labels_train, FOUR_CLASS_TRAIN_JSON, "PURE_train sample")

    # Export validation sample for human kappa annotation
    val_sample = random.sample(train_results, min(VALIDATION_SAMPLE_SIZE, len(train_results)))
    # Add human_label field as empty string for annotator to fill in
    for item in val_sample:
        item.setdefault("human_label", "")
    save_json(val_sample, VALIDATION_SAMPLE_JSON)
    print(f"\n  Validation sample saved → {VALIDATION_SAMPLE_JSON}")
    print(f"  ACTION: Open this file and fill in 'human_label' for each entry,")
    print(f"  then run 2_kappa.py")

    # ── PURE_test: full dataset ───────────────────────────────────────────────
    print("\n" + "="*60)
    print("1b. Processing PURE_test (full)")
    df_test = load_pure(PURE_TEST_CSV)
    relabel(
        df_test[SENTENCE_COL].tolist(),
        df_test[LABEL_COL].tolist(),
        FOUR_CLASS_TEST_JSON,
        "PURE_test",
    )

    # ── PURE_valid: full dataset ──────────────────────────────────────────────
    print("\n" + "="*60)
    print("1c. Processing PURE_valid (full)")
    df_valid = load_pure(PURE_VALID_CSV)
    relabel(
        df_valid[SENTENCE_COL].tolist(),
        df_valid[LABEL_COL].tolist(),
        FOUR_CLASS_VALID_JSON,
        "PURE_valid",
    )

    # ── RFI dataset: full ─────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("1d. Processing RFI dataset (full)")
    df_rfi = load_rfi(RFI_CSV)
    rfi_sentences = df_rfi[RFI_SENTENCE_COL].tolist()
    rfi_labels    = df_rfi["_label"].tolist()
    relabel(rfi_sentences, rfi_labels, RFI_FOUR_CLASS_JSON, "RFI")

    print("\n" + "="*60)
    print("Step 1 complete.")
    print(f"  Train labels → {FOUR_CLASS_TRAIN_JSON}")
    print(f"  Test labels  → {FOUR_CLASS_TEST_JSON}")
    print(f"  Valid labels → {FOUR_CLASS_VALID_JSON}")
    print(f"  RFI labels   → {RFI_FOUR_CLASS_JSON}")
    print(f"  For kappa    → {VALIDATION_SAMPLE_JSON}  ← fill human_label field")


if __name__ == "__main__":
    main()
