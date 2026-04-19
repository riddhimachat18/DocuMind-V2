"""
1b_relabel_missing.py — Generate only the missing labeled files.

Generates:
    data/pure_four_class_test.json   (from PURE_test.csv)
    data/pure_four_class_valid.json  (from PURE_valid.csv)
    data/rfi_four_class.json         (from Final_dataset_RFIs.csv)

Skips train — you already have data/pure_four_class_train.json.
Fully resumable if interrupted.

Usage:
    cd DocuMind
    export GEMINI_API_KEY="your-key"
    python3 scripts/classification/1b_relabel_missing.py
"""

import warnings
warnings.filterwarnings("ignore")

import json
import os
import sys
import time
from collections import Counter

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    SENTENCE_COL, LABEL_COL,
    RFI_CSV, RFI_SENTENCE_COL,
    CLASSES,
    PURE_TEST_CSV, PURE_VALID_CSV,
    FOUR_CLASS_TEST_JSON, FOUR_CLASS_VALID_JSON, RFI_FOUR_CLASS_JSON,
    GEMINI_MODEL, GEMINI_API_KEY,
    DATA_DIR,
)

os.makedirs(DATA_DIR, exist_ok=True)

if not GEMINI_API_KEY:
    print("ERROR: export GEMINI_API_KEY='your-key'")
    sys.exit(1)

# ── Gemini — supports both old and new SDK ────────────────────────────────────
try:
    from google import genai as new_genai
    _client = new_genai.Client(api_key=GEMINI_API_KEY)

    def call_gemini(prompt: str) -> str:
        resp = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        return resp.text or ""

    print("Using google.genai (new SDK)")

except ImportError:
    import google.generativeai as old_genai
    old_genai.configure(api_key=GEMINI_API_KEY)
    _model = old_genai.GenerativeModel(GEMINI_MODEL)

    def call_gemini(prompt: str) -> str:
        resp = _model.generate_content(prompt)
        return resp.text or ""

    print("Using google.generativeai (old SDK)")


# ── Prompt ────────────────────────────────────────────────────────────────────
PROMPT = """Classify the following sentence into exactly one of these four classes:
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
    prompt = PROMPT.format(sentence=sentence.strip()[:500])
    for attempt in range(3):
        try:
            raw = call_gemini(prompt).strip().upper()
            # Take first word, match to class
            token = raw.split()[0] if raw.split() else ""
            for cls in CLASSES:
                if token.startswith(cls[:4]):
                    return cls
            return "NOISE"
        except Exception as e:
            wait = 2 ** attempt
            print(f"  Gemini error (attempt {attempt+1}/3): {e} — retry in {wait}s")
            time.sleep(wait)
    return "NOISE"


# ── IO helpers ────────────────────────────────────────────────────────────────

def load_json(path: str) -> list[dict]:
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(data: list[dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_pure(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, index_col=0)
    df.columns = df.columns.str.strip()
    df[SENTENCE_COL] = df[SENTENCE_COL].astype(str).str.strip()
    df[LABEL_COL]    = df[LABEL_COL].astype(str).str.strip()
    return df


def load_rfi(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df.columns = df.columns.str.strip()
    df[RFI_SENTENCE_COL] = df[RFI_SENTENCE_COL].astype(str).str.strip()
    # Label is at column position 2 (duplicate column name)
    df["_label"] = df.iloc[:, 2].astype(str).str.strip()
    return df


def process(sentences: list[str], original_labels: list[str],
            output_path: str, tag: str) -> list[dict]:
    """Classify sentences, resume from existing output."""
    existing  = load_json(output_path)
    done_set  = {r["sentence"] for r in existing}
    results   = existing.copy()
    remaining = [(s, l) for s, l in zip(sentences, original_labels)
                 if s.strip() and s not in done_set]

    print(f"\n{tag}: {len(sentences)} total, "
          f"{len(existing)} done, {len(remaining)} remaining")

    for i, (sentence, orig_label) in enumerate(remaining):
        label = classify(sentence)
        results.append({
            "sentence":         sentence,
            "original_label":   orig_label,
            "four_class_label": label,
        })

        if (i + 1) % 25 == 0:
            save_json(results, output_path)
            print(f"  [{len(existing) + i + 1}/{len(existing) + len(remaining)}] saved")

    save_json(results, output_path)
    dist = Counter(r["four_class_label"] for r in results)
    print(f"  Done. Distribution: {dict(dist)}")
    print(f"  Saved → {output_path}")
    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("="*60)
    print("Generating missing labeled files")
    print("="*60)

    # ── PURE_test — stratified sample of 300 ─────────────────────────────────
    df_test = load_pure(PURE_TEST_CSV)
    print(f"\nPURE_test: {len(df_test)} total rows — sampling 300 (stratified)")

    req_test     = df_test[df_test[LABEL_COL] == "Req"].sample(
        n=min(200, len(df_test[df_test[LABEL_COL] == "Req"])), random_state=42
    )
    non_req_test = df_test[df_test[LABEL_COL] != "Req"].sample(
        n=min(100, len(df_test[df_test[LABEL_COL] != "Req"])), random_state=42
    )
    test_sample  = pd.concat([req_test, non_req_test]).sample(frac=1, random_state=42)
    print(f"  Sampled: {len(req_test)} Req + {len(non_req_test)} Not Req = {len(test_sample)} total")

    process(
        test_sample[SENTENCE_COL].tolist(),
        test_sample[LABEL_COL].tolist(),
        FOUR_CLASS_TEST_JSON,
        "PURE_test",
    )

    # ── PURE_valid — stratified sample of 150 ────────────────────────────────
    df_valid = load_pure(PURE_VALID_CSV)
    print(f"\nPURE_valid: {len(df_valid)} total rows — sampling 150 (stratified)")

    req_valid     = df_valid[df_valid[LABEL_COL] == "Req"].sample(
        n=min(100, len(df_valid[df_valid[LABEL_COL] == "Req"])), random_state=42
    )
    non_req_valid = df_valid[df_valid[LABEL_COL] != "Req"].sample(
        n=min(50, len(df_valid[df_valid[LABEL_COL] != "Req"])), random_state=42
    )
    valid_sample  = pd.concat([req_valid, non_req_valid]).sample(frac=1, random_state=42)
    print(f"  Sampled: {len(req_valid)} Req + {len(non_req_valid)} Not Req = {len(valid_sample)} total")

    process(
        valid_sample[SENTENCE_COL].tolist(),
        valid_sample[LABEL_COL].tolist(),
        FOUR_CLASS_VALID_JSON,
        "PURE_valid",
    )

    # ── RFI — full dataset (~380 sentences, small enough to do entirely) ──────
    df_rfi = load_rfi(RFI_CSV)
    process(
        df_rfi[RFI_SENTENCE_COL].tolist(),
        df_rfi["_label"].tolist(),
        RFI_FOUR_CLASS_JSON,
        "RFI",
    )

    print("\n" + "="*60)
    print("All files generated:")
    print("  PURE_test  → 300 sentences (200 Req + 100 Not Req)")
    print("  PURE_valid → 150 sentences (100 Req + 50 Not Req)")
    print("  RFI        → full dataset (~380 sentences)")
    print("\nNext steps:")
    print("  python3 scripts/classification/3_finetune_distilbert.py")
    print("  python3 scripts/classification/4_evaluate.py")
    print("  python3 scripts/classification/5_cross_domain.py")


if __name__ == "__main__":
    main()